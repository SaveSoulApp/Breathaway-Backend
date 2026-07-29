---
sidebar_position: 6
---

# Credits Module

The `CreditsModule` maintains the transactional credit engine for BreathAway, enforcing double-entry ledger bookkeeping for all user balances. Every credit movement — granted, spent, or expired — is an immutable row in the `CreditLedger` table. Balances are never stored; they are always derived from the ledger in real-time.

---

## 📋 Purpose & Responsibilities

- **Balance Tracking**: Computes balances in real-time via an in-memory FIFO pass over the ledger — no cached balance column that can drift.
- **Double-Entry Auditing**: Every credit flow is logged with a `transactionType` (CREDIT/DEBIT) and a `source` label. Nothing is ever deleted or updated.
- **Expiration Logic**: Supports credit bundles with individual `expiresAt` timestamps. Unused portions of expired bundles are materialised as `EXPIRED` DEBIT rows by a background cron for audit completeness, but the real-time balance is **never dependent on the cron having run**.

---

## ⚙️ Managed Enums

### CreditTransactionType

| Value | Meaning |
|:---|:---|
| `CREDIT` | Adds credits (purchase, bonus, referral). Amount is always positive. |
| `DEBIT` | Deducts credits (usage, admin adjustment, or expired remainder). Amount is always positive — sign is implied by the type. |

### CreditSource

| Source | Type | Description |
|:---|:---|:---|
| `PURCHASE` | CREDIT | User bought a credits bundle |
| `SUBSCRIPTION` | CREDIT | Credits auto-granted on subscription renewal |
| `BONUS` | CREDIT | Promotional credits (typically has `expiresAt`) |
| `REFERRAL` | CREDIT | Credits earned by referring a new user |
| `ADMIN` | CREDIT / DEBIT | Manual platform-administrator adjustment |
| `LIKE_USAGE` | DEBIT | Credits spent to send a like or super-like |
| `EXPIRED` | DEBIT | Cron-inserted row that closes the books on an expired bundle's unused remainder |

> [!NOTE]
> The `EXPIRED` source is **not a spend**. It is a bookkeeping row that the background cron inserts so that the ledger audit trail is complete. `getBalance` explicitly excludes these rows from its debit sum to prevent double-counting.

---

## 🗄 Transaction Ledger Schema

\`\`\`
CreditLedger
├── id              (ULID, primary key)
├── userId          (String, FK → User)
├── transactionType (CREDIT | DEBIT)
├── amount          (Int, always positive; sign resolved by transactionType)
├── source          (CreditSource enum)
├── referenceId     (String?, purchase invoice, like ID, or the originating CREDIT id for EXPIRED rows)
├── expiresAt       (DateTime?, only set on CREDIT rows with a time-bound bundle)
└── createdAt       (DateTime)
\`\`\`

---

## 💰 Balance Calculation: Real-Time FIFO

### The Algorithm

`getBalance` fetches every ledger row for the user and runs a **first-to-expire FIFO pass** entirely in memory:

\`\`\`
Step 1: remainingDebits = Σ(DEBIT where source ≠ EXPIRED)
         ↑ Real spends only. EXPIRED rows are excluded — they close the
           books on lapsed bundles, not genuine credit consumption.

Step 2: Sort CREDIT bundles by earliest expiresAt first, null last.
         Tie-break: earlier createdAt wins.

Step 3: For each bundle (in sorted order):
           usedFromBundle  = min(remainingDebits, bundle.amount)
           remainingDebits -= usedFromBundle
           unusedAmount    = bundle.amount - usedFromBundle

           if bundle.expiresAt IS NULL OR bundle.expiresAt > now:
               balance += unusedAmount    ← only active remainder counts

Step 4: Return balance (always ≥ 0)
\`\`\`

> [!IMPORTANT]
> This formula is **fully cron-independent**. The balance is identical whether or not the background expiry cron has run. The cron's `EXPIRED` DEBIT rows exist only to materialise the audit trail — they play no role in `getBalance`, `hasSufficientCredits`, or `consumeCredits`.

---

### Why FIFO? The Bundle-Blindness Problem

#### ❌ Naive aggregate (original bug)

\`\`\`
balance = Σ(all CREDITs) − Σ(all DEBITs)
\`\`\`

This allowed users to spend credits past their `expiresAt` timestamp until the background cron inserted compensating `EXPIRED` DEBIT rows — a window of potentially hours.

#### ❌ Filtered aggregate (intermediate attempt — still wrong)

\`\`\`
balance = Σ(CREDIT where expiresAt > now) − Σ(DEBIT where source ≠ EXPIRED)
\`\`\`

This closed the post-expiry spend window, but introduced **bundle-blindness**: it subtracts *all* LIKE_USAGE debits from whatever active credits are left — without knowing *which bundle* each debit was actually charged against.

**Concrete failure case:**

| Date | Event | Ledger row |
|:---|:---|:---|
| Jul 20 | +5 credits | CREDIT, 5, expiresAt Jul 29 23:59 IST |
| Jul 22 | +5 credits | CREDIT, 5, expiresAt Jul 31 23:59 IST |
| Jul 23 | Spent 1 like | DEBIT, 1, LIKE_USAGE |
| Jul 30 | Query balance | — |

On Jul 30, the Jul 29 bundle has expired. The 1 credit was spent on Jul 23 while the Jul 29 bundle was still active. FIFO allocates that spend to the earliest-expiring bundle first. The Jul 29 bundle absorbed the 1 debit, so the Jul 31 bundle is **completely untouched**.

| Formula | Computation | Result |
|:---|:---|:---|
| Filtered aggregate (wrong) | +5 (Jul 31 only) − 1 (LIKE_USAGE) | **4** ❌ |
| FIFO (correct) | Jul 29 bundle absorbs 1 → expired → +0. Jul 31 bundle: 0 debits → +5 | **5** ✅ |

#### ✅ FIFO in-memory pass (current implementation)

The FIFO algorithm traces exactly where each debit came from. A spend that occurred against a bundle that later expired is effectively "settled" within that bundle's lifecycle and no longer counts against remaining active bundles.

---

### Correctness Proof Table

Using the Jul 20 / Jul 22 scenario above, all four states produce the same result:

| When queried | Cron status | FIFO result | Balance |
|:---|:---|:---|:---|
| Jul 27 (both bundles active) | Any | Jul 29: absorbs 1 → 4 unused, active → +4. Jul 31: 0 debits → +5 | **9** ✅ |
| Jul 30 (Jul 29 expired) | Cron NOT yet run | Jul 29: absorbs 1 → 4 unused, **expired** → +0. Jul 31: +5 | **5** ✅ |
| Jul 30 (Jul 29 expired) | Cron HAS run (EXPIRED −4 inserted) | EXPIRED DEBIT excluded from remainingDebits → same FIFO pass | **5** ✅ |
| All credits expired, no debits | Any | All bundles past expiresAt → 0 contribution each | **0** ✅ |

---

## ⏳ Credit Expiration: The Full Picture

### What the Cron Actually Does

The background expiry cron does **not** control whether credits can be spent. Its responsibilities are:

1. Writing `EXPIRED` DEBIT rows so `creditStatus=EXPIRED` filter queries in `getLedger` are fast without a full FIFO scan.
2. Creating an explicit audit trail entry linking back to the originating CREDIT row via `referenceId`.
3. Materialising the "closed" state of a bundle so support teams can read the ledger naturally.

The cron uses the same FIFO strategy — earliest-expiry first — to compute `unusedAmount` per bundle. When `unusedAmount > 0` and `bundle.expiresAt ≤ asOf`, it inserts one `EXPIRED` DEBIT row for that bundle.

### Cron Idempotency

The cron includes existing `EXPIRED` DEBIT rows in its own `totalDebits` sum. This makes it **safe to re-run** — a second pass over the same `asOf` produces no new rows.

**How it works:** Suppose `EXPIRED −4` already exists from a prior run (for a 5-credit bundle where 1 was spent via `LIKE_USAGE`). On the second run:

\`\`\`
totalDebits (cron) = 1 (LIKE_USAGE) + 4 (EXPIRED) = 5
FIFO: bundle absorbs 5 → unusedAmount = 5 - 5 = 0
Since unusedAmount = 0, no new EXPIRED row is inserted. ✅
\`\`\`

> [!NOTE]
> This is the one place where `EXPIRED` rows *are* counted in debits. The cron intentionally includes them; `getBalance` intentionally excludes them. They serve different purposes.

### The Fan-Out Pipeline

Because processing every user synchronously would block the API and timeout on large datasets, expiry is delegated through Google Cloud Pub/Sub:

\`\`\`
Cloud Scheduler (daily)
  → POST /internal/jobs/expire-bundles
    → expireCreditBundles() pages users with expired CREDIT rows
      → For each page: publishes CREDIT_EXPIRY_BATCH to GCP topic "credit-expiry"
        → Push subscription delivers to POST /v1/pubsub/ingest
          → PubSubIngestionController routes by eventType attribute
            → handleExpiryBatch() → expireCreditsForUsers() writes EXPIRED rows
\`\`\`

> [!WARNING]
> If the Pub/Sub push subscription is not configured or points to a stale Cloud Run URL, the fan-out logs `Credit expiry fan-out completed` and publishes successfully — but `handleExpiryBatch` is never called and no EXPIRED rows appear. Verify the subscription push endpoint: `https://<service>.run.app/v1/pubsub/ingest`.

---

## 📖 Example-Driven Scenarios

Each scenario traces both the **real-time balance** (what `getBalance` returns at each moment) and the **cron output** (what EXPIRED rows get written). The two are independent but always consistent.

---

### Scenario 1: Single Bundle, Partial Spend

**Setup:**
- Nov 1: +10 CREDIT (PURCHASE), expires Jan 1
- Dec 25: −5 DEBIT (LIKE_USAGE)

| When | getBalance FIFO | Balance | Cron (if run on this date) |
|:---|:---|:---|:---|
| Nov 1 | Jan 1 bundle: 0 debits → +10 | **10** | — |
| Dec 25 | Jan 1 bundle: absorbs 5 → 5 unused, active → +5 | **5** | — |
| Jan 1 23:59 | Jan 1 bundle: absorbs 5 → 5 unused, **expired** → +0 | **0** | Inserts `EXPIRED −5`, ref = Nov 1 CREDIT |
| Jan 2 | Same as Jan 1 (no new events) | **0** | — |

---

### Scenario 2: Two Bundles — Spend Absorbed by Earlier Bundle, Later Bundle Untouched

This is the canonical scenario that motivated the FIFO rewrite.

**Setup:**
- Nov 1: +10 CREDIT, expires Jan 1
- Dec 1: +10 CREDIT, expires Feb 1
- Dec 25: −5 DEBIT (LIKE_USAGE)

| When | getBalance FIFO | Balance | Cron (if run on this date) |
|:---|:---|:---|:---|
| Dec 25 | Jan 1: absorbs 5 → 5 unused, active → +5. Feb 1: 0 debits → +10 | **15** | — |
| Jan 1 23:59 | Jan 1: absorbs 5 → 5 unused, **expired** → +0. Feb 1: +10 | **10** | Inserts `EXPIRED −5`, ref = Nov 1 CREDIT |
| Jan 2 (pre-cron) | Same FIFO pass — already correct without EXPIRED row | **10** | — |
| Feb 1 23:59 | Jan 1: expired → 0. Feb 1: 0 debits → 10 unused, **expired** → +0 | **0** | Inserts `EXPIRED −10`, ref = Dec 1 CREDIT |

> [!TIP]
> On Jan 2 before the cron runs, `getBalance` already returns **10**. The FIFO pass sees the Jan 1 bundle as expired and excludes its unused remainder, regardless of whether the `EXPIRED` row exists yet.

---

### Scenario 3: High Usage — Debits Cascade Across Multiple Bundles

**Setup:**
- Nov 1: +10 CREDIT, expires Jan 1
- Dec 1: +10 CREDIT, expires Feb 1
- Dec 25: −15 DEBIT (LIKE_USAGE)

| When | getBalance FIFO | Balance | Cron (if run on this date) |
|:---|:---|:---|:---|
| Dec 25 | Jan 1: absorbs 10 → 0 unused, active → +0. Feb 1: absorbs 5 → 5 unused, active → +5 | **5** | — |
| Jan 1 23:59 | Jan 1: absorbs 10 → **unusedAmount = 0** → expired, nothing to write. Feb 1: absorbs 5 → 5 unused, active → +5 | **5** | **No EXPIRED row** for Jan 1 (fully consumed) |
| Feb 1 23:59 | Feb 1: absorbs 5 → 5 unused, **expired** → +0 | **0** | Inserts `EXPIRED −5`, ref = Dec 1 CREDIT |

---

### Scenario 4: Expiry-Order Priority — Sorted by expiresAt, Not createdAt

> [!TIP]
> Without sorting by `expiresAt`, the Admin bundle (created first, expires later) would absorb debits first, causing the Purchase bundle to expire with its full 10 credits unused. Sorting by soonest-expiry protects the bundle most at risk.

**Setup:**
- Nov 1: +10 CREDIT (ADMIN), expires Feb 1 ← created first, expires *later*
- Dec 1: +10 CREDIT (PURCHASE), expires Jan 1 ← created second, expires *sooner*
- Dec 25: −5 DEBIT (LIKE_USAGE)

| When | getBalance FIFO | Balance | Cron (if run on this date) |
|:---|:---|:---|:---|
| Dec 25 | **Sorted by expiresAt**: Jan 1 (PURCHASE) first. Jan 1: absorbs 5 → 5 unused, active → +5. Feb 1 (ADMIN): 0 → +10 | **15** | — |
| Jan 1 23:59 | Jan 1: absorbs 5 → 5 unused, **expired** → +0. Feb 1: +10 | **10** | Inserts `EXPIRED −5`, ref = Dec 1 PURCHASE |
| Feb 1 23:59 | Feb 1: 0 debits → 10 unused, **expired** → +0 | **0** | Inserts `EXPIRED −10`, ref = Nov 1 ADMIN |

---

### Scenario 5: Non-Expiring Credits Are Protected

**Setup:**
- Nov 1: +10 CREDIT (REFERRAL), **no expiry**
- Dec 1: +10 CREDIT (PURCHASE), expires Jan 1
- Dec 25: −12 DEBIT (LIKE_USAGE)

| When | getBalance FIFO | Balance | Cron (if run on this date) |
|:---|:---|:---|:---|
| Dec 25 | **Sorted**: Jan 1 (expiry) first, REFERRAL (null) last. Jan 1: absorbs 10 → 0, active → +0. REFERRAL: absorbs 2 → 8 unused, no expiry → +8 | **8** | — |
| Jan 1 23:59 | Jan 1: absorbs 10 → **unusedAmount = 0** → no EXPIRED row. REFERRAL: absorbs 2 → 8 unused, no expiry → +8 | **8** | **No EXPIRED row** (Jan 1 bundle fully consumed) |

---

### Production Verification (2026-07-29)

Real ledger trace from the production database, verified after the first full end-to-end cron run.

**User:** `01KVYHB7XW00RP5S653PKMPEA3`

**Ledger before cron (18:08Z):**

| id | amount | source | expiresAt (UTC) | type |
|:---|:---|:---|:---|:---|
| `01KWA3T18S` | 5 | ADMIN (testing-2) | **Jul 27 00:00:00Z** | CREDIT |
| `01KWGS8GC7` | 1 | LIKE_USAGE | — | DEBIT |
| `01KYJC8NXH` | 5 | ADMIN (testing-expiry-1) | **Jul 29 00:00:00Z** | CREDIT |
| `01KYK974T6` | 5 | ADMIN (testing-expiry-2) | Jul 31 00:00:00Z | CREDIT |
| `01KYMPFY5T` | 7 | ADMIN (testing-expiry-3) | Jul 30 18:29:59.999Z | CREDIT |

**FIFO balance at 18:08Z:** `remainingDebits = 1`

| Bundle | expiresAt | absorbs | unusedAmount | expired? | contribution |
|:---|:---|:---|:---|:---|:---|
| testing-2 | Jul 27 00:00Z | 1 | 4 | ✅ Yes | **0** |
| testing-expiry-1 | Jul 29 00:00Z | 0 | 5 | ✅ Yes (midnight, 18h ago) | **0** |
| testing-expiry-3 | Jul 30 18:29Z | 0 | 7 | ❌ No | **+7** |
| testing-expiry-2 | Jul 31 00:00Z | 0 | 5 | ❌ No | **+5** |

**→ Real-time balance: 12** (correct, without any cron run)

**Cron ran at 18:19:34Z → push delivery at 18:34:09Z → EXPIRED rows written:**

| id | amount | source | referenceId | Explanation |
|:---|:---|:---|:---|:---|
| `01KYQJFQT6` | **4** | EXPIRED | `01KWA3T18S` | testing-2: 5 − 1 absorbed = 4 unused |
| `01KYQJFQT7` | **5** | EXPIRED | `01KYJC8NXH` | testing-expiry-1: 5 − 0 remaining = 5 unused |

**Balance after cron: still 12.** EXPIRED rows excluded from `remainingDebits` → FIFO pass identical.

---

## 🌍 Timezone Handling

Credit expiration boundaries align with the user's local timezone. The API converts date-only strings to **end-of-day (23:59:59.999)** in the user's timezone before storing as UTC.

### Backend Processing

```json
// POST /admin/credits/grant
// Headers: X-Timezone: Asia/Kolkata
{
  "userId": "01KVYHB7XW...",
  "amount": 10,
  "expiresAt": "2026-07-31"
}
```

For `Asia/Kolkata` (+05:30), this stores: **`2026-07-31T18:29:59.999Z`**

The user's credits remain spendable until 23:59:59 IST on July 31 — not midnight UTC, which would expire them 5.5 hours early.

> [!IMPORTANT]
> The `X-Timezone` header is enforced by `RequireTimezoneGuard` on timezone-sensitive routes. Omitting it returns 400 to prevent accidental UTC defaults that would cause early expiry for global users.

### Client Interpretation

The client requires no timezone math. It receives the UTC ISO string (`2026-07-31T18:29:59.999Z`), passes it to the native `Date` constructor or `dayjs()`, and the browser/OS automatically converts it to the device's local time — rendering as `July 31, 2026, 23:59:59` in the user's timezone.

---

## 🏗 Architecture Decisions

| Decision | Rationale |
|:---|:---|
| FIFO in `getBalance`, not aggregate | Aggregate is bundle-blind: cannot determine which debit was charged against which bundle, producing wrong results when some bundles have expired |
| `getBalance` is cron-independent | The Pub/Sub fan-out pipeline can be delayed hours by backlog or misconfiguration; balance correctness must not depend on it |
| `EXPIRED` DEBITs excluded from `getBalance` | Including them would double-deduct: the expired bundle's CREDIT is already excluded; subtracting the EXPIRED DEBIT again would produce a negative balance |
| Cron includes `EXPIRED` DEBITs in its own `totalDebits` | How idempotency works: existing EXPIRED rows inflate `totalDebits`, making bundles appear fully consumed → `unusedAmount = 0` → no duplicate row |
| Fan-out via Pub/Sub | Synchronous processing of all users at once would block the API and timeout on large user bases |
| Append-only ledger | Immutable audit trail; balances are always fully derivable from history; no risk of cached balance drift |

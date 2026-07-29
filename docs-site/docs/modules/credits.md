---
sidebar_position: 6
---

# Credits Module

The `CreditsModule` maintains the transactional credit engine for BreathAway, enforcing double-entry ledger bookkeeping for all user balances.

---

## 📋 Purpose & Responsibilities

- **Balance Tracking**: Dynamically computes balances by running a sum query on transaction logs, eliminating out-of-sync cache errors.
- **Double-Entry Auditing**: Logs all credit flows with strict transaction types and source indicators.
- **Expiration Logic**: Supports credit logs with individual expiration timestamps, allowing bonus credits to expire without impacting purchased credit pools.

---

## ⚙️ Managed Enums

The credit transaction ledger relies on two central enums:

### 1. CreditTransactionType
Defines the direction of the ledger transaction:

* **`CREDIT`**: Adds credits to the user's balance (e.g. purchases, bonuses, referrals). Represented as a positive value.
* **`DEBIT`**: Deducts credits from the user's balance (e.g. usage expenditures, administrative deductions). Represented as a negative value.

### 2. CreditSource
Categorizes the origin or sink of the credit transaction:

| Source Enum | Type | Description |
| :--- | :--- | :--- |
| **`PURCHASE`** | `CREDIT` | User purchased a standalone credits bundle |
| **`SUBSCRIPTION`** | `CREDIT` | Credits granted automatically as part of a monthly subscription renewal |
| **`BONUS`** | `CREDIT` | Promotional credits given to the user (usually has an `expiresAt` limit) |
| **`REFERRAL`** | `CREDIT` | Credits earned by referring a new user |
| **`LIKE_USAGE`** | `DEBIT` | Credits spent to send likes or super-likes |
| **`EXPIRED`** | `DEBIT` | Deducts unused, expired bonus credits when the expiration date is reached |
| **`ADMIN`** | `CREDIT`/`DEBIT` | Manual adjustment made by a platform administrator |

---

## 🧠 Business Logic & Core Concepts

### 1. Atomic Transaction Composition
Because credits represent financial value, mutation methods (`grantCredits`, `consumeCredits`) accept an optional Prisma `TransactionClient` (`tx`). This allows other modules (like `LikesService` or `SubscriptionsService`) to wrap credit deducts/grants inside their own transactions, preventing race conditions or partial failures (e.g., spending credits but failing to save the Like).

### 2. Safe FIFO Expiry Allocation
The `expireCreditsForUsers` method calculates expiration dynamically. It sums all past debits and applies them to the oldest credit bundles first. Only the unconsumed portion of a bundle that has passed the `asOf` date is expired via a compensating `DEBIT` row. This makes the expiry worker fully idempotent and safe to retry.

### 3. Distributed Pub/Sub Processing
Credit expiry is heavy. Rather than processing all users at once, a coordinator fans out `CREDIT_EXPIRY_BATCH` events via Google Cloud Pub/Sub. The `CreditsService` listens to these batches, evaluating expiry for a small subset of users at a fixed `asOf` time snapshot, allowing horizontal scaling.

---

## 🗄 Transaction Ledger Schema

Each ledger log entry contains the following properties:

```
CreditLedger
├── id (ULID, primary key)
├── userId (String, mapped to User)
├── transactionType (CREDIT or DEBIT)
├── amount (Int, always positive in the record, sign resolved by type)
├── source (CreditSource enum)
├── referenceId (String, optional; e.g. purchase invoice or like ID)
├── expiresAt (DateTime, optional)
└── createdAt (DateTime)
```

### Balance Calculation Formula

The active credit balance for any user is computed in real-time via an in-memory **FIFO allocation pass** over the user's ledger:

```text
1. remainingDebits  = Σ(DEBIT where source ≠ EXPIRED)
2. Sort CREDIT bundles: earliest expiresAt first, null last
3. For each bundle:
     usedFromBundle = min(remainingDebits, bundle.amount)
     remainingDebits -= usedFromBundle
     if bundle is NOT expired:
         balance += (bundle.amount - usedFromBundle)
4. Return balance
```

> [!IMPORTANT]
> This formula is **cron-independent**. The result is identical whether or not the background expiry job has run. See [Why `getBalance` Uses FIFO Allocation](#-why-getbalance-uses-fifo-allocation) below for the full rationale.

---

## 🔍 Why `getBalance` Uses FIFO Allocation

### The Original Bug

The original implementation summed every `CREDIT` and `DEBIT` row unconditionally:

```text
// Original, incorrect formula
balance = Σ(all CREDITs) − Σ(all DEBITs)
```

This allowed users to spend credits past their `expiresAt` timestamp until the maintenance cron inserted compensating `EXPIRED` DEBIT rows — a window of potentially hours.

### The Intermediate Attempt (Still Wrong)

The next attempt filtered aggregates separately:

```text
// Intermediate, still incorrect formula
balance = Σ(CREDIT where expiresAt > now) − Σ(DEBIT where source ≠ EXPIRED)
```

This fixed the post-expiry spend window, but introduced a **bundle-blindness** problem. It subtracts all `LIKE_USAGE` debits from whatever active credits remain — without knowing *which bundle* each debit was charged against.

**Concrete failure case:**
- Jul 20: `+5` credits, expires Jul 29
- Jul 22: `+5` credits, expires Jul 31
- Jul 23: `−1` LIKE_USAGE
- Query on Jul 30 (Jul 29 bundle now expired)

| Formula | CREDIT sum | DEBIT sum | Result |
|:---|:---|:---|:---|
| Aggregate (wrong) | +5 (Jul 31 only) | −1 | **4** ❌ |
| FIFO (correct) | Jul 29 absorbs the 1 debit → expired, excluded. Jul 31 untouched | — | **5** ✅ |

The 1 credit was spent while the Jul 29 bundle was still live. FIFO correctly allocates that spend to the earliest-expiring bundle, leaving the Jul 31 bundle completely intact.

### The Fix: FIFO In-Memory Allocation

`getBalance` now runs the same **first-to-expire FIFO** strategy as `expireCreditsForUsers`, but as a read-only pass:

1. **Collect real spends** — sum all non-`EXPIRED`-source DEBIT amounts. `EXPIRED` rows are cron-compensating entries that close the books on lapsed bundles; they are not genuine spends.

2. **Sort CREDIT bundles** by earliest `expiresAt` first (null last), with `createdAt` as a tiebreaker.

3. **Drain debits FIFO** — walk the sorted bundles, consuming `remainingDebits` against each in turn.

4. **Accumulate active remainders** — only the unconsumed portion of a bundle that has **not yet expired** at query time contributes to the balance.

### Proof of Correctness (Four States)

| State | FIFO allocation | Balance |
|:---|:---|:---|
| Both bundles active, 1 spent | Jul 29: absorbs 1 debit → 4 unused, active → +4. Jul 31: 0 debits → 5 unused, active → +5 | **9** ✅ |
| Jul 29 expired, cron NOT yet run | Jul 29: absorbs 1 debit → 4 unused, **expired** → +0. Jul 31: 0 debits → +5 | **5** ✅ |
| Jul 29 expired, cron HAS run (EXPIRED −4 inserted) | Same as above — EXPIRED DEBIT excluded from `remainingDebits` | **5** ✅ |
| All credits expired, no debits | All bundles expired → excluded from accumulation | **0** ✅ |

All four states produce the same semantically correct result. The cron is now a **search-index maintenance job** — it materialises `EXPIRED` rows so `creditStatus` filters in `getLedger` stay fast — but it is no longer a correctness dependency for `getBalance`, `hasSufficientCredits`, or `consumeCredits`.

---

## ⏳ Credit Expiration & Consumption Logic

The `CreditsService` applies a **First-to-Expire** consumption model when resolving credit balances and executing the background expiration cron job.

> [!NOTE]
> **Core Logic Principles**
> 1. **First-to-Expire Sorting**: When the background expiration job evaluates credit consumption, it applies historical debits to the credit bundles that expire the soonest.
> 2. **Null Expiry Deprioritization**: Credits without an expiry date (e.g. referrals) are pushed to the back of the consumption queue and are only used when all expiring credits are fully exhausted.
> 3. **Creation Tie-Breaker**: If two bundles expire simultaneously (or both have no expiry), the older bundle (`createdAt`) is consumed first.

---

### Scenario 1: Standard Consumption (Earliest Created Expires First)
In a standard flow where the first credit purchased is also the first to expire, the system consumes the older credit first.

**Setup**: 
* **Nov 1**: 10 Purchase Credits (Expires **Jan 1**)
* **Dec 1**: 10 Admin Credits (Expires **Feb 1**)
* **Dec 25**: User consumes 5 credits (`LIKE_USAGE`)

| Date | Action / Event | Total Debits | Balance | Expiration Cron Logic |
| :--- | :--- | :--- | :--- | :--- |
| **Nov 1** | +10 (Purchase) | 0 | **10** | *Purchase (10/10 unused)* |
| **Dec 1** | +10 (Admin) | 0 | **20** | *Purchase (10/10 unused), Admin (10/10 unused)* |
| **Dec 25** | -5 (`LIKE_USAGE`) | 5 | **15** | *Usage is logged. Balance dynamically calculated.* |
| **Jan 1** | Expiration Cron Runs | 5 | **10** | Cron orders by expiry: **Purchase (Jan 1)** -> Admin (Feb 1). Applies 5 debits to Purchase. Unused Purchase = 5. Since it expires today, **inserts `-5` `EXPIRED` debit**. |
| **Jan 5** | *Observation* | 10 | **10** | *Admin (10/10 unused). Purchase is fully depleted.* |
| **Feb 1** | Expiration Cron Runs | 10 | **0** | Cron evaluates: Total debits (10) applied to Purchase (10) -> Admin (0 debits left). Admin unused = 10. Expires today, **inserts `-10` `EXPIRED` debit**. |

---

### Scenario 2: High Usage (Overlapping Multiple Bundles)
High usage correctly cascades across multiple credit bundles in order of their expiration.

**Setup**: 
* **Nov 1**: 10 Purchase Credits (Expires **Jan 1**)
* **Dec 1**: 10 Admin Credits (Expires **Feb 1**)
* **Dec 25**: User consumes 15 credits (`LIKE_USAGE`)

| Date | Action / Event | Total Debits | Balance | Expiration Cron Logic |
| :--- | :--- | :--- | :--- | :--- |
| **Dec 25** | -15 (`LIKE_USAGE`) | 15 | **5** | *Usage is logged.* |
| **Jan 1** | Expiration Cron Runs | 15 | **5** | Cron orders by expiry: **Purchase (Jan 1)** -> Admin (Feb 1). Applies 10 to Purchase (fully used). Applies 5 to Admin (5 unused, but doesn't expire yet). **No expiration debits inserted.** |
| **Jan 5** | *Observation* | 15 | **5** | *Admin (5/10 unused). Purchase was fully utilized.* |
| **Feb 1** | Expiration Cron Runs | 15 | **0** | Admin has 5 unused. It expires today, so **inserts `-5` `EXPIRED` debit**. |

---

### Scenario 3: Inverse Creation Order (Late Creation Expires First)
> [!TIP]
> This scenario demonstrates the fix from the previous strict-FIFO implementation. Previously, usage would hit the older Admin bucket first, causing the Purchase bucket to expire unused. Now, the Purchase bucket is correctly consumed to save it from expiration.

**Setup**: 
* **Nov 1**: 10 Admin Credits (Expires **Feb 1**)
* **Dec 1**: 10 Purchase Credits (Expires **Jan 1**)
* **Dec 25**: User consumes 5 credits (`LIKE_USAGE`)

| Date | Action / Event | Total Debits | Balance | Expiration Cron Logic |
| :--- | :--- | :--- | :--- | :--- |
| **Dec 25** | -5 (`LIKE_USAGE`) | 5 | **15** | *Usage is logged.* |
| **Jan 1** | Expiration Cron Runs | 5 | **10** | Cron orders by expiry: **Purchase (Jan 1)** -> Admin (Feb 1). Applies 5 debits to Purchase. Unused Purchase = 5. Since it expires today, **inserts `-5` `EXPIRED` debit**. |
| **Jan 5** | *Observation* | 10 | **10** | *Admin (10/10 unused). Purchase is fully depleted (5 used + 5 expired).* |
| **Feb 1** | Expiration Cron Runs | 10 | **0** | Cron evaluates: Total debits (10) applied to Purchase (10) -> Admin (0 debits left). Admin unused = 10. Expires today, **inserts `-10` `EXPIRED` debit**. |

---

### Scenario 4: Expiring vs Non-Expiring Credits
> [!TIP]
> This scenario demonstrates how non-expiring credits are preserved. Previously, usage would deplete the older non-expiring referral credit first. Now, the system prioritizes the expiring purchase credit regardless of when they were granted.

**Setup**: 
* **Nov 1**: 10 Referral Credits (**No Expiry**)
* **Dec 1**: 10 Purchase Credits (Expires **Jan 1**)
* **Dec 25**: User consumes 12 credits (`LIKE_USAGE`)

| Date | Action / Event | Total Debits | Balance | Expiration Cron Logic |
| :--- | :--- | :--- | :--- | :--- |
| **Nov 1** | +10 (Referral) | 0 | **10** | *Referral (10/10 unused, never expires)* |
| **Dec 1** | +10 (Purchase) | 0 | **20** | *Purchase (10/10 unused)* |
| **Dec 25** | -12 (`LIKE_USAGE`) | 12 | **8** | *Usage logged.* |
| **Jan 1** | Expiration Cron Runs | 12 | **8** | Cron orders by expiry: **Purchase (Jan 1)** -> Referral (Null). Applies 10 debits to Purchase (fully used, 0 left to expire). Applies remaining 2 debits to Referral (8 unused, never expires). **No expiration debits inserted.** |
| **Jan 5** | *Observation* | 12 | **8** | *Balance is 8 (remaining referral credits). All expiring credits were efficiently consumed.* |

---

## 🌍 Timezone Handling & Client (UI) Interpretation

Credit expiration boundaries must align perfectly with the user's local timezone so that "expires on July 31st" consistently means "expires at 11:59:59 PM in my local time."

### 1. Backend Processing

The API enforces timezone boundaries mathematically upon granting the credits. The client (or internal system granting the credit) provides a simple date string alongside an `X-Timezone` header:

```json
// POST /admin/credits/grant
// Headers: X-Timezone: Asia/Kolkata
{
  "userId": "123",
  "amount": 10,
  "expiresAt": "2026-07-31" // Date-only string
}
```

The `TimezoneMiddleware` intercepts the header, and the backend leverages it to compute the exact **End of Day (23:59:59)** for that specific local timezone, before converting it to an absolute UTC timestamp for Prisma storage.

For `Asia/Kolkata` (+05:30), `2026-07-31` is saved to the database as:
`2026-07-31T18:29:59.999Z`

> [!IMPORTANT]
> The backend explicitly requires the `X-Timezone` header on timezone-sensitive routes (enforced via `RequireTimezoneGuard`). If the header is omitted, the API safely rejects the request to prevent accidental UTC defaults which would cause credits to expire 5-12 hours early for global users.

### 2. Client (UI) Interpretation

The client/UI's responsibility is incredibly straightforward. It does **not** need to perform any complex timezone math or boundary calculations.

1. **Receive the Response:** The API returns the exact ISO string from the database (e.g., `2026-07-31T18:29:59.999Z`).
2. **Native Parsing:** The UI blindly parses this string using standard utilities (e.g., `new Date("2026-07-31T18:29:59.999Z")` or `dayjs(val)`).
3. **Automatic Local Conversion:** Because browsers and mobile OSes automatically interpret ISO `Z` (UTC) strings into the device's local timezone upon parsing, the timestamp perfectly converts back to `July 31, 2026, 23:59:59` on the user's device.
4. **Formatting:** When formatted for display (e.g., `dayjs(val).format('MMMM D, YYYY')`), it safely outputs **July 31, 2026**.

**Key Takeaway:** The backend enforces the timezone boundaries, while the client simply parses and renders the UTC timestamp natively. This perfectly prevents UI calendar rollover bugs (where 00:00:00 would render as "August 1st").

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

The active credit balance for any user is computed as:

```text
Active Balance = Sum(CREDIT amounts where expiresAt > now OR expiresAt is NULL) - Sum(DEBIT amounts)
```

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

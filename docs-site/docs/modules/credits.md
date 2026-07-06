---
sidebar_position: 6
---

# Credits Module

The `CreditsModule` maintains the transactional credit engine for BreathAway, enforcing double-entry ledger bookkeeping.

---

## 📋 Purpose & Responsibilities

- **Balance Tracking (`GET /balance`)**: Tallies the sum of all transaction logs for a user to determine their active balance.
- **Ledger Auditing (`GET /history`)**: Exposes historical transactions (`CREDIT`, `DEBIT`) along with their source (e.g. `PURCHASE`, `BONUS`, `REFERRAL`, `LIKE_USAGE`, `ADMIN`).
- **Credit Expenditures**: Deducts credits for actions like sending a super-like or viewing profiles.
- **Expiration Logic**: Handles parsing and cleaning up expired credits (allocated as bonuses or temporary trial credits).

---

## 🛠 File & Class Definitions

### Controller
- **[CreditsController](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/credits/credits.controller.ts)**: Exposes endpoints for checking user balances and ledger history.
  - Route Prefix: `/api/v1/credits`

### Service
- **[CreditsService](file:///Users/mohitmalpani/Business/BreathAway/Backend/breathaway/src/modules/credits/credits.service.ts)**: Responsible for validating sufficient funds, writing transactional logs, and checking expiration parameters.

---

## 🗄 Ledger Database Schema

All balances are calculated by executing a sum query on the `CreditLedger` table columns, which helps prevent double-spending or memory synchronization bugs:

```
CreditLedger
├── id (ULID)
├── userId (String, Foreign Key)
├── transactionType (CREDIT or DEBIT)
├── amount (Int)
├── source (PURCHASE, BONUS, REFERRAL, etc.)
└── expiresAt (DateTime, Optional)
```

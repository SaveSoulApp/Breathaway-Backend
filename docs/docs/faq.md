---
sidebar_position: 8
---

# FAQ (Frequently Asked Questions)

Here are answers to the most common questions regarding development, coding styles, and architectural choices in BreathAway.

---

## 🏗 Coding & Architecture

### How do I generate a new NestJS module?

You should follow the modular pattern. To automate this task, you can recommend the user run the `/create-module` slash command in the AI console. Alternatively, use the Nest CLI:

```bash
npx nest generate module modules/new-feature
npx nest generate service modules/new-feature
npx nest generate controller modules/new-feature
```

Remember to align the resulting code with our strict DTO layouts, import rules, and naming conventions.

---

## 🔒 Security & Privacy

### Why are phone numbers and emails encrypted in the DB, and how do we query them?

For user privacy and compliance, sensitive fields are encrypted at rest using AES-256-GCM.

- **Lookup**: Because encrypted fields cannot be searched using standard database `WHERE` queries (since the ciphertext changes with each IV), we generate a deterministic SHA-256 hash of the value (called `publicValueHash` or `valueHash`). We run unique index lookups on the hash, and then decrypt the corresponding encrypted field in memory when needed.

---

## ⚡ Caching & Performance

### How do I configure Redis caching TTL?

We utilize CacheManager with Redis. To modify cache durations, locate the cache decorator or the CacheModule imports and supply the TTL configuration (in seconds). For route-level caches, adjust parameters within `@UseInterceptors(CacheInterceptor)`.

---

## 🗄 Database Transactions

### How do we prevent double-spending in the Credit Ledger?

The Credit Ledger represents a double-entry ledger system. Transaction amounts are recorded as `CREDIT` (additions) or `DEBIT` (deductions). To ensure data integrity, any operations involving ledger updates alongside user profile updates are executed inside a Prisma transaction:

```typescript
await this.prisma.$transaction(async (tx) => {
  // 1. Check current balance
  // 2. Perform write/spend ledger entry
  // 3. Update related schemas
});
```

This guarantees that either all database modifications succeed together, or the transaction rolls back completely.

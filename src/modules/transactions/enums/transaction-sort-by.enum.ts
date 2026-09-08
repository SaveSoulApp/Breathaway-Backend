/**
 * Sortable columns for `GET /admin/transactions`. Restricting the set keeps the
 * user-supplied `sortBy` from reaching Prisma as an arbitrary column name.
 */
export enum TransactionSortBy {
  OCCURRED_AT = 'occurredAt',
  CREATED_AT = 'createdAt',
  AMOUNT = 'amount',
}

# Query Optimization Guidelines
- **N+1 Problem:** Always use `include` in Prisma to fetch relations in a single query rather than mapping over results and making subsequent queries.
- **Select Specific Fields:** Use `select: { id: true, name: true }` rather than fetching entire large objects.
- **Pagination:** Always implement `take` and `skip` (or cursor-based pagination) for lists.

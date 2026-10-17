/**
 * Real-time diagnostic status metrics of the underlying PostgreSQL connection pool.
 */
export interface DatabasePoolStatus {
  /**
   * Total number of database connection clients currently managed by the pool
   * (both idle and actively executing queries).
   */
  totalCount: number;

  /**
   * Number of database connection clients currently connected and idle,
   * immediately available for queries.
   */
  idleCount: number;

  /**
   * Number of database connection clients currently checked out and actively
   * processing SQL statements (`totalCount - idleCount`).
   */
  activeCount: number;

  /**
   * Number of incoming queries or transactions queued waiting for an available
   * database client socket. A non-zero value indicates connection pool contention.
   */
  waitingCount: number;

  /**
   * Maximum connection capacity configured for this pool instance (`DB_POOL_MAX`).
   */
  max: number;

  /**
   * Current connection utilization percentage relative to the configured max limit (`0-100%`).
   */
  utilizationPercent: number;
}

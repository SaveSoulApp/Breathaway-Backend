import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigQuery } from '@google-cloud/bigquery';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

/**
 * Service encapsulating BigQuery audit log queries for compliance and DSAR data portability.
 *
 * Designed with defensive error boundaries and partition pruning to ensure queries
 * are fast, low-cost, and never block data subject exports when BigQuery is unprovisioned
 * or temporarily unreachable.
 */
@Injectable()
export class BigQueryAuditService extends BaseService {
  private readonly bigquery: BigQuery;
  private readonly projectId: string;
  private readonly datasetId: string;
  private readonly tableId: string;

  constructor(
    logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    super(logger);
    this.projectId =
      this.configService.get<string>('GCP_PROJECT_ID') ??
      'breathaway-development';
    this.datasetId =
      this.configService.get<string>('AUDIT_BIGQUERY_DATASET') ??
      'audit_logs_dataset';
    this.tableId =
      this.configService.get<string>('AUDIT_BIGQUERY_TABLE') ?? 'events';

    this.bigquery = new BigQuery({ projectId: this.projectId });
  }

  /**
   * Queries audit log events for a specific user.
   *
   * Applies partition pruning against publish_time (last 365 days) and parameterizes
   * the userId filter to prevent SQL injection and full table scan billing.
   *
   * If BigQuery is unavailable (e.g. local development or missing dataset), gracefully
   * returns an empty list and logs a warning to prevent failing the overall DSAR pipeline.
   *
   * @param userId - The unique identifier of the data subject.
   * @param limit - Maximum number of audit records to return (defaults to 1000).
   * @returns Array of structured audit event records.
   */
  async queryUserAuditLogs(
    userId: string,
    limit: number = 1000,
  ): Promise<Array<Record<string, unknown>>> {
    const ctx = { userId, limit, step: 'query_audit_logs' };

    const query = `
      SELECT
        message_id,
        publish_time,
        data,
        attributes
      FROM \`${this.projectId}.${this.datasetId}.${this.tableId}\`
      WHERE
        publish_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
        AND JSON_VALUE(data.userId) = @userId
      ORDER BY publish_time DESC
      LIMIT @limit
    `;

    try {
      this.logger.debug('Executing BigQuery audit log query for DSAR', ctx);

      const [rows] = await this.bigquery.query({
        query,
        params: { userId, limit },
      });

      this.logger.debug('BigQuery audit log query completed', {
        ...ctx,
        recordCount: rows.length,
      });

      return rows as Array<Record<string, unknown>>;
    } catch (err: unknown) {
      this.logger.warn(
        'BigQuery audit log query failed or dataset unreachable; returning empty audit trail',
        {
          step: 'query_audit_logs_fallback',
          userId,
          limit,
          err: serializeError(err),
        },
      );
      return [];
    }
  }
}

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { safeCloseClient } from '@common/utils/cleanup.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

/**
 * Integrates with Google Cloud Secret Manager to store and manage sensitive infrastructure credentials.
 *
 * Utilizes the official `@google-cloud/secret-manager` client. Assumes the environment has
 * Application Default Credentials (ADC) configured with appropriate IAM roles (e.g., Secret Manager Admin).
 */
@Injectable()
export class GcpSecretManagerService
  extends BaseService
  implements OnModuleDestroy
{
  private readonly client = new SecretManagerServiceClient();
  private cachedProjectId?: string;

  constructor(
    logger: LoggerService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    super(logger);
  }

  async onModuleDestroy() {
    await safeCloseClient(this.client, this.logger, 'Secret Manager');
  }

  /**
   * Resolves and caches the active GCP project ID to avoid repeated metadata calls.
   *
   * Prefers `GCP_PROJECT_ID` from ConfigService if available; otherwise queries
   * the client's metadata service and caches the resolved value.
   *
   * @returns The resolved GCP project ID string.
   */
  private async getProjectId(): Promise<string> {
    if (this.cachedProjectId) {
      return this.cachedProjectId;
    }

    const configProjectId = this.configService?.get<string>('GCP_PROJECT_ID');
    if (configProjectId) {
      this.cachedProjectId = configProjectId;
      return this.cachedProjectId;
    }

    this.cachedProjectId = await this.client.getProjectId();
    return this.cachedProjectId;
  }

  /**
   * Adds a new version to an existing GCP secret, effectively updating its plaintext value.
   *
   * Automatically resolves the current GCP project ID. If the secret does not exist,
   * the underlying GCP API will throw an error (it does not create the secret structure automatically).
   *
   * @param secretName - The short secret name (e.g. 'stripe-webhook-secret'), not the full resource path.
   * @param value - The plaintext value to store as the new active version.
   * @throws {Error} When the GCP API rejects the request (e.g., insufficient permissions, secret not found).
   */
  async upsertSecret(secretName: string, value: string): Promise<void> {
    const ctx = { secretName };
    try {
      const projectId = await this.getProjectId();
      const parent = `projects/${projectId}/secrets/${secretName}`;

      await this.client.addSecretVersion({
        parent,
        payload: {
          data: Buffer.from(value, 'utf8'),
        },
      });

      this.logger.log(
        `Successfully updated secret '${secretName}' in GCP Secret Manager`,
        { ...ctx, step: 'upsert_success' },
      );
    } catch (error) {
      this.logger.error(
        `Failed to update secret '${secretName}' in GCP Secret Manager: ${(error as Error).message}`,
        { ...ctx, step: 'upsert_failed', error },
      );
      throw error;
    }
  }

  /**
   * Retrieves the plaintext payload of the latest version of a secret from GCP Secret Manager.
   *
   * @param secretName - The short secret name (e.g. 'stripe-webhook-secret'), not the full resource path.
   * @returns The UTF-8 string value of the secret payload.
   * @throws {Error} When the secret does not exist or payload is missing.
   */
  async getSecret(secretName: string): Promise<string> {
    const ctx = { secretName };
    try {
      const projectId = await this.getProjectId();
      const name = `projects/${projectId}/secrets/${secretName}/versions/latest`;

      const [version] = await this.client.accessSecretVersion({ name });
      const payload = version.payload?.data?.toString('utf8');

      if (!payload) {
        throw new Error(
          `Secret '${secretName}' payload is empty or not readable`,
        );
      }

      this.logger.debug(
        `Successfully retrieved secret '${secretName}' from GCP Secret Manager`,
        { ...ctx, step: 'get_secret_success' },
      );
      return payload;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve secret '${secretName}' from GCP Secret Manager: ${(error as Error).message}`,
        { ...ctx, step: 'get_secret_failed', error },
      );
      throw error;
    }
  }
}

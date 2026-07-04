import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Injectable } from '@nestjs/common';

/**
 * Integrates with Google Cloud Secret Manager to store and manage sensitive infrastructure credentials.
 *
 * Utilizes the official `@google-cloud/secret-manager` client. Assumes the environment has
 * Application Default Credentials (ADC) configured with appropriate IAM roles (e.g., Secret Manager Admin).
 */
@Injectable()
export class GcpSecretManagerService extends BaseService {
  private readonly client = new SecretManagerServiceClient();

  constructor(logger: LoggerService) {
    super(logger);
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
      const projectId = await this.client.getProjectId();
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
}

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Injectable } from '@nestjs/common';
import { LoggerService } from '@core/logger';

@Injectable()
export class GcpSecretManagerService {
  private readonly client = new SecretManagerServiceClient();

  constructor(private readonly logger: LoggerService) {}

  /**
   * Adds a new version to an existing GCP secret.
   * @param secretName - The short secret name (e.g. 'some-secret-name'), not the full resource path.
   * @param value - The plaintext value to store.
   */
  async upsertSecret(secretName: string, value: string): Promise<void> {
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
      );
    } catch (error) {
      this.logger.error(
        `Failed to update secret '${secretName}' in GCP Secret Manager: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}

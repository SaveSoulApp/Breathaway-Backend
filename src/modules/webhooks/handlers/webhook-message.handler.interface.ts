import { ParsedInstagramMessage } from '../interfaces/meta-webhook-result.interface';

export interface WebhookMessageHandler {
  canHandle(message: ParsedInstagramMessage): boolean;
  handle(message: ParsedInstagramMessage): Promise<void>;
}

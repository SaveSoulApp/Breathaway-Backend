import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { serializeError } from '@common/utils/error.utils';
import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';

import { BrevoEmailAdapter } from './brevo.email.adapter';
import { EmailPayload, IEmailAdapter } from './email-adapter.interface';
import { MailgunEmailAdapter } from './mailgun.email.adapter';
import { ResendEmailAdapter } from './resend.email.adapter';
import { SendGridEmailAdapter } from './sendgrid.email.adapter';

/**
 * Composite email adapter implementing dynamic priority failover across multiple email providers.
 *
 * Pre-compiles and caches the prioritized provider sequence during service initialization to ensure
 * zero-allocation O(1) pointer access on every outgoing email dispatch.
 * If a provider encounters a transient failure or outage, it emits a structured warning and
 * automatically cascades to the next configured provider in the cached sequence.
 */
@Injectable()
export class FailoverEmailAdapter extends BaseService implements IEmailAdapter {
  private readonly adapterRegistry: Map<string, IEmailAdapter>;
  private readonly orderedAdapters: ReadonlyArray<{
    name: string;
    adapter: IEmailAdapter;
  }>;

  constructor(
    loggerService: LoggerService,
    private readonly configService: ConfigService,
    resendAdapter: ResendEmailAdapter,
    brevoAdapter: BrevoEmailAdapter,
    mailgunAdapter: MailgunEmailAdapter,
    sendGridAdapter: SendGridEmailAdapter,
  ) {
    super(loggerService);

    this.adapterRegistry = new Map<string, IEmailAdapter>([
      ['resend', resendAdapter],
      ['brevo', brevoAdapter],
      ['mailgun', mailgunAdapter],
      ['sendgrid', sendGridAdapter],
    ]);

    // Parse and cache once during initialization -> zero string allocations / config lookups on send
    this.orderedAdapters = this.resolveOrderedAdapters();
  }

  /**
   * Returns the cached, pre-resolved priority list of providers.
   */
  getOrderedAdapters(): ReadonlyArray<{
    name: string;
    adapter: IEmailAdapter;
  }> {
    return this.orderedAdapters;
  }

  /**
   * Pre-resolves the configured priority list of providers from the environment.
   * Priority is defined by `EMAIL_PROVIDERS` (comma-separated, e.g. "resend,brevo,mailgun").
   * Defaults to "resend,brevo,mailgun".
   */
  private resolveOrderedAdapters(): Array<{
    name: string;
    adapter: IEmailAdapter;
  }> {
    const configuredChain =
      this.configService.get<string>('EMAIL_PROVIDERS') ??
      'resend,brevo,mailgun';

    const providerNames = Array.from(
      new Set(
        configuredChain
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    const resolved: Array<{ name: string; adapter: IEmailAdapter }> = [];

    for (const name of providerNames) {
      const adapter = this.adapterRegistry.get(name);
      if (adapter) {
        resolved.push({ name, adapter });
      } else {
        this.logger.warn(
          `Configured email provider "${name}" is unknown or unsupported`,
          {
            step: 'bootstrap_warning',
            provider: name,
          },
        );
      }
    }

    if (resolved.length === 0) {
      const defaultAdapter = this.adapterRegistry.get('resend')!;
      resolved.push({ name: 'resend', adapter: defaultAdapter });
    }

    return resolved;
  }

  /**
   * Dispatches the email payload across the prioritized list of adapters.
   * Fails over to the next provider upon catching an error.
   *
   * @param payload - Recipient, subject, HTML, and sender metadata.
   * @throws Error if all configured providers fail.
   */
  async send(payload: EmailPayload): Promise<void> {
    const failures: Array<{ provider: string; error: string }> = [];

    for (let i = 0; i < this.orderedAdapters.length; i++) {
      const { name, adapter } = this.orderedAdapters[i];

      try {
        await adapter.send(payload);

        this.logger.log('Email delivered successfully', {
          provider: name,
          step: 'complete',
          attempt: i + 1,
          totalProviders: this.orderedAdapters.length,
          fellBack: i > 0,
        });

        return;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        failures.push({ provider: name, error: errorMessage });

        const nextProvider = this.orderedAdapters[i + 1]?.name;

        if (nextProvider) {
          this.logger.warn(
            'Email delivery failed for provider; attempting fallback to next provider',
            {
              step: 'provider_failover',
              failedProvider: name,
              nextProvider,
              attempt: i + 1,
              err: serializeError(error),
            },
          );
        } else {
          this.logger.error('Final email provider in failover chain failed', {
            step: 'failover_exhausted',
            failedProvider: name,
            attempt: i + 1,
            err: serializeError(error),
          });
        }
      }
    }

    throw new Error(
      `All email providers failed in failover chain: ${failures
        .map((f) => `[${f.provider}] ${f.error}`)
        .join('; ')}`,
    );
  }
}

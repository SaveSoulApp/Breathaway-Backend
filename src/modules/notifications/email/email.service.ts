import { BaseService } from '@core/base';
import { LoggerService } from '@core/logger';
import { PrismaService } from '@infrastructure/database/prisma.service';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { AuthCredentialType } from '@prisma/client';
import * as fs from 'fs';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { EmailType } from '../enums/email-type.enum';
import { EMAIL_ADAPTER_TOKEN, EmailPayload, type IEmailAdapter } from './adapters/email-adapter.interface';
import { EMAIL_TEMPLATE_MAP } from './email-template.registry';

export interface SendEmailOptions {
  /** The type of email — drives template and subject selection */
  emailType: EmailType;
  /** User IDs whose email addresses will be resolved from the database */
  userIds: string[];
  /**
   * Handlebars data for both subject and body rendering.
   * Common keys: name, etc. Template-specific keys documented on each template.
   */
  templateData: Record<string, unknown>;
}

@Injectable()
export class EmailService extends BaseService implements OnModuleInit {
  /** Compiled layout template — cached at startup */
  private layoutTemplate!: Handlebars.TemplateDelegate;

  /** Cache of compiled content templates keyed by EmailType */
  private readonly templateCache = new Map<
    EmailType,
    Handlebars.TemplateDelegate
  >();

  private readonly templatesDir: string;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    @Inject(EMAIL_ADAPTER_TOKEN)
    private readonly emailAdapter: IEmailAdapter,
  ) {
    super(loggerService);
    // Resolve templates directory relative to this file at runtime
    this.templatesDir = path.resolve(__dirname, '../../templates');
  }

  /**
   * Registers Handlebars partials and pre-compiles the layout at module init
   * to catch any template errors at startup rather than at send time.
   */
  onModuleInit(): void {
    this.registerPartials();
    this.compileLayout();
    this.logger.log('EmailService: templates and partials loaded successfully');
  }

  /**
   * Resolves user emails, renders the template, and dispatches via the active adapter.
   * Each recipient is sent an individually rendered email (personalised subject + body).
   */
  async send(options: SendEmailOptions): Promise<void> {
    const { emailType, userIds, templateData } = options;

    if (!userIds || userIds.length === 0) {
      this.logger.warn(`[EmailService] No userIds provided for ${emailType}`);
      return;
    }

    const templateConfig = EMAIL_TEMPLATE_MAP[emailType];
    if (!templateConfig) {
      this.logger.error(
        `[EmailService] No template registered for EmailType: ${emailType}`,
      );
      return;
    }

    // Resolve email addresses via AuthCredential (type=EMAIL).
    // The User model has no email field — emails are stored as AuthCredentials
    // linked to an Identity of type EMAIL. valueMasked holds the readable address.
    const credentials = await this.prisma.authCredential.findMany({
      where: {
        userId: { in: userIds },
        type: AuthCredentialType.EMAIL,
        deletedAt: null,
      },
      select: { userId: true, valueMasked: true },
    });

    const resolvedEmails = credentials
      .map((c): string | null => c.valueMasked)
      .filter((email): email is string => Boolean(email));

    if (resolvedEmails.length === 0) {
      this.logger.warn(
        `[EmailService] No valid email addresses found for ${userIds.length} userIds`,
      );
      return;
    }

    this.logger.log(
      `[EmailService] Dispatching ${emailType} to ${resolvedEmails.length} recipient(s)`,
    );

    const contentTemplate = this.getOrCompileTemplate(emailType);

    const results = await Promise.allSettled(
      resolvedEmails.map((to) =>
        this.renderAndSend(
          to,
          templateConfig.subject,
          contentTemplate,
          templateData,
        ),
      ),
    );

    results.forEach((result: PromiseSettledResult<void>, index: number) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `[EmailService] Failed to send ${emailType} to recipient #${index + 1}:`,
          { error: result.reason },
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async renderAndSend(
    to: string,
    subjectTemplate: string,
    contentTemplate: Handlebars.TemplateDelegate,
    data: Record<string, unknown>,
  ): Promise<void> {
    const subject = Handlebars.compile(subjectTemplate)(data);
    const contentHtml = contentTemplate(data);
    const html = this.layoutTemplate({ ...data, body: contentHtml });

    const payload: EmailPayload = { to, subject, html };
    await this.emailAdapter.send(payload);
  }

  private getOrCompileTemplate(
    emailType: EmailType,
  ): Handlebars.TemplateDelegate {
    if (this.templateCache.has(emailType)) {
      return this.templateCache.get(emailType)!;
    }

    const { templateFile } = EMAIL_TEMPLATE_MAP[emailType];
    const filePath = path.join(this.templatesDir, `${templateFile}.hbs`);
    const source = fs.readFileSync(filePath, 'utf-8');
    const compiled = Handlebars.compile(source);
    this.templateCache.set(emailType, compiled);
    return compiled;
  }

  private compileLayout(): void {
    const layoutPath = path.join(this.templatesDir, 'layout.hbs');
    const source = fs.readFileSync(layoutPath, 'utf-8');
    this.layoutTemplate = Handlebars.compile(source);
  }

  private registerPartials(): void {
    const partialsDir = path.join(this.templatesDir, 'partials');
    if (!fs.existsSync(partialsDir)) {
      this.logger.warn(
        `[EmailService] Partials directory not found at ${partialsDir}`,
      );
      return;
    }

    const partialFiles = fs
      .readdirSync(partialsDir)
      .filter((f) => f.endsWith('.hbs'));

    partialFiles.forEach((file) => {
      const name = path.basename(file, '.hbs');
      const source = fs.readFileSync(path.join(partialsDir, file), 'utf-8');
      Handlebars.registerPartial(name, source);
    });

    this.logger.log(
      `[EmailService] Registered ${partialFiles.length} Handlebars partial(s): ${partialFiles.join(', ')}`,
    );
  }
}

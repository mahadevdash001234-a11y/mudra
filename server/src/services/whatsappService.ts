import { prisma } from './db';
import { auditService } from './auditService';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedUser } from '../middleware/authMiddleware';
import { config } from '../config';
import { decryptSecret } from '../utils/security';
import { WhatsAppProvider } from '../providers/whatsapp/whatsappProvider.interface';
import { MetaWhatsAppProvider } from '../providers/whatsapp/metaWhatsAppProvider';
import { DevelopmentWhatsAppProvider } from '../providers/whatsapp/developmentWhatsAppProvider';
import { WaBridgeWhatsAppProvider } from '../providers/whatsapp/waBridgeProvider';

export interface SendWhatsAppInput {
  customerId: string;
  loanId?: string;
  message?: string;
  templateName?: string;
  actor: AuthenticatedUser;
  ipAddress?: string;
}

export interface BulkWhatsAppInput {
  customerIds?: string[];
  filter?: {
    status?: string;
    state?: string;
    kycStatus?: string;
    fromDate?: string;
    toDate?: string;
  };
  message: string;
  templateName?: string;
  actor: AuthenticatedUser;
  ipAddress?: string;
}

export class WhatsAppService {
  private provider: WhatsAppProvider;
  private customProvider: WhatsAppProvider | null = null;

  constructor(provider?: WhatsAppProvider) {
    if (provider) {
      this.customProvider = provider;
      this.provider = provider;
    } else {
      this.provider = this.resolveInitialProvider();
    }
  }

  private resolveInitialProvider(): WhatsAppProvider {
    const configuredProvider = (process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase();
    if (configuredProvider === 'wabridge') {
      return new WaBridgeWhatsAppProvider();
    }
    if (configuredProvider === 'meta' || process.env.NODE_ENV === 'test') {
      return new MetaWhatsAppProvider();
    }
    return new DevelopmentWhatsAppProvider();
  }

  public setProvider(provider: WhatsAppProvider) {
    this.customProvider = provider;
    this.provider = provider;
  }

  public resetProvider() {
    this.customProvider = null;
    this.provider = this.resolveInitialProvider();
  }

  public getProvider(): WhatsAppProvider {
    return this.provider;
  }

  /**
   * Refreshes provider credentials from environment and database settings
   */
  private async refreshProviderConfig() {
    if (this.customProvider) {
      this.provider = this.customProvider;
      return;
    }

    const dbSettings = await prisma.whatsAppSettings.findUnique({ where: { id: 'default' } });
    const configuredProvider = (dbSettings?.provider || process.env.WHATSAPP_PROVIDER || '').trim().toUpperCase();

    if (configuredProvider === 'DEVELOPMENT' && process.env.NODE_ENV !== 'test') {
      if (!(this.provider instanceof DevelopmentWhatsAppProvider)) {
        this.provider = new DevelopmentWhatsAppProvider();
      }
      return;
    }

    let dbToken = '';
    if (dbSettings?.accessTokenEnc) {
      try {
        dbToken = decryptSecret(dbSettings.accessTokenEnc, config.JWT_SECRET);
      } catch {
        dbToken = '';
      }
    }

    const effectiveToken = process.env.WABRIDGE_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || dbToken;
    const effectivePhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || dbSettings?.phoneNumberId || '1032424393284050';
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
    const effectiveEndpoint =
      process.env.WHATSAPP_API_URL ||
      dbSettings?.apiEndpoint ||
      (effectivePhoneId ? `https://graph.facebook.com/${apiVersion}/${effectivePhoneId}/messages` : '');

    if (configuredProvider === 'WABRIDGE') {
      if (!(this.provider instanceof WaBridgeWhatsAppProvider)) {
        this.provider = new WaBridgeWhatsAppProvider({
          apiUrl: dbSettings?.apiEndpoint || process.env.WABRIDGE_API_URL || 'https://web.wabridge.com/api',
          accessToken: effectiveToken,
          deviceId: dbSettings?.businessAccountId || process.env.WABRIDGE_DEVICE_ID || '69b16310667cead707b893e1',
          phoneNumberId: effectivePhoneId,
          wabaId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '946428907892164',
          senderNumber: dbSettings?.phoneNumber || process.env.WHATSAPP_PHONE_NUMBER || '+919876543210',
        });
      }
      return;
    }

    if (effectiveToken || configuredProvider === 'META' || configuredProvider === 'META_CLOUD' || process.env.NODE_ENV === 'test') {
      if (!(this.provider instanceof MetaWhatsAppProvider)) {
        this.provider = new MetaWhatsAppProvider({
          apiUrl: effectiveEndpoint,
          apiVersion,
          accessToken: effectiveToken,
          phoneNumberId: effectivePhoneId,
          businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || dbSettings?.businessAccountId || '',
        });
      } else {
        this.provider.updateConfig({
          apiUrl: effectiveEndpoint,
          apiVersion,
          accessToken: effectiveToken,
          phoneNumberId: effectivePhoneId,
          businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || dbSettings?.businessAccountId || '',
        });
      }
    } else {
      if (!(this.provider instanceof DevelopmentWhatsAppProvider)) {
        this.provider = new DevelopmentWhatsAppProvider();
      }
    }
  }

  /**
   * Resolves template placeholders with authoritative customer and loan database records.
   */
  resolveTemplate(
    template: string,
    variables: {
      customerName?: string;
      applicationId?: string;
      loanId?: string;
      loanStatus?: string;
      kycStatus?: string;
      paymentStatus?: string;
      loanAmount?: string;
      amount?: string;
      chargeType?: string;
      companyName?: string;
      utr?: string;
    }
  ): string {
    if (!template) return '';
    const safeAmount = variables.loanAmount || variables.amount || '0';
    const replaceMap: Record<string, string> = {
      customerName: variables.customerName || 'Customer',
      applicationId: variables.applicationId || 'N/A',
      loanId: variables.loanId || 'N/A',
      loanStatus: variables.loanStatus || 'Pending',
      kycStatus: variables.kycStatus || 'Pending',
      paymentStatus: variables.paymentStatus || 'Pending',
      loanAmount: safeAmount,
      amount: safeAmount,
      chargeType: variables.chargeType || 'Fee',
      companyName: variables.companyName || 'Loan Approve',
      utr: variables.utr || 'N/A',
    };

    let output = template;
    for (const [key, val] of Object.entries(replaceMap)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      output = output.replace(regex, val);
    }
    return output;
  }

  /**
   * Sends a personalized WhatsApp communication to a single customer.
   */
  async sendMessage(input: SendWhatsAppInput) {
    const { customerId, customMessage, message, templateName, actor, ipAddress } = input as any;
    const rawMessage = message || customMessage;

    await this.refreshProviderConfig();

    // 1. Fetch customer with latest loan
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        loans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer record not found');
    }

    if (customer.status === 'DEACTIVATED' || customer.isActive === false) {
      throw new AppError(400, 'Customer account is deactivated.');
    }

    // 2. Format and validate mobile
    const cleanMobile = customer.mobile.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      throw new AppError(400, `Customer has an invalid mobile number: ${customer.mobile}`);
    }

    // 3. Fetch branding info
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    const companyName = branding?.companyName || 'Your Financial Services';

    const latestLoan = customer.loans[0] || null;
    const loanId = latestLoan?.accountNumber || latestLoan?.applicationNumber || 'N/A';
    const applicationId = latestLoan?.applicationNumber || 'N/A';
    const amountStr = latestLoan ? `₹${latestLoan.requestedAmount.toLocaleString('en-IN')}` : '';

    // 4. Resolve template variables
    const defaultTemplate = `Hello {{customerName}},\n\nYour loan application {{applicationId}} is currently {{loanStatus}}.\n\nThank you,\n{{companyName}}`;
    const templateToUse = rawMessage && rawMessage.trim().length > 0 ? rawMessage.trim() : defaultTemplate;

    const finalMessage = this.resolveTemplate(templateToUse, {
      customerName: customer.fullName,
      applicationId,
      loanId,
      loanStatus: latestLoan?.status || 'Pending',
      kycStatus: customer.kycStatus || 'Pending',
      paymentStatus: latestLoan?.paymentStatus || 'Pending',
      amount: amountStr,
      companyName,
    });

    // 5. Send through provider
    const sendResult = await this.provider.sendMessage({
      to: cleanMobile,
      message: finalMessage,
      templateName: templateName || 'CUSTOM',
    });

    const isSent = sendResult.status === 'SENT';
    const failureReason = sendResult.error || (isSent ? null : 'WHATSAPP_PROVIDER_NOT_CONFIGURED');

    // 6. Save message in WhatsAppMessage history
    let validAdminId: string | null = null;
    if (actor?.id) {
      const adminExists = await prisma.adminUser.findUnique({ where: { id: actor.id } });
      if (adminExists) validAdminId = actor.id;
    }

    let validLoanId: string | null = null;
    if (latestLoan?.id) {
      const loanExists = await prisma.loanApplication.findUnique({ where: { id: latestLoan.id } });
      if (loanExists) validLoanId = latestLoan.id;
    }

    let waRecord: any = null;
    try {
      waRecord = await prisma.whatsAppMessage.create({
        data: {
          customerId: customer.id,
          loanId: validLoanId,
          adminId: validAdminId,
          phone: sendResult.recipient || customer.mobile,
          message: finalMessage,
          templateName: templateName || 'CUSTOM',
          providerMessageId: sendResult.providerMessageId || null,
          status: isSent ? 'SENT' : 'FAILED',
          sentAt: isSent ? new Date() : null,
          failedAt: isSent ? null : new Date(),
          failureReason,
        },
      });
    } catch (waErr: any) {
      console.error(`Failed to record WhatsAppMessage in DB: ${waErr?.message}`);
    }

    // 7. Create AuditLog
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: isSent ? 'WHATSAPP_SENT' : 'WHATSAPP_FAILED',
      entity: 'Customer',
      entityId: customer.id,
      newValue: {
        messageId: waRecord?.id || null,
        phone: customer.mobile,
        status: waRecord?.status || (isSent ? 'SENT' : 'FAILED'),
        failureReason,
      },
      ipAddress,
    });

    return {
      success: isSent,
      message: isSent
        ? 'WhatsApp message dispatched successfully.'
        : `WhatsApp delivery failed: ${failureReason}`,
      error: failureReason || undefined,
      data: {
        id: waRecord?.id || 'N/A',
        status: waRecord?.status || (isSent ? 'SENT' : 'FAILED'),
        phone: waRecord?.phone || customer.mobile,
        message: waRecord?.message || finalMessage,
        sentAt: waRecord?.sentAt || null,
        failureReason: waRecord?.failureReason || failureReason,
      },
    };
  }

  /**
   * Bulk sends WhatsApp messages to multiple customers (with filter-first support).
   */
  async sendBulkMessages(input: BulkWhatsAppInput) {
    const { customerIds, filter, message, templateName, actor, ipAddress } = input;
    let targetIds: string[] = customerIds || [];

    // Filter-first execution: If filter specified, query DB directly
    if (filter && (!targetIds || targetIds.length === 0)) {
      const where: any = { isDeleted: false };
      if (filter.kycStatus && filter.kycStatus !== 'ALL') {
        where.kycStatus = filter.kycStatus;
      }
      if (filter.state && filter.state !== 'ALL') {
        where.state = filter.state;
      }
      if (filter.status && filter.status !== 'ALL') {
        where.status = filter.status;
      }
      if (filter.fromDate || filter.toDate) {
        where.createdAt = {};
        if (filter.fromDate) where.createdAt.gte = new Date(filter.fromDate);
        if (filter.toDate) where.createdAt.lte = new Date(filter.toDate);
      }

      const matchingCustomers = await prisma.customer.findMany({
        where,
        select: { id: true },
      });
      targetIds = matchingCustomers.map((c) => c.id);
    }

    if (!targetIds || targetIds.length === 0) {
      throw new AppError(400, 'No recipients match the specified filter or selection.');
    }

    const results: any[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const id of targetIds) {
      try {
        const res = await this.sendMessage({
          customerId: id,
          message,
          templateName,
          actor,
          ipAddress,
        });
        results.push({ customerId: id, ...res });
        if (res.success) {
          sentCount++;
        } else {
          failedCount++;
        }
      } catch (err: unknown) {
        failedCount++;
        results.push({
          customerId: id,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Record bulk audit log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'BULK_WHATSAPP_SENT',
      entity: 'WhatsAppMessage',
      entityId: `bulk-${Date.now()}`,
      newValue: {
        total: targetIds.length,
        sentCount,
        failedCount,
        templateName,
      },
      ipAddress,
    });

    return {
      total: targetIds.length,
      sentCount,
      failedCount,
      results,
    };
  }

  /**
   * Bulk sends WhatsApp messages to multiple loan applications.
   */
  async sendBulkApplicationMessages(input: {
    applicationIds: string[];
    message?: string;
    templateName?: string;
    actor: AuthenticatedUser;
    ipAddress?: string;
  }) {
    const { applicationIds, message, templateName, actor, ipAddress } = input;
    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      throw new AppError(400, 'Please select at least one loan application.');
    }

    await this.refreshProviderConfig();

    const applications = await prisma.loanApplication.findMany({
      where: { id: { in: applicationIds } },
      include: { customer: true },
    });

    if (!applications || applications.length === 0) {
      throw new AppError(404, 'No matching loan applications found for the selected IDs.');
    }

    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    const companyName = branding?.companyName || 'Loan Finance';

    let validAdminId: string | null = null;
    if (actor?.id) {
      const adminExists = await prisma.adminUser.findUnique({ where: { id: actor.id } });
      if (adminExists) validAdminId = actor.id;
    }

    const defaultTemplate = `Hello {{customerName}},\n\nYour loan application {{applicationId}} is currently {{loanStatus}}.\n\nThank you,\n{{companyName}}`;
    const templateToUse = message && message.trim().length > 0 ? message.trim() : defaultTemplate;

    const results: any[] = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const app of applications) {
      const customer = app.customer;
      if (!customer || customer.isDeleted) {
        failedCount++;
        results.push({
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          customerName: customer?.fullName || 'Unknown',
          recipient: customer?.mobile || 'N/A',
          success: false,
          status: 'FAILED',
          error: 'Customer record not found or deleted',
        });
        continue;
      }

      const cleanMobile = customer.mobile.replace(/\D/g, '');
      if (cleanMobile.length < 10) {
        failedCount++;
        results.push({
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          customerName: customer.fullName,
          recipient: customer.mobile,
          success: false,
          status: 'FAILED',
          error: 'Invalid recipient phone number format',
        });
        continue;
      }

      const finalMessage = this.resolveTemplate(templateToUse, {
        customerName: customer.fullName,
        applicationId: app.applicationNumber,
        loanId: app.accountNumber || app.applicationNumber,
        loanStatus: app.status,
        kycStatus: customer.kycStatus || 'Pending',
        paymentStatus: app.paymentStatus || 'Pending',
        amount: `₹${app.requestedAmount.toLocaleString('en-IN')}`,
        companyName,
      });

      try {
        const sendResult = await this.provider.sendMessage({
          to: cleanMobile,
          message: finalMessage,
          templateName: templateName || 'APPLICATION_STATUS_UPDATE',
        });

        const isSent = sendResult.status === 'SENT';
        const failureReason = sendResult.error || (isSent ? null : 'WHATSAPP_PROVIDER_NOT_CONFIGURED');

        await prisma.whatsAppMessage.create({
          data: {
            customerId: customer.id,
            loanId: app.id,
            adminId: validAdminId,
            phone: sendResult.recipient || customer.mobile,
            message: finalMessage,
            templateName: templateName || 'APPLICATION_STATUS_UPDATE',
            providerMessageId: sendResult.providerMessageId || null,
            status: isSent ? 'SENT' : 'FAILED',
            sentAt: isSent ? new Date() : null,
            failedAt: isSent ? null : new Date(),
            failureReason,
          },
        });

        if (isSent) {
          sentCount++;
        } else {
          failedCount++;
        }

        results.push({
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          customerName: customer.fullName,
          recipient: sendResult.recipient || customer.mobile,
          success: isSent,
          status: isSent ? 'SENT' : 'FAILED',
          error: failureReason || undefined,
        });
      } catch (err: unknown) {
        failedCount++;
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({
          applicationId: app.id,
          applicationNumber: app.applicationNumber,
          customerName: customer.fullName,
          recipient: customer.mobile,
          success: false,
          status: 'FAILED',
          error: errMsg,
        });
      }
    }

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'BULK_WHATSAPP_APPLICATIONS_SENT',
      entity: 'LoanApplication',
      entityId: `bulk-${Date.now()}`,
      newValue: {
        total: applications.length,
        sentCount,
        failedCount,
        templateName,
      },
      ipAddress,
    });

    return {
      success: sentCount > 0 || (applications.length > 0 && failedCount === 0),
      total: applications.length,
      sentCount,
      failedCount,
      results,
    };
  }

  /**
   * Dispatches an actual test diagnostic message to a single number with DB persistence.
   */
  async sendTestPing(input: {
    toNumber: string;
    message?: string;
    templateName?: string;
    actor: AuthenticatedUser;
    ipAddress?: string;
  }) {
    const { toNumber, message: customMsg, templateName, actor, ipAddress } = input;
    if (!toNumber || typeof toNumber !== 'string' || !toNumber.trim()) {
      throw new AppError(400, 'Recipient mobile number is required.');
    }

    const clean = toNumber.trim().replace(/[\s\-\(\)]/g, '');
    const digits = clean.replace(/\D/g, '');

    if (digits.length < 10) {
      throw new AppError(400, 'Invalid recipient mobile number. Must contain at least 10 digits.');
    }

    await this.refreshProviderConfig();

    if (!this.provider.isConfigured()) {
      return {
        success: false,
        delivered: false,
        message: 'WhatsApp integration is not configured. Please configure and save valid Meta Cloud API credentials.',
        error: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
      };
    }

    const testMessage =
      customMsg?.trim() ||
      'Hello! This is a diagnostic test ping from the Loan Approve fintech platform. Your WhatsApp Business integration is working properly.';

    const sendResult = await this.provider.sendMessage({
      to: clean,
      message: testMessage,
      templateName: templateName || 'TEST_PING',
    });

    const isSent = sendResult.status === 'SENT';
    const failureReason = sendResult.error || (isSent ? null : 'WHATSAPP_PROVIDER_NOT_CONFIGURED');

    let validAdminId: string | null = null;
    if (actor?.id) {
      const adminExists = await prisma.adminUser.findUnique({ where: { id: actor.id } });
      if (adminExists) validAdminId = actor.id;
    }

    // Find customer by phone or default customer if available to satisfy DB relation
    const customer =
      (await prisma.customer.findFirst({
        where: { mobile: { contains: digits.slice(-10) } },
      })) || (await prisma.customer.findFirst());

    if (customer) {
      // Persist test message in database
      await prisma.whatsAppMessage.create({
        data: {
          customerId: customer.id,
          adminId: validAdminId,
          phone: sendResult.recipient || clean,
          message: testMessage,
          templateName: templateName || 'TEST_PING',
          providerMessageId: sendResult.providerMessageId || null,
          status: isSent ? 'SENT' : 'FAILED',
          sentAt: isSent ? new Date() : null,
          failedAt: isSent ? null : new Date(),
          failureReason,
        },
      });
    }

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: isSent ? 'TEST_WHATSAPP_SENT' : 'TEST_WHATSAPP_FAILED',
      entity: 'WhatsAppSettings',
      entityId: 'default',
      newValue: {
        recipient: sendResult.recipient || clean,
        status: isSent ? 'SENT' : 'FAILED',
        failureReason,
      },
      ipAddress,
    });

    if (isSent) {
      return {
        success: true,
        delivered: true,
        message: 'Test WhatsApp message sent successfully.',
      };
    } else {
      return {
        success: false,
        delivered: false,
        message: `Failed to send WhatsApp message: ${failureReason}`,
        error: failureReason || undefined,
      };
    }
  }

  /**
   * For backwards compatibility with existing callers
   */
  async sendPendingApprovalMessage(input: {
    customerId: string;
    customMessage?: string;
    actor: AuthenticatedUser;
    ipAddress?: string;
  }) {
    return this.sendMessage({
      customerId: input.customerId,
      message: input.customMessage,
      templateName: 'PENDING_APPROVAL',
      actor: input.actor,
      ipAddress: input.ipAddress,
    });
  }

  /**
   * Tests provider connection
   */
  async testConnection() {
    await this.refreshProviderConfig();
    return this.provider.testConnection();
  }

  /**
   * Retrieves WhatsApp communication history for a specific customer.
   */
  async getCustomerWhatsAppHistory(customerId: string) {
    const history = await prisma.whatsAppMessage.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        loan: {
          select: { applicationNumber: true },
        },
      },
    });

    const adminIds = history
      .map((h) => h.adminId)
      .filter((id): id is string => Boolean(id));

    const admins =
      adminIds.length > 0
        ? await prisma.adminUser.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, fullName: true, email: true },
          })
        : [];
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    return history.map((msg) => ({
      id: msg.id,
      customerId: msg.customerId,
      phone: msg.phone,
      applicationNumber: msg.loan?.applicationNumber || null,
      message: msg.message,
      templateName: msg.templateName,
      status: msg.status,
      providerMessageId: msg.providerMessageId,
      sentAt: msg.sentAt,
      failedAt: msg.failedAt,
      failureReason: msg.failureReason,
      createdAt: msg.createdAt,
      admin: msg.adminId ? adminMap.get(msg.adminId) || null : null,
    }));
  }
}

export const whatsappService = new WhatsAppService();


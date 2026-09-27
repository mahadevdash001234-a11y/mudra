import crypto from 'crypto';
import fs from 'fs';
import { prisma } from './db';
import { auditService } from './auditService';
import { pdfService } from './pdfService';
import { emailService } from './emailService';
import { whatsappService } from './whatsappService';
import { storageProvider } from '../providers/storage';
import { AppError } from '../middleware/errorHandler';
import { AuthenticatedUser } from '../middleware/authMiddleware';

export const ALLOWED_SPECIFIC_CHARGE_TYPES = [
  'Processing Fee',
  'GST',
  'Stamp Duty',
  'TDS Charges',
  'Insurance Fee',
  'Late Payment Fee',
  'Payment Fee',
  'Loan Document Upload Fee',
] as const;

export type SpecificChargeType = typeof ALLOWED_SPECIFIC_CHARGE_TYPES[number];

export interface CreateSpecificChargeInput {
  customerId: string;
  applicationId?: string; // Accepts applicationNumber or loanApplication.id
  loanId?: string;
  chargeType: string;
  amount: number;
  remark?: string;
  dueDate?: string | Date;
  forceDuplicate?: boolean;
}

export interface UpdateSpecificChargeInput {
  amount?: number;
  remark?: string;
  dueDate?: string | Date;
}

export interface SubmitChargeUtrInput {
  utr: string;
  paymentMethod?: string;
  notes?: string;
}

export class SpecificChargesService {
  /**
   * Helper: Resolves loan application and validates relationship with customer
   */
  private async resolveAndValidateApplication(customerId: string, applicationRef?: string, loanId?: string) {
    if (!customerId) {
      throw new AppError(400, 'Customer ID is required.', 'CUSTOMER_ID_REQUIRED');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        loans: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            applicationNumber: true,
            status: true,
            customerId: true,
            requestedAmount: true,
            approvedAmount: true,
          },
        },
      },
    });

    if (!customer) {
      throw new AppError(404, 'Customer record not found.', 'CUSTOMER_NOT_FOUND');
    }

    let loan = null;

    // 1. Try resolving by loanId directly
    if (loanId) {
      loan = await prisma.loanApplication.findFirst({
        where: { id: loanId },
        include: { customer: true },
      });
    }

    // 2. Try resolving by applicationRef (ID or applicationNumber), ignoring if applicationRef is accidentally the customer's ID
    if (!loan && applicationRef && applicationRef !== customerId) {
      loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [
            { id: applicationRef },
            { applicationNumber: applicationRef },
          ],
        },
        include: { customer: true },
      });
    }

    // 3. Fallback: If not found by loanId/applicationRef, check the customer's own loans
    if (!loan && customer.loans.length > 0) {
      loan = await prisma.loanApplication.findFirst({
        where: { id: customer.loans[0].id },
        include: { customer: true },
      });
    }

    // 4. If still no loan exists
    if (!loan) {
      throw new AppError(
        404,
        'No valid loan application was found for this customer.',
        'LOAN_APPLICATION_NOT_FOUND'
      );
    }

    // 5. Verify loan belongs to this customer
    if (loan.customerId !== customerId) {
      throw new AppError(
        400,
        'Security Error: The specified customer does not own this loan application. Cross-customer assignment is rejected.',
        'UNAUTHORIZED_LOAN_ASSIGNMENT'
      );
    }

    return loan;
  }

  /**
   * Helper: Validates charge type is one of the 7 allowed
   */
  private validateChargeType(chargeType: string): SpecificChargeType {
    const raw = chargeType.trim();
    // Normalize aliases for backward compatibility
    if (raw.toLowerCase() === 'tsd charges') return 'TDS Charges';
    if (raw.toLowerCase() === 'late pay fee') return 'Late Payment Fee';

    const matched = ALLOWED_SPECIFIC_CHARGE_TYPES.find(
      (t) => t.toLowerCase() === raw.toLowerCase()
    );
    if (!matched) {
      throw new AppError(
        400,
        `Invalid charge type "${chargeType}". Allowed types are: ${ALLOWED_SPECIFIC_CHARGE_TYPES.join(', ')}.`
      );
    }
    return matched;
  }

  /**
   * Checks if an active charge of the given type already exists for the loan
   */
  async checkDuplicateCharge(loanId: string, chargeType: string) {
    const existing = await prisma.charge.findFirst({
      where: {
        loanId,
        name: chargeType,
        status: { in: ['PENDING', 'PAID'] },
      },
    });
    return existing;
  }

  /**
   * Admin: Creates and sends a specific charge to a customer/application
   */
  async createSpecificCharge(
    input: CreateSpecificChargeInput,
    actor: AuthenticatedUser,
    ipAddress?: string
  ) {
    const { customerId, applicationId, loanId, chargeType, amount, remark, dueDate, forceDuplicate } = input;

    // 1. Validate amount
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new AppError(400, 'Charge amount must be a positive number greater than 0.');
    }

    // 2. Validate charge type
    const validChargeType = this.validateChargeType(chargeType);

    // 3. Validate customer and application relationship
    const loan = await this.resolveAndValidateApplication(customerId, applicationId, loanId);

    // 4. Duplicate Check
    const existingCharge = await this.checkDuplicateCharge(loan.id, validChargeType);
    if (existingCharge && !forceDuplicate) {
      throw new AppError(
        409,
        `A ${validChargeType} charge already exists for this application (Status: ${existingCharge.status}, Amount: ₹${existingCharge.amount}). Please confirm if you intentionally wish to create an additional charge.`,
        'DUPLICATE_CHARGE_WARNING'
      );
    }

    // 5. Parse optional dueDate
    let parsedDueDate: Date | null = null;
    if (dueDate) {
      const d = new Date(dueDate);
      if (!isNaN(d.getTime())) {
        parsedDueDate = d;
      }
    }

    // 6. Create Charge Record in Database
    const charge = await prisma.charge.create({
      data: {
        name: validChargeType,
        amount: parsedAmount,
        type: 'FIXED',
        isMandatory: true,
        isActive: true,
        taxPercent: 18.0,
        customerId: loan.customerId,
        loanId: loan.id,
        status: 'PENDING',
        remark: remark?.trim() || null,
        dueDate: parsedDueDate,
        createdBy: actor.fullName || 'Admin',
      },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true, accountNumber: true, status: true } },
      },
    });

    // 7. Create in-app notification for Customer
    await prisma.notification.create({
      data: {
        recipientType: 'CUSTOMER',
        customerId: loan.customerId,
        title: `Additional Payment Required: ${validChargeType}`,
        message: `An additional charge of ₹${parsedAmount.toLocaleString('en-IN')} for ${validChargeType} has been assigned to your loan application ${loan.applicationNumber}. Please review and pay to avoid processing delays.`,
        eventType: 'SPECIFIC_CHARGE_ISSUED',
      },
    });

    // 8. Immutable Audit Log (CHARGE_CREATED)
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGE_CREATED',
      entity: 'Charge',
      entityId: charge.id,
      newValue: {
        chargeId: charge.id,
        customerId: loan.customerId,
        customerName: loan.customer.fullName,
        loanId: loan.id,
        applicationNumber: loan.applicationNumber,
        chargeType: validChargeType,
        amount: parsedAmount,
        status: 'PENDING',
        remark: charge.remark,
        dueDate: charge.dueDate,
        createdBy: charge.createdBy,
      },
      ipAddress,
    });

    return charge;
  }

  /**
   * List all specific charges for a loan application
   */
  async listChargesForApplication(applicationRef: string) {
    const loan = await prisma.loanApplication.findFirst({
      where: {
        OR: [{ id: applicationRef }, { applicationNumber: applicationRef }],
      },
    });

    if (!loan) {
      throw new AppError(404, 'Loan application not found.');
    }

    const charges = await prisma.charge.findMany({
      where: { loanId: loan.id },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
      },
    });

    return charges;
  }

  /**
   * List all specific charges for a customer across all applications
   */
  async listChargesForCustomer(customerId: string) {
    const charges = await prisma.charge.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
      },
    });

    return charges;
  }

  /**
   * List only stage-appropriate active charges for a customer.
   * Enforces business state machine:
   * 1. If KYC is not APPROVED: returns ONLY active KYC Verification Charge (status PENDING/UNDER_VERIFICATION/PAID).
   * 2. If KYC is APPROVED but KYC charge not PAID: returns ONLY KYC charge.
   * 3. If KYC charge is PAID but loan documents (PAN, Bank Statement, Income Proof) not uploaded:
   *    returns ONLY the paid KYC charge. (DOES NOT expose Processing Fee yet!).
   * 4. If loan documents are completed: Processing Fee becomes active/visible.
   * 5. Other specific charges (GST, Stamp Duty, TDS, Insurance, Late Payment, Payment Fee):
   *    ONLY returned if specifically activated for that customer/application (sentAt !== null).
   */
  async listActiveChargesForCustomer(customerId: string, applicationId?: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return [];
    }

    const whereClause: any = { customerId, isActive: true };
    if (applicationId) {
      const loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [{ id: applicationId }, { applicationNumber: applicationId }],
        },
      });
      if (loan) {
        whereClause.loanId = loan.id;
      }
    }

    const allCharges = await prisma.charge.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
      },
    });

    const isKycApproved = customer.kycStatus === 'APPROVED' || customer.kycStatus === 'VERIFIED';
    const paidKycCharge = allCharges.find(
      (c) => (c.name.includes('KYC') || c.remark?.includes('KYC')) && c.status === 'PAID'
    );
    const utrKycCharge = allCharges.find(
      (c) => (c.name.includes('KYC') || c.remark?.includes('KYC')) && c.transactionRef && c.transactionRef.trim().length > 0
    );
    const kycCharge = paidKycCharge || utrKycCharge || allCharges.find(
      (c) => c.name.includes('KYC') || c.remark?.includes('KYC')
    );

    // STAGE 0 & 1: Before KYC verification is approved
    if (!isKycApproved) {
      // Check if customer has uploaded BOTH Aadhaar Front and Aadhaar Back
      const aadhaarDocs = await prisma.loanDocument.findMany({
        where: {
          customerId,
          documentType: { in: ['AADHAAR_FRONT', 'AADHAAR_BACK'] },
          isCurrentVersion: true,
          status: { notIn: ['REJECTED', 'REUPLOAD_REQUIRED'] },
        },
      });
      const hasAadhaarFront = aadhaarDocs.some((d) => d.documentType === 'AADHAAR_FRONT');
      const hasAadhaarBack = aadhaarDocs.some((d) => d.documentType === 'AADHAAR_BACK');
      const hasBothAadhaar = hasAadhaarFront && hasAadhaarBack;

      // STAGE 0: Before KYC documents are submitted -> NO payment is active / visible
      if (!hasBothAadhaar) {
        return [];
      }

      // STAGE 1: Both Aadhaar documents are submitted -> KYC Verification Charge is active
      if (!kycCharge) {
        const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
        const kycAmount = paymentConfig?.kycChargeAmount || 499;
        const latestLoan = await prisma.loanApplication.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });

        const createdKycCharge = await prisma.charge.create({
          data: {
            name: 'KYC Verification Charge',
            amount: kycAmount,
            type: 'FIXED',
            isMandatory: true,
            isActive: true,
            status: 'PENDING',
            customerId,
            loanId: latestLoan?.id || null,
            remark: 'Mandatory KYC Verification Fee',
            sentAt: new Date(),
          },
          include: {
            customer: { select: { id: true, fullName: true, mobile: true, email: true } },
            loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
          },
        });
        return [createdKycCharge];
      }

      // Synchronize pending unsubmitted KYC charge with latest paymentConfig
      if (kycCharge.status === 'PENDING' && !kycCharge.transactionRef && !kycCharge.paymentId) {
        const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
        if (paymentConfig && paymentConfig.kycChargeAmount && kycCharge.amount !== paymentConfig.kycChargeAmount) {
          const updatedKycCharge = await prisma.charge.update({
            where: { id: kycCharge.id },
            data: { amount: paymentConfig.kycChargeAmount },
            include: {
              customer: { select: { id: true, fullName: true, mobile: true, email: true } },
              loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
            },
          });
          return [updatedKycCharge];
        }
      }

      return [kycCharge];
    }

    // STAGE 2: KYC is Approved, but KYC Charge is not paid (edge case)
    const isKycChargePaid = Boolean(kycCharge && kycCharge.status === 'PAID');
    if (!isKycChargePaid) {
      return kycCharge ? [kycCharge] : [];
    }

    // STAGE 3: KYC is Approved and KYC Charge is PAID.
    // Check if loan application documents (PAN, Bank Statement, Income Proof) are completed:
    const requiredDocs = ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF'];
    const activeDocs = await prisma.loanDocument.findMany({
      where: {
        customerId,
        documentType: { in: requiredDocs },
        isCurrentVersion: true,
        status: { notIn: ['REJECTED', 'REUPLOAD_REQUIRED'] },
      },
    });
    const hasRequiredDocs = requiredDocs.every((t) => activeDocs.some((d) => d.documentType === t));

    if (!hasRequiredDocs) {
      // Loan documents NOT completed yet.
      // Customer sees ONLY the paid KYC charge (in Paid Payments).
      // DO NOT expose Processing Fee or future charges yet!
      return allCharges.filter((c) => c.name.includes('KYC') || c.remark?.includes('KYC'));
    }

    // STAGE 4: Loan documents completed.
    // Check if Admin has enabled 'Loan Document Upload Fee' (Before-Loan Fee)
    const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
    const isLoanDocFeeEnabled = Boolean((paymentConfig as any)?.loanDocFeeEnabled);
    const loanDocFeeAmount = (paymentConfig as any)?.loanDocFeeAmount || 999;

    let loanDocCharge = allCharges.find(
      (c) =>
        c.name.includes('Loan Document') ||
        c.name.includes('Document Upload Fee') ||
        c.remark?.includes('Loan Document')
    );

    if (isLoanDocFeeEnabled) {
      if (!loanDocCharge) {
        const latestLoan = await prisma.loanApplication.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });

        loanDocCharge = await prisma.charge.create({
          data: {
            name: 'Loan Document Upload Fee',
            amount: loanDocFeeAmount,
            type: 'FIXED',
            isMandatory: true,
            isActive: true,
            status: 'PENDING',
            customerId,
            loanId: latestLoan?.id || null,
            remark: 'Loan Document Processing Fee',
            sentAt: new Date(),
          },
          include: {
            customer: { select: { id: true, fullName: true, mobile: true, email: true } },
            loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
          },
        });
        allCharges.unshift(loanDocCharge);
      } else if (loanDocCharge.status === 'PENDING' && !loanDocCharge.transactionRef && !loanDocCharge.paymentId) {
        if (loanDocCharge.amount !== loanDocFeeAmount) {
          loanDocCharge = await prisma.charge.update({
            where: { id: loanDocCharge.id },
            data: { amount: loanDocFeeAmount },
            include: {
              customer: { select: { id: true, fullName: true, mobile: true, email: true } },
              loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
            },
          });
        }
      }
    }

    // Other specific charges (GST, Stamp Duty, TDS, Insurance, Processing Fee, etc.)
    // are ONLY visible if they are paid or have been explicitly sent/activated by admin (sentAt !== null)
    const filtered = allCharges.filter((c) => {
      if (c.name.includes('KYC')) return true;
      if (c.name.includes('Loan Document') || c.name.includes('Document Upload Fee')) {
        // Only return if enabled by Admin or already PAID
        return isLoanDocFeeEnabled || c.status === 'PAID';
      }
      if (c.name.includes('Processing')) return c.sentAt !== null && c.isActive;
      return (c.sentAt !== null && c.isActive) || c.status === 'PAID';
    });

    // Deduplicate charges by name, preserving PAID / latest valid charge
    const chargeMap = new Map<string, typeof filtered[0]>();
    for (const c of filtered) {
      const key = c.name.trim();
      const existing = chargeMap.get(key);
      if (!existing) {
        chargeMap.set(key, c);
      } else {
        if (existing.status !== 'PAID' && c.status === 'PAID') {
          chargeMap.set(key, c);
        } else if (existing.status !== 'PAID' && c.status === 'UNDER_VERIFICATION' && c.transactionRef) {
          chargeMap.set(key, c);
        }
      }
    }

    return Array.from(chargeMap.values());
  }

  /**
   * Get single charge by ID
   */
  async getChargeById(idOrChargeId: string) {
    let charge = await prisma.charge.findUnique({
      where: { id: idOrChargeId },
      include: {
        customer: true,
        loan: true,
      },
    });

    if (!charge) {
      // Look up by Invoice ID or Invoice Number if caller passed an invoice reference
      const invoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { id: idOrChargeId },
            { chargeId: idOrChargeId },
            { invoiceNumber: idOrChargeId },
          ],
        },
      });

      if (invoice?.chargeId) {
        charge = await prisma.charge.findUnique({
          where: { id: invoice.chargeId },
          include: {
            customer: true,
            loan: true,
          },
        });
      }
    }

    if (!charge) {
      charge = await prisma.charge.findFirst({
        where: {
          OR: [
            { paymentId: idOrChargeId },
            { transactionRef: idOrChargeId },
          ],
        },
        include: {
          customer: true,
          loan: true,
        },
      });
    }

    if (!charge) {
      throw new AppError(404, 'Specific charge record not found.');
    }

    return charge;
  }

  /**
   * Admin: Edit a specific charge (only if PENDING and payment not initiated)
   */
  async updateSpecificCharge(
    chargeId: string,
    input: UpdateSpecificChargeInput,
    actor: AuthenticatedUser,
    ipAddress?: string
  ) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status === 'PAID') {
      throw new AppError(400, 'Cannot edit a charge that has already been verified and marked as PAID.');
    }

    if (charge.status === 'CANCELLED') {
      throw new AppError(400, 'Cannot edit a cancelled charge.');
    }

    if (charge.transactionRef || charge.paymentId) {
      throw new AppError(400, 'Cannot edit this charge because a customer payment reference has already been submitted for verification.');
    }

    const updateData: Record<string, unknown> = {};
    if (input.amount !== undefined) {
      const amt = Number(input.amount);
      if (isNaN(amt) || amt <= 0) {
        throw new AppError(400, 'Charge amount must be greater than 0.');
      }
      updateData.amount = amt;
    }

    if (input.remark !== undefined) {
      updateData.remark = input.remark?.trim() || null;
    }

    if (input.dueDate !== undefined) {
      if (!input.dueDate) {
        updateData.dueDate = null;
      } else {
        const d = new Date(input.dueDate);
        if (!isNaN(d.getTime())) {
          updateData.dueDate = d;
        }
      }
    }

    const updated = await prisma.charge.update({
      where: { id: chargeId },
      data: updateData,
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true } },
      },
    });

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGE_UPDATED',
      entity: 'Charge',
      entityId: chargeId,
      previousValue: {
        amount: charge.amount,
        remark: charge.remark,
        dueDate: charge.dueDate,
      },
      newValue: updateData,
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin: Cancel a specific charge (only if PENDING and payment not initiated)
   */
  async cancelSpecificCharge(chargeId: string, actor: AuthenticatedUser, ipAddress?: string) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status === 'PAID') {
      throw new AppError(400, 'Cannot cancel a charge that has already been marked as PAID.');
    }

    if (charge.status === 'CANCELLED') {
      throw new AppError(400, 'Charge is already cancelled.');
    }

    if (charge.transactionRef || charge.paymentId) {
      throw new AppError(400, 'Cannot cancel this charge because a payment has already been submitted and is under verification.');
    }

    const updated = await prisma.charge.update({
      where: { id: chargeId },
      data: { status: 'CANCELLED' },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true } },
      },
    });

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'Specific Charge Cancelled',
      entity: 'Charge',
      entityId: chargeId,
      newValue: { status: 'CANCELLED', cancelledBy: actor.fullName },
      ipAddress,
    });

    return updated;
  }

  /**
   * Admin: Sends an individual specific charge to the customer
   * - Validates charge is PENDING
   * - Updates sentAt timestamp
   * - Creates in-app notification
   * - Attempts Email and WhatsApp if configured (reports _PROVIDER_NOT_CONFIGURED without faking success)
   * - Records CHARGE_SENT audit log
   * - Status remains PENDING (Send != Paid)
   */
  async sendCharge(chargeId: string, actor: AuthenticatedUser, ipAddress?: string) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status === 'PAID') {
      throw new AppError(400, 'Cannot send a charge that has already been marked as PAID.');
    }

    if (charge.status === 'CANCELLED') {
      throw new AppError(400, 'Cannot send a cancelled charge.');
    }

    const customer = charge.customer;
    if (!customer) {
      throw new AppError(400, 'Customer details not associated with this charge.');
    }

    const loanApp = charge.loan;
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    const companyName = branding?.companyName || 'Your Financial Services';
    const appRef = loanApp?.applicationNumber || charge.loanId || 'N/A';
    const dueDateStr = charge.dueDate ? new Date(charge.dueDate).toLocaleDateString('en-IN') : 'Immediate';

    const now = new Date();

    // 1. Update Charge record sentAt
    const updatedCharge = await prisma.charge.update({
      where: { id: chargeId },
      data: { sentAt: now },
      include: {
        customer: { select: { id: true, fullName: true, mobile: true, email: true } },
        loan: { select: { id: true, applicationNumber: true, accountNumber: true } },
      },
    });

    // 2. In-app Notification
    const notificationTitle = `Charge Notice: ${charge.name}`;
    const notificationMessage = `Your ${charge.name} of ₹${charge.amount.toLocaleString('en-IN')} has been generated for application ${appRef}. Due Date: ${dueDateStr}. Please open your ${companyName} account to make the payment.`;

    await prisma.notification.create({
      data: {
        recipientType: 'CUSTOMER',
        customerId: customer.id,
        title: notificationTitle,
        message: notificationMessage,
        eventType: 'CHARGE_SENT',
      },
    });

    // 3. Email dispatch (real provider only - do not fake success)
    let emailStatus = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    try {
      const emailSettings = await prisma.emailSettings.findUnique({ where: { id: 'default' } });
      const isEmailConfigured = Boolean(process.env.EMAIL_ENABLED === 'true' || (emailSettings?.smtpHost && emailSettings?.smtpUsername));
      if (isEmailConfigured) {
        const sendResult = await emailService.sendSingleEmail(
          {
            customerId: customer.id,
            loanId: loanApp?.id,
            subject: `Payment Notice: ${charge.name} for Application ${appRef}`,
            message: `Hello ${customer.fullName},\n\nA ${charge.name} of ₹${charge.amount.toLocaleString('en-IN')} has been added to your loan application ${appRef}.\n\nDue Date: ${dueDateStr}.\n\nPlease open your ${companyName} account to make the payment.\n\nThank you,\n${companyName}`,
          },
          actor,
          ipAddress
        );
        emailStatus = sendResult.status;
      }
    } catch {
      emailStatus = 'EMAIL_SEND_FAILED';
    }

    // 4. WhatsApp dispatch (real provider only - do not fake success)
    let whatsappStatus = 'WHATSAPP_PROVIDER_NOT_CONFIGURED';
    try {
      const waSettings = await prisma.whatsAppSettings.findUnique({ where: { id: 'default' } });
      const isWhatsAppConfigured = Boolean(process.env.WHATSAPP_ENABLED === 'true' || waSettings?.enabled);
      if (isWhatsAppConfigured) {
        const waMsg = `Hello ${customer.fullName},\n\nA ${charge.name} of ₹${charge.amount.toLocaleString('en-IN')} has been added to your loan application ${appRef}.\n\nDue Date: ${dueDateStr}.\n\nPlease open your ${companyName} account to make the payment.\n\nThank you,\n${companyName}`;
        const waResult = await whatsappService.sendMessage({
          customerId: customer.id,
          loanId: loanApp?.id,
          message: waMsg,
          actor,
          ipAddress,
        });
        whatsappStatus = (waResult as any)?.status || 'SENT';
      }
    } catch (err: any) {
      whatsappStatus = err.message?.includes('WHATSAPP_PROVIDER_NOT_CONFIGURED')
        ? 'WHATSAPP_PROVIDER_NOT_CONFIGURED'
        : 'WHATSAPP_SEND_FAILED';
    }

    // 5. Immutable Audit Log (CHARGE_SENT)
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGE_SENT',
      entity: 'Charge',
      entityId: charge.id,
      newValue: {
        chargeId: charge.id,
        customerId: customer.id,
        customerName: customer.fullName,
        applicationId: appRef,
        chargeType: charge.name,
        amount: charge.amount,
        dueDate: charge.dueDate,
        sentAt: now,
        emailStatus,
        whatsappStatus,
      },
      ipAddress,
    });

    return {
      success: true,
      message: `Charge "${charge.name}" sent to customer ${customer.fullName}.`,
      charge: updatedCharge,
      emailStatus,
      whatsappStatus,
    };
  }

  /**
   * Admin: Send ALL created charges for THIS customer
   * Prominent action: [ Send All Charges ]
   * - Does NOT broadcast to other customers
   * - Does NOT combine them into one fake record; keeps each charge independent
   * - Updates sentAt for each charge
   * - Creates summary customer notification
   * - Records CHARGES_SENT_TO_CUSTOMER audit log
   */
  async sendAllCharges(customerId: string, actor: AuthenticatedUser, ipAddress?: string, applicationId?: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        loans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!customer) {
      throw new AppError(404, 'Customer record not found.');
    }

    // Find all pending charges for this customer
    const whereClause: any = {
      customerId,
      status: 'PENDING',
    };
    if (applicationId) {
      const loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [{ id: applicationId }, { applicationNumber: applicationId }],
        },
      });
      if (loan) {
        whereClause.loanId = loan.id;
      }
    }

    const pendingCharges = await prisma.charge.findMany({
      where: whereClause,
      include: {
        loan: { select: { id: true, applicationNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingCharges.length === 0) {
      throw new AppError(400, 'No pending charges found to send for this customer.');
    }

    const now = new Date();
    const chargeIds = pendingCharges.map((c) => c.id);

    // Update sentAt on all pending charges
    await prisma.charge.updateMany({
      where: { id: { in: chargeIds } },
      data: { sentAt: now },
    });

    const totalAmount = pendingCharges.reduce((acc, c) => acc + c.amount, 0);
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    const companyName = branding?.companyName || 'Your Financial Services';
    const latestLoan = pendingCharges[0]?.loan || customer.loans[0];
    const appRef = latestLoan?.applicationNumber || 'N/A';

    const itemsText = pendingCharges
      .map((c) => `• ${c.name} — ₹${c.amount.toLocaleString('en-IN')}`)
      .join('\n');

    // 1. In-app Notification
    const notificationTitle = `${pendingCharges.length} Charges Issued: ₹${totalAmount.toLocaleString('en-IN')}`;
    const notificationMessage = `Hello ${customer.fullName},\n\nThe following charges have been added to your loan application ${appRef}:\n\n${itemsText}\n\nTotal: ₹${totalAmount.toLocaleString('en-IN')}\n\nPlease open your ${companyName} account to pay each charge.`;

    await prisma.notification.create({
      data: {
        recipientType: 'CUSTOMER',
        customerId: customer.id,
        title: notificationTitle,
        message: notificationMessage,
        eventType: 'CHARGES_SENT_TO_CUSTOMER',
      },
    });

    // 2. Email dispatch (real provider only)
    let emailStatus = 'EMAIL_PROVIDER_NOT_CONFIGURED';
    try {
      const emailSettings = await prisma.emailSettings.findUnique({ where: { id: 'default' } });
      const isEmailConfigured = Boolean(process.env.EMAIL_ENABLED === 'true' || (emailSettings?.smtpHost && emailSettings?.smtpUsername));
      if (isEmailConfigured) {
        const sendResult = await emailService.sendSingleEmail(
          {
            customerId: customer.id,
            loanId: latestLoan?.id,
            subject: `Charges Notice: ${pendingCharges.length} Charges Added for Application ${appRef}`,
            message: `Hello ${customer.fullName},\n\nThe following charges have been added to your loan application ${appRef}:\n\n${itemsText}\n\nTotal — ₹${totalAmount.toLocaleString('en-IN')}\n\nPlease open your ${companyName} account to make the payments.\n\nThank you,\n${companyName}`,
          },
          actor,
          ipAddress
        );
        emailStatus = sendResult.status;
      }
    } catch {
      emailStatus = 'EMAIL_SEND_FAILED';
    }

    // 3. WhatsApp dispatch (real provider only)
    let whatsappStatus = 'WHATSAPP_PROVIDER_NOT_CONFIGURED';
    try {
      const waSettings = await prisma.whatsAppSettings.findUnique({ where: { id: 'default' } });
      const isWhatsAppConfigured = Boolean(process.env.WHATSAPP_ENABLED === 'true' || waSettings?.enabled);
      if (isWhatsAppConfigured) {
        const waMsg = `Hello ${customer.fullName},\n\nThe following charges have been added to your loan application ${appRef}:\n\n${itemsText}\n\nTotal — ₹${totalAmount.toLocaleString('en-IN')}\n\nPlease open your ${companyName} account to make the payments.\n\nThank you,\n${companyName}`;
        const waResult = await whatsappService.sendMessage({
          customerId: customer.id,
          loanId: latestLoan?.id,
          message: waMsg,
          actor,
          ipAddress,
        });
        whatsappStatus = (waResult as any)?.status || 'SENT';
      }
    } catch (err: any) {
      whatsappStatus = err.message?.includes('WHATSAPP_PROVIDER_NOT_CONFIGURED')
        ? 'WHATSAPP_PROVIDER_NOT_CONFIGURED'
        : 'WHATSAPP_SEND_FAILED';
    }

    // 4. Immutable Audit Log (CHARGES_SENT_TO_CUSTOMER)
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGES_SENT_TO_CUSTOMER',
      entity: 'Customer',
      entityId: customer.id,
      newValue: {
        customerId: customer.id,
        customerName: customer.fullName,
        applicationId: appRef,
        chargesCount: pendingCharges.length,
        chargeIds,
        charges: pendingCharges.map((c) => ({ id: c.id, name: c.name, amount: c.amount })),
        totalAmount,
        sentAt: now,
        emailStatus,
        whatsappStatus,
      },
      ipAddress,
    });

    return {
      success: true,
      message: `Dispatched ${pendingCharges.length} charges totaling ₹${totalAmount.toLocaleString('en-IN')} to ${customer.fullName}.`,
      chargesCount: pendingCharges.length,
      totalAmount,
      chargeIds,
      emailStatus,
      whatsappStatus,
    };
  }

  /**
   * Admin: Send payment reminder to customer for pending charge
   */
  async sendReminder(chargeId: string, actor: AuthenticatedUser, ipAddress?: string) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status !== 'PENDING') {
      throw new AppError(400, `Cannot send reminder for a charge with status ${charge.status}.`);
    }

    if (!charge.customer) {
      throw new AppError(400, 'Customer details not associated with this charge.');
    }

    const customer = charge.customer;
    const loanApp = charge.loan;
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    const companyName = branding?.companyName || 'Your Financial Services';

    // 1. Send Email Notification
    const subject = `Payment Reminder: ${charge.name} Due for Application ${loanApp?.applicationNumber || ''}`;
    const body = `Dear ${customer.fullName},\n\nThis is a friendly reminder that an additional fee of ₹${charge.amount.toLocaleString('en-IN')} for "${charge.name}" is currently pending for your loan application ${loanApp?.applicationNumber || ''}.\n\n${charge.remark ? `Note: ${charge.remark}\n` : ''}${charge.dueDate ? `Due Date: ${new Date(charge.dueDate).toLocaleDateString('en-IN')}\n` : ''}\nPlease log in to your loan portal and complete the payment using your preferred payment method (UPI / Bank Transfer) to advance your application without delay.\n\nThank you,\n${companyName}`;

    let emailResult = { status: 'SENT', failureReason: undefined as string | undefined };
    try {
      await emailService.sendSingleEmail(
        {
          customerId: customer.id,
          loanId: loanApp?.id,
          subject,
          message: body,
        },
        actor,
        ipAddress
      );
    } catch (err: unknown) {
      emailResult = {
        status: 'FAILED',
        failureReason: err instanceof Error ? err.message : String(err),
      };
    }

    // 2. In-app Notification
    await prisma.notification.create({
      data: {
        recipientType: 'CUSTOMER',
        customerId: customer.id,
        title: `Payment Reminder: ${charge.name} (₹${charge.amount.toLocaleString('en-IN')})`,
        message: `Reminder: Please complete payment of ₹${charge.amount.toLocaleString('en-IN')} for ${charge.name} to avoid processing delays.`,
        eventType: 'SPECIFIC_CHARGE_REMINDER',
      },
    });

    // 3. Record Audit Log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'Reminder Sent',
      entity: 'Charge',
      entityId: chargeId,
      newValue: {
        chargeId,
        customerEmail: customer.email,
        customerMobile: customer.mobile,
        amount: charge.amount,
        chargeType: charge.name,
        emailStatus: emailResult.status,
      },
      ipAddress,
    });

    return {
      success: true,
      message: 'Payment reminder dispatched successfully to borrower.',
      emailStatus: emailResult.status,
    };
  }

  /**
   * Customer: Submits UTR for specific charge.
   * CRITICAL SECURITY: Amount is fetched authoritative from DB! Client amount is ignored.
   */
  async submitCustomerChargePayment(
    chargeId: string,
    customerId: string,
    input: SubmitChargeUtrInput,
    actor: AuthenticatedUser,
    ipAddress?: string
  ) {
    const charge = await this.getChargeById(chargeId);

    // Security: Validate customer ownership
    if (charge.customerId !== customerId) {
      throw new AppError(403, 'Access Denied: You do not own this charge record.');
    }

    if (charge.status === 'PAID') {
      throw new AppError(400, 'This charge has already been verified and paid.');
    }

    if (charge.status === 'CANCELLED') {
      throw new AppError(400, 'This charge has been cancelled by administration.');
    }

    const isKycFee = charge.name.toUpperCase().includes('KYC') || charge.remark?.toUpperCase().includes('KYC');
    if (!charge.isActive || (!charge.sentAt && !isKycFee)) {
      throw new AppError(400, 'This charge is not currently active for payment.', 'CHARGE_NOT_AVAILABLE');
    }

    if (isKycFee) {
      const aadhaarDocs = await prisma.loanDocument.findMany({
        where: {
          customerId,
          documentType: { in: ['AADHAAR_FRONT', 'AADHAAR_BACK'] },
          isCurrentVersion: true,
          status: { notIn: ['REJECTED', 'REUPLOAD_REQUIRED'] },
        },
      });
      const hasAadhaarFront = aadhaarDocs.some((d) => d.documentType === 'AADHAAR_FRONT');
      const hasAadhaarBack = aadhaarDocs.some((d) => d.documentType === 'AADHAAR_BACK');
      if (!hasAadhaarFront || !hasAadhaarBack) {
        throw new AppError(
          400,
          'Upload both Aadhaar Front and Back documents before paying the KYC Verification Fee.',
          'CHARGE_NOT_AVAILABLE'
        );
      }
    } else {
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      const isKycApproved = customer?.kycStatus === 'APPROVED' || customer?.kycStatus === 'VERIFIED';
      if (!isKycApproved) {
        throw new AppError(
          403,
          'Complete KYC verification and approval before paying subsequent charges.',
          'CHARGE_NOT_AVAILABLE'
        );
      }

      if (charge.name.toUpperCase().includes('PROCESSING')) {
        const requiredDocs = ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF'];
        const activeDocs = await prisma.loanDocument.findMany({
          where: {
            customerId,
            documentType: { in: requiredDocs },
            isCurrentVersion: true,
            status: { notIn: ['REJECTED', 'REUPLOAD_REQUIRED'] },
          },
        });
        const hasRequiredDocs = requiredDocs.every((t) => activeDocs.some((d) => d.documentType === t));
        if (!hasRequiredDocs) {
          throw new AppError(
            403,
            'Upload all mandatory loan documents (PAN, Bank Statement, Income Proof) before paying Processing Fee.',
            'CHARGE_NOT_AVAILABLE'
          );
        }
      }
    }

    const cleanUtr = input.utr.trim().toUpperCase();
    if (!cleanUtr || cleanUtr.length < 4) {
      throw new AppError(400, 'Please enter a valid transaction reference / UTR number.');
    }

    // Check duplicate UTR globally
    const existingUtr = await prisma.payment.findFirst({
      where: {
        transactionRef: cleanUtr,
        status: { in: ['PAID', 'SUCCESS', 'UNDER_VERIFICATION'] },
      },
    });

    if (existingUtr && existingUtr.id !== charge.paymentId) {
      throw new AppError(400, 'Duplicate UTR: This transaction reference has already been submitted for another payment.', 'DUPLICATE_UTR');
    }

    // Authoritative Amount from database
    const authoritativeAmount = charge.amount;
    const paymentMethod = input.paymentMethod || 'UPI';
    const receiptNum = `REC-CHG-${Date.now().toString().slice(-6)}`;
    const isKycCharge = charge.name?.toUpperCase().includes('KYC') || charge.remark?.toUpperCase().includes('KYC');
    const isGstCharge = charge.name?.toUpperCase().includes('GST') || charge.remark?.toUpperCase().includes('GST');
    const effectivePaymentType = isKycCharge ? 'KYC_CHARGES' : isGstCharge ? 'GST_CHARGES' : 'PROCESSING_FEE';

    // Create or update Payment record
    let payment;
    if (charge.paymentId) {
      payment = await prisma.payment.update({
        where: { id: charge.paymentId },
        data: {
          transactionRef: cleanUtr,
          paymentMethod,
          paymentType: effectivePaymentType,
          status: 'UNDER_VERIFICATION',
          notes: `Specific Charge: ${charge.name} (${charge.id}) - ${input.notes || ''}`,
          amount: authoritativeAmount,
          paymentDate: new Date(),
        },
      });
    } else {
      let targetLoanId = charge.loanId;
      if (!targetLoanId) {
        let latestLoan = await prisma.loanApplication.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });
        if (!latestLoan) {
          latestLoan = await prisma.loanApplication.create({
            data: {
              customerId,
              applicationNumber: `LA-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
              loanType: 'PERSONAL',
              requestedAmount: 100000,
              tenureMonths: 12,
              purpose: 'Application Processing',
              status: 'DRAFT',
            },
          });
        }
        targetLoanId = latestLoan.id;
        await prisma.charge.update({
          where: { id: charge.id },
          data: { loanId: targetLoanId },
        });
      }

      payment = await prisma.payment.create({
        data: {
          loanId: targetLoanId,
          customerId,
          amount: authoritativeAmount,
          paymentMethod,
          paymentType: effectivePaymentType,
          transactionRef: cleanUtr,
          receiptNumber: receiptNum,
          status: 'UNDER_VERIFICATION',
          notes: `Specific Charge: ${charge.name} (${charge.id}) - ${input.notes || ''}`,
          chargeId: charge.id,
        },
      });
    }

    // Link payment with Charge record and set status to UNDER_VERIFICATION
    const updatedCharge = await prisma.charge.update({
      where: { id: chargeId },
      data: {
        paymentId: payment.id,
        transactionRef: cleanUtr,
        status: 'UNDER_VERIFICATION',
      },
    });

    // Update Loan paymentStatus if linked to a loan application
    if (updatedCharge.loanId) {
      await prisma.loanApplication.update({
        where: { id: updatedCharge.loanId },
        data: { paymentStatus: 'UNDER_VERIFICATION' },
      });
    }

    // If this is a KYC charge and customer's kycStatus is PENDING, transition to UNDER_REVIEW
    const custRecord = await prisma.customer.findUnique({ where: { id: customerId } });
    if (isKycCharge && custRecord && custRecord.kycStatus === 'PENDING') {
      await prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'UNDER_REVIEW' },
      });
    }

    // Notify Admin
    await prisma.notification.create({
      data: {
        recipientType: 'ADMIN',
        title: `Specific Charge Payment Submitted: ${charge.name}`,
        message: `Customer ${charge.customer?.fullName || 'Customer'} submitted UTR ${cleanUtr} for ₹${authoritativeAmount} (${charge.name}). Verification required.`,
        eventType: 'PAYMENT_SUBMITTED',
      },
    });

    // Record Audit Log
    await auditService.record({
      actorType: 'CUSTOMER',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'Specific Charge Payment Initiated',
      entity: 'Charge',
      entityId: chargeId,
      newValue: {
        chargeId,
        paymentId: payment.id,
        amount: authoritativeAmount,
        utr: cleanUtr,
        chargeType: charge.name,
        status: 'UNDER_VERIFICATION',
      },
      ipAddress,
    });

    return {
      charge: updatedCharge,
      payment,
    };
  }

  /**
   * Admin: Verifies payment for a specific charge.
   * Sets Charge.status = 'PAID', updates Payment to 'PAID', and automatically generates & persists individual Invoice.
   * Enforces 1 Charge = 1 Invoice idempotency. Payment verification NEVER approves the loan.
   */
  async verifySpecificChargePayment(chargeId: string, actor: AuthenticatedUser, ipAddress?: string) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status === 'PAID') {
      // Check if invoice already exists (Idempotency)
      const existingInvoice = await prisma.invoice.findUnique({
        where: { chargeId },
      });
      if (existingInvoice) {
        return charge;
      }
    }

    if (!charge.transactionRef && !charge.paymentId) {
      throw new AppError(400, 'Cannot verify charge: No payment transaction reference / UTR has been submitted by customer.');
    }

    const now = new Date();

    // 1. Update Payment record if linked
    if (charge.paymentId) {
      await prisma.payment.update({
        where: { id: charge.paymentId },
        data: {
          status: 'PAID',
          verifiedBy: actor.fullName,
          verifiedAt: now,
        },
      });
    }

    // 2. Update Charge record
    const updatedCharge = await prisma.charge.update({
      where: { id: charge.id },
      data: {
        status: 'PAID',
        paidAt: now,
      },
      include: {
        customer: true,
        loan: true,
      },
    });

    const customer = updatedCharge.customer;
    const loanApp = updatedCharge.loan;
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

    // 3. Generate & Persist Individual Charge Invoice automatically (1 Charge = 1 Invoice)
    let invoiceRecord = null;
    let invoicePdfBuffer: Buffer | null = null;
    const invoiceNum = `INV-${now.getFullYear()}-${charge.id.slice(-6).toUpperCase()}`;

    try {
      invoicePdfBuffer = await pdfService.generateInvoicePdf({
        invoiceNumber: invoiceNum,
        invoiceDate: now,
        customerName: customer?.fullName || 'Valued Customer',
        customerMobile: customer?.mobile || undefined,
        customerEmail: customer?.email || undefined,
        customerAddress: customer ? `${customer.address}, ${customer.city}, ${customer.state}` : undefined,
        applicationNumber: loanApp?.applicationNumber || 'N/A',
        loanAccountNumber: loanApp?.accountNumber || loanApp?.applicationNumber || 'N/A',
        chargeId: charge.id,
        recordId: charge.id.slice(-6).toUpperCase(),
        chargeType: charge.name,
        chargeDescription: charge.remark || `${charge.name} for Loan Application ${loanApp?.applicationNumber || ''}`,
        amount: charge.amount,
        taxAmount: Math.round(charge.amount * 0.18),
        totalAmount: Math.round(charge.amount * 1.18),
        paymentMethod: 'UPI / Verified Transfer',
        paymentDate: now,
        paymentStatus: 'PAID',
        transactionRef: charge.transactionRef || 'VERIFIED',
        remark: charge.remark || `Standard ${charge.name} for loan file clearance and verification.`,
        companyName: branding?.companyName || 'Loan Approve Financial Services',
        companyLegalName: branding?.companyLegalName || 'Loan Approve Financial Services Pvt. Ltd.',
        companyAddress: branding?.address || 'Nariman Point, Mumbai, Maharashtra 400021',
        companyEmail: branding?.email || 'billing@loanapprove.com',
        companyPhone: branding?.phone || '+91 8042054797',
        companyWebsite: branding?.website || 'https://loanapprove.com',
        authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Officer',
        authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Authorized Signatory',
        logoUrl: branding?.logoUrl,
        watermarkLogoUrl: branding?.watermarkLogoUrl,
        invoiceWatermarkEnabled: branding?.invoiceWatermarkEnabled,
        watermarkOpacity: branding?.watermarkOpacity,
        watermarkSize: branding?.watermarkSize,
        watermarkPosition: branding?.watermarkPosition,
        generatedDate: now,
      });

      const uniqueFileId = crypto.randomUUID();
      const storageKey = `invoices/${charge.customerId}/${charge.id}-${invoiceNum}.pdf`;
      const storageResult = await storageProvider.saveFile(
        storageKey,
        invoicePdfBuffer,
        'application/pdf'
      );

      // Create or update Invoice model record (Unique chargeId ensures 1:1 idempotency)
      const effectiveLoanId = charge.loanId || loanApp?.id || null;
      invoiceRecord = await prisma.invoice.upsert({
        where: { chargeId: charge.id },
        create: {
          invoiceNumber: invoiceNum,
          customerId: charge.customerId || customer?.id || '',
          loanId: effectiveLoanId,
          chargeId: charge.id,
          paymentId: charge.paymentId,
          chargeName: charge.name,
          amount: charge.amount,
          taxAmount: Math.round(charge.amount * 0.18),
          totalAmount: Math.round(charge.amount * 1.18),
          currency: 'INR',
          status: 'PAID',
          storageKey: storageResult.storageKey,
          filePath: storageResult.filePath,
          fileUrl: `/api/customer/documents/${uniqueFileId}/file`,
          templateVersion: 'v1.0',
          brandingVersion: 'v1.0',
          issuedAt: now,
        },
        update: {
          storageKey: storageResult.storageKey,
          filePath: storageResult.filePath,
          status: 'PAID',
        },
      });

      // Register in LoanDocument for Customer Document Center integration
      await prisma.loanDocument.create({
        data: {
          id: uniqueFileId,
          customerId: charge.customerId || customer?.id || '',
          loanId: charge.loanId,
          documentType: 'INVOICE',
          fileName: `Invoice_${charge.name.replace(/\s+/g, '_')}_${invoiceNum}.pdf`,
          originalFileName: `Invoice_${charge.name.replace(/\s+/g, '_')}_${invoiceNum}.pdf`,
          storageKey: storageResult.storageKey,
          filePath: storageResult.filePath,
          fileUrl: `/api/customer/documents/${uniqueFileId}/file`,
          mimeType: 'application/pdf',
          fileSize: storageResult.fileSize,
          status: 'APPROVED',
          version: 1,
          isCurrentVersion: true,
          reviewedBy: actor.fullName,
          reviewedAt: now,
        },
      });
    } catch (invErr) {
      console.error('[InvoiceGeneration] Failed to generate/persist charge invoice:', invErr);
    }

    // 4. Notify Customer: PAYMENT_VERIFIED & INVOICE_AVAILABLE
    if (charge.customerId) {
      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId: charge.customerId,
          title: `Payment Verified: ${charge.name}`,
          message: `Your payment of ₹${charge.amount.toLocaleString('en-IN')} for ${charge.name} has been verified. Official invoice #${invoiceNum} is now available in your portal.`,
          eventType: 'PAYMENT_VERIFIED',
        },
      });

      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId: charge.customerId,
          title: 'Invoice Available for Download',
          message: `Your official Tax Invoice for ${charge.name} (${invoiceNum}) is now available in your Document Center.`,
          eventType: 'INVOICE_AVAILABLE',
        },
      });
    }

    // 5. Audit Log (CHARGE_PAYMENT_VERIFIED & INVOICE_GENERATED)
    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGE_PAYMENT_VERIFIED',
      entity: 'Charge',
      entityId: chargeId,
      newValue: {
        chargeId,
        chargeType: charge.name,
        amount: charge.amount,
        status: 'PAID',
        utr: charge.transactionRef,
        invoiceNumber: invoiceNum,
        invoiceId: invoiceRecord?.id,
        verifiedBy: actor.fullName,
        verifiedAt: now,
      },
      ipAddress,
    });

    // 6. Automated Email & WhatsApp communication
    try {
      const commSettings = await prisma.communicationSettings.findUnique({ where: { id: 'default' } });
      const companyName = branding?.companyName || 'Your Financial Services';

      if (commSettings?.autoEmailOnPaymentVerified && customer?.id) {
        await emailService.sendSingleEmail(
          {
            customerId: customer.id,
            loanId: loanApp?.id,
            subject: `Payment Verified & Official Invoice Generated — ${invoiceNum}`,
            message: `Dear ${customer.fullName},\n\nYour payment of ₹${charge.amount.toLocaleString('en-IN')} for ${charge.name} (UTR: ${charge.transactionRef || 'N/A'}) has been successfully verified.\n\nPlease find your official Tax Invoice attached.\n\nWarm regards,\n${companyName}`,
            templateName: 'PAYMENT_VERIFIED',
            attachments: invoicePdfBuffer
              ? [{ filename: `Invoice_${invoiceNum}.pdf`, content: invoicePdfBuffer }]
              : undefined,
          },
          actor,
          ipAddress
        );
      }

      if (commSettings?.autoWhatsAppOnPaymentVerified && customer?.id) {
        await whatsappService.sendMessage({
          customerId: customer.id,
          loanId: loanApp?.id,
          message: `Hello ${customer.fullName}, your payment of ₹${charge.amount.toLocaleString('en-IN')} for ${charge.name} has been verified! Invoice #${invoiceNum} is ready for download in your portal.\n\nRegards,\n${companyName}`,
          templateName: 'PAYMENT_VERIFIED',
          actor,
          ipAddress,
        });
      }
    } catch {
      // Non-critical communication error ignored
    }

    return updatedCharge;
  }

  /**
   * Generates or retrieves immutable Invoice PDF for verified (PAID) specific charge
   */
  async generateSpecificChargeInvoicePdf(
    chargeId: string,
    actor: AuthenticatedUser,
    download = false,
    ipAddress?: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const charge = await this.getChargeById(chargeId);

    // Access control: if actor is CUSTOMER, must be owner
    if (actor.role === 'CUSTOMER' && charge.customerId !== actor.id) {
      throw new AppError(403, 'Access denied: You do not have permission to access invoices for this charge.');
    }

    if (charge.status !== 'PAID') {
      throw new AppError(
        400,
        'Invoice is available only after payment has been verified and marked as PAID.'
      );
    }

    // Check if an authoritative persisted Invoice record already exists (Immutability guarantee)
    const existingInvoice = await prisma.invoice.findUnique({
      where: { chargeId },
    });

    let pdfBuffer: Buffer | null = null;
    let invoiceNum = existingInvoice?.invoiceNumber || `INV-${new Date().getFullYear()}-${charge.id.slice(-6).toUpperCase()}`;

    if (existingInvoice && existingInvoice.filePath && fs.existsSync(existingInvoice.filePath)) {
      pdfBuffer = fs.readFileSync(existingInvoice.filePath);
    } else {
      // Generate on-the-fly if file was not previously saved
      const customer = charge.customer;
      const loanApp = charge.loan;
      const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

      const customerName = customer?.fullName || 'Customer';
      const customerMobile = customer?.mobile || '';
      const customerEmail = customer?.email || '';
      const customerAddress = customer ? `${customer.address}, ${customer.city}, ${customer.state}` : '';
      const applicationNumber = loanApp?.applicationNumber || 'N/A';
      const loanAccountNumber = loanApp?.accountNumber || loanApp?.applicationNumber || 'N/A';
      const chargeType = charge.name;
      const chargeDesc = charge.remark || `${charge.name} for Loan Application ${applicationNumber}`;
      const amount = charge.amount;
      const paymentDate = charge.paidAt || charge.updatedAt || new Date();
      const transactionRef = charge.transactionRef || 'VERIFIED';

      pdfBuffer = await pdfService.generateInvoicePdf({
        invoiceNumber: invoiceNum,
        invoiceDate: paymentDate,
        customerName,
        customerMobile,
        customerEmail,
        customerAddress,
        applicationNumber,
        loanAccountNumber,
        chargeId: charge.id,
        recordId: charge.id.slice(-6).toUpperCase(),
        chargeType,
        chargeDescription: chargeDesc,
        amount,
        taxAmount: Math.round(amount * 0.18),
        totalAmount: Math.round(amount * 1.18),
        paymentMethod: 'UPI / Verified Transfer',
        paymentDate,
        paymentStatus: 'PAID',
        transactionRef,
        remark: chargeDesc,
        companyName: branding?.companyName || 'Loan Approve Financial Services',
        companyLegalName: branding?.companyLegalName || 'Loan Approve Financial Services Pvt. Ltd.',
        companyAddress: branding?.address || 'Nariman Point, Mumbai, Maharashtra 400021',
        companyEmail: branding?.email || 'billing@loanapprove.com',
        companyPhone: branding?.phone || '+91 8042054797',
        companyWebsite: branding?.website || 'https://loanapprove.com',
        authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Officer',
        authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Authorized Signatory',
        logoUrl: branding?.logoUrl,
        watermarkLogoUrl: branding?.watermarkLogoUrl,
        invoiceWatermarkEnabled: branding?.invoiceWatermarkEnabled,
        watermarkOpacity: branding?.watermarkOpacity,
        watermarkSize: branding?.watermarkSize,
        watermarkPosition: branding?.watermarkPosition,
        generatedDate: new Date(),
      });

      // Save to storage for subsequent requests
      try {
        const storageKey = `invoices/${charge.customerId}/${charge.id}-${invoiceNum}.pdf`;
        const storageResult = await storageProvider.saveFile(storageKey, pdfBuffer, 'application/pdf');
        await prisma.invoice.upsert({
          where: { chargeId: charge.id },
          create: {
            invoiceNumber: invoiceNum,
            customerId: charge.customerId || customer?.id || '',
            loanId: charge.loanId || loanApp?.id || '',
            chargeId: charge.id,
            paymentId: charge.paymentId,
            chargeName: charge.name,
            amount: charge.amount,
            taxAmount: Math.round(charge.amount * 0.18),
            totalAmount: Math.round(charge.amount * 1.18),
            currency: 'INR',
            status: 'PAID',
            storageKey: storageResult.storageKey,
            filePath: storageResult.filePath,
            fileUrl: `/api/customer/documents/${crypto.randomUUID()}/file`,
            templateVersion: 'v1.0',
            brandingVersion: 'v1.0',
            issuedAt: paymentDate,
          },
          update: {
            storageKey: storageResult.storageKey,
            filePath: storageResult.filePath,
          },
        });
      } catch (err) {
        console.error('[InvoiceSaveFallback] Failed to save fallback invoice:', err);
      }
    }

    // Record Audit Log
    await auditService.record({
      actorType: actor.role === 'ADMIN' ? 'ADMIN' : 'CUSTOMER',
      actorId: actor.id,
      actorName: actor.fullName,
      action: download ? 'Invoice Downloaded' : 'Invoice Generated',
      entity: 'Charge',
      entityId: chargeId,
      newValue: {
        invoiceNumber: invoiceNum,
        chargeType: charge.name,
        amount: charge.amount,
        customerName: charge.customer?.fullName,
        download,
      },
      ipAddress,
    });

    return {
      buffer: pdfBuffer,
      filename: `Invoice_${invoiceNum}.pdf`,
    };
  }

  /**
   * Safely delete a single charge if not paid and no verified payment exists.
   */
  async deleteCharge(chargeId: string, actor: AuthenticatedUser, ipAddress?: string) {
    const charge = await this.getChargeById(chargeId);

    if (charge.status === 'PAID') {
      throw new AppError(400, 'Cannot permanently delete a charge marked as PAID.');
    }

    if (charge.paymentId) {
      const linkedPayment = await prisma.payment.findUnique({ where: { id: charge.paymentId } });
      if (linkedPayment && (linkedPayment.status === 'PAID' || linkedPayment.status === 'VERIFIED')) {
        throw new AppError(400, 'Cannot delete charge linked to a verified payment.');
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.invoice.deleteMany({ where: { chargeId } });
      if (charge.paymentId) {
        await tx.payment.deleteMany({ where: { id: charge.paymentId } });
      }
      await tx.charge.delete({ where: { id: chargeId } });
    });

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'CHARGE_DELETED',
      entity: 'Charge',
      entityId: chargeId,
      newValue: { chargeId, name: charge.name, amount: charge.amount },
      ipAddress,
    });

    return { success: true };
  }

  /**
   * Bulk cancel charges.
   */
  async bulkCancelCharges(chargeIds: string[], actor: AuthenticatedUser, ipAddress?: string) {
    if (!chargeIds || chargeIds.length === 0) throw new AppError(400, 'No charge IDs specified');

    let cancelledCount = 0;
    for (const id of chargeIds) {
      try {
        await this.cancelSpecificCharge(id, actor, ipAddress);
        cancelledCount++;
      } catch {
        // Skip if already paid/cancelled
      }
    }

    return { cancelledCount, total: chargeIds.length };
  }

  /**
   * Bulk delete charges (FK Protected).
   */
  async bulkDeleteCharges(chargeIds: string[], actor: AuthenticatedUser, ipAddress?: string) {
    if (!chargeIds || chargeIds.length === 0) throw new AppError(400, 'No charge IDs specified');

    let deletedCount = 0;
    let cancelledCount = 0;

    for (const id of chargeIds) {
      try {
        await this.deleteCharge(id, actor, ipAddress);
        deletedCount++;
      } catch {
        try {
          await this.cancelSpecificCharge(id, actor, ipAddress);
          cancelledCount++;
        } catch {
          // Skip if paid
        }
      }
    }

    return { deletedCount, cancelledCount, total: chargeIds.length };
  }
}

export const specificChargesService = new SpecificChargesService();


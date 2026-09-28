import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db';
import { auditService } from '../services/auditService';
import { pdfService } from '../services/pdfService';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';

export class ChargesController {
  /**
   * GET /api/admin/charges/config
   * Returns current configurable fee parameters: Interest Rate, KYC Charges, Processing Fee.
   */
  async getConfig(req: Request, res: Response, next: NextFunction) {
    try {
      let config = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
      if (!config) {
        config = await prisma.paymentConfig.create({
          data: {
            id: 'default',
            defaultInterestRate: 12.0,
            kycChargeAmount: 499,
            processingFeeAmount: 1999,
          },
        });
      }

      res.json({
        success: true,
        data: {
          interestRate: config.defaultInterestRate ?? 12.0,
          interestFrequency: 'Per Annum',
          kycCharges: config.kycChargeAmount ?? 499,
          processingFee: config.processingFeeAmount ?? 1999,
          loanDocFeeEnabled: (config as any).loanDocFeeEnabled ?? false,
          loanDocFeeAmount: (config as any).loanDocFeeAmount ?? 999,
          updatedAt: config.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/charges/config
   * Updates fee configurations with full audit logging.
   */
  async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const {
        chargeType,
        amount,
        value,
        interestRate,
        kycCharges,
        kycChargeAmount,
        processingFee,
        processingFeeAmount,
        loanDocFeeEnabled,
        loanDocFeeAmount,
        enabled,
      } = req.body;
      const rawVal = amount !== undefined ? amount : value;
      const actor = req.user || { id: 'admin-system', fullName: 'System Admin' };
      const ipAddress = req.ip || req.socket.remoteAddress;

      let config = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
      if (!config) {
        config = await prisma.paymentConfig.create({ data: { id: 'default' } });
      }

      const previous = {
        defaultInterestRate: config.defaultInterestRate,
        kycChargeAmount: config.kycChargeAmount,
        processingFeeAmount: config.processingFeeAmount,
        loanDocFeeEnabled: (config as any).loanDocFeeEnabled,
        loanDocFeeAmount: (config as any).loanDocFeeAmount,
      };

      const updateData: Record<string, any> = {};
      let auditAction = 'CHARGE_CONFIG_UPDATED';
      let auditNewValue: Record<string, unknown> = {};

      // Determine charge update type
      const targetType = (chargeType || '').toUpperCase();

      if (targetType === 'INTEREST_RATE' || interestRate !== undefined) {
        const rate = parseFloat(rawVal ?? interestRate);
        if (isNaN(rate) || rate <= 0 || rate > 100) {
          return res.status(400).json({ success: false, message: 'Interest rate must be a valid percentage between 0 and 100.' });
        }
        updateData.defaultInterestRate = rate;
        auditAction = 'Interest Rate Updated';
        auditNewValue = { defaultInterestRate: rate, frequency: 'Per Annum' };
      } else if (targetType === 'KYC_CHARGES' || kycCharges !== undefined || kycChargeAmount !== undefined) {
        const kycAmount = parseFloat(rawVal ?? kycCharges ?? kycChargeAmount);
        if (isNaN(kycAmount) || kycAmount < 0) {
          return res.status(400).json({ success: false, message: 'KYC charge amount must be a positive number.' });
        }
        updateData.kycChargeAmount = kycAmount;
        auditAction = 'KYC Charge Updated';
        auditNewValue = { kycChargeAmount: kycAmount };
      } else if (targetType === 'PROCESSING_FEE' || processingFee !== undefined || processingFeeAmount !== undefined) {
        const procAmount = parseFloat(rawVal ?? processingFee ?? processingFeeAmount);
        if (isNaN(procAmount) || procAmount < 0) {
          return res.status(400).json({ success: false, message: 'Processing fee amount must be a positive number.' });
        }
        updateData.processingFeeAmount = procAmount;
        auditAction = 'Processing Fee Updated';
        auditNewValue = { processingFeeAmount: procAmount };
      } else if (
        targetType === 'LOAN_DOC_FEE' ||
        targetType === 'LOAN_DOCUMENT_UPLOAD_FEE' ||
        loanDocFeeEnabled !== undefined ||
        loanDocFeeAmount !== undefined ||
        targetType === 'BEFORE_LOAN_FEE'
      ) {
        const isEnabled = loanDocFeeEnabled !== undefined ? Boolean(loanDocFeeEnabled) : (enabled !== undefined ? Boolean(enabled) : (config as any).loanDocFeeEnabled);
        const feeAmount = loanDocFeeAmount !== undefined ? parseFloat(loanDocFeeAmount) : (rawVal !== undefined ? parseFloat(rawVal) : ((config as any).loanDocFeeAmount ?? 999));
        
        updateData.loanDocFeeEnabled = isEnabled;
        if (!isNaN(feeAmount) && feeAmount >= 0) {
          updateData.loanDocFeeAmount = feeAmount;
        }
        auditAction = 'Loan Document Upload Fee Updated';
        auditNewValue = { loanDocFeeEnabled: isEnabled, loanDocFeeAmount: feeAmount };
      } else {
        return res.status(400).json({ success: false, message: 'Invalid chargeType or missing charge value.' });
      }

      const updated = await prisma.paymentConfig.update({
        where: { id: 'default' },
        data: updateData,
      });

      // Synchronize existing pending unsubmitted KYC charges across customers
      if (updateData.kycChargeAmount !== undefined) {
        await prisma.charge.updateMany({
          where: {
            OR: [
              { name: { contains: 'KYC' } },
              { remark: { contains: 'KYC' } },
            ],
            status: 'PENDING',
            transactionRef: null,
            paymentId: null,
          },
          data: {
            amount: updateData.kycChargeAmount,
          },
        });
      }

      // Record immutable audit event
      await auditService.record({
        actorType: 'ADMIN',
        actorId: actor.id,
        actorName: actor.fullName,
        action: auditAction,
        entity: 'PaymentConfig',
        entityId: 'default',
        previousValue: previous,
        newValue: auditNewValue,
        ipAddress,
      });

      res.json({
        success: true,
        message: `${auditAction} successfully`,
        data: {
          interestRate: updated.defaultInterestRate,
          interestFrequency: 'Per Annum',
          kycCharges: updated.kycChargeAmount,
          processingFee: updated.processingFeeAmount,
          updatedAt: updated.updatedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/charges/records
   * Returns list of KYC Charges and Processing Fee payment records with payment status.
   */
  async listFeeRecords(req: Request, res: Response, next: NextFunction) {
    try {
      const payments = await prisma.payment.findMany({
        where: {
          paymentType: { in: ['PROCESSING_FEE', 'KYC_CHARGES'] },
        },
        orderBy: { paymentDate: 'desc' },
        include: {
          customer: {
            select: { id: true, fullName: true, mobile: true, email: true },
          },
          loan: {
            select: { id: true, applicationNumber: true, loanType: true, status: true },
          },
        },
        take: 50,
      });

      const records = payments.map((p) => {
        const isPaid = p.status === 'PAID' || p.status === 'SUCCESS';
        const isFailed = p.status === 'FAILED' || p.status === 'REJECTED';
        const paymentStatus = isPaid ? 'PAID' : isFailed ? 'FAILED' : 'PENDING';

        return {
          id: p.id,
          source: 'PAYMENT',
          customerName: p.customer?.fullName || 'Customer',
          customerMobile: p.customer?.mobile || '',
          customerEmail: p.customer?.email || '',
          applicationId: p.loan?.applicationNumber || 'N/A',
          loanId: p.loanId,
          chargeType: p.paymentType === 'KYC_CHARGES' ? 'KYC Charges' : 'Processing Fee',
          amount: p.amount,
          paymentStatus,
          transactionRef: p.transactionRef,
          receiptNumber: p.receiptNumber,
          paymentDate: p.paymentDate,
          isInvoiceAvailable: isPaid,
        };
      });

      res.json({
        success: true,
        data: records,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/charges/records/:id/invoice
   * Generates or downloads official invoice PDF for verified payments only.
   */
  async getInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const download = req.query.download === 'true';
      const actor = req.user || { id: 'admin-system', fullName: 'System Admin' };
      const ipAddress = req.ip || req.socket.remoteAddress;

      // 1. Find payment record
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          customer: true,
          loan: true,
        },
      });

      let customerName = '';
      let customerMobile = '';
      let customerEmail = '';
      let customerAddress = '';
      let applicationNumber = '';
      let loanAccountNumber = '';
      let chargeType = 'Processing Fee';
      let chargeDesc = 'Standard Loan Processing and Verification Charge';
      let amount = 0;
      let paymentDate: Date = new Date();
      let paymentStatus = 'PENDING';
      let transactionRef = '';
      let invoiceNum = '';

      if (payment) {
        if (payment.status !== 'PAID' && payment.status !== 'SUCCESS') {
          return res.status(400).json({
            success: false,
            message: 'Invoice is available only after payment has been verified and marked as PAID.',
          });
        }

        customerName = payment.customer.fullName;
        customerMobile = payment.customer.mobile;
        customerEmail = payment.customer.email;
        customerAddress = `${payment.customer.address}, ${payment.customer.city}, ${payment.customer.state}`;
        applicationNumber = payment.loan?.applicationNumber || 'N/A';
        loanAccountNumber = payment.loan?.accountNumber || payment.loan?.applicationNumber || 'N/A';
        chargeType = payment.paymentType === 'KYC_CHARGES' ? 'KYC Charges' : 'Processing Fee';
        chargeDesc = payment.paymentType === 'KYC_CHARGES' ? 'Customer KYC Identity Verification Fee' : 'Loan Processing & Underwriting Fee';
        amount = payment.amount;
        paymentDate = payment.paymentDate;
        paymentStatus = 'PAID';
        transactionRef = payment.transactionRef;
        invoiceNum = payment.receiptNumber || `INV-${Date.now().toString().slice(-6)}`;
      } else {
        // Fallback: Check Charge model
        const charge = await prisma.charge.findUnique({
          where: { id },
          include: { customer: true, loan: true },
        });

        if (!charge) {
          throw new AppError(404, 'Payment or charge record not found.');
        }

        if (charge.status !== 'PAID') {
          return res.status(400).json({
            success: false,
            message: 'Invoice is available only after payment has been verified and marked as PAID.',
          });
        }

        customerName = charge.customer?.fullName || 'Customer';
        customerMobile = charge.customer?.mobile || '';
        customerEmail = charge.customer?.email || '';
        customerAddress = charge.customer ? `${charge.customer.address}, ${charge.customer.city}, ${charge.customer.state}` : '';
        applicationNumber = charge.loan?.applicationNumber || 'N/A';
        loanAccountNumber = charge.loan?.accountNumber || charge.loan?.applicationNumber || 'N/A';
        chargeType = charge.name;
        chargeDesc = charge.remark || charge.name;
        amount = charge.amount;
        paymentDate = charge.paidAt || charge.createdAt;
        paymentStatus = 'PAID';
        transactionRef = charge.transactionRef || 'PAID_RECORD';
        invoiceNum = `INV-CHG-${charge.id.slice(0, 8).toUpperCase()}`;
      }

      // Fetch branding settings
      const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

      const pdfBuffer = await pdfService.generateInvoicePdf({
        invoiceNumber: invoiceNum,
        invoiceDate: paymentDate,
        customerName,
        customerMobile,
        customerEmail,
        customerAddress,
        applicationNumber,
        loanAccountNumber,
        chargeType,
        chargeDescription: chargeDesc,
        amount,
        taxAmount: Math.round(amount * 0.18),
        totalAmount: Math.round(amount * 1.18),
        paymentDate,
        paymentStatus,
        transactionRef,
        companyName: branding?.companyName || 'Your Financial Services',
        companyLegalName: branding?.companyLegalName || 'Your Financial Services Pvt. Ltd.',
        companyAddress: branding?.address || 'Financial District, Mumbai, Maharashtra 400021',
        companyEmail: branding?.email || 'support@yourcompany.com',
        companyPhone: branding?.phone || '+91 1800 000 000',
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

      // Record audit log
      await auditService.record({
        actorType: 'ADMIN',
        actorId: actor.id,
        actorName: actor.fullName,
        action: download ? 'Invoice Downloaded' : 'Invoice Generated',
        entity: 'Payment',
        entityId: id,
        newValue: {
          invoiceNumber: invoiceNum,
          customerName,
          amount,
          chargeType,
          download,
        },
        ipAddress,
      });

      if (download) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Invoice_${invoiceNum}.pdf"`);
        return res.send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, `Invoice_${invoiceNum}.pdf`);
    } catch (err) {
      next(err);
    }
  }

  // --- Legacy Compatibility Endpoints ---
  async listCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const charges = await prisma.charge.findMany({
        where: { customerId: null },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: charges });
    } catch (err) {
      next(err);
    }
  }

  async createCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const { name, amount, type, isMandatory, isActive, taxPercent } = req.body;
      if (!name || amount === undefined) {
        return res.status(400).json({ success: false, message: 'Name and amount are required' });
      }

      const charge = await prisma.charge.create({
        data: {
          name,
          amount: parseFloat(amount),
          type: type || 'FIXED',
          isMandatory: isMandatory ?? true,
          isActive: isActive ?? true,
          taxPercent: taxPercent ? parseFloat(taxPercent) : 18.0,
        },
      });

      res.status(201).json({ success: true, message: 'Charge configured successfully', data: charge });
    } catch (err) {
      next(err);
    }
  }

  async updateCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      const { name, amount, type, isMandatory, isActive, taxPercent } = req.body;

      const charge = await prisma.charge.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(amount !== undefined && { amount: parseFloat(amount) }),
          ...(type !== undefined && { type }),
          ...(isMandatory !== undefined && { isMandatory }),
          ...(isActive !== undefined && { isActive }),
          ...(taxPercent !== undefined && { taxPercent: parseFloat(taxPercent) }),
        },
      });

      res.json({ success: true, message: 'Charge updated successfully', data: charge });
    } catch (err) {
      next(err);
    }
  }

  async deleteCharge(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      await prisma.charge.delete({ where: { id } });
      res.json({ success: true, message: 'Charge deleted successfully' });
    } catch (err) {
      next(err);
    }
  }
}

export const chargesController = new ChargesController();

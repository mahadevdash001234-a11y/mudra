import { Request, Response, NextFunction } from 'express';
import { settingsService } from '../services/settingsService';
import { pdfService } from '../services/pdfService';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';
import {
  updateBrandingSchema,
  updateDocumentBrandingSchema,
  updateEmailSettingsSchema,
  testEmailSchema,
  updateWhatsAppSettingsSchema,
  testWhatsAppSchema,
  updatePaymentConfigSchema,
} from '../validators/phase5Validators';
import { AppError } from '../middleware/errorHandler';

export class SettingsController {
  async getPublicConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getPublicConfig();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async getBrandingSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getBrandingSettings();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateBrandingSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = updateBrandingSchema.parse(req.body);
      const data = await settingsService.updateBrandingSettings(input, req.user, req.ip);
      res.status(200).json({ success: true, message: 'Website branding saved successfully', data });
    } catch (err) {
      next(err);
    }
  }

  async getDocumentBrandingSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getDocumentBrandingSettings();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateDocumentBrandingSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = updateDocumentBrandingSchema.parse(req.body);
      const data = await settingsService.updateDocumentBrandingSettings(input, req.user, req.ip);
      res.status(200).json({ success: true, message: 'Document branding saved successfully', data });
    } catch (err) {
      next(err);
    }
  }

  async previewApprovalLetter(req: Request, res: Response, next: NextFunction) {
    try {
      const branding = await settingsService.getBrandingSettings();
      const pdfBuffer = await pdfService.generateApprovalLetterPdf({
        customerName: 'Ajay Kumar',
        customerPhone: '+91 8274843108',
        customerEmail: 'ajay.kumar@example.com',
        customerAddress: 'Office 218, Gokhale Plaza, Chinchwad, Pune, Maharashtra 411033',
        applicationNumber: 'LN20260906142729',
        loanAccountNumber: 'LN20260906142729',
        approvalNumber: 'LN20260906142729',
        loanType: 'Business Growth Loan',
        approvedAmount: 100000,
        interestRate: 2.0,
        tenureMonths: 12,
        monthlyEmi: 8500,
        processingFee: 7899,
        approvalDate: new Date(),
        panMasked: 'BANPN9796M',
        aadhaarMasked: 'XXXX-XXXX-3108',
        accountHolderName: 'Ajay Kumar',
        accountNumberMasked: 'XXXXXX6776',
        bankIfsc: 'SBIN0004235',
        bankName: 'State Bank of India',
        kycVerificationId: 'MUDFNC/437/907/687',
        companyName: branding.companyName,
        companyLegalName: branding.companyLegalName,
        companyEmail: branding.email,
        companyPhone: branding.phone,
        companyAddress: branding.address,
        companyWebsite: branding.website,
        authorizedSignatoryName: branding.authorizedSignatoryName,
        authorizedSignatoryDesignation: branding.authorizedSignatoryDesignation,
        logoUrl: branding.logoUrl,
        secondaryLogoUrl: branding.secondaryLogoUrl,
        approvalLetterHeaderUrl: branding.approvalLetterHeaderUrl,
        watermarkLogoUrl: branding.watermarkLogoUrl,
        documentWatermarkEnabled: branding.documentWatermarkEnabled,
        watermarkOpacity: branding.watermarkOpacity,
        watermarkSize: branding.watermarkSize,
        watermarkPosition: branding.watermarkPosition,
        verificationUrl: `https://loanapprove.com/verify/document/LN20260906142729`,
      });

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Preview_Approval_Letter.pdf"');
        return res.status(200).send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, 'Preview_Approval_Letter.pdf');
    } catch (err) {
      next(err);
    }
  }

  async previewInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const branding = await settingsService.getBrandingSettings();
      const pdfBuffer = await pdfService.generateInvoicePdf({
        invoiceNumber: 'INV-2026-PREVIEW',
        invoiceDate: new Date(),
        customerName: 'Ajay Kumar',
        customerMobile: '+91 8274843108',
        customerEmail: 'ajay.kumar@example.com',
        customerAddress: 'Office 218, Gokhale Plaza, Chinchwad, Pune, Maharashtra 411033',
        applicationNumber: 'LN20260906142729',
        loanAccountNumber: 'LN20260906142729',
        chargeType: 'Processing & Verification Fee',
        chargeDescription: 'Standard Loan File Clearance and Document Verification Fee',
        amount: 7899,
        taxAmount: Math.round(7899 * 0.18),
        totalAmount: Math.round(7899 * 1.18),
        paymentDate: new Date(),
        paymentStatus: 'PAID',
        transactionRef: 'TXN-UTR-987654321012',
        companyName: branding.companyName,
        companyLegalName: branding.companyLegalName,
        companyAddress: branding.address,
        companyEmail: branding.email,
        companyPhone: branding.phone,
        companyWebsite: branding.website,
        authorizedSignatoryName: branding.authorizedSignatoryName,
        authorizedSignatoryDesignation: branding.authorizedSignatoryDesignation,
        logoUrl: branding.logoUrl,
        watermarkLogoUrl: branding.watermarkLogoUrl,
        invoiceWatermarkEnabled: branding.invoiceWatermarkEnabled,
        watermarkOpacity: branding.watermarkOpacity,
        watermarkSize: branding.watermarkSize,
        watermarkPosition: branding.watermarkPosition,
        generatedDate: new Date(),
      });

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="Preview_Invoice.pdf"');
        return res.status(200).send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, 'Preview_Invoice.pdf');
    } catch (err) {
      next(err);
    }
  }

  async getEmailSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getEmailSettings();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateEmailSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = updateEmailSettingsSchema.parse(req.body);
      const data = await settingsService.updateEmailSettings(input, req.user, req.ip);
      res.status(200).json({ success: true, message: 'Email settings saved successfully', data });
    } catch (err) {
      next(err);
    }
  }

  async testEmailConnection(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const result = await settingsService.testEmailConnection(req.user, req.ip);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async sendTestEmail(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = testEmailSchema.parse(req.body);
      const result = await settingsService.sendTestEmail(input, req.user, req.ip);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getWhatsAppSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getWhatsAppSettings();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updateWhatsAppSettings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = updateWhatsAppSettingsSchema.parse(req.body);
      const data = await settingsService.updateWhatsAppSettings(input, req.user, req.ip);
      res.status(200).json({ success: true, message: 'WhatsApp configuration updated', data });
    } catch (err) {
      next(err);
    }
  }

  async testWhatsAppConnection(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const result = await settingsService.testWhatsAppConnection(req.user, req.ip);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async sendTestWhatsApp(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = testWhatsAppSchema.parse(req.body);
      const result = await settingsService.sendTestWhatsApp(input, req.user, req.ip);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPaymentConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await settingsService.getPaymentConfig();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async updatePaymentConfig(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const input = updatePaymentConfigSchema.parse(req.body);
      const data = await settingsService.updatePaymentConfig(input, req.user, req.ip);
      res.status(200).json({ success: true, message: 'Payment configuration updated', data });
    } catch (err) {
      next(err);
    }
  }
}

export const settingsController = new SettingsController();


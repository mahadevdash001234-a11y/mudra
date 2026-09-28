import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { agreementService } from '../services/agreementService';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../services/db';
import { pdfService } from '../services/pdfService';
import { storageProvider } from '../providers/storage';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';

export class AgreementController {
  /**
   * Customer: Get loan agreement.
   */
  async getCustomerAgreement(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const data = await agreementService.getAgreementForLoan(req.user.id, req.params.id as string, false);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Customer: Accept loan agreement.
   */
  async acceptAgreement(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const data = await agreementService.acceptAgreement(
        req.user.id,
        req.params.id as string,
        req.user,
        req.ip,
        req.headers['user-agent']
      );
      res.status(200).json({
        success: true,
        message: 'Loan agreement signed and accepted successfully.',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get loan agreement.
   */
  async getAdminAgreement(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const data = await agreementService.getAgreementForLoan(req.user.id, req.params.id as string, true);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Customer / Admin: Download Official PDF Approval Letter with Immutability and IDOR guard
   */
  async downloadApprovalLetterPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const loanId = (req.params.loanId || req.params.id) as string;
      const loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [{ id: loanId }, { applicationNumber: loanId }, { accountNumber: loanId }],
        },
        include: { customer: true, domain: true },
      });
      if (!loan) throw new AppError(404, 'Loan not found');

      // Strict Auth Check
      if (!req.user) {
        throw new AppError(401, 'Unauthorized: Authentication is required to access approval documents.');
      }

      // IDOR Guard: Customer can only download their own approval letter
      if (req.user.role === 'CUSTOMER' && loan.customerId !== req.user.id) {
        throw new AppError(403, 'Access denied: You do not have permission to access documents for this loan application.');
      }

      // Status Guard: Approval letter only available for approved/disbursed loans
      if (loan.status !== 'APPROVED' && loan.status !== 'DISBURSED') {
        throw new AppError(400, `Approval letter is only available for approved loans. Current loan status is: ${loan.status}`);
      }

      // Check for persisted LoanDocument (Immutability guarantee)
      const existingDoc = await prisma.loanDocument.findFirst({
        where: {
          loanId: loan.id,
          documentType: 'APPROVAL_LETTER',
          isCurrentVersion: true,
        },
      });

      let pdfBuffer: Buffer | null = null;
      if (existingDoc && existingDoc.filePath && fs.existsSync(existingDoc.filePath)) {
        pdfBuffer = fs.readFileSync(existingDoc.filePath);
      } else {
        const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
        const approvalNo = loan.approvalNumber || loan.accountNumber || loan.applicationNumber;

        pdfBuffer = await pdfService.generateApprovalLetterPdf({
          customerName: loan.customer.fullName,
          customerPhone: loan.customer.mobile,
          customerEmail: loan.customer.email,
          customerAddress: loan.customer.address ? `${loan.customer.address}, ${loan.customer.city || ''}, ${loan.customer.state || ''}` : undefined,
          applicationNumber: loan.applicationNumber,
          loanAccountNumber: loan.accountNumber || loan.applicationNumber,
          approvalNumber: approvalNo,
          loanType: loan.loanType || 'Personal Loan',
          approvedAmount: loan.approvedAmount || loan.requestedAmount,
          interestRate: loan.interestRate || 12.0,
          tenureMonths: loan.tenureMonths,
          monthlyEmi: loan.finalEmi || loan.estimatedEmi || 0,
          processingFee: loan.processingFeeAmount || 1250,
          approvalDate: loan.updatedAt,
          disbursementDate: loan.disbursementDate || undefined,
          panMasked: loan.customer.panMasked || undefined,
          aadhaarMasked: loan.customer.aadhaarMasked || undefined,
          accountHolderName: loan.customer.fullName,
          accountNumberMasked: loan.customer.bankAccountNumber ? `XXXXXX${loan.customer.bankAccountNumber.slice(-4)}` : undefined,
          bankIfsc: loan.customer.bankIfsc || undefined,
          bankName: loan.customer.bankName || undefined,
          companyName: branding?.companyName,
          companyLegalName: branding?.companyLegalName,
          companyEmail: branding?.email,
          companyPhone: branding?.phone,
          companyAddress: branding?.address,
          companyWebsite: branding?.website,
          authorizedSignatoryName: branding?.authorizedSignatoryName,
          authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation,
          logoUrl: branding?.logoUrl,
          secondaryLogoUrl: branding?.secondaryLogoUrl,
          approvalLetterHeaderUrl: branding?.approvalLetterHeaderUrl,
          watermarkLogoUrl: branding?.watermarkLogoUrl,
          documentWatermarkEnabled: branding?.documentWatermarkEnabled,
          watermarkOpacity: branding?.watermarkOpacity,
          watermarkSize: branding?.watermarkSize,
          watermarkPosition: branding?.watermarkPosition,
          verificationUrl: `https://loanapprove.com/verify/document/${loan.applicationNumber}`,
        });

        // Save for subsequent requests
        try {
          const docId = crypto.randomUUID();
          const storageKey = `documents/${loan.customerId}/APPROVAL_LETTER/${loan.id}-v1.pdf`;
          const storageResult = await storageProvider.saveFile(storageKey, pdfBuffer, 'application/pdf');
          await prisma.loanDocument.create({
            data: {
              id: docId,
              customerId: loan.customerId,
              loanId: loan.id,
              documentType: 'APPROVAL_LETTER',
              fileName: `Approval_Letter_${approvalNo}.pdf`,
              originalFileName: `Approval_Letter_${approvalNo}.pdf`,
              storageKey: storageResult.storageKey,
              filePath: storageResult.filePath,
              fileUrl: `/api/customer/documents/${docId}/file`,
              mimeType: 'application/pdf',
              fileSize: storageResult.fileSize,
              status: 'APPROVED',
              version: 1,
              isCurrentVersion: true,
            },
          });
        } catch (saveErr) {
          console.error('[ApprovalSaveFallback] Failed to save fallback document:', saveErr);
        }
      }

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      const filename = `Loan_Approval_Letter_${loan.applicationNumber}.pdf`;
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${filename}"`
        );
        return res.send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, filename);
    } catch (err) {
      next(err);
    }
  }
}

export const agreementController = new AgreementController();


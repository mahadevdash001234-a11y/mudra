import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db';
import { pdfService } from '../services/pdfService';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';

export class EmiController {
  /**
   * Get EMI schedule for a loan:
   * GET /api/customer/loans/:id/emi or /api/loans/:id/emi
   */
  async getEmiSchedule(req: Request, res: Response, next: NextFunction) {
    try {
      const loanId = req.params.id as string;
      const loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [{ id: loanId }, { applicationNumber: loanId }, { accountNumber: loanId }],
        },
        include: {
          customer: true,
          emiSchedules: { orderBy: { installmentNumber: 'asc' } },
        },
      });

      if (!loan) throw new AppError(404, 'Loan not found');

      // Security check: if customer, must own the loan
      if (req.user?.role === 'CUSTOMER' && loan.customerId !== req.user.id) {
        throw new AppError(403, 'Forbidden');
      }

      res.json({
        success: true,
        data: {
          loanId: loan.id,
          applicationNumber: loan.applicationNumber,
          accountNumber: loan.accountNumber || loan.applicationNumber,
          customerName: loan.customer.fullName,
          loanType: loan.loanType || 'Personal Loan',
          loanAmount: loan.approvedAmount || loan.requestedAmount,
          tenureMonths: loan.tenureMonths,
          monthlyEmi: loan.finalEmi || loan.estimatedEmi || 0,
          interestRate: loan.interestRate,
          schedules: loan.emiSchedules,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Download EMI schedule as PDF:
   * GET /api/customer/loans/:id/emi-pdf or /api/loans/:id/emi-pdf
   */
  async downloadEmiSchedulePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const loanId = req.params.id as string;
      const loan = await prisma.loanApplication.findFirst({
        where: {
          OR: [{ id: loanId }, { applicationNumber: loanId }, { accountNumber: loanId }],
        },
        include: {
          customer: true,
          emiSchedules: { orderBy: { installmentNumber: 'asc' } },
        },
      });

      if (!loan) throw new AppError(404, 'Loan not found');

      // Security check: if customer, must own the loan
      if (req.user?.role === 'CUSTOMER' && loan.customerId !== req.user.id) {
        throw new AppError(403, 'Forbidden');
      }

      const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

      const pdfBuffer = await pdfService.generateEmiSchedulePdf({
        customerName: loan.customer.fullName,
        applicationNumber: loan.applicationNumber,
        loanAccountNumber: loan.accountNumber || loan.applicationNumber,
        loanAmount: loan.approvedAmount || loan.requestedAmount,
        tenureMonths: loan.tenureMonths,
        monthlyEmi: loan.finalEmi || loan.estimatedEmi || 0,
        schedules: loan.emiSchedules.map((s) => ({
          installmentNumber: s.installmentNumber,
          dueDate: s.dueDate,
          principalAmount: s.principalAmount,
          interestAmount: s.interestAmount,
          totalAmount: s.totalAmount,
          status: s.status,
        })),
        companyName: branding?.companyName,
      });

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      const filename = `EMI_Schedule_${loan.applicationNumber}.pdf`;
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, filename);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Download Payment Receipt PDF:
   * GET /api/payments/:id/receipt-pdf
   */
  async downloadPaymentReceiptPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const paymentId = req.params.id as string;
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [{ id: paymentId }, { transactionRef: paymentId }, { receiptNumber: paymentId }],
        },
        include: { customer: true, loan: true },
      });

      if (!payment) throw new AppError(404, 'Payment not found');

      const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

      const pdfBuffer = await pdfService.generatePaymentReceiptPdf({
        receiptNumber: payment.receiptNumber,
        transactionRef: payment.transactionRef,
        customerName: payment.customer.fullName,
        applicationNumber: payment.loan.applicationNumber,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentType: payment.paymentType,
        status: payment.status,
        paymentDate: payment.paymentDate,
        companyName: branding?.companyName,
      });

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      const filename = `Receipt_${payment.receiptNumber}.pdf`;
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(pdfBuffer);
      }
      return sendPdfPreviewResponse(res, pdfBuffer, filename);
    } catch (err) {
      next(err);
    }
  }
}

export const emiController = new EmiController();

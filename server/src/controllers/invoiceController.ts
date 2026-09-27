import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db';
import { pdfService } from '../services/pdfService';
import { specificChargesService } from '../services/specificChargesService';
import { AppError } from '../middleware/errorHandler';

export const invoiceController = {
  /**
   * GET /api/customer/invoices
   * List all invoices for the authenticated customer.
   */
  async listCustomerInvoices(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      const customerId = req.user.id;

      // Ensure invoices are up to date for any paid charges
      const paidCharges = await prisma.charge.findMany({
        where: { customerId, status: 'PAID' },
      });

      for (const charge of paidCharges) {
        const existing = await prisma.invoice.findFirst({
          where: { chargeId: charge.id },
        });
        if (!existing) {
          // Auto-generate invoice record
          const invNum = `INV-${new Date().getFullYear()}-${charge.id.slice(0, 6).toUpperCase()}`;
          const tax = Math.round(charge.amount * 0.18);
          await prisma.invoice.create({
            data: {
              invoiceNumber: invNum,
              customerId,
              loanId: charge.loanId || '',
              chargeId: charge.id,
              paymentId: charge.paymentId,
              chargeName: charge.name,
              amount: charge.amount,
              taxAmount: tax,
              totalAmount: charge.amount + tax,
              currency: 'INR',
              status: 'PAID',
              storageKey: `invoices/${customerId}/${charge.id}.pdf`,
              filePath: '',
              fileUrl: `/api/customer/charges/${charge.id}/invoice`,
              issuedAt: charge.paidAt || charge.updatedAt || new Date(),
            },
          }).catch(() => { });
        }
      }

      const invoices = await prisma.invoice.findMany({
        where: { customerId },
        orderBy: { issuedAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: invoices,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/customer/invoices/:id/pdf
   * Download or stream the invoice PDF for customer.
   */
  async downloadInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      const customerId = req.user.id;
      const invoiceId = String(req.params.id);
      const download = req.query.download === 'true';

      const invoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { id: invoiceId, customerId },
            { invoiceNumber: invoiceId, customerId },
            { chargeId: invoiceId, customerId },
          ],
        },
      });

      if (!invoice) {
        throw new AppError(404, 'Invoice record not found');
      }

      if (invoice.chargeId) {
        const { buffer, filename } = await specificChargesService.generateSpecificChargeInvoicePdf(
          invoice.chargeId,
          req.user,
          download,
          req.ip
        );

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `${download ? 'attachment' : 'inline'}; filename="${filename}"`
        );
        res.send(buffer);
        return;
      }

      // Fallback: Generate generic invoice PDF via pdfService
      const customer = await prisma.customer.findUnique({ where: { id: customerId } });
      const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

      const pdfBuffer = await pdfService.generateInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.issuedAt,
        customerName: customer?.fullName || 'Customer',
        customerMobile: customer?.mobile || '',
        customerEmail: customer?.email || '',
        customerAddress: customer ? `${customer.address}, ${customer.city}, ${customer.state}` : '',
        applicationNumber: invoice.loanId ? `APP-${invoice.loanId.slice(0, 8).toUpperCase()}` : 'N/A',
        chargeType: invoice.chargeName,
        amount: invoice.amount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        companyName: branding?.companyName || 'Mudra Loan Approval',
        companyAddress: branding?.address || '',
        companyPhone: branding?.phone || '',
        companyEmail: branding?.email || '',
        companyWebsite: branding?.website || '',
        authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Officer',
        authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Operations Head',
        logoUrl: branding?.logoUrl,
        watermarkLogoUrl: branding?.watermarkLogoUrl,
        invoiceWatermarkEnabled: branding?.invoiceWatermarkEnabled,
        watermarkOpacity: branding?.watermarkOpacity,
        generatedDate: new Date(),
      });

      const filename = `Invoice-${invoice.invoiceNumber}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${download ? 'attachment' : 'inline'}; filename="${filename}"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
};

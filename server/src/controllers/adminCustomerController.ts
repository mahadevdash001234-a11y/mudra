import { Request, Response, NextFunction } from 'express';
import { adminCustomerService } from '../services/adminCustomerService';
import { whatsappService } from '../services/whatsappService';
import { auditService } from '../services/auditService';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';

export class AdminCustomerController {
  /**
   * Admin: List customers with date filters, state, status, search, and pagination.
   */
  async listCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, kycStatus, status, state, city, fromDate, toDate, page, limit, domainId } = req.query;
      const data = await adminCustomerService.listCustomers({
        search: search as string,
        kycStatus: kycStatus as string,
        status: status as string,
        state: state as string,
        city: city as string,
        fromDate: fromDate as string,
        toDate: toDate as string,
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        domainId: domainId as string,
      });
      res.status(200).json({ success: true, data: data.customers, pagination: data.pagination });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get dynamically populated list of states.
   */
  async listStates(req: Request, res: Response, next: NextFunction) {
    try {
      const states = await adminCustomerService.getDistinctStates();
      res.status(200).json({ success: true, data: states });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get all matching customers (unpaginated) for bulk selection.
   */
  async getMatchingCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, kycStatus, status, state, city, fromDate, toDate, domainId } = req.query;
      const customers = await adminCustomerService.getMatchingCustomers({
        search: search as string,
        kycStatus: kycStatus as string,
        status: status as string,
        state: state as string,
        city: city as string,
        fromDate: fromDate as string,
        toDate: toDate as string,
        domainId: domainId as string,
      });
      res.status(200).json({ success: true, data: customers, total: customers.length });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Export filtered customers dataset as CSV.
   */
  async exportCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, kycStatus, status, state, city, fromDate, toDate } = req.query;
      const csv = await adminCustomerService.exportFilteredCustomersCsv({
        search: search as string,
        kycStatus: kycStatus as string,
        status: status as string,
        state: state as string,
        city: city as string,
        fromDate: fromDate as string,
        toDate: toDate as string,
      });

      if (req.user) {
        await auditService.record({
          actorType: 'ADMIN',
          actorId: req.user.id,
          actorName: req.user.fullName,
          action: 'CUSTOMER_CSV_EXPORTED',
          entity: 'Customer',
          entityId: 'ALL',
          newValue: { filters: req.query },
          ipAddress: req.ip,
        });
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="customers-export-${timestamp}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Send WhatsApp pending approval notification to customer.
   */
  async sendWhatsAppPending(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const id = String(req.params.id);
      const customMessage = req.body.customMessage || req.body.message;

      const result = await whatsappService.sendPendingApprovalMessage({
        customerId: id,
        customMessage,
        actor: req.user,
        ipAddress: req.ip,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get WhatsApp communication history for customer.
   */
  async getWhatsAppHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const history = await whatsappService.getCustomerWhatsAppHistory(id);
      res.status(200).json({ success: true, data: history });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Download Invoice PDF for customer.
   */
  async downloadInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { filename, buffer } = await adminCustomerService.getCustomerInvoicePdf(id);

      if (req.user) {
        await auditService.record({
          actorType: 'ADMIN',
          actorId: req.user.id,
          actorName: req.user.fullName,
          action: 'INVOICE_DOWNLOADED',
          entity: 'Customer',
          entityId: id,
          newValue: { filename },
          ipAddress: req.ip,
        });
      }

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }
      return sendPdfPreviewResponse(res, buffer, filename);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Download Approval Letter PDF for customer.
   */
  async downloadApprovalLetterPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const { filename, buffer } = await adminCustomerService.getCustomerApprovalLetterPdf(id);

      if (req.user) {
        await auditService.record({
          actorType: 'ADMIN',
          actorId: req.user.id,
          actorName: req.user.fullName,
          action: 'APPROVAL_LETTER_DOWNLOADED',
          entity: 'Customer',
          entityId: id,
          newValue: { filename },
          ipAddress: req.ip,
        });
      }

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      if (isDownload) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }
      return sendPdfPreviewResponse(res, buffer, filename);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Get customer 360 profile.
   */
  async getCustomer360(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await adminCustomerService.getCustomer360(req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Deactivate/Soft-delete customer account.
   */
  async deactivateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const id = String(req.params.id);
      const { reason } = req.body;

      const customer = await adminCustomerService.deactivateCustomer(
        id,
        reason,
        req.user,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Customer account deactivated successfully. Login is disabled while all historical records remain preserved.',
        data: customer,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Reactivate customer account.
   */
  async reactivateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const id = String(req.params.id);

      const customer = await adminCustomerService.reactivateCustomer(
        id,
        req.user,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Customer account reactivated successfully. Login access has been restored.',
        data: customer,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Manually register customer and create loan application.
   */
  async manualCreateCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const result = await adminCustomerService.manualCreateCustomer(req.body, req.user);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Bulk deactivate customer accounts.
   */
  async bulkDeactivateCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const { customerIds, reason } = req.body;
      const result = await adminCustomerService.bulkDeactivateCustomers(customerIds, reason, req.user, req.ip);
      res.status(200).json({
        success: true,
        message: `Successfully deactivated ${result.deactivatedCount} customer accounts.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Bulk reactivate customer accounts.
   */
  async bulkReactivateCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const { customerIds } = req.body;
      const result = await adminCustomerService.bulkReactivateCustomers(customerIds, req.user, req.ip);
      res.status(200).json({
        success: true,
        message: `Successfully reactivated ${result.reactivatedCount} customer accounts.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Single permanent delete customer account (FK Protected).
   */
  async deleteCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const id = String(req.params.id);
      await adminCustomerService.deleteCustomer(id, req.user, req.ip);
      res.status(200).json({
        success: true,
        message: 'Customer record deleted successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Admin: Bulk permanent delete customer accounts (FK Protected).
   */
  async bulkDeleteCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');
      const { customerIds } = req.body;
      const result = await adminCustomerService.bulkDeleteCustomers(customerIds, req.user, req.ip);
      res.status(200).json({
        success: true,
        message: `Bulk delete completed: ${result.deletedCount} deleted, ${result.deactivatedCount} deactivated due to financial records.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminCustomerController = new AdminCustomerController();




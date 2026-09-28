import { Request, Response, NextFunction } from 'express';
import { specificChargesService } from '../services/specificChargesService';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse } from '../utils/pdfPreviewResponse';

export class SpecificChargesController {
  // ==========================================
  // ADMIN ENDPOINTS
  // ==========================================

  /**
   * GET /api/admin/charges/specific/application/:applicationId
   */
  async listApplicationSpecificCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const applicationId = String(req.params.applicationId);
      const charges = await specificChargesService.listChargesForApplication(applicationId);
      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/charges/specific/customer/:customerId
   */
  async listCustomerSpecificCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = String(req.params.customerId);
      const charges = await specificChargesService.listChargesForCustomer(customerId);
      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/charges/specific
   * Supports ?customerId=... and ?applicationId=...
   */
  async listSpecificCharges(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId, applicationId } = req.query;
      let charges: any[] = [];
      if (customerId) {
        charges = await specificChargesService.listChargesForCustomer(String(customerId));
      } else if (applicationId) {
        charges = await specificChargesService.listChargesForApplication(String(applicationId));
      } else {
        charges = [];
      }
      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/:chargeId/send
   */
  async sendCharge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const result = await specificChargesService.sendCharge(chargeId, req.user, req.ip);

      res.json({
        success: true,
        message: result.message,
        data: result.charge,
        emailStatus: result.emailStatus,
        whatsappStatus: result.whatsappStatus,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/send-all
   */
  async sendAllCharges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const { customerId, applicationId } = req.body;
      if (!customerId) {
        return res.status(400).json({
          success: false,
          message: 'customerId is required to send all charges.',
        });
      }

      const result = await specificChargesService.sendAllCharges(
        String(customerId),
        req.user,
        req.ip,
        applicationId ? String(applicationId) : undefined
      );

      res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific
   */
  async createSpecificCharge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const { customerId, applicationId, loanId, chargeType, amount, remark, dueDate, forceDuplicate } = req.body;

      if (!customerId || !chargeType || amount === undefined) {
        return res.status(400).json({
          success: false,
          message: 'customerId, chargeType, and amount are required fields.',
        });
      }

      const charge = await specificChargesService.createSpecificCharge(
        {
          customerId: String(customerId),
          applicationId: applicationId ? String(applicationId) : undefined,
          loanId: loanId ? String(loanId) : undefined,
          chargeType: String(chargeType),
          amount: Number(amount),
          remark: remark ? String(remark) : undefined,
          dueDate: dueDate ? String(dueDate) : undefined,
          forceDuplicate: Boolean(forceDuplicate),
        },
        req.user,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: `Specific charge "${charge.name}" created successfully for customer.`,
        data: charge,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/admin/charges/specific/:chargeId
   */
  async updateSpecificCharge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const { amount, remark, dueDate } = req.body;

      const charge = await specificChargesService.updateSpecificCharge(
        chargeId,
        {
          amount: amount !== undefined ? Number(amount) : undefined,
          remark: remark !== undefined ? String(remark) : undefined,
          dueDate: dueDate !== undefined ? (dueDate ? String(dueDate) : '') : undefined,
        },
        req.user,
        req.ip
      );

      res.json({
        success: true,
        message: 'Specific charge updated successfully.',
        data: charge,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/:chargeId/cancel
   */
  async cancelSpecificCharge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const charge = await specificChargesService.cancelSpecificCharge(chargeId, req.user, req.ip);

      res.json({
        success: true,
        message: 'Specific charge cancelled successfully.',
        data: charge,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/:chargeId/remind
   */
  async sendReminder(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const result = await specificChargesService.sendReminder(chargeId, req.user, req.ip);

      res.json({
        success: true,
        message: result.message,
        emailStatus: result.emailStatus,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/:chargeId/verify-payment
   */
  async verifySpecificChargePayment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const charge = await specificChargesService.verifySpecificChargePayment(chargeId, req.user, req.ip);

      res.json({
        success: true,
        message: `Payment for charge "${charge.name}" verified successfully. Status is now PAID.`,
        data: charge,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/admin/charges/specific/:chargeId/invoice
   */
  async getInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const download = req.query.download === 'true';

      const { buffer, filename } = await specificChargesService.generateSpecificChargeInvoicePdf(
        chargeId,
        req.user,
        download,
        req.ip
      );

      if (download) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buffer);
      }
      return sendPdfPreviewResponse(res, buffer, filename);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // CUSTOMER ENDPOINTS
  // ==========================================

  /**
   * GET /api/customer/charges
   */
  async getCustomerCharges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const charges = await specificChargesService.listActiveChargesForCustomer(req.user.id);
      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/customer/charges/application/:applicationId
   */
  async getApplicationCharges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const applicationId = String(req.params.applicationId);
      const charges = await specificChargesService.listActiveChargesForCustomer(req.user.id, applicationId);

      res.json({
        success: true,
        data: charges,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/customer/charges/:chargeId
   */
  async getChargeDetails(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const charge = await specificChargesService.getChargeById(chargeId);

      if (charge.customerId !== req.user.id) {
        throw new AppError(403, 'Access denied: You do not own this charge.');
      }

      res.json({
        success: true,
        data: charge,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/customer/charges/:chargeId/submit-utr
   */
  async submitChargePayment(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const { utr, paymentMethod, notes } = req.body;

      if (!utr) {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference / UTR number is required.',
        });
      }

      const result = await specificChargesService.submitCustomerChargePayment(
        chargeId,
        req.user.id,
        { utr: String(utr), paymentMethod, notes },
        req.user,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: 'Payment reference submitted successfully. Verification in progress.',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/customer/charges/:chargeId/invoice
   */
  async downloadChargeInvoicePdf(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      const download = req.query.download === 'true';

      const { buffer, filename } = await specificChargesService.generateSpecificChargeInvoicePdf(
        chargeId,
        req.user,
        download,
        req.ip
      );

      if (download) {
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
   * DELETE /api/admin/charges/specific/:chargeId
   */
  async deleteCharge(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const chargeId = String(req.params.chargeId);
      await specificChargesService.deleteCharge(chargeId, req.user, req.ip);

      res.json({
        success: true,
        message: 'Charge deleted successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/bulk-cancel
   */
  async bulkCancelCharges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const { chargeIds } = req.body;
      const result = await specificChargesService.bulkCancelCharges(chargeIds, req.user, req.ip);

      res.json({
        success: true,
        message: `Successfully cancelled ${result.cancelledCount} charges.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/admin/charges/specific/bulk-delete
   */
  async bulkDeleteCharges(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError(401, 'Unauthorized');

      const { chargeIds } = req.body;
      const result = await specificChargesService.bulkDeleteCharges(chargeIds, req.user, req.ip);

      res.json({
        success: true,
        message: `Bulk delete completed: ${result.deletedCount} deleted, ${result.cancelledCount} cancelled due to active status.`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const specificChargesController = new SpecificChargesController();


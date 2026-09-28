import { Request, Response, NextFunction } from 'express';
import { adminKycService } from '../services/adminKycService';
import { documentService } from '../services/documentService';
import {
  documentReviewSchema,
  requestAdditionalDocumentSchema,
  kycDecisionSchema,
} from '../validators/documentValidators';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse, streamToBuffer } from '../utils/pdfPreviewResponse';

export const adminKycController = {
  /**
   * GET /api/admin/kyc
   */
  async listKycCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const { status, search, page, limit } = req.query;
      const result = await adminKycService.listKycCustomers({
        status: status as string,
        search: search as string,
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/admin/kyc/:customerId
   */
  async getCustomerKycDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = String(req.params.customerId);
      const result = await adminKycService.getCustomerKycDetails(customerId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/kyc/documents/:documentId/review
   */
  async reviewDocument(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AppError(403, 'Requires ADMIN privileges');
      }

      const validation = documentReviewSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await adminKycService.reviewDocument(
        { id: req.user.id, fullName: req.user.fullName },
        String(req.params.documentId),
        validation.data.action,
        validation.data.reason,
        ipAddress
      );

      res.status(200).json({
        success: true,
        message: `Document status updated to ${result.status}`,
        data: { document: result },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/admin/kyc/documents/:documentId/file
   * Admin-authorized document file streaming with audit logging.
   */
  async streamDocumentFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AppError(403, 'Requires ADMIN privileges');
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const { stream, mimeType, fileName, fileSize } =
        await documentService.getDocumentStream(
          String(req.params.documentId),
          {
            id: req.user.id,
            role: 'ADMIN',
            fullName: req.user.fullName,
          },
          ipAddress
        );

      const isDownload = req.query.download === 'true' || req.query.download === '1';
      if (isDownload) {
        res.setHeader('Content-Type', mimeType);
        if (fileSize) {
          res.setHeader('Content-Length', fileSize);
        }
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(fileName)}"`
        );
        return stream.pipe(res);
      }

      const buffer = await streamToBuffer(stream);
      return sendPdfPreviewResponse(res, buffer, fileName, mimeType);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/kyc/:customerId/request-document
   */
  async requestAdditionalDocument(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AppError(403, 'Requires ADMIN privileges');
      }

      const validation = requestAdditionalDocumentSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await adminKycService.requestAdditionalDocument(
        { id: req.user.id, fullName: req.user.fullName },
        String(req.params.customerId),
        validation.data,
        ipAddress
      );

      res.status(201).json({
        success: true,
        message: 'Additional document requested successfully',
        data: { request: result },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/kyc/:customerId/decision
   */
  async overrideKycDecision(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AppError(403, 'Requires ADMIN privileges');
      }

      const validation = kycDecisionSchema.safeParse(req.body);
      if (!validation.success) {
        const errors = validation.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await adminKycService.overrideKycStatus(
        { id: req.user.id, fullName: req.user.fullName },
        String(req.params.customerId),
        validation.data.status,
        validation.data.reason,
        ipAddress
      );

      res.status(200).json({
        success: true,
        message: `KYC status updated to ${result.kycStatus}`,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/admin/kyc/:customerId
   *
   * KYC-ONLY reset/removal.
   * Deletes only the customer's KYC identity documents and resets kycStatus to PENDING.
   * Does NOT delete the customer, loans, charges, payments, invoices, or any other data.
   * Sends a notification to the customer to re-submit KYC.
   */
  async resetKyc(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AppError(403, 'Requires ADMIN privileges');
      }

      const customerId = String(req.params.customerId);
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await adminKycService.resetKycSubmission(
        customerId,
        { id: req.user.id, fullName: req.user.fullName },
        ipAddress
      );

      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

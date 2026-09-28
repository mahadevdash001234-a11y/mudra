import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/documentService';
import { uploadDocumentSchema } from '../validators/documentValidators';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse, streamToBuffer } from '../utils/pdfPreviewResponse';

export const documentController = {
  /**
   * GET /api/customer/documents
   */
  async listDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      const result = await documentService.listCustomerDocuments(req.user.id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/customer/documents
   */
  async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      if (!req.file) {
        throw new AppError(400, 'No document file uploaded');
      }

      const validation = uploadDocumentSchema.safeParse(req.body);
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
      const document = await documentService.uploadDocument(
        req.user.id,
        validation.data.documentType,
        req.file,
        validation.data.loanId,
        ipAddress
      );

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully and queued for KYC review',
        data: { document },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/customer/documents/:id
   */
  async getDocumentMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      const metadata = await documentService.getDocumentMetadata(
        String(req.params.id),
        req.user.id
      );

      res.status(200).json({
        success: true,
        data: { document: metadata },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/customer/documents/:id/file
   * Authenticated file streaming with strict IDOR customer ownership check.
   */
  async streamDocumentFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new AppError(401, 'Unauthorized');
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const { stream, mimeType, fileName, fileSize } =
        await documentService.getDocumentStream(
          String(req.params.id),
          {
            id: req.user.id,
            role: req.user.role as 'CUSTOMER' | 'ADMIN',
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
   * POST /api/customer/documents/:id/reupload
   */
  async reuploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      if (!req.file) {
        throw new AppError(400, 'No document file uploaded');
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const document = await documentService.reuploadDocument(
        req.user.id,
        String(req.params.id),
        req.file,
        ipAddress
      );

      res.status(201).json({
        success: true,
        message: 'Document re-uploaded successfully and queued for review',
        data: { document },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/customer/kyc/submit
   */
  async submitKyc(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user || req.user.role !== 'CUSTOMER') {
        throw new AppError(401, 'Unauthorized');
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const result = await documentService.submitCustomerKyc(req.user.id, ipAddress);

      res.status(200).json({
        success: true,
        message: 'KYC documents submitted successfully for verification',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

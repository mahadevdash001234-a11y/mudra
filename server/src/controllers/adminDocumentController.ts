import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/documentService';
import { AppError } from '../middleware/errorHandler';
import { sendPdfPreviewResponse, streamToBuffer } from '../utils/pdfPreviewResponse';

export const adminDocumentController = {
  /**
   * GET /api/admin/customers/:customerId/documents
   * List all documents for a customer with versions, status breakdown, and pending requests.
   */
  async listCustomerDocuments(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = String(req.params.customerId);
      const result = await documentService.listCustomerDocumentsForAdmin(customerId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/admin/documents/:documentId
   * Retrieve document metadata.
   */
  async getDocumentMetadata(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const { stream, mimeType, fileName, fileSize, document } =
        await documentService.getDocumentStreamForAdmin(
          documentId,
          req.user!,
          req.ip,
          false
        );

      res.status(200).json({
        success: true,
        data: {
          id: document.id,
          customerId: document.customerId,
          loanId: document.loanId,
          documentType: document.documentType,
          fileName: document.fileName,
          originalFileName: document.originalFileName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          status: document.status,
          version: document.version,
          isCurrentVersion: document.isCurrentVersion,
          rejectionReason: document.rejectionReason,
          reviewedBy: document.reviewedBy,
          reviewedAt: document.reviewedAt,
          uploadedAt: document.uploadedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/admin/documents/:documentId/view
   * Stream document inline for preview (PDF / Image viewer).
   */
  async streamDocumentView(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const { stream, mimeType, fileName, fileSize } =
        await documentService.getDocumentStreamForAdmin(
          documentId,
          req.user!,
          req.ip,
          false
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
   * GET /api/admin/documents/:documentId/download
   * Stream document as attachment download.
   */
  async downloadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const { stream, mimeType, fileName, fileSize } =
        await documentService.getDocumentStreamForAdmin(
          documentId,
          req.user!,
          req.ip,
          true
        );

      res.setHeader('Content-Type', mimeType);
      if (fileSize) {
        res.setHeader('Content-Length', fileSize);
      }
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileName)}"`
      );

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/documents/:documentId/verify
   * Verify/approve a customer document.
   */
  async verifyDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const updated = await documentService.verifyDocument(
        documentId,
        req.user!,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Document verified successfully',
        data: {
          document: {
            id: updated.id,
            status: updated.status,
            reviewedBy: updated.reviewedBy,
            reviewedAt: updated.reviewedAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/documents/:documentId/reject
   * Reject a customer document with reason.
   */
  async rejectDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const reason = req.body.reason ? String(req.body.reason).trim() : '';

      if (!reason) {
        throw new AppError(400, 'Rejection reason is mandatory');
      }

      const updated = await documentService.rejectDocument(
        documentId,
        reason,
        req.user!,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Document rejected',
        data: {
          document: {
            id: updated.id,
            status: updated.status,
            rejectionReason: updated.rejectionReason,
            reviewedBy: updated.reviewedBy,
            reviewedAt: updated.reviewedAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/documents/:documentId/request-correction
   * Request document correction / re-upload from customer with reason.
   */
  async requestCorrection(req: Request, res: Response, next: NextFunction) {
    try {
      const documentId = String(req.params.documentId);
      const reason = req.body.reason ? String(req.body.reason).trim() : '';

      if (!reason) {
        throw new AppError(400, 'Correction instructions/reason are mandatory');
      }

      const updated = await documentService.requestCorrection(
        documentId,
        reason,
        req.user!,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Correction requested from customer',
        data: {
          document: {
            id: updated.id,
            status: updated.status,
            rejectionReason: updated.rejectionReason,
            reviewedBy: updated.reviewedBy,
            reviewedAt: updated.reviewedAt,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/admin/customers/:customerId/documents/download-zip
   * or GET /api/admin/customers/:customerId/documents/download-all
   * Stream a secure ZIP archive containing the customer's documents.
   */
  async downloadZip(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = String(req.params.customerId);
      let documentIds: string[] | undefined;

      if (req.body && Array.isArray(req.body.documentIds) && req.body.documentIds.length > 0) {
        documentIds = req.body.documentIds.map(String);
      } else if (req.query.documentIds) {
        const queryIds = String(req.query.documentIds).split(',').map((id) => id.trim()).filter(Boolean);
        if (queryIds.length > 0) {
          documentIds = queryIds;
        }
      }

      const { archive, zipFileName, count } =
        await documentService.generateCustomerDocumentsZip(
          customerId,
          documentIds,
          req.user!,
          req.ip
        );

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(zipFileName)}"`
      );

      archive.on('error', (err: any) => {
        next(err);
      });

      archive.pipe(res);
      await archive.finalize();
    } catch (err) {
      next(err);
    }
  },
};

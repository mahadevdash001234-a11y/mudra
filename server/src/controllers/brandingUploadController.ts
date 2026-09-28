import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { storageProvider } from '../providers/storage';

const BRANDING_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'branding');

function getPublicUrl(req: Request, filename: string): string {
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  if (!host || host.includes('localhost') || host.includes('127.0.0.1')) {
    return `/uploads/branding/${filename}`;
  }
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${host}/uploads/branding/${filename}`;
}

async function saveBrandingFile(req: Request, filePrefix: string): Promise<string> {
  if (!req.file) {
    throw new AppError(400, 'No file uploaded.');
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const timestamp = Date.now();
  const hash = crypto.randomBytes(6).toString('hex');
  const filename = `${filePrefix}_${timestamp}_${hash}${ext}`;
  const storageKey = `branding/${filename}`;

  const stored = await storageProvider.saveFile(storageKey, req.file.buffer, req.file.mimetype);

  if (stored.filePath.startsWith('http://') || stored.filePath.startsWith('https://')) {
    return `${stored.filePath}?v=${timestamp}`;
  }

  try {
    if (!fs.existsSync(BRANDING_UPLOAD_DIR)) {
      fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
    }
    const localFilepath = path.join(BRANDING_UPLOAD_DIR, filename);
    if (!fs.existsSync(localFilepath)) {
      fs.writeFileSync(localFilepath, req.file.buffer);
    }
  } catch {
    // Ignore local filesystem copy when using remote storage or read-only runtime
  }

  return `${getPublicUrl(req, filename)}?v=${timestamp}`;
}

export const brandingUploadController = {
  /**
   * POST /admin/settings/branding/upload-logo
   */
  async uploadLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await saveBrandingFile(req, 'logo');
      res.status(200).json({
        success: true,
        message: 'Logo uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/settings/branding/upload-favicon
   */
  async uploadFavicon(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await saveBrandingFile(req, 'favicon');
      res.status(200).json({
        success: true,
        message: 'Favicon uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/settings/branding/upload-secondary-logo
   */
  async uploadSecondaryLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await saveBrandingFile(req, 'secondary_logo');
      res.status(200).json({
        success: true,
        message: 'Secondary logo uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/settings/branding/upload-watermark-logo
   */
  async uploadWatermarkLogo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await saveBrandingFile(req, 'watermark');
      res.status(200).json({
        success: true,
        message: 'Watermark logo uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/settings/branding/upload-approval-header
   */
  async uploadApprovalHeader(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await saveBrandingFile(req, 'approval_header');
      res.status(200).json({
        success: true,
        message: 'Approval letter header uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /admin/settings/upi/upload-qr or /admin/settings/branding/upload-qr
   */
  async uploadQrCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        throw new AppError(400, 'No file uploaded. Please select a QR code image.');
      }

      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        throw new AppError(400, 'Invalid file type. Only PNG, JPG, JPEG, and WebP are allowed for QR codes.');
      }

      const url = await saveBrandingFile(req, 'merchant_qr');

      res.status(200).json({
        success: true,
        message: 'Merchant QR code uploaded successfully.',
        data: { url },
      });
    } catch (err) {
      next(err);
    }
  },
};

import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import { IStorageProvider, StorageSaveResult } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { logger } from '../../utils/logger';

export interface CloudinaryConfig {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
}

export class CloudinaryStorageProvider implements IStorageProvider {
  readonly name = 'CLOUDINARY';
  private configured: boolean = false;

  constructor(config?: CloudinaryConfig) {
    const cloudName = config && 'cloudName' in config ? config.cloudName : (process.env.CLOUDINARY_CLOUD_NAME || '');
    const apiKey = config && 'apiKey' in config ? config.apiKey : (process.env.CLOUDINARY_API_KEY || '');
    const apiSecret = config && 'apiSecret' in config ? config.apiSecret : (process.env.CLOUDINARY_API_SECRET || '');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.configured = true;
    }
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Determine Cloudinary resource_type based on mimeType and file extension.
   */
  private getResourceType(mimeType: string, key: string): 'image' | 'raw' {
    const lowerMime = (mimeType || '').toLowerCase();
    const lowerKey = (key || '').toLowerCase();
    if (
      lowerMime.startsWith('image/') ||
      lowerKey.endsWith('.jpg') ||
      lowerKey.endsWith('.jpeg') ||
      lowerKey.endsWith('.png') ||
      lowerKey.endsWith('.webp') ||
      lowerKey.endsWith('.svg')
    ) {
      return 'image';
    }
    return 'raw';
  }

  /**
   * Determine access type ('upload' for standard/free Cloudinary accounts, or 'authenticated' if CLOUDINARY_STRICT_AUTH=true).
   */
  private getAccessType(key: string): 'authenticated' | 'upload' {
    if (process.env.CLOUDINARY_STRICT_AUTH === 'true') {
      return 'authenticated';
    }
    return 'upload';
  }

  /**
   * Format a clean Cloudinary public_id from key.
   */
  private getPublicId(key: string): string {
    return key.replace(/^[/\\]+/, '');
  }

  private guessMimeType(key: string): string {
    const lower = (key || '').toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  public getAbsolutePath(key: string): string {
    const publicId = this.getPublicId(key);
    const mimeType = this.guessMimeType(key);
    const resourceType = this.getResourceType(mimeType, key);
    const accessType = this.getAccessType(key);

    return cloudinary.url(publicId, {
      resource_type: resourceType,
      type: accessType,
      sign_url: accessType === 'authenticated',
      secure: true,
    });
  }

  async saveFile(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<StorageSaveResult> {
    if (!this.configured) {
      throw new Error('Cloudinary credentials are not configured');
    }

    const publicId = this.getPublicId(key);
    const resourceType = this.getResourceType(mimeType, key);
    const accessType = this.getAccessType(key);

    return new Promise<StorageSaveResult>((resolve, reject) => {
      const uploadOptions: any = {
        public_id: publicId,
        resource_type: 'auto',
        type: accessType,
        overwrite: true,
        invalidate: true,
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        async (error, result) => {
          if (error || !result) {
            const errMsg = error?.message || 'Cloudinary upload failed';
            logger.warn(`Cloudinary upload failed for ${key}: ${errMsg}. Falling back to LocalStorageProvider.`);
            try {
              const localStorage = new LocalStorageProvider();
              const localResult = await localStorage.saveFile(key, buffer, mimeType);
              return resolve(localResult);
            } catch (fallbackErr) {
              return reject(new Error(`Storage error: ${errMsg}`));
            }
          }

          logger.info(`File uploaded to Cloudinary: ${result.public_id} (${result.bytes} bytes, type: ${accessType})`);

          resolve({
            storageKey: key,
            filePath: result.secure_url || result.url,
            fileSize: result.bytes || buffer.length,
            mimeType,
          });
        }
      );

      uploadStream.end(buffer);
    });
  }

  async getFileStream(key: string): Promise<Readable> {
    if (!this.configured) {
      throw new Error('Cloudinary credentials are not configured');
    }

    const publicId = this.getPublicId(key);
    const mimeType = this.guessMimeType(key);
    const resourceType = this.getResourceType(mimeType, key);
    const accessType = this.getAccessType(key);

    const downloadUrl = cloudinary.url(publicId, {
      resource_type: resourceType,
      type: accessType,
      sign_url: accessType === 'authenticated',
      secure: true,
    });

    try {
      const response = await fetch(downloadUrl);
      if (response.ok && response.body) {
        const arrayBuffer = await response.arrayBuffer();
        return Readable.from(Buffer.from(arrayBuffer));
      }
    } catch {
      // Fallback to local storage if Cloudinary fetch fails
    }

    const localStorage = new LocalStorageProvider();
    return localStorage.getFileStream(key);
  }

  async fileExists(key: string): Promise<boolean> {
    if (!this.configured) return false;

    try {
      const publicId = this.getPublicId(key);
      const mimeType = this.guessMimeType(key);
      const resourceType = this.getResourceType(mimeType, key);
      const accessType = this.getAccessType(key);

      const result = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        type: accessType,
      });

      return Boolean(result && result.public_id);
    } catch {
      return false;
    }
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.configured) return;

    try {
      const publicId = this.getPublicId(key);
      const mimeType = this.guessMimeType(key);
      const resourceType = this.getResourceType(mimeType, key);
      const accessType = this.getAccessType(key);

      await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: accessType,
        invalidate: true,
      });

      logger.info(`File deleted from Cloudinary: ${key}`);
    } catch (err) {
      logger.warn(`Failed to delete file from Cloudinary: ${key}`, { error: String(err) });
    }
  }
}

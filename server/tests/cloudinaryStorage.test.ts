import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import dotenv from 'dotenv';
import path from 'path';
import { resolveStorageProvider, LocalStorageProvider, CloudinaryStorageProvider } from '../src/providers/storage';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Storage Provider Factory & CloudinaryStorageProvider', () => {
  const envBackup = {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  };

  it('should resolve LocalStorageProvider when Cloudinary credentials are deleted from env', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;

    const provider = resolveStorageProvider();
    expect(provider).toBeInstanceOf(LocalStorageProvider);

    // Restore env
    process.env.CLOUDINARY_CLOUD_NAME = envBackup.CLOUDINARY_CLOUD_NAME;
    process.env.CLOUDINARY_API_KEY = envBackup.CLOUDINARY_API_KEY;
    process.env.CLOUDINARY_API_SECRET = envBackup.CLOUDINARY_API_SECRET;
  });

  it('should resolve CloudinaryStorageProvider when Cloudinary credentials exist in env', () => {
    if (envBackup.CLOUDINARY_CLOUD_NAME && envBackup.CLOUDINARY_API_KEY && envBackup.CLOUDINARY_API_SECRET) {
      process.env.STORAGE_PROVIDER = 'cloudinary';
      const provider = resolveStorageProvider();
      delete process.env.STORAGE_PROVIDER;
      expect(provider).toBeInstanceOf(CloudinaryStorageProvider);
      expect((provider as CloudinaryStorageProvider).isConfigured()).toBe(true);
    }
  });

  it('should throw an error on saveFile if CloudinaryStorageProvider is unconfigured', async () => {
    const unconfigured = new CloudinaryStorageProvider({ cloudName: '', apiKey: '', apiSecret: '' });
    expect(unconfigured.isConfigured()).toBe(false);

    await expect(
      unconfigured.saveFile('test/doc.pdf', Buffer.from('test'), 'application/pdf')
    ).rejects.toThrow('Cloudinary credentials are not configured');
  });

  it('should generate secure URL for customer documents in CloudinaryStorageProvider', () => {
    const provider = new CloudinaryStorageProvider({
      cloudName: 'test_cloud',
      apiKey: '1234567890',
      apiSecret: 'secret_test_key_abc',
    });

    const docPath = provider.getAbsolutePath('documents/customer123/AADHAAR_FRONT/doc.pdf');
    expect(docPath).toContain('res.cloudinary.com');

    const brandingPath = provider.getAbsolutePath('branding/logo.png');
    expect(brandingPath).toContain('res.cloudinary.com');
  });

  it('LocalStorageProvider saveFile, getFileStream, and deleteFile should work correctly', async () => {
    const localProvider = new LocalStorageProvider();
    const testKey = `test_scratch/sample_${Date.now()}.txt`;
    const content = Buffer.from('Hello Loan Approve Storage');

    const saved = await localProvider.saveFile(testKey, content, 'text/plain');
    expect(saved.storageKey).toBe(testKey);
    expect(saved.fileSize).toBe(content.length);

    const exists = await localProvider.fileExists(testKey);
    expect(exists).toBe(true);

    const stream = await localProvider.getFileStream(testKey);
    expect(stream).toBeInstanceOf(Readable);

    let streamContent = '';
    for await (const chunk of stream) {
      streamContent += chunk.toString();
    }
    expect(streamContent).toBe('Hello Loan Approve Storage');

    await localProvider.deleteFile(testKey);
    const existsAfterDelete = await localProvider.fileExists(testKey);
    expect(existsAfterDelete).toBe(false);
  });
});

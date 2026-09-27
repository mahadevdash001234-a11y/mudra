import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { CloudinaryStorageProvider } from './CloudinaryStorageProvider';

export function resolveStorageProvider(): IStorageProvider {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const forceCloudinary = process.env.STORAGE_PROVIDER === 'cloudinary';

  if ((!isTestEnv || forceCloudinary) && cloudName && apiKey && apiSecret) {
    const cloudinaryProvider = new CloudinaryStorageProvider({
      cloudName,
      apiKey,
      apiSecret,
    });
    if (cloudinaryProvider.isConfigured()) {
      return cloudinaryProvider;
    }
  }

  return new LocalStorageProvider();
}

export const storageProvider: IStorageProvider = resolveStorageProvider();

export * from './IStorageProvider';
export * from './LocalStorageProvider';
export * from './CloudinaryStorageProvider';


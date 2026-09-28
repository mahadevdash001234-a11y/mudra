/**
 * pdfClient.ts — Authoritative Authenticated PDF / Document Fetching Utility
 * =========================================================================
 * Responsibilities:
 * 1. Call apiClient.get(endpoint, { responseType: 'blob', tokenType })
 * 2. Verify HTTP success & response status.
 * 3. Verify returned Content-Type.
 * 4. If backend returns JSON error instead of PDF/document: detect & show the real API error.
 * 5. Create clean Blob with appropriate type.
 * 6. Create clean Blob URL: blob:http://localhost:5173/xxxxxxxx (NO #toolbar=0 or fragments).
 * 7. Extract real filename from Content-Disposition header.
 * 8. Return { blob, blobUrl, fileName, isImage, contentType }.
 *
 * GUARANTEES:
 * - NO raw API URLs are ever passed to browser navigation, <a>, <iframe>, or <object>.
 * - NO IDM (Internet Download Manager) interception.
 * - Downloads strictly reuse the already-fetched in-memory Blob.
 */

import { apiClient, ApiError } from '@/api/client';

export interface AuthenticatedPdfResult {
  /** The fetched in-memory Blob */
  blob: Blob;
  /** Clean Blob URL: blob:http://localhost:5173/uuid (no URL fragments) */
  blobUrl: string;
  /** Filename parsed from Content-Disposition or fallback */
  fileName: string;
  /** Whether the fetched document is an image (JPG, PNG, WebP) rather than a PDF */
  isImage: boolean;
  /** The MIME content-type of the document */
  contentType: string;
}

export interface FetchPdfOptions {
  tokenType?: 'customer' | 'admin' | 'auto';
  fallbackFileName?: string;
  params?: Record<string, string | number | boolean | undefined>;
}

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  throw new Error('No base64 decoding mechanism available');
}

/**
 * Fetch a PDF or document from an authenticated API endpoint as a Blob,
 * create a clean in-memory Blob URL, and parse the filename.
 */
export async function fetchAuthenticatedPdf(
  endpoint: string,
  options: FetchPdfOptions = {}
): Promise<AuthenticatedPdfResult> {
  try {
    const res = (await apiClient.get(endpoint, {
      responseType: 'blob',
      tokenType: options.tokenType || 'auto',
      params: options.params,
    })) as any;

    const contentType: string =
      res.headers?.['content-type'] ||
      res.headers?.get?.('content-type') ||
      '';

    const rawData = res.data;

    // Check if backend returned a JSON response (either Base64 preview payload or error)
    let jsonPayload: any = null;

    if (rawData && typeof rawData === 'object' && !(rawData instanceof Blob) && !(rawData instanceof ArrayBuffer)) {
      jsonPayload = rawData;
    } else if (
      contentType.includes('application/json') ||
      (rawData instanceof Blob && rawData.type.includes('application/json'))
    ) {
      let text = '';
      if (rawData instanceof Blob) {
        if (typeof rawData.text === 'function') {
          try {
            text = await rawData.text();
          } catch {}
        }
        if (!text && typeof FileReader !== 'undefined') {
          text = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string) || '');
            reader.onerror = () => resolve('');
            reader.readAsText(rawData);
          });
        }
      } else if (typeof rawData === 'string') {
        text = rawData;
      }
      try {
        jsonPayload = JSON.parse(text);
      } catch {
        jsonPayload = null;
      }
    }

    if (jsonPayload) {
      // 1. Error response
      if (jsonPayload.success === false) {
        throw new Error(jsonPayload.message || jsonPayload.error || 'Failed to load PDF document.');
      }

      // 2. Success JSON Base64 preview payload (Permanent anti-IDM architecture)
      if (jsonPayload.success === true && jsonPayload.data && typeof jsonPayload.data === 'string') {
        const mimeType: string = jsonPayload.mimeType || 'application/pdf';
        const isImage = mimeType.startsWith('image/');
        const fileName =
          jsonPayload.filename ||
          options.fallbackFileName ||
          (isImage ? 'document.png' : 'document.pdf');

        const pdfBytes = decodeBase64ToUint8Array(jsonPayload.data);
        const blob = new Blob([pdfBytes], { type: mimeType });

        if (blob.size === 0) {
          throw new Error('Server returned an empty document response.');
        }

        // Validate %PDF magic bytes if expected to be a PDF
        if (!isImage && mimeType === 'application/pdf') {
          const first5 = pdfBytes.slice(0, 5);
          const magic = String.fromCharCode(...first5);
          if (!magic.startsWith('%PDF')) {
            throw new Error('Server returned invalid PDF format.');
          }
        }

        const blobUrl = URL.createObjectURL(blob);
        return {
          blob,
          blobUrl,
          fileName,
          isImage,
          contentType: mimeType,
        };
      }
    }

    // Determine if the returned file is an image or PDF
    const isImage =
      contentType.startsWith('image/') ||
      (rawData instanceof Blob && rawData.type.startsWith('image/'));

    // Construct the clean Blob
    let blob: Blob;
    if (rawData instanceof Blob) {
      blob = isImage
        ? rawData
        : rawData.type === 'application/pdf'
        ? rawData
        : new Blob([rawData], { type: 'application/pdf' });
    } else if (rawData instanceof ArrayBuffer) {
      blob = new Blob([rawData], { type: isImage ? (contentType || 'image/png') : 'application/pdf' });
    } else {
      blob = new Blob([rawData], { type: isImage ? (contentType || 'image/png') : 'application/pdf' });
    }

    if (blob.size === 0) {
      throw new Error('Server returned an empty document response.');
    }

    // Validate %PDF magic bytes if expected to be a PDF
    if (!isImage) {
      try {
        let buffer: ArrayBuffer | null = null;
        if (typeof blob.arrayBuffer === 'function') {
          buffer = await blob.arrayBuffer();
        } else if (typeof Response !== 'undefined') {
          buffer = await new Response(blob).arrayBuffer();
        }
        if (buffer) {
          const first5 = new Uint8Array(buffer.slice(0, 5));
          const magic = String.fromCharCode(...first5);
          if (!magic.startsWith('%PDF') && !contentType.includes('application/pdf')) {
            let previewText = '';
            if (typeof blob.text === 'function') {
              previewText = await blob.text();
            } else if (typeof Response !== 'undefined') {
              previewText = await new Response(blob).text();
            }
            try {
              const parsed = JSON.parse(previewText);
              throw new Error(parsed.message || 'Server returned invalid PDF format.');
            } catch {
              // Not JSON
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.message === 'Server returned invalid PDF format.') {
          throw err;
        }
      }
    }

    // Parse filename from Content-Disposition header
    let fileName = options.fallbackFileName || (isImage ? 'document.png' : 'document.pdf');
    const contentDisp: string =
      res.headers?.['content-disposition'] ||
      res.headers?.get?.('content-disposition') ||
      '';

    if (contentDisp) {
      const filenameMatch = contentDisp.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
      if (filenameMatch && filenameMatch[1]) {
        fileName = decodeURIComponent(filenameMatch[1].trim());
      }
    }

    // Create clean in-memory Blob URL (e.g. blob:http://localhost:5173/xxxx)
    const blobUrl = URL.createObjectURL(blob);

    return {
      blob,
      blobUrl,
      fileName,
      isImage,
      contentType: contentType || (isImage ? 'image/png' : 'application/pdf'),
    };
  } catch (err: unknown) {
    console.error('[fetchAuthenticatedPdf] Error fetching document from:', endpoint, err);
    if (err instanceof ApiError) {
      throw new Error(err.message);
    }
    if (err instanceof Error) {
      throw err;
    }
    throw new Error('Could not load document. Please try again.');
  }
}

/**
 * Trigger an in-memory download from an already-fetched Blob.
 * Strictly avoids calling the server again or triggering IDM.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 2000);
}

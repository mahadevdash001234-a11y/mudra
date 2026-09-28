import { Response } from 'express';
import { Readable } from 'stream';

export interface PdfPreviewPayload {
  success: true;
  mimeType: string;
  filename: string;
  data: string; // Base64 encoded PDF / document bytes
}

/**
 * Creates and sends a JSON Base64 preview response for in-app PDF / document viewing.
 *
 * GUARANTEES:
 * 1. Content-Type is strictly 'application/json'.
 * 2. NO 'application/pdf' header is ever sent to the browser during preview.
 * 3. NO 'Content-Disposition' header is sent.
 * 4. IDM (Internet Download Manager) and browser download interceptors NEVER intercept preview.
 * 5. Full binary fidelity is preserved via Base64 encoding.
 */
export function sendPdfPreviewResponse(
  res: Response,
  buffer: Buffer,
  filename: string,
  mimeType: string = 'application/pdf'
): Response {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    mimeType: mimeType || 'application/pdf',
    filename,
    data: buffer.toString('base64'),
  });
}

/**
 * Helper to collect a ReadableStream into a Buffer (e.g. for stored documents).
 */
export async function streamToBuffer(stream: NodeJS.ReadableStream | Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

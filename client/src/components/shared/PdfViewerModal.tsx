/**
 * PdfViewerModal
 * ============================================================
 * An application-level PDF & Document preview modal that renders
 * directly from an in-memory Blob URL (<object data={blobUrl} type="application/pdf">).
 *
 * GUARANTEES:
 * 1. Clean Blob URL (blob:http://localhost:5173/xxxx) — NO #toolbar=0 or URL fragments.
 * 2. NO raw /api/... URLs are ever exposed to browser navigation or element targets.
 * 3. NO IDM (Internet Download Manager) interception or popup dialogs.
 * 4. In-modal Download button reuses the exact same in-memory Blob.
 * 5. Full native multi-page scrolling, zoom, and vector sharpness.
 * 6. Preserves JPG/PNG document preview without errors.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Download,
  Loader2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { downloadBlob } from '@/utils/pdfClient';

export interface PdfViewerModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Called when the modal should close */
  onClose: () => void;
  /** In-memory Blob (preferred) */
  blob?: Blob | null;
  /** Clean Blob URL: blob:http://localhost:5173/xxxx */
  blobUrl?: string | null;
  /**
   * PDF bytes for backward compatibility.
   * If provided without blob/blobUrl, a Blob is automatically constructed.
   */
  pdfBytes?: ArrayBuffer | Uint8Array | null;
  /** Whether the document is an image (JPG, PNG) rather than a PDF */
  isImage?: boolean;
  /** Modal title shown in the header */
  title: string;
  /** Optional subtitle line below the title */
  description?: string;
  /** Whether the document is currently being fetched */
  loading?: boolean;
  /** Error message if fetch failed */
  fetchError?: string | null;
  /**
   * Custom download handler if provided.
   * If not provided, in-memory download from the fetched Blob is used.
   */
  onDownload?: () => void;
  /** Filename for the downloaded file */
  downloadFilename?: string;
  /** Called to retry fetching the document */
  onRetry?: () => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  open,
  onClose,
  blob,
  blobUrl,
  pdfBytes,
  isImage = false,
  title,
  description,
  loading = false,
  fetchError = null,
  onDownload,
  downloadFilename = 'document.pdf',
  onRetry,
}) => {
  // If only pdfBytes was supplied, generate an in-memory Blob and URL
  const [internalBlobUrl, setInternalBlobUrl] = useState<string | null>(null);

  const effectiveBlob = useMemo(() => {
    if (blob) return blob;
    if (pdfBytes) {
      try {
        const uint8 = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes as ArrayBuffer);
        return new Blob([uint8], { type: isImage ? 'image/png' : 'application/pdf' });
      } catch {
        return null;
      }
    }
    return null;
  }, [blob, pdfBytes, isImage]);

  useEffect(() => {
    if (blobUrl) {
      setInternalBlobUrl(blobUrl);
      return;
    }
    if (effectiveBlob) {
      const url = URL.createObjectURL(effectiveBlob);
      setInternalBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
    setInternalBlobUrl(null);
  }, [blobUrl, effectiveBlob]);

  const effectiveUrl = blobUrl || internalBlobUrl;
  const hasContent = !loading && !fetchError && Boolean(effectiveUrl);

  const handleDownloadClick = () => {
    if (onDownload) {
      onDownload();
      return;
    }
    if (effectiveBlob) {
      downloadBlob(effectiveBlob, downloadFilename);
    } else if (effectiveUrl) {
      const anchor = document.createElement('a');
      anchor.href = effectiveUrl;
      anchor.download = downloadFilename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-5xl w-full h-[90vh] flex flex-col p-0 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        style={{ gap: 0 }}
      >
        {/* ── Modal Header: Clean, modern, strictly approved layout ── */}
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
              {isImage ? (
                <ImageIcon className="w-4.5 h-4.5 text-white" />
              ) : (
                <FileText className="w-4.5 h-4.5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-slate-900 truncate">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-xs text-slate-500 mt-0.5 truncate">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-4">
            {hasContent && (
              <Button
                type="button"
                size="sm"
                onClick={handleDownloadClick}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-8 px-3 rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Download {isImage ? 'Image' : 'PDF'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ── Content Area: Clean in-app Blob rendering ── */}
        <div className="flex-1 min-h-[400px] h-full w-full bg-slate-100 flex flex-col items-center justify-start overflow-hidden relative">
          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-slate-600 m-auto">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              <span className="text-sm font-medium">Loading document...</span>
            </div>
          )}

          {/* Fetch error state */}
          {!loading && fetchError && (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center px-8 m-auto">
              <AlertTriangle className="w-12 h-12 text-rose-500" />
              <p className="text-sm font-semibold text-slate-800">Unable to load document</p>
              <p className="text-xs text-slate-500 max-w-md">{fetchError}</p>
              {onRetry && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry
                </Button>
              )}
            </div>
          )}

          {/* Render Content */}
          {hasContent && effectiveUrl && (
            <>
              {isImage ? (
                <div className="flex-1 w-full h-full flex items-center justify-center p-4 overflow-auto">
                  <img
                    src={effectiveUrl}
                    alt={title}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                  />
                </div>
              ) : (
                <object
                  data={effectiveUrl}
                  type="application/pdf"
                  className="w-full h-full flex-1 border-0"
                  aria-label={title}
                >
                  <iframe
                    src={effectiveUrl}
                    title={title}
                    className="w-full h-full flex-1 border-0"
                  />
                </object>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfViewerModal;

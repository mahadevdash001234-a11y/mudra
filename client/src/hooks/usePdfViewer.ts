/**
 * usePdfViewer — Reusable hook for fetching and displaying PDFs / documents
 * =========================================================================
 * Responsibilities:
 * 1. Fetches document via fetchAuthenticatedPdf (responseType: 'blob')
 * 2. Maintains in-memory Blob and clean Blob URL (blob:http://localhost:5173/xxxx)
 * 3. Provides state for PdfViewerModal (<object data={blobUrl} type="application/pdf">)
 * 4. Provides download() handler that reuses the already-fetched Blob
 * 5. Handles image documents safely without breaking JPG/PNG previews
 * 6. Revokes Blob URLs on close to avoid memory leaks
 *
 * NEVER passes raw API URLs to browser navigation or HTML element attributes.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { fetchAuthenticatedPdf, downloadBlob, FetchPdfOptions } from '@/utils/pdfClient';

export interface UsePdfViewerReturn {
  /** The fetched in-memory Blob */
  blob: Blob | null;
  /** Clean Blob URL for <object data={blobUrl}> / <iframe> */
  blobUrl: string | null;
  /** ArrayBuffer for backward-compatible consumers */
  pdfBytes: ArrayBuffer | null;
  /** Document filename */
  fileName: string;
  /** Whether the document is an image rather than a PDF */
  isImage: boolean;
  /** Whether the document is currently being fetched */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether the modal is open */
  open: boolean;
  /** Fetch the document from a protected endpoint and open the modal */
  fetchAndOpen: (endpoint: string, fallbackFileName?: string, options?: FetchPdfOptions) => Promise<void>;
  /** Trigger download using the already-fetched in-memory Blob */
  download: (customFileName?: string) => void;
  /** Close the modal, revoke Blob URL, and reset state */
  closeModal: () => void;
  /** Retry the last fetch */
  retry: () => void;
}

export function usePdfViewer(): UsePdfViewerReturn {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>('document.pdf');
  const [isImage, setIsImage] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(false);

  const lastEndpointRef = useRef<string | null>(null);
  const lastOptionsRef = useRef<{ fallbackFileName?: string; options?: FetchPdfOptions } | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Keep track of current Blob URL for cleanup
  useEffect(() => {
    currentBlobUrlRef.current = blobUrl;
  }, [blobUrl]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      }
    };
  }, []);

  const fetchPdf = useCallback(
    async (endpoint: string, fallbackFileName?: string, options?: FetchPdfOptions) => {
      setLoading(true);
      setError(null);

      // Clean up previous blob URL if exists
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      setBlob(null);
      setBlobUrl(null);
      setPdfBytes(null);

      try {
        const result = await fetchAuthenticatedPdf(endpoint, {
          fallbackFileName,
          ...options,
        });

        setBlob(result.blob);
        setBlobUrl(result.blobUrl);
        setFileName(result.fileName);
        setIsImage(result.isImage);

        // Convert blob to arrayBuffer for backwards-compatible consumers
        try {
          const buffer = await result.blob.arrayBuffer();
          setPdfBytes(buffer);
        } catch {
          // In some mock test environments, arrayBuffer might not be implemented on Blob
          setPdfBytes(null);
        }
      } catch (err: unknown) {
        console.error('[usePdfViewer] Failed to fetch PDF from:', endpoint, err);
        const msg = err instanceof Error ? err.message : 'Could not load PDF document. Please try again.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const fetchAndOpen = useCallback(
    async (endpoint: string, fallbackFileName?: string, options?: FetchPdfOptions) => {
      lastEndpointRef.current = endpoint;
      lastOptionsRef.current = { fallbackFileName, options };
      setOpen(true);
      await fetchPdf(endpoint, fallbackFileName, options);
    },
    [fetchPdf]
  );

  const closeModal = useCallback(() => {
    setOpen(false);
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    setBlob(null);
    setBlobUrl(null);
    setPdfBytes(null);
    setError(null);
    setLoading(false);
  }, []);

  const download = useCallback(
    (customFileName?: string) => {
      if (blob) {
        downloadBlob(blob, customFileName || fileName);
      } else if (blobUrl) {
        const anchor = document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = customFileName || fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
    },
    [blob, blobUrl, fileName]
  );

  const retry = useCallback(() => {
    if (lastEndpointRef.current) {
      fetchPdf(
        lastEndpointRef.current,
        lastOptionsRef.current?.fallbackFileName,
        lastOptionsRef.current?.options
      );
    }
  }, [fetchPdf]);

  return {
    blob,
    blobUrl,
    pdfBytes,
    fileName,
    isImage,
    loading,
    error,
    open,
    fetchAndOpen,
    download,
    closeModal,
    retry,
  };
}

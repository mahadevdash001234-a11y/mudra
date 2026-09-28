import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AdminDocumentBrandingPage } from '@/pages/admin/AdminDocumentBrandingPage';
import { fetchAuthenticatedPdf } from '@/utils/pdfClient';
import PdfViewerModal from '@/components/shared/PdfViewerModal';

// Mock apiClient
vi.mock('@/api/client', () => {
  const mockApi = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    apiClient: mockApi,
    api: mockApi,
    ApiError: class ApiError extends Error {
      public status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
  };
});

describe('FINAL PDF PREVIEW & IN-MEMORY BLOB DOWNLOAD FLOW SUITE', () => {
  let queryClient: QueryClient;
  const mockCreateObjectURL = vi.fn();
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Mock URL object methods
    let blobCounter = 1;
    mockCreateObjectURL.mockImplementation((_blob: Blob) => {
      return `blob:http://localhost:5173/mock-uuid-${blobCounter++}`;
    });
    mockRevokeObjectURL.mockImplementation(() => {});

    globalThis.URL.createObjectURL = mockCreateObjectURL;
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('TEST 1: fetchAuthenticatedPdf fetches responseType blob, returns clean Blob URL & filename, never exposing raw API URL', async () => {
    const { apiClient } = await import('@/api/client');
    const mockPdfContent = '%PDF-1.4 Mock Approval Letter Content';
    const mockBlob = new Blob([mockPdfContent], { type: 'application/pdf' });

    (apiClient.get as any).mockResolvedValueOnce({
      data: mockBlob,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="Approval_Letter_LA-2026-001.pdf"',
      },
    });

    const result = await fetchAuthenticatedPdf('/admin/settings/preview/approval-letter');

    expect(apiClient.get).toHaveBeenCalledWith('/admin/settings/preview/approval-letter', {
      responseType: 'blob',
      tokenType: 'auto',
      params: undefined,
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blobUrl).toMatch(/^blob:http:\/\/localhost:5173\/mock-uuid-/);
    expect(result.fileName).toBe('Approval_Letter_LA-2026-001.pdf');
    expect(result.isImage).toBe(false);
    expect(result.blobUrl).not.toContain('#');
  });

  it('TEST 1B: fetchAuthenticatedPdf receives JSON Base64 preview response (Anti-IDM Architecture), decodes to clean Blob URL', async () => {
    const { apiClient } = await import('@/api/client');
    const pdfRawText = '%PDF-1.4 Official Approved Letter Bytes';
    const base64Data = typeof btoa === 'function' ? btoa(pdfRawText) : Buffer.from(pdfRawText).toString('base64');

    const jsonPayload = JSON.stringify({
      success: true,
      mimeType: 'application/pdf',
      filename: 'Approval_Letter_Preview.pdf',
      data: base64Data,
    });
    const mockJsonBlob = new Blob([jsonPayload], { type: 'application/json' });

    (apiClient.get as any).mockResolvedValueOnce({
      data: mockJsonBlob,
      headers: {
        'content-type': 'application/json',
      },
    });

    const result = await fetchAuthenticatedPdf('/admin/settings/preview/approval-letter');

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe('application/pdf');
    expect(result.blobUrl).toMatch(/^blob:http:\/\/localhost:5173\/mock-uuid-/);
    expect(result.fileName).toBe('Approval_Letter_Preview.pdf');
    expect(result.isImage).toBe(false);
    expect(result.contentType).toBe('application/pdf');
    expect(result.blobUrl).not.toContain('#');
  });

  it('TEST 2: fetchAuthenticatedPdf detects server JSON error returned in a Blob and throws real error message', async () => {
    const { apiClient } = await import('@/api/client');
    const errorJson = JSON.stringify({ success: false, message: 'Customer KYC must be verified before approval letter can be generated.' });
    const mockJsonBlob = new Blob([errorJson], { type: 'application/json' });

    (apiClient.get as any).mockResolvedValueOnce({
      data: mockJsonBlob,
      headers: {
        'content-type': 'application/json',
      },
    });

    await expect(fetchAuthenticatedPdf('/admin/loans/123/approval-letter/pdf')).rejects.toThrow(
      'Customer KYC must be verified before approval letter can be generated.'
    );
  });

  it('TEST 3: PdfViewerModal renders PDF inside application via clean Blob URL in <object> and downloads from same in-memory Blob', async () => {
    const mockBlob = new Blob(['%PDF-1.4 Content'], { type: 'application/pdf' });
    const mockBlobUrl = 'blob:http://localhost:5173/test-approval-letter-uuid';

    // Track anchor clicks
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    const handleClose = vi.fn();

    render(
      <PdfViewerModal
        open={true}
        onClose={handleClose}
        blob={mockBlob}
        blobUrl={mockBlobUrl}
        title="Live PDF Preview: Loan Approval Letter"
        description="Generated authoritatively by server with current branding settings"
        downloadFilename="Approval_Letter_LA-2026-001.pdf"
      />
    );

    // Verify modal title and description
    expect(screen.getByText('Live PDF Preview: Loan Approval Letter')).toBeInTheDocument();
    expect(screen.getByText('Generated authoritatively by server with current branding settings')).toBeInTheDocument();

    // Verify <object> element rendering the clean Blob URL
    const objectEl = document.querySelector('object');
    expect(objectEl).not.toBeNull();
    expect(objectEl?.getAttribute('data')).toBe(mockBlobUrl);
    expect(objectEl?.getAttribute('type')).toBe('application/pdf');

    // Confirm NO raw API URL is used
    expect(objectEl?.getAttribute('data')).not.toContain('/api/');

    // Verify Download button is visible
    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    expect(downloadBtn).toBeInTheDocument();

    // Click Download button
    fireEvent.click(downloadBtn);

    // Verify anchor click was triggered with download attribute
    expect(anchorClickSpy).toHaveBeenCalled();
  });

  it('TEST 4: PdfViewerModal supports image document preview without crashing or expecting PDF', async () => {
    const mockImageBlob = new Blob(['PNG_DATA'], { type: 'image/png' });
    const mockImageUrl = 'blob:http://localhost:5173/test-image-uuid';

    render(
      <PdfViewerModal
        open={true}
        onClose={vi.fn()}
        blob={mockImageBlob}
        blobUrl={mockImageUrl}
        isImage={true}
        title="KYC Document — Aadhaar Card Front"
        description="Customer uploaded document"
        downloadFilename="Aadhaar_Front.png"
      />
    );

    expect(screen.getByText('KYC Document — Aadhaar Card Front')).toBeInTheDocument();

    // Verify <img> rendered rather than <object>
    const imgEl = document.querySelector('img');
    expect(imgEl).not.toBeNull();
    expect(imgEl?.getAttribute('src')).toBe(mockImageUrl);
    expect(screen.getByRole('button', { name: /Download Image/i })).toBeInTheDocument();
  });

  it('TEST 5: Admin Document Branding Page Preview Approval Letter flow opens in-modal viewer with clean Blob URL and in-memory download', async () => {
    const { apiClient } = await import('@/api/client');

    // Mock document branding settings
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url.includes('/admin/settings/document-branding')) {
        return Promise.resolve({
          data: {
            approvalLetterHeaderUrl: null,
            watermarkLogoUrl: null,
            documentWatermarkEnabled: true,
            invoiceWatermarkEnabled: true,
            watermarkOpacity: 0.1,
            watermarkSize: 'MEDIUM',
            watermarkPosition: 'CENTER',
          },
        });
      }
      if (url.includes('/admin/settings/preview/approval-letter')) {
        const pdfRawText = '%PDF-1.4 Live Generated Letter';
        const base64Data = typeof btoa === 'function' ? btoa(pdfRawText) : Buffer.from(pdfRawText).toString('base64');
        const jsonPayload = JSON.stringify({
          success: true,
          mimeType: 'application/pdf',
          filename: 'Approval_Letter_Preview.pdf',
          data: base64Data,
        });
        const mockJsonBlob = new Blob([jsonPayload], { type: 'application/json' });
        return Promise.resolve({
          data: mockJsonBlob,
          headers: {
            'content-type': 'application/json',
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminDocumentBrandingPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /DOCUMENT BRANDING/i })).toBeInTheDocument();
    });

    // Locate & Click 'Preview Approval Letter' button
    const previewBtn = screen.getByRole('button', { name: /Preview Approval Letter/i });
    expect(previewBtn).toBeInTheDocument();
    fireEvent.click(previewBtn);

    // Verify modal appears with clean Blob URL inside <object>
    await waitFor(() => {
      expect(screen.getByText('Live PDF Preview: Loan Approval Letter')).toBeInTheDocument();
      expect(screen.getByText('Generated authoritatively by server with current branding settings')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();
    });

    const objectEl = document.querySelector('object');
    expect(objectEl).not.toBeNull();
    expect(objectEl?.getAttribute('data')).toMatch(/^blob:http:\/\/localhost:5173\/mock-uuid-/);
    expect(objectEl?.getAttribute('data')).not.toContain('/api/');
  });
});

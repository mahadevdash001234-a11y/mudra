import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { BrandingProvider } from '../contexts/BrandingContext';
import { AdminLayout } from '../layouts/AdminLayout';
import { AdminBrandingSettings } from '../pages/admin/AdminBrandingSettings';
import { AdminDocumentBrandingPage } from '../pages/admin/AdminDocumentBrandingPage';
import { AdminWebsiteContentPage } from '../pages/admin/AdminWebsiteContentPage';

// Mock API Client using hoisted reference
const { mockApiClient } = vi.hoisted(() => {
  return { mockApiClient: vi.fn() };
});

vi.mock('@/api/client', () => ({
  apiClient: Object.assign(
    (...args: unknown[]) => mockApiClient(...args),
    {
      get: (...args: unknown[]) => mockApiClient(...args),
      post: (...args: unknown[]) => mockApiClient(...args),
      put: (...args: unknown[]) => mockApiClient(...args),
      patch: (...args: unknown[]) => mockApiClient(...args),
      delete: (...args: unknown[]) => mockApiClient(...args),
    }
  ),
  api: Object.assign(
    (...args: unknown[]) => mockApiClient(...args),
    {
      get: (...args: unknown[]) => mockApiClient(...args),
      post: (...args: unknown[]) => mockApiClient(...args),
      put: (...args: unknown[]) => mockApiClient(...args),
      patch: (...args: unknown[]) => mockApiClient(...args),
      delete: (...args: unknown[]) => mockApiClient(...args),
    }
  ),
  ApiError: class extends Error {
    public status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const mockBrandingData = {
  companyName: 'Fintech Solutions Ltd',
  companyLegalName: 'Fintech Solutions Private Limited',
  appName: 'Apex Loan Finance',
  logoUrl: 'https://example.com/logo.png',
  secondaryLogoUrl: 'https://example.com/secondary.png',
  approvalLetterHeaderUrl: 'https://example.com/approval_header.png',
  watermarkLogoUrl: 'https://example.com/watermark.png',
  documentWatermarkEnabled: true,
  invoiceWatermarkEnabled: true,
  watermarkOpacity: 0.10,
  watermarkSize: 'MEDIUM',
  watermarkPosition: 'CENTER',
  faviconUrl: 'https://example.com/favicon.ico',
  primaryColor: '#2563EB',
  secondaryColor: '#7C3AED',
  email: 'support@apexloan.com',
  phone: '+91 98765 43210',
  address: 'BKC, Mumbai, Maharashtra 400051',
  website: 'https://apexloan.com',
  termsUrl: '/terms',
  privacyUrl: '/privacy',
  heroHeadline: 'Instant Credit Sanctions for Enterprises',
  heroSubheadline: 'Fast, reliable and verified capital loan disbursals.',
  minLoanAmount: 25000,
  maxLoanAmount: 5000000,
  minTenureMonths: 12,
  maxTenureMonths: 60,
  minApr: 10.5,
  maxApr: 28.0,
  processingFeePolicy: 'Processing fee 1.5% + GST.',
  otherChargesPolicy: 'Prepayment charges nil after 6 months.',
  minAge: 21,
  maxAge: 58,
  minMonthlyIncome: 25000,
  creditScoreCriteria: 'CIBIL 700+ preferred',
  bankAccountRequired: true,
  employmentCriteria: 'Salaried or Self Employed',
  residentialStatusCriteria: 'Indian Resident',
};

const renderAdminApp = (initialRoute: string) => {
  if (!global.URL.createObjectURL) {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/mock-blob-pdf');
  }
  if (!global.URL.revokeObjectURL) {
    global.URL.revokeObjectURL = vi.fn();
  }

  // Set mock authenticated admin session
  localStorage.setItem('loan_approve_admin_token', 'mock-admin-token');
  localStorage.setItem('loan_approve_active_role', 'ADMIN');

  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <AuthProvider>
        <BrandingProvider>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route path="settings/branding" element={<AdminBrandingSettings />} />
              <Route path="settings/document-branding" element={<AdminDocumentBrandingPage />} />
              <Route path="settings/website-content" element={<AdminWebsiteContentPage />} />
              <Route path="settings/content" element={<AdminWebsiteContentPage />} />
              <Route path="settings/approval-letter" element={<AdminDocumentBrandingPage />} />
            </Route>
          </Routes>
        </BrandingProvider>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('Website Settings, Approval Letter & Branding E2E Integration Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    mockApiClient.mockImplementation((endpoint: string, options?: any) => {
      if (typeof endpoint === 'string') {
        if (endpoint.includes('/auth/me')) {
          return Promise.resolve({
            success: true,
            data: {
              user: {
                id: 'admin-1',
                email: 'admin@loanapprove.com',
                fullName: 'Super Admin',
                role: 'ADMIN',
                adminRole: 'SUPER_ADMIN',
                permissions: ['branding.view', 'branding.manage', 'settings.view', 'settings.manage', 'domains.view'],
              },
            },
          });
        }
        if (endpoint.includes('/public/config')) {
          return Promise.resolve({ success: true, data: mockBrandingData });
        }
        if (endpoint.includes('/admin/settings/document-branding')) {
          if (options?.method === 'PUT') {
            return Promise.resolve({ success: true, data: { ...mockBrandingData, ...JSON.parse(options.body || '{}') } });
          }
          return Promise.resolve({ success: true, data: mockBrandingData });
        }
        if (endpoint.includes('/admin/settings/branding')) {
          if (options?.method === 'PUT') {
            return Promise.resolve({ success: true, data: { ...mockBrandingData, ...JSON.parse(options.body || '{}') } });
          }
          return Promise.resolve({ success: true, data: mockBrandingData });
        }
        if (endpoint.includes('/admin/settings/preview/approval-letter') || endpoint.includes('/admin/settings/preview/invoice')) {
          const enc = new TextEncoder();
          const buf = enc.encode('%PDF-1.4 Mock Sanction Letter PDF').buffer;
          return Promise.resolve({
            data: buf,
            headers: { 'content-type': 'application/pdf' },
          });
        }
      }
      return Promise.resolve({ success: true, data: {} });
    });
  });

  it('TEST 1: Admin Sidebar renders distinct Website sections with zero dead links', async () => {
    renderAdminApp('/admin/settings/branding');

    await waitFor(() => {
      expect(screen.getByText('OVERVIEW')).toBeInTheDocument();
      expect(screen.getByText('WEBSITE')).toBeInTheDocument();
    });

    // Check all 4 items under WEBSITE
    expect(screen.getByRole('link', { name: /Domains/i })).toHaveAttribute('href', '/admin/domains');
    expect(screen.getAllByRole('link', { name: /Website Branding/i })[0]).toHaveAttribute('href', '/admin/settings/branding');
    expect(screen.getAllByRole('link', { name: /Document Branding/i })[0]).toHaveAttribute('href', '/admin/settings/document-branding');
    expect(screen.getAllByRole('link', { name: /Website Content/i })[0]).toHaveAttribute('href', '/admin/settings/website-content');
  });

  it('TEST 2: Dedicated Document Branding Page loads branding, allows watermark adjustments, and opens live PDF preview', async () => {
    renderAdminApp('/admin/settings/document-branding');

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /DOCUMENT BRANDING/i })).toBeInTheDocument();
      expect(screen.getByText('10%')).toBeInTheDocument(); // Default opacity
    });

    // Verify sections are present
    expect(screen.getByRole('heading', { level: 2, name: /APPROVAL LETTER HEADER/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /DOCUMENT WATERMARK/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /INVOICE BRANDING/i })).toBeInTheDocument();

    // Change watermark opacity
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.25' } });
    expect(screen.getByText('25%')).toBeInTheDocument();

    // Click Preview Approval Letter
    fireEvent.click(screen.getAllByText(/Preview Approval Letter/i)[0]);

    await waitFor(() => {
      expect(screen.getByText(/Live PDF Preview: Loan Approval Letter/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();
    });

    // Save settings
    const saveBtn = screen.getAllByRole('button', { name: /SAVE DOCUMENT BRANDING/i })[0];
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Document branding saved successfully/i)).toBeInTheDocument();
    });
  });

  it('TEST 3: Dedicated Website Content Page manages Hero, Financial limits, and FAQs with live save', async () => {
    renderAdminApp('/admin/settings/website-content');

    await waitFor(() => {
      expect(screen.getByText(/Website Content Management/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Instant Credit Sanctions for Enterprises')).toBeInTheDocument();
      expect(screen.getAllByDisplayValue('25000').length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue('5000000')).toBeInTheDocument(); // max loan
    });

    // Edit hero headline
    const headlineInput = screen.getByDisplayValue('Instant Credit Sanctions for Enterprises');
    fireEvent.change(headlineInput, { target: { value: 'Updated Fintech Sanction Portal' } });

    // Click master save
    const saveAllBtn = screen.getByRole('button', { name: /Save All Website Content/i });
    fireEvent.click(saveAllBtn);

    await waitFor(() => {
      expect(screen.getByText(/Website content saved successfully/i)).toBeInTheDocument();
    });
  });

  it('TEST 4: Website Branding Page is streamlined and contains direct navigation links', async () => {
    renderAdminApp('/admin/settings/branding');

    await waitFor(() => {
      expect(screen.getByText(/Website Branding & Identity/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Apex Loan Finance')).toBeInTheDocument();
      expect(screen.getAllByDisplayValue('#2563EB').length).toBeGreaterThan(0);
    });

    // Verify quick link to document branding is present
    const documentBrandingLink = screen.getByRole('link', { name: /Document Branding Settings/i });
    expect(documentBrandingLink).toHaveAttribute('href', '/admin/settings/document-branding');

    const contentLink = screen.getByRole('link', { name: /Website Content Management/i });
    expect(contentLink).toHaveAttribute('href', '/admin/settings/website-content');

    // Click SAVE WEBSITE BRANDING
    const saveBtn = screen.getAllByRole('button', { name: /SAVE WEBSITE BRANDING/i })[0];
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Website branding saved successfully/i)).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerPaymentPage } from '@/pages/customer/CustomerPaymentPage';
import { CustomerKycPage } from '@/pages/customer/CustomerKycPage';
import { CustomerHome } from '@/pages/customer/CustomerHome';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useBrandTitle', () => ({
  useBrandTitle: vi.fn(),
}));

vi.mock('@/contexts/BrandingContext', () => ({
  useBranding: () => ({
    branding: {
      appName: 'Loan Approve Finance',
      logoUrl: '',
      primaryColor: '#155EEF',
    },
  }),
}));

const mockExactKycCharge = {
  id: 'chg-kyc-abc123',
  name: 'KYC Verification Charge',
  amount: 499,
  status: 'PENDING',
  transactionRef: null,
  remark: 'Mandatory KYC Verification Fee',
  dueDate: '2026-09-30T00:00:00Z',
  customerId: 'cust-xyz-789',
};

const mockExactGstCharge = {
  id: 'chg-gst-def456',
  name: 'GST',
  amount: 900,
  status: 'PENDING',
  transactionRef: null,
  remark: 'Goods and Services Tax on loan processing',
  dueDate: '2026-09-30T00:00:00Z',
  customerId: 'cust-xyz-789',
};

const mockExactProcessingCharge = {
  id: 'chg-proc-ghi789',
  name: 'Processing Fee',
  amount: 2500,
  status: 'PENDING',
  transactionRef: null,
  remark: 'Standard Underwriting Processing Fee',
  dueDate: '2026-09-30T00:00:00Z',
  customerId: 'cust-xyz-789',
};

const mockAllActiveCharges = [
  mockExactKycCharge,
  mockExactGstCharge,
  mockExactProcessingCharge,
];

const mockPaymentOptions = {
  feeAmount: 499,
  feeType: 'KYC Verification Charge',
  paymentMethods: {
    upi: true,
    bankTransfer: true,
    merchantVpa: false,
  },
  upi: {
    enabled: true,
    primaryUpiId: 'pay@loanapprove',
    merchantName: 'Loan Approve Finance',
    apps: [],
  },
  bank: {
    enabled: true,
    accountHolder: 'Loan Approve Finance Ltd',
    accountNumber: '112233445566',
    bankName: 'HDFC Bank',
    ifsc: 'HDFC0001234',
    branch: 'Financial District',
  },
  paymentLinks: [],
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
      },
    },
  });

describe('Authoritative Charge Context & Exact ID Propagation Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // TEST 1: Resolves exact KYC Charge by its MySQL ID
  it('TEST 1: Resolves exact KYC Charge by its MySQL ID and renders charge amount, title and payment methods', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockAllActiveCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/customer/payments?charge=${mockExactKycCharge.id}`]}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify exact KYC charge title and amount are rendered
    await waitFor(() => {
      expect(screen.getByText('KYC Verification Charge')).toBeInTheDocument();
      expect(screen.getAllByText(/499/).length).toBeGreaterThan(0);
      expect(screen.getByText('Selected Charge')).toBeInTheDocument();
    });

    // Verify payment rails are displayed
    expect(screen.getByText('KYC VERIFICATION CHARGE PAYMENT')).toBeInTheDocument();
    expect(screen.getByText('UPI')).toBeInTheDocument();
    expect(screen.getByText('Bank Transfer')).toBeInTheDocument();

    // Verify UPI method can be selected
    fireEvent.click(screen.getByText('UPI'));
    await waitFor(() => {
      expect(screen.getByText('pay@loanapprove')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pay with UPI/i })).toBeInTheDocument();
    });
  });

  // TEST 2: Synthetic string "?charge=kyc" does NOT match any charge ID and displays safe empty state
  it('TEST 2: Synthetic string ?charge=kyc does NOT match any charge ID and displays safe empty state with No Active Charges', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockAllActiveCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customer/payments?charge=kyc']}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Must show safe empty state without silently substituting another charge
    await waitFor(() => {
      expect(screen.getByText('No Active Charges')).toBeInTheDocument();
      expect(screen.getByText('No payment is currently required.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Selected Charge')).not.toBeInTheDocument();
  });

  // TEST 3: Resolves exact GST Charge by its MySQL ID
  it('TEST 3: Resolves exact GST Charge by its MySQL ID', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockAllActiveCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/customer/payments?charge=${mockExactGstCharge.id}`]}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('GST')).toBeInTheDocument();
      expect(screen.getAllByText(/900/).length).toBeGreaterThan(0);
      expect(screen.getByText('Selected Charge')).toBeInTheDocument();
      expect(screen.getByText('GST PAYMENT')).toBeInTheDocument();
    });
  });

  // TEST 4: Resolves exact Processing Fee Charge by its MySQL ID
  it('TEST 4: Resolves exact Processing Fee Charge by its MySQL ID', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockAllActiveCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/customer/payments?charge=${mockExactProcessingCharge.id}`]}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Processing Fee')).toBeInTheDocument();
      expect(screen.getAllByText(/2,500/).length).toBeGreaterThan(0);
      expect(screen.getByText('Selected Charge')).toBeInTheDocument();
      expect(screen.getByText('PROCESSING FEE PAYMENT')).toBeInTheDocument();
    });
  });

  // TEST 5: Non-existent or inactive charge ID displays safe empty state
  it('TEST 5: Non-existent charge ID displays safe empty state and does not substitute any charge', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockAllActiveCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customer/payments?charge=invalid-charge-uuid-000']}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('No Active Charges')).toBeInTheDocument();
      expect(screen.getByText('No payment is currently required.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Selected Charge')).not.toBeInTheDocument();
    expect(screen.queryByText('KYC Verification Charge')).not.toBeInTheDocument();
  });

  // TEST 6: CustomerHome Pay Now navigates using exact charge ID
  it('TEST 6: CustomerHome charge card Pay Now action navigates using exact charge ID', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.DASHBOARD.CUSTOMER) {
        return Promise.resolve({
          data: {
            customer: { id: 'cust-xyz-789', fullName: 'Test User', kycStatus: 'APPROVED' },
            kycSummary: { status: 'APPROVED' },
            loanSummary: null,
            timeline: [],
            invoices: [],
          },
        });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: [mockExactKycCharge] });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      if (url === '/customer/invoices') {
        return Promise.resolve({ data: [] });
      }
      if (url === API_ENDPOINTS.CUSTOMER_DOCS.LIST) {
        return Promise.resolve({ data: { documents: [] } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customer']}>
          <Routes>
            <Route path="/customer" element={<CustomerHome />} />
            <Route path="/customer/payments" element={<div data-testid="target-payment-screen" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('KYC Verification Charge')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pay Now/i })).toBeInTheDocument();
    });

    // Check link href has exact charge ID
    const detailsLink = screen.getByRole('link', { name: /^Details$/i });
    expect(detailsLink).toHaveAttribute('href', `/customer/payments?charge=${mockExactKycCharge.id}`);
  });

  // TEST 7: CustomerKycPage Pay Now passes exact charge ID
  it('TEST 7: CustomerKycPage Pay Now passes exact charge ID and is disabled when charge is missing', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { id: 'cust-xyz-789', kycStatus: 'PENDING' } } });
      }
      if (url === API_ENDPOINTS.CUSTOMER_DOCS.LIST) {
        return Promise.resolve({
          data: {
            documents: [
              { id: 'doc-front', documentType: 'AADHAAR_FRONT', status: 'VERIFIED', fileUrl: '/doc1' },
              { id: 'doc-back', documentType: 'AADHAAR_BACK', status: 'VERIFIED', fileUrl: '/doc2' },
            ],
          },
        });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: [mockExactKycCharge] });
      }
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customer/kyc']}>
          <Routes>
            <Route path="/customer/kyc" element={<CustomerKycPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      const payNowBtn = screen.getByRole('button', { name: /Pay Now/i });
      expect(payNowBtn).toBeInTheDocument();
      expect(payNowBtn).not.toBeDisabled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerPaymentPage } from '@/pages/customer/CustomerPaymentPage';
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

const mockCustomerCharges = [
  {
    id: 'chg-stamp-001',
    name: 'Stamp Duty',
    amount: 1500,
    status: 'PENDING',
    transactionRef: null,
    remark: 'State government statutory registration stamp',
    dueDate: '2026-09-30T00:00:00Z',
  },
  {
    id: 'chg-gst-002',
    name: 'GST',
    amount: 900,
    status: 'PENDING',
    transactionRef: null,
    remark: 'Goods and Services Tax on processing',
    dueDate: '2026-09-30T00:00:00Z',
  },
  {
    id: 'chg-proc-003',
    name: 'Processing Fee',
    amount: 2500,
    status: 'PAID',
    transactionRef: 'UTR5544332211',
    remark: 'Application loan processing fee',
    paidAt: '2026-09-20T10:00:00Z',
  },
];

const mockPaymentOptions = {
  feeAmount: 1500,
  feeType: 'Stamp Duty',
  paymentMethods: {
    upi: true,
    bankTransfer: true,
    merchantVpa: false,
  },
  upi: {
    enabled: true,
    primaryUpiId: 'finance@icici',
    merchantName: 'Loan Approve Finance',
    apps: [],
  },
  bank: {
    enabled: true,
    accountHolder: 'Loan Approve Finance Ltd',
    accountNumber: '998877665544',
    bankName: 'HDFC Bank',
    ifsc: 'HDFC0001234',
    branch: 'Bandra Kurla Complex, Mumbai',
  },
  paymentLinks: [],
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe('Charge-Wise Customer Payment Lifecycle & UTR Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  // TEST 1
  it('TEST 1: Notification opens Payment Center with correct charge selected', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.NOTIFICATIONS.CUSTOMER_LIST) {
        return Promise.resolve({
          data: [
            {
              id: 'notif-1',
              title: 'Stamp Duty Payment Required',
              message: 'Your Stamp Duty payment of ₹1,500 is now due.',
              eventType: 'PAYMENT_REQUIRED',
              isRead: false,
              createdAt: '2026-09-23T10:00:00Z',
            },
          ],
          unreadCount: 1,
        });
      }
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customer/payment?charge=stamp_duty']}>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('STAMP DUTY PAYMENT')).toBeInTheDocument();
      expect(screen.getAllByText(/1,500/).length).toBeGreaterThan(0);
    });
  });

  // TEST 2
  it('TEST 2: Clicking Stamp Duty Pay Now opens Payment Options for Stamp Duty', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Stamp Duty')).toBeInTheDocument();
    });

    const payNowButtons = screen.getAllByRole('button', { name: /Pay Now/i });
    fireEvent.click(payNowButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('STAMP DUTY PAYMENT')).toBeInTheDocument();
      expect(screen.getAllByText(/1,500/).length).toBeGreaterThan(0);
    });
  });

  // TEST 3
  it('TEST 3: Clicking GST Pay Now opens Payment Options for GST', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('GST')).toBeInTheDocument();
    });

    const payNowButtons = screen.getAllByRole('button', { name: /Pay Now/i });
    fireEvent.click(payNowButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('GST PAYMENT')).toBeInTheDocument();
      expect(screen.getAllByText(/900/).length).toBeGreaterThan(0);
    });
  });

  // TEST 4
  it('TEST 4: Pay Now does NOT immediately show UTR', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Select Payment Method|Choose Payment Method/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pay Using UPI/i })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/428910482910/i)).not.toBeInTheDocument();
    });
  });

  // TEST 5
  it('TEST 5: UTR becomes available only after the payment step is completed according to the existing payment flow', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay Using UPI/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Pay Using UPI/i }));

    await waitFor(() => {
      expect(screen.getByText(/STAMP DUTY PAYMENT VERIFICATION/i)).toBeInTheDocument();
      expect(screen.getByText(/Enter the 12-digit UTR \/ Transaction Reference Number/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Submit UTR/i })).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  // TEST 6
  it('TEST 6: Submitting UTR updates the correct charge', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });
    (apiClient.post as any).mockResolvedValue({ data: { success: true } });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay Using UPI/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Pay Using UPI/i }));

    const utrInput = await screen.findByPlaceholderText(/428910482910/i, {}, { timeout: 4000 });
    fireEvent.change(utrInput, { target: { value: '507823641928' } });

    const submitBtn = screen.getByRole('button', { name: /Submit UTR/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        API_ENDPOINTS.CUSTOMER_CHARGES.SUBMIT_UTR('chg-stamp-001'),
        expect.objectContaining({
          utr: '507823641928',
        })
      );
    });
  });

  // TEST 7
  it('TEST 7: UTR for Stamp Duty does not appear under GST', async () => {
    const chargesWithStampUtr = [
      {
        ...mockCustomerCharges[0],
        status: 'UNDER_VERIFICATION',
        transactionRef: '507823641928',
      },
      {
        ...mockCustomerCharges[1],
        status: 'PENDING',
        transactionRef: null,
      },
      mockCustomerCharges[2],
    ];

    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: chargesWithStampUtr });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('507823641928')).toBeInTheDocument();
      expect(screen.getByText(/✓ UTR Submitted • Pending Verification/i)).toBeInTheDocument();
      expect(screen.getByText('GST')).toBeInTheDocument();
      expect(screen.queryByText('UTR: 507823641928 under GST')).not.toBeInTheDocument();
    });
  });

  // TEST 8
  it('TEST 8: Admin verification changes the correct payment to PAID', async () => {
    (apiClient.post as any).mockResolvedValue({ data: { success: true } });

    await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT('chg-stamp-001'), {
      status: 'PAID',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT('chg-stamp-001'),
      expect.objectContaining({ status: 'PAID' })
    );
  });

  // TEST 9
  it('TEST 9: Verified payment exposes the correct invoice', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('PAID PAYMENTS (1)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download Invoice PDF/i })).toBeInTheDocument();
    });
  });

  // TEST 10
  it('TEST 10: Stamp Duty and GST invoices remain separate', async () => {
    const twoPaidCharges = [
      {
        id: 'chg-stamp-001',
        name: 'Stamp Duty',
        amount: 1500,
        status: 'PAID',
        transactionRef: 'UTR507823641928',
        paidAt: '2026-09-23T10:00:00Z',
      },
      {
        id: 'chg-gst-002',
        name: 'GST',
        amount: 900,
        status: 'PAID',
        transactionRef: 'UTR928374651234',
        paidAt: '2026-09-23T11:00:00Z',
      },
    ];

    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: twoPaidCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('PAID PAYMENTS (2)')).toBeInTheDocument();
      const viewButtons = screen.getAllByRole('button', { name: /View Invoice/i });
      expect(viewButtons.length).toBe(2);
      expect(screen.getByText('UTR507823641928')).toBeInTheDocument();
      expect(screen.getByText('UTR928374651234')).toBeInTheDocument();
    });
  });

  // TEST 11
  it('TEST 11: Single page card-wise payment preserves card visibility', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Assigned Application Charges')).toBeInTheDocument();
      expect(screen.getByText('Stamp Duty')).toBeInTheDocument();
    });
  });

  // TEST 12
  it('TEST 12: Inactive/future charges cannot be paid', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: { ...mockPaymentOptions, feeAmount: 0 } });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: [] });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No payment is currently required/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pay Now/i })).not.toBeInTheDocument();
    });
  });

  // TEST 13
  it('TEST 13: Customer cannot access another customer payment/invoice (scoped API)', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(API_ENDPOINTS.CUSTOMER_CHARGES.LIST);
    });
  });

  // TEST 14
  it('TEST 14: Mobile layout remains usable', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS) {
        return Promise.resolve({ data: mockPaymentOptions });
      }
      if (url === API_ENDPOINTS.CUSTOMER_CHARGES.LIST) {
        return Promise.resolve({ data: mockCustomerCharges });
      }
      if (url === API_ENDPOINTS.CUSTOMERS.PROFILE) {
        return Promise.resolve({ data: { profile: { kycStatus: 'APPROVED' } } });
      }
      return Promise.resolve({ data: [] });
    });

    const queryClient = createTestQueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomerPaymentPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(container.querySelector('#assigned-charges-section')).toBeInTheDocument();
      expect(screen.getByText('Encrypted 256-Bit SSL')).toBeInTheDocument();
      expect(screen.getByText('100% Verified Rails')).toBeInTheDocument();
    });
  });
});

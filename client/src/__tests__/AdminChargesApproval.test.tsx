import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminChargesApprovalPage } from '@/pages/admin/AdminChargesApprovalPage';
import { adminService } from '@/services/adminService';
import { apiClient } from '@/api/client';

vi.mock('@/services/adminService', () => ({
  adminService: {
    getAllPayments: vi.fn(),
  },
}));

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

const mockPaymentsData = [
  {
    id: 'pay-001',
    customerId: 'cust-101',
    customerName: 'Karan Mehra',
    mobile: '9820012345',
    email: 'karan@example.com',
    applicationNumber: 'LA-2026-101',
    loanId: 'loan-101',
    chargeType: 'Stamp Duty',
    chargeId: 'chg-stamp-101',
    amount: 2500,
    utr: 'UTR9988776655',
    status: 'UNDER_VERIFICATION',
    paymentMethod: 'UPI',
    submittedAt: '2026-09-22T14:30:00Z',
    notes: 'Specific Charge: Stamp Duty (chg-stamp-101)',
  },
  {
    id: 'pay-002',
    customerId: 'cust-102',
    customerName: 'Ananya Roy',
    mobile: '9830054321',
    email: 'ananya@example.com',
    applicationNumber: 'LA-2026-102',
    loanId: 'loan-102',
    chargeType: 'GST',
    chargeId: 'chg-gst-102',
    amount: 1800,
    utr: 'UTR1122334455',
    status: 'PAID',
    paymentMethod: 'BANK',
    submittedAt: '2026-09-21T09:00:00Z',
    verifiedAt: '2026-09-21T10:15:00Z',
    receiptNumber: 'REC-2026-0099',
    notes: 'Specific Charge: GST (chg-gst-102)',
  },
  {
    id: 'pay-003',
    customerId: 'cust-103',
    customerName: 'Vikas Gupta',
    mobile: '9840011223',
    email: 'vikas@example.com',
    applicationNumber: 'LA-2026-103',
    loanId: 'loan-103',
    chargeType: 'Processing Fee',
    chargeId: 'chg-proc-103',
    amount: 3500,
    utr: '',
    status: 'PENDING',
    paymentMethod: 'UPI',
    submittedAt: null,
    notes: 'Specific Charge: Processing Fee (chg-proc-103)',
  },
  {
    id: 'pay-004',
    customerId: 'cust-104',
    customerName: 'Sneha Patel',
    mobile: '9850044556',
    email: 'sneha@example.com',
    applicationNumber: 'LA-2026-104',
    loanId: 'loan-104',
    chargeType: 'Insurance Fee',
    chargeId: 'chg-ins-104',
    amount: 4200,
    utr: 'UTR0000000000',
    status: 'REJECTED',
    paymentMethod: 'UPI',
    submittedAt: '2026-09-20T11:00:00Z',
    rejectionReason: 'UTR invalid at beneficiary bank',
    notes: 'Specific Charge: Insurance Fee (chg-ins-104)',
  },
];

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe('Admin Charges & Fee Approval Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminService.getAllPayments).mockResolvedValue({
      data: mockPaymentsData,
      pagination: { total: 4 },
    } as any);
    (apiClient.get as any).mockResolvedValue({ data: [] });
    (apiClient.post as any).mockResolvedValue({ data: { success: true } });
  });

  it('TEST 1: Renders page header and 5 real summary cards', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('CHARGES & FEE APPROVAL')).toBeInTheDocument();
      expect(screen.getByText(/Review customer charge payments/i)).toBeInTheDocument();
      // Summary cards
      expect(screen.getByText('Total Payments')).toBeInTheDocument();
      expect(screen.getByText('Pending Review')).toBeInTheDocument();
      expect(screen.getAllByText('UTR Not Submitted').length).toBeGreaterThan(0);
      expect(screen.getByText('Paid / Verified')).toBeInTheDocument();
      expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
    });
  });

  it('TEST 2: Distinguishes UTR status correctly (SUBMITTED, VERIFIED, NOT SUBMITTED)', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      // Karan Mehra has UTR submitted
      expect(screen.getByText('Karan Mehra')).toBeInTheDocument();
      expect(screen.getByText('UTR9988776655')).toBeInTheDocument();

      // Ananya Roy is verified & paid
      expect(screen.getByText('Ananya Roy')).toBeInTheDocument();
      expect(screen.getByText('UTR1122334455')).toBeInTheDocument();

      // Vikas Gupta has no UTR submitted
      expect(screen.getByText('Vikas Gupta')).toBeInTheDocument();
      expect(screen.getAllByText('NOT SUBMITTED').length).toBeGreaterThan(0);
    });
  });

  it('TEST 3: Filter tabs isolate Pending vs Paid vs Rejected records', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Karan Mehra')).toBeInTheDocument();
    });

    // Click Verified / Paid tab
    const paidTab = screen.getByRole('button', { name: /^Paid/i });
    fireEvent.click(paidTab);

    await waitFor(() => {
      expect(screen.getByText('Ananya Roy')).toBeInTheDocument();
      expect(screen.queryByText('Karan Mehra')).not.toBeInTheDocument();
    });
  });

  it('TEST 4: Search input filters by customer name, UTR, or charge name', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Karan Mehra')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Filter by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Stamp Duty' } });

    await waitFor(() => {
      expect(screen.getByText('Karan Mehra')).toBeInTheDocument();
      expect(screen.queryByText('Ananya Roy')).not.toBeInTheDocument();
    });
  });

  it('TEST 5: Rule 11 gating - Verify Payment button is disabled if UTR is missing', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Vikas Gupta')).toBeInTheDocument();
    });

    // Click Review for Vikas (has index 2)
    const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
    fireEvent.click(reviewButtons[2]);

    await waitFor(() => {
      expect(screen.getByText('Review Customer Charge Payment', { exact: true })).toBeInTheDocument();
      expect(
        screen.getByText(/Customer has not submitted UTR for this charge yet/i)
      ).toBeInTheDocument();
      const verifyBtn = screen.getByRole('button', { name: /Verify Payment/i });
      expect(verifyBtn).toBeDisabled();
    });
  });

  it('TEST 6: Verify Payment button is active when UTR exists and calls verify endpoint', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Karan Mehra')).toBeInTheDocument();
    });

    // Karan Mehra has UTR9988776655
    const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
    fireEvent.click(reviewButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Review Customer Charge Payment', { exact: true })).toBeInTheDocument();
      const verifyBtn = screen.getByRole('button', { name: /Verify Payment/i });
      expect(verifyBtn).not.toBeDisabled();

      fireEvent.click(verifyBtn);
    });

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalled();
    });
  });

  it('TEST 7: Verified charges provide invoice preview and download links in review modal', async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminChargesApprovalPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ananya Roy')).toBeInTheDocument();
    });

    // Open Review modal for Ananya Roy (row 1, PAID status)
    const reviewButtons = screen.getAllByRole('button', { name: /Review/i });
    fireEvent.click(reviewButtons[1]);

    await waitFor(() => {
      expect(screen.getByText('Review Customer Charge Payment', { exact: true })).toBeInTheDocument();
      expect(screen.getByText('View Invoice')).toBeInTheDocument();
      expect(screen.getByText('PDF')).toBeInTheDocument();
      const viewInvoiceBtn = screen.getByRole('button', { name: /View Invoice/i });
      expect(viewInvoiceBtn).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplyLoanPage } from '../pages/customer/ApplyLoanPage';
import { CustomerLoansPage } from '../pages/customer/CustomerLoansPage';
import { CustomerLoanDetailPage } from '../pages/customer/CustomerLoanDetailPage';
import { AdminLoansPage } from '../pages/admin/AdminLoansPage';
import { AdminLoanDetailPage } from '../pages/admin/AdminLoanDetailPage';
import { loanApi } from '@/api/loanApi';
import { AuthProvider } from '@/contexts/AuthContext';

// Mock loanApi
vi.mock('@/api/loanApi', () => ({
  loanApi: {
    createApplication: vi.fn(),
    getCustomerApplications: vi.fn(),
    getCustomerApplicationById: vi.fn(),
    acceptOffer: vi.fn(),
    rejectOffer: vi.fn(),
    getAdminApplications: vi.fn(),
    getAdminApplicationById: vi.fn(),
    startReview: vi.fn(),
    requestDocuments: vi.fn(),
    putOnHold: vi.fn(),
    rejectApplication: vi.fn(),
    approveApplication: vi.fn(),
    modifyAmount: vi.fn(),
  },
}));

// Mock apiClient
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url.includes('/customers/profile') || url.includes('/customer/profile')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              profile: {
                id: 'customer-1',
                fullName: 'Borrower Test',
                kycStatus: 'APPROVED',
              },
            },
          },
        });
      }
      if (url.includes('/customer/loan-applications/eligibility')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              canApply: true,
              activeApplication: null,
            },
          },
        });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      id: 'admin-1',
      fullName: 'Admin User',
      email: 'admin@loanapprove.com',
      role: 'ADMIN',
      permissions: ['applications.approve', 'applications.reject', 'applications.review'],
    },
    role: 'ADMIN',
    isAuthenticated: true,
    isLoading: false,
    hasPermission: () => true,
    loginCustomer: vi.fn(),
    registerCustomer: vi.fn(),
    loginAdmin: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
    updateUser: vi.fn(),
  }),
}));

function renderWithProviders(
  ui: React.ReactElement,
  initialRoute = '/',
  pathPattern = '/'
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialRoute]}>
          <Routes>
            <Route path={pathPattern} element={ui} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('Phase 4 — Loan Application Frontend Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------
  // 1. APPLY LOAN PAGE TESTS
  // -------------------------------------------------------------
  describe('Customer Apply for Loan Page', () => {
    it('renders input fields for amount, tenure, and purpose', async () => {
      renderWithProviders(<ApplyLoanPage />);

      expect(await screen.findByText('ENTER REQUIRED LOAN AMOUNT')).toBeInTheDocument();
      expect(await screen.findByLabelText(/1. Required Loan Amount/i)).toBeInTheDocument();
      expect(await screen.findByLabelText(/2. Repayment Tenure/i)).toBeInTheDocument();
      expect(await screen.findByLabelText(/3. Purpose of Loan/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Submit Loan Application/i })
      ).toBeInTheDocument();
    });

    it('validates required fields and shows error when empty', async () => {
      renderWithProviders(<ApplyLoanPage />);

      const submitBtn = await screen.findByRole('button', { name: /Submit Loan Application/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/Loan amount must be greater than zero/i)).toBeInTheDocument();
        expect(screen.getByText(/Purpose must be at least 3 characters/i)).toBeInTheDocument();
      });
      expect(loanApi.createApplication).not.toHaveBeenCalled();
    });

    it('submits valid loan application and displays success reference number', async () => {
      vi.mocked(loanApi.createApplication).mockResolvedValue({
        success: true,
        data: {
          id: 'loan-app-1',
          applicationNumber: 'LA-2026-000042',
          requestedAmount: 120000,
          tenureMonths: 24,
          purpose: 'Medical emergency hospital bill',
          status: 'SUBMITTED',
          submittedAt: '2026-09-18T10:00:00.000Z',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T10:00:00.000Z',
        },
      });

      renderWithProviders(<ApplyLoanPage />);

      const amountInput = await screen.findByLabelText(/1. Required Loan Amount/i);
      const tenureInput = await screen.findByLabelText(/2. Repayment Tenure/i);
      const purposeInput = await screen.findByLabelText(/3. Purpose of Loan/i);

      fireEvent.change(amountInput, { target: { value: '120000' } });
      fireEvent.change(tenureInput, { target: { value: '24' } });
      fireEvent.change(purposeInput, {
        target: { value: 'Medical emergency hospital bill' },
      });

      const submitBtn = screen.getByRole('button', { name: /Submit Loan Application/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(loanApi.createApplication).toHaveBeenCalledWith({
          amount: 120000,
          tenureMonths: 24,
          purpose: 'Medical emergency hospital bill',
        });
        expect(screen.getByText('Application Submitted!')).toBeInTheDocument();
        expect(screen.getByText('LA-2026-000042')).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------
  // 2. MY APPLICATIONS PAGE TESTS
  // -------------------------------------------------------------
  describe('Customer My Applications Page', () => {
    it('displays empty state when customer has no loan applications', async () => {
      vi.mocked(loanApi.getCustomerApplications).mockResolvedValue({
        success: true,
        data: [],
      });

      renderWithProviders(<CustomerLoansPage />);

      await waitFor(() => {
        expect(screen.getByText('No loan applications yet')).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /Start Your First Application/i })
        ).toBeInTheDocument();
      });
    });

    it('renders list of loan cards with status badges and banner when offer is pending', async () => {
      vi.mocked(loanApi.getCustomerApplications).mockResolvedValue({
        success: true,
        data: [
          {
            id: 'loan-1',
            applicationNumber: 'LA-2026-000001',
            requestedAmount: 150000,
            proposedAmount: 125000,
            tenureMonths: 24,
            purpose: 'Home renovation',
            status: 'OFFER_PENDING_CUSTOMER',
            submittedAt: '2026-09-18T10:00:00.000Z',
            createdAt: '2026-09-18T10:00:00.000Z',
            updatedAt: '2026-09-18T11:00:00.000Z',
          },
          {
            id: 'loan-2',
            applicationNumber: 'LA-2026-000002',
            requestedAmount: 50000,
            tenureMonths: 12,
            purpose: 'Laptop purchase',
            status: 'SUBMITTED',
            submittedAt: '2026-09-18T12:00:00.000Z',
            createdAt: '2026-09-18T12:00:00.000Z',
            updatedAt: '2026-09-18T12:00:00.000Z',
          },
        ],
      });

      renderWithProviders(<CustomerLoansPage />);

      await waitFor(() => {
        expect(screen.getByText('LA-2026-000001')).toBeInTheDocument();
        expect(screen.getByText('LA-2026-000002')).toBeInTheDocument();
        // Offer banner
        expect(
          screen.getByText('You have an offer waiting for your review!')
        ).toBeInTheDocument();
      });
    });
  });

  // -------------------------------------------------------------
  // 3. APPLICATION DETAIL & OFFER DECISION TESTS
  // -------------------------------------------------------------
  describe('Customer Application Detail & Offer Decision', () => {
    it('renders offer decision panel with Accept and Reject buttons when offer pending', async () => {
      vi.mocked(loanApi.getCustomerApplicationById).mockResolvedValue({
        success: true,
        data: {
          id: 'loan-1',
          applicationNumber: 'LA-2026-000001',
          requestedAmount: 200000,
          proposedAmount: 160000,
          tenureMonths: 24,
          purpose: 'Higher education tuition fee',
          status: 'OFFER_PENDING_CUSTOMER',
          submittedAt: '2026-09-18T10:00:00.000Z',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T11:00:00.000Z',
        },
      });

      renderWithProviders(
        <CustomerLoanDetailPage />,
        '/customer/loans/loan-1',
        '/customer/loans/:id'
      );

      await waitFor(() => {
        expect(screen.getByText('Modified Loan Offer Available')).toBeInTheDocument();
        expect(screen.getAllByText('₹2,00,000').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('₹1,60,000')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Accept Offer/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Reject Offer/i })).toBeInTheDocument();
      });
    });

    it('opens confirmation modal and accepts offer when clicking Accept Offer', async () => {
      vi.mocked(loanApi.getCustomerApplicationById).mockResolvedValue({
        success: true,
        data: {
          id: 'loan-1',
          applicationNumber: 'LA-2026-000001',
          requestedAmount: 200000,
          proposedAmount: 160000,
          tenureMonths: 24,
          purpose: 'Higher education tuition fee',
          status: 'OFFER_PENDING_CUSTOMER',
          submittedAt: '2026-09-18T10:00:00.000Z',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T11:00:00.000Z',
        },
      });

      vi.mocked(loanApi.acceptOffer).mockResolvedValue({
        success: true,
        data: {
          id: 'loan-1',
          applicationNumber: 'LA-2026-000001',
          requestedAmount: 200000,
          proposedAmount: 160000,
          approvedAmount: 160000,
          acceptedAmount: 160000,
          tenureMonths: 24,
          purpose: 'Higher education tuition fee',
          status: 'OFFER_ACCEPTED',
          modifiedOfferAccepted: true,
          submittedAt: '2026-09-18T10:00:00.000Z',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T12:00:00.000Z',
        },
      });

      renderWithProviders(
        <CustomerLoanDetailPage />,
        '/customer/loans/loan-1',
        '/customer/loans/:id'
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Accept Offer/i })).toBeInTheDocument();
      });

      const acceptBtn = screen.getByRole('button', { name: /Accept Offer/i });
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(screen.getByText('Accept Modified Loan Offer?')).toBeInTheDocument();
      });

      const confirmBtn = screen.getByRole('button', { name: /Yes, Accept Offer/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(loanApi.acceptOffer).toHaveBeenCalledWith('loan-1');
      });
    });
  });

  // -------------------------------------------------------------
  // 4. ADMIN APPLICATIONS LIST & DETAIL TESTS
  // -------------------------------------------------------------
  describe('Admin Applications Underwriting Views', () => {
    it('renders admin applications table with search bar and filter controls', async () => {
      vi.mocked(loanApi.getAdminApplications).mockResolvedValue({
        success: true,
        data: [
          {
            id: 'loan-admin-1',
            applicationNumber: 'LA-2026-000088',
            customerId: 'cust-1',
            customerName: 'Aarav Sharma',
            mobile: '9811122233',
            email: 'aarav@example.com',
            state: 'Delhi',
            city: 'New Delhi',
            kycStatus: 'APPROVED',
            requestedAmount: 300000,
            tenureMonths: 36,
            purpose: 'Business equipment',
            status: 'UNDER_REVIEW',
            submittedAt: '2026-09-18T10:00:00.000Z',
            createdAt: '2026-09-18T10:00:00.000Z',
            updatedAt: '2026-09-18T10:30:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
          totalPages: 1,
        },
      });

      renderWithProviders(<AdminLoansPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Loan Applications Underwriting')
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Search by Application #/i)).toBeInTheDocument();
        expect(screen.getAllByText('LA-2026-000088').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Aarav Sharma').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('+91 9811122233').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders admin detail with customer profile, KYC status, and underwriting action buttons', async () => {
      vi.mocked(loanApi.getAdminApplicationById).mockResolvedValue({
        success: true,
        data: {
          id: 'loan-admin-1',
          applicationNumber: 'LA-2026-000088',
          customerId: 'cust-1',
          requestedAmount: 300000,
          tenureMonths: 36,
          purpose: 'Business equipment purchase',
          status: 'UNDER_REVIEW',
          reviewedBy: 'Senior Underwriter',
          reviewedAt: '2026-09-18T11:00:00.000Z',
          submittedAt: '2026-09-18T10:00:00.000Z',
          createdAt: '2026-09-18T10:00:00.000Z',
          updatedAt: '2026-09-18T11:00:00.000Z',
          customer: {
            id: 'cust-1',
            fullName: 'Aarav Sharma',
            mobile: '9811122233',
            email: 'aarav@example.com',
            address: '14 Barakhamba Road',
            state: 'Delhi',
            city: 'New Delhi',
            monthlyIncome: 95000,
            aadhaarMasked: 'XXXX XXXX 1122',
            kycStatus: 'APPROVED',
            status: 'ACTIVE',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
          documents: [],
          documentRequests: [],
        },
      });

      renderWithProviders(
        <AdminLoanDetailPage />,
        '/admin/loans/loan-admin-1',
        '/admin/loans/:id'
      );

      await waitFor(() => {
        expect(screen.getAllByText(/LA-2026-000088/).length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText(/Aarav Sharma/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/1122/).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Approve/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Modify Amount/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Request Doc/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Hold/i }).length).toBeGreaterThan(0);
      expect(screen.getAllByRole('button', { name: /Reject/i }).length).toBeGreaterThan(0);
    });
  });
});

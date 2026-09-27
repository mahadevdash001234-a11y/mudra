import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminWhatsAppSettings } from '../pages/admin/AdminWhatsAppSettings';
import { AdminLoansPage } from '../pages/admin/AdminLoansPage';
import { adminService } from '../services/adminService';
import { loanApi } from '../api/loanApi';
import { apiClient } from '../api/client';

// Mock dependencies
vi.mock('../services/adminService', () => ({
  adminService: {
    getWhatsAppSettings: vi.fn(),
    updateWhatsAppSettings: vi.fn(),
    getCommunicationCustomers: vi.fn(),
    sendBulkWhatsApp: vi.fn(),
  },
}));

vi.mock('../api/loanApi', () => ({
  loanApi: {
    getAdminApplications: vi.fn(),
    sendBulkWhatsAppApplications: vi.fn(),
    sendBulkEmailApplications: vi.fn(),
  },
}));

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>
  );
};

describe('WhatsApp Integration & Admin Loans Bulk Messaging Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Admin WhatsApp Settings Page (/admin/settings/whatsapp)', () => {
    it('renders WhatsApp Messaging composer with real customer list', async () => {
      vi.mocked(adminService.getWhatsAppSettings).mockResolvedValueOnce({
        provider: 'WABRIDGE',
        phoneNumber: '+919046833151',
        phoneNumberId: '1032424393284050',
        businessAccountId: '69b16310667cead707b893e1',
        status: 'CONFIGURED',
        hasAccessToken: true,
      });

      vi.mocked(adminService.getCommunicationCustomers).mockResolvedValueOnce({
        success: true,
        data: [
          {
            customerId: 'cust-1',
            customerName: 'Aarav Patel',
            mobile: '9046833151',
            email: 'aarav@test.com',
            applicationId: 'LA-2026-000001',
            loanStatus: 'PENDING',
          },
        ],
        pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
      });

      renderWithProviders(<AdminWhatsAppSettings />);

      await waitFor(() => {
        expect(screen.getAllByText(/WhatsApp Messaging/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Aarav Patel/i).length).toBeGreaterThan(0);
      });

      expect(screen.getByText(/Compose WhatsApp Message/i)).toBeInTheDocument();
    });

    it('switches to Provider Settings tab and allows saving configuration', async () => {
      vi.mocked(adminService.getWhatsAppSettings).mockResolvedValue({
        provider: 'WABRIDGE',
        phoneNumber: '+919046833151',
        businessAccountId: '69b16310667cead707b893e1',
        status: 'CONFIGURED',
        hasAccessToken: true,
      });

      vi.mocked(adminService.getCommunicationCustomers).mockResolvedValue({
        success: true,
        data: [],
        pagination: { total: 0, page: 1, limit: 15, totalPages: 1 },
      });

      renderWithProviders(<AdminWhatsAppSettings />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Provider Settings/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Provider Settings/i }));

      await waitFor(() => {
        expect(screen.getByText(/WA Bridge Server-to-Server Gateway Configuration/i)).toBeInTheDocument();
      });

      expect(screen.getByDisplayValue('+919046833151')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save WhatsApp Configuration/i })).toBeInTheDocument();
    });
  });

  describe('Admin All Applications Page (/admin/loans) Status Filters & Bulk WhatsApp', () => {
    const mockLoans = [
      {
        id: 'app-1',
        applicationNumber: 'LA-2026-000001',
        loanId: 'LA-2026-000001',
        customerName: 'Rahul Deshmukh',
        mobile: '9876543210',
        email: 'rahul@test.com',
        requestedAmount: 500000,
        tenureMonths: 24,
        purpose: 'Business',
        status: 'UNDER_REVIEW',
        state: 'Maharashtra',
        kycStatus: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'app-2',
        applicationNumber: 'LA-2026-000002',
        loanId: 'LA-2026-000002',
        customerName: 'Priya Sharma',
        mobile: '9876543211',
        email: 'priya@test.com',
        requestedAmount: 300000,
        tenureMonths: 12,
        purpose: 'Personal',
        status: 'APPROVED',
        state: 'Karnataka',
        kycStatus: 'VERIFIED',
        createdAt: new Date().toISOString(),
      },
    ];

    it('renders status filter tabs with dynamic counts', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
      vi.mocked(loanApi.getAdminApplications).mockResolvedValue({
        success: true,
        data: mockLoans as any,
        pagination: {
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
        counts: {
          all: 2,
          pending: 1,
          approved: 1,
          rejected: 0,
        },
      });

      renderWithProviders(<AdminLoansPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/Rahul Deshmukh/i).length).toBeGreaterThan(0);
      });

      expect(screen.getByText(/Loan Applications Underwriting/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /All Applications/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pending/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Approved/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Rejected/i })).toBeInTheDocument();
    });

    it('selects all filtered applications and opens bulk WhatsApp modal', async () => {
      vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
      vi.mocked(loanApi.getAdminApplications).mockResolvedValue({
        success: true,
        data: mockLoans as any,
        pagination: {
          total: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        },
        counts: {
          all: 2,
          pending: 1,
          approved: 1,
          rejected: 0,
        },
      });

      renderWithProviders(<AdminLoansPage />);

      await waitFor(() => {
        expect(screen.getAllByText(/Rahul Deshmukh/i).length).toBeGreaterThan(0);
      });

      // Find the select all header checkbox button by title
      const selectAllBtn = screen.getByTitle('Select all filtered');
      fireEvent.click(selectAllBtn);

      // Verify sticky Bulk Action Bar appears
      await waitFor(() => {
        expect(screen.getByText(/2 records selected/i)).toBeInTheDocument();
      });

      // Open Bulk WhatsApp Campaign Modal
      const sendWhatsAppBtn = screen.getByRole('button', { name: /Send WhatsApp/i });
      fireEvent.click(sendWhatsAppBtn);

      // Verify modal content
      await waitFor(() => {
        expect(screen.getByText(/Send WhatsApp Campaign/i)).toBeInTheDocument();
        expect(screen.getByText(/Dispatch personalized WhatsApp messages to 2 borrower\(s\)/i)).toBeInTheDocument();
      });

      // Mock bulk dispatch response
      vi.mocked(loanApi.sendBulkWhatsAppApplications).mockResolvedValueOnce({
        success: true,
        message: 'Bulk WhatsApp campaign completed.',
        data: {
          total: 2,
          sentCount: 2,
          failedCount: 0,
          results: [
            { applicationId: 'app-1', applicationNumber: 'APP-001', recipient: '9876543210', customerName: 'Rahul Deshmukh', success: true, status: 'SENT' },
            { applicationId: 'app-2', applicationNumber: 'APP-002', recipient: '9876543211', customerName: 'Priya Sharma', success: true, status: 'SENT' },
          ],
        },
      });

      // Click Send to Customers
      const dispatchBtn = screen.getByRole('button', { name: /Send to 2 Customers/i });
      fireEvent.click(dispatchBtn);

      await waitFor(() => {
        expect(screen.getByText(/WhatsApp Campaign Completed/i)).toBeInTheDocument();
      });
    });
  });
});

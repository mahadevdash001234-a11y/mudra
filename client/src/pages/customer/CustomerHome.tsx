import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FileText,
  CreditCard,
  Upload,
  ArrowRight,
  Clock,
  HelpCircle,
  FileSignature,
  IndianRupee,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Download,
  Eye,
  Receipt,
  Phone,
  Mail,
  Loader2,
  User,
  AlertTriangle,
  FolderOpen,
  Bell,
  Sparkles,
} from 'lucide-react';
import { useBrandTitle } from '@/hooks/useBrandTitle';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';

interface DashboardResponse {
  customer: {
    id: string;
    fullName: string;
    mobile: string;
    email: string;
    aadhaarMasked: string;
    kycStatus: string;
    status: string;
  };
  kycSummary: {
    status: string;
    progressPercent: number;
    documentsUploaded: number;
    requiredMissing: string[];
  };
  loanSummary: {
    id: string;
    applicationNumber: string;
    requestedAmount: number;
    approvedAmount: number | null;
    tenureMonths: number;
    estimatedEmi: number;
    interestRate?: number;
    status: string;
    paymentStatus: string;
    rejectionReason?: string;
    holdReason?: string;
    docRequestReason?: string;
    hasAgreement: boolean;
    agreementAccepted: boolean;
    isDisbursed: boolean;
    disbursementAmount: number | null;
  } | null;
  timeline: Array<{
    step: string;
    title: string;
    completed: boolean;
    current: boolean;
  }>;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    chargeName: string;
    amount: number;
    taxAmount?: number;
    totalAmount: number;
    status: string;
    chargeId?: string;
    issuedAt: string;
    transactionRef?: string;
    utr?: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
  }>;
}

interface CustomerChargeItem {
  id: string;
  name: string;
  amount: number;
  status: 'PENDING' | 'UNDER_VERIFICATION' | 'PAID' | 'FAILED' | 'CANCELLED';
  remark?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  transactionRef?: string | null;
  loanId?: string | null;
  createdAt: string;
}

interface CustomerDocItem {
  id: string;
  documentType: string;
  fileName: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REUPLOAD_REQUIRED';
  uploadedAt: string;
}

interface CustomerFullProfile {
  id: string;
  fullName: string;
  fatherName?: string;
  gender?: string;
  dob?: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode?: string;
  monthlyIncome?: number;
  aadhaarMasked: string;
  panMasked?: string;
  kycStatus: string;
  status: string;
  createdAt: string;
}

// Normalizes charge names (including all TDS/TSD variations) for clean UI presentation
export const normalizeChargeName = (name: string): string => {
  if (!name) return 'Application Fee';
  const trimmed = name.trim();
  if (/tds|tsd/i.test(trimmed)) {
    return 'TSD/TDS Charges';
  }
  return trimmed;
};

export const CustomerHome: React.FC = () => {
  useBrandTitle('Dashboard');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Apply Eligibility Modals State
  const [eligibilityState, setEligibilityState] = useState<'NONE' | 'KYC_REQUIRED' | 'DOCS_REQUIRED'>('NONE');
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [applyAmount, setApplyAmount] = useState<number>(100000);
  const [applyTenure, setApplyTenure] = useState<number>(12);
  const [applyPurpose, setApplyPurpose] = useState<string>('Business & Financial Development');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Invoice Preview — uses react-pdf canvas renderer via PdfViewerModal
  const invoicePdfViewer = usePdfViewer();
  const letterPdfViewer = usePdfViewer();
  const [invoicePreviewTitle, setInvoicePreviewTitle] = useState('');
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  // 1. Fetch Customer Dashboard Overview
  const { data, isLoading, isError, refetch } = useQuery<DashboardResponse>({
    queryKey: ['customer-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.CUSTOMER);
      return res.data;
    },
    refetchInterval: 2000,
  });

  // 2. Fetch Customer Full Profile (for Customer Information)
  const { data: profileData } = useQuery<CustomerFullProfile>({
    queryKey: ['customerProfileDetail'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMERS.PROFILE);
        return res.data?.data?.profile || res.data?.profile || res.data?.data || res.data;
      } catch {
        return null as any;
      }
    },
    refetchInterval: 3000,
  });

  // 3. Fetch Customer Charges (Direct Charges API)
  const { data: customerChargesData } = useQuery<any>({
    queryKey: ['customerChargesList'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_CHARGES.LIST);
        return res.data?.data || res.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 2000,
  });

  const customerCharges: CustomerChargeItem[] =
    (Array.isArray(customerChargesData) ? customerChargesData : null) ||
    (Array.isArray((customerChargesData as any)?.data) ? (customerChargesData as any).data : null) ||
    [];

  // 4. Fetch Customer Invoices
  const { data: customerInvoicesData } = useQuery<any>({
    queryKey: ['customer-invoices'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/customer/invoices');
        return res.data?.data || res.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 2000,
  });

  const customerInvoices: any[] =
    (Array.isArray(customerInvoicesData) ? customerInvoicesData : null) ||
    (Array.isArray((customerInvoicesData as any)?.data) ? (customerInvoicesData as any).data : null) ||
    [];

  // 5. Fetch Customer Documents to verify 4/4 status
  const { data: customerDocsDataRaw } = useQuery<any>({
    queryKey: ['customer-documents-summary'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_DOCS.LIST);
        return res.data?.data || res.data || { documents: [] };
      } catch {
        return { documents: [] };
      }
    },
    refetchInterval: 2500,
  });

  const uploadedDocsList: CustomerDocItem[] =
    (Array.isArray(customerDocsDataRaw?.documents) ? customerDocsDataRaw.documents : null) ||
    (Array.isArray((customerDocsDataRaw as any)?.data?.documents) ? (customerDocsDataRaw as any).data.documents : null) ||
    (Array.isArray(customerDocsDataRaw) ? customerDocsDataRaw : null) ||
    (Array.isArray((customerDocsDataRaw as any)?.data) ? (customerDocsDataRaw as any).data : null) ||
    [];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse max-w-6xl mx-auto pb-12">
        <div className="h-48 bg-[#0B2147]/20 rounded-3xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-[#E8F1FF] rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-[#E8F1FF] rounded-3xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-[#D7E3F5] bg-red-50/60 p-8 text-center max-w-2xl mx-auto my-12 rounded-3xl shadow-xs">
        <AlertCircle className="w-10 h-10 text-[#DC2626] mx-auto mb-3" />
        <h3 className="text-lg font-bold text-[#0B1220]">Failed to load dashboard data</h3>
        <p className="text-xs text-[#64748B] mt-1 mb-5">We encountered an issue connecting to the financial services API.</p>
        <Button onClick={() => refetch()} size="sm" className="bg-[#155EEF] hover:bg-[#123B8E] text-white font-bold h-10 px-5 rounded-xl shadow-xs">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry Connection
        </Button>
      </Card>
    );
  }

  const { customer, kycSummary, loanSummary, timeline } = data;

  const distinctDocTypes = new Set(uploadedDocsList.map((d) => d.documentType));
  const uploadedCount = ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF', 'OTHER'].filter((t) => distinctDocTypes.has(t)).length;
  const allDocsReady = uploadedCount >= 3; // 3 mandatory (PAN, Bank, Income)
  const isKycApproved = (customer.kycStatus === 'APPROVED' || customer.kycStatus === 'VERIFIED' || kycSummary.status === 'APPROVED' || kycSummary.status === 'VERIFIED');

  // Authoritative charges from database via API
  const rawCharges: CustomerChargeItem[] = [...customerCharges];

  const chargeDupMap = new Map<string, CustomerChargeItem>();
  for (const c of rawCharges) {
    const key = c.name.trim();
    const existing = chargeDupMap.get(key);
    if (!existing) {
      chargeDupMap.set(key, c);
    } else {
      if (existing.status !== 'PAID' && c.status === 'PAID') {
        chargeDupMap.set(key, c);
      } else if (existing.status !== 'PAID' && c.status === 'UNDER_VERIFICATION' && c.transactionRef) {
        chargeDupMap.set(key, c);
      }
    }
  }
  const allApplicableCharges = Array.from(chargeDupMap.values());

  // Combined Invoices list (prioritize /customer/invoices then dashboard.invoices)
  const invoicesList = (customerInvoices && customerInvoices.length > 0)
    ? customerInvoices
    : (data?.invoices && data.invoices.length > 0)
    ? data.invoices
    : [];

  // Handler for Primary "Apply for Loan" CTA with 3-State Stage Verification
  const handleApplyClick = () => {
    if (!isKycApproved) {
      setEligibilityState('KYC_REQUIRED');
      return;
    }
    if (!allDocsReady) {
      setEligibilityState('DOCS_REQUIRED');
      return;
    }
    setEligibilityState('NONE');
    setApplyModalOpen(true);
  };

  // KYC Badge renderer
  const getKycBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'VERIFIED':
        return <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 font-bold px-2.5 py-0.5">KYC Approved ✓</Badge>;
      case 'UNDER_REVIEW':
        return <Badge className="bg-[#E8F1FF] text-[#155EEF] border border-[#D7E3F5] font-bold px-2.5 py-0.5">KYC Under Review</Badge>;
      case 'REUPLOAD_REQUIRED':
        return <Badge className="bg-amber-50 text-[#F59E0B] border border-amber-200 font-bold px-2.5 py-0.5">KYC Re-upload Required</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-50 text-[#DC2626] border border-rose-200 font-bold px-2.5 py-0.5">KYC Rejected</Badge>;
      default:
        return <Badge className="bg-slate-100 text-[#64748B] border border-slate-200 font-semibold px-2.5 py-0.5">KYC Pending</Badge>;
    }
  };

  // Loan Status Badge renderer
  const getLoanStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 font-bold px-3 py-1">Sanctioned & Approved ✓</Badge>;
      case 'OFFER_PENDING_CUSTOMER':
        return <Badge className="bg-purple-50 text-purple-700 border border-purple-200 font-bold px-3 py-1">Offer Ready</Badge>;
      case 'DOCUMENTS_REQUIRED':
        return <Badge className="bg-amber-50 text-[#F59E0B] border border-amber-200 font-bold px-3 py-1">Documents Required</Badge>;
      case 'ON_HOLD':
        return <Badge className="bg-amber-50 text-[#F59E0B] border border-amber-200 font-bold px-3 py-1">On Underwriting Hold</Badge>;
      case 'REJECTED':
        return <Badge className="bg-rose-50 text-[#DC2626] border border-rose-200 font-bold px-3 py-1">Application Declined</Badge>;
      default:
        return <Badge className="bg-[#E8F1FF] text-[#155EEF] border border-[#D7E3F5] font-bold px-3 py-1">In Underwriting Review</Badge>;
    }
  };

  // Handlers for Invoice — using authenticated arraybuffer fetch, no blob: URL navigation
  const handleViewInvoice = async (invoiceIdOrChargeId: string, title = 'Tax Invoice') => {
    setInvoicePreviewTitle(title);
    // fetchAndOpen opens modal immediately and fetches PDF bytes via apiClient arraybuffer
    let endpoint = API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(invoiceIdOrChargeId, false);
    await invoicePdfViewer.fetchAndOpen(endpoint);
  };

  const handleDownloadInvoice = async (invoiceIdOrChargeId: string, invoiceNumberOrName: string) => {
    try {
      setDownloadingInvoiceId(invoiceIdOrChargeId);
      let res;
      try {
        res = await apiClient.get(
          API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(invoiceIdOrChargeId, true),
          { responseType: 'arraybuffer' }
        );
      } catch {
        res = await apiClient.get(`/customer/invoices/${invoiceIdOrChargeId}/pdf?download=true`, { responseType: 'arraybuffer' });
      }
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${invoiceNumberOrName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      alert('Unable to download invoice PDF. Please try again.');
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  // Apply For Loan directly from Dashboard (Using Existing POST /customer/loan-applications)
  const handleApplyLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingLoan(true);
    setApplyError(null);

    try {
      await apiClient.post(API_ENDPOINTS.LOANS.CUSTOMER_APPLY, {
        amount: Number(applyAmount),
        tenureMonths: Number(applyTenure),
        purpose: applyPurpose,
      });

      setApplyModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customerLoans'] });
      queryClient.invalidateQueries({ queryKey: ['adminLoanApplications'] });
      queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
      refetch();
    } catch (err: any) {
      setApplyError(err.response?.data?.message || 'Failed to submit loan application. Please try again.');
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  const customerName = profileData?.fullName || customer.fullName;
  const fatherName = profileData?.fatherName || '—';
  const mobileNumber = profileData?.mobile || customer.mobile;
  const emailAddress = profileData?.email || customer.email;
  const gender = profileData?.gender || '—';
  const dob = profileData?.dob || '—';
  const address = profileData?.address || (customer as any).address || '—';
  const city = profileData?.city || (customer as any).city || '—';
  const state = profileData?.state || (customer as any).state || '—';
  const pincode = profileData?.pincode || '—';

  // Sanctioned Loan Derived Values (Strictly calculated only if loan is APPROVED)
  const isLoanApproved = loanSummary?.status === 'APPROVED';
  const sanctionedAmount = (isLoanApproved && loanSummary?.approvedAmount) ? loanSummary.approvedAmount : 0;
  const interestRateValue = loanSummary?.interestRate || 8.5;
  const monthlyEmiValue = isLoanApproved ? ((loanSummary as any)?.finalEmi || loanSummary?.estimatedEmi || 0) : 0;
  const tenureValue = loanSummary?.tenureMonths || 12;
  const totalPayableValue = (isLoanApproved && monthlyEmiValue > 0) ? monthlyEmiValue * tenureValue : 0;
  const totalInterestValue = (isLoanApproved && totalPayableValue > sanctionedAmount) ? Math.max(0, totalPayableValue - sanctionedAmount) : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16 text-[#0B1220]">
      {/* ========================================================================= */}
      {/* 1. LOAN OVERVIEW (HERO CONTAINER: DARK NAVY → NESTED LIGHT CARDS)        */}
      {/* ========================================================================= */}
      <div id="section-loan-overview" className="space-y-4">
        <div className="bg-gradient-to-br from-[#07152F] via-[#0B2147] to-[#123B8E] text-white border-2 border-[#155EEF]/30 rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-950/20 space-y-6">
          {/* Top Hero Info Row */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-[#123B8E]/50">
            <div>
              <span className="text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider block mb-1">
                1. LOAN OVERVIEW
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {getGreeting()}, {customerName}!
              </h1>
              <p className="text-xs sm:text-sm text-[#D7E3F5] mt-1 font-mono">
                {loanSummary ? `Application #${loanSummary.applicationNumber}` : `Customer Account #${customer.id.slice(0, 8).toUpperCase()}`}
              </p>
              <div className="flex items-center gap-2 mt-2 text-xs text-[#D7E3F5]">
                <span>Registered Borrower: <strong className="text-white">+91 {mobileNumber}</strong></span>
                <span>•</span>
                <span>Aadhaar: <strong className="text-white">{customer.aadhaarMasked}</strong></span>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#3B82F6] block">
                CURRENT LOAN STATUS
              </span>
              {loanSummary ? (
                <div>{getLoanStatusBadge(loanSummary.status)}</div>
              ) : (
                <Badge className="bg-[#155EEF]/20 text-[#3B82F6] border border-[#155EEF]/40 font-bold px-3 py-1">
                  Ready to Apply
                </Badge>
              )}
            </div>
          </div>

          {/* Nested Light Financial Particular Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white rounded-2xl p-4 border border-[#D7E3F5] text-[#0B1220] shadow-sm space-y-1">
              <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Loan Type</span>
              <span className="text-base sm:text-lg font-black text-[#0B1220] block">Personal Loan</span>
              <span className="text-[10px] text-[#64748B]">Financing Facility</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#D7E3F5] text-[#0B1220] shadow-sm space-y-1">
              <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Loan Amount</span>
              <span className="text-base sm:text-lg font-black text-[#0B1220] font-mono block">
                {loanSummary ? (isLoanApproved && loanSummary.approvedAmount ? `₹${loanSummary.approvedAmount.toLocaleString('en-IN')}` : `₹${loanSummary.requestedAmount.toLocaleString('en-IN')}`) : '—'}
              </span>
              <span className="text-[10px] text-[#64748B]">
                {isLoanApproved && loanSummary?.approvedAmount ? 'Sanctioned credit' : 'Borrower requested'}
              </span>
            </div>

            <div className="bg-[#F4F8FF] rounded-2xl p-4 border border-[#D7E3F5] text-[#0B1220] shadow-sm space-y-1">
              <span className="text-[10px] text-[#155EEF] uppercase font-bold tracking-wider block">Monthly EMI</span>
              <span className="text-base sm:text-lg font-black text-[#155EEF] font-mono block">
                {isLoanApproved && monthlyEmiValue > 0 ? `₹${monthlyEmiValue.toLocaleString('en-IN')}` : 'Under Review'}
              </span>
              <span className="text-[10px] text-[#64748B]">Monthly installment</span>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-[#D7E3F5] text-[#0B1220] shadow-sm space-y-1">
              <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Next EMI</span>
              <span className="text-base sm:text-lg font-bold text-[#0B1220] block">
                {loanSummary?.status === 'APPROVED' ? 'Immediate upon sanction' : '—'}
              </span>
              <span className="text-[10px] text-[#64748B]">Repayment cycle</span>
            </div>
          </div>

          {/* Hero Action Controls */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {getKycBadge(customer.kycStatus || kycSummary.status)}
              <Badge variant="outline" className="text-xs bg-white/10 text-white border-white/20 font-semibold">
                Account Active
              </Badge>
            </div>

            <div className="flex items-center gap-2.5">
              {loanSummary ? (
                <Link to={`/customer/loans/${loanSummary.id}`}>
                  <Button className="h-10 px-5 bg-[#155EEF] hover:bg-[#123B8E] text-white text-xs font-bold rounded-xl shadow-md inline-flex items-center gap-2">
                    <span>View Loan Details</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              ) : (
                <Button
                  data-testid="hero-apply-loan-btn"
                  onClick={handleApplyClick}
                  className="h-10 px-6 bg-[#155EEF] hover:bg-[#123B8E] text-white text-xs font-bold rounded-xl shadow-md inline-flex items-center gap-2"
                >
                  <IndianRupee className="w-4 h-4" />
                  <span>Apply for Loan</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. QUICK ACTIONS (6 FUNCTIONAL NAVIGATION SHORTCUTS)                     */}
      {/* ========================================================================= */}
      <div id="section-quick-actions" className="space-y-3">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-3">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              2. QUICK ACTIONS
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220]">
              QUICK ACTIONS
            </h2>
            <p className="text-xs text-[#64748B]">Fast navigation shortcuts to all essential borrower facilities</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
            <Link
              to={loanSummary ? `/customer/loans/${loanSummary.id}` : '/customer/loans'}
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <IndianRupee className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">View My Loan</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Application info</span>
            </Link>

            <Link
              to="/customer/kyc"
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">KYC Verification</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Aadhaar identity</span>
            </Link>

            <Link
              to="/customer/documents"
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">My Documents</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Upload & history</span>
            </Link>

            <Link
              to="/customer/loans"
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <Clock className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">Loan History</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Applications list</span>
            </Link>

            <Link
              to="/customer/payments"
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">Payments & Charges</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Settlement rails</span>
            </Link>

            <Link
              to="/customer/support"
              className="p-3.5 rounded-2xl bg-white border border-[#D7E3F5] hover:border-[#155EEF] hover:shadow-md transition-all group flex flex-col items-center text-center shadow-xs"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                <HelpCircle className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-[#0B1220]">Borrower Support</span>
              <span className="text-[10px] text-[#64748B] mt-0.5">Helpdesk tickets</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LOAN FINANCIAL SUMMARY                                                 */}
      {/* ========================================================================= */}
      <div id="section-financial-summary" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              3. LOAN FINANCIAL SUMMARY
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
              <IndianRupee className="w-4 h-4 text-[#155EEF]" />
              <span>LOAN FINANCIAL SUMMARY</span>
            </h2>
            <p className="text-xs text-[#64748B]">Key financial breakdown and repayment terms</p>
          </div>

          {loanSummary ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block">Loan Requested</span>
                <span className="text-lg sm:text-xl font-black text-[#0B1220] font-mono block">
                  ₹{loanSummary.requestedAmount.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-[#64748B]">Borrower applied amount</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#16A34A] font-bold uppercase tracking-wider block">Sanctioned Amount</span>
                <span className="text-lg sm:text-xl font-black text-[#16A34A] font-mono block">
                  {isLoanApproved && loanSummary.approvedAmount ? `₹${loanSummary.approvedAmount.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Approved credit ceiling</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#155EEF] font-bold uppercase tracking-wider block">Monthly EMI</span>
                <span className="text-lg sm:text-xl font-black text-[#155EEF] font-mono block">
                  {isLoanApproved && monthlyEmiValue > 0 ? `₹${monthlyEmiValue.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Monthly installment</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block">Interest Rate</span>
                <span className="text-lg sm:text-xl font-black text-[#0B1220] block">
                  {interestRateValue}% p.a.
                </span>
                <span className="text-[10px] text-[#64748B]">Floating benchmark</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block">Tenure</span>
                <span className="text-lg sm:text-xl font-black text-[#0B1220] block">
                  {tenureValue} Months
                </span>
                <span className="text-[10px] text-[#64748B]">Repayment duration</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block">Total Interest</span>
                <span className="text-lg sm:text-xl font-black text-amber-700 font-mono block">
                  {isLoanApproved && totalInterestValue > 0 ? `₹${totalInterestValue.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Cumulative interest</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider block">Total Repayment</span>
                <span className="text-lg sm:text-xl font-black text-[#0B1220] font-mono block">
                  {isLoanApproved && totalPayableValue > 0 ? `₹${totalPayableValue.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Principal + Interest</span>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-1">
                <span className="text-[10px] text-[#16A34A] font-bold uppercase tracking-wider block">Disbursement Status</span>
                <span className="text-sm font-black text-[#16A34A] block">
                  {loanSummary.isDisbursed
                    ? `Disbursed ₹${(loanSummary.disbursementAmount || sanctionedAmount).toLocaleString('en-IN')}`
                    : loanSummary.status === 'APPROVED'
                    ? 'Sanctioned • Ready'
                    : 'Underwriting Pending'}
                </span>
                <span className="text-[10px] text-[#64748B]">
                  {loanSummary.isDisbursed ? 'Deposited to bank' : 'Awaiting final clearance'}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center bg-white border border-[#D7E3F5] rounded-2xl shadow-xs space-y-3">
              <IndianRupee className="w-8 h-8 text-[#155EEF] mx-auto opacity-70" />
              <h4 className="text-sm font-bold text-[#0B1220]">No active loan application yet</h4>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                Complete your KYC and document upload to submit your formal loan application immediately.
              </p>
              <Button
                onClick={handleApplyClick}
                className="h-10 px-6 bg-[#155EEF] hover:bg-[#123B8E] text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2"
              >
                <IndianRupee className="w-4 h-4" />
                <span>Apply for Loan</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. CHARGES & FEES (DEDICATED FINANCIAL SECTION)                           */}
      {/* ========================================================================= */}
      <div id="section-charges-and-fees" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-7 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
                4. CHARGES & FEES
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#155EEF]" />
                <span>CHARGES & FEES</span>
              </h2>
              <p className="text-xs text-[#64748B]">All applicable charges and payment settlements.</p>
              <span className="text-[11px] font-bold text-[#64748B] block mt-0.5">APPLIED CHARGES & FEES</span>
            </div>
            <Badge className="bg-[#F4F8FF] text-[#155EEF] border border-[#D7E3F5] text-xs font-bold px-3 py-1 w-fit">
              {allApplicableCharges.length} Applicable Charges
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allApplicableCharges.map((chg) => {
              const displayName = normalizeChargeName(chg.name);
              const isPaid = chg.status === 'PAID';
              const isUnderVerification = chg.status === 'UNDER_VERIFICATION' || (Boolean(chg.transactionRef) && !isPaid);

              // Strict Invoice Matching by charge ID, then invoice ID, then exact normalized name
              const matchedInvoice = invoicesList.find(
                (inv: any) =>
                  inv.chargeId === chg.id ||
                  inv.id === chg.id ||
                  (inv.chargeName && normalizeChargeName(inv.chargeName).toLowerCase() === displayName.toLowerCase())
              );

              return (
                <div
                  key={chg.id}
                  className={`p-5 rounded-2xl border transition-all bg-white shadow-xs space-y-4 ${
                    isPaid ? 'border-emerald-200 bg-emerald-50/20' : 'border-[#D7E3F5] hover:border-[#155EEF]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-[#0B1220]">{displayName}</span>
                        {displayName.includes('TDS') && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E8F1FF] text-[#155EEF] border border-[#D7E3F5]">
                            Statutory
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B]">{chg.remark || 'Official Application Processing Fee'}</p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-lg sm:text-xl font-black text-[#0B1220] font-mono block">
                        ₹{chg.amount.toLocaleString('en-IN')}
                      </span>
                      {isPaid ? (
                        <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold px-2 py-0.5 mt-1">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> PAID ✓
                        </Badge>
                      ) : isUnderVerification ? (
                        <Badge className="bg-blue-50 text-[#155EEF] border border-blue-200 text-[10px] font-bold px-2 py-0.5 mt-1">
                          <Clock className="w-3 h-3 mr-1" /> PENDING VERIFICATION
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-[#F59E0B] border border-amber-200 text-[10px] font-bold px-2 py-0.5 mt-1">
                          <AlertCircle className="w-3 h-3 mr-1" /> PAYMENT REQUIRED
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#D7E3F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="text-[11px] text-[#64748B]">
                      {isPaid ? (
                        <span>
                          Settled: <strong className="text-[#16A34A]">{new Date(chg.paidAt || chg.createdAt).toLocaleDateString('en-IN')}</strong>
                          {chg.transactionRef && <> • UTR: <strong className="font-mono text-[#0B1220]">{chg.transactionRef}</strong></>}
                        </span>
                      ) : isUnderVerification ? (
                        <span>Submitted UTR: <strong className="font-mono text-[#0B1220]">{chg.transactionRef}</strong></span>
                      ) : (
                        <span>Status: <strong className="text-amber-700">Payment settlement required</strong></span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {isPaid ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewInvoice(matchedInvoice?.id || chg.id, `${displayName} Invoice`)}
                            className="text-xs h-9 px-3 border-[#D7E3F5] text-[#0B1220] hover:bg-[#E8F1FF] font-semibold rounded-xl bg-white shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-[#155EEF]" /> View Invoice
                          </Button>
                          <Button
                            size="sm"
                            disabled={downloadingInvoiceId === (matchedInvoice?.id || chg.id)}
                            onClick={() => handleDownloadInvoice(matchedInvoice?.id || chg.id, matchedInvoice?.invoiceNumber || displayName)}
                            className="text-xs h-9 px-3.5 bg-[#16A34A] hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                          >
                            {downloadingInvoiceId === (matchedInvoice?.id || chg.id) ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5 mr-1" /> Download
                              </>
                            )}
                          </Button>
                        </>
                      ) : isUnderVerification ? (
                        <span className="text-[11px] text-[#155EEF] font-semibold bg-[#E8F1FF] px-3 py-1.5 rounded-xl border border-[#D7E3F5]">
                          Pending Verification
                        </span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              navigate(`/customer/payments?charge=${chg.id}`);
                            }}
                            className="bg-[#155EEF] hover:bg-[#123B8E] text-white text-xs h-9 px-4 font-bold rounded-xl shadow-xs flex items-center gap-1 cursor-pointer"
                          >
                            <span>Pay Now</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                          <Link to={`/customer/payments?charge=${chg.id}`}>
                            <Button variant="outline" size="sm" className="text-xs h-9 px-3 border-[#D7E3F5] text-[#0B1220] font-semibold rounded-xl bg-white">
                              Details
                            </Button>
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. PAYMENTS & INVOICES (HISTORICAL PAYMENT RECORDS)                       */}
      {/* ========================================================================= */}
      <div id="section-payment-invoices" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              5. PAYMENTS & INVOICES
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#155EEF]" />
              <span>PAYMENTS & INVOICES</span>
            </h2>
            <p className="text-xs text-[#64748B]">Historical payment records and authoritative tax invoices</p>
            <span className="text-[11px] font-bold text-[#64748B] block mt-0.5">PAYMENT & INVOICE HISTORY</span>
          </div>

          {invoicesList && invoicesList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {invoicesList.map((inv: any) => {
                const displayName = normalizeChargeName(inv.chargeName || 'Application Fee');
                const amountPaid = inv.totalAmount || inv.amount || 0;
                const appId = loanSummary?.applicationNumber || inv.applicationId || `APP-${customer.id.slice(0, 6).toUpperCase()}`;
                const invoiceId = inv.id || inv.chargeId;

                return (
                  <div
                    key={inv.id || inv.invoiceNumber}
                    className="p-5 rounded-2xl bg-white border border-[#D7E3F5] flex flex-col justify-between hover:shadow-md transition-all shadow-xs space-y-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-sm text-[#0B1220] block">{displayName}</span>
                          <span className="text-xs font-mono font-bold text-[#155EEF]">Invoice #{inv.invoiceNumber}</span>
                        </div>
                        <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold px-2 py-0.5">
                          PAID ✓
                        </Badge>
                      </div>

                      <div className="space-y-1.5 p-3 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/60 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Application ID:</span>
                          <span className="font-semibold text-[#0B1220] font-mono">{appId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">Amount Paid:</span>
                          <span className="font-black text-[#16A34A] font-mono">₹{amountPaid.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#64748B]">UTR Reference:</span>
                          <span className="font-mono text-[#0B1220] font-medium">{inv.utr || inv.transactionRef || 'UTR Verified'}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#64748B]">Payment Date:</span>
                          <span className="text-[#0B1220]">
                            {inv.issuedAt || inv.paidAt ? new Date(inv.issuedAt || inv.paidAt).toLocaleDateString('en-IN') : 'Recent'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[#D7E3F5]">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewInvoice(inv.chargeId || inv.id, `${displayName} Invoice`)}
                        className="flex-1 h-9 text-xs border-[#D7E3F5] text-[#0B1220] hover:bg-[#E8F1FF] font-semibold rounded-xl bg-white shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 text-[#155EEF]" /> View Invoice
                      </Button>
                      <Button
                        size="sm"
                        disabled={downloadingInvoiceId === invoiceId}
                        onClick={() => handleDownloadInvoice(inv.chargeId || inv.id, inv.invoiceNumber || displayName)}
                        className="flex-1 h-9 text-xs bg-[#16A34A] hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs"
                      >
                        {downloadingInvoiceId === invoiceId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 mr-1" /> Download
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center bg-white border border-[#D7E3F5] rounded-2xl shadow-xs space-y-2">
              <Receipt className="w-8 h-8 text-[#64748B] mx-auto opacity-50" />
              <h4 className="text-sm font-bold text-[#0B1220]">No invoices issued yet</h4>
              <p className="text-xs text-[#64748B] max-w-md mx-auto">
                Official tax invoices appear automatically upon verified payment of application charges.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. LOAN STATUS / PROGRESS (BORROWER JOURNEY & LOAN LIFECYCLE)              */}
      {/* ========================================================================= */}
      <div id="section-loan-status-progress" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              6. LOAN STATUS / PROGRESS
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#155EEF]" />
              <span>LOAN STATUS / PROGRESS</span>
            </h2>
            <p className="text-xs text-[#64748B]">Borrower Journey & Loan Lifecycle: Live stage-by-stage audit trail from application submission to bank disbursement</p>
            <span className="text-[11px] font-bold text-[#64748B] block mt-0.5">LOAN PROGRESS</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#D7E3F5] p-5 sm:p-6 shadow-xs">
            <div className="relative py-2">
              <div className="hidden md:block absolute top-6 left-8 right-8 h-0.5 bg-[#D7E3F5] z-0" />
              <div className="hidden md:flex items-start justify-between relative z-10">
                {timeline.map((item, idx) => (
                  <div key={item.step} className="flex flex-col items-center text-center max-w-[120px]">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs mb-2 transition-all ${
                        item.completed
                          ? 'bg-[#16A34A] text-white shadow-xs'
                          : item.current
                          ? 'bg-[#155EEF] text-white ring-4 ring-blue-100 font-bold'
                          : 'bg-[#F4F8FF] text-[#64748B] border border-[#D7E3F5]'
                      }`}
                    >
                      {item.completed ? '✓' : idx + 1}
                    </div>
                    <span className={`text-xs font-semibold leading-tight ${item.completed || item.current ? 'text-[#0B1220]' : 'text-[#64748B]'}`}>
                      {item.title}
                    </span>
                    {item.current && (
                      <span className="mt-1 text-[10px] font-bold text-[#155EEF] bg-[#E8F1FF] px-2 py-0.5 rounded-full border border-[#D7E3F5]">
                        Current
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="md:hidden space-y-3">
                {timeline.map((item, idx) => (
                  <div key={item.step} className="flex items-center space-x-3">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                        item.completed
                          ? 'bg-[#16A34A] text-white shadow-xs'
                          : item.current
                          ? 'bg-[#155EEF] text-white ring-2 ring-blue-200'
                          : 'bg-[#F4F8FF] text-[#64748B] border border-[#D7E3F5]'
                      }`}
                    >
                      {item.completed ? '✓' : idx + 1}
                    </div>
                    <span className={`text-xs font-semibold ${item.completed || item.current ? 'text-[#0B1220]' : 'text-[#64748B]'}`}>
                      {item.title}
                    </span>
                    {item.current && <Badge className="text-[10px] h-4 bg-[#E8F1FF] text-[#155EEF] border-[#D7E3F5] font-bold">Current</Badge>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 8-Stage Audit Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B1220]">1. Application</span>
                <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Completed ✓
                </span>
              </div>
              <p className="text-xs text-[#64748B]">
                {loanSummary ? `Application #${loanSummary.applicationNumber} registered` : 'Customer account established'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B1220]">2. KYC Verification</span>
                {isKycApproved ? (
                  <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Approved ✓
                  </span>
                ) : kycSummary.status === 'UNDER_REVIEW' ? (
                  <span className="text-[10px] font-bold text-[#155EEF] bg-[#E8F1FF] px-2 py-0.5 rounded-full border border-[#D7E3F5]">
                    In Review
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-[#F59E0B] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B]">
                {isKycApproved ? 'Aadhaar identity verified' : `${kycSummary.progressPercent}% checklist completed`}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B1220]">3. Loan Documents</span>
                {allDocsReady ? (
                  <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    {uploadedCount}/4 Uploaded ✓
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-[#F59E0B] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    {uploadedCount}/4 Uploaded
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B]">
                {allDocsReady ? 'Mandatory documents uploaded' : 'Upload remaining documents'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0B1220]">4. Underwriting</span>
                {loanSummary?.status === 'APPROVED' ? (
                  <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Approved ✓
                  </span>
                ) : loanSummary?.status === 'REJECTED' ? (
                  <span className="text-[10px] font-bold text-[#DC2626] bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    Declined
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-[#155EEF] bg-[#E8F1FF] px-2 py-0.5 rounded-full border border-[#D7E3F5]">
                    In Review
                  </span>
                )}
              </div>
              <p className="text-xs text-[#64748B]">
                {loanSummary?.status === 'APPROVED' ? 'Credit appraisal cleared' : 'Risk & eligibility assessment'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. KYC & DOCUMENTS                                                        */}
      {/* ========================================================================= */}
      <div id="section-kyc-documents" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              7. KYC & DOCUMENTS
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#155EEF]" />
              <span>KYC & DOCUMENTS</span>
            </h2>
            <p className="text-xs text-[#64748B]">Government identity verification and regulatory KYC compliance record</p>
          </div>

          <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-[#0B1220]">Aadhaar Front & Back Identity Verification</h3>
                  {isKycApproved ? (
                    <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 font-bold text-[10px] px-2.5 py-0.5">
                      VERIFIED ✓
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-800 border border-amber-200 font-bold text-[10px] px-2.5 py-0.5">
                      CHECKLIST PENDING
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[#64748B]">
                  Masked Aadhaar: <strong className="font-mono text-[#0B1220]">{customer.aadhaarMasked}</strong> • Completion: <strong>{kycSummary.progressPercent}%</strong>
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Link to="/customer/kyc">
                <Button variant="outline" size="sm" className="h-9 px-4 text-xs border-[#D7E3F5] text-[#0B1220] hover:bg-[#E8F1FF] font-semibold rounded-xl bg-white shadow-xs">
                  <Eye className="w-3.5 h-3.5 mr-1 text-[#155EEF]" /> View KYC Details
                </Button>
              </Link>
              {!isKycApproved && (
                <Link to="/customer/kyc">
                  <Button size="sm" className="h-9 px-4 text-xs bg-[#155EEF] hover:bg-[#123B8E] text-white font-bold rounded-xl shadow-xs">
                    Complete KYC
                  </Button>
                </Link>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {[
              { title: 'PAN Card', type: 'PAN', desc: 'Identity & tax ID verification' },
              { title: 'Bank Statement', type: 'BANK_STATEMENT', desc: 'Last 3-6 months banking records' },
              { title: 'Income Proof / Slip', type: 'INCOME_PROOF', desc: 'Monthly income documentation' },
              { title: 'Other Documents', type: 'OTHER', desc: 'Supporting documentation files' },
            ].map((item) => {
              const isUploaded = uploadedDocsList.some((d) => d.documentType === item.type && d.status !== 'REJECTED');
              return (
                <div key={item.type} className="p-4 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0B1220]">{item.title}</span>
                    {isUploaded ? (
                      <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Uploaded ✓
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[#F59E0B] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#64748B]">{item.desc}</p>
                  <Link to="/customer/documents" className="block pt-1">
                    <Button variant="outline" size="sm" className="w-full text-[11px] h-8 border-[#D7E3F5] text-[#155EEF] hover:bg-[#E8F1FF] rounded-lg">
                      {isUploaded ? 'View Document' : 'Upload File'}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8. LOAN DOCUMENTS (OFFICIAL SANCTIONS, CONTRACTS, INVOICES)               */}
      {/* ========================================================================= */}
      <div id="section-loan-documents" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
                8. LOAN DOCUMENTS
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#155EEF]" />
                <span>LOAN DOCUMENTS</span>
              </h2>
              <p className="text-xs text-[#64748B]">Official loan sanctions, legal agreements, and statutory documentation</p>
            </div>
            <Link to="/customer/documents">
              <Button variant="outline" size="sm" className="text-xs h-8 px-3 border-[#D7E3F5] text-[#0B1220] font-semibold rounded-xl bg-white shadow-xs">
                Document Center
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Approval Letter */}
            <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  {loanSummary?.status === 'APPROVED' ? (
                    <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold">
                      AVAILABLE
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-[#64748B] border border-slate-200 text-[10px] font-bold">
                      UNDER REVIEW
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#0B1220]">Loan Approval Letter</h3>
                <p className="text-xs text-[#64748B]">Official loan approval document featuring company verification seal.</p>
              </div>

              <div className="pt-2 border-t border-[#D7E3F5] flex gap-2">
                {loanSummary?.status === 'APPROVED' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        letterPdfViewer.fetchAndOpen(`/customer/loans/${loanSummary.id}/approval-letter/pdf`);
                      }}
                      className="flex-1 h-8 text-xs border-[#D7E3F5] text-[#0B1220] hover:bg-[#E8F1FF] rounded-lg"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-[#155EEF]" /> View
                    </Button>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await apiClient.get(`/customer/loans/${loanSummary.id}/approval-letter/pdf?download=true`, { responseType: 'blob' });
                          const blob = new Blob([res.data], { type: 'application/pdf' });
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `Approval_Letter_${loanSummary.applicationNumber}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        } catch {
                          alert('Could not download approval letter.');
                        }
                      }}
                      className="flex-1 h-8 text-xs bg-[#155EEF] hover:bg-[#123B8E] text-white font-bold rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" /> Download PDF
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-[#64748B] italic py-1">Available upon underwriting sanction</span>
                )}
              </div>
            </div>

            {/* 2. Loan Agreement */}
            <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                    <FileSignature className="w-5 h-5" />
                  </div>
                  {loanSummary?.agreementAccepted ? (
                    <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold">
                      SIGNED ✓
                    </Badge>
                  ) : loanSummary?.status === 'APPROVED' ? (
                    <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                      PENDING SIGNATURE
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-100 text-[#64748B] border border-slate-200 text-[10px] font-bold">
                      PREPARING
                    </Badge>
                  )}
                </div>
                <h3 className="text-sm font-bold text-[#0B1220]">Loan Agreement</h3>
                <p className="text-xs text-[#64748B]">Master Loan Agreement contract electronically executed between parties.</p>
              </div>

              <div className="pt-2 border-t border-[#D7E3F5]">
                {loanSummary?.status === 'APPROVED' ? (
                  <Link to={`/customer/agreement/${loanSummary.id}`} className="block">
                    <Button className={`w-full h-8 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 ${
                      loanSummary.agreementAccepted ? 'bg-[#155EEF] hover:bg-[#123B8E] text-white' : 'bg-[#16A34A] hover:bg-emerald-700 text-white'
                    }`}>
                      {loanSummary.agreementAccepted ? (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Signed Agreement</span>
                        </>
                      ) : (
                        <>
                          <FileSignature className="w-3.5 h-3.5" />
                          <span>Review & Sign Agreement</span>
                        </>
                      )}
                    </Button>
                  </Link>
                ) : (
                  <span className="text-xs text-[#64748B] italic py-1 block">Prepared upon loan approval</span>
                )}
              </div>
            </div>

            {/* 3. Payment Invoices */}
            <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold">
                    AVAILABLE
                  </Badge>
                </div>
                <h3 className="text-sm font-bold text-[#0B1220]">Payment Invoices</h3>
                <p className="text-xs text-[#64748B]">Authoritative PDF Tax Invoices for verified application payments.</p>
              </div>

              <div className="pt-2 border-t border-[#D7E3F5]">
                <a
                  href="#section-payment-invoices"
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('section-payment-invoices')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block"
                >
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs border-[#D7E3F5] text-[#0B1220] hover:bg-[#E8F1FF] font-semibold rounded-lg">
                    <Eye className="w-3.5 h-3.5 mr-1 text-[#155EEF]" /> View Invoices
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 9. CUSTOMER INFORMATION (SIGNUP/PROFILE DATA ONLY — NO BANK ACCOUNT)       */}
      {/* ========================================================================= */}
      <div id="section-customer-info" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
                9. CUSTOMER INFORMATION
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
                <User className="w-4 h-4 text-[#155EEF]" />
                <span>CUSTOMER INFORMATION</span>
              </h2>
              <p className="text-xs text-[#64748B]">Personal details provided during registration</p>
            </div>
            <Link to="/customer/profile">
              <Button variant="outline" size="sm" className="text-xs h-8 px-3 border-[#D7E3F5] text-[#0B1220] font-semibold rounded-xl bg-white shadow-xs">
                Edit Profile
              </Button>
            </Link>
          </div>

          <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Customer Name</span>
                <span className="text-sm font-bold text-[#0B1220] block">{customerName}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Father / Guardian Name</span>
                <span className="text-sm font-semibold text-[#0B1220] block">{fatherName}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Mobile Phone</span>
                <span className="text-sm font-mono font-bold text-[#0B1220] block">+91 {mobileNumber}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Email Address</span>
                <span className="text-sm font-medium text-[#0B1220] truncate block">{emailAddress}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Gender</span>
                <span className="text-sm font-semibold text-[#0B1220] block">{gender}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Date of Birth</span>
                <span className="text-sm font-semibold text-[#0B1220] block">{dob}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Customer ID</span>
                <span className="text-sm font-mono font-bold text-[#155EEF] block">#{customer.id.slice(0, 10).toUpperCase()}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Account Status</span>
                <span className="text-sm font-bold text-[#16A34A] block">{isKycApproved ? 'KYC Approved / Active ✓' : 'Active Account'}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F8FF] border border-[#D7E3F5]/80 space-y-1 sm:col-span-2 lg:col-span-4">
                <span className="text-[10px] uppercase font-bold text-[#64748B] block">Permanent Residential Address</span>
                <span className="text-sm font-medium text-[#0B1220] block">
                  {address}, {city}, {state} {pincode !== '—' ? ` - ${pincode}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 10. NOTIFICATIONS & IMPORTANT NOTICES                                     */}
      {/* ========================================================================= */}
      <div id="section-notifications-notices" className="space-y-4">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
                10. NOTIFICATIONS & IMPORTANT NOTICES
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#155EEF]" />
                <span>NOTIFICATIONS & IMPORTANT NOTICES</span>
              </h2>
              <p className="text-xs text-[#64748B]">System alerts, milestone updates, and borrower communications</p>
            </div>
            <Link to="/customer/notifications">
              <Button variant="outline" size="sm" className="text-xs h-8 px-3 border-[#D7E3F5] text-[#0B1220] font-semibold rounded-xl bg-white shadow-xs">
                View All
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {data.notifications && data.notifications.length > 0 ? (
              data.notifications.slice(0, 3).map((notif) => {
                const titleLower = notif.title.toLowerCase();
                const isApproved = titleLower.includes('approved') || titleLower.includes('sanction') || titleLower.includes('verified');
                const isWarning = titleLower.includes('required') || titleLower.includes('pending') || titleLower.includes('action');

                return (
                  <div
                    key={notif.id}
                    onClick={() => {
                      const text = `${notif.title || ''} ${notif.message || ''}`.toLowerCase();
                      if (text.includes('payment') || text.includes('fee') || text.includes('charge') || text.includes('utr') || text.includes('due')) {
                        navigate('/customer/payments');
                      } else {
                        navigate('/customer/notifications');
                      }
                    }}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer shadow-xs flex items-center justify-between gap-4 ${
                      isApproved
                        ? 'bg-[#F0FDF4] border-[#BBF7D0] hover:border-[#16A34A]'
                        : isWarning
                        ? 'bg-[#FFFBEB] border-[#FDE68A] hover:border-[#F59E0B]'
                        : 'bg-white border-[#D7E3F5] hover:border-[#155EEF]'
                    }`}
                  >
                    <div className="flex items-start space-x-3.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isApproved ? 'bg-emerald-100 text-[#16A34A]' : isWarning ? 'bg-amber-100 text-[#F59E0B]' : 'bg-[#E8F1FF] text-[#155EEF]'
                      }`}>
                        {isApproved ? <CheckCircle2 className="w-5 h-5" /> : isWarning ? <AlertTriangle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-[#0B1220]">{notif.title}</h3>
                          <Badge className="bg-[#155EEF] text-white text-[10px] font-bold px-2 py-0.5">
                            IMPORTANT UPDATE
                          </Badge>
                        </div>
                        <p className="text-xs text-[#64748B] leading-relaxed line-clamp-2">{notif.message}</p>
                        <span className="text-[10px] text-[#64748B] font-medium block pt-0.5">
                          {new Date(notif.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-[#64748B] shrink-0" />
                  </div>
                );
              })
            ) : (
              <div className="p-5 rounded-2xl bg-white border border-[#D7E3F5] shadow-xs flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F1FF] text-[#155EEF] flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#0B1220]">Account Milestone Notice</h3>
                    <p className="text-xs text-[#64748B]">All formal loan notices, status updates, and verification alerts appear here in real-time.</p>
                  </div>
                </div>
                <Badge className="bg-[#155EEF] text-white text-[10px] font-bold px-2.5 py-0.5 shrink-0">
                  IMPORTANT UPDATE
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 11. BORROWER SUPPORT                                                      */}
      {/* ========================================================================= */}
      <div id="section-support" className="space-y-3">
        <div className="bg-[#E8F1FF] border border-[#D7E3F5] rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold text-[#155EEF] uppercase tracking-wider block">
              11. BORROWER SUPPORT
            </span>
            <h2 className="text-base sm:text-lg font-black text-[#0B1220] flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#155EEF]" />
              <span>BORROWER SUPPORT</span>
            </h2>
            <p className="text-xs text-[#64748B]">Dedicated Customer Assistance Desk</p>
          </div>

          <div className="p-5 bg-white border border-[#D7E3F5] rounded-2xl shadow-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#F4F8FF] text-[#155EEF] flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Direct Email Support</span>
                  <a href="mailto:support@loanapprove.in" className="text-xs sm:text-sm font-bold text-[#155EEF] hover:underline">
                    support@loanapprove.in
                  </a>
                </div>
              </div>

              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#16A34A] flex items-center justify-center shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Borrower Helpline</span>
                  <span className="text-xs sm:text-sm font-bold text-[#0B1220] font-mono">
                    1800-LOAN-APP <span className="text-xs text-[#64748B] font-sans">(Mon-Sat 9AM-7PM)</span>
                  </span>
                </div>
              </div>

              <div className="flex justify-start md:justify-end">
                <Link to="/customer/support" className="w-full md:w-auto">
                  <Button className="w-full md:w-auto bg-[#155EEF] hover:bg-[#123B8E] text-white text-xs h-10 px-5 rounded-xl font-bold shadow-xs flex items-center justify-center gap-1.5">
                    <span>Open Support Ticket</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ELIGIBILITY MODAL 1: KYC REQUIRED                                         */}
      {/* ========================================================================= */}
      {eligibilityState === 'KYC_REQUIRED' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D7E3F5] rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-[#0B1220]">KYC Required</h2>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Complete your identity verification before applying for a loan.
              </p>
            </div>
            <div className="pt-2 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEligibilityState('NONE')}
                className="flex-1 h-10 border-[#D7E3F5] text-[#0B1220] rounded-xl text-xs font-semibold bg-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setEligibilityState('NONE');
                  navigate('/customer/kyc');
                }}
                className="flex-1 h-10 bg-[#155EEF] hover:bg-[#123B8E] text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Complete KYC
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ELIGIBILITY MODAL 2: LOAN DOCUMENTS REQUIRED                              */}
      {/* ========================================================================= */}
      {eligibilityState === 'DOCS_REQUIRED' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D7E3F5] rounded-3xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#155EEF] flex items-center justify-center mx-auto">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-lg font-black text-[#0B1220]">Loan Documents Required</h2>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Complete your required loan documents before submitting your loan application.
              </p>
            </div>
            <div className="pt-2 flex gap-2">
              <Button
                variant="outline"
                onClick={() => setEligibilityState('NONE')}
                className="flex-1 h-10 border-[#D7E3F5] text-[#0B1220] rounded-xl text-xs font-semibold bg-white"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setEligibilityState('NONE');
                  navigate('/customer/documents');
                }}
                className="flex-1 h-10 bg-[#155EEF] hover:bg-[#123B8E] text-white rounded-xl text-xs font-bold shadow-xs"
              >
                Upload Documents
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DIALOG: SUBMIT LOAN APPLICATION MODAL                                     */}
      {/* ========================================================================= */}
      {applyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#D7E3F5] rounded-3xl max-w-lg w-full p-6 sm:p-7 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-[#D7E3F5]">
              <div>
                <h3 className="font-bold text-base sm:text-lg text-[#0B1220]">
                  Submit Loan Application
                </h3>
                <span className="text-xs text-[#64748B]">Loan Approve Financial Services</span>
              </div>
              <button
                onClick={() => setApplyModalOpen(false)}
                className="text-[#64748B] hover:text-[#0B1220] p-1.5 rounded-lg hover:bg-[#F4F8FF] transition"
              >
                ✕
              </button>
            </div>

            {applyError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{applyError}</span>
              </div>
            )}

            <form onSubmit={handleApplyLoan} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="apply-amount" className="block text-[11px] font-bold text-[#0B1220] uppercase tracking-wider">
                  Required Loan Amount (₹) *
                </label>
                <Input
                  id="apply-amount"
                  type="number"
                  min="10000"
                  max="5000000"
                  step="5000"
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(Number(e.target.value))}
                  className="bg-[#F4F8FF] border-[#D7E3F5] text-[#0B1220] font-mono text-base h-11 rounded-xl focus:border-[#155EEF]"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="apply-tenure" className="block text-[11px] font-bold text-[#0B1220] uppercase tracking-wider">
                  Repayment Tenure (Months) *
                </label>
                <select
                  id="apply-tenure"
                  value={applyTenure}
                  onChange={(e) => setApplyTenure(Number(e.target.value))}
                  className="w-full bg-[#F4F8FF] border border-[#D7E3F5] text-[#0B1220] text-sm h-11 rounded-xl px-3 focus:border-[#155EEF] focus:outline-none"
                  required
                >
                  <option value="6">6 Months</option>
                  <option value="12">12 Months (1 Year)</option>
                  <option value="24">24 Months (2 Years)</option>
                  <option value="36">36 Months (3 Years)</option>
                  <option value="48">48 Months (4 Years)</option>
                  <option value="60">60 Months (5 Years)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="apply-purpose" className="block text-[11px] font-bold text-[#0B1220] uppercase tracking-wider">
                  Loan Purpose *
                </label>
                <Input
                  id="apply-purpose"
                  value={applyPurpose}
                  onChange={(e) => setApplyPurpose(e.target.value)}
                  placeholder="e.g. Business expansion, Working capital"
                  className="bg-[#F4F8FF] border-[#D7E3F5] text-[#0B1220] text-sm h-11 rounded-xl focus:border-[#155EEF]"
                  required
                />
              </div>

              <div className="p-3.5 rounded-xl bg-[#E8F1FF] border border-[#D7E3F5] text-xs text-[#0B1220] space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Estimated Monthly EMI:</span>
                  <span className="font-mono text-[#155EEF]">
                    ₹{Math.round((applyAmount + (applyAmount * 0.085 * (applyTenure / 12))) / applyTenure).toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B]">Interest computed at standard benchmark 8.5% p.a.</p>
              </div>

              <div className="flex space-x-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setApplyModalOpen(false)}
                  className="flex-1 h-10 border-[#D7E3F5] text-[#64748B] hover:bg-[#F4F8FF] text-xs font-semibold rounded-xl bg-white"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingLoan || !applyAmount}
                  className="flex-1 h-10 bg-[#155EEF] hover:bg-[#123B8E] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                >
                  {isSubmittingLoan ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Application...</span>
                    </>
                  ) : (
                    <span>Submit Loan Application</span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE PREVIEW MODAL — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={invoicePdfViewer.open}
        onClose={invoicePdfViewer.closeModal}
        blob={invoicePdfViewer.blob}
        blobUrl={invoicePdfViewer.blobUrl}
        pdfBytes={invoicePdfViewer.pdfBytes}
        loading={invoicePdfViewer.loading}
        fetchError={invoicePdfViewer.error}
        title={invoicePreviewTitle || 'Tax Invoice'}
        description="Official immutable tax invoice generated from authoritative financial records."
        downloadFilename={`${(invoicePreviewTitle || 'Invoice').replace(/\s+/g, '_')}.pdf`}
        onRetry={invoicePdfViewer.retry}
      />

      {/* APPROVAL LETTER PREVIEW MODAL — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={letterPdfViewer.open}
        onClose={letterPdfViewer.closeModal}
        blob={letterPdfViewer.blob}
        blobUrl={letterPdfViewer.blobUrl}
        pdfBytes={letterPdfViewer.pdfBytes}
        loading={letterPdfViewer.loading}
        fetchError={letterPdfViewer.error}
        title="Loan Approval Letter"
        description="Official sanction document"
        downloadFilename={`Approval_Letter_${loanSummary?.applicationNumber || 'Loan'}.pdf`}
        onRetry={letterPdfViewer.retry}
      />
    </div>
  );
};

export default CustomerHome;

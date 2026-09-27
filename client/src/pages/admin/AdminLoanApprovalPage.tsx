import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  RotateCcw,
  Eye,
  FileText,
  FileCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  PauseCircle,
  FileSignature,
  FileSearch,
  TrendingUp,
  MessageSquare,
  Mail,
  Send,
  X,
  CheckSquare,
  Square,
  Users,
  Download,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import { loanApi, BulkWhatsAppResponse, BulkEmailResponse } from '@/api/loanApi';
import { useBrandTitle } from '@/hooks/useBrandTitle';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir',
  'Ladakh', 'Puducherry', 'Chandigarh',
];

const LOAN_TYPES = ['Personal Loan', 'Business Loan', 'Salary Loan', 'Education Loan'];

const fmtCurr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const REJECTION_REASONS = [
  'CIBIL / Credit score below required threshold',
  'Insufficient monthly income for requested loan amount',
  'Incomplete or unverified KYC documentation',
  'High existing debt-to-income (DTI) ratio',
  'Unfavorable employment or business verification',
  'Discrepancy in submitted financial statements',
  'Suspicious application / Fraud risk flag',
  'Other underwriting policy mismatch',
];

export const AdminLoanApprovalPage: React.FC = () => {
  useBrandTitle('Loan Approval Operations');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Primary state tab: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'
  const initialTab = (searchParams.get('tab')?.toUpperCase() as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED') || 'PENDING';
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(initialTab);

  // Sub-filter for Pending
  const [pendingSubFilter, setPendingSubFilter] = useState<'ALL' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ON_HOLD' | 'DOCUMENTS_REQUIRED'>('ALL');

  // Search and Filter controls
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [loanTypeFilter, setLoanTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Bulk Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Bulk WhatsApp Campaign State
  const [isBulkWhatsAppModalOpen, setIsBulkWhatsAppModalOpen] = useState(false);
  const [bulkWhatsAppMessage, setBulkWhatsAppMessage] = useState(
    'Hello {{customerName}},\n\nYour loan application #{{applicationId}} is currently {{loanStatus}}.\n\nThank you,\n{{companyName}}'
  );
  const [bulkWhatsAppTemplateName, setBulkWhatsAppTemplateName] = useState('APPLICATION_STATUS_UPDATE');
  const [isSendingBulkWhatsApp, setIsSendingBulkWhatsApp] = useState(false);
  const [bulkWhatsAppCampaignResult, setBulkWhatsAppCampaignResult] = useState<BulkWhatsAppResponse['data'] | null>(null);
  const [bulkWhatsAppError, setBulkWhatsAppError] = useState<string | null>(null);

  // Bulk Email Campaign State
  const [isBulkEmailModalOpen, setIsBulkEmailModalOpen] = useState(false);
  const [bulkEmailSubject, setBulkEmailSubject] = useState('Update regarding your Loan Application #{{applicationId}}');
  const [bulkEmailMessage, setBulkEmailMessage] = useState(
    'Dear {{customerName}},\n\nWe would like to inform you that your loan application #{{applicationId}} is currently under the status: {{loanStatus}}.\n\nWarm regards,\nSupport Team\n{{companyName}}'
  );
  const [bulkEmailTemplateName, setBulkEmailTemplateName] = useState('APPLICATION_STATUS_UPDATE');
  const [isSendingBulkEmail, setIsSendingBulkEmail] = useState(false);
  const [bulkEmailCampaignResult, setBulkEmailCampaignResult] = useState<BulkEmailResponse['data'] | null>(null);
  const [bulkEmailError, setBulkEmailError] = useState<string | null>(null);

  // Underwriting Action Modals state
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);

  // Approve modal form state
  const [approvedAmount, setApprovedAmount] = useState('');
  const [interestRate, setInterestRate] = useState('12');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [manualEmi, setManualEmi] = useState('');
  const [processingFee, setProcessingFee] = useState('1250');
  const [insurance, setInsurance] = useState('0');
  const [disbursementDate, setDisbursementDate] = useState('');
  const [adminRemarks, setAdminRemarks] = useState('');

  // Reject modal form state
  const [rejectionReason, setRejectionReason] = useState(REJECTION_REASONS[0]);
  const [customRejectionText, setCustomRejectionText] = useState('');
  const [rejectRemarks, setRejectRemarks] = useState('');

  // Hold modal form state
  const [holdReason, setHoldReason] = useState('');

  // Status message
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Approval letter PDF viewer via react-pdf canvas renderer
  const letterPdfViewer = usePdfViewer();
  const [selectedLetterAppNum, setSelectedLetterAppNum] = useState<string>('');
  const [selectedLetterLoanId, setSelectedLetterLoanId] = useState<string>('');

  // Calculate live EMI
  const calculatedEmi = (() => {
    const P = parseFloat(approvedAmount) || 0;
    const r = (parseFloat(interestRate) || 12) / 100 / 12;
    const n = parseInt(tenureMonths) || 12;
    if (P <= 0 || r <= 0 || n <= 0) return Math.round(P / (n || 1));
    return Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  })();
  const effectiveEmi = manualEmi ? parseInt(manualEmi) || calculatedEmi : calculatedEmi;
  const totalPayable = effectiveEmi * (parseInt(tenureMonths) || 12);
  const totalInterest = Math.max(0, totalPayable - (parseFloat(approvedAmount) || 0));

  // Determine status query param based on activeTab
  const getStatusQuery = () => {
    if (activeTab === 'ALL') return '';
    if (activeTab === 'APPROVED') return 'APPROVED';
    if (activeTab === 'REJECTED') return 'REJECTED';
    if (pendingSubFilter !== 'ALL') return pendingSubFilter;
    return 'PENDING';
  };

  // Fetch applications for active tab
  const { data: responseData, isLoading, isFetching, refetch } = useQuery({
    queryKey: [
      'adminLoanApprovalOps',
      activeTab,
      pendingSubFilter,
      page,
      search,
      stateFilter,
      loanTypeFilter,
      dateFrom,
      dateTo,
    ],
    queryFn: async () => {
      const statusParam = getStatusQuery();
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(statusParam ? { status: statusParam } : {}),
        ...(search ? { search } : {}),
        ...(stateFilter ? { state: stateFilter } : {}),
        ...(loanTypeFilter ? { loanType: loanTypeFilter } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      });
      const res = await apiClient.get(`/admin/loan-applications?${params.toString()}`);
      return res.data;
    },
    refetchInterval: 1500,
  });

  // Query counts for all 4 state views
  const { data: allCountData } = useQuery({
    queryKey: ['adminLoanCounts', 'ALL'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/loan-applications?pageSize=1');
      return res.data?.pagination?.total ?? res.data?.counts?.all ?? 0;
    },
    refetchInterval: 2500,
  });

  const { data: pendingCountData } = useQuery({
    queryKey: ['adminLoanCounts', 'PENDING'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/loan-applications?status=PENDING&pageSize=1');
      return res.data?.pagination?.total ?? res.data?.counts?.pending ?? 0;
    },
    refetchInterval: 2500,
  });

  const { data: approvedCountData } = useQuery({
    queryKey: ['adminLoanCounts', 'APPROVED'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/loan-applications?status=APPROVED&pageSize=1');
      return res.data?.pagination?.total ?? res.data?.counts?.approved ?? 0;
    },
    refetchInterval: 2500,
  });

  const { data: rejectedCountData } = useQuery({
    queryKey: ['adminLoanCounts', 'REJECTED'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/loan-applications?status=REJECTED&pageSize=1');
      return res.data?.pagination?.total ?? res.data?.counts?.rejected ?? 0;
    },
    refetchInterval: 2500,
  });

  const rawList = responseData?.data;
  const loans: any[] =
    (Array.isArray(rawList) ? rawList : null) ||
    (Array.isArray((rawList as any)?.applications) ? (rawList as any).applications : null) ||
    (Array.isArray((rawList as any)?.data) ? (rawList as any).data : null) ||
    (Array.isArray((responseData as any)?.applications) ? (responseData as any).applications : null) ||
    (Array.isArray((responseData as any)?.data) ? (responseData as any).data : null) ||
    (Array.isArray(responseData) ? responseData : null) ||
    [];
  const pagination =
    responseData?.pagination ||
    (rawList as any)?.pagination ||
    (responseData as any)?.data?.pagination || {
      page: 1,
      pageSize,
      total: loans.length,
      totalPages: Math.max(1, Math.ceil(loans.length / pageSize)),
    };


  // Selection helpers
  const isAllSelected = loans.length > 0 && loans.every((loan) => selectedIds.includes(loan.id));

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(loans.map((l) => l.id));
      setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = new Set([...selectedIds, ...loans.map((l) => l.id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedLoans = loans.filter((loan) => selectedIds.includes(loan.id));

  // Clear selection on any filter change
  React.useEffect(() => {
    setSelectedIds([]);
  }, [activeTab, pendingSubFilter, search, stateFilter, loanTypeFilter, dateFrom, dateTo, page]);

  // Tab switcher
  const handleTabChange = (tab: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED') => {
    setActiveTab(tab);
    setPage(1);
    setSelectedIds([]);
    setSearchParams({ tab });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSelectedIds([]);
    setSearch(searchInput.trim());
  };

  const handleReset = () => {
    setSearchInput('');
    setSearch('');
    setStateFilter('');
    setLoanTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPendingSubFilter('ALL');
    setSelectedIds([]);
  };

  const handleViewApprovalLetter = async (loanId: string, appNum?: string) => {
    try {
      setSelectedLetterLoanId(loanId);
      setSelectedLetterAppNum(appNum || 'Loan');
      await letterPdfViewer.fetchAndOpen(API_ENDPOINTS.ADMIN_LOANS.LOAN_APPROVAL_LETTER_PDF(loanId));
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to open Approval Letter for ${appNum || 'Loan'}.`);
    }
  };

  const handleDownloadApprovalLetter = async (loanId: string, appNum?: string) => {
    try {
      const res = await apiClient.get(`${API_ENDPOINTS.ADMIN_LOANS.LOAN_APPROVAL_LETTER_PDF(loanId)}?download=true`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Approval_Letter_${appNum || loanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.response?.data?.message || `Failed to download Approval Letter for ${appNum || 'Loan'}.`);
    }
  };

  // Bulk WhatsApp Handlers
  const handleOpenBulkWhatsAppModal = () => {
    setBulkWhatsAppCampaignResult(null);
    setBulkWhatsAppError(null);
    setIsBulkWhatsAppModalOpen(true);
  };

  const handleDispatchBulkWhatsApp = async () => {
    if (selectedIds.length === 0) return;
    setIsSendingBulkWhatsApp(true);
    setBulkWhatsAppError(null);

    try {
      const res = await loanApi.sendBulkWhatsAppApplications({
        applicationIds: selectedIds,
        message: bulkWhatsAppMessage.trim(),
        templateName: bulkWhatsAppTemplateName,
      });

      if (res.data) {
        setBulkWhatsAppCampaignResult(res.data);
      } else {
        setBulkWhatsAppCampaignResult({
          total: selectedIds.length,
          sentCount: selectedIds.length,
          failedCount: 0,
          results: [],
        });
      }
    } catch (err: unknown) {
      setBulkWhatsAppError(err instanceof Error ? err.message : 'Failed to dispatch bulk WhatsApp campaign.');
    } finally {
      setIsSendingBulkWhatsApp(false);
    }
  };

  const handleWhatsAppTemplateSelect = (tmpl: string) => {
    setBulkWhatsAppTemplateName(tmpl);
    if (tmpl === 'APPLICATION_STATUS_UPDATE') {
      setBulkWhatsAppMessage('Hello {{customerName}},\n\nYour loan application #{{applicationId}} is currently {{loanStatus}}.\n\nThank you,\n{{companyName}}');
    } else if (tmpl === 'KYC_REMINDER') {
      setBulkWhatsAppMessage('Dear {{customerName}},\n\nKindly complete your KYC document verification for loan application #{{applicationId}} to expedite approval.\n\nSupport Team,\n{{companyName}}');
    } else if (tmpl === 'APPROVAL_ALERT') {
      setBulkWhatsAppMessage('Congratulations {{customerName}}!\n\nYour loan application #{{applicationId}} has been APPROVED for {{amount}}.\n\nPlease sign in to accept your agreement.\n{{companyName}}');
    }
  };

  // Bulk Email Handlers
  const handleOpenBulkEmailModal = () => {
    setBulkEmailCampaignResult(null);
    setBulkEmailError(null);
    setIsBulkEmailModalOpen(true);
  };

  const handleDispatchBulkEmail = async () => {
    if (selectedIds.length === 0) return;
    setIsSendingBulkEmail(true);
    setBulkEmailError(null);

    try {
      const res = await loanApi.sendBulkEmailApplications({
        applicationIds: selectedIds,
        subject: bulkEmailSubject.trim(),
        message: bulkEmailMessage.trim(),
        templateName: bulkEmailTemplateName,
      });

      if (res.data) {
        setBulkEmailCampaignResult(res.data);
      } else {
        setBulkEmailCampaignResult({
          total: selectedIds.length,
          sentCount: selectedIds.length,
          failedCount: 0,
          results: [],
        });
      }
    } catch (err: unknown) {
      setBulkEmailError(err instanceof Error ? err.message : 'Failed to dispatch bulk Email campaign.');
    } finally {
      setIsSendingBulkEmail(false);
    }
  };

  const handleEmailTemplateSelect = (tmpl: string) => {
    setBulkEmailTemplateName(tmpl);
    if (tmpl === 'APPLICATION_STATUS_UPDATE') {
      setBulkEmailSubject('Update regarding your Loan Application #{{applicationId}}');
      setBulkEmailMessage('Dear {{customerName}},\n\nWe would like to inform you that your loan application #{{applicationId}} is currently under the status: {{loanStatus}}.\n\nIf you have any queries, please feel free to reach out.\n\nWarm regards,\nSupport Team\n{{companyName}}');
    } else if (tmpl === 'KYC_REMINDER') {
      setBulkEmailSubject('Action Required: Complete KYC for Application #{{applicationId}}');
      setBulkEmailMessage('Dear {{customerName}},\n\nKindly complete your pending KYC document submission for loan application #{{applicationId}} at your earliest convenience to proceed with your sanction.\n\nBest regards,\nVerification Team\n{{companyName}}');
    } else if (tmpl === 'APPROVAL_ALERT') {
      setBulkEmailSubject('Congratulations! Loan Application #{{applicationId}} Sanctioned');
      setBulkEmailMessage('Dear {{customerName}},\n\nGreat news! Your loan application #{{applicationId}} has been officially APPROVED and SANCTIONED.\n\nPlease log in to review and sign your digital loan agreement.\n\nWarm regards,\nCredit Team\n{{companyName}}');
    }
  };

  // Underwriting Mutations
  const approveMutation = useMutation({
    mutationFn: async (payload: any) => {
      return loanApi.approveApplication(selectedLoan.id, payload);
    },
    onSuccess: () => {
      setActionSuccess(`Application #${selectedLoan.applicationNumber} approved successfully.`);
      setActionError(null);
      setShowApproveModal(false);
      setSelectedLoan(null);
      queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
      queryClient.invalidateQueries({ queryKey: ['adminLoanCounts'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to approve application.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (payload: { rejectionReason: string; remarks?: string }) => {
      return loanApi.rejectApplication(selectedLoan.id, payload);
    },
    onSuccess: () => {
      setActionSuccess(`Application #${selectedLoan.applicationNumber} marked as rejected.`);
      setActionError(null);
      setShowRejectModal(false);
      setSelectedLoan(null);
      queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
      queryClient.invalidateQueries({ queryKey: ['adminLoanCounts'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to reject application.');
    },
  });

  const startReviewMutation = useMutation({
    mutationFn: async (loanId: string) => {
      return loanApi.startReview(loanId);
    },
    onSuccess: () => {
      setActionSuccess('Application marked as Under Review.');
      queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to start review.');
    },
  });

  const holdMutation = useMutation({
    mutationFn: async (payload: { holdReason: string }) => {
      return loanApi.putOnHold(selectedLoan.id, payload);
    },
    onSuccess: () => {
      setActionSuccess(`Application #${selectedLoan.applicationNumber} placed on hold.`);
      setShowHoldModal(false);
      setSelectedLoan(null);
      queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
    },
    onError: (err: any) => {
      setActionError(err.message || 'Failed to put application on hold.');
    },
  });

  // Modal Openers
  const openApprove = (loan: any) => {
    setSelectedLoan(loan);
    setApprovedAmount(String(loan.approvedAmount || loan.requestedAmount || '100000'));
    setInterestRate('12');
    setTenureMonths(String(loan.tenureMonths || '12'));
    setManualEmi('');
    setProcessingFee('1250');
    setInsurance('0');
    setDisbursementDate('');
    setAdminRemarks('');
    setShowApproveModal(true);
  };

  const openReject = (loan: any) => {
    setSelectedLoan(loan);
    setRejectionReason(REJECTION_REASONS[0]);
    setCustomRejectionText('');
    setRejectRemarks('');
    setShowRejectModal(true);
  };

  const openHold = (loan: any) => {
    setSelectedLoan(loan);
    setHoldReason('');
    setShowHoldModal(true);
  };

  const submitApprove = () => {
    const payload = {
      approvedAmount: parseFloat(approvedAmount) || selectedLoan.requestedAmount,
      interestRate: parseFloat(interestRate) || 12,
      tenureMonths: parseInt(tenureMonths) || 12,
      finalEmi: effectiveEmi,
      processingFeeAmount: parseFloat(processingFee) || 0,
      insuranceAmount: parseFloat(insurance) || 0,
      totalPayable,
      disbursementDate: disbursementDate || undefined,
      remarks: adminRemarks.trim() || undefined,
    };
    approveMutation.mutate(payload);
  };

  const submitReject = () => {
    const finalReason =
      rejectionReason === 'Other underwriting policy mismatch' && customRejectionText.trim()
        ? customRejectionText.trim()
        : rejectionReason;

    rejectMutation.mutate({
      rejectionReason: finalReason,
      remarks: rejectRemarks.trim() || undefined,
    });
  };

  const submitHold = () => {
    if (!holdReason.trim()) return;
    holdMutation.mutate({ holdReason: holdReason.trim() });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-primary" /> Loan Approval Operations
            </h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
              Underwriting Hub
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Centralized operations page to manage loan applications across Approved, Pending, and Rejected states.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="self-start sm:self-auto text-xs h-9 border-border"
        >
          <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Global Action Messages */}
      {actionSuccess && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-xs hover:underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-danger shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-xs hover:underline font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* 4 CLEAR STATE NAVIGATION BUTTONS (ALL / PENDING / APPROVED / REJECTED) */}
      {/* ==================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tab 1: ALL */}
        <button
          type="button"
          onClick={() => handleTabChange('ALL')}
          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
            activeTab === 'ALL'
              ? 'border-primary bg-primary/10 shadow-sm'
              : 'border-border bg-surface hover:border-primary/50'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${activeTab === 'ALL' ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'}`}>
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-text-secondary tracking-wider">All Applications</div>
              <div className="text-sm sm:text-base font-extrabold text-text-primary">Master Register</div>
            </div>
          </div>
          <Badge className={`${activeTab === 'ALL' ? 'bg-primary text-primary-foreground' : 'bg-surface-elevated text-text-secondary border border-border'} font-mono font-bold text-xs`}>
            {allCountData ?? '...'}
          </Badge>
        </button>

        {/* Tab 2: PENDING */}
        <button
          type="button"
          onClick={() => handleTabChange('PENDING')}
          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
            activeTab === 'PENDING'
              ? 'border-warning bg-warning/10 shadow-sm'
              : 'border-border bg-surface hover:border-warning/50'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${activeTab === 'PENDING' ? 'bg-warning text-background' : 'bg-warning/10 text-warning'}`}>
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-text-secondary tracking-wider">Pending Review</div>
              <div className="text-sm sm:text-base font-extrabold text-text-primary">Underwriting Queue</div>
            </div>
          </div>
          <Badge className={`${activeTab === 'PENDING' ? 'bg-warning text-background' : 'bg-surface-elevated text-text-secondary border border-border'} font-mono font-bold text-xs`}>
            {pendingCountData ?? '...'}
          </Badge>
        </button>

        {/* Tab 3: APPROVED */}
        <button
          type="button"
          onClick={() => handleTabChange('APPROVED')}
          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
            activeTab === 'APPROVED'
              ? 'border-success bg-success/10 shadow-sm'
              : 'border-border bg-surface hover:border-success/50'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${activeTab === 'APPROVED' ? 'bg-success text-background' : 'bg-success/10 text-success'}`}>
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-text-secondary tracking-wider">Approved</div>
              <div className="text-sm sm:text-base font-extrabold text-text-primary">Sanctioned Loans</div>
            </div>
          </div>
          <Badge className={`${activeTab === 'APPROVED' ? 'bg-success text-background' : 'bg-surface-elevated text-text-secondary border border-border'} font-mono font-bold text-xs`}>
            {approvedCountData ?? '...'}
          </Badge>
        </button>

        {/* Tab 4: REJECTED */}
        <button
          type="button"
          onClick={() => handleTabChange('REJECTED')}
          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
            activeTab === 'REJECTED'
              ? 'border-danger bg-danger/10 shadow-sm'
              : 'border-border bg-surface hover:border-danger/50'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-lg ${activeTab === 'REJECTED' ? 'bg-danger text-text-primary' : 'bg-danger/10 text-danger'}`}>
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs uppercase font-bold text-text-secondary tracking-wider">Rejected</div>
              <div className="text-sm sm:text-base font-extrabold text-text-primary">Declined Applications</div>
            </div>
          </div>
          <Badge className={`${activeTab === 'REJECTED' ? 'bg-danger text-text-primary' : 'bg-surface-elevated text-text-secondary border border-border'} font-mono font-bold text-xs`}>
            {rejectedCountData ?? '...'}
          </Badge>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <Card className="shadow-sm border-border bg-surface">
        <CardContent className="p-4 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-2.5" />
              <Input
                placeholder="Search by customer name, mobile number, or application ID..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 text-xs sm:text-sm h-10 border-border"
              />
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 px-5">
              Search
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleReset} className="h-10 px-3 border-border">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </form>

          {/* Detailed Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
            <div>
              <Label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1 block">
                State
              </Label>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs h-9 rounded-md border border-input bg-background px-2.5 text-text-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">All States</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1 block">
                Loan Type
              </Label>
              <select
                value={loanTypeFilter}
                onChange={(e) => {
                  setLoanTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs h-9 rounded-md border border-input bg-background px-2.5 text-text-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">All Types</option>
                {LOAN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1 block">
                From Date
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs border-border"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider mb-1 block">
                To Date
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 text-xs border-border"
              />
            </div>
          </div>

          {/* Pending Sub-filter Pills */}
          {activeTab === 'PENDING' && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-border overflow-x-auto text-xs">
              <span className="text-[11px] font-bold text-text-secondary uppercase mr-1">Underwriting Stage:</span>
              {[
                { id: 'ALL', label: 'All Pending' },
                { id: 'SUBMITTED', label: 'Submitted / New' },
                { id: 'UNDER_REVIEW', label: 'Under Review' },
                { id: 'ON_HOLD', label: 'On Hold' },
                { id: 'DOCUMENTS_REQUIRED', label: 'Docs Required' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setPendingSubFilter(pill.id as any);
                    setPage(1);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                    pendingSubFilter === pill.id
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary border border-border'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Sticky Bar */}
      {selectedIds.length > 0 && (
        <div className="p-4 bg-slate-900 text-white rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs">
              {selectedIds.length}
            </span>
            <span className="text-sm font-semibold">
              {selectedIds.length} application{selectedIds.length > 1 ? 's' : ''} selected
              {activeTab && ` (${activeTab.toLowerCase()} queue)`}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleOpenBulkWhatsAppModal}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow transition"
            >
              <MessageSquare className="w-4 h-4" />
              Send WhatsApp
            </button>
            <button
              type="button"
              onClick={handleOpenBulkEmailModal}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow transition"
            >
              <Mail className="w-4 h-4" />
              Send Email
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
            >
              <X className="w-4 h-4" />
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Applications Content List */}
      <Card className="shadow-sm border-border bg-surface">
        <CardHeader className="pb-3 border-b border-border flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-text-primary">
              {activeTab === 'ALL' && 'All Loan Applications'}
              {activeTab === 'PENDING' && 'Pending Applications Queue'}
              {activeTab === 'APPROVED' && 'Approved & Sanctioned Applications'}
              {activeTab === 'REJECTED' && 'Rejected Applications'}
              <span className="text-text-secondary font-normal ml-1">({pagination.total} total)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              {activeTab === 'ALL' && 'Comprehensive registry of all customer loan applications across all lifecycle stages.'}
              {activeTab === 'PENDING' && 'Review borrower documentation, configure sanction terms, or decline.'}
              {activeTab === 'APPROVED' && 'Access sanction letters, digital agreements, and KYC packages.'}
              {activeTab === 'REJECTED' && 'View recorded decline justification and customer audit trails.'}
            </CardDescription>
          </div>
          <span className="text-xs text-text-secondary font-medium">
            Page {pagination.page} of {pagination.totalPages || 1}
          </span>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-text-secondary font-medium">Loading applications...</p>
            </div>
          ) : loans.length === 0 ? (
            <div className="py-16 text-center">
              <FileSearch className="w-10 h-10 text-text-secondary mx-auto mb-2 opacity-50" />
              <h3 className="text-sm font-bold text-text-primary">No applications found</h3>
              <p className="text-xs text-text-secondary mt-1">
                No records matching your search and filter criteria in the {activeTab.toLowerCase()} state.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-elevated border-b border-border text-text-secondary font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="w-10 py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={handleToggleSelectAll}
                          className="text-slate-500 hover:text-slate-800 transition flex items-center justify-center"
                          title={isAllSelected ? 'Deselect all' : 'Select all on page'}
                        >
                          {isAllSelected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </th>
                      <th className="py-3 px-4">Application ID</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">State / Type</th>
                      <th className="py-3 px-4 text-right">
                        {activeTab === 'APPROVED' ? 'Approved Amt' : 'Requested Amt'}
                      </th>
                      {activeTab === 'APPROVED' && (
                        <>
                          <th className="py-3 px-4 text-right">EMI</th>
                          <th className="py-3 px-4">Tenure</th>
                        </>
                      )}
                      {activeTab === 'REJECTED' && (
                        <th className="py-3 px-4">Rejection Reason</th>
                      )}
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loans.map((loan) => {
                      const isSelected = selectedIds.includes(loan.id);
                      const customerName = loan.customer?.fullName || loan.customerName || 'Customer';
                      const mobile = loan.customer?.mobile || loan.mobile || '';
                      const state = loan.customer?.state || loan.state || 'India';
                      const loanType = loan.loanType || 'Personal Loan';
                      const appliedDate = new Date(loan.submittedAt || loan.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      });

                      return (
                        <tr
                          key={loan.id}
                          className={`hover:bg-surface-elevated/60 transition-colors ${
                            isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <td className="w-10 py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectRow(loan.id)}
                              className="text-slate-500 hover:text-slate-800 transition flex items-center justify-center"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-text-primary">
                            {loan.applicationNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-text-primary">{customerName}</div>
                            <div className="text-[11px] text-text-secondary">+91 {mobile}</div>
                          </td>
                          <td className="py-3 px-4 text-text-secondary">
                            <div>{state}</div>
                            <div className="text-[10px] text-text-secondary">{loanType}</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {activeTab === 'APPROVED' ? (
                              <span className="text-success">{fmtCurr(loan.approvedAmount || loan.requestedAmount)}</span>
                            ) : (
                              <span className="text-text-primary">{fmtCurr(loan.requestedAmount)}</span>
                            )}
                          </td>
                          {activeTab === 'APPROVED' && (
                            <>
                              <td className="py-3 px-4 text-right font-mono font-medium text-text-primary">
                                {loan.finalEmi ? fmtCurr(loan.finalEmi) : loan.estimatedEmi ? fmtCurr(loan.estimatedEmi) : '—'}
                              </td>
                              <td className="py-3 px-4 text-text-secondary">{loan.tenureMonths} Mo.</td>
                            </>
                          )}
                          {activeTab === 'REJECTED' && (
                            <td className="py-3 px-4 max-w-xs">
                              <span className="text-danger text-[11px] font-medium line-clamp-2">
                                {loan.rejectionReason || 'Underwriting decline'}
                              </span>
                            </td>
                          )}
                          <td className="py-3 px-4 text-text-secondary">{appliedDate}</td>
                          <td className="py-3 px-4">
                            <Badge
                              className={`text-[10px] font-bold ${
                                loan.status === 'APPROVED' || loan.status === 'DISBURSED'
                                  ? 'bg-success text-background'
                                  : loan.status === 'REJECTED' || loan.status === 'OFFER_REJECTED'
                                  ? 'bg-danger text-text-primary'
                                  : loan.status === 'UNDER_REVIEW'
                                  ? 'bg-primary text-primary-foreground'
                                  : loan.status === 'ON_HOLD'
                                  ? 'bg-warning text-background'
                                  : 'bg-surface-elevated text-text-secondary border border-border'
                              }`}
                            >
                              {loan.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Common: View */}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/admin/loans/${loan.id}`)}
                                className="h-7 px-2 text-[11px] border-border"
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>

                              {/* PENDING Tab Actions */}
                              {activeTab === 'PENDING' && (
                                <>
                                  {loan.status === 'SUBMITTED' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => startReviewMutation.mutate(loan.id)}
                                      disabled={startReviewMutation.isPending}
                                      className="h-7 px-2 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
                                    >
                                      Review
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    onClick={() => openApprove(loan)}
                                    className="h-7 px-2.5 text-[11px] bg-success hover:bg-success/90 text-background font-bold shadow-xs"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openReject(loan)}
                                    className="h-7 px-2 text-[11px] border-danger/40 text-danger hover:bg-danger/10 font-medium"
                                  >
                                    Reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => openHold(loan)}
                                    className="h-7 px-2 text-[11px] text-text-secondary hover:text-text-primary"
                                  >
                                    Hold
                                  </Button>
                                </>
                              )}

                              {/* APPROVED Tab Actions */}
                              {activeTab === 'APPROVED' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleViewApprovalLetter(loan.id, loan.applicationNumber)}
                                    title="View Approved Loan Sanction Letter"
                                    className="h-7 px-2 text-[11px] border-success/40 text-success hover:bg-success/10 font-bold"
                                  >
                                    <Eye className="w-3 h-3 mr-1" />
                                    View Letter
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDownloadApprovalLetter(loan.id, loan.applicationNumber)}
                                    title="Download Loan Sanction Letter PDF"
                                    className="h-7 px-2 text-[11px] bg-success/10 border-success/40 text-success hover:bg-success/20 font-bold"
                                  >
                                    <Download className="w-3 h-3 mr-1" />
                                    PDF
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => navigate(`/admin/loans/${loan.id}`)}
                                    className="h-7 px-2 text-[11px] border-primary/40 text-primary hover:bg-primary/10"
                                  >
                                    <FileSignature className="w-3 h-3 mr-1" />
                                    Agreement
                                  </Button>
                                </>
                              )}

                              {/* REJECTED Tab Actions */}
                              {activeTab === 'REJECTED' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/admin/audit-logs?search=${loan.applicationNumber}`)}
                                  className="h-7 px-2 text-[11px] border-border text-text-secondary hover:text-text-primary"
                                >
                                  Audit Trail
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="md:hidden p-3 space-y-3">
                {loans.map((loan) => {
                  const customerName = loan.customer?.fullName || loan.customerName || 'Customer';
                  const mobile = loan.customer?.mobile || loan.mobile || '';
                  const appliedDate = new Date(loan.submittedAt || loan.createdAt).toLocaleDateString('en-IN');

                  return (
                    <div key={loan.id} className="border border-border rounded-xl p-3.5 bg-surface-elevated/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-text-primary">
                          {loan.applicationNumber}
                        </span>
                        <Badge
                          className={`text-[10px] font-bold ${
                            loan.status === 'APPROVED' || loan.status === 'DISBURSED'
                              ? 'bg-success text-background'
                              : loan.status === 'REJECTED'
                              ? 'bg-danger text-text-primary'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {loan.status}
                        </Badge>
                      </div>

                      <div>
                        <h4 className="font-semibold text-sm text-text-primary">{customerName}</h4>
                        <p className="text-xs text-text-secondary">+91 {mobile} • {appliedDate}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-surface p-2 rounded-lg border border-border">
                        <div>
                          <span className="text-text-secondary block text-[10px]">
                            {activeTab === 'APPROVED' ? 'Approved Amt' : 'Requested Amt'}
                          </span>
                          <span className="font-bold text-text-primary font-mono">
                            {fmtCurr(loan.approvedAmount || loan.requestedAmount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-secondary block text-[10px]">Tenure</span>
                          <span className="font-medium text-text-primary">{loan.tenureMonths} Months</span>
                        </div>
                      </div>

                      {loan.rejectionReason && (
                        <p className="text-xs text-danger bg-danger/10 p-2 rounded border border-danger/20">
                          {loan.rejectionReason}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/admin/loans/${loan.id}`)}
                          className="flex-1 h-8 text-xs border-border"
                        >
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>
                        {activeTab === 'PENDING' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openApprove(loan)}
                              className="flex-1 h-8 text-xs bg-success text-background font-bold"
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReject(loan)}
                              className="h-8 text-xs border-danger text-danger"
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {activeTab === 'APPROVED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadApprovalLetter(loan.id)}
                            className="flex-1 h-8 text-xs border-success/40 text-success"
                          >
                            <FileText className="w-3 h-3 mr-1" /> Letter
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="p-4 border-t border-border flex items-center justify-between text-xs text-text-secondary">
                  <span>
                    Showing {(pagination.page - 1) * pagination.pageSize + 1}–
                    {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="h-8 px-2 border-border"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="font-medium text-text-primary">
                      {pagination.page} / {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="h-8 px-2 border-border"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ==================================================== */}
      {/* APPROVE LOAN MODAL WITH EMI CALCULATOR */}
      {/* ==================================================== */}
      <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="w-5 h-5" /> Sanction & Approve Loan Application
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure sanctioned amount, interest rate, tenure, and verify monthly repayment schedule for{' '}
              <strong>{selectedLoan?.customer?.fullName || selectedLoan?.customerName}</strong> (App #{selectedLoan?.applicationNumber}).
            </DialogDescription>
          </DialogHeader>

          {selectedLoan && (
            <div className="space-y-4 py-2">
              {/* Applicant Snapshot */}
              <div className="bg-surface-elevated p-3 rounded-xl border border-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-text-secondary block text-[10px]">Requested</span>
                  <strong className="text-text-primary font-mono">{fmtCurr(selectedLoan.requestedAmount)}</strong>
                </div>
                <div>
                  <span className="text-text-secondary block text-[10px]">Tenure</span>
                  <span className="text-text-primary font-medium">{selectedLoan.tenureMonths} Mo.</span>
                </div>
                <div>
                  <span className="text-text-secondary block text-[10px]">State</span>
                  <span className="text-text-primary">{selectedLoan.customer?.state || selectedLoan.state || 'India'}</span>
                </div>
                <div>
                  <span className="text-text-secondary block text-[10px]">KYC Status</span>
                  <Badge className="bg-success/20 text-success text-[10px]">
                    {selectedLoan.customer?.kycStatus || 'VERIFIED'}
                  </Badge>
                </div>
              </div>

              {/* Approval Parameters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-bold text-text-primary">Approved Amount (₹) *</Label>
                  <Input
                    type="number"
                    value={approvedAmount}
                    onChange={(e) => setApprovedAmount(e.target.value)}
                    className="mt-1 font-mono text-sm font-bold border-border"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-text-primary">Interest Rate (% p.a.) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="mt-1 font-mono text-sm border-border"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-text-primary">Tenure (Months) *</Label>
                  <Input
                    type="number"
                    value={tenureMonths}
                    onChange={(e) => setTenureMonths(e.target.value)}
                    className="mt-1 font-mono text-sm border-border"
                  />
                </div>
              </div>

              {/* Live EMI Calculation & Override */}
              <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" /> Calculated Monthly EMI
                  </span>
                  <strong className="text-base sm:text-lg font-mono text-primary font-black">
                    {fmtCurr(effectiveEmi)} / mo
                  </strong>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-primary/10">
                  <div>
                    <span className="text-text-secondary">Total Interest:</span>
                    <strong className="ml-1 text-text-primary font-mono">{fmtCurr(totalInterest)}</strong>
                  </div>
                  <div className="text-right">
                    <span className="text-text-secondary">Total Repayable:</span>
                    <strong className="ml-1 text-text-primary font-mono">{fmtCurr(totalPayable)}</strong>
                  </div>
                </div>

                <div className="pt-2">
                  <Label className="text-[11px] text-text-secondary font-medium">
                    Manual EMI Override (Optional - leave blank to use auto-calculated ₹{calculatedEmi}):
                  </Label>
                  <Input
                    type="number"
                    placeholder={`Auto-calculated: ${calculatedEmi}`}
                    value={manualEmi}
                    onChange={(e) => setManualEmi(e.target.value)}
                    className="mt-1 text-xs h-8 border-border bg-background"
                  />
                </div>
              </div>

              {/* Additional Fees */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-text-secondary">Processing Fee (₹)</Label>
                  <Input
                    type="number"
                    value={processingFee}
                    onChange={(e) => setProcessingFee(e.target.value)}
                    className="mt-1 text-xs border-border"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-text-secondary">Insurance / Security (₹)</Label>
                  <Input
                    type="number"
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                    className="mt-1 text-xs border-border"
                  />
                </div>
              </div>

              {/* Disbursement Date & Remarks */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-bold text-text-secondary">Target Disbursement Date (Optional)</Label>
                  <Input
                    type="date"
                    value={disbursementDate}
                    onChange={(e) => setDisbursementDate(e.target.value)}
                    className="mt-1 text-xs border-border"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-text-secondary">Underwriter Remarks</Label>
                  <textarea
                    rows={2}
                    value={adminRemarks}
                    onChange={(e) => setAdminRemarks(e.target.value)}
                    placeholder="Optional notes or sanction covenants..."
                    className="w-full mt-1 p-2 text-xs rounded-md border border-input bg-background text-text-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex space-x-2 justify-end pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowApproveModal(false)}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitApprove}
              disabled={approveMutation.isPending || !approvedAmount}
              className="bg-success hover:bg-success/90 text-background font-bold"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Approving...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Confirm & Approve Loan
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* REJECT APPLICATION MODAL */}
      {/* ==================================================== */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-danger">
              <XCircle className="w-5 h-5" /> Decline Loan Application
            </DialogTitle>
            <DialogDescription className="text-xs">
              Decline Application #{selectedLoan?.applicationNumber} for{' '}
              <strong>{selectedLoan?.customer?.fullName || selectedLoan?.customerName}</strong>. A decline notification will be recorded in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-text-primary">Reason for Rejection *</Label>
              <select
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full mt-1.5 text-xs h-9 rounded-md border border-input bg-background px-2.5 text-text-primary focus:ring-1 focus:ring-danger"
              >
                {REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {rejectionReason === 'Other underwriting policy mismatch' && (
              <div>
                <Label className="text-xs font-bold text-text-primary">Specify Reason *</Label>
                <Input
                  type="text"
                  placeholder="Enter specific decline rationale..."
                  value={customRejectionText}
                  onChange={(e) => setCustomRejectionText(e.target.value)}
                  className="mt-1 text-xs border-border"
                />
              </div>
            )}

            <div>
              <Label className="text-xs font-bold text-text-secondary">Internal Underwriting Notes (Optional)</Label>
              <textarea
                rows={2}
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
                placeholder="Internal audit notes..."
                className="w-full mt-1 p-2 text-xs rounded-md border border-input bg-background text-text-primary focus:ring-1 focus:ring-danger"
              />
            </div>
          </div>

          <DialogFooter className="flex space-x-2 justify-end pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRejectModal(false)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitReject}
              disabled={rejectMutation.isPending}
              className="bg-danger hover:bg-danger/90 text-text-primary font-bold"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Declining...
                </>
              ) : (
                'Confirm Rejection'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* PUT ON HOLD MODAL */}
      {/* ==================================================== */}
      <Dialog open={showHoldModal} onOpenChange={setShowHoldModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <PauseCircle className="w-5 h-5" /> Put Application On Hold
            </DialogTitle>
            <DialogDescription className="text-xs">
              Temporarily freeze underwriting progress on #{selectedLoan?.applicationNumber}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-bold text-text-primary">Hold Reason *</Label>
              <textarea
                rows={3}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="Explain why this application is placed on hold (e.g. awaiting customer response, additional document verification)..."
                className="w-full mt-1 p-2 text-xs rounded-md border border-input bg-background text-text-primary focus:ring-1 focus:ring-warning"
              />
            </div>
          </div>

          <DialogFooter className="flex space-x-2 justify-end pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowHoldModal(false)}
              disabled={holdMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={submitHold}
              disabled={holdMutation.isPending || !holdReason.trim()}
              className="bg-warning hover:bg-warning/90 text-background font-bold"
            >
              {holdMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Holding...
                </>
              ) : (
                'Put On Hold'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* BULK WHATSAPP CAMPAIGN MODAL */}
      {/* ==================================================== */}
      {isBulkWhatsAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    Send WhatsApp Campaign
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Dispatch WhatsApp messages to {selectedIds.length} borrower(s) in {activeTab.toLowerCase()} queue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkWhatsAppModalOpen(false)}
                className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-elevated transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkWhatsAppError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{bulkWhatsAppError}</span>
              </div>
            )}

            {bulkWhatsAppCampaignResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-surface-elevated border border-border rounded-2xl space-y-3">
                  <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    WhatsApp Campaign Completed
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-surface rounded-xl border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase block">Total</span>
                      <span className="text-lg font-extrabold text-text-primary">{bulkWhatsAppCampaignResult.total}</span>
                    </div>
                    <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800">
                      <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase block">Sent</span>
                      <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-400">{bulkWhatsAppCampaignResult.sentCount}</span>
                    </div>
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800">
                      <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 uppercase block">Failed</span>
                      <span className="text-lg font-extrabold text-rose-700 dark:text-rose-400">{bulkWhatsAppCampaignResult.failedCount}</span>
                    </div>
                  </div>
                </div>

                {bulkWhatsAppCampaignResult.results && bulkWhatsAppCampaignResult.results.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Delivery Log Breakdown
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {bulkWhatsAppCampaignResult.results.map((r, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                            r.success
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                              : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                          }`}
                        >
                          <div>
                            <span className="font-semibold">{r.customerName}</span>
                            <span className="text-[11px] opacity-75 font-mono ml-2">({r.recipient})</span>
                            {r.error && (
                              <p className="text-[11px] text-rose-600 mt-0.5">{r.error}</p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.success ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={() => {
                      setIsBulkWhatsAppModalOpen(false);
                      setSelectedIds([]);
                    }}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-6 py-2 rounded-xl"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Recipients preview */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">
                    Recipients ({selectedLoans.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-surface-elevated border border-border rounded-xl">
                    {selectedLoans.map((loan) => (
                      <span
                        key={loan.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-lg text-[11px] font-medium text-text-primary"
                      >
                        <Users className="w-3 h-3 text-text-secondary" />
                        {loan.customer?.fullName || loan.customerName} (+91 {loan.customer?.mobile || loan.mobile})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Template Selector */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">
                    Message Template
                  </label>
                  <select
                    value={bulkWhatsAppTemplateName}
                    onChange={(e) => handleWhatsAppTemplateSelect(e.target.value)}
                    className="w-full text-xs h-9 rounded-xl border border-input bg-background px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="APPLICATION_STATUS_UPDATE">Application Status Update (Default)</option>
                    <option value="KYC_REMINDER">KYC Verification Reminder</option>
                    <option value="APPROVAL_ALERT">Loan Sanction & Approval Alert</option>
                    <option value="CUSTOM">Custom Free-form Message</option>
                  </select>
                </div>

                {/* Message Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-text-secondary uppercase">
                      Message Content
                    </label>
                    <span className="text-[10px] text-text-secondary font-mono">
                      Dynamic placeholders supported
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={bulkWhatsAppMessage}
                    onChange={(e) => setBulkWhatsAppMessage(e.target.value)}
                    placeholder="Enter message template..."
                    className="w-full p-3 text-xs border border-input bg-background text-text-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-text-secondary">
                    <span>Variables:</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{customerName}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{applicationId}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{loanStatus}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{amount}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{companyName}}'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkWhatsAppModalOpen(false)}
                    disabled={isSendingBulkWhatsApp}
                    className="px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDispatchBulkWhatsApp}
                    disabled={isSendingBulkWhatsApp || !bulkWhatsAppMessage.trim()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
                  >
                    {isSendingBulkWhatsApp ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Dispatching to {selectedIds.length} Borrowers...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send to {selectedIds.length} Borrowers
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* BULK EMAIL CAMPAIGN MODAL */}
      {/* ==================================================== */}
      {isBulkEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-surface border border-border rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">
                    Send Email Campaign
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Dispatch SMTP emails to {selectedIds.length} borrower(s) in {activeTab.toLowerCase()} queue
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkEmailModalOpen(false)}
                className="text-text-secondary hover:text-text-primary p-1.5 rounded-lg hover:bg-surface-elevated transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {bulkEmailError && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{bulkEmailError}</span>
              </div>
            )}

            {bulkEmailCampaignResult ? (
              <div className="space-y-4">
                <div className="p-4 bg-surface-elevated border border-border rounded-2xl space-y-3">
                  <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Email Campaign Completed
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-surface rounded-xl border border-border">
                      <span className="text-[10px] font-semibold text-text-secondary uppercase block">Total</span>
                      <span className="text-lg font-extrabold text-text-primary">{bulkEmailCampaignResult.total}</span>
                    </div>
                    <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                      <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase block">Sent</span>
                      <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400">{bulkEmailCampaignResult.sentCount}</span>
                    </div>
                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800">
                      <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 uppercase block">Failed</span>
                      <span className="text-lg font-extrabold text-rose-700 dark:text-rose-400">{bulkEmailCampaignResult.failedCount}</span>
                    </div>
                  </div>
                </div>

                {bulkEmailCampaignResult.results && bulkEmailCampaignResult.results.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Email Delivery Log Breakdown
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {bulkEmailCampaignResult.results.map((r, i) => (
                        <div
                          key={i}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                            r.success
                              ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                              : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                          }`}
                        >
                          <div>
                            <span className="font-semibold">{r.customerName}</span>
                            <span className="text-[11px] opacity-75 font-mono ml-2">({r.recipient})</span>
                            {r.error && (
                              <p className="text-[11px] text-rose-600 mt-0.5">{r.error}</p>
                            )}
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            r.success ? 'bg-blue-200 text-blue-800' : 'bg-rose-200 text-rose-800'
                          }`}>
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={() => {
                      setIsBulkEmailModalOpen(false);
                      setSelectedIds([]);
                    }}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-6 py-2 rounded-xl"
                  >
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Recipients preview */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">
                    Email Recipients ({selectedLoans.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-surface-elevated border border-border rounded-xl">
                    {selectedLoans.map((loan) => (
                      <span
                        key={loan.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface border border-border rounded-lg text-[11px] font-medium text-text-primary"
                      >
                        <Users className="w-3 h-3 text-text-secondary" />
                        {loan.customer?.fullName || loan.customerName} ({loan.customer?.email || loan.email || 'No email'})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Template Selector */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">
                    Email Template
                  </label>
                  <select
                    value={bulkEmailTemplateName}
                    onChange={(e) => handleEmailTemplateSelect(e.target.value)}
                    className="w-full text-xs h-9 rounded-xl border border-input bg-background px-3 py-1.5 text-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="APPLICATION_STATUS_UPDATE">Application Status Update (Default)</option>
                    <option value="KYC_REMINDER">KYC Verification Reminder</option>
                    <option value="APPROVAL_ALERT">Loan Sanction & Approval Alert</option>
                    <option value="CUSTOM">Custom Free-form Email</option>
                  </select>
                </div>

                {/* Subject Line */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">
                    Subject Line
                  </label>
                  <Input
                    type="text"
                    value={bulkEmailSubject}
                    onChange={(e) => setBulkEmailSubject(e.target.value)}
                    placeholder="Enter email subject line..."
                    className="w-full text-xs rounded-xl border-input bg-background text-text-primary focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Email Body */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-text-secondary uppercase">
                      Email Body Content
                    </label>
                    <span className="text-[10px] text-text-secondary font-mono">
                      Dynamic placeholders supported
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={bulkEmailMessage}
                    onChange={(e) => setBulkEmailMessage(e.target.value)}
                    placeholder="Enter email message content..."
                    className="w-full p-3 text-xs border border-input bg-background text-text-primary rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono leading-relaxed"
                  />
                  <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-text-secondary">
                    <span>Variables:</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{customerName}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{applicationId}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{loanStatus}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{amount}}'}</span>
                    <span className="px-1.5 py-0.5 bg-surface-elevated rounded font-mono">{'{{companyName}}'}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-border flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkEmailModalOpen(false)}
                    disabled={isSendingBulkEmail}
                    className="px-4 py-2 text-xs font-semibold text-text-secondary hover:text-text-primary transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDispatchBulkEmail}
                    disabled={isSendingBulkEmail || !bulkEmailMessage.trim() || !bulkEmailSubject.trim()}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center gap-2"
                  >
                    {isSendingBulkEmail ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Dispatching Emails to {selectedIds.length} Borrowers...
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        Send Emails to {selectedIds.length} Borrowers
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval Letter PDF Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={letterPdfViewer.open}
        onClose={() => {
          letterPdfViewer.closeModal();
          setSelectedLetterLoanId('');
          setSelectedLetterAppNum('');
        }}
        blob={letterPdfViewer.blob}
        blobUrl={letterPdfViewer.blobUrl}
        pdfBytes={letterPdfViewer.pdfBytes}
        loading={letterPdfViewer.loading}
        fetchError={letterPdfViewer.error}
        title={`Loan Approval Letter — ${selectedLetterAppNum}`}
        description="Official sanction document"
        downloadFilename={`Approval_Letter_${selectedLetterAppNum || 'Loan'}.pdf`}
        onDownload={() => selectedLetterLoanId && handleDownloadApprovalLetter(selectedLetterLoanId, selectedLetterAppNum)}
        onRetry={letterPdfViewer.retry}
      />
    </div>
  );
};

export default AdminLoanApprovalPage;

import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { loanApi, AdminLoanApplicationDetail } from '@/api/loanApi';
import { LoanStatusBadge } from '@/components/LoanStatusBadge';
import {
  ArrowLeft,
  User,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Edit3,
  FileQuestion,
  Loader2,
  ExternalLink,
  Eye,
  CreditCard,
  IndianRupee,
  AlertTriangle,
  ShieldCheck,
  Layers,
  FileCheck,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { SpecificChargesSection } from '@/components/admin/SpecificChargesSection';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { useAuth } from '@/contexts/AuthContext';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';

export const AdminLoanDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, hasPermission } = useAuth();

  // Navigation state
  const [activeSection, setActiveSection] = useState<'360' | 'DOCS' | 'PAYMENTS' | 'CHARGES'>('360');

  // Permission Checks
  const canApprove = hasPermission('applications.approve') || user?.role === 'ADMIN';
  const canReject = hasPermission('applications.reject') || user?.role === 'ADMIN';
  const canReview = hasPermission('applications.review') || user?.role === 'ADMIN';

  // Dialog States
  const [startReviewOpen, setStartReviewOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [modifyAmountOpen, setModifyAmountOpen] = useState(false);
  const [proposedAmountInput, setProposedAmountInput] = useState('');
  const [requestDocsOpen, setRequestDocsOpen] = useState(false);
  const [docType, setDocType] = useState('BANK_STATEMENT');
  const [docTitle, setDocTitle] = useState('');
  const [docDesc, setDocDesc] = useState('');
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  // PDF viewer state for doc/invoice/approval-letter preview
  const pdfViewer = usePdfViewer();
  const [pdfViewerTitle, setPdfViewerTitle] = useState('');
  const [pdfDownloadFn, setPdfDownloadFn] = useState<(() => void) | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Financial Form States for Approval Modal
  const [approvedAmount, setApprovedAmount] = useState('');
  const [interestRate, setInterestRate] = useState('12');
  const [tenureMonths, setTenureMonths] = useState('12');
  const [manualEmi, setManualEmi] = useState('');
  const [processingFee, setProcessingFee] = useState('1250');
  const [insurance, setInsurance] = useState('0');
  const [disbursementDate, setDisbursementDate] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);

  // Fetch application detail
  const {
    data: response,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['adminLoanDetail', id],
    queryFn: () => loanApi.getAdminApplicationById(id || ''),
    enabled: Boolean(id),
  });

  const rawData = response?.data;
  const app: (AdminLoanApplicationDetail & { applicationPayments?: any[]; customerPayments?: any[]; payments?: any[] }) | undefined =
    rawData && 'applicationNumber' in (rawData as unknown as Record<string, unknown>)
      ? (rawData as unknown as any)
      : (rawData as { data?: any })?.data;

  const { data: searchPayments = [] } = useQuery({
    queryKey: ['adminLoanPayments', id, app?.customer?.mobile],
    queryFn: async () => {
      const searchTerm = app?.applicationNumber || app?.customer?.mobile;
      if (!searchTerm) return [];
      const res = await apiClient.get(`${API_ENDPOINTS.PAYMENTS.ADMIN_LIST}?search=${encodeURIComponent(searchTerm)}`);
      return res.data?.data || res.data || [];
    },
    enabled: activeSection === 'PAYMENTS' && Boolean(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminLoanDetail', id] });
    queryClient.invalidateQueries({ queryKey: ['adminLoanApplications'] });
    queryClient.invalidateQueries({ queryKey: ['adminLoanApprovalOps'] });
    queryClient.invalidateQueries({ queryKey: ['adminPendingLoans'] });
    queryClient.invalidateQueries({ queryKey: ['adminLoanPayments', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['customerLoans'] });
    queryClient.invalidateQueries({ queryKey: ['customerLoanDetail'] });
    queryClient.invalidateQueries({ queryKey: ['customer-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['customerChargesList'] });
    queryClient.invalidateQueries({ queryKey: ['customerDocs'] });
  };

  // Initialize approval values when opening approval dialog
  const handleOpenApproveDialog = () => {
    if (app) {
      setApprovedAmount(String(app.proposedAmount || app.requestedAmount));
      setInterestRate('12');
      setTenureMonths(String(app.tenureMonths || 12));
      setManualEmi('');
      setProcessingFee('1250');
      setInsurance('0');
      setDisbursementDate('');
      setAdminRemark('');
      setConfirmStep(false);
    }
    setApproveOpen(true);
  };

  // Auto-calculate EMI
  const calculatedEmi = (() => {
    const P = parseFloat(approvedAmount) || 0;
    const r = (parseFloat(interestRate) / 100) / 12;
    const n = parseInt(tenureMonths) || 12;
    if (P <= 0 || r <= 0) return Math.round(P / n);
    return Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  })();
  const emi = manualEmi ? parseInt(manualEmi) || calculatedEmi : calculatedEmi;
  const isEmiOverridden = !!manualEmi && parseInt(manualEmi) !== calculatedEmi;
  const totalPayable = emi * (parseInt(tenureMonths) || 12);
  const totalInterest = Math.max(0, totalPayable - (parseFloat(approvedAmount) || 0));

  const isKycVerified = app?.customer?.kycStatus === 'APPROVED' || app?.customer?.kycStatus === 'VERIFIED';

  // Mutations
  const reviewMutation = useMutation({
    mutationFn: () => loanApi.startReview(id || ''),
    onSuccess: () => {
      setStartReviewOpen(false);
      setActionSuccess('Underwriting review started successfully.');
      invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to start review');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return loanApi.approveApplication(id || '', {
        approvedAmount: parseFloat(approvedAmount) || app?.requestedAmount,
        interestRate: parseFloat(interestRate),
        tenureMonths: parseInt(tenureMonths),
        finalEmi: emi,
        processingFeeAmount: parseFloat(processingFee) || 0,
        insuranceAmount: parseFloat(insurance) || 0,
        totalPayable,
        disbursementDate: disbursementDate || undefined,
        remarks: adminRemark || 'Approved by Underwriting Officer',
      });
    },
    onSuccess: () => {
      setApproveOpen(false);
      setConfirmStep(false);
      setActionSuccess(`Loan application #${app?.applicationNumber} approved and sanctioned successfully!`);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Failed to approve application';
      setActionError(msg);
    },
  });

  const modifyMutation = useMutation({
    mutationFn: () => {
      const cleanVal = Number(proposedAmountInput.replace(/[^\d.]/g, ''));
      return loanApi.modifyAmount(id || '', { proposedAmount: cleanVal });
    },
    onSuccess: () => {
      setModifyAmountOpen(false);
      setProposedAmountInput('');
      setActionSuccess(`Modified loan offer submitted for customer review.`);
      invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to modify amount');
    },
  });

  const requestDocsMutation = useMutation({
    mutationFn: () =>
      loanApi.requestDocuments(id || '', {
        documentType: docType,
        title: docTitle,
        description: docDesc,
      }),
    onSuccess: () => {
      setRequestDocsOpen(false);
      setDocTitle('');
      setDocDesc('');
      setActionSuccess(`Document requirement request dispatched to customer.`);
      invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to request documents');
    },
  });

  const holdMutation = useMutation({
    mutationFn: () => loanApi.putOnHold(id || '', { holdReason }),
    onSuccess: () => {
      setHoldOpen(false);
      setHoldReason('');
      setActionSuccess(`Loan application #${app?.applicationNumber} placed on hold.`);
      invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to put on hold');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => loanApi.rejectApplication(id || '', { rejectionReason }),
    onSuccess: () => {
      setRejectOpen(false);
      setRejectionReason('');
      setActionSuccess(`Loan application #${app?.applicationNumber} rejected.`);
      invalidate();
    },
    onError: (err: unknown) => {
      setActionError(err instanceof Error ? err.message : 'Failed to reject application');
    },
  });

  const handleViewDocFile = async (docId: string) => {
    try {
      setPdfViewerTitle('Customer Document');
      setPdfDownloadFn(null);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.CUSTOMER_DOCS.FILE(docId));
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to open document file.');
    }
  };

  const handleViewInvoiceFile = async (chargeIdOrInvoiceId: string) => {
    try {
      setPdfViewerTitle('Tax Invoice');
      setPdfDownloadFn(null);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeIdOrInvoiceId, false));
    } catch (err: any) {
      setActionError(err.response?.data?.message || 'Failed to open invoice PDF.');
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-text-secondary">Loading underwriting file...</p>
      </div>
    );
  }

  if (isError || !app) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="border-danger/30 bg-danger/5">
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-danger mx-auto" />
            <h3 className="font-semibold text-text-primary">Application File Not Found</h3>
            <p className="text-sm text-text-secondary">
              The specified loan record could not be loaded from the registry.
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/loans')} className="border-border text-text-secondary">
              Back to Loan List
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render Underwriting Decision Buttons
  // Render Underwriting Decision Buttons
  const renderActionButtons = () => {
    if (!app) return null;
    const isSubmitted = app.status === 'SUBMITTED';
    const isUnderReview = app.status === 'UNDER_REVIEW';
    const isOnHold = app.status === 'ON_HOLD';
    const isDocsRequired = app.status === 'DOCUMENTS_REQUIRED';

    return (
      <div className="flex flex-wrap items-center gap-2">
        {/* SUBMITTED State: Start Review */}
        {isSubmitted && canReview && (
          <Button
            size="sm"
            onClick={() => setStartReviewOpen(true)}
            className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs h-9 px-4"
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Start Review
          </Button>
        )}

        {/* Resuming Review from Hold or Docs Required */}
        {(isOnHold || isDocsRequired) && canReview && (
          <Button
            size="sm"
            onClick={() => setStartReviewOpen(true)}
            className="bg-[#123B66] hover:bg-[#0B1F3A] text-white text-xs font-bold rounded-xl shadow-xs h-9 px-4"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Resume Review
          </Button>
        )}

        {/* UNDER_REVIEW or SUBMITTED Actions (state-gated) */}
        {(isUnderReview || isSubmitted) && (
          <>
            {canApprove && (
              <div className="relative group">
                <Button
                  size="sm"
                  onClick={handleOpenApproveDialog}
                  disabled={!isUnderReview || !isKycVerified}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:border disabled:border-slate-200 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs px-4 h-9"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-white" />
                  ✓ Approve Loan
                </Button>
                {(!isUnderReview || !isKycVerified) && (
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-amber-300 text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                    {!isUnderReview
                      ? 'Start underwriting review before approving loan.'
                      : 'Customer KYC must be verified before approval.'}
                  </div>
                )}
              </div>
            )}

            {canReject && (
              <div className="relative group">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRejectOpen(true)}
                  disabled={!isUnderReview}
                  className="border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold rounded-xl h-9 px-3.5"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Reject Loan
                </Button>
                {!isUnderReview && (
                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-amber-300 text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                    Start underwriting review before rejecting loan.
                  </div>
                )}
              </div>
            )}

            {canReview && (
              <>
                <div className="relative group">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setProposedAmountInput(String(app.proposedAmount || app.requestedAmount || ''));
                      setModifyAmountOpen(true);
                    }}
                    disabled={!isUnderReview}
                    className="border border-[#D6E4F5] bg-white text-[#2563EB] hover:bg-[#EFF6FF] disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded-xl font-semibold h-9 px-3.5"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                    Modify Amount
                  </Button>
                  {!isUnderReview && (
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-amber-300 text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                      Start underwriting review before modifying the offer.
                    </div>
                  )}
                </div>

                <div className="relative group">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRequestDocsOpen(true)}
                    disabled={!isUnderReview}
                    className="border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded-xl font-semibold h-9 px-3.5"
                  >
                    <FileQuestion className="w-3.5 h-3.5 mr-1.5" />
                    Request Docs
                  </Button>
                  {!isUnderReview && (
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-amber-300 text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                      Start underwriting review before requesting documents.
                    </div>
                  )}
                </div>

                <div className="relative group">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHoldOpen(true)}
                    disabled={!isUnderReview}
                    className="border border-slate-200 bg-white text-[#334155] hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded-xl font-semibold h-9 px-3.5"
                  >
                    <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                    Hold
                  </Button>
                  {!isUnderReview && (
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-900 border border-slate-700 text-amber-300 text-[11px] p-2 rounded-lg shadow-xl whitespace-nowrap z-30">
                      Start underwriting review before placing on hold.
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Approved Status Quick Action Links */}
        {app.status === 'APPROVED' && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  setPdfViewerTitle(`Approval Letter — ${app.applicationNumber}`);
                  const downloadFn = async () => {
                    const res2 = await apiClient.get(`/admin/loans/${app.id}/approval-letter/pdf?download=true`, { responseType: 'arraybuffer' });
                    const blob2 = new Blob([res2.data], { type: 'application/pdf' });
                    const url2 = URL.createObjectURL(blob2);
                    const a = document.createElement('a');
                    a.href = url2;
                    a.download = `Approval_Letter_${app.applicationNumber}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url2), 2000);
                  };
                  setPdfDownloadFn(() => downloadFn);
                  await pdfViewer.fetchAndOpen(`/admin/loans/${app.id}/approval-letter/pdf`);
                } catch {
                  alert('Could not open approval letter. Please try again.');
                }
              }}
              className="border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold rounded-xl h-9 px-3.5"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" />
              View Approval Letter
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  const res = await apiClient.get(`/admin/loans/${app.id}/approval-letter/pdf?download=true`, { responseType: 'arraybuffer' });
                  const blob = new Blob([res.data], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Approval_Letter_${app.applicationNumber}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(url), 2000);
                } catch {
                  alert('Could not download approval letter. Please try again.');
                }
              }}
              className="border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-semibold rounded-xl h-9 px-3.5"
            >
              <FileCheck className="w-3.5 h-3.5 mr-1.5" />
              Download Letter PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/admin/loans`)}
              className="border border-[#D6E4F5] text-[#334155] hover:bg-[#EFF6FF] text-xs font-semibold rounded-xl h-9 px-3.5"
            >
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              EMI Schedule
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-xs text-[#64748B]">
        <Link to="/admin/dashboard" className="hover:text-[#0F172A] transition">Dashboard</Link>
        <span>›</span>
        <Link to="/admin/loans" className="hover:text-[#0F172A] transition">Loans</Link>
        <span>›</span>
        <span className="font-mono text-[#0F172A] font-bold">#{app.applicationNumber}</span>
      </div>

      {/* Header & Back */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => navigate('/admin/loans')}
          className="h-10 px-4 rounded-xl border border-[#D6E4F5] bg-white text-[#0F172A] hover:bg-[#EFF6FF] hover:border-[#2563EB] hover:text-[#2563EB] font-semibold text-xs gap-2 inline-flex items-center shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Underwriting Registry</span>
        </Button>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-[#64748B]">Status:</span>
          <LoanStatusBadge status={app.status} />
        </div>
      </div>


      {actionError && (
        <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* SECTION 10 (TOP): Action Command Bar for Underwriter */}
      <Card className="border-border bg-surface text-text-primary shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider font-mono">
                Underwriting Decision Center
              </span>
              <span className="text-text-muted">•</span>
              <span className="text-xs text-text-secondary font-mono">ID: {app.applicationNumber}</span>
            </div>
            <p className="text-xs text-text-secondary">
              Current File State:{' '}
              <strong className="text-text-primary">{app.status.replace(/_/g, ' ')}</strong>
            </p>
          </div>

          {renderActionButtons()}
        </CardContent>
      </Card>

      {/* KYC Gate Notice Banner */}
      {!isKycVerified && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-warning">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-warning mt-0.5" />
            <div>
              <p className="font-bold text-sm text-amber-200">KYC Verification Gate Active</p>
              <p className="text-warning/80 mt-0.5">
                Customer KYC state is currently <strong>{app.customer.kycStatus || 'PENDING'}</strong>. 
                Loan approval is blocked until customer identity documents are reviewed and approved.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => navigate(`/admin/kyc`)}
            className="bg-warning text-background hover:brightness-110 text-text-primary text-xs font-bold whitespace-nowrap self-start sm:self-auto rounded-xl"
          >
            <ShieldCheck className="w-4 h-4 mr-1.5" />
            Go to KYC Console
          </Button>
        </div>
      )}

      {/* 360 Application Navigation Tabs */}
      <div className="flex border-b border-border space-x-1 sm:space-x-2 overflow-x-auto text-xs font-semibold">
        {[
          { key: '360', label: '360° Underwriting View', icon: Eye },
          { key: 'DOCS', label: `Documents (${app.documents?.length || app.documentRequests?.length || 0})`, icon: FileText },
          { key: 'PAYMENTS', label: 'Payments & UTRs', icon: CreditCard },
          { key: 'CHARGES', label: 'Specific Charges', icon: IndianRupee },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key as typeof activeSection)}
              className={`py-2.5 px-4 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 rounded-t-xl ${
                isActive
                  ? 'border-primary text-primary font-bold bg-surface shadow-sm'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* SECTION: 360 Underwriting Particulars Grid */}
      {activeSection === '360' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Columns (2 cols): Loan Particulars, Financials, Documents, Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section 1: Loan Application Particulars */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-text-secondary font-bold">
                      Section 1: Application Particulars
                    </span>
                    <CardTitle className="text-base font-bold text-text-primary mt-0.5">
                      Loan Request Overview
                    </CardTitle>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-text-secondary block">Submitted At</span>
                    <p className="text-xs font-semibold text-text-secondary">
                      {new Date(app.submittedAt || app.createdAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-surface-elevated border border-border">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">Requested Amount</span>
                    <p className="text-xl font-black text-text-primary mt-0.5">
                      ₹{app.requestedAmount.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-elevated border border-border">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">Tenure Requested</span>
                    <p className="text-xl font-black text-text-primary mt-0.5">
                      {app.tenureMonths} Months
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-elevated border border-border">
                    <span className="text-[10px] uppercase font-bold text-text-secondary">Approved / Sanctioned</span>
                    <p className="text-xl font-black text-success mt-0.5">
                      {app.approvedAmount
                        ? `₹${app.approvedAmount.toLocaleString('en-IN')}`
                        : app.proposedAmount
                        ? `₹${app.proposedAmount.toLocaleString('en-IN')}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Stated Purpose */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    Borrower Stated Loan Purpose
                  </span>
                  <p className="text-xs text-text-primary bg-surface-elevated p-3 rounded-xl border border-border">
                    {app.purpose || 'Personal / General Requirement'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Section 5: Sanction Financial Breakdown */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-text-primary flex items-center space-x-2">
                  <IndianRupee className="w-4 h-4 text-success" />
                  <span>Section 5: Financial Terms & Underwriting Calculations</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block">Sanctioned Amount</span>
                    <span className="text-sm font-bold text-success">
                      ₹{(app.approvedAmount || app.requestedAmount).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block">Interest Rate</span>
                    <span className="text-sm font-bold text-text-primary">12.0% p.a.</span>
                  </div>
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block">Estimated EMI</span>
                    <span className="text-sm font-bold text-text-primary">
                      ₹{Math.round((app.approvedAmount || app.requestedAmount) / (app.tenureMonths || 12)).toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block">Processing Fee</span>
                    <span className="text-sm font-bold text-text-primary">₹1,250</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Section 4: Document Verification Preview */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-text-primary">
                    Section 4: Verification Documents & Requests
                  </CardTitle>
                  <CardDescription className="text-text-secondary text-xs">
                    KYC and income proofs submitted or required for verification.
                  </CardDescription>
                </div>
                {canReview && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRequestDocsOpen(true)}
                    className="border-border text-text-secondary text-xs h-8"
                  >
                    + Request Document
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {app.documentRequests && app.documentRequests.length > 0 ? (
                  <div className="space-y-2">
                    {app.documentRequests.map((docReq) => (
                      <div
                        key={docReq.id}
                        className="p-3 rounded-xl border border-border bg-surface-elevated flex items-center justify-between text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-text-primary">{docReq.title}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface-elevated text-text-secondary border border-border">
                              {docReq.documentType}
                            </span>
                          </div>
                          {docReq.description && (
                            <p className="text-text-secondary text-[11px]">{docReq.description}</p>
                          )}
                          <span className="text-[10px] text-text-secondary block">
                            Requested on {new Date(docReq.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <Badge
                          variant={docReq.status === 'FULFILLED' ? 'success' : 'secondary'}
                          className="text-[10px]"
                        >
                          {docReq.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-secondary py-4 text-center">
                    No custom document requests raised. Standard KYC proofs attached.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Section 8: Underwriting Audit & Timeline */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-text-primary flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>Section 8: Underwriting Audit & Timeline</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 text-text-secondary">
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block uppercase">Assigned Underwriter</span>
                    <span className="font-semibold text-text-primary text-xs">
                      {app.reviewedBy || user?.fullName || 'Active Session'}
                    </span>
                  </div>
                  <div className="p-3 bg-surface-elevated rounded-xl border border-border">
                    <span className="text-[10px] text-text-secondary block uppercase">Last Review Timestamp</span>
                    <span className="font-semibold text-text-primary text-xs">
                      {app.reviewedAt ? new Date(app.reviewedAt).toLocaleString('en-IN') : 'Pending Decision'}
                    </span>
                  </div>
                </div>
                {app.rejectionReason && (
                  <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-danger">
                    <span className="text-[10px] font-bold block uppercase">Rejection Reason</span>
                    <p className="mt-0.5">{app.rejectionReason}</p>
                  </div>
                )}
                {app.holdReason && (
                  <div className="p-3 bg-warning/10 border border-warning/30 rounded-xl text-warning">
                    <span className="text-[10px] font-bold block uppercase">Hold Reason</span>
                    <p className="mt-0.5">{app.holdReason}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Profile & KYC */}
          <div className="space-y-6">
            {/* Section 2: Borrower Profile */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm font-bold text-text-primary">
                      Section 2: Borrower Profile
                    </CardTitle>
                  </div>
                  <Link
                    to={`/admin/customers/${app.customer.id}`}
                    className="text-xs text-primary hover:text-primary flex items-center font-medium"
                  >
                    Customer 360
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3.5 text-xs">
                <div>
                  <span className="text-text-secondary text-[10px] block uppercase">Full Legal Name</span>
                  <span className="font-bold text-text-primary text-sm">{app.customer.fullName}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-text-secondary text-[10px] block uppercase">Mobile Phone</span>
                    <span className="font-mono font-semibold text-text-primary">
                      +91 {app.customer.mobile}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary text-[10px] block uppercase">Monthly Income</span>
                    <span className="font-semibold text-success">
                      ₹{app.customer.monthlyIncome?.toLocaleString('en-IN') || '—'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-text-secondary text-[10px] block uppercase">Email Address</span>
                  <span className="font-medium text-text-secondary break-all">{app.customer.email}</span>
                </div>
                <div>
                  <span className="text-text-secondary text-[10px] block uppercase">Residential Address</span>
                  <span className="font-medium text-text-secondary">
                    {app.customer.address}, {app.customer.city}, {app.customer.state}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Section 3: KYC Status & Gate Assessment */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-success" />
                    <CardTitle className="text-sm font-bold text-text-primary">
                      Section 3: Identity & KYC Assessment
                    </CardTitle>
                  </div>
                  <Link
                    to={`/admin/kyc`}
                    className="text-xs text-success hover:text-success flex items-center font-medium"
                  >
                    KYC Center
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="flex items-center justify-between p-3 bg-surface-elevated rounded-xl border border-border">
                  <span className="text-text-secondary text-xs">KYC Verification State</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    isKycVerified
                      ? 'bg-success/20 text-success border border-success/30'
                      : app.customer.kycStatus === 'REJECTED'
                      ? 'bg-danger/20 text-danger border border-danger/30'
                      : 'bg-warning/20 text-warning border border-warning/30'
                  }`}>
                    {app.customer.kycStatus || 'PENDING'}
                  </span>
                </div>
                <div className="p-3 bg-surface-elevated rounded-xl border border-border space-y-2">
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-[11px]">Aadhaar (Masked)</span>
                    <span className="font-mono text-text-primary text-[11px]">{app.customer.aadhaarMasked || 'XXXX-XXXX-XXXX'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary text-[11px]">PAN Status</span>
                    <span className="font-mono text-success text-[11px]">Document Recorded</span>
                  </div>
                </div>

                {!isKycVerified ? (
                  <Button
                    onClick={() => navigate('/admin/kyc')}
                    className="w-full bg-warning text-background hover:brightness-110 text-text-primary font-bold text-xs h-9 rounded-xl"
                  >
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    Verify KYC in KYC Center
                  </Button>
                ) : (
                  <div className="p-2.5 rounded-xl bg-success/10 border border-success/30 text-success text-[11px] flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Identity verified. Cleared for loan sanctioning.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Section 9: Underwriter Notes */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-text-primary">
                  Section 9: Underwriting Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs text-text-secondary">
                <p>
                  System automated risk scoring passed. Verified bank account and mobile contact.
                  Sanction decision is subject to admin review and compliance clearance.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SECTION: DOCUMENTS TAB */}
      {activeSection === 'DOCS' && (
        <div className="space-y-6">
          {/* 1. Original Required Loan Documents (Standard 4) */}
          <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-text-primary">
                    Original Required Loan Documents (Standard 4)
                  </CardTitle>
                  <CardDescription className="text-text-secondary text-xs">
                    Mandatory borrower underwriting documents evaluated for loan sanction.
                  </CardDescription>
                </div>
                <Badge className="bg-primary/10 text-primary text-[10px] font-bold">
                  {app.documents?.length || 0} / 4 Uploaded
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { type: 'PAN', title: 'PAN Card', desc: 'Permanent Account Number verification' },
                  { type: 'BANK_STATEMENT', title: 'Bank Statement', desc: 'Last 3–6 months statement' },
                  { type: 'INCOME_PROOF', title: 'Income Proof', desc: 'Salary slip, Form 16, or ITR' },
                  { type: 'OTHER', title: 'Other Documents', desc: 'Additional underwriting proof' },
                ].map((def) => {
                  const doc = app.documents?.find((d: any) => d.documentType === def.type);
                  return (
                    <div
                      key={def.type}
                      className="p-3.5 rounded-xl border border-border bg-surface-elevated flex flex-col justify-between space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-xs text-text-primary block">{def.title}</span>
                          <span className="text-[10px] text-text-secondary">{def.desc}</span>
                        </div>
                        {doc ? (
                          <Badge className="bg-success text-background text-[10px] font-bold">
                            {doc.status || 'UPLOADED'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-border text-text-secondary">
                            Not Uploaded
                          </Badge>
                        )}
                      </div>

                      {doc ? (
                        <div className="pt-2 border-t border-border flex items-center justify-between text-[11px]">
                          <div className="truncate max-w-[200px] text-text-secondary font-mono text-[10px]">
                            {doc.fileName || `${def.type.toLowerCase()}.pdf`}
                            {doc.fileSize && ` • ${(doc.fileSize / 1024).toFixed(0)} KB`}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewDocFile(doc.id)}
                            className="h-6 px-2 text-[10px] font-semibold border-border text-primary hover:bg-surface"
                          >
                            <Eye className="w-3 h-3 mr-1" /> View File
                          </Button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-text-secondary italic">
                          Awaiting customer upload
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 2. Additional Verification Document Requests */}
          <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
            <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-text-primary">
                  Additional Verification Document Requests
                </CardTitle>
                <CardDescription className="text-text-secondary text-xs">
                  Officer-initiated requirements created specifically for this application.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRequestDocsOpen(true)}
                disabled={app.status !== 'UNDER_REVIEW'}
                className="h-7 text-xs border-warning/40 text-warning hover:bg-warning/10"
              >
                <FileQuestion className="w-3.5 h-3.5 mr-1" /> Request Additional Document
              </Button>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {app.documentRequests && app.documentRequests.length > 0 ? (
                <div className="space-y-2">
                  {app.documentRequests.map((docReq: any) => (
                    <div
                      key={docReq.id}
                      className="p-3.5 rounded-xl border border-border bg-surface-elevated flex items-center justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-text-primary">{docReq.title}</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-surface text-text-secondary border border-border">
                            {docReq.documentType}
                          </span>
                        </div>
                        {docReq.description && <p className="text-text-secondary">{docReq.description}</p>}
                        <span className="text-[10px] text-text-secondary block">
                          Requested by {docReq.requestedBy || 'Underwriter'} on {new Date(docReq.createdAt).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                      <Badge
                        className={`text-[10px] font-bold ${
                          docReq.status === 'FULFILLED'
                            ? 'bg-success text-background'
                            : 'bg-warning/20 text-warning border-warning/30'
                        }`}
                      >
                        {docReq.status === 'FULFILLED' ? '✓ Received / Fulfilled' : 'Pending Customer Upload'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-secondary py-6 text-center">
                  No additional document requirements recorded for this application.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SECTION: PAYMENTS TAB */}
      {activeSection === 'PAYMENTS' && (() => {
        const appPayments = app.applicationPayments || [];
        const kycPayments = app.customerPayments || [];
        const fallbackPayments = (app.payments || searchPayments || []);

        const allKyc = kycPayments.length > 0
          ? kycPayments
          : fallbackPayments.filter((p: any) => p.paymentType === 'KYC_VERIFICATION' || p.chargeType?.toLowerCase().includes('kyc'));

        const allApp = appPayments.length > 0
          ? appPayments
          : fallbackPayments.filter((p: any) => !allKyc.some((kp: any) => kp.id === p.id));

        return (
          <div className="space-y-6">
            {/* Group 1: Application Payments */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-text-primary">
                  Application Payments & Charges
                </CardTitle>
                <CardDescription className="text-text-secondary text-xs">
                  Processing fees, GST, and loan-specific charges associated with #{app.applicationNumber}.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {allApp.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">
                    No application-specific payments recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {allApp.map((p: any) => (
                      <div key={p.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-text-primary text-xs">{p.chargeType || 'Processing Fee'}</span>
                            <Badge className={p.status === 'PAID' || p.status === 'SUCCESS' ? 'bg-success text-background' : 'bg-warning text-text-primary'}>
                              {p.status}
                            </Badge>
                          </div>
                          <p className="font-mono text-primary text-[11px]">
                            UTR: <strong className="text-text-primary">{p.utr || p.transactionRef || 'N/A'}</strong>
                          </p>
                          <p className="text-text-secondary text-[10px]">
                            Receipt #{p.receiptNumber || 'N/A'} • {new Date(p.submittedAt || p.paymentDate).toLocaleDateString('en-IN')}
                            {p.verifiedAt && ` • Verified on ${new Date(p.verifiedAt).toLocaleDateString('en-IN')}`}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 self-end sm:self-auto">
                          <span className="font-black text-sm text-success">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                          {p.invoiceUrl || p.invoiceId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoiceFile(p.invoiceId || p.chargeId || p.id)}
                              className="h-7 text-[11px] border-border text-primary hover:bg-surface-elevated"
                            >
                              <Receipt className="w-3 h-3 mr-1" /> Invoice
                            </Button>
                          ) : null}
                          {(p.status === 'PENDING' || p.status === 'UNDER_VERIFICATION') && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await apiClient.post(`/admin/payments/${p.id}/verify`);
                                  invalidate();
                                  setActionSuccess('Payment verified successfully.');
                                } catch (e: any) {
                                  setActionError(e?.message || 'Failed to verify payment');
                                }
                              }}
                              className="h-7 text-[11px] bg-success text-background hover:brightness-110 font-bold"
                            >
                              Verify
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Group 2: Customer / KYC Payments */}
            <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-hidden">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-sm font-bold text-text-primary">
                  KYC & Borrower Verification Payments
                </CardTitle>
                <CardDescription className="text-text-secondary text-xs">
                  Customer-level compliance payments and verification charges.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {allKyc.length === 0 ? (
                  <p className="text-xs text-text-secondary py-6 text-center">
                    No KYC verification payments recorded.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {allKyc.map((p: any) => (
                      <div key={p.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-text-primary text-xs">{p.chargeType || 'KYC Verification Charge'}</span>
                            <Badge className="bg-success text-background text-[10px] font-bold">
                              {p.status || 'PAID'}
                            </Badge>
                          </div>
                          <p className="font-mono text-primary text-[11px]">
                            UTR: <strong className="text-text-primary">{p.utr || p.transactionRef || 'N/A'}</strong>
                          </p>
                          <p className="text-text-secondary text-[10px]">
                            Receipt #{p.receiptNumber || 'N/A'} • {new Date(p.submittedAt || p.paymentDate).toLocaleDateString('en-IN')}
                            {p.verifiedAt && ` • Verified on ${new Date(p.verifiedAt).toLocaleDateString('en-IN')}`}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 self-end sm:self-auto">
                          <span className="font-black text-sm text-success">₹{Number(p.amount).toLocaleString('en-IN')}</span>
                          {p.invoiceUrl || p.invoiceId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoiceFile(p.invoiceId || p.chargeId || p.id)}
                              className="h-7 text-[11px] border-border text-primary hover:bg-surface-elevated"
                            >
                              <Receipt className="w-3 h-3 mr-1" /> Tax Invoice
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* SECTION: SPECIFIC CHARGES TAB */}
      {activeSection === 'CHARGES' && (
        <SpecificChargesSection
          customerId={app.customer.id}
          customerName={app.customer.fullName}
          applicationId={app.applicationNumber}
          loanId={app.id}
        />
      )}

      {/* SECTION 10 (BOTTOM): Bottom Underwriting Decision Action Bar */}
      <Card className="border-border bg-surface text-text-primary shadow-xl rounded-2xl overflow-hidden">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-text-secondary">Underwriting Final Decision</span>
            <p className="text-[11px] text-text-secondary">
              Select an action to conclude this stage of the loan evaluation.
            </p>
          </div>
          {renderActionButtons()}
        </CardContent>
      </Card>

      {/* MODAL: Start Review Dialog */}
      <Dialog open={startReviewOpen} onOpenChange={setStartReviewOpen}>
        <DialogContent className="bg-surface border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle>Start Underwriting Review</DialogTitle>
            <DialogDescription className="text-text-secondary text-xs">
              Assign this loan application #{app.applicationNumber} to yourself and move status to UNDER_REVIEW.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setStartReviewOpen(false)} className="border-border text-text-secondary text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending}
              className="bg-primary text-background hover:bg-secondary text-text-primary text-xs font-bold"
            >
              {reviewMutation.isPending ? 'Starting...' : 'Confirm Start Review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Full Underwriting Approve Dialog */}
      {approveOpen && (
        <div className="fixed inset-0 z-50 bg-surface-elevated/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh] text-text-primary">
            <div>
              <h3 className="font-bold text-base text-text-primary">Sanction & Approve Loan Application</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Review terms and specify approved financial sanction parameters.
              </p>
            </div>

            {/* Read-Only Overview */}
            <div className="p-3.5 bg-surface-elevated rounded-xl border border-border text-xs">
              <p className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Applicant Overview (Read-Only)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <span className="text-[10px] text-text-secondary block">Customer Name</span>
                  <span className="font-semibold text-text-primary">{app.customer.fullName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary block">Application ID</span>
                  <span className="font-mono text-text-primary">#{app.applicationNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary block">Requested Amount</span>
                  <span className="font-bold text-success">₹{app.requestedAmount.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary block">State / City</span>
                  <span className="text-text-secondary">{app.customer.state || 'N/A'}, {app.customer.city || ''}</span>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary block">KYC Status</span>
                  <span className={`font-semibold ${isKycVerified ? 'text-success' : 'text-warning'}`}>
                    {app.customer.kycStatus || 'PENDING'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary block">Mobile</span>
                  <span className="text-text-primary">+91 {app.customer.mobile}</span>
                </div>
              </div>
            </div>

            {/* KYC Gate Notice in Modal */}
            {!isKycVerified && (
              <div className="p-3 bg-warning/15 border border-warning/30 rounded-xl text-warning text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                <div>
                  <p className="font-semibold">KYC Verification Gate</p>
                  <p className="text-[11px] text-amber-200/80">
                    Customer KYC status is &quot;{app.customer.kycStatus || 'PENDING'}&quot;. Customer identity must be verified in the KYC module before a loan can be sanctioned.
                  </p>
                </div>
              </div>
            )}

            {!confirmStep ? (
              <>
                {/* Editable Underwriting Parameters */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Approved Amount (₹) *</label>
                    <Input
                      type="number"
                      value={approvedAmount}
                      onChange={(e) => setApprovedAmount(e.target.value)}
                      placeholder={String(app.requestedAmount)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Interest Rate (% p.a.) *</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Tenure (Months) *</label>
                    <Input
                      type="number"
                      value={tenureMonths}
                      onChange={(e) => setTenureMonths(e.target.value)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-text-secondary uppercase">Monthly EMI (₹)</label>
                      {isEmiOverridden && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-warning/20 text-warning font-semibold">
                          Manual Override
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      value={manualEmi || String(calculatedEmi)}
                      onChange={(e) => setManualEmi(e.target.value)}
                      placeholder={String(calculatedEmi)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Processing Fee (₹)</label>
                    <Input
                      type="number"
                      value={processingFee}
                      onChange={(e) => setProcessingFee(e.target.value)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Insurance (₹)</label>
                    <Input
                      type="number"
                      value={insurance}
                      onChange={(e) => setInsurance(e.target.value)}
                      className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                    />
                  </div>
                </div>

                {/* Expected Disbursement Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Expected Disbursement Date</label>
                  <Input
                    type="date"
                    value={disbursementDate}
                    onChange={(e) => setDisbursementDate(e.target.value)}
                    className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                  />
                </div>

                {/* Live Financial Summary */}
                <div className="p-3 bg-surface-elevated rounded-xl border border-border space-y-2">
                  <p className="text-[11px] font-bold text-success uppercase tracking-wider">Sanction Summary</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 bg-surface rounded-lg">
                      <p className="text-[10px] text-text-secondary">Approved Amount</p>
                      <p className="text-xs font-bold text-text-primary">₹{(parseFloat(approvedAmount) || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-2 bg-surface rounded-lg">
                      <p className="text-[10px] text-text-secondary">Monthly EMI</p>
                      <p className="text-xs font-bold text-text-primary">₹{emi.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-2 bg-surface rounded-lg">
                      <p className="text-[10px] text-text-secondary">Total Interest</p>
                      <p className="text-xs font-bold text-warning">₹{totalInterest.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="p-2 bg-surface rounded-lg">
                      <p className="text-[10px] text-text-secondary">Total Payable</p>
                      <p className="text-xs font-bold text-success">₹{totalPayable.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Admin Remark</label>
                  <Input
                    value={adminRemark}
                    onChange={(e) => setAdminRemark(e.target.value)}
                    placeholder="e.g. Risk criteria met, verified applicant identity and income"
                    className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
                  />
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setApproveOpen(false)}
                    className="flex-1 h-9 border-border text-text-secondary text-xs rounded-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setConfirmStep(true)}
                    disabled={!approvedAmount || !isKycVerified}
                    className="flex-1 h-9 bg-success text-background hover:brightness-110 text-text-primary font-bold text-xs rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Proceed to Confirm →
                  </Button>
                </div>
              </>
            ) : (
              /* Step 2: Final Confirmation */
              <div className="space-y-4 py-2">
                <div className="p-4 bg-success/10 border border-success/30 rounded-xl space-y-3 text-xs">
                  <p className="font-bold text-success text-sm">Please Confirm Loan Sanction</p>
                  <p className="text-text-secondary">
                    Are you sure you want to approve this loan of <strong>₹{(parseFloat(approvedAmount) || 0).toLocaleString('en-IN')}</strong> at <strong>{interestRate}% p.a.</strong> with monthly EMI of <strong>₹{emi.toLocaleString('en-IN')}</strong> for <strong>{tenureMonths} months</strong>?
                  </p>
                  <div className="pt-2 border-t border-success/20 text-[11px] text-text-secondary">
                    This will officially approve the loan application, generate the loan agreement, and prepare the EMI schedule.
                  </div>
                </div>

                <div className="flex space-x-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmStep(false)}
                    className="flex-1 h-9 border-border text-text-secondary text-xs rounded-xl"
                  >
                    ← Back to Edit
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="flex-1 h-9 bg-success text-background hover:brightness-110 text-text-primary font-bold text-xs rounded-xl"
                  >
                    {approveMutation.isPending ? 'Sanctioning Loan...' : 'Confirm & Sanction Loan'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Modify Amount Dialog */}
      <Dialog open={modifyAmountOpen} onOpenChange={setModifyAmountOpen}>
        <DialogContent className="bg-surface border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle>Modify Loan Amount (Underwriter Offer)</DialogTitle>
            <DialogDescription className="text-text-secondary text-xs">
              Propose a revised loan offer to the applicant. The customer will be prompted to accept or decline the revised amount.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-surface-elevated/70 rounded-xl border border-border text-xs flex justify-between items-center">
              <div>
                <span className="text-[10px] text-text-secondary uppercase tracking-wider block font-bold">Original Requested Amount</span>
                <span className="text-[11px] text-text-secondary">Customer applied amount (immutable)</span>
              </div>
              <strong className="text-success font-mono text-sm font-black">
                ₹{Number(app.requestedAmount).toLocaleString('en-IN')}
              </strong>
            </div>

            <div className="space-y-1">
              <Label htmlFor="proposedAmount" className="text-xs font-semibold text-text-primary">
                Proposed / Sanctioned Loan Amount (₹)
              </Label>
              <Input
                id="proposedAmount"
                type="text"
                inputMode="numeric"
                value={proposedAmountInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, '');
                  setProposedAmountInput(raw);
                }}
                placeholder="e.g. 4000000"
                className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg font-mono font-bold"
              />
              {proposedAmountInput && !isNaN(Number(proposedAmountInput)) && Number(proposedAmountInput) > 0 && (
                <p className="text-[11px] text-text-secondary mt-1">
                  Proposed Sanction: <strong className="text-primary font-mono font-bold">₹{Number(proposedAmountInput).toLocaleString('en-IN')}</strong>
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModifyAmountOpen(false)} className="border-border text-text-secondary text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => modifyMutation.mutate()}
              disabled={modifyMutation.isPending || !proposedAmountInput || Number(proposedAmountInput) <= 0}
              className="bg-primary text-background hover:bg-secondary text-text-primary text-xs font-bold"
            >
              {modifyMutation.isPending ? 'Submitting...' : 'Submit Modified Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Request Documents Dialog */}
      <Dialog open={requestDocsOpen} onOpenChange={setRequestDocsOpen}>
        <DialogContent className="bg-surface border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle>Request Additional Verification Documents</DialogTitle>
            <DialogDescription className="text-text-secondary text-xs">
              Create a document requirement linked to this application. The borrower will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="docType" className="text-text-secondary">Document Type</Label>
              <select
                id="docType"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-xs h-9 rounded-lg border border-input-border bg-input text-text-primary px-2.5 py-1.5"
              >
                <option value="BANK_STATEMENT">Bank Statement (6 Months)</option>
                <option value="INCOME_PROOF">Income Proof (Salary Slip / Form 16 / ITR)</option>
                <option value="PAN">PAN Card Clear Photo</option>
                <option value="AADHAAR_FRONT">Aadhaar Card Front</option>
                <option value="AADHAAR_BACK">Aadhaar Card Back</option>
                <option value="OTHER">Other Specific Verification</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="docTitle" className="text-text-secondary">Requirement Title *</Label>
              <Input
                id="docTitle"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="e.g. Last 6 Months Bank Statement"
                className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="docDesc" className="text-text-secondary">Instructions for Borrower</Label>
              <Input
                id="docDesc"
                value={docDesc}
                onChange={(e) => setDocDesc(e.target.value)}
                placeholder="e.g. Please upload PDF showing continuous salary credits"
                className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRequestDocsOpen(false)} className="border-border text-text-secondary text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => requestDocsMutation.mutate()}
              disabled={requestDocsMutation.isPending || !docTitle}
              className="bg-warning text-background hover:brightness-110 text-text-primary text-xs font-bold"
            >
              {requestDocsMutation.isPending ? 'Sending...' : 'Send Request to Borrower'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Hold Dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="bg-surface border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle>Place Application On Hold</DialogTitle>
            <DialogDescription className="text-text-secondary text-xs">
              Underwriting review will be paused. A mandatory reason is required.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="holdReason" className="text-xs text-text-secondary">Mandatory Hold Reason *</Label>
            <Input
              id="holdReason"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Awaiting verification of employer contact"
              className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHoldOpen(false)} className="border-border text-text-secondary text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => holdMutation.mutate()}
              disabled={holdMutation.isPending || !holdReason.trim()}
              className="bg-warning text-background hover:brightness-110 text-text-primary text-xs font-bold"
            >
              {holdMutation.isPending ? 'Saving...' : 'Confirm Hold'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: Reject Dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="bg-surface border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Loan Application</DialogTitle>
            <DialogDescription className="text-text-secondary text-xs">
              Mark application #{app.applicationNumber} as REJECTED. A mandatory rejection reason is required and will be audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rejectionReason" className="text-xs text-text-secondary">Mandatory Rejection Reason *</Label>
            <Input
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Insufficient disposable income for requested tenure"
              className="bg-surface-elevated border-border text-text-primary text-xs h-9 rounded-lg"
              required
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} className="border-border text-text-secondary text-xs">
              Cancel
            </Button>
            <Button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
              className="bg-danger hover:brightness-110 text-text-primary text-xs font-bold"
            >
              {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={pdfViewer.open}
        onClose={pdfViewer.closeModal}
        blob={pdfViewer.blob}
        blobUrl={pdfViewer.blobUrl}
        pdfBytes={pdfViewer.pdfBytes}
        isImage={pdfViewer.isImage}
        loading={pdfViewer.loading}
        fetchError={pdfViewer.error}
        title={pdfViewerTitle || 'Document Viewer'}
        description="Authenticated document viewer"
        downloadFilename={`${(pdfViewerTitle || 'document').replace(/[\s\/—]+/g, '_')}.pdf`}
        onDownload={pdfDownloadFn || undefined}
        onRetry={pdfViewer.retry}
      />
    </div>
  );
};


import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  CheckCircle2,
  Clock,
  RotateCw,
  AlertCircle,
  FileText,
  Loader2,
  Filter,
  Eye,
  ShieldCheck,
  RefreshCw,
  XCircle,
  FileSearch,
  X,
  ShieldAlert,
  IndianRupee,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';

interface KycDocument {
  id: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  fileSize?: number;
  status: string;
  uploadedAt: string;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

interface KycCustomerItem {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  state: string;
  city: string;
  address?: string;
  monthlyIncome?: number;
  aadhaarMasked?: string;
  panMasked?: string;
  accountStatus: string;
  kycStatus: string;
  kycType: string;
  applicationId: string;
  loanId?: string | null;
  loanType?: string | null;
  loanStatus?: string | null;
  requestedAmount?: number | null;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  documents: KycDocument[];
  isKycFeePaid?: boolean;
  hasUtr?: boolean;
  utr?: string | null;
  kycChargeStatus?: string;
  kycChargeAmount?: number;
  kycChargeId?: string | null;
  docStats: {
    total: number;
    approved: number;
    pending: number;
    reuploadRequired: number;
    rejected: number;
  };
}

interface KycCounts {
  all: number;
  pendingVerification: number;
  pendingApproval: number;
  paymentPending?: number;
  verified: number;
  rejected: number;
  correctionRequired: number;
}

export const AdminKycList: React.FC = () => {
  const { hasPermission } = useAuth();
  const canVerify = hasPermission('kyc.verify');
  const canReject = hasPermission('kyc.reject');
  const canCorrection = hasPermission('kyc.correction');

  // Data & queue state
  const [customers, setCustomers] = useState<KycCustomerItem[]>([]);
  const [counts, setCounts] = useState<KycCounts>({
    all: 0,
    pendingVerification: 0,
    pendingApproval: 0,
    verified: 0,
    rejected: 0,
    correctionRequired: 0,
  });
  const [statesList, setStatesList] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review Drawer / Modal state
  const [activeDrawerCustomer, setActiveDrawerCustomer] = useState<KycCustomerItem | null>(null);
  // Ref to always hold the latest activeDrawerCustomer value so the polling
  // interval in fetchKycList never closes over a stale reference.
  const activeDrawerCustomerRef = React.useRef<KycCustomerItem | null>(null);
  // Keep ref in sync with state on every render
  activeDrawerCustomerRef.current = activeDrawerCustomer;
  const [viewDocsCustomer, setViewDocsCustomer] = useState<KycCustomerItem | null>(null);

  // Action Modals State
  const [verifyCustomer, setVerifyCustomer] = useState<KycCustomerItem | null>(null);
  const [verifyConfirmed, setVerifyConfirmed] = useState<boolean>(false);

  const [rejectCustomer, setRejectCustomer] = useState<KycCustomerItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectAdminRemark, setRejectAdminRemark] = useState<string>('');

  const [correctionCustomer, setCorrectionCustomer] = useState<KycCustomerItem | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionAdminRemark, setCorrectionAdminRemark] = useState<string>('');

  // Document-level action modal state
  const [activeDocAction, setActiveDocAction] = useState<{
    doc: KycDocument;
    action: 'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD';
  } | null>(null);
  const [docActionReason, setDocActionReason] = useState<string>('');

  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // PDF viewer via react-pdf canvas renderer
  const pdfViewer = usePdfViewer();
  const [pdfTitle, setPdfTitle] = useState<string>('');
  const [pdfDownloadName, setPdfDownloadName] = useState<string>('document.pdf');

  // Delete state
  const [deleteCustomer, setDeleteCustomer] = useState<KycCustomerItem | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState<boolean>(false);

  // Load distinct states
  useEffect(() => {
    const loadStates = async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMERS.STATES);
        if (Array.isArray(res.data)) {
          setStatesList(res.data);
        }
      } catch {
        // Non-critical fallback
      }
    };
    loadStates();
  }, []);

  // Fetch KYC list
  const fetchKycList = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      else setIsRefreshing(true);
      setErrorMessage(null);

      const params = new URLSearchParams();
      if (activeTab !== 'ALL') params.append('status', activeTab);
      if (searchTerm.trim().length > 0) params.append('search', searchTerm.trim());

      const res = await apiClient.get(`${API_ENDPOINTS.ADMIN.KYC_LIST}?${params.toString()}`);
      const data = res.data?.data || res.data || {};
      setCustomers(data.customers || []);
      if (data.counts) {
        setCounts(data.counts);
      }

      // If drawer is currently open, refresh its data reference.
      // Use the ref (not state) so we always read the latest value without
      // this callback needing activeDrawerCustomer as a dependency — which
      // was the root cause of the close-button bug: a stale closure would
      // see the pre-close non-null value and re-open the drawer.
      const currentDrawer = activeDrawerCustomerRef.current;
      if (currentDrawer) {
        const updated = (data.customers || []).find((c: KycCustomerItem) => c.id === currentDrawer.id);
        if (updated) setActiveDrawerCustomer(updated);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to load KYC queue';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab, searchTerm]);

  useEffect(() => {
    fetchKycList();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchKycList(true);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchKycList]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchKycList();
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setStateFilter('');
    setActiveTab('ALL');
  };

  // Filter in-memory for state
  const filteredCustomers = customers.filter((c) => {
    if (stateFilter && c.state.toLowerCase() !== stateFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  // Action: Open secure document file
  const handleOpenDocumentFile = async (documentId: string, fileName: string) => {
    try {
      setPdfTitle(`KYC Document — ${fileName}`);
      setPdfDownloadName(fileName);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.ADMIN.DOCUMENT_FILE(documentId));
    } catch {
      setActionError(`Failed to stream document "${fileName}".`);
    }
  };

  // Action: Verify / Approve KYC
  const handleConfirmVerify = async () => {
    if (!verifyCustomer) return;
    try {
      setIsSubmittingAction(true);
      setActionError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.KYC_DECISION(verifyCustomer.id), {
        status: 'APPROVED',
      });

      setSuccessMessage(`KYC approved for ${verifyCustomer.fullName}. Audit log and notification created.`);
      setVerifyCustomer(null);
      setVerifyConfirmed(false);
      if (activeDrawerCustomer?.id === verifyCustomer.id) {
        setActiveDrawerCustomer(null);
      }
      fetchKycList(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to verify KYC';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Verify KYC Fee Payment (UTR)
  const handleVerifyPayment = async (chargeId: string, customerName?: string) => {
    if (!chargeId) return;
    try {
      setIsSubmittingAction(true);
      setActionError(null);

      await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT(chargeId));

      setSuccessMessage(`Payment verified successfully for ${customerName || 'Customer'}. Tax invoice generated.`);
      fetchKycList(true);
      if (activeDrawerCustomer) {
        setActiveDrawerCustomer((prev) =>
          prev ? { ...prev, isKycFeePaid: true, hasUtr: true } : null
        );
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to verify payment reference';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: View Invoice PDF securely
  const handleViewInvoice = async (chargeId: string, customerName?: string) => {
    if (!chargeId) return;
    try {
      setPdfTitle(`Tax Invoice — ${customerName || 'Customer'}`);
      setPdfDownloadName(`Invoice_${customerName || 'Customer'}_${chargeId.slice(0, 8)}.pdf`);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeId, false));
    } catch {
      setActionError(`Failed to stream invoice for ${customerName || 'Customer'}.`);
    }
  };

  // Action: Reject KYC
  const handleConfirmReject = async () => {
    if (!rejectCustomer) return;
    if (!rejectionReason.trim()) {
      setActionError('Rejection reason is mandatory.');
      return;
    }

    try {
      setIsSubmittingAction(true);
      setActionError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.KYC_DECISION(rejectCustomer.id), {
        status: 'REJECTED',
        reason: rejectionReason.trim(),
        remark: rejectAdminRemark.trim() || undefined,
      });

      setSuccessMessage(`KYC rejected for ${rejectCustomer.fullName}. Customer notified.`);
      setRejectCustomer(null);
      setRejectionReason('');
      setRejectAdminRemark('');
      if (activeDrawerCustomer?.id === rejectCustomer.id) {
        setActiveDrawerCustomer(null);
      }
      fetchKycList(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to reject KYC';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Request Correction
  const handleConfirmCorrection = async () => {
    if (!correctionCustomer) return;
    if (!correctionReason.trim()) {
      setActionError('Correction instructions are mandatory.');
      return;
    }

    try {
      setIsSubmittingAction(true);
      setActionError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.KYC_DECISION(correctionCustomer.id), {
        status: 'REUPLOAD_REQUIRED',
        reason: correctionReason.trim(),
        remark: correctionAdminRemark.trim() || undefined,
      });

      setSuccessMessage(`Correction requested from ${correctionCustomer.fullName}. Re-upload required.`);
      setCorrectionCustomer(null);
      setCorrectionReason('');
      setCorrectionAdminRemark('');
      if (activeDrawerCustomer?.id === correctionCustomer.id) {
        setActiveDrawerCustomer(null);
      }
      fetchKycList(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to request correction';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Action: Remove KYC Submission ONLY (NOT a customer delete)
  // Calls DELETE /admin/kyc/:customerId which:
  //   - Deletes only KYC identity documents (AADHAAR_FRONT, AADHAAR_BACK, PAN)
  //   - Resets kycStatus to PENDING
  //   - Sends a re-submit notification to the customer
  //   - Does NOT touch the customer account, loans, charges, payments, invoices
  const handleConfirmDelete = async () => {
    if (!deleteCustomer) return;
    try {
      setIsDeletingCustomer(true);
      setActionError(null);

      await apiClient.delete(API_ENDPOINTS.ADMIN.KYC_RESET(deleteCustomer.id));

      setSuccessMessage(
        `KYC submission removed for "${deleteCustomer.fullName}". Customer account is intact. Customer can re-submit KYC.`
      );
      const removed = deleteCustomer;
      setDeleteCustomer(null);
      if (activeDrawerCustomer?.id === removed.id) {
        setActiveDrawerCustomer(null);
      }
      fetchKycList(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to remove KYC submission';
      setActionError(msg);
    } finally {
      setIsDeletingCustomer(false);
    }
  };


  // Action: Document-Level Review (Approve, Reject, Re-upload)
  const handleConfirmDocAction = async () => {
    if (!activeDocAction) return;
    const { doc, action } = activeDocAction;

    if ((action === 'REJECT' || action === 'REQUEST_REUPLOAD') && !docActionReason.trim()) {
      setActionError('Reason is required when rejecting or requesting re-upload of a document.');
      return;
    }

    try {
      setIsSubmittingAction(true);
      setActionError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.REVIEW_DOCUMENT(doc.id), {
        action,
        reason: docActionReason.trim() || undefined,
      });

      setSuccessMessage(`Document "${doc.documentType}" status updated.`);
      setActiveDocAction(null);
      setDocActionReason('');
      fetchKycList(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update document status';
      setActionError(msg);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const getStatusBadge = (status: string, isKycFeePaid?: boolean) => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'APPROVED' || s === 'VERIFIED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success border border-success/30 shadow-sm">
          <CheckCircle2 className="w-3 h-3 mr-1" /> VERIFIED
        </span>
      );
    }
    if (isKycFeePaid === false && (s === 'UNDER_REVIEW' || s === 'PENDING')) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 border border-amber-500/30">
          <Clock className="w-3 h-3 mr-1 text-amber-500" /> PAYMENT PENDING
        </span>
      );
    }
    if (s === 'REUPLOAD_REQUIRED' || s === 'CORRECTION_REQUIRED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-warning border border-warning/30">
          <RotateCw className="w-3 h-3 mr-1" /> CORRECTION REQUIRED
        </span>
      );
    }
    if (s === 'REJECTED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-danger/15 text-danger border border-danger/30">
          <AlertCircle className="w-3 h-3 mr-1" /> REJECTED
        </span>
      );
    }
    if (s === 'UNDER_REVIEW') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-primary border border-primary/30">
          <Clock className="w-3 h-3 mr-1" /> UNDER REVIEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-elevated text-text-secondary border border-border">
        <Clock className="w-3 h-3 mr-1 text-text-secondary" /> PENDING
      </span>
    );
  };

  // Status Tabs matching user specification
  const tabs = [
    { label: 'All KYC', value: 'ALL', count: counts.all },
    { label: 'Payment Pending', value: 'PAYMENT_PENDING', count: (counts as any).paymentPending || 0 },
    { label: 'Pending Verification', value: 'PENDING_VERIFICATION', count: counts.pendingVerification },
    { label: 'Verified', value: 'VERIFIED', count: counts.verified },
    { label: 'Correction Required', value: 'CORRECTION_REQUIRED', count: counts.correctionRequired || 0 },
    { label: 'Rejected', value: 'REJECTED', count: counts.rejected },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-text-secondary mb-1">
            <Link to="/admin/dashboard" className="hover:text-text-primary transition">Dashboard</Link>
            <span>›</span>
            <span className="text-text-secondary">Verification</span>
            <span>›</span>
            <span className="text-text-primary font-semibold">KYC Verification</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-success" />
            KYC Operations Center
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time identity verification, Aadhaar/PAN compliance inspection, and underwriter action gates.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => fetchKycList(true)}
            variant="outline"
            size="sm"
            disabled={isLoading || isRefreshing}
            className="bg-surface-elevated border-border text-text-primary hover:bg-surface-elevated hover:brightness-110 text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Action Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 text-success text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-danger shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <Card className="bg-surface border border-border rounded-2xl shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 border-b border-border pb-3">
            {tabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  activeTab === tab.value
                    ? 'bg-[#D4AF37] text-black shadow-sm font-bold'
                    : 'bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:bg-[#222222]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    activeTab === tab.value
                      ? 'bg-black text-[#D4AF37]'
                      : 'bg-surface text-text-secondary border border-border'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & State Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                  <Input
                    placeholder="Search by customer name, mobile, email, or application ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs text-text-primary placeholder-[#737373] focus:outline-none focus:border-[#D4AF37] focus:bg-surface-elevated"
                  />
                </div>
                <Button type="submit" size="sm" className="px-3.5 h-9 text-xs bg-[#D4AF37] hover:bg-[#C9A227] text-black font-bold shadow-sm">
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  Filter
                </Button>
              </form>
            </div>

            <div className="flex gap-2">
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full text-xs h-9 rounded-lg border border-border bg-surface-elevated text-text-primary px-2.5 py-1.5 focus:outline-none focus:border-[#D4AF37] font-medium"
              >
                <option value="">All States</option>
                {statesList.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-9 px-3 bg-surface-elevated border border-border text-text-secondary hover:text-text-primary hover:bg-[#222222] text-xs"
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Customer KYC Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-3 bg-surface rounded-2xl border border-border p-12">
          <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
          <p className="text-xs text-text-secondary font-medium">Loading KYC compliance queue...</p>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card className="bg-surface border border-border text-center py-10 shadow-sm rounded-2xl">
          <CardContent className="space-y-3 max-w-sm mx-auto">
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border text-[#D4AF37] flex items-center justify-center mx-auto shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">No KYC Records in Queue</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                No customer verification requests match your selected filters or search query.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="text-xs bg-surface-elevated border-border text-text-primary hover:bg-[#222222] font-medium"
            >
              Reset Filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-text-secondary">
              <thead className="bg-surface-elevated border-b border-border text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">Application ID</th>
                  <th className="px-4 py-3.5">Mobile</th>
                  <th className="px-4 py-3.5">State</th>
                  <th className="px-4 py-3.5 text-center">KYC Status</th>
                  <th className="px-4 py-3.5 text-center">Payment / UTR</th>
                  <th className="px-4 py-3.5 text-center">Documents</th>
                  <th className="px-4 py-3.5">Submitted Date</th>
                  <th className="px-4 py-3.5">Last Updated</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {filteredCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-elevated/60 transition-colors">
                    {/* Customer */}
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-text-primary">{c.fullName}</div>
                      <div className="text-[11px] text-text-secondary truncate max-w-[170px]">{c.email}</div>
                    </td>

                    {/* Application ID */}
                    <td className="px-4 py-3.5">
                      {c.loanId ? (
                        <Link
                          to={`/admin/loans/${c.loanId}`}
                          className="font-mono text-xs font-bold text-primary hover:text-[#E0C766] hover:underline"
                        >
                          {c.applicationId}
                        </Link>
                      ) : (
                        <span className="font-mono text-text-secondary text-xs">{c.applicationId || 'N/A'}</span>
                      )}
                    </td>

                    {/* Mobile */}
                    <td className="px-4 py-3.5 font-mono text-text-primary">
                      +91 {c.mobile}
                    </td>

                    {/* State */}
                    <td className="px-4 py-3.5 text-text-secondary">
                      {c.state || 'Maharashtra'}
                    </td>

                    {/* KYC Status */}
                    <td className="px-4 py-3.5 text-center">
                      {getStatusBadge(c.kycStatus, c.isKycFeePaid)}
                    </td>

                    {/* Payment / UTR */}
                    <td className="px-4 py-3.5 text-center">
                      {c.isKycFeePaid ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                            ✓ Payment Verified
                          </Badge>
                          {c.utr && (
                            <span className="font-mono text-[11px] font-bold text-white select-all">
                              UTR: {c.utr}
                            </span>
                          )}
                        </div>
                      ) : c.hasUtr ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge className="bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 text-[11px] font-bold">
                            ✓ UTR Submitted
                          </Badge>
                          <span className="font-mono text-[11px] font-bold text-white select-all" title={c.utr || ''}>
                            UTR: {c.utr}
                          </span>
                        </div>
                      ) : c.kycChargeStatus === 'PENDING' ? (
                        <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                          ⚠ UTR Missing
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-text-secondary border-border text-[11px] font-bold">
                          ⏳ Payment Pending
                        </Badge>
                      )}
                    </td>

                    {/* Documents Count / Button */}
                    <td className="px-4 py-3.5 text-center">
                      <button
                        onClick={() => setViewDocsCustomer(c)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-surface-elevated hover:bg-surface-elevated hover:brightness-110 text-text-primary border border-border transition"
                        title="View Customer Documents"
                      >
                        <FileText className="w-3.5 h-3.5 text-success" />
                        <span>{c.docStats.total} Docs</span>
                      </button>
                    </td>

                    {/* Submitted Date */}
                    <td className="px-4 py-3.5 text-text-secondary text-[11px]">
                      {new Date(c.submittedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Last Updated */}
                    <td className="px-4 py-3.5 text-text-secondary text-[11px]">
                      {new Date(c.updatedAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Primary Visible Actions */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* View KYC */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveDrawerCustomer(c)}
                          title="Open Full KYC Review Screen"
                          className="h-9 px-3 text-xs bg-surface-elevated border-border text-text-primary hover:border-focus hover:text-text-primary rounded-xl font-medium"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1 text-primary" />
                          View KYC
                        </Button>

                        {/* View Documents */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewDocsCustomer(c)}
                          title="Inspect Documents"
                          className="h-9 px-3 text-xs bg-surface-elevated border-border text-text-secondary hover:text-text-primary rounded-xl font-medium"
                        >
                          <FileSearch className="w-3.5 h-3.5 mr-1 text-success" />
                          Docs
                        </Button>

                        {/* Invoice Button if Paid */}
                        {c.isKycFeePaid && c.kycChargeId && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewInvoice(c.kycChargeId!, c.fullName)}
                            title="View KYC Fee Tax Invoice"
                            className="h-9 px-3 text-xs bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 rounded-xl font-bold"
                          >
                            <FileText className="w-3.5 h-3.5 mr-1" />
                            Invoice
                          </Button>
                        )}
                        {canVerify && c.kycStatus !== 'APPROVED' && c.kycStatus !== 'VERIFIED' && (
                          c.isKycFeePaid ? (
                            <Button
                              size="sm"
                              onClick={() => {
                                setVerifyCustomer(c);
                                setVerifyConfirmed(false);
                                setActionError(null);
                              }}
                              title="Approve Customer KYC"
                              className="h-9 px-3.5 text-xs font-bold rounded-xl bg-[#16A34A] hover:bg-[#15803d] text-white shadow-sm transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve KYC
                            </Button>
                          ) : c.hasUtr && c.kycChargeId ? (
                            <Button
                              size="sm"
                              onClick={() => handleVerifyPayment(c.kycChargeId!, c.fullName)}
                              disabled={isSubmittingAction}
                              title="Verify Submitted Payment Reference (UTR)"
                              className="h-9 px-3.5 text-xs font-bold rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-sm transition"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Verify Payment
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={true}
                              title="UTR number is required before KYC approval"
                              className="h-9 px-3.5 text-xs font-bold rounded-xl bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 mr-1 text-slate-400" />
                              UTR Missing
                            </Button>
                          )
                        )}

                        {/* Reject Button (Visible) */}
                        {canReject && c.kycStatus !== 'REJECTED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectCustomer(c);
                              setRejectionReason('');
                              setRejectAdminRemark('');
                              setActionError(null);
                            }}
                            title="Reject KYC"
                            className="h-9 px-3 text-xs bg-danger/10 border-danger/30 text-danger hover:bg-danger/20 rounded-xl font-medium"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Reject
                          </Button>
                        )}

                        {/* Request Correction Button (Visible) */}
                        {canCorrection && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setCorrectionCustomer(c);
                              setCorrectionReason('');
                              setCorrectionAdminRemark('');
                              setActionError(null);
                            }}
                            title="Request Document Correction"
                            className="h-9 px-3 text-xs bg-warning/10 border-warning/30 text-warning hover:bg-warning/20 rounded-xl font-medium"
                          >
                            <RotateCw className="w-3.5 h-3.5 mr-1" />
                            Correction
                          </Button>
                        )}

                        {/* Remove KYC Submission Button */}
                        {canVerify && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDeleteCustomer(c);
                              setActionError(null);
                            }}
                            title="Remove/reset this KYC submission (Customer account remains intact)"
                            className="h-9 px-3 text-xs bg-amber-900/20 border-amber-700/40 text-amber-400 hover:bg-amber-900/40 hover:text-amber-300 rounded-xl font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Remove KYC
                          </Button>
                        )}
                      </div>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* FULL KYC REVIEW DRAWER / SCREEN                                          */}
      {/* ========================================================================= */}
      {activeDrawerCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-in fade-in">
          <div className="bg-surface border border-border w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-elevated/90">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-success/10 border border-success/30 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-success" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-text-primary">{activeDrawerCustomer.fullName}</h3>
                    {getStatusBadge(activeDrawerCustomer.kycStatus)}
                  </div>
                  <p className="text-xs text-text-secondary">
                    Application: <span className="font-mono text-text-primary font-semibold">{activeDrawerCustomer.applicationId}</span> • Registered: {new Date(activeDrawerCustomer.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveDrawerCustomer(null)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Action Bar */}
            <div className="px-5 py-3 bg-background border-b border-border flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-text-secondary">
                Identity Verification Actions for Underwriters:
              </div>
              <div className="flex items-center space-x-2">
                {canCorrection && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCorrectionCustomer(activeDrawerCustomer);
                      setCorrectionReason('');
                      setCorrectionAdminRemark('');
                      setActionError(null);
                    }}
                    className="h-8 px-3 text-xs bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                  >
                    <RotateCw className="w-3.5 h-3.5 mr-1" />
                    Request Correction
                  </Button>
                )}
                {canReject && activeDrawerCustomer.kycStatus !== 'REJECTED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectCustomer(activeDrawerCustomer);
                      setRejectionReason('');
                      setRejectAdminRemark('');
                      setActionError(null);
                    }}
                    className="h-8 px-3 text-xs bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Reject KYC
                  </Button>
                )}
                {canVerify && activeDrawerCustomer.kycStatus !== 'APPROVED' && activeDrawerCustomer.kycStatus !== 'VERIFIED' && (
                  activeDrawerCustomer.isKycFeePaid ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setVerifyCustomer(activeDrawerCustomer);
                        setVerifyConfirmed(false);
                        setActionError(null);
                      }}
                      title="Approve KYC"
                      className="h-8 px-4 text-xs font-bold shadow-sm bg-[#16A34A] hover:bg-[#15803d] text-white"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Approve KYC
                    </Button>
                  ) : activeDrawerCustomer.hasUtr && activeDrawerCustomer.kycChargeId ? (
                    <Button
                      size="sm"
                      onClick={() => handleVerifyPayment(activeDrawerCustomer.kycChargeId!, activeDrawerCustomer.fullName)}
                      disabled={isSubmittingAction}
                      title="Verify Payment Reference (UTR)"
                      className="h-8 px-4 text-xs font-bold shadow-sm bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      Verify Payment
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={true}
                      title="UTR number is required before KYC approval."
                      className="h-8 px-4 text-xs font-bold shadow-sm bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      UTR Missing
                    </Button>
                  )
                )}
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* SPECIFICATION: KYC VERIFICATION & KYC PAYMENT DEDICATED CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. KYC VERIFICATION CARD */}
                <div className="p-4 bg-white rounded-2xl border border-[#D6E4F5] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
                      KYC VERIFICATION
                    </h4>
                    {getStatusBadge(activeDrawerCustomer.kycStatus, activeDrawerCustomer.isKycFeePaid)}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">Customer:</span>
                      <strong className="text-[#0F172A]">{activeDrawerCustomer.fullName}</strong>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">Mobile:</span>
                      <span className="font-mono font-bold text-[#0F172A]">+91 {activeDrawerCustomer.mobile}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">Aadhaar:</span>
                      <span className="font-mono font-bold text-[#0F172A]">
                        {activeDrawerCustomer.aadhaarMasked || 'XXXX XXXX 9564'}
                      </span>
                    </div>

                    <div className="pt-2">
                      <span className="text-[11px] font-bold text-[#64748B] block mb-2">KYC Documents:</span>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const frontDoc = activeDrawerCustomer.documents.find(
                            (d) => d.documentType === 'AADHAAR_FRONT'
                          );
                          const backDoc = activeDrawerCustomer.documents.find(
                            (d) => d.documentType === 'AADHAAR_BACK'
                          );

                          return (
                            <>
                              {frontDoc ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenDocumentFile(frontDoc.id, frontDoc.fileName)}
                                  className="h-8 px-3 text-xs bg-[#F7FAFF] border border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] rounded-xl font-semibold flex items-center gap-1.5"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                                  View Aadhaar Front
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[11px]">
                                  Aadhaar Front Missing
                                </Badge>
                              )}

                              {backDoc ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenDocumentFile(backDoc.id, backDoc.fileName)}
                                  className="h-8 px-3 text-xs bg-[#F7FAFF] border border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] rounded-xl font-semibold flex items-center gap-1.5"
                                >
                                  <Eye className="w-3.5 h-3.5 text-[#2563EB]" />
                                  View Aadhaar Back
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[11px]">
                                  Aadhaar Back Missing
                                </Badge>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. KYC PAYMENT CARD */}
                <div className="p-4 bg-white rounded-2xl border border-[#D6E4F5] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-[#0F172A] flex items-center gap-1.5">
                      <IndianRupee className="w-4 h-4 text-[#2563EB]" />
                      KYC PAYMENT
                    </h4>
                    {activeDrawerCustomer.isKycFeePaid ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                        ✓ Payment Verified
                      </Badge>
                    ) : activeDrawerCustomer.hasUtr ? (
                      <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                        ✓ UTR Provided
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                        ⚠ UTR Missing
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">KYC Charge:</span>
                      <strong className="font-mono text-[#0F172A] text-sm">
                        ₹{(activeDrawerCustomer.kycChargeAmount || 500).toLocaleString('en-IN')}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">UTR Number:</span>
                      <span className="font-mono font-bold text-[#0F172A] bg-[#F7FAFF] px-2 py-0.5 rounded border border-[#D6E4F5]">
                        {activeDrawerCustomer.utr ? `[ ${activeDrawerCustomer.utr} ]` : 'Not Provided'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#D6E4F5]/60">
                      <span className="text-[#64748B]">UTR Status:</span>
                      {activeDrawerCustomer.hasUtr ? (
                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                          ✓ UTR Provided (YES)
                        </span>
                      ) : (
                        <span className="font-bold text-red-600 flex items-center gap-1">
                          ✕ Not Provided (NO)
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center py-1">
                      <span className="text-[#64748B]">Payment Status:</span>
                      <span className="font-bold text-[#0F172A]">
                        {activeDrawerCustomer.isKycFeePaid
                          ? 'PAID / Verified'
                          : activeDrawerCustomer.hasUtr
                          ? 'Pending Verification'
                          : 'Payment Required'}
                      </span>
                    </div>

                    {activeDrawerCustomer.hasUtr && !activeDrawerCustomer.isKycFeePaid && activeDrawerCustomer.kycChargeId && (
                      <div className="pt-2 border-t border-[#D6E4F5]/60">
                        <Button
                          size="sm"
                          onClick={() => handleVerifyPayment(activeDrawerCustomer.kycChargeId!, activeDrawerCustomer.fullName)}
                          disabled={isSubmittingAction}
                          className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-8.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Verify Payment Reference (UTR)</span>
                        </Button>
                      </div>
                    )}

                    {!activeDrawerCustomer.hasUtr && !activeDrawerCustomer.isKycFeePaid && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 mt-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                        <span className="font-medium">UTR number is required before KYC approval.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Applicant & Application Particulars */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Particulars */}
                <div className="p-4 bg-background rounded-xl border border-border space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-success" />
                    Customer Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[10px] text-text-secondary block">Full Name</span>
                      <span className="font-bold text-text-primary">{activeDrawerCustomer.fullName}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary block">Mobile Number</span>
                      <span className="font-mono font-semibold text-text-primary">+91 {activeDrawerCustomer.mobile}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary block">Email Address</span>
                      <span className="text-text-primary truncate block">{activeDrawerCustomer.email}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary block">Location</span>
                      <span className="text-text-primary">{activeDrawerCustomer.city || 'N/A'}, {activeDrawerCustomer.state || 'Maharashtra'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-text-secondary block">Residential Address</span>
                      <span className="text-text-primary">{activeDrawerCustomer.address || 'Address on file'}</span>
                    </div>
                  </div>
                </div>

                {/* Identity Proofs & Protected Credentials */}
                <div className="p-4 bg-background rounded-xl border border-border space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-primary" />
                    Protected Identity Proofs
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 bg-surface-elevated rounded-lg border border-border">
                      <span className="text-[10px] text-text-secondary block">Aadhaar (Masked)</span>
                      <span className="font-mono font-bold text-text-primary text-sm">
                        {activeDrawerCustomer.aadhaarMasked || 'XXXX-XXXX-XXXX'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-surface-elevated rounded-lg border border-border">
                      <span className="text-[10px] text-text-secondary block">PAN (Masked)</span>
                      <span className="font-mono font-bold text-text-primary text-sm">
                        {activeDrawerCustomer.panMasked || 'ABCDE****F'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-surface-elevated rounded-lg border border-border">
                      <span className="text-[10px] text-text-secondary block">KYC Classification</span>
                      <span className="font-semibold text-success">{activeDrawerCustomer.kycType}</span>
                    </div>
                    <div className="p-2.5 bg-surface-elevated rounded-lg border border-border">
                      <span className="text-[10px] text-text-secondary block">Document Compliance</span>
                      <span className="font-semibold text-text-primary">
                        {activeDrawerCustomer.docStats.approved} of {activeDrawerCustomer.docStats.total} Approved
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Uploaded Documents List with Document-Level Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-success" />
                    Submitted Verification Documents ({activeDrawerCustomer.documents.length})
                  </h4>
                  <span className="text-[11px] text-text-secondary">
                    Inspect uploaded files before making underwriting verification decision
                  </span>
                </div>

                {activeDrawerCustomer.documents.length === 0 ? (
                  <div className="p-6 text-center bg-background rounded-xl border border-border text-xs text-text-secondary">
                    No documents uploaded yet by this borrower.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeDrawerCustomer.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-3.5 rounded-xl border border-border bg-background space-y-3 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-bold text-xs text-text-primary block">
                                {doc.documentType.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[11px] text-text-secondary truncate block max-w-[200px]">
                                {doc.fileName}
                              </span>
                            </div>
                            {getStatusBadge(doc.status)}
                          </div>

                          {doc.rejectionReason && (
                            <div className="mt-2 p-2 rounded-lg bg-danger/10 border border-red-500/20 text-[11px] text-red-300">
                              <span className="font-semibold">Reason: </span>
                              {doc.rejectionReason}
                            </div>
                          )}

                          <div className="text-[10px] text-text-secondary mt-2 flex items-center justify-between">
                            <span>Uploaded: {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>
                            {doc.reviewedBy && <span>By: {doc.reviewedBy}</span>}
                          </div>
                        </div>

                        {/* Document Action Buttons */}
                        <div className="pt-2.5 border-t border-border flex items-center justify-between gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDocumentFile(doc.id, doc.fileName)}
                            className="h-7 px-2 text-[11px] bg-surface-elevated border-border text-text-primary hover:border-focus"
                          >
                            <Eye className="w-3 h-3 mr-1 text-primary" />
                            Preview
                          </Button>

                          <div className="flex items-center space-x-1">
                            {canCorrection && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveDocAction({ doc, action: 'REQUEST_REUPLOAD' });
                                  setDocActionReason('');
                                  setActionError(null);
                                }}
                                className="h-7 px-2 text-[11px] bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                              >
                                Re-upload
                              </Button>
                            )}
                            {canReject && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setActiveDocAction({ doc, action: 'REJECT' });
                                  setDocActionReason('');
                                  setActionError(null);
                                }}
                                className="h-7 px-2 text-[11px] bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                              >
                                Reject
                              </Button>
                            )}
                            {canVerify && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActiveDocAction({ doc, action: 'APPROVE' });
                                  setDocActionReason('');
                                  setActionError(null);
                                }}
                                className="h-7 px-2 text-[11px] bg-success hover:bg-[#1eb398] text-[#07111F] font-bold"
                              >
                                Approve
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-4 border-t border-border bg-surface-elevated flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setActiveDrawerCustomer(null)}
                  className="bg-surface border-border text-text-secondary hover:text-text-primary text-xs h-9"
                >
                  Close Drawer
                </Button>

                {canVerify && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDeleteCustomer(activeDrawerCustomer);
                      setActionError(null);
                    }}
                    title="Remove/reset this KYC submission (Customer account remains intact)"
                    className="h-9 px-3 text-xs bg-amber-900/20 border-amber-700/40 text-amber-400 hover:bg-amber-900/40 hover:text-amber-300 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Remove KYC Submission
                  </Button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {canCorrection && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setCorrectionCustomer(activeDrawerCustomer);
                      setCorrectionReason('');
                      setCorrectionAdminRemark('');
                      setActionError(null);
                    }}
                    className="h-9 px-3 text-xs bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                  >
                    <RotateCw className="w-3.5 h-3.5 mr-1" />
                    Request Correction
                  </Button>
                )}
                {canReject && activeDrawerCustomer.kycStatus !== 'REJECTED' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setRejectCustomer(activeDrawerCustomer);
                      setRejectionReason('');
                      setRejectAdminRemark('');
                      setActionError(null);
                    }}
                    className="h-9 px-3 text-xs bg-danger/10 border-danger/30 text-danger hover:bg-danger/20"
                  >
                    <XCircle className="w-3.5 h-3.5 mr-1" />
                    Reject KYC
                  </Button>
                )}
                {canVerify && activeDrawerCustomer.kycStatus !== 'APPROVED' && activeDrawerCustomer.kycStatus !== 'VERIFIED' && (
                  activeDrawerCustomer.isKycFeePaid ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setVerifyCustomer(activeDrawerCustomer);
                        setVerifyConfirmed(false);
                        setActionError(null);
                      }}
                      title="Approve KYC"
                      className="h-9 px-5 text-xs font-bold shadow-sm bg-[#16A34A] hover:bg-[#15803d] text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve KYC
                    </Button>
                  ) : activeDrawerCustomer.hasUtr && activeDrawerCustomer.kycChargeId ? (
                    <Button
                      size="sm"
                      onClick={() => handleVerifyPayment(activeDrawerCustomer.kycChargeId!, activeDrawerCustomer.fullName)}
                      disabled={isSubmittingAction}
                      title="Verify Payment Reference (UTR)"
                      className="h-9 px-5 text-xs font-bold shadow-sm bg-[#2563EB] hover:bg-[#1D4ED8] text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Verify Payment
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={true}
                      title="UTR number is required before KYC approval."
                      className="h-9 px-5 text-xs font-bold shadow-sm bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60"
                    >
                      <AlertTriangle className="w-4 h-4 mr-1.5 text-slate-400" />
                      UTR Missing
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VERIFY KYC CONFIRMATION MODAL                                            */}
      {/* ========================================================================= */}
      {verifyCustomer && (
        <Dialog open={!!verifyCustomer} onOpenChange={(open) => !open && setVerifyCustomer(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-md">
            <DialogHeader>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <DialogTitle className="text-base font-bold text-text-primary">Approve KYC Verification?</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-text-secondary">
                Confirm identity review, validate payment/UTR, and grant KYC approval for this applicant.
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-surface-elevated rounded-xl border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer:</span>
                  <span className="font-bold text-text-primary">{verifyCustomer.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Mobile:</span>
                  <span className="font-mono text-text-primary">+91 {verifyCustomer.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Aadhaar:</span>
                  <span className="font-mono text-text-primary">{verifyCustomer.aadhaarMasked || 'XXXX XXXX 9564'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Documents:</span>
                  <span className="text-success font-semibold">
                    {verifyCustomer.docStats.total} submitted • {verifyCustomer.docStats.approved} verified
                  </span>
                </div>
              </div>

              {/* KYC Payment verification block */}
              <div className="p-3 bg-[#F7FAFF] rounded-xl border border-[#D6E4F5] space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase tracking-wider text-[10px] text-[#64748B]">KYC Payment Particulars</span>
                  {verifyCustomer.isKycFeePaid ? (
                    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                      ✓ Paid
                    </Badge>
                  ) : verifyCustomer.hasUtr ? (
                    <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
                      ✓ UTR Provided
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                      ⚠ UTR Missing
                    </Badge>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">KYC Charge:</span>
                  <strong className="font-mono text-[#0F172A]">
                    ₹{(verifyCustomer.kycChargeAmount || 500).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">UTR Number:</span>
                  <span className="font-mono font-bold text-[#0F172A]">
                    {verifyCustomer.utr ? `[ ${verifyCustomer.utr} ]` : 'Not Provided'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">UTR Status:</span>
                  {verifyCustomer.hasUtr ? (
                    <span className="text-emerald-700 font-bold">✓ UTR Provided (YES)</span>
                  ) : (
                    <span className="text-red-600 font-bold">✕ Not Provided (NO)</span>
                  )}
                </div>
              </div>

              {!verifyCustomer.hasUtr && !verifyCustomer.isKycFeePaid && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span className="font-medium">UTR has not been submitted by the customer. KYC approval is unavailable.</span>
                </div>
              )}

              <label className="flex items-start space-x-2.5 p-3 bg-background rounded-xl border border-border cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyConfirmed}
                  onChange={(e) => setVerifyConfirmed(e.target.checked)}
                  disabled={!verifyCustomer.hasUtr && !verifyCustomer.isKycFeePaid}
                  className="mt-0.5 rounded border-border text-success bg-surface-elevated"
                />
                <span className="text-[11px] text-text-secondary leading-relaxed select-none">
                  I confirm that the submitted KYC information, Aadhaar documents, and payment UTR have been reviewed.
                </span>
              </label>
            </div>

            <DialogFooter className="flex space-x-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVerifyCustomer(null)}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmVerify}
                disabled={isSubmittingAction || !verifyConfirmed || (!verifyCustomer.hasUtr && !verifyCustomer.isKycFeePaid)}
                className="bg-success hover:bg-[#1eb398] text-[#07111F] font-bold text-xs h-9 px-4 disabled:opacity-50"
              >
                {isSubmittingAction ? 'Approving...' : 'Approve KYC'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* REJECT KYC MODAL                                                         */}
      {/* ========================================================================= */}
      {rejectCustomer && (
        <Dialog open={!!rejectCustomer} onOpenChange={(open) => !open && setRejectCustomer(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-md">
            <DialogHeader>
              <div className="flex items-center space-x-2">
                <XCircle className="w-5 h-5 text-danger" />
                <DialogTitle className="text-base font-bold text-text-primary">Reject KYC</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-text-secondary">
                Applicant: <span className="text-text-primary font-semibold">{rejectCustomer.fullName}</span> (#{rejectCustomer.applicationId})
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Rejection Reason *
                </label>
                <Input
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Identity document mismatch or unreadable photograph"
                  className="bg-surface-elevated border-border text-text-primary text-xs h-9"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Admin Remark (Optional)
                </label>
                <Input
                  value={rejectAdminRemark}
                  onChange={(e) => setRejectAdminRemark(e.target.value)}
                  placeholder="Internal underwriting notes"
                  className="bg-surface-elevated border-border text-text-primary text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="flex space-x-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectCustomer(null)}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmittingAction || !rejectionReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-text-primary font-bold text-xs h-9 px-4 disabled:opacity-50"
              >
                {isSubmittingAction ? 'Rejecting...' : 'Reject KYC'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* REQUEST CORRECTION MODAL                                                 */}
      {/* ========================================================================= */}
      {correctionCustomer && (
        <Dialog open={!!correctionCustomer} onOpenChange={(open) => !open && setCorrectionCustomer(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-md">
            <DialogHeader>
              <div className="flex items-center space-x-2">
                <RotateCw className="w-5 h-5 text-warning" />
                <DialogTitle className="text-base font-bold text-text-primary">Request KYC Correction</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-text-secondary">
                Request borrower to re-upload clear or updated documents.
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Correction Reason *
                </label>
                <textarea
                  rows={3}
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Aadhaar Back side is blurry. Please re-upload a clear scanned copy."
                  className="w-full bg-surface-elevated border border-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1">
                  Admin Remark (Optional)
                </label>
                <Input
                  value={correctionAdminRemark}
                  onChange={(e) => setCorrectionAdminRemark(e.target.value)}
                  placeholder="Internal audit notes"
                  className="bg-surface-elevated border-border text-text-primary text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="flex space-x-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCorrectionCustomer(null)}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmCorrection}
                disabled={isSubmittingAction || !correctionReason.trim()}
                className="bg-warning text-background hover:brightness-110 text-text-primary font-bold text-xs h-9 px-4 disabled:opacity-50"
              >
                {isSubmittingAction ? 'Sending Request...' : 'Request Correction'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* DOCUMENT-LEVEL REVIEW MODAL                                              */}
      {/* ========================================================================= */}
      {activeDocAction && (
        <Dialog open={!!activeDocAction} onOpenChange={(open) => !open && setActiveDocAction(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-text-primary">
                {activeDocAction.action === 'APPROVE'
                  ? 'Approve Document'
                  : activeDocAction.action === 'REJECT'
                  ? 'Reject Document'
                  : 'Request Document Re-upload'}
              </DialogTitle>
              <DialogDescription className="text-xs text-text-secondary">
                {activeDocAction.doc.documentType.replace(/_/g, ' ')} ({activeDocAction.doc.fileName})
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              {activeDocAction.action === 'APPROVE' ? (
                <p className="text-xs text-text-secondary">
                  Confirm that this document has been verified against KYC compliance standards.
                </p>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1">
                    Reason for {activeDocAction.action === 'REJECT' ? 'Rejection' : 'Re-upload'} *
                  </label>
                  <textarea
                    rows={3}
                    value={docActionReason}
                    onChange={(e) => setDocActionReason(e.target.value)}
                    placeholder="e.g. Document edges are cropped or text is illegible."
                    className="w-full bg-surface-elevated border border-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              )}
            </div>

            <DialogFooter className="flex space-x-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveDocAction(null)}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDocAction}
                disabled={
                  isSubmittingAction ||
                  ((activeDocAction.action === 'REJECT' || activeDocAction.action === 'REQUEST_REUPLOAD') &&
                    !docActionReason.trim())
                }
                className={`text-xs h-9 px-4 font-bold ${
                  activeDocAction.action === 'APPROVE'
                    ? 'bg-success hover:bg-[#1eb398] text-[#07111F]'
                    : activeDocAction.action === 'REJECT'
                    ? 'bg-red-600 hover:bg-red-700 text-text-primary'
                    : 'bg-warning text-background hover:brightness-110 text-text-primary'
                }`}
              >
                {isSubmittingAction ? 'Submitting...' : 'Confirm Action'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* QUICK DOCUMENT VIEWER MODAL                                              */}
      {/* ========================================================================= */}
      {viewDocsCustomer && (
        <Dialog open={!!viewDocsCustomer} onOpenChange={(open) => !open && setViewDocsCustomer(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-success" />
                  <span>Documents: {viewDocsCustomer.fullName}</span>
                </DialogTitle>
                {getStatusBadge(viewDocsCustomer.kycStatus)}
              </div>
              <DialogDescription className="text-xs text-text-secondary">
                Uploaded compliance and identity files ({viewDocsCustomer.documents.length} files)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {viewDocsCustomer.documents.length === 0 ? (
                <p className="text-center py-6 text-xs text-text-secondary">No documents uploaded.</p>
              ) : (
                viewDocsCustomer.documents.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 bg-surface-elevated rounded-xl border border-border flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-text-primary">{d.documentType.replace(/_/g, ' ')}</span>
                        {getStatusBadge(d.status)}
                      </div>
                      <span className="text-[11px] text-text-secondary block mt-0.5">{d.fileName}</span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDocumentFile(d.id, d.fileName)}
                      className="h-7 px-2.5 text-xs bg-surface border-border text-text-primary hover:border-focus"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1 text-primary" />
                      Preview
                    </Button>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setViewDocsCustomer(null)}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {/* ========================================================================= */}
      {/* DELETE CUSTOMER CONFIRMATION MODAL                                        */}
      {/* ========================================================================= */}
      {deleteCustomer && (
        <Dialog open={!!deleteCustomer} onOpenChange={(open) => !open && setDeleteCustomer(null)}>
          <DialogContent className="bg-surface border-border text-text-primary max-w-md">
            <DialogHeader>
              <div className="flex items-center space-x-2">
                <Trash2 className="w-5 h-5 text-warning" />
                <DialogTitle className="text-base font-bold text-text-primary">Remove KYC Submission?</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-text-secondary">
                This will remove only the KYC submission from the verification queue.
                The customer account and all other data will remain intact.
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-surface-elevated rounded-xl border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer:</span>
                  <span className="font-bold text-text-primary">{deleteCustomer.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Mobile:</span>
                  <span className="font-mono text-text-primary">+91 {deleteCustomer.mobile}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">KYC Status:</span>
                  <span className="font-mono text-text-primary">{deleteCustomer.kycStatus}</span>
                </div>
              </div>

              {/* What WILL be removed */}
              <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-800/40 text-red-300 text-xs space-y-1">
                <div className="font-semibold text-red-200 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> What will be removed:
                </div>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>KYC identity documents (Aadhaar, PAN)</li>
                  <li>KYC verification status (reset to Pending)</li>
                </ul>
              </div>

              {/* What will NOT be affected */}
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs space-y-1">
                <div className="font-semibold text-emerald-200 flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> What will NOT be affected:
                </div>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Customer account &amp; login</li>
                  <li>Loan application(s)</li>
                  <li>Charges &amp; payments</li>
                  <li>Invoices &amp; agreements</li>
                  <li>Non-KYC documents</li>
                </ul>
              </div>

              <p className="text-text-secondary text-xs text-center pt-1">
                After removal, the customer will be notified to re-submit KYC documents.
              </p>
            </div>

            <DialogFooter className="flex space-x-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDeleteCustomer(null); setActionError(null); }}
                className="bg-surface-elevated border-border text-text-secondary text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeletingCustomer}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-4 disabled:opacity-50"
              >
                {isDeletingCustomer ? 'Removing KYC...' : 'Remove KYC Submission'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
        title={pdfTitle || 'Document Viewer'}
        downloadFilename={pdfDownloadName || 'document.pdf'}
        onRetry={pdfViewer.retry}
      />
    </div>
  );
};

export default AdminKycList;

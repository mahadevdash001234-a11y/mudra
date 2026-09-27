import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  FileCheck,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
  CreditCard,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';

export type UtrStatus = 'NOT SUBMITTED' | 'SUBMITTED' | 'VERIFIED';
export type PaymentApprovalStatus = 'PENDING' | 'UNDER_VERIFICATION' | 'PAID' | 'REJECTED';

export interface ChargeApprovalItem {
  id: string;
  chargeId: string;
  paymentId?: string;
  customerName: string;
  customerMobile: string;
  customerEmail?: string;
  customerId: string;
  applicationId: string;
  loanId?: string;
  chargeName: string;
  amount: number;
  paymentStatus: PaymentApprovalStatus;
  utrStatus: UtrStatus;
  utr: string | null;
  submittedAt: string | null;
  verificationStatus: 'Pending' | 'Verified' | 'Not Submitted' | 'Rejected';
  isInvoiceAvailable: boolean;
  notes?: string;
  rejectionReason?: string;
  receiptNumber?: string;
}

export const AdminChargesApprovalPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Tab & search filters
  const [activeTab, setActiveTab] = useState<
    'ALL' | 'PENDING_VERIFICATION' | 'UTR_SUBMITTED' | 'UTR_NOT_SUBMITTED' | 'PAID' | 'REJECTED'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Review Drawer / Modal
  const [selectedItem, setSelectedItem] = useState<ChargeApprovalItem | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  // Invoice PDF Viewer via react-pdf canvas renderer
  const invoicePdfViewer = usePdfViewer();
  const [selectedInvoiceTitle, setSelectedInvoiceTitle] = useState<string>('');
  const [selectedInvoiceFilename, setSelectedInvoiceFilename] = useState<string>('invoice.pdf');

  const handleViewInvoice = async (chargeId: string, chargeName?: string) => {
    try {
      setSelectedInvoiceTitle(`Tax Invoice — ${chargeName || 'Charge'}`);
      setSelectedInvoiceFilename(`Invoice_${chargeName || 'Charge'}_${chargeId.slice(-6)}.pdf`);
      await invoicePdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeId, false));
    } catch {
      setActionError(`Failed to stream invoice for ${chargeName || 'Charge'}.`);
    }
  };

  const handleDownloadInvoice = async (chargeId: string, chargeName?: string) => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeId, true), {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${chargeName || 'Charge'}_${chargeId.slice(-6)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      setActionError(`Failed to download invoice for ${chargeName || 'Charge'}.`);
    }
  };

  // Fetch payments list from backend
  const {
    data: paymentsData,
    isLoading: isLoadingPayments,
    refetch: refetchPayments,
    isFetching: isFetchingPayments,
  } = useQuery({
    queryKey: ['adminChargesApprovalPayments'],
    queryFn: async () => {
      const res = await adminService.getAllPayments({ limit: 100 });
      return res?.data || [];
    },
    refetchInterval: 3000,
  });

  // Fetch fee records from backend
  const { data: feeRecordsData, refetch: refetchFeeRecords } = useQuery({
    queryKey: ['adminChargesApprovalFeeRecords'],
    queryFn: async () => {
      try {
        const res: any = await apiClient.get('/admin/charges/records');
        return res?.data?.data || res?.data || [];
      } catch {
        return [];
      }
    },
  });

  // Assemble and normalize into unified approval items
  const approvalItems: ChargeApprovalItem[] = useMemo(() => {
    const itemsMap = new Map<string, ChargeApprovalItem>();

    // 1. Process payment records
    const rawPayments: any[] = Array.isArray(paymentsData) ? paymentsData : [];
    rawPayments.forEach((p) => {
      const isPaid = p.status === 'PAID' || p.status === 'SUCCESS';
      const isRejected = p.status === 'REJECTED' || p.status === 'FAILED';

      let extractedChargeId = p.chargeId || '';
      let chargeTitle = p.chargeType || 'Specific Charge';

      if (p.notes && p.notes.includes('Specific Charge:')) {
        const afterPrefix = p.notes.split('Specific Charge:')[1];
        if (afterPrefix.includes('(') && afterPrefix.includes(')')) {
          chargeTitle = afterPrefix.split('(')[0].trim() || chargeTitle;
          const match = afterPrefix.match(/\(([^)]+)\)/);
          if (match && match[1]) {
            extractedChargeId = match[1].trim();
          }
        }
      }

      const hasUtr = Boolean(p.utr && p.utr.trim().length > 0 && p.utr !== '—' && !p.utr.startsWith('UPI-'));
      const rawUtr = hasUtr ? p.utr.trim() : null;

      let utrStatus: UtrStatus = 'NOT SUBMITTED';
      if (isPaid) {
        utrStatus = 'VERIFIED';
      } else if (hasUtr) {
        utrStatus = 'SUBMITTED';
      }

      let verificationStatus: 'Pending' | 'Verified' | 'Not Submitted' | 'Rejected' = 'Pending';
      if (isPaid) verificationStatus = 'Verified';
      else if (isRejected) verificationStatus = 'Rejected';
      else if (!hasUtr) verificationStatus = 'Not Submitted';

      const key = `p-${p.id}`;
      itemsMap.set(key, {
        id: p.id,
        chargeId: extractedChargeId || p.id,
        paymentId: p.id,
        customerName: p.customerName || 'Customer',
        customerMobile: p.mobile || '',
        customerEmail: p.email || '',
        customerId: p.customerId || '',
        applicationId: p.applicationNumber || 'N/A',
        loanId: p.loanId,
        chargeName: chargeTitle,
        amount: Number(p.amount) || 0,
        paymentStatus: isPaid ? 'PAID' : isRejected ? 'REJECTED' : 'UNDER_VERIFICATION',
        utrStatus,
        utr: rawUtr,
        submittedAt: p.submittedAt || null,
        verificationStatus,
        isInvoiceAvailable: isPaid,
        notes: p.notes,
        rejectionReason: p.rejectionReason,
        receiptNumber: p.receiptNumber,
      });
    });

    // 2. Process fee records
    const rawFeeRecords: any[] = Array.isArray(feeRecordsData) ? feeRecordsData : [];
    rawFeeRecords.forEach((f) => {
      const isPaid = f.paymentStatus === 'PAID';
      const isFailed = f.paymentStatus === 'FAILED';
      const hasUtr = Boolean(f.transactionRef && f.transactionRef.trim().length > 0 && f.transactionRef !== '—');

      let utrStatus: UtrStatus = 'NOT SUBMITTED';
      if (isPaid) utrStatus = 'VERIFIED';
      else if (hasUtr) utrStatus = 'SUBMITTED';

      const key = `fee-${f.id}`;
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          id: f.id,
          chargeId: f.id,
          paymentId: f.id,
          customerName: f.customerName || 'Customer',
          customerMobile: f.customerMobile || '',
          customerEmail: f.customerEmail || '',
          customerId: f.customerId || '',
          applicationId: f.applicationId || 'N/A',
          loanId: f.loanId,
          chargeName: f.chargeType || 'Fee Record',
          amount: Number(f.amount) || 0,
          paymentStatus: isPaid ? 'PAID' : isFailed ? 'REJECTED' : 'PENDING',
          utrStatus,
          utr: hasUtr ? f.transactionRef : null,
          submittedAt: f.paymentDate || f.createdAt || null,
          verificationStatus: isPaid ? 'Verified' : isFailed ? 'Rejected' : hasUtr ? 'Pending' : 'Not Submitted',
          isInvoiceAvailable: isPaid,
          receiptNumber: f.receiptNumber,
        });
      }
    });

    return Array.from(itemsMap.values());
  }, [paymentsData, feeRecordsData]);

  // Real backend summary counts
  const summaryCounts = useMemo(() => {
    let total = approvalItems.length;
    let pendingVerification = 0;
    let notSubmitted = 0;
    let paid = 0;
    let rejected = 0;

    approvalItems.forEach((item) => {
      if (item.paymentStatus === 'PAID' || item.utrStatus === 'VERIFIED') {
        paid++;
      } else if (item.paymentStatus === 'REJECTED') {
        rejected++;
      } else if (item.utrStatus === 'SUBMITTED' || item.paymentStatus === 'UNDER_VERIFICATION') {
        pendingVerification++;
      } else {
        notSubmitted++;
      }
    });

    return { total, pendingVerification, notSubmitted, paid, rejected };
  }, [approvalItems]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return approvalItems.filter((item) => {
      // Tab filter
      if (activeTab === 'PENDING_VERIFICATION') {
        if (item.paymentStatus !== 'UNDER_VERIFICATION' && item.utrStatus !== 'SUBMITTED') return false;
      } else if (activeTab === 'UTR_SUBMITTED') {
        if (item.utrStatus !== 'SUBMITTED' && item.utrStatus !== 'VERIFIED') return false;
      } else if (activeTab === 'UTR_NOT_SUBMITTED') {
        if (item.utrStatus !== 'NOT SUBMITTED') return false;
      } else if (activeTab === 'PAID') {
        if (item.paymentStatus !== 'PAID' && item.utrStatus !== 'VERIFIED') return false;
      } else if (activeTab === 'REJECTED') {
        if (item.paymentStatus !== 'REJECTED') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.customerName.toLowerCase().includes(query);
        const matchesMobile = item.customerMobile.includes(query);
        const matchesAppId = item.applicationId.toLowerCase().includes(query);
        const matchesCharge = item.chargeName.toLowerCase().includes(query);
        const matchesUtr = item.utr ? item.utr.toLowerCase().includes(query) : false;
        return matchesName || matchesMobile || matchesAppId || matchesCharge || matchesUtr;
      }

      return true;
    });
  }, [approvalItems, activeTab, searchQuery]);

  // Verification Mutation using existing backend endpoint: /admin/charges/specific/:id/verify-payment
  const verifyMutation = useMutation({
    mutationFn: async (item: ChargeApprovalItem) => {
      if (item.chargeId && item.chargeId !== item.paymentId) {
        try {
          const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT(item.chargeId), {});
          return res.data;
        } catch {
          // Fallback to standalone payment verification if specific charge endpoint returns error
        }
      }
      if (item.paymentId) {
        return adminService.verifyPayment(item.paymentId, 'Verified via Charges & Fee Approval page');
      }
      throw new Error('No charge or payment ID found for verification.');
    },
    onSuccess: () => {
      setActionSuccess('Payment verified successfully! Status is now PAID and charge-specific invoice is available.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['adminChargesApprovalPayments'] });
      queryClient.invalidateQueries({ queryKey: ['adminChargesApprovalFeeRecords'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['customerChargesList'] });
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
      setTimeout(() => {
        setIsReviewOpen(false);
        setSelectedItem(null);
        setActionSuccess(null);
      }, 1500);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Verification failed. Please ensure UTR is submitted.';
      setActionError(msg);
    },
  });

  // Rejection Mutation using existing backend endpoint: /admin/payments/:id/reject
  const rejectMutation = useMutation({
    mutationFn: async ({ item, reason }: { item: ChargeApprovalItem; reason: string }) => {
      if (!item.paymentId) {
        throw new Error('Payment reference ID not found for rejection.');
      }
      return adminService.rejectPayment(item.paymentId, reason);
    },
    onSuccess: () => {
      setActionSuccess('Payment rejected. Customer has been notified.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['adminChargesApprovalPayments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      setTimeout(() => {
        setIsReviewOpen(false);
        setSelectedItem(null);
        setActionSuccess(null);
        setShowRejectForm(false);
        setRejectReason('');
      }, 1500);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to reject payment.';
      setActionError(msg);
    },
  });

  const handleOpenReview = (item: ChargeApprovalItem) => {
    setSelectedItem(item);
    setActionError(null);
    setActionSuccess(null);
    setShowRejectForm(false);
    setRejectReason('');
    setIsReviewOpen(true);
  };

  const handleRefresh = () => {
    refetchPayments();
    refetchFeeRecords();
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-text-muted">
        <Link to="/admin/dashboard" className="hover:text-text-primary transition-colors">
          Dashboard
        </Link>
        <span>›</span>
        <span>Payments</span>
        <span>›</span>
        <span className="text-text-primary font-semibold">Charges & Fee Approval</span>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D7E3F5] pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-[#07152F] tracking-tight flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#EFF6FF] border border-[#D7E3F5] text-[#155EEF]">
              <FileCheck className="w-5 h-5" />
            </span>
            <span>CHARGES & FEE APPROVAL</span>
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-medium">
            Review customer charge payments, UTR submissions and payment verification status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetchingPayments}
            className="bg-white border-[#D7E3F5] text-[#0B1220] hover:bg-[#F4F8FF] hover:border-[#155EEF]/50 text-xs h-9 font-semibold shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetchingPayments ? 'animate-spin text-[#155EEF]' : 'text-[#155EEF]'}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <Card className="p-4 bg-white border-[#D7E3F5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Total Payments</span>
            <CreditCard className="w-4 h-4 text-[#155EEF]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#07152F]">{summaryCounts.total}</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">All customer charges</div>
        </Card>

        <Card className="p-4 bg-white border-[#D7E3F5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pending Review</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-amber-600">{summaryCounts.pendingVerification}</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">UTR Submitted / Review needed</div>
        </Card>

        <Card className="p-4 bg-white border-[#D7E3F5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">UTR Not Submitted</span>
            <AlertTriangle className="w-4 h-4 text-[#94A3B8]" />
          </div>
          <div className="mt-2 text-2xl font-black text-[#64748B]">{summaryCounts.notSubmitted}</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Awaiting customer payment</div>
        </Card>

        <Card className="p-4 bg-white border-[#D7E3F5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Paid / Verified</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">{summaryCounts.paid}</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Invoices generated</div>
        </Card>

        <Card className="p-4 bg-white border-[#D7E3F5] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Rejected</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-black text-rose-600">{summaryCounts.rejected}</div>
          <div className="text-[10px] text-[#94A3B8] mt-0.5">Invalid/declined UTR</div>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-[#D7E3F5] shadow-xs">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'All', count: summaryCounts.total },
            { id: 'PENDING_VERIFICATION', label: 'Pending Verification', count: summaryCounts.pendingVerification },
            { id: 'UTR_SUBMITTED', label: 'UTR Submitted', count: summaryCounts.pendingVerification },
            { id: 'UTR_NOT_SUBMITTED', label: 'UTR Not Submitted', count: summaryCounts.notSubmitted },
            { id: 'PAID', label: 'Paid', count: summaryCounts.paid },
            { id: 'REJECTED', label: 'Rejected', count: summaryCounts.rejected },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-[#155EEF] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#0B1220] hover:bg-[#F4F8FF]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-[#E8F1FF] text-[#155EEF]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <Input
            type="text"
            placeholder="Filter by customer, charge, UTR..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs bg-[#F4F8FF] border-[#D7E3F5] text-[#0B1220] placeholder-[#64748B] h-9 focus:border-[#155EEF] focus:bg-white"
          />
        </div>
      </div>

      {/* Payments Table */}
      <Card className="bg-white border-[#D7E3F5] shadow-xs rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#D7E3F5] bg-[#F4F8FF] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Charge</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">UTR Status</th>
                <th className="py-3 px-4">UTR Reference</th>
                <th className="py-3 px-4">Submitted At</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D7E3F5] text-xs">
              {isLoadingPayments && approvalItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#64748B]">
                    <div className="inline-flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#155EEF]" />
                      <span>Loading charge approval records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#64748B] font-medium">
                    No charge records found matching the active filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isPaid = item.paymentStatus === 'PAID' || item.utrStatus === 'VERIFIED';
                  const isPending = item.utrStatus === 'SUBMITTED' || item.paymentStatus === 'UNDER_VERIFICATION';
                  const isRejected = item.paymentStatus === 'REJECTED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[#F8FAFF] transition-colors group text-[#0B1220]"
                    >
                      {/* Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#0B1220] group-hover:text-[#155EEF] transition-colors">
                          {item.customerName}
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-1.5 font-medium">
                          <span>{item.customerMobile}</span>
                          {item.applicationId !== 'N/A' && (
                            <>
                              <span>•</span>
                              <span className="font-mono text-[10px] text-[#475569]">{item.applicationId}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Charge */}
                      <td className="py-3.5 px-4 font-bold text-[#07152F]">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{item.chargeName}</span>
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 font-mono font-bold text-[#07152F]">
                        ₹{item.amount.toLocaleString('en-IN')}
                      </td>

                      {/* Payment Status */}
                      <td className="py-3.5 px-4">
                        {isPaid ? (
                          <Badge variant="paid">PAID</Badge>
                        ) : isRejected ? (
                          <Badge variant="destructive">REJECTED</Badge>
                        ) : isPending ? (
                          <Badge variant="pending">PENDING VERIFICATION</Badge>
                        ) : (
                          <Badge variant="neutral">PAYMENT REQUIRED</Badge>
                        )}
                      </td>

                      {/* UTR Status */}
                      <td className="py-3.5 px-4">
                        {item.utrStatus === 'VERIFIED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            VERIFIED
                          </span>
                        ) : item.utrStatus === 'SUBMITTED' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            SUBMITTED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            NOT SUBMITTED
                          </span>
                        )}
                      </td>

                      {/* Actual UTR */}
                      <td className="py-3.5 px-4">
                        {item.utr ? (
                          <span className="font-mono text-xs font-bold text-[#0B1220] bg-[#F4F8FF] px-2 py-0.5 rounded border border-[#D7E3F5]">
                            {item.utr}
                          </span>
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td className="py-3.5 px-4 text-[#64748B] text-[11px] font-medium">
                        {item.submittedAt ? (
                          new Date(item.submittedAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          <span className="text-[#94A3B8]">—</span>
                        )}
                      </td>

                      {/* Verification Status */}
                      <td className="py-3.5 px-4">
                        {item.verificationStatus === 'Verified' ? (
                          <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : item.verificationStatus === 'Rejected' ? (
                          <span className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Rejected
                          </span>
                        ) : item.verificationStatus === 'Pending' ? (
                          <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Pending
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-[#64748B]">
                            Awaiting UTR
                          </span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant={isPending ? 'review' : 'outline'}
                          onClick={() => handleOpenReview(item)}
                          className={`text-xs h-8 px-3 font-bold ${
                            !isPending ? 'border-[#D7E3F5] text-[#0B1220] hover:bg-[#F4F8FF] bg-white' : ''
                          }`}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Review Payment Modal / Detail Panel */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="max-w-xl bg-white border-[#D7E3F5] text-[#0B1220] p-6 shadow-2xl rounded-3xl">
          <DialogHeader className="border-b border-[#D7E3F5] pb-4">
            <DialogTitle className="text-lg font-extrabold text-[#07152F] flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-[#EFF6FF] border border-[#D7E3F5] text-[#155EEF]">
                <FileCheck className="w-4 h-4" />
              </span>
              <span>Review Customer Charge Payment</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B] mt-1 font-medium">
              Verify customer-submitted transaction reference (UTR) for this specific charge.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-3">
              {/* Feedback messages */}
              {actionError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* Charge & Amount Box */}
              <div className="p-4 rounded-2xl bg-[#F4F8FF] border border-[#D7E3F5] flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Charge Name</div>
                  <div className="text-base font-extrabold text-[#07152F] mt-0.5">{selectedItem.chargeName}</div>
                  <div className="text-[10px] text-[#64748B] mt-0.5 font-mono">ID: {selectedItem.chargeId}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">Amount Due</div>
                  <div className="text-xl font-black text-[#155EEF] font-mono mt-0.5">
                    ₹{selectedItem.amount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {/* Customer Information Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[#F8FAFF] border border-[#D7E3F5]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Customer Name</div>
                  <div className="font-extrabold text-[#0B1220] mt-0.5">{selectedItem.customerName}</div>
                  <div className="text-[11px] text-[#475569] mt-0.5 font-medium">{selectedItem.customerMobile}</div>
                  {selectedItem.customerEmail && (
                    <div className="text-[11px] text-[#64748B] truncate mt-0.5">{selectedItem.customerEmail}</div>
                  )}
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F8FAFF] border border-[#D7E3F5]">
                  <div className="text-[10px] font-bold uppercase text-[#64748B]">Loan / Application ID</div>
                  <div className="font-mono font-bold text-[#07152F] mt-0.5">{selectedItem.applicationId}</div>
                  <div className="text-[10px] text-[#64748B] mt-1 font-semibold">Payment Status:</div>
                  <div className="mt-0.5">
                    {selectedItem.paymentStatus === 'PAID' ? (
                      <Badge variant="paid">PAID</Badge>
                    ) : selectedItem.paymentStatus === 'REJECTED' ? (
                      <Badge variant="destructive">REJECTED</Badge>
                    ) : (
                      <Badge variant="pending">PENDING</Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* UTR Submission Box */}
              <div className="p-4 rounded-2xl bg-[#F8FAFF] border border-[#D7E3F5]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    UTR / Transaction Reference
                  </span>
                  <span
                    className={`text-[11px] font-bold ${
                      selectedItem.utrStatus === 'VERIFIED'
                        ? 'text-emerald-700'
                        : selectedItem.utrStatus === 'SUBMITTED'
                        ? 'text-amber-700'
                        : 'text-[#64748B]'
                    }`}
                  >
                    UTR Status: {selectedItem.utrStatus}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <div className="font-mono text-base font-black tracking-wide text-[#07152F]">
                    {selectedItem.utr || '— NOT SUBMITTED —'}
                  </div>
                  {selectedItem.submittedAt && (
                    <div className="text-[10px] text-[#64748B]">
                      Submitted: {new Date(selectedItem.submittedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                {/* Rule 11 Inspection Notice */}
                {!selectedItem.utr && (
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-2 font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>
                      Customer has not submitted UTR for this charge yet. Verification is disabled until a banking reference is submitted.
                    </span>
                  </div>
                )}
              </div>

              {/* Rejection Input Box (when triggered) */}
              {showRejectForm && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                  <label className="text-xs font-bold text-rose-800">Reason for Rejection</label>
                  <Input
                    type="text"
                    placeholder="e.g. UTR not found in bank statement, invalid amount..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="text-xs bg-white border-rose-300 text-[#0B1220] h-9"
                  />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowRejectForm(false)}
                      className="text-xs h-8 border-[#D7E3F5]"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="reject"
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate({ item: selectedItem, reason: rejectReason.trim() })}
                      className="text-xs h-8"
                    >
                      {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Invoice section for verified/paid charge */}
              {selectedItem.paymentStatus === 'PAID' && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <div className="text-xs font-bold text-emerald-800">Verified & Paid</div>
                      <div className="text-[10px] text-[#64748B]">
                        Official invoice generated for {selectedItem.chargeName}.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewInvoice(selectedItem.chargeId, selectedItem.chargeName)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#F4F8FF] border border-emerald-300 text-emerald-700 text-xs font-bold transition-colors shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Invoice
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDownloadInvoice(selectedItem.chargeId, selectedItem.chargeName)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="border-t border-[#D7E3F5] pt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setIsReviewOpen(false)}
              className="text-xs w-full sm:w-auto border-[#D7E3F5] text-[#64748B] hover:text-[#0B1220]"
            >
              Close
            </Button>

            {selectedItem && selectedItem.paymentStatus !== 'PAID' && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {/* Rejection button */}
                {!showRejectForm && selectedItem.paymentId && (
                  <Button
                    variant="reject"
                    size="sm"
                    onClick={() => setShowRejectForm(true)}
                    className="text-xs h-9 px-3.5 font-bold"
                  >
                    Reject Payment
                  </Button>
                )}

                {/* Verify button: STRICT RULE 11 GATING (disabled if UTR is NOT submitted) */}
                <Button
                  variant="approve"
                  size="sm"
                  disabled={!selectedItem.utr || verifyMutation.isPending}
                  onClick={() => verifyMutation.mutate(selectedItem)}
                  className="text-xs h-9 px-4 font-bold"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  {verifyMutation.isPending ? 'Verifying...' : 'Verify Payment'}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice PDF Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={invoicePdfViewer.open}
        onClose={invoicePdfViewer.closeModal}
        blob={invoicePdfViewer.blob}
        blobUrl={invoicePdfViewer.blobUrl}
        pdfBytes={invoicePdfViewer.pdfBytes}
        loading={invoicePdfViewer.loading}
        fetchError={invoicePdfViewer.error}
        title={selectedInvoiceTitle || 'Tax Invoice'}
        description="Charge payment receipt & tax invoice"
        downloadFilename={selectedInvoiceFilename || 'invoice.pdf'}
        onRetry={invoicePdfViewer.retry}
      />
    </div>
  );
};
export default AdminChargesApprovalPage;

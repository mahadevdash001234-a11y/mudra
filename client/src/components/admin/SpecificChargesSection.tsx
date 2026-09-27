import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
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
import {
  Plus,
  Eye,
  Edit3,
  XCircle,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Loader2,
  IndianRupee,
  RotateCcw,
  Send,
  Check,
} from 'lucide-react';

export const SPECIFIC_CHARGE_TYPES = [
  'Processing Fee',
  'GST',
  'Stamp Duty',
  'TSD/TDS Charges',
  'Insurance Fee',
  'Late Payment Fee',
  'Payment Fee',
  'Loan Document Upload Fee',
];

export const SPECIFIC_CHARGE_CONFIG = [
  { name: 'Processing Fee', defaultAmount: 5000, description: 'Underwriting and loan file processing fee' },
  { name: 'GST', defaultAmount: 900, description: 'Applicable Goods and Services Tax (18%)' },
  { name: 'Stamp Duty', defaultAmount: 1250, description: 'State statutory stamp duty and e-stamping' },
  { name: 'TSD/TDS Charges', defaultAmount: 500, description: 'Tax deducted at source & statutory handling' },
  { name: 'Insurance Fee', defaultAmount: 1000, description: 'Loan credit shield and insurance cover' },
  { name: 'Late Payment Fee', defaultAmount: 250, description: 'Statutory late payment settlement charge' },
  { name: 'Payment Fee', defaultAmount: 50, description: 'Payment gateway and settlement handling fee' },
  { name: 'Loan Document Upload Fee', defaultAmount: 500, description: 'Optional loan document verification and handling charge (disabled by default)' },
];

export interface SpecificChargeRecord {
  id: string;
  name: string;
  amount: number;
  type: string;
  isMandatory: boolean;
  isActive: boolean;
  taxPercent: number;
  customerId: string;
  loanId: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  remark?: string | null;
  dueDate?: string | null;
  createdBy?: string | null;
  paidAt?: string | null;
  sentAt?: string | null;
  transactionRef?: string | null;
  paymentId?: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: {
    id: string;
    fullName: string;
    mobile: string;
    email: string;
  };
  loan?: {
    id: string;
    applicationNumber: string;
    accountNumber?: string | null;
  };
}

export interface LoanApplicationOption {
  id: string;
  applicationNumber: string;
  requestedAmount?: number;
  approvedAmount?: number;
  status: string;
}

interface SpecificChargesSectionProps {
  customerId: string;
  customerName: string;
  applicationId?: string;
  loanId?: string;
  loans?: LoanApplicationOption[];
}

export const SpecificChargesSection: React.FC<SpecificChargesSectionProps> = ({
  customerId,
  customerName,
  applicationId,
  loanId,
  loans,
}) => {
  const queryClient = useQueryClient();

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendAllModalOpen, setSendAllModalOpen] = useState(false);
  const invoicePdfViewer = usePdfViewer();

  // Selected charge for actions
  const [selectedCharge, setSelectedCharge] = useState<SpecificChargeRecord | null>(null);

  // Customer 360 Loans query (fallback when loans prop is empty or not passed)
  const { data: customer360Data } = useQuery({
    queryKey: ['adminCustomerLoansForCharges', customerId],
    queryFn: async () => {
      if (!customerId) return null;
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMERS.DETAIL(customerId));
        return res.data;
      } catch {
        return null;
      }
    },
    enabled: Boolean(customerId && (!loans || loans.length === 0)),
  });

  const effectiveLoans: LoanApplicationOption[] =
    loans && loans.length > 0
      ? loans
      : (customer360Data?.loans || []);

  // Selected loan for modal
  const [selectedLoanId, setSelectedLoanId] = useState<string>(loanId || '');

  // Synchronize selectedLoanId with effectiveLoans
  useEffect(() => {
    if (loanId && effectiveLoans.some((l) => l.id === loanId)) {
      setSelectedLoanId(loanId);
    } else if (effectiveLoans.length > 0 && (!selectedLoanId || !effectiveLoans.some((l) => l.id === selectedLoanId))) {
      setSelectedLoanId(effectiveLoans[0].id);
    }
  }, [loanId, effectiveLoans, selectedLoanId]);

  const currentSelectedLoan =
    effectiveLoans.find((l) => l.id === selectedLoanId) ||
    effectiveLoans[0] ||
    null;

  // Add Charge Form State
  const [newChargeType, setNewChargeType] = useState<string>('Processing Fee');
  const [newAmount, setNewAmount] = useState<string>('');
  const [newRemark, setNewRemark] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<string>('');
  const [forceDuplicateConfirm, setForceDuplicateConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Charge Form State
  const [editAmount, setEditAmount] = useState<string>('');
  const [editRemark, setEditRemark] = useState<string>('');
  const [editDueDate, setEditDueDate] = useState<string>('');

  // Status feedback
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Query specific charges for this customer / application
  const effectiveAppRef = currentSelectedLoan?.applicationNumber || applicationId;
  const {
    data: charges = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<SpecificChargeRecord[]>({
    queryKey: ['adminSpecificCharges', customerId, effectiveAppRef],
    queryFn: async () => {
      let res;
      if (customerId) {
        res = await apiClient.get(API_ENDPOINTS.CHARGES.SPECIFIC.BY_CUSTOMER(customerId));
      } else if (effectiveAppRef) {
        res = await apiClient.get(API_ENDPOINTS.CHARGES.SPECIFIC.BY_APPLICATION(effectiveAppRef));
      }
      return res?.data?.data || res?.data || [];
    },
    enabled: Boolean(customerId || effectiveAppRef),
    refetchInterval: 1500,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['adminSpecificCharges'] });
    queryClient.invalidateQueries({ queryKey: ['adminLoanDetail'] });
    queryClient.invalidateQueries({ queryKey: ['admin-customer-detail'] });
    queryClient.invalidateQueries({ queryKey: ['customerChargesList'] });
  };

  // Check duplicate for add form
  const duplicateCharge = charges.find(
    (c) => c.name.toLowerCase() === newChargeType.toLowerCase() && (c.status === 'PENDING' || c.status === 'PAID')
  );

  const pendingCharges = charges.filter((c) => c.status === 'PENDING');
  const totalPending = pendingCharges.reduce((acc, c) => acc + c.amount, 0);
  const totalPaid = charges.filter((c) => c.status === 'PAID').reduce((acc, c) => acc + c.amount, 0);
  const totalLevied = charges.reduce((acc, c) => acc + (c.status !== 'CANCELLED' ? c.amount : 0), 0);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);
      if (!currentSelectedLoan && effectiveLoans.length === 0) {
        throw new Error('No active loan application found for this customer.');
      }
      const activeLoanId = currentSelectedLoan?.id || loanId;
      const activeAppRef = currentSelectedLoan?.applicationNumber || applicationId || activeLoanId;

      const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.CREATE, {
        customerId,
        applicationId: activeAppRef,
        loanId: activeLoanId,
        chargeType: newChargeType,
        amount: Number(newAmount),
        remark: newRemark || undefined,
        dueDate: newDueDate || undefined,
        forceDuplicate: forceDuplicateConfirm,
      });
      return res.data;
    },
    onSuccess: () => {
      setAddModalOpen(false);
      setNewAmount('');
      setNewRemark('');
      setNewDueDate('');
      setForceDuplicateConfirm(false);
      setActionSuccess(`Specific charge "${newChargeType}" created successfully.`);
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to create charge';
      setFormError(msg);
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.SEND(chargeId), {});
      return res.data;
    },
    onSuccess: (data: any) => {
      setSendModalOpen(false);
      setSelectedCharge(null);
      setActionSuccess(data?.message || 'Charge notice dispatched successfully to customer.');
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to send charge';
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const sendAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.SEND_ALL, {
        customerId,
        applicationId,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setSendAllModalOpen(false);
      setActionSuccess(data?.message || `Dispatched all pending charges to ${customerName}.`);
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to send all charges';
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCharge) return;
      const res = await apiClient.patch(API_ENDPOINTS.CHARGES.SPECIFIC.UPDATE(selectedCharge.id), {
        amount: Number(editAmount),
        remark: editRemark || '',
        dueDate: editDueDate || null,
      });
      return res.data;
    },
    onSuccess: () => {
      setEditModalOpen(false);
      setSelectedCharge(null);
      setActionSuccess('Specific charge updated successfully.');
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to update charge';
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCharge) return;
      const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.CANCEL(selectedCharge.id), {});
      return res.data;
    },
    onSuccess: () => {
      setCancelModalOpen(false);
      setSelectedCharge(null);
      setActionSuccess('Specific charge cancelled successfully.');
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to cancel charge';
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const verifyPaymentMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      const res = await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT(chargeId), {});
      return res.data;
    },
    onSuccess: () => {
      setActionSuccess('Payment verified successfully! Charge status updated to PAID and invoice generated.');
      setTimeout(() => setActionSuccess(null), 4000);
      invalidate();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to verify payment';
      setActionError(msg);
      setTimeout(() => setActionError(null), 5000);
    },
  });

  const handleOpenSend = (charge: SpecificChargeRecord) => {
    setSelectedCharge(charge);
    setSendModalOpen(true);
  };

  const handleOpenEdit = (charge: SpecificChargeRecord) => {
    setSelectedCharge(charge);
    setEditAmount(String(charge.amount));
    setEditRemark(charge.remark || '');
    setEditDueDate(charge.dueDate ? new Date(charge.dueDate).toISOString().split('T')[0] : '');
    setEditModalOpen(true);
  };

  const handleOpenView = (charge: SpecificChargeRecord) => {
    setSelectedCharge(charge);
    setViewModalOpen(true);
  };

  const handleOpenCancel = (charge: SpecificChargeRecord) => {
    setSelectedCharge(charge);
    setCancelModalOpen(true);
  };

  const handleViewInvoice = async (charge: SpecificChargeRecord) => {
    try {
      setSelectedCharge(charge);
      await invoicePdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(charge.id, false));
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Could not load invoice PDF.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const handleDownloadInvoice = async (charge: SpecificChargeRecord) => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(charge.id, true), {
        responseType: 'arraybuffer',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_CHG_${charge.name.replace(/\s+/g, '_')}_${charge.id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to download invoice.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 4000);
    }
  };

  const getStatusBadge = (status: SpecificChargeRecord['status']) => {
    switch (status) {
      case 'PAID':
        return (
          <Badge className="bg-success/20 text-success border border-success/30 text-[11px] font-semibold">
            <CheckCircle2 className="w-3 h-3 mr-1" /> PAID
          </Badge>
        );
      case 'PENDING':
        return (
          <Badge className="bg-warning/20 text-warning border border-warning/30 text-[11px] font-semibold">
            <Clock className="w-3 h-3 mr-1" /> PENDING
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge className="bg-slate-500/20 text-text-secondary border border-slate-500/30 text-[11px] font-semibold">
            <XCircle className="w-3 h-3 mr-1" /> CANCELLED
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge className="bg-danger/20 text-danger border border-danger/30 text-[11px] font-semibold">
            <AlertTriangle className="w-3 h-3 mr-1" /> FAILED
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Action alerts */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-xs flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-[#059669]" />
          <span className="font-medium">{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs flex items-center gap-2 shadow-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626]" />
          <span className="font-medium">{actionError}</span>
        </div>
      )}

      {/* Top Controls & Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-elevated border border-border rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text-primary tracking-wide">Customer Specific Charges</h2>
            <Badge variant="outline" className="text-[10px] text-text-secondary border-border bg-surface-elevated/60">
              Customer 360 Exclusive
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Individual charge records created and levied exclusively for {customerName}.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-border bg-surface-elevated/80 text-text-secondary hover:text-text-primary hover:bg-slate-700 text-xs h-9"
          >
            <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {/* Prominent Send All Charges Action */}
          <Button
            size="sm"
            onClick={() => setSendAllModalOpen(true)}
            disabled={pendingCharges.length === 0 || sendAllMutation.isPending}
            className="bg-primary hover:bg-[#5a52e0] text-text-primary text-xs font-semibold h-9 shadow-sm"
          >
            {sendAllMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 mr-1.5" />
            )}
            Send All Charges ({pendingCharges.length})
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setFormError(null);
              setNewAmount('');
              setNewRemark('');
              setNewDueDate('');
              setForceDuplicateConfirm(false);
              setAddModalOpen(true);
            }}
            className="bg-success hover:bg-[#1eb398] text-slate-950 text-xs font-bold h-9 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Charge
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards - Highlighting Total Pending & Pending Count */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-xl bg-surface-elevated border border-warning/30">
          <span className="text-[11px] text-warning block font-medium">Total Pending Charges</span>
          <p className="text-xl font-bold text-text-primary mt-0.5 font-mono">₹{totalPending.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-text-secondary font-mono mt-0.5 block">Awaiting customer payment</span>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-elevated border border-border">
          <span className="text-[11px] text-text-secondary block font-medium">Number of Pending Charges</span>
          <p className="text-xl font-bold text-warning mt-0.5 font-mono">{pendingCharges.length}</p>
          <span className="text-[10px] text-text-secondary mt-0.5 block">Active unpaid fee items</span>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-elevated border border-success/30">
          <span className="text-[11px] text-success block font-medium">Total Verified & Paid</span>
          <p className="text-xl font-bold text-success mt-0.5 font-mono">₹{totalPaid.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-text-secondary font-mono mt-0.5 block">Invoices generated</span>
        </div>

        <div className="p-3.5 rounded-xl bg-surface-elevated border border-border">
          <span className="text-[11px] text-text-secondary block font-medium">Total Levied Charges</span>
          <p className="text-xl font-bold text-text-primary mt-0.5 font-mono">₹{totalLevied.toLocaleString('en-IN')}</p>
          <span className="text-[10px] text-text-secondary font-mono mt-0.5 block">{charges.length} total records</span>
        </div>
      </div>

      {/* ── SEVEN INDEPENDENT CUSTOMER CHARGE STAGE CARDS ────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div>
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              Customer Charges — Independent Stage Management
            </h3>
            <p className="text-xs text-text-secondary">
              Activate and manage each fee individually. Customer sees only active applicable charges.
            </p>
          </div>
          <Badge className="bg-[#EAF4FF] text-[#2563EB] border border-[#CBDDE9] text-xs font-bold px-3 py-1">
            Customer: {customerName}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {SPECIFIC_CHARGE_CONFIG.map((cfg) => {
            const charge = charges.find(
              (c) =>
                c.name.toLowerCase().includes(cfg.name.toLowerCase()) ||
                (cfg.name.includes('TSD') && c.name.toLowerCase().includes('tds'))
            );

            const isPaid = charge?.status === 'PAID';
            const hasUtr = Boolean(charge?.transactionRef);
            const isSent = Boolean(charge?.sentAt);
            const isPending = charge?.status === 'PENDING';
            const isActive = isPending && isSent;

            const amount = charge?.amount ?? cfg.defaultAmount;

            return (
              <div
                key={cfg.name}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 shadow-xs ${
                  isPaid
                    ? 'bg-emerald-50/40 border-emerald-200'
                    : isActive
                    ? 'bg-blue-50/40 border-blue-200 ring-1 ring-blue-500/20'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      {cfg.name}
                    </span>
                    {isPaid ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold">
                        PAID ✓
                      </Badge>
                    ) : hasUtr && isPending ? (
                      <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold">
                        UTR VERIFICATION
                      </Badge>
                    ) : isActive ? (
                      <Badge className="bg-blue-100 text-blue-800 border border-blue-300 text-[10px] font-bold">
                        ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px]">
                        NOT ACTIVE
                      </Badge>
                    )}
                  </div>

                  <div className="text-xl font-black text-slate-900 font-mono">
                    ₹{amount.toLocaleString('en-IN')}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {charge?.remark || cfg.description}
                  </p>
                  {charge?.transactionRef && (
                    <p className="text-[10px] text-blue-600 font-mono font-medium">
                      UTR: {charge.transactionRef}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                  {!charge ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewChargeType(cfg.name.includes('TSD') ? 'TSD/TDS Charges' : cfg.name);
                        setNewAmount(String(cfg.defaultAmount));
                        setNewRemark(`Standard ${cfg.name}`);
                        setAddModalOpen(true);
                      }}
                      className="w-full text-xs h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl shadow-xs transition active:scale-95"
                    >
                      Activate Charge
                    </Button>
                  ) : isPaid ? (
                    <div className="w-full flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewInvoice(charge)}
                        className="flex-1 text-xs h-10 border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50 font-semibold rounded-xl"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        Invoice
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleDownloadInvoice(charge)}
                        className="text-xs h-10 px-3 bg-[#16A34A] hover:bg-[#15803d] text-white font-bold rounded-xl shadow-xs"
                        title="Download Invoice PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : hasUtr ? (
                    <Button
                      size="sm"
                      onClick={() => verifyPaymentMutation.mutate(charge.id)}
                      disabled={verifyPaymentMutation.isPending}
                      className="w-full text-xs h-10 bg-[#16A34A] hover:bg-[#15803d] text-white font-bold rounded-xl shadow-sm transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Verify Payment
                    </Button>
                  ) : !isSent ? (
                    <Button
                      size="sm"
                      onClick={() => handleOpenSend(charge)}
                      className="w-full text-xs h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl shadow-xs transition active:scale-95"
                    >
                      <Send className="w-3.5 h-3.5 mr-1" />
                      Activate / Send
                    </Button>
                  ) : (
                    <div className="w-full flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenSend(charge)}
                        className="flex-1 text-xs h-10 border-blue-200 text-blue-700 bg-blue-50/60 hover:bg-blue-100 font-semibold rounded-xl"
                      >
                        Resend Notice
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenView(charge)}
                        className="text-xs h-10 px-2.5 text-slate-600 hover:text-slate-900 rounded-xl"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charges Table / List */}
      <Card className="border-border bg-surface-elevated text-slate-100 shadow-sm overflow-hidden">
        <CardHeader className="p-4 border-b border-border flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-text-primary">Customer Specific Charges</CardTitle>
            <CardDescription className="text-xs text-text-secondary">
              Every charge exists as an independent database record with its own lifecycle, payment tracking, and tax invoice.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs text-text-secondary border-border bg-surface/50">
            {charges.length} Records
          </Badge>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-7 h-7 text-success animate-spin" />
              <p className="text-xs text-text-secondary">Loading specific charges...</p>
            </div>
          ) : charges.length === 0 ? (
            <div className="py-14 text-center space-y-3 px-4">
              <div className="w-12 h-12 rounded-full bg-surface-elevated/80 text-text-secondary flex items-center justify-center mx-auto">
                <IndianRupee className="w-6 h-6 text-text-secondary" />
              </div>
              <h4 className="text-sm font-semibold text-text-secondary">No Specific Charges Levied</h4>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                No custom charges have been assigned to this customer yet. Click &quot;Add Charge&quot; above to create one.
              </p>
            </div>
          ) : (
            <>
              {/* Desktop Table: Columns: Charge Type, Amount, Remark, Due Date, Status, Created Date, Created By, Actions */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-background border-b border-border text-text-secondary uppercase tracking-wider font-semibold text-[10px]">
                    <tr>
                      <th className="py-3 px-4">Charge Type</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Remark</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Created Date</th>
                      <th className="py-3 px-4">Created By</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {charges.map((charge) => {
                      const isPending = charge.status === 'PENDING';
                      const isPaid = charge.status === 'PAID';
                      const hasUtr = Boolean(charge.transactionRef);
                      const isSent = Boolean(charge.sentAt);

                      return (
                        <tr key={charge.id} className="hover:bg-surface-elevated/30 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-text-primary flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isPaid ? 'bg-success' : isPending ? 'bg-[#F5B942]' : 'bg-slate-500'
                              }`}
                            />
                            <span>{charge.name}</span>
                          </td>

                          <td className="py-3.5 px-4 font-mono font-bold text-sm text-slate-100">
                            ₹{charge.amount.toLocaleString('en-IN')}
                          </td>

                          <td className="py-3.5 px-4 text-text-secondary max-w-[160px] truncate" title={charge.remark || ''}>
                            {charge.remark || '—'}
                          </td>

                          <td className="py-3.5 px-4 text-text-secondary font-mono text-[11px]">
                            {charge.dueDate
                              ? new Date(charge.dueDate).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'Immediate'}
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              {getStatusBadge(charge.status)}
                              {hasUtr && (
                                <span className="font-mono text-[10px] text-success block" title="Customer UTR">
                                  UTR: {charge.transactionRef}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3.5 px-4 text-text-secondary font-mono text-[11px]">
                            {new Date(charge.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>

                          <td className="py-3.5 px-4 text-text-secondary">{charge.createdBy || 'Admin'}</td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Send Button Lifecycle */}
                              {isPending && !isSent && (
                                <Button
                                  size="sm"
                                  onClick={() => handleOpenSend(charge)}
                                  className="h-7 px-2.5 text-[11px] bg-primary hover:bg-[#5a52e0] text-text-primary font-semibold"
                                  title="Send Charge Notice to Customer"
                                >
                                  <Send className="w-3 h-3 mr-1" /> Send
                                </Button>
                              )}

                              {isPending && isSent && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenSend(charge)}
                                  className="h-7 px-2 text-[11px] border-primary/50 text-[#8b85ff] hover:bg-primary/20"
                                  title={`Sent on ${charge.sentAt ? new Date(charge.sentAt).toLocaleDateString('en-IN') : ''}. Click to Resend.`}
                                >
                                  <Send className="w-3 h-3 mr-1" /> Resend
                                </Button>
                              )}

                              {isPaid && (
                                <Badge
                                  variant="outline"
                                  className="h-7 px-2 text-[11px] text-success border-success/30 bg-emerald-950/20 font-semibold flex items-center"
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Paid
                                </Badge>
                              )}

                              {/* View Details */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenView(charge)}
                                title="View Details"
                                className="h-7 px-2 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                              >
                                <Eye className="w-3 h-3 mr-1" /> View
                              </Button>

                              {/* Edit: Only if PENDING and no UTR submitted */}
                              {isPending && !hasUtr && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenEdit(charge)}
                                  title="Edit Charge"
                                  className="h-7 px-2 text-[11px] text-primary hover:text-primary hover:bg-surface-elevated"
                                >
                                  <Edit3 className="w-3 h-3 mr-1" /> Edit
                                </Button>
                              )}

                              {/* Cancel: Only if PENDING and no UTR submitted */}
                              {isPending && !hasUtr && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenCancel(charge)}
                                  title="Cancel Charge"
                                  className="h-7 px-2 text-[11px] text-danger hover:text-danger hover:bg-surface-elevated"
                                >
                                  <XCircle className="w-3 h-3 mr-1" /> Cancel
                                </Button>
                              )}

                              {/* Verify Payment: If customer submitted UTR and charge still pending */}
                              {isPending && hasUtr && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => verifyPaymentMutation.mutate(charge.id)}
                                  disabled={verifyPaymentMutation.isPending}
                                  title="Verify Customer Payment"
                                  className="h-7 px-2 text-[11px] border-success/50 bg-emerald-950/40 text-success hover:bg-emerald-900/50 font-semibold"
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Verify Payment
                                </Button>
                              )}

                              {/* Invoice Actions: For PAID charges */}
                              {isPaid && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleViewInvoice(charge)}
                                    title="View Tax Invoice"
                                    className="h-7 px-2 text-[11px] border-border bg-surface-elevated text-text-primary hover:text-text-primary"
                                  >
                                    <FileText className="w-3 h-3 mr-1" /> Invoice
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownloadInvoice(charge)}
                                    title="Download PDF"
                                    className="h-7 px-2 text-[11px] text-success hover:text-success hover:bg-surface-elevated"
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="lg:hidden divide-y divide-slate-800">
                {charges.map((charge) => {
                  const isPending = charge.status === 'PENDING';
                  const isPaid = charge.status === 'PAID';
                  const hasUtr = Boolean(charge.transactionRef);
                  const isSent = Boolean(charge.sentAt);

                  return (
                    <div key={charge.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-sm text-text-primary block">{charge.name}</span>
                          <span className="text-[11px] text-text-secondary">
                            Created: {new Date(charge.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-base text-text-primary block font-mono">
                            ₹{charge.amount.toLocaleString('en-IN')}
                          </span>
                          {getStatusBadge(charge.status)}
                        </div>
                      </div>

                      {charge.remark && (
                        <p className="text-xs text-text-secondary bg-surface-elevated/60 p-2.5 rounded-lg border border-border">
                          {charge.remark}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-xs text-text-secondary pt-1 border-t border-border/60">
                        <span>Due: {charge.dueDate ? new Date(charge.dueDate).toLocaleDateString('en-IN') : 'Immediate'}</span>
                        <span>UTR: {charge.transactionRef || 'None'}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {isPending && !isSent && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenSend(charge)}
                            className="h-7 px-2.5 text-[11px] bg-primary text-text-primary font-semibold"
                          >
                            <Send className="w-3 h-3 mr-1" /> Send
                          </Button>
                        )}

                        {isPending && isSent && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenSend(charge)}
                            className="h-7 px-2 text-[11px] border-primary/50 text-[#8b85ff]"
                          >
                            <Send className="w-3 h-3 mr-1" /> Resend
                          </Button>
                        )}

                        {isPaid && (
                          <Badge variant="outline" className="h-7 px-2 text-[11px] text-success border-success/30">
                            Paid
                          </Badge>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenView(charge)}
                          className="h-7 px-2 text-[11px] text-text-secondary hover:text-text-primary"
                        >
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>

                        {isPending && !hasUtr && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(charge)}
                              className="h-7 px-2 text-[11px] text-primary"
                            >
                              <Edit3 className="w-3 h-3 mr-1" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenCancel(charge)}
                              className="h-7 px-2 text-[11px] text-danger"
                            >
                              <XCircle className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                          </>
                        )}

                        {isPending && hasUtr && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => verifyPaymentMutation.mutate(charge.id)}
                            disabled={verifyPaymentMutation.isPending}
                            className="h-7 px-2 text-[11px] border-success/50 text-success"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Verify Payment
                          </Button>
                        )}

                        {isPaid && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewInvoice(charge)}
                              className="h-7 px-2 text-[11px] border-border bg-surface-elevated text-text-primary"
                            >
                              <FileText className="w-3 h-3 mr-1" /> Invoice
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadInvoice(charge)}
                              className="h-7 px-2 text-[11px] text-success"
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ==================================================== */}
      {/* 1. ADD SPECIFIC CHARGE MODAL */}
      {/* ==================================================== */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-lg shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#2563EB]" />
              Add Customer-Specific Charge
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Create a charge for a specific customer and loan application.
            </DialogDescription>
          </DialogHeader>

          {effectiveLoans.length === 0 ? (
            /* Requirement 4: IF NO APPLICATION ACTUALLY EXISTS */
            <div className="py-3 space-y-4">
              <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-[#991B1B] text-sm">No active loan application found</h4>
                    <p className="text-[#7F1D1D] leading-relaxed">
                      This customer does not currently have a loan application to attach a customer-specific charge to.
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddModalOpen(false)}
                  className="border-slate-300 text-slate-700 hover:text-slate-900 h-9 px-4 text-xs"
                >
                  Cancel
                </Button>
                <Link to="/admin/loans" onClick={() => setAddModalOpen(false)}>
                  <Button
                    size="sm"
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold h-9 px-4 text-xs shadow-sm"
                  >
                    Create New Loan
                  </Button>
                </Link>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              {/* Requirement 5: Clearly readable error alert component */}
              {formError && (
                <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[#DC2626] mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-[#991B1B] block">Application Required</span>
                    <span className="text-[#7F1D1D] block leading-relaxed">{formError}</span>
                  </div>
                </div>
              )}

              {/* Requirement 3: Multiple applications selector OR Requirement 2: Single application info strip */}
              {effectiveLoans.length > 1 ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold uppercase text-[10px]">CUSTOMER:</span>
                    <span className="font-bold text-slate-900">{customerName}</span>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="loanAppSelect" className="text-xs font-semibold text-slate-700 block">
                      Loan Application <span className="text-red-600">*</span>
                    </Label>
                    <select
                      id="loanAppSelect"
                      value={selectedLoanId}
                      onChange={(e) => setSelectedLoanId(e.target.value)}
                      className="w-full text-xs h-10 rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    >
                      {effectiveLoans.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.applicationNumber} — ₹{(l.approvedAmount || l.requestedAmount || 0).toLocaleString('en-IN')} — {l.status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold mb-0.5">CUSTOMER</span>
                    <span className="font-bold text-slate-900 text-xs truncate block">{customerName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold mb-0.5">APPLICATION</span>
                    <span className="font-mono font-bold text-blue-700 text-xs truncate block">{currentSelectedLoan?.applicationNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold mb-0.5">STATUS</span>
                    <span className="font-bold text-slate-800 text-xs uppercase truncate block">{currentSelectedLoan?.status}</span>
                  </div>
                </div>
              )}

              {/* Requirement 7: CHARGE DETAILS section */}
              <div className="pt-2 border-t border-slate-200 space-y-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  CHARGE DETAILS
                </span>

                {/* 7 Fixed Specific Charge Types Dropdown */}
                <div className="space-y-1.5">
                  <Label htmlFor="chargeType" className="text-slate-700 text-xs font-semibold">
                    Charge Type <span className="text-red-600">*</span>
                  </Label>
                  <select
                    id="chargeType"
                    value={newChargeType}
                    onChange={(e) => {
                      setNewChargeType(e.target.value);
                      setForceDuplicateConfirm(false);
                    }}
                    className="w-full text-xs h-10 rounded-lg border border-slate-300 bg-white px-3 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    {SPECIFIC_CHARGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Same Charge Type Duplicate Warning with high contrast */}
                {duplicateCharge && (
                  <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#92400E] block font-semibold">Duplicate Warning:</strong>
                        A <strong className="text-[#78350F]">{newChargeType}</strong> charge already exists for this application (Status: {duplicateCharge.status}, Amount: ₹{duplicateCharge.amount.toLocaleString('en-IN')}).
                      </div>
                    </div>
                    <label className="flex items-center gap-2 pt-1 text-[11px] text-[#92400E] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={forceDuplicateConfirm}
                        onChange={(e) => setForceDuplicateConfirm(e.target.checked)}
                        className="rounded border-[#FDE68A] text-amber-600 focus:ring-amber-500"
                      />
                      <span>I understand and intentionally confirm creating an additional charge of this type.</span>
                    </label>
                  </div>
                )}

                {/* Amount Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="amount" className="text-slate-700 text-xs font-semibold">
                    Amount *
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-500 font-bold">₹</span>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="900"
                      value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)}
                      className="pl-7 bg-white border-slate-300 text-slate-900 text-xs h-10 focus:ring-[#2563EB]"
                    />
                  </div>
                </div>

                {/* Remark Field */}
                <div className="space-y-1.5">
                  <Label htmlFor="remark" className="text-slate-700 text-xs">
                    Remark / Instructions
                  </Label>
                  <Input
                    id="remark"
                    placeholder="e.g. Standard GST"
                    value={newRemark}
                    onChange={(e) => setNewRemark(e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 text-xs h-10 focus:ring-[#2563EB]"
                  />
                </div>

                {/* Due Date Picker */}
                <div className="space-y-1.5">
                  <Label htmlFor="dueDate" className="text-slate-700 text-xs">
                    Due Date
                  </Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="bg-white border-slate-300 text-slate-900 text-xs h-10 focus:ring-[#2563EB]"
                  />
                </div>
              </div>

              <DialogFooter className="border-t border-slate-200 pt-3 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddModalOpen(false)}
                  className="border-slate-300 text-slate-700 hover:text-slate-900 h-9 px-4 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => createMutation.mutate()}
                  disabled={
                    !newAmount ||
                    Number(newAmount) <= 0 ||
                    (Boolean(duplicateCharge) && !forceDuplicateConfirm) ||
                    createMutation.isPending
                  }
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold h-9 px-5 text-xs shadow-sm transition"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Charge'
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 2. INDIVIDUAL SEND CHARGE CONFIRMATION MODAL */}
      {/* ==================================================== */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="bg-surface-elevated border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Send Charge to Customer?
            </DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              Dispatches notification to customer. The charge remains PENDING until payment verification.
            </DialogDescription>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer:</span>
                  <span className="font-bold text-text-primary">{customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Charge:</span>
                  <span className="font-bold text-indigo-300">{selectedCharge.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Amount:</span>
                  <span className="font-mono font-bold text-text-primary text-sm">
                    ₹{selectedCharge.amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Application:</span>
                  <span className="font-mono text-success">
                    {selectedCharge.loan?.applicationNumber || applicationId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Due Date:</span>
                  <span className="text-text-secondary">
                    {selectedCharge.dueDate
                      ? new Date(selectedCharge.dueDate).toLocaleDateString('en-IN')
                      : 'Immediate'}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E40AF] text-xs">
                <span className="font-semibold block mb-1">Message Preview:</span>
                &quot;Your {selectedCharge.name} of ₹{selectedCharge.amount.toLocaleString('en-IN')} has been generated for application {selectedCharge.loan?.applicationNumber || applicationId}.&quot;
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSendModalOpen(false)}
              className="border-border text-text-secondary hover:text-text-primary"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => selectedCharge && sendMutation.mutate(selectedCharge.id)}
              disabled={sendMutation.isPending}
              className="bg-primary hover:bg-[#5a52e0] text-text-primary font-semibold"
            >
              {sendMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Send Charge
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 3. SEND ALL CHARGES CONFIRMATION MODAL */}
      {/* ==================================================== */}
      <Dialog open={sendAllModalOpen} onOpenChange={setSendAllModalOpen}>
        <DialogContent className="bg-surface-elevated border-border text-text-primary max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              Send {pendingCharges.length} Charges to {customerName}?
            </DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              Dispatches notification for all pending charges of THIS customer. Each charge remains an independent record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="p-3.5 rounded-xl bg-background border border-border flex items-center justify-between">
              <span className="text-text-secondary">Total Amount to Collect:</span>
              <span className="text-lg font-bold text-text-primary font-mono">₹{totalPending.toLocaleString('en-IN')}</span>
            </div>

            <div className="space-y-1.5">
              <span className="text-text-secondary font-semibold text-[11px] block">Itemized Charges:</span>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {pendingCharges.map((chg) => (
                  <div
                    key={chg.id}
                    className="p-2.5 rounded-lg bg-surface/80 border border-border flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-success" />
                      <span className="text-text-primary font-medium">{chg.name}</span>
                    </div>
                    <span className="font-mono font-bold text-text-primary">
                      ₹{chg.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSendAllModalOpen(false)}
              className="border-border text-text-secondary hover:text-text-primary"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => sendAllMutation.mutate()}
              disabled={sendAllMutation.isPending || pendingCharges.length === 0}
              className="bg-primary hover:bg-[#5a52e0] text-text-primary font-semibold"
            >
              {sendAllMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Sending All...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Send All Charges
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 4. EDIT CHARGE MODAL */}
      {/* ==================================================== */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="bg-surface-elevated border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-primary" />
              Edit Specific Charge ({selectedCharge?.name})
            </DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              Modify fee parameters. Locked once paid.
            </DialogDescription>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="editAmount" className="text-text-secondary text-xs font-semibold">
                  Amount (₹)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-text-secondary font-bold">₹</span>
                  <Input
                    id="editAmount"
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="pl-7 bg-background border-border text-text-primary text-xs h-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editRemark" className="text-text-secondary text-xs">
                  Remark
                </Label>
                <Input
                  id="editRemark"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="bg-background border-border text-text-primary text-xs h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editDueDate" className="text-text-secondary text-xs">
                  Due Date
                </Label>
                <Input
                  id="editDueDate"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="bg-background border-border text-text-primary text-xs h-10"
                />
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditModalOpen(false)}
              className="border-border text-text-secondary"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => updateMutation.mutate()}
              disabled={!editAmount || Number(editAmount) <= 0 || updateMutation.isPending}
              className="bg-primary text-background hover:bg-secondary text-text-primary font-semibold"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 5. VIEW DETAILS MODAL */}
      {/* ==================================================== */}
      <Dialog open={viewModalOpen} onOpenChange={setViewModalOpen}>
        <DialogContent className="bg-surface-elevated border-border text-text-primary max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <Eye className="w-4 h-4 text-text-secondary" />
              Charge Record Details
            </DialogTitle>
          </DialogHeader>

          {selectedCharge && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3.5 rounded-xl bg-background border border-border space-y-2">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Charge ID:</span>
                  <span className="font-mono text-text-secondary text-[11px]">{selectedCharge.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Charge Type:</span>
                  <span className="font-bold text-text-primary">{selectedCharge.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Amount:</span>
                  <span className="font-mono font-bold text-success text-sm">
                    ₹{selectedCharge.amount.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Status:</span>
                  <span>{getStatusBadge(selectedCharge.status)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Customer:</span>
                  <span className="text-text-primary">{customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Application:</span>
                  <span className="font-mono text-success">
                    {selectedCharge.loan?.applicationNumber || applicationId}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Due Date:</span>
                  <span className="text-text-secondary">
                    {selectedCharge.dueDate
                      ? new Date(selectedCharge.dueDate).toLocaleDateString('en-IN')
                      : 'Immediate'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Sent to Customer:</span>
                  <span className="text-text-secondary">
                    {selectedCharge.sentAt
                      ? new Date(selectedCharge.sentAt).toLocaleString('en-IN')
                      : 'Not yet dispatched'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Created By:</span>
                  <span className="text-text-secondary">{selectedCharge.createdBy || 'Admin'}</span>
                </div>
                {selectedCharge.transactionRef && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Customer UTR:</span>
                    <span className="font-mono text-success font-bold">{selectedCharge.transactionRef}</span>
                  </div>
                )}
                {selectedCharge.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Verified Paid At:</span>
                    <span className="text-success">{new Date(selectedCharge.paidAt).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {selectedCharge.remark && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-text-secondary block mb-0.5">Remark:</span>
                    <p className="text-text-secondary">{selectedCharge.remark}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setViewModalOpen(false)}
              className="border-border text-text-secondary"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 6. CANCEL CHARGE CONFIRMATION MODAL */}
      {/* ==================================================== */}
      <Dialog open={cancelModalOpen} onOpenChange={setCancelModalOpen}>
        <DialogContent className="bg-surface-elevated border-border text-text-primary max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
              <XCircle className="w-4 h-4 text-danger" />
              Cancel Specific Charge?
            </DialogTitle>
            <DialogDescription className="text-xs text-text-secondary">
              Are you sure you want to cancel the {selectedCharge?.name} of ₹{selectedCharge?.amount}?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="border-t border-border pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelModalOpen(false)}
              className="border-border text-text-secondary"
            >
              No, Keep
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-text-primary font-semibold"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Charge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================== */}
      {/* 7. INVOICE PREVIEW MODAL — native in-app Blob rendering */}
      {/* ==================================================== */}
      <PdfViewerModal
        open={invoicePdfViewer.open}
        onClose={invoicePdfViewer.closeModal}
        blob={invoicePdfViewer.blob}
        blobUrl={invoicePdfViewer.blobUrl}
        pdfBytes={invoicePdfViewer.pdfBytes}
        loading={invoicePdfViewer.loading}
        fetchError={invoicePdfViewer.error}
        title={`Tax Invoice Preview${selectedCharge ? ` — ${selectedCharge.name}` : ''}`}
        description="Authoritative tax invoice for the selected charge"
        downloadFilename={selectedCharge ? `Invoice_${selectedCharge.name.replace(/\s+/g, '_')}_${selectedCharge.id.slice(0,8)}.pdf` : 'invoice.pdf'}
        onDownload={() => selectedCharge && handleDownloadInvoice(selectedCharge)}
        onRetry={invoicePdfViewer.retry}
      />
    </div>
  );
};

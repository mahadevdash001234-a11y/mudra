import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from '@/services/adminService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Search,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Trash2,
} from 'lucide-react';
import { DataManagementModal, ManagementActionType } from '@/components/admin/DataManagementModal';
import { BulkActionBar } from '@/components/admin/BulkActionBar';
import { API_ENDPOINTS } from '@/api/endpoints';
import { apiClient } from '@/api/client';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';


interface PaymentItem {
  id: string;
  loanId?: string;
  applicationNumber?: string;
  customerId: string;
  customerName: string;
  mobile: string;
  email?: string;
  chargeType?: string;
  amount: number;
  utr: string;
  receiptNumber?: string;
  paymentMethod: string;
  status: string;
  rejectionReason?: string;
  notes?: string;
  submittedAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
}

export const AdminPaymentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const getInitialStatus = () => {
    const s = searchParams.get('status');
    if (!s) return 'ALL';
    if (s === 'PENDING' || s === 'UNDER_VERIFICATION') return 'PENDING';
    if (s === 'SUCCESS' || s === 'PAID') return 'PAID';
    if (s === 'REJECTED') return 'REJECTED';
    if (s === 'ALL') return 'ALL';
    return s;
  };

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(getInitialStatus);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    const s = searchParams.get('status');
    if (s === 'PENDING' || s === 'UNDER_VERIFICATION') setStatusFilter('PENDING');
    else if (s === 'SUCCESS' || s === 'PAID') setStatusFilter('PAID');
    else if (s === 'REJECTED') setStatusFilter('REJECTED');
    else if (s === 'ALL') setStatusFilter('ALL');
  }, [searchParams]);

  // Selected payment for verification/view modal
  const [activePayment, setActivePayment] = useState<PaymentItem | null>(null);
  const [modalMode, setModalMode] = useState<'VERIFY' | 'REJECT' | 'VIEW' | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const invoicePdfViewer = usePdfViewer();
  const [selectedInvoicePayment, setSelectedInvoicePayment] = useState<PaymentItem | null>(null);

  const handleViewInvoice = async (payment: PaymentItem) => {
    try {
      setSelectedInvoicePayment(payment);
      const chargeId = (payment as any).chargeId || payment.id;
      await invoicePdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeId, false));
    } catch {
      alert(`Failed to stream invoice for ${payment.customerName || 'Payment'}.`);
    }
  };

  const handleDownloadInvoice = async (payment: PaymentItem) => {
    try {
      const chargeId = (payment as any).chargeId || payment.id;
      const res = await apiClient.get(API_ENDPOINTS.CHARGES.SPECIFIC.INVOICE(chargeId, true), {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${payment.chargeType || 'Payment'}_${payment.utr || payment.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert(`Failed to download invoice for ${payment.customerName || 'Payment'}.`);
    }
  };

  // Batch selection state & DataManagementModal state
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [mgmtModalState, setMgmtModalState] = useState<{
    isOpen: boolean;
    actionType: ManagementActionType;
    title: string;
    description: string;
    itemCount: number;
    itemNames: string[];
    warningMessage?: string;
    requireTypedConfirmation?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    actionType: 'DELETE',
    title: '',
    description: '',
    itemCount: 0,
    itemNames: [],
    onConfirm: async () => {},
  });

  const handleBulkArchive = () => {
    setMgmtModalState({
      isOpen: true,
      actionType: 'ARCHIVE',
      title: 'Bulk Archive Payments',
      description: `Archive ${selectedPaymentIds.length} selected payment record(s).`,
      itemCount: selectedPaymentIds.length,
      itemNames: selectedPaymentIds.slice(0, 5),
      warningMessage: 'Archiving soft-deactivates selected payment submissions while retaining audit records.',
      onConfirm: async () => {
        await apiClient.post(API_ENDPOINTS.PAYMENTS.BULK_ARCHIVE, { paymentIds: selectedPaymentIds });
        queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
        setSelectedPaymentIds([]);
      },
    });
  };

  const handleBulkRestore = () => {
    setMgmtModalState({
      isOpen: true,
      actionType: 'RESTORE',
      title: 'Bulk Restore Payments',
      description: `Restore ${selectedPaymentIds.length} selected payment record(s) back into active verification queue.`,
      itemCount: selectedPaymentIds.length,
      itemNames: selectedPaymentIds.slice(0, 5),
      onConfirm: async () => {
        await apiClient.post(API_ENDPOINTS.PAYMENTS.BULK_RESTORE, { paymentIds: selectedPaymentIds });
        queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
        setSelectedPaymentIds([]);
      },
    });
  };

  const handleBulkDelete = () => {
    setMgmtModalState({
      isOpen: true,
      actionType: 'DELETE',
      title: 'Permanently Delete Selected Payments',
      description: `Attempt permanent deletion of ${selectedPaymentIds.length} selected payment record(s).`,
      itemCount: selectedPaymentIds.length,
      itemNames: selectedPaymentIds.slice(0, 5),
      requireTypedConfirmation: true,
      warningMessage: 'CRITICAL FINANCIAL RULE: Verified, Paid, or Invoice-linked payments CANNOT be raw deleted due to database foreign-key safety. Audit protection will soft-archive/reject them instead.',
      onConfirm: async () => {
        await apiClient.post(API_ENDPOINTS.PAYMENTS.BULK_DELETE, { paymentIds: selectedPaymentIds });
        queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
        setSelectedPaymentIds([]);
      },
    });
  };

  const handleSingleDelete = (p: PaymentItem) => {
    setMgmtModalState({
      isOpen: true,
      actionType: 'DELETE',
      title: `Delete Payment: UTR ${p.utr}`,
      description: `Delete payment record of ₹${p.amount.toLocaleString('en-IN')} submitted by ${p.customerName}.`,
      itemCount: 1,
      itemNames: [`UTR: ${p.utr} - ₹${p.amount.toLocaleString('en-IN')} (${p.customerName})`],
      requireTypedConfirmation: true,
      warningMessage: ['PAID', 'VERIFIED', 'SUCCESS'].includes((p.status || '').toUpperCase())
        ? 'NOTE: This payment is marked VERIFIED/PAID. Foreign-key safety rules block raw SQL deletion and will soft-archive/reject the payment instead.'
        : 'This action will remove unverified payment entry.',
      onConfirm: async () => {
        await apiClient.delete(API_ENDPOINTS.PAYMENTS.DELETE(p.id));
        queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      },
    });
  };


  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-payments', page, statusFilter, search],
    queryFn: async () => {
      let mappedStatus: string | undefined = undefined;
      if (statusFilter === 'PENDING') mappedStatus = 'UNDER_VERIFICATION';
      else if (statusFilter === 'PAID') mappedStatus = 'PAID';
      else if (statusFilter === 'REJECTED') mappedStatus = 'REJECTED';

      const res = await adminService.getAllPayments({
        page,
        limit: 15,
        status: mappedStatus,
        search: search.trim() || undefined,
      });
      return res;
    },
    refetchInterval: 1500,
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      return adminService.verifyPayment(id, adminNotes);
    },
    onSuccess: () => {
      setModalMode(null);
      setActivePayment(null);
      setAdminNotes('');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Failed to verify payment.');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return adminService.rejectPayment(id, reason);
    },
    onSuccess: () => {
      setModalMode(null);
      setActivePayment(null);
      setRejectReason('');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (err: any) => {
      setActionError(err?.message || 'Failed to reject payment.');
    },
  });

  const payments: PaymentItem[] = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, limit: 15, totalPages: 1 };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-success/15 text-success border border-success/30">
            PAID
          </span>
        );
      case 'UNDER_VERIFICATION':
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30">
            PENDING
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30">
            REJECTED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#1D3047] text-text-secondary">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Breadcrumb */}
      <div className="flex items-center space-x-2 text-xs text-text-secondary">
        <Link to="/admin/dashboard" className="hover:text-text-primary transition-colors">Dashboard</Link>
        <span>›</span>
        <span className="text-text-primary font-semibold">Payments</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-success" />
            <span>Payments & UTR Verification</span>
          </h1>
          <p className="text-xs text-text-secondary mt-0.5">
            Audit customer fee submissions and verify bank UTR references. Payment confirmation is decoupled from loan approval.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          disabled={isFetching}
          className="bg-surface-elevated border-border text-text-primary hover:bg-surface-elevated hover:brightness-110 text-xs h-9"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Bulk Action Sticky Bar */}
      <BulkActionBar
        selectedCount={selectedPaymentIds.length}
        totalCount={payments.length}
        onClearSelection={() => setSelectedPaymentIds([])}
        onArchiveSelected={handleBulkArchive}
        archiveLabel="Archive Selected"
        onRestoreSelected={handleBulkRestore}
        restoreLabel="Restore Selected"
        onDeleteSelected={handleBulkDelete}
        deleteLabel="Delete Selected"
      />

      {/* Filter Tabs & Search Bar */}
      <Card className="bg-surface-elevated border border-border shadow-sm">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-1.5 overflow-x-auto text-xs font-medium">
            {[
              { key: 'PENDING', label: 'Pending Verification' },
              { key: 'PAID', label: 'Verified Payments' },
              { key: 'REJECTED', label: 'Rejected' },
              { key: 'ALL', label: 'All Payments' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                  setSearchParams({ status: tab.key });
                }}
                className={`py-1.5 px-3 rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === tab.key
                    ? 'bg-primary text-text-primary font-semibold shadow-sm'
                    : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated hover:brightness-110'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
            <Input
              placeholder="Search Customer, UTR, App ID..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="bg-surface border-border text-text-primary text-xs h-8.5 pl-8 rounded-lg placeholder-[#8FA3BA]/60"
            />
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-text-secondary">
            <thead className="bg-surface text-text-secondary uppercase tracking-wider text-[10px] font-bold border-b border-border">
              <tr>
                <th className="px-3 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={payments.length > 0 && payments.every((p) => selectedPaymentIds.includes(p.id))}
                    onChange={() => {
                      if (payments.every((p) => selectedPaymentIds.includes(p.id))) {
                        setSelectedPaymentIds([]);
                      } else {
                        setSelectedPaymentIds(payments.map((p) => p.id));
                      }
                    }}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Application</th>
                <th className="px-4 py-3">Charge</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">UTR</th>
                <th className="px-4 py-3">Submitted Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-text-secondary">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                    Loading payments queue...
                  </td>
                </tr>
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-xs text-text-secondary">
                    No payments found matching criteria.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-elevated hover:brightness-110/50 transition-colors">
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPaymentIds.includes(p.id)}
                        onChange={() => {
                          setSelectedPaymentIds((prev) =>
                            prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]
                          );
                        }}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-text-primary">{p.customerName || 'Borrower'}</p>
                        <p className="text-[11px] text-text-secondary font-mono">{p.mobile}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-text-primary">
                      {p.loanId ? (
                        <Link to={`/admin/loans/${p.loanId}`} className="hover:text-primary transition-colors">
                          {p.applicationNumber || p.loanId.slice(0, 8)}
                        </Link>
                      ) : (
                        p.applicationNumber || '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {p.chargeType ? p.chargeType.replace(/_/g, ' ') : 'Processing Fee'}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-success">
                      ₹{(p.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-text-primary">
                      {p.utr || <span className="text-text-secondary italic">Not provided</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.submittedAt
                        ? new Date(p.submittedAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActivePayment(p);
                            setModalMode('VIEW');
                          }}
                          className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>

                        {(p.status === 'PAID' || p.status === 'SUCCESS') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoice(p)}
                              title="View Tax Invoice"
                              className="h-7 px-2 text-xs border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              Invoice
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadInvoice(p)}
                              title="Download Tax Invoice PDF"
                              className="h-7 px-2 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-bold"
                            >
                              PDF
                            </Button>
                          </>
                        )}

                        {p.status === 'UNDER_VERIFICATION' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setActivePayment(p);
                                setModalMode('VERIFY');
                                setActionError(null);
                              }}
                              className="h-7 px-2.5 text-xs bg-success/15 text-success hover:bg-success hover:text-black border border-success/30 font-semibold"
                            >
                              Verify
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setActivePayment(p);
                                setModalMode('REJECT');
                                setActionError(null);
                              }}
                              className="h-7 px-2.5 text-xs bg-danger/15 text-danger hover:bg-danger hover:text-white border border-danger/30 font-semibold"
                            >
                              Reject
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSingleDelete(p)}
                          className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete or Archive Payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-text-secondary">
            <span>
              Showing Page <strong className="text-text-primary">{pagination.page}</strong> of{' '}
              <strong className="text-text-primary">{pagination.totalPages}</strong> ({pagination.total} total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="bg-surface border-border text-text-secondary hover:text-text-primary text-xs h-8"
              >
                <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(page + 1)}
                className="bg-surface border-border text-text-secondary hover:text-text-primary text-xs h-8"
              >
                Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Verification / Details Modal ───────────────────────────────────── */}
      {activePayment && (
        <Dialog
          open={!!modalMode}
          onOpenChange={(open) => {
            if (!open) {
              setModalMode(null);
              setActivePayment(null);
            }
          }}
        >
          <DialogContent className="max-w-md bg-surface-elevated border-border text-text-primary">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-text-primary flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-success" />
                Payment Verification Record
              </DialogTitle>
              <DialogDescription className="text-xs text-text-secondary">
                Confirm UTR settlement in merchant bank account
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg text-xs text-danger flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Structured Payment Info Display */}
            <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Customer:</span>
                <span className="font-semibold text-text-primary">{activePayment.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Application:</span>
                <span className="font-mono text-text-primary">{activePayment.applicationNumber || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Charge:</span>
                <span className="text-text-primary">
                  {activePayment.chargeType ? activePayment.chargeType.replace(/_/g, ' ') : 'Processing Fee'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Amount:</span>
                <span className="font-mono font-bold text-success text-sm">
                  ₹{(activePayment.amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">UTR:</span>
                <span className="font-mono font-bold text-text-primary bg-surface-elevated px-2 py-0.5 rounded border border-border">
                  {activePayment.utr || 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Payment Date:</span>
                <span className="text-text-primary">
                  {activePayment.submittedAt ? new Date(activePayment.submittedAt).toLocaleString('en-IN') : '—'}
                </span>
              </div>
            </div>

            {/* Rejection Input */}
            {modalMode === 'REJECT' && (
              <div className="space-y-1.5 text-xs pt-2">
                <Label className="text-danger">Rejection Reason *</Label>
                <Input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. UTR not found in bank statement, amount mismatch"
                  className="bg-surface border-border text-text-primary text-xs mt-1"
                />
              </div>
            )}

            {/* Verification Note */}
            {modalMode === 'VERIFY' && (
              <div className="space-y-1.5 text-xs pt-2">
                <Label className="text-text-secondary">Internal Verification Note (Optional)</Label>
                <Input
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Verified against ICICI statement"
                  className="bg-surface border-border text-text-primary text-xs mt-1"
                />
                <p className="text-[11px] text-text-secondary italic mt-1">
                  Note: Verifying payment records the fee as PAID and generates the Tax Invoice. It will not alter the loan underwriting decision.
                </p>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalMode(null)}
                className="border-border text-text-secondary hover:bg-surface-elevated hover:brightness-110 text-xs"
              >
                Close
              </Button>

              {modalMode === 'REJECT' && (
                <Button
                  size="sm"
                  onClick={() => rejectMutation.mutate({ id: activePayment.id, reason: rejectReason })}
                  disabled={rejectMutation.isPending || !rejectReason.trim()}
                  className="bg-[#FF5C70]/20 text-danger hover:bg-[#FF5C70] hover:text-text-primary border border-[#FF5C70]/40 font-bold text-xs"
                >
                  {rejectMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Reject Payment
                </Button>
              )}

              {modalMode === 'VERIFY' && (
                <Button
                  size="sm"
                  onClick={() => verifyMutation.mutate(activePayment.id)}
                  disabled={verifyMutation.isPending}
                  className="bg-success hover:bg-success/90 text-[#07111F] font-bold text-xs"
                >
                  {verifyMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Verify Payment
                </Button>
              )}

              {modalMode === 'VIEW' && activePayment.status === 'UNDER_VERIFICATION' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setModalMode('REJECT')}
                    className="bg-[#FF5C70]/20 text-danger hover:bg-[#FF5C70] hover:text-text-primary border border-[#FF5C70]/40 font-bold text-xs"
                  >
                    Reject Payment
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setModalMode('VERIFY')}
                    className="bg-success hover:bg-success/90 text-[#07111F] font-bold text-xs"
                  >
                    Verify Payment
                  </Button>
                </div>
              )}
            </DialogFooter>
        </DialogContent>
      </Dialog>
      )}

      {/* Safe Data Management System Confirmation Modal */}
      <DataManagementModal
        isOpen={mgmtModalState.isOpen}
        onClose={() => setMgmtModalState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={mgmtModalState.onConfirm}
        actionType={mgmtModalState.actionType}
        title={mgmtModalState.title}
        description={mgmtModalState.description}
        itemCount={mgmtModalState.itemCount}
        itemNames={mgmtModalState.itemNames}
        warningMessage={mgmtModalState.warningMessage}
        requireTypedConfirmation={mgmtModalState.requireTypedConfirmation}
        confirmTextRequired="DELETE"
      />

      {/* Invoice PDF Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={invoicePdfViewer.open}
        onClose={() => {
          invoicePdfViewer.closeModal();
          setSelectedInvoicePayment(null);
        }}
        blob={invoicePdfViewer.blob}
        blobUrl={invoicePdfViewer.blobUrl}
        pdfBytes={invoicePdfViewer.pdfBytes}
        loading={invoicePdfViewer.loading}
        fetchError={invoicePdfViewer.error}
        title={`Tax Invoice — ${selectedInvoicePayment?.customerName || 'Payment'}`}
        description={`UTR: ${selectedInvoicePayment?.utr || 'Pending'} • Type: ${selectedInvoicePayment?.chargeType || 'Charge'}`}
        downloadFilename={`Invoice_${selectedInvoicePayment?.chargeType || 'Payment'}_${selectedInvoicePayment?.utr || selectedInvoicePayment?.id || 'invoice'}.pdf`}
        onDownload={() => selectedInvoicePayment && handleDownloadInvoice(selectedInvoicePayment)}
        onRetry={invoicePdfViewer.retry}
      />
    </div>
  );
};

export default AdminPaymentsPage;

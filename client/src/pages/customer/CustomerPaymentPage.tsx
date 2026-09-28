import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  Landmark,
  ExternalLink,
  Lock,
  Download,
  Eye,
  Loader2,
  Clock,
  ArrowRight,
  Sparkles,
  Receipt,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

import { useBranding } from '@/contexts/BrandingContext';
import { useBrandTitle } from '@/hooks/useBrandTitle';
import { normalizeChargeName } from './CustomerHome';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';

interface PaymentOptionsData {
  feeAmount: number;
  feeType: string;
  paymentMethods?: {
    upi: boolean;
    bankTransfer: boolean;
    merchantVpa: boolean;
  };
  upi: {
    enabled: boolean;
    primaryUpiId: string;
    merchantName?: string;
    apps: Array<{ name: string; id: string }>;
    qrCodeUrl?: string;
    merchantVpa?: {
      enabled: boolean;
      vpa: string;
    };
  };
  bank: {
    enabled: boolean;
    accountHolder: string;
    accountNumber: string;
    bankName: string;
    ifsc: string;
    branch: string;
  };
  paymentLinks: Array<{ id: string; title: string; url: string; description?: string }>;
}

export const CustomerPaymentPage: React.FC = () => {
  const { branding } = useBranding();
  useBrandTitle('Charges & Payments');
  const { loanId } = useParams<{ loanId?: string }>();
  const queryClient = useQueryClient();

  const [searchParams] = useSearchParams();
  const chargeIdParam = searchParams.get('charge') || searchParams.get('chargeId');
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(chargeIdParam);

  // Per-charge payment method selection (initially null so no method is auto-selected)
  const [selectedMethodMap, setSelectedMethodMap] = useState<Record<string, 'UPI' | 'BANK' | 'LINK' | null>>({});
  // Per-charge loading timer during 1-2s delay after clicking Pay Using...
  const [initiatingTimerMap, setInitiatingTimerMap] = useState<Record<string, boolean>>({});
  // Per-charge UTR visibility flag (revealed ONLY AFTER 1.5s delay)
  const [showUtrMap, setShowUtrMap] = useState<Record<string, boolean>>({});
  // Per-charge UTR input value
  const [utrValueMap, setUtrValueMap] = useState<Record<string, string>>({});
  // Per-charge submitting UTR status
  const [submittingChargeId, setSubmittingChargeId] = useState<string | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Per-charge download states
  const [downloadingChargeId, setDownloadingChargeId] = useState<string | null>(null);
  const [downloadErrorChargeId, setDownloadErrorChargeId] = useState<string | null>(null);

  // Invoice Preview — uses react-pdf canvas renderer via PdfViewerModal
  const invoicePdfViewer = usePdfViewer();
  const [invoicePreviewTitle, setInvoicePreviewTitle] = useState('');

  // Fetch active payment options
  const { data: options } = useQuery<PaymentOptionsData>({
    queryKey: ['activePaymentOptions'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS);
      return res.data?.data || res.data;
    },
    refetchInterval: 1500,
  });

  // Calculate active payment rails (UPI, Bank Transfer, Payment Link)
  const upiActive = Boolean(options?.paymentMethods?.upi ?? options?.upi?.enabled ?? true);
  const bankActive = Boolean(options?.paymentMethods?.bankTransfer ?? options?.bank?.enabled ?? true);
  const linksActive = Boolean(options?.paymentLinks && options.paymentLinks.length > 0);

  // Fetch customer profile to check KYC status for empty state message
  const { data: customerProfile } = useQuery({
    queryKey: ['customerProfileForPayments'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMERS.PROFILE);
        return res.data?.data?.profile || res.data?.profile || res.data;
      } catch {
        return null;
      }
    },
    refetchInterval: 1500,
  });

  const kycStatus = customerProfile?.kycStatus;
  const isKycApproved = kycStatus === 'APPROVED' || kycStatus === 'VERIFIED';

  // Fetch specific customer charges for this application/customer
  const { data: customerCharges = [], refetch: refetchCharges } = useQuery({
    queryKey: ['customerChargesList', loanId, chargeIdParam],
    queryFn: async () => {
      const endpoint = (loanId && loanId !== 'undefined' && !chargeIdParam)
        ? API_ENDPOINTS.CUSTOMER_CHARGES.BY_APPLICATION(loanId)
        : API_ENDPOINTS.CUSTOMER_CHARGES.LIST;
      const res = await apiClient.get(endpoint);
      const list: any[] = res.data?.data || res.data || [];
      const map = new Map<string, any>();
      for (const item of list) {
        const key = (item.name || '').trim();
        const existing = map.get(key);
        if (!existing) {
          map.set(key, item);
        } else if (chargeIdParam && item.id === chargeIdParam) {
          map.set(key, item);
        } else {
          if (existing.status !== 'PAID' && item.status === 'PAID') {
            map.set(key, item);
          } else if (existing.status !== 'PAID' && item.status === 'UNDER_VERIFICATION' && item.transactionRef) {
            map.set(key, item);
          }
        }
      }
      return Array.from(map.values());
    },
    refetchInterval: 1500,
  });

  // Resolve exact charge ONLY by Charge ID.
  // DO NOT use "kyc", "gst", "processing", amount, latest charge, first charge, or customer ID as fallback identifiers.
  const resolvedExactCharge = useMemo(() => {
    if (!chargeIdParam || !customerCharges || customerCharges.length === 0) {
      return null;
    }
    return customerCharges.find((c: any) => c.id === chargeIdParam) || null;
  }, [chargeIdParam, customerCharges]);

  const isExactChargeActive = Boolean(
    resolvedExactCharge &&
    (resolvedExactCharge.status === 'PENDING' || resolvedExactCharge.status === 'UNDER_VERIFICATION')
  );

  // Development mode logging for diagnostics
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[CustomerPaymentPage Charge Resolution]', {
        requestedChargeId: chargeIdParam,
        authenticatedCustomerId: customerProfile?.id || (customerCharges[0] as any)?.customerId || null,
        apiResponse: customerCharges,
        resolvedChargeId: resolvedExactCharge?.id || null,
        chargeStatus: resolvedExactCharge
          ? resolvedExactCharge.status
          : (chargeIdParam ? 'NOT_FOUND_OR_INACTIVE' : 'NO_CHARGE_PARAM_REQUESTED'),
      });
    }
  }, [chargeIdParam, customerProfile?.id, customerCharges, resolvedExactCharge]);

  // Synchronize selectedChargeId when exact charge is resolved
  useEffect(() => {
    if (resolvedExactCharge && isExactChargeActive) {
      setSelectedChargeId(resolvedExactCharge.id);
      setTimeout(() => {
        const el = document.getElementById(`charge-card-${resolvedExactCharge.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (chargeIdParam && !isExactChargeActive) {
      setSelectedChargeId(null);
    }
  }, [resolvedExactCharge, isExactChargeActive, chargeIdParam]);

  const allPendingCharges = customerCharges.filter((c: any) => c.status === 'PENDING' || c.status === 'UNDER_VERIFICATION');
  const paidCharges = customerCharges.filter((c: any) => c.status === 'PAID');

  // If a specific charge ID was requested in URL:
  // Render ONLY the exact resolved charge if active; if it does not exist or is no longer active, render empty array (safe empty state).
  // Do NOT silently replace it with another charge.
  // If NO charge ID was requested in URL, render all active pending charges.
  const pendingCharges = chargeIdParam
    ? (resolvedExactCharge && isExactChargeActive ? [resolvedExactCharge] : [])
    : allPendingCharges;

  const isChargeNotFoundOrInactive = Boolean(chargeIdParam && (!resolvedExactCharge || !isExactChargeActive));
  const showEmptyState = (customerCharges.length === 0) || isChargeNotFoundOrInactive;

  const paidChargesCount = paidCharges.length;
  const totalPendingAmount = pendingCharges.reduce((acc: number, c: any) => acc + c.amount, 0);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const getSelectedMethod = (chgId: string): 'UPI' | 'BANK' | 'LINK' | null => {
    return selectedMethodMap[chgId] ?? null;
  };

  const handleSelectMethod = (chgId: string, method: 'UPI' | 'BANK' | 'LINK') => {
    setSelectedMethodMap((prev) => ({ ...prev, [chgId]: method }));
  };

  // Pay Now button click on a specific charge card
  const handlePayNow = (chgId: string) => {
    setSelectedChargeId(chgId);
    setTimeout(() => {
      const el = document.getElementById(`charge-payment-${chgId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // Payment Initiation Action with 2.5s UX delay (in the 2-4s range) before UTR section appears
  const handleInitiatePaymentAction = (chg: any) => {
    const chgId = chg.id;
    if (initiatingTimerMap[chgId]) {
      return; // Prevent duplicate payment initiation requests
    }
    const method = getSelectedMethod(chgId);

    setErrorMsg(null);
    setSuccessMsg(null);
    setInitiatingTimerMap((prev) => ({ ...prev, [chgId]: true }));

    // Trigger native rail / deep-link
    if (method === 'UPI') {
      const upiId = options?.upi?.primaryUpiId || 'pay@bank';
      const merchantName = options?.upi?.merchantName || branding.appName || 'Loan Approval';
      const feeName = normalizeChargeName(chg.name);
      const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${chg.amount}&cu=INR&tn=${encodeURIComponent(feeName || 'Application Fee')}`;
      window.location.href = upiUri;
    } else if (method === 'LINK') {
      const linkUrl = options?.paymentLinks?.[0]?.url || '#';
      if (linkUrl && linkUrl !== '#') {
        window.open(linkUrl, '_blank', 'noopener,noreferrer');
      }
    }

    // UX delay of 2.5 seconds (in the 2-4s range) to allow payment action to settle before revealing UTR
    setTimeout(() => {
      setInitiatingTimerMap((prev) => ({ ...prev, [chgId]: false }));
      setShowUtrMap((prev) => ({ ...prev, [chgId]: true }));

      setTimeout(() => {
        const utrEl = document.getElementById(`utr-section-${chgId}`);
        if (utrEl) {
          utrEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }, 2500);
  };

  // Submit UTR for a specific charge
  const handleSubmitUtrForCharge = async (chg: any, e: React.FormEvent) => {
    e.preventDefault();
    const chgId = chg.id;
    if (submittingChargeId === chgId) {
      return; // Prevent duplicate UTR submissions
    }
    const utrVal = (utrValueMap[chgId] || '').trim();
    if (!utrVal) {
      setErrorMsg('Please enter a valid 12-digit UTR or transaction reference number.');
      return;
    }

    setSubmittingChargeId(chgId);
    setErrorMsg(null);
    setSuccessMsg(null);

    const method = getSelectedMethod(chgId);

    try {
      await apiClient.post(API_ENDPOINTS.CUSTOMER_CHARGES.SUBMIT_UTR(chgId), {
        utr: utrVal,
        paymentMethod: method,
        notes: `Customer settlement for ${chg.name} via ${method}`,
      });

      setSuccessMsg(`Payment reference submitted successfully for ${normalizeChargeName(chg.name)}! Status is now Under Verification.`);
      setUtrValueMap((prev) => ({ ...prev, [chgId]: '' }));
      setShowUtrMap((prev) => ({ ...prev, [chgId]: false }));
      refetchCharges();
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customerChargesList'] });
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to submit payment UTR');
    } finally {
      setSubmittingChargeId(null);
    }
  };

  const handleViewInvoice = async (chg: any) => {
    const displayName = normalizeChargeName(chg.name);
    setInvoicePreviewTitle(`${displayName} Invoice`);
    await invoicePdfViewer.fetchAndOpen(API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(chg.id, false));
  };

  const handleDownloadInvoice = async (chg: any) => {
    const displayName = normalizeChargeName(chg.name);
    try {
      setDownloadingChargeId(chg.id);
      setDownloadErrorChargeId(null);
      setErrorMsg(null);
      const res = await apiClient.get(
        API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(chg.id, true),
        { responseType: 'arraybuffer' }
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice_${displayName.replace(/\s+/g, '_')}_${chg.id.slice(0, 6)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      setDownloadErrorChargeId(chg.id);
      setErrorMsg(err.response?.data?.message || 'Unable to download invoice');
    } finally {
      setDownloadingChargeId(null);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16 text-[#0F172A]">
      {/* ── TOP HERO BANNER ────────────────────────────────────────────── */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#D6E4F5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5]">
              Charges & Payments
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F2A5F] tracking-tight">
            Fee Settlements & Tax Invoices
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1 leading-relaxed max-w-2xl">
            Review authorized application charges, complete secure fee settlements, and download official, immutable PDF tax invoices.
          </p>
        </div>

        {/* Financial Summary Box */}
        <div className="flex items-center gap-4 shrink-0 bg-[#F7FAFF] p-4 rounded-2xl border border-[#D6E4F5]">
          <div className="text-right">
            <span className="text-[10px] text-[#64748B] uppercase tracking-wider block font-bold">
              Outstanding Charges
            </span>
            <span className="text-xl font-black text-[#0F172A] font-mono">
              ₹{totalPendingAmount.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="h-9 w-px bg-[#D6E4F5]" />
          <div className="text-right">
            <span className="text-[10px] text-[#16A34A] uppercase tracking-wider block font-bold">
              Verified Invoices
            </span>
            <span className="text-xl font-black text-[#16A34A] font-mono">
              {paidChargesCount} Paid
            </span>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start space-x-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-[#16A34A] shrink-0 mt-0.5" />
          <span className="font-semibold leading-relaxed">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-start space-x-2.5 animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" />
          <span className="font-semibold leading-relaxed">{errorMsg}</span>
        </div>
      )}

      {/* ── SECTION: CHARGES & PAYMENTS ───────────────────────────────── */}
      <div id="assigned-charges-section" className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#0F2A5F] flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#2563EB]" />
              <span>Assigned Application Charges</span>
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Each charge is processed independently with its own authoritative receipt and tax invoice.
            </p>
          </div>
          <Badge className="bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] text-xs font-bold px-3 py-1">
            {!showEmptyState && pendingCharges.length > 0
              ? `${pendingCharges.length} Charge${pendingCharges.length === 1 ? '' : 's'} Total`
              : 'No Active Charges'}
          </Badge>
        </div>

        {/* STAGE-AWARE EMPTY STATE: When no charges are currently active for the customer or exact charge not found */}
        {showEmptyState ? (
          <Card className="bg-white border-[#D6E4F5] rounded-3xl shadow-xs overflow-hidden p-8 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
              {!isKycApproved ? (
                <ShieldCheck className="w-8 h-8" />
              ) : (
                <Receipt className="w-8 h-8" />
              )}
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-extrabold text-[#0F2A5F]">
                {!isKycApproved ? 'No Payment Required Currently' : 'No payment is currently required.'}
              </h3>
              <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                {!isKycApproved
                  ? 'Payments will appear here when a charge becomes active. Please complete your KYC verification first.'
                  : 'Payments will appear here when a charge becomes active.'}
              </p>
            </div>
            {!isKycApproved && (
              <div className="pt-2">
                <Link to="/customer/kyc">
                  <Button className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-xs inline-flex items-center gap-2">
                    <span>Complete KYC</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            )}
          </Card>
        ) : (
          /* List of customer charges: Active + Paid sections */
          <div className="space-y-6">
            {/* 1. CURRENT PENDING CHARGES */}
            {pendingCharges.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-[#0F2A5F] uppercase tracking-wider">
                    CURRENT PAYMENT
                  </h3>
                </div>

                {pendingCharges.map((chg: any) => {
                  const isSelected = selectedChargeId === chg.id;
                  const isInitiating = Boolean(initiatingTimerMap[chg.id]);
                  const showUtr = Boolean(showUtrMap[chg.id]);
                  const method = getSelectedMethod(chg.id);
                  const hasSubmittedUtr = Boolean(chg.transactionRef);
                  const displayName = normalizeChargeName(chg.name);

                  return (
                    <div
                      id={`charge-card-${chg.id}`}
                      key={chg.id}
                      className={`p-5 sm:p-6 rounded-3xl border transition-all bg-white shadow-xs space-y-4 ${
                        isSelected
                          ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20 shadow-md'
                          : 'border-[#D6E4F5] hover:border-[#CBDDE9]'
                      }`}
                    >
                      {/* Charge Card Top Summary Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base sm:text-lg font-bold text-[#0F172A]">{displayName}</span>
                            {isSelected && (
                              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] uppercase tracking-wider">
                                Selected Charge
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#64748B]">
                            {chg.remark || 'Official Application Processing Fee'}
                          </p>
                        </div>

                        <div className="flex items-center sm:text-right justify-between sm:justify-end gap-3">
                          <div className="text-right">
                            {chg.originalAmount && chg.originalAmount > chg.amount && (
                              <span className="text-xs text-[#64748B] line-through font-mono block">
                                ₹{chg.originalAmount.toLocaleString('en-IN')}
                              </span>
                            )}
                            <span className="text-xl sm:text-2xl font-black text-[#0F172A] font-mono">
                              ₹{chg.amount.toLocaleString('en-IN')}
                            </span>
                          </div>

                          {hasSubmittedUtr ? (
                            <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 text-xs font-bold px-3 py-1">
                              <Clock className="w-3.5 h-3.5 mr-1 text-[#2563EB]" /> Pending Verification
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-50 text-[#F59E0B] border border-amber-200 text-xs font-bold px-3 py-1">
                              <AlertCircle className="w-3.5 h-3.5 mr-1 text-[#F59E0B]" /> Payment Required
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Pay Now Button / Submitted Status */}
                      <div className="pt-3 border-t border-[#D6E4F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                          {chg.dueDate ? (
                            <span>Due Date: <strong>{new Date(chg.dueDate).toLocaleDateString('en-IN')}</strong></span>
                          ) : (
                            <span>Settlement: <strong>Immediate settlement required</strong></span>
                          )}
                          {chg.transactionRef && (
                            <>
                              <span>•</span>
                              <span className="font-mono">UTR: <strong>{chg.transactionRef}</strong></span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!hasSubmittedUtr ? (
                            <Button
                              size="sm"
                              onClick={() => handlePayNow(chg.id)}
                              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs h-10 px-5 font-bold rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>Pay Now</span>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          ) : (
                            <span className="text-xs text-[#2563EB] font-bold bg-[#EFF6FF] px-3 py-1.5 rounded-xl border border-[#D6E4F5] flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>✓ UTR Submitted • Pending Verification</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* EXPANDED CHARGE-SPECIFIC PAYMENT METHODS (Shown when Pay Now is clicked) */}
                      {isSelected && !hasSubmittedUtr && (
                        <div id={`charge-payment-${chg.id}`} className="pt-4 border-t-2 border-[#D6E4F5] space-y-5 animate-in fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#F7FAFF] p-4 rounded-2xl border border-[#D6E4F5]">
                            <div>
                              <h3 className="text-base font-extrabold text-[#0F2A5F] tracking-tight">
                                {displayName.toUpperCase()} PAYMENT
                              </h3>
                              <p className="text-xs text-[#64748B]">Choose your payment method for {displayName}</p>
                            </div>
                            <div className="text-left sm:text-right">
                              <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Amount Payable</span>
                              <span className="text-xl font-black text-[#0F172A] font-mono">
                                ₹{chg.amount.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>

                          {/* 3 PAYMENT METHODS ONLY */}
                          <div className="space-y-3">
                            <span className="text-xs font-bold text-[#0F2A5F] uppercase tracking-wider block px-1">
                              Select Payment Method
                            </span>

                            {/* Method 1: UPI */}
                            {upiActive && (
                              <div
                                onClick={() => handleSelectMethod(chg.id, 'UPI')}
                                className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all bg-white shadow-xs ${
                                  method === 'UPI'
                                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20 bg-[#F7FAFF]'
                                    : 'border-[#D6E4F5] hover:border-[#CBDDE9]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3.5">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                      method === 'UPI' ? 'bg-[#2563EB] border-[#2563EB]' : 'border-2 border-[#CBD5E1] bg-white'
                                    }`}>
                                      {method === 'UPI' && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-bold text-[#0F172A] flex items-center space-x-2">
                                        <span>UPI</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5]">
                                          Recommended
                                        </span>
                                      </div>
                                      <div className="text-xs text-[#64748B] mt-0.5">Pay using any supported UPI app</div>
                                    </div>
                                  </div>
                                  <div>
                                    {method === 'UPI' ? (
                                      <ChevronDown className="w-5 h-5 text-[#2563EB]" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                                    )}
                                  </div>
                                </div>

                                {method === 'UPI' && (
                                  <div className="mt-4 pt-4 border-t border-[#D6E4F5] space-y-4 text-xs">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#D6E4F5]">
                                      <span className="text-[#64748B] font-medium">Authoritative UPI ID:</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(options?.upi?.primaryUpiId || 'pay@bank', 'upi');
                                        }}
                                        className="flex items-center space-x-1.5 text-[#2563EB] font-mono font-bold hover:underline"
                                      >
                                        <span>{options?.upi?.primaryUpiId || 'pay@bank'}</span>
                                        {copied === 'upi' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                                      </button>
                                    </div>

                                    {/* Action Button: Triggers UPI Intent + 2.5s delay */}
                                    <div className="p-4 rounded-2xl bg-[#EFF6FF] border border-[#D6E4F5] flex flex-col items-center gap-3 text-center">
                                      <Button
                                        type="button"
                                        disabled={isInitiating}
                                        aria-label="Pay with UPI (Pay Using UPI)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInitiatePaymentAction(chg);
                                        }}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-11 px-6 rounded-xl shadow-md transition cursor-pointer disabled:opacity-60"
                                      >
                                        {isInitiating ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Initiating Payment...</span>
                                          </>
                                        ) : (
                                          <>
                                            <ExternalLink className="w-4 h-4" />
                                            <span>Pay with UPI</span>
                                          </>
                                        )}
                                      </Button>
                                      <p className="text-[11px] text-[#64748B]">
                                        On mobile devices: Opens native UPI app chooser. On desktop: Scan QR code or copy UPI ID.
                                      </p>
                                    </div>

                                    {/* QR Code */}
                                    <div className="text-center space-y-2 pt-1">
                                      <div className="w-40 h-40 mx-auto p-3 rounded-2xl bg-white flex items-center justify-center shadow-md border border-[#D6E4F5]">
                                        <img
                                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=upi://pay?pa=${options?.upi?.primaryUpiId || 'pay@bank'}&am=${chg.amount}&pn=${encodeURIComponent(branding.appName)}`}
                                          alt="Scan UPI QR"
                                          className="w-full h-full object-contain"
                                        />
                                      </div>
                                      <p className="text-[11px] text-[#64748B]">
                                        Scan using any UPI app to transfer exactly <strong>₹{chg.amount.toLocaleString('en-IN')}</strong>.
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Method 2: Bank Transfer */}
                            {bankActive && (
                              <div
                                onClick={() => handleSelectMethod(chg.id, 'BANK')}
                                className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all bg-white shadow-xs ${
                                  method === 'BANK'
                                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20 bg-[#F7FAFF]'
                                    : 'border-[#D6E4F5] hover:border-[#CBDDE9]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3.5">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                      method === 'BANK' ? 'bg-[#2563EB] border-[#2563EB]' : 'border-2 border-[#CBD5E1] bg-white'
                                    }`}>
                                      {method === 'BANK' && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-bold text-[#0F172A] flex items-center space-x-2">
                                        <Landmark className="w-4 h-4 text-[#2563EB]" />
                                        <span>Bank Transfer</span>
                                      </div>
                                      <div className="text-xs text-[#64748B] mt-0.5">Pay directly from your bank account</div>
                                    </div>
                                  </div>
                                  <div>
                                    {method === 'BANK' ? (
                                      <ChevronDown className="w-5 h-5 text-[#2563EB]" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                                    )}
                                  </div>
                                </div>

                                {method === 'BANK' && options?.bank && (
                                  <div className="mt-4 pt-4 border-t border-[#D6E4F5] space-y-2.5 text-xs">
                                    <div className="flex justify-between items-center text-[#64748B]">
                                      <span>Bank Name:</span>
                                      <span className="font-bold text-[#0F172A]">{options.bank.bankName}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[#64748B]">
                                      <span>Account Holder:</span>
                                      <span className="font-bold text-[#0F172A]">{options.bank.accountHolder}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[#64748B]">
                                      <span>Account Number:</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(options.bank.accountNumber, 'acc');
                                        }}
                                        className="flex items-center space-x-1.5 text-[#2563EB] font-mono font-bold hover:underline"
                                      >
                                        <span>{options.bank.accountNumber}</span>
                                        {copied === 'acc' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                                      </button>
                                    </div>
                                    <div className="flex justify-between items-center text-[#64748B]">
                                      <span>IFSC Code:</span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(options.bank.ifsc, 'ifsc');
                                        }}
                                        className="flex items-center space-x-1.5 text-[#2563EB] font-mono font-bold hover:underline"
                                      >
                                        <span>{options.bank.ifsc}</span>
                                        {copied === 'ifsc' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                                      </button>
                                    </div>

                                    <div className="pt-2">
                                      <Button
                                        type="button"
                                        disabled={isInitiating}
                                        aria-label="Pay with Bank Transfer (Pay Using Bank Transfer)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInitiatePaymentAction(chg);
                                        }}
                                        className="w-full sm:w-auto h-11 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
                                      >
                                        {isInitiating ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Initiating Payment...</span>
                                          </>
                                        ) : (
                                          <>
                                            <Landmark className="w-4 h-4" />
                                            <span>Pay with Bank Transfer</span>
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Method 3: Payment Link */}
                            {linksActive && (
                              <div
                                onClick={() => handleSelectMethod(chg.id, 'LINK')}
                                className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all bg-white shadow-xs ${
                                  method === 'LINK'
                                    ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20 bg-[#F7FAFF]'
                                    : 'border-[#D6E4F5] hover:border-[#CBDDE9]'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3.5">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                                      method === 'LINK' ? 'bg-[#2563EB] border-[#2563EB]' : 'border-2 border-[#CBD5E1] bg-white'
                                    }`}>
                                      {method === 'LINK' && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <div>
                                      <div className="text-sm font-bold text-[#0F172A] flex items-center space-x-2">
                                        <ExternalLink className="w-4 h-4 text-[#2563EB]" />
                                        <span>Payment Link</span>
                                      </div>
                                      <div className="text-xs text-[#64748B] mt-0.5">Pay securely using the official payment link</div>
                                    </div>
                                  </div>
                                  <div>
                                    {method === 'LINK' ? (
                                      <ChevronDown className="w-5 h-5 text-[#2563EB]" />
                                    ) : (
                                      <ChevronRight className="w-5 h-5 text-[#94A3B8]" />
                                    )}
                                  </div>
                                </div>

                                {method === 'LINK' && options?.paymentLinks && (
                                  <div className="mt-4 pt-4 border-t border-[#D6E4F5] space-y-3 text-xs">
                                    {options.paymentLinks.map((link) => (
                                      <div key={link.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#D6E4F5]">
                                        <span className="font-semibold text-[#0F172A]">{link.title}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(link.url, 'link');
                                          }}
                                          className="flex items-center space-x-1.5 text-[#2563EB] font-bold hover:underline"
                                        >
                                          <span>Copy Link</span>
                                          {copied === 'link' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                      </div>
                                    ))}

                                    <div className="pt-1">
                                      <Button
                                        type="button"
                                        disabled={isInitiating}
                                        aria-label="Pay with Payment Link (Pay Using Payment Link)"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleInitiatePaymentAction(chg);
                                        }}
                                        className="w-full sm:w-auto h-11 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-2 cursor-pointer transition disabled:opacity-60"
                                      >
                                        {isInitiating ? (
                                          <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Initiating Payment...</span>
                                          </>
                                        ) : (
                                          <>
                                            <ExternalLink className="w-4 h-4" />
                                            <span>Pay with Payment Link</span>
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* INITIATING PAYMENT LOADING BANNER (During 2-4s delay) */}
                          {isInitiating && (
                            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-xs text-[#2563EB] animate-pulse">
                              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                              <span className="font-semibold">
                                Initiating payment & launching payment rail... Please wait 2-3 seconds.
                              </span>
                            </div>
                          )}

                          {/* REVEALED UTR SUBMISSION SECTION (Only AFTER 1.5s delay) */}
                          {showUtr && !isInitiating && (
                            <div id={`utr-section-${chg.id}`} className="p-6 rounded-3xl bg-[#F7FAFF] border-2 border-[#2563EB]/40 shadow-xs space-y-4 animate-in fade-in duration-300">
                              <div className="border-b border-[#D6E4F5] pb-3">
                                <span className="text-[10px] font-bold text-[#16A34A] uppercase tracking-wider block mb-1">
                                  ✓ PAYMENT INITIATED
                                </span>
                                <h3 className="text-base sm:text-lg font-black text-[#0F2A5F]">
                                  {displayName.toUpperCase()} PAYMENT VERIFICATION
                                </h3>
                                <p className="text-xs text-[#64748B] mt-0.5">
                                  Enter the 12-digit UTR / Transaction Reference Number from your payment receipt for <strong>{displayName}</strong> (₹{chg.amount.toLocaleString('en-IN')}).
                                </p>
                              </div>

                              <form onSubmit={(e) => handleSubmitUtrForCharge(chg, e)} className="space-y-4">
                                <div className="space-y-1.5">
                                  <label htmlFor={`utr-input-${chg.id}`} className="block text-[11px] font-bold text-[#0F172A] uppercase tracking-wider">
                                    Enter UTR / Transaction Reference *
                                  </label>
                                  <Input
                                    id={`utr-input-${chg.id}`}
                                    value={utrValueMap[chg.id] || ''}
                                    onChange={(e) => setUtrValueMap((prev) => ({ ...prev, [chg.id]: e.target.value }))}
                                    placeholder="e.g. 428910482910"
                                    className="bg-white border-[#D6E4F5] text-[#0F172A] font-mono text-base h-12 rounded-xl focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/10"
                                    required
                                  />
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                                  <Button
                                    type="submit"
                                    disabled={submittingChargeId === chg.id || !(utrValueMap[chg.id] || '').trim()}
                                    className="flex-1 h-12 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2 transition active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                                  >
                                    {submittingChargeId === chg.id ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Submitting UTR...</span>
                                      </>
                                    ) : (
                                      <>
                                        <span>Submit UTR</span>
                                        <ArrowRight className="w-4 h-4" />
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </form>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* STAGE 3 CALLOUT: KYC Charge Paid, Loan Documents Pending Upload */}
            {pendingCharges.length === 0 && paidCharges.length > 0 && !customerCharges.some((c: any) => c.name.toLowerCase().includes('processing')) && (
              <Card className="bg-[#F0FDF4] border-emerald-200 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-[#16A34A] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-950">Your KYC verification is complete!</h3>
                    <p className="text-xs text-emerald-800 mt-1">
                      Please upload your loan application documents (PAN Card, etc.) to proceed with processing.
                    </p>
                  </div>
                </div>
                <Link to="/customer/documents">
                  <Button className="bg-[#16A34A] hover:bg-emerald-700 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-xs shrink-0 flex items-center gap-1.5">
                    <span>Upload Loan Documents</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </Card>
            )}

            {/* STAGE 5 CALLOUT: All Charges Settled */}
            {pendingCharges.length === 0 && paidCharges.length > 0 && customerCharges.some((c: any) => c.name.toLowerCase().includes('processing')) && (
              <Card className="bg-[#F0FDF4] border-emerald-200 rounded-3xl p-6 text-center space-y-2">
                <div className="inline-flex p-3 rounded-full bg-emerald-100 text-[#16A34A] mb-1">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-emerald-950">All Application Charges Settled</h3>
                <p className="text-xs text-emerald-800 max-w-lg mx-auto">
                  All required application fees have been settled and verified. Your loan application is now queued for underwriting appraisal and sanction.
                </p>
              </Card>
            )}

            {/* 2. PAID CHARGES & TAX INVOICES */}
            {paidCharges.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-[#0F2A5F] uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#16A34A]" />
                    <span>PAID PAYMENTS ({paidCharges.length})</span>
                  </h3>
                  <span className="text-xs text-[#64748B]">1 Charge = 1 Verified Invoice</span>
                </div>
                {paidCharges.map((chg: any) => {
                  const displayName = normalizeChargeName(chg.name);

                  return (
                    <div
                      key={chg.id}
                      className="p-5 sm:p-6 rounded-3xl border border-emerald-200 bg-emerald-50/20 shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base font-bold text-[#0F172A]">{displayName}</span>
                            <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-xs font-bold px-2.5 py-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-[#16A34A]" /> Paid ✓
                            </Badge>
                          </div>
                          <p className="text-xs text-[#64748B]">
                            {chg.remark || 'Application Fee'}
                          </p>
                        </div>

                        <div className="flex items-center sm:text-right justify-between sm:justify-end gap-3">
                          <span className="text-xl font-black text-[#0F172A] font-mono">
                            ₹{chg.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                          <span>Settled: <strong>{new Date(chg.paidAt || chg.updatedAt).toLocaleDateString('en-IN')}</strong></span>
                          {chg.transactionRef && (
                            <>
                              <span>•</span>
                              <span className="font-mono">UTR: <strong>{chg.transactionRef}</strong></span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewInvoice(chg)}
                            className="border-[#D6E4F5] bg-white text-[#0F172A] hover:bg-[#F7FAFF] text-xs h-9 px-3 rounded-xl font-semibold shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-[#2563EB]" /> View Invoice
                          </Button>

                          {downloadErrorChargeId === chg.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-[#DC2626] font-medium">Unable to download invoice</span>
                              <Button
                                size="sm"
                                onClick={() => handleDownloadInvoice(chg)}
                                className="bg-red-50 text-[#DC2626] hover:bg-red-100 text-xs h-9 px-2.5 rounded-xl border border-red-200"
                              >
                                Try Again
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              disabled={downloadingChargeId === chg.id}
                              onClick={() => handleDownloadInvoice(chg)}
                              className="bg-[#16A34A] hover:bg-emerald-700 text-white font-bold text-xs h-9 px-3.5 rounded-xl shadow-xs flex items-center gap-1.5 transition"
                            >
                              {downloadingChargeId === chg.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Downloading...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download Invoice PDF</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Trust Badges */}
      <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        <div className="p-4 rounded-2xl bg-white border border-[#D6E4F5] shadow-xs flex items-center justify-center gap-2.5">
          <Lock className="w-4 h-4 text-[#16A34A]" />
          <span className="text-xs font-bold text-[#0F172A]">Encrypted 256-Bit SSL</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E4F5] shadow-xs flex items-center justify-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
          <span className="text-xs font-bold text-[#0F172A]">100% Verified Rails</span>
        </div>
        <div className="p-4 rounded-2xl bg-white border border-[#D6E4F5] shadow-xs flex items-center justify-center gap-2.5">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <span className="text-xs font-bold text-[#0F172A]">Authoritative Invoicing</span>
        </div>
      </div>

      {/* INVOICE PREVIEW — native in-app Blob rendering, no IDM interception */}
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
    </div>
  );
};

export default CustomerPaymentPage;

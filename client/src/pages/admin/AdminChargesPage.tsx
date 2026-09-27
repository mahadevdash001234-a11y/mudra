import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Percent,
  ShieldCheck,
  Briefcase,
  ChevronDown,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Download,
  Eye,
  RefreshCw,
  Search,
  AlertCircle,
  X,
  ExternalLink,
  Users
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { SpecificChargesSection } from '@/components/admin/SpecificChargesSection';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';

type ChargeTypeKey = 'INTEREST_RATE' | 'KYC_CHARGES' | 'PROCESSING_FEE' | 'LOAN_DOC_FEE';

interface ConfigData {
  interestRate: number;
  interestFrequency: string;
  kycCharges: number;
  processingFee: number;
  loanDocFeeEnabled?: boolean;
  loanDocFeeAmount?: number;
  chargeAmount?: number;
}

interface FeeRecord {
  id: string;
  type: 'KYC_CHARGES' | 'PROCESSING_FEE';
  label: string;
  amount: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  transactionRef: string;
  paymentDate: string | null;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  applicationNumber: string;
  loanAccountNumber: string;
  isInvoiceAvailable: boolean;
}

interface RecordsResponse {
  data: FeeRecord[];
  meta: {
    total: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
  };
}

export const AdminChargesPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Selected charge type for configuration
  const [selectedType, setSelectedType] = useState<ChargeTypeKey>('INTEREST_RATE');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form input state
  const [interestInput, setInterestInput] = useState<string>('12.00');
  const [frequencyInput] = useState<string>('Per Annum');
  const [kycInput, setKycInput] = useState<string>('499');
  const [processingInput, setProcessingInput] = useState<string>('1999');
  const [loanDocFeeEnabled, setLoanDocFeeEnabled] = useState<boolean>(false);
  const [loanDocFeeAmountInput, setLoanDocFeeAmountInput] = useState<string>('999');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Records filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'PENDING' | 'FAILED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'KYC_CHARGES' | 'PROCESSING_FEE'>('ALL');

  // Action dropdown state for individual table rows
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);

  // Invoice viewer — uses react-pdf canvas renderer via PdfViewerModal
  const invoicePdfViewer = usePdfViewer();
  const [invoiceModalRecord, setInvoiceModalRecord] = useState<FeeRecord | null>(null);
  const [loadingInvoiceId, setLoadingInvoiceId] = useState<string | null>(null);

  // Customer selection for Section B: Customer Specific Charges
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerSearchText, setCustomerSearchText] = useState<string>('');

  const { data: customersResponse } = useQuery({
    queryKey: ['adminCustomersForCharges'],
    queryFn: async () => {
      const res: any = await api.get(API_ENDPOINTS.CUSTOMERS.LIST, { params: { limit: 50 } });
      return res.data?.data || res.data || [];
    },
  });

  const rawCustomers: any[] = Array.isArray(customersResponse)
    ? customersResponse
    : (customersResponse?.data || []);

  const customersList: Array<{
    id: string;
    fullName: string;
    mobile: string;
    email: string;
    loans?: Array<{
      id: string;
      applicationNumber: string;
      requestedAmount?: number;
      approvedAmount?: number;
      status: string;
    }>;
    latestLoan?: { id: string; applicationNumber: string };
  }> = rawCustomers.map((cust) => {
    const loansList = cust.loans || [];
    const latest = loansList[0] || null;
    return {
      ...cust,
      loans: loansList,
      latestLoan: latest ? { id: latest.id, applicationNumber: latest.applicationNumber } : undefined,
    };
  });

  const filteredCustomers = customersList.filter(
    (c) =>
      c.fullName?.toLowerCase().includes(customerSearchText.toLowerCase()) ||
      c.mobile?.includes(customerSearchText)
  );

  const selectedCustomer = customersList.find((c) => c.id === selectedCustomerId);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      // Check if click was outside any row action menu
      const target = event.target as HTMLElement;
      if (!target.closest('.row-action-menu-container')) {
        setOpenRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch Config
  const { data: config, isLoading: isConfigLoading, refetch: refetchConfig } = useQuery<ConfigData>({
    queryKey: ['chargesConfig'],
    queryFn: async () => {
      const res = await api.get(API_ENDPOINTS.CHARGES.CONFIG);
      return res.data?.data || res.data;
    },
  });

  // Sync inputs when config arrives
  useEffect(() => {
    if (config) {
      if (config.interestRate !== undefined) setInterestInput(String(config.interestRate));
      if (config.kycCharges !== undefined) setKycInput(String(config.kycCharges));
      if (config.processingFee !== undefined) setProcessingInput(String(config.processingFee));
      if (config.loanDocFeeEnabled !== undefined) setLoanDocFeeEnabled(Boolean(config.loanDocFeeEnabled));
      if (config.loanDocFeeAmount !== undefined) setLoanDocFeeAmountInput(String(config.loanDocFeeAmount));
    }
  }, [config]);

  // Fetch Fee Payment Records
  const { data: recordsData, isLoading: isRecordsLoading, refetch: refetchRecords } = useQuery<RecordsResponse>({
    queryKey: ['chargesRecords', typeFilter, statusFilter, searchQuery],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (typeFilter !== 'ALL') params.type = typeFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const res = await api.get(API_ENDPOINTS.CHARGES.RECORDS, { params });
      return res.data || { data: [], meta: { total: 0, paidCount: 0, pendingCount: 0, failedCount: 0 } };
    },
  });

  // Update Config Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: {
      chargeType: ChargeTypeKey;
      amount?: number;
      frequency?: string;
      loanDocFeeEnabled?: boolean;
      loanDocFeeAmount?: number;
      enabled?: boolean;
    }) => {
      return api.patch(API_ENDPOINTS.CHARGES.CONFIG, payload);
    },
    onSuccess: (_, variables) => {
      const label =
        variables.chargeType === 'INTEREST_RATE'
          ? 'Interest Rate'
          : variables.chargeType === 'KYC_CHARGES'
          ? 'KYC Charges'
          : variables.chargeType === 'LOAN_DOC_FEE'
          ? 'Loan Document Upload Fee'
          : 'Processing Fee';
      setStatusMessage({ type: 'success', text: `${label} updated and applied to the system successfully!` });
      queryClient.invalidateQueries({ queryKey: ['chargesConfig'] });
      refetchConfig();
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (err: any) => {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to update configuration.' });
    },
  });

  const handleSaveInterest = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(interestInput);
    if (isNaN(val) || val < 0 || val > 100) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid interest rate between 0% and 100%.' });
      return;
    }
    updateMutation.mutate({ chargeType: 'INTEREST_RATE', amount: val, frequency: frequencyInput });
  };

  const handleSaveKyc = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(kycInput);
    if (isNaN(val) || val < 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid amount for KYC Charges.' });
      return;
    }
    updateMutation.mutate({ chargeType: 'KYC_CHARGES', amount: val });
  };

  const handleSaveProcessing = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(processingInput);
    if (isNaN(val) || val < 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid amount for Processing Fee.' });
      return;
    }
    updateMutation.mutate({ chargeType: 'PROCESSING_FEE', amount: val });
  };

  const handleSaveLoanDocFee = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(loanDocFeeAmountInput);
    if (isNaN(val) || val < 0) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid amount for Loan Document Upload Fee.' });
      return;
    }
    updateMutation.mutate({
      chargeType: 'LOAN_DOC_FEE',
      loanDocFeeEnabled,
      loanDocFeeAmount: val,
      amount: val,
      enabled: loanDocFeeEnabled,
    });
  };

  // Invoice Handlers
  const handleViewInvoice = async (record: FeeRecord) => {
    if (!record.isInvoiceAvailable) {
      alert('Invoice is only available for completed and verified payments (PAID / SUCCESS).');
      return;
    }
    try {
      setLoadingInvoiceId(record.id);
      setOpenRowMenuId(null);
      setInvoiceModalRecord(record);
      await invoicePdfViewer.fetchAndOpen(API_ENDPOINTS.CHARGES.INVOICE(record.id, false));
    } catch (err: any) {
      alert(err?.message || 'Failed to generate invoice preview.');
    } finally {
      setLoadingInvoiceId(null);
    }
  };

  const handleDownloadInvoice = async (record: FeeRecord) => {
    if (!record.isInvoiceAvailable) {
      alert('Invoice is only available for completed and verified payments (PAID / SUCCESS).');
      return;
    }
    try {
      setOpenRowMenuId(null);
      const res: any = await api.get(API_ENDPOINTS.CHARGES.INVOICE(record.id, true), { responseType: 'arraybuffer' });
      const blob = res.data instanceof ArrayBuffer ? new Blob([res.data], { type: 'application/pdf' }) : new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice_${record.applicationNumber || record.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err: any) {
      alert(err?.message || 'Failed to download invoice PDF.');
    }
  };

  const chargeOptions: { key: ChargeTypeKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: 'INTEREST_RATE', label: 'Interest Rate', icon: Percent },
    { key: 'KYC_CHARGES', label: 'KYC Charges', icon: ShieldCheck },
    { key: 'PROCESSING_FEE', label: 'Processing Fee', icon: Briefcase },
    { key: 'LOAN_DOC_FEE', label: 'Loan Document Upload Fee (Before Loan)', icon: FileText },
  ];

  const currentOption = chargeOptions.find((opt) => opt.key === selectedType) || chargeOptions[0];
  const records = recordsData?.data || [];
  const meta = recordsData?.meta || { total: 0, paidCount: 0, pendingCount: 0, failedCount: 0 };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center space-x-2 text-xs text-text-secondary">
        <Link to="/admin/dashboard" className="hover:text-text-primary transition">Dashboard</Link>
        <span>›</span>
        <span className="text-text-secondary">Payments</span>
        <span>›</span>
        <span className="text-text-primary font-semibold">Charges & Fees</span>
      </div>

      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
            Charges & Fees Management
          </h1>
          <p className="text-xs text-text-secondary">
            Configure default interest rate, KYC verification charges, loan processing fees, and before-loan document fees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              refetchConfig();
              refetchRecords();
            }}
            className="border-border bg-surface/80 hover:bg-surface-elevated text-text-secondary text-xs h-9 rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
            statusMessage.type === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          <div className="flex items-center space-x-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-text-secondary hover:text-text-primary p-1 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Charge Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Interest Rate Card */}
        <div
          onClick={() => setSelectedType('INTEREST_RATE')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 ${
            selectedType === 'INTEREST_RATE'
              ? 'bg-primary text-background/15 border-primary/50 shadow-lg shadow-blue-500/10 ring-1 ring-blue-500/30'
              : 'bg-surface border-border hover:border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">1. Interest Rate</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-primary flex items-center justify-center">
              <Percent className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-text-primary">
            {isConfigLoading ? '...' : `${Number(config?.interestRate ?? 12).toFixed(2)}%`}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">Per Annum (Annual Default)</div>
        </div>

        {/* KYC Charges Card */}
        <div
          onClick={() => setSelectedType('KYC_CHARGES')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 ${
            selectedType === 'KYC_CHARGES'
              ? 'bg-success text-background/15 border-success/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'bg-surface border-border hover:border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">2. KYC Charges</span>
            <div className="w-7 h-7 rounded-lg bg-success/20 text-success flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-text-primary">
            {isConfigLoading ? '...' : `₹${Number(config?.kycCharges ?? 499).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">One-time Identity Verification</div>
        </div>

        {/* Processing Fee Card */}
        <div
          onClick={() => setSelectedType('PROCESSING_FEE')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 ${
            selectedType === 'PROCESSING_FEE'
              ? 'bg-warning text-background/15 border-warning/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
              : 'bg-surface border-border hover:border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">3. Processing Fee</span>
            <div className="w-7 h-7 rounded-lg bg-warning/20 text-warning flex items-center justify-center">
              <Briefcase className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-text-primary">
            {isConfigLoading ? '...' : `₹${Number(config?.processingFee ?? 1999).toLocaleString('en-IN')}`}
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">Standard Loan Processing Fee</div>
        </div>

        {/* Loan Document Upload Fee Card (Before Loan Charge) */}
        <div
          onClick={() => setSelectedType('LOAN_DOC_FEE')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all duration-200 ${
            selectedType === 'LOAN_DOC_FEE'
              ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500/30'
              : 'bg-surface border-border hover:border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">4. Doc Upload Fee</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-600 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-black text-text-primary">
              {isConfigLoading ? '...' : `₹${Number(config?.loanDocFeeAmount ?? 999).toLocaleString('en-IN')}`}
            </div>
            <Badge className={config?.loanDocFeeEnabled ? 'bg-emerald-600 text-white text-[10px] font-bold' : 'bg-slate-200 text-slate-700 text-[10px] font-bold'}>
              {config?.loanDocFeeEnabled ? 'ON' : 'OFF'}
            </Badge>
          </div>
          <div className="text-[11px] text-text-secondary mt-0.5">Before Loan Document Charge</div>
        </div>
      </div>

      {/* Main Configuration Card with Single Scrollable Charge Type Select */}
      <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-visible">
        <CardHeader className="p-5 border-b border-border">
          <CardTitle className="text-base text-text-primary">Configure Charge / Fee</CardTitle>
          <CardDescription className="text-xs text-text-secondary">
            Select a charge type from the scrollable dropdown to view and update its system configuration.
          </CardDescription>
        </CardHeader>

        <div className="p-5 space-y-6">
          {/* SINGLE SCROLLABLE CHARGE TYPE SELECT */}
          <div className="max-w-md relative" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              Charge Type <span className="text-primary">*</span>
            </label>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between bg-surface-elevated border border-border hover:border-border text-text-primary rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
            >
              <div className="flex items-center gap-2.5">
                <currentOption.icon className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{currentOption.label}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Scrollable Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute z-30 mt-1.5 w-full bg-surface-elevated border border-border rounded-xl shadow-2xl overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-800/60 scrollbar-thin scrollbar-thumb-slate-800">
                  {chargeOptions.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = opt.key === selectedType;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setSelectedType(opt.key);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 text-xs text-left transition ${
                          isSelected
                            ? 'bg-primary text-background/20 text-primary font-bold'
                            : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-text-secondary'}`} />
                          <span>{opt.label}</span>
                        </div>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Form View 1: Interest Rate */}
          {selectedType === 'INTEREST_RATE' && (
            <form onSubmit={handleSaveInterest} className="p-4 bg-surface-elevated/60 rounded-xl border border-border space-y-4 max-w-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-primary">
                <Percent className="w-4 h-4" />
                <span>Default Annual Interest Rate</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                    Interest Rate (%)
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      placeholder="12.00"
                      className="bg-surface border-border text-text-primary text-xs h-9 rounded-lg pr-8 font-mono"
                      required
                    />
                    <span className="absolute right-2.5 top-2 text-xs font-bold text-text-secondary">%</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                    Frequency
                  </label>
                  <Input
                    type="text"
                    value={frequencyInput}
                    disabled
                    className="bg-surface/50 border-border/60 text-text-secondary text-xs h-9 rounded-lg font-medium cursor-not-allowed"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                This rate is applied by default during loan sanctioning, underwriting, and monthly EMI schedule generation.
              </p>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-primary text-background hover:bg-secondary text-text-primary font-bold text-xs h-9 px-4 rounded-xl"
                >
                  {updateMutation.isPending ? 'Updating...' : 'Update Interest Rate'}
                </Button>
              </div>
            </form>
          )}

          {/* Form View 2: KYC Charges */}
          {selectedType === 'KYC_CHARGES' && (
            <form onSubmit={handleSaveKyc} className="p-4 bg-surface-elevated/60 rounded-xl border border-border space-y-4 max-w-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-success">
                <ShieldCheck className="w-4 h-4" />
                <span>KYC Verification Charge</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                  KYC Charge Amount (₹)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-2 text-xs font-bold text-text-secondary">₹</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={kycInput}
                    onChange={(e) => setKycInput(e.target.value)}
                    placeholder="499"
                    className="bg-surface border-border text-text-primary text-xs h-9 rounded-lg pl-7 font-mono"
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Mandatory one-time identity and document verification charge charged to customers during application processing.
              </p>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-success text-background hover:brightness-110 text-text-primary font-bold text-xs h-9 px-4 rounded-xl"
                >
                  {updateMutation.isPending ? 'Updating...' : 'Update KYC Charges'}
                </Button>
              </div>
            </form>
          )}

          {/* Form View 3: Processing Fee */}
          {selectedType === 'PROCESSING_FEE' && (
            <form onSubmit={handleSaveProcessing} className="p-4 bg-surface-elevated/60 rounded-xl border border-border space-y-4 max-w-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-warning">
                <Briefcase className="w-4 h-4" />
                <span>Standard Loan Processing Fee</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                  Processing Fee Amount (₹)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-2 text-xs font-bold text-text-secondary">₹</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={processingInput}
                    onChange={(e) => setProcessingInput(e.target.value)}
                    placeholder="1999"
                    className="bg-surface border-border text-text-primary text-xs h-9 rounded-lg pl-7 font-mono"
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Standard processing and administrative fee charged prior to loan agreement signing and fund disbursement.
              </p>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-warning text-background hover:brightness-110 text-text-primary font-bold text-xs h-9 px-4 rounded-xl"
                >
                  {updateMutation.isPending ? 'Updating...' : 'Update Processing Fee'}
                </Button>
              </div>
            </form>
          )}

          {/* Form View 4: Loan Document Upload Fee (Before Loan Charge) */}
          {selectedType === 'LOAN_DOC_FEE' && (
            <form onSubmit={handleSaveLoanDocFee} className="p-4 bg-surface-elevated/60 rounded-xl border border-border space-y-4 max-w-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-600">
                <FileText className="w-4 h-4" />
                <span>Before Loan: Loan Document Upload Fee</span>
              </div>

              {/* Status Toggle ON / OFF */}
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1.5">
                  Fee Status (OFF / ON)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setLoanDocFeeEnabled(!loanDocFeeEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      loanDocFeeEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        loanDocFeeEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-bold ${loanDocFeeEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {loanDocFeeEnabled ? 'ENABLED (ON) — Fee is mandatory before loan underwriting' : 'DISABLED (OFF) — Fee is completely hidden'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">
                  Fee Amount (₹)
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-2 text-xs font-bold text-text-secondary">₹</span>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={loanDocFeeAmountInput}
                    onChange={(e) => setLoanDocFeeAmountInput(e.target.value)}
                    placeholder="999"
                    className="bg-surface border-border text-text-primary text-xs h-9 rounded-lg pl-7 font-mono"
                    required
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                When <strong>ON</strong>, customer is charged this fee strictly <em>after</em> uploading required loan documents and <em>before</em> underwriting approval. When <strong>OFF</strong>, this charge is completely hidden from the customer journey.
              </p>
              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs"
                >
                  {updateMutation.isPending ? 'Updating...' : 'Save Document Fee Settings'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* ── SECTION B: CUSTOMER-SPECIFIC CHARGES (CUSTOMER 360 INTEGRATION) ── */}
      <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-visible">
        <CardHeader className="p-5 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base text-text-primary">Customer-Specific Charges (Individual Stage Control)</CardTitle>
                <Badge variant="outline" className="text-[10px] text-text-secondary border-border">
                  7 Independent Fee Types
                </Badge>
              </div>
              <CardDescription className="text-xs text-text-secondary mt-0.5">
                Select a customer to activate and manage their 7 specific charges individually (Processing Fee, GST, Stamp Duty, TDS, Insurance, Late Fee, Payment Fee).
              </CardDescription>
            </div>

            {/* Customer Search / Selector */}
            <div className="flex items-center gap-2.5">
              <div className="relative min-w-[240px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-text-secondary" />
                <Input
                  type="text"
                  placeholder="Search customer by name or phone..."
                  value={customerSearchText}
                  onChange={(e) => setCustomerSearchText(e.target.value)}
                  className="bg-surface-elevated border-border text-text-primary text-xs h-9 pl-9 rounded-xl"
                />
              </div>

              {selectedCustomer && (
                <Link to={`/admin/customers/${selectedCustomer.id}`} target="_blank">
                  <Button size="sm" variant="outline" className="border-border text-xs h-9 px-3 rounded-xl flex items-center gap-1">
                    <span>Customer 360</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Search suggestions if typing */}
          {customerSearchText.trim() && filteredCustomers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-border">
              {filteredCustomers.slice(0, 6).map((cust) => (
                <button
                  key={cust.id}
                  onClick={() => {
                    setSelectedCustomerId(cust.id);
                    setCustomerSearchText('');
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                    selectedCustomerId === cust.id
                      ? 'bg-primary text-background/20 border-primary text-primary font-bold'
                      : 'bg-surface-elevated border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {cust.fullName} ({cust.mobile})
                </button>
              ))}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-5">
          {selectedCustomer ? (
            <SpecificChargesSection
              customerId={selectedCustomer.id}
              customerName={selectedCustomer.fullName}
              applicationId={selectedCustomer.latestLoan?.applicationNumber}
              loanId={selectedCustomer.latestLoan?.id}
              loans={selectedCustomer.loans}
            />
          ) : (
            <div className="p-8 text-center space-y-3 bg-surface-elevated/40 rounded-xl border border-dashed border-border">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-primary flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-text-primary">Select a Customer to Manage Charges</p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  Search by borrower name or mobile number above, or choose from active borrowers below.
                </p>
              </div>
              {customersList.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-xl mx-auto">
                  {customersList.slice(0, 6).map((cust) => (
                    <button
                      key={cust.id}
                      onClick={() => setSelectedCustomerId(cust.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-surface-elevated hover:bg-slate-700 border border-border text-text-primary transition font-medium"
                    >
                      {cust.fullName} • {cust.mobile}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fee Payment Records & Invoices Table */}
      <Card className="bg-surface border-border rounded-2xl shadow-xl overflow-visible">
        <CardHeader className="p-5 border-b border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base text-text-primary">Fee Payments & Invoices</CardTitle>
              <CardDescription className="text-xs text-text-secondary">
                Track KYC charges and processing fee collections across all loan applications with verifiable PDF invoices.
              </CardDescription>
            </div>

            {/* Filters Strip */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-text-secondary" />
                <Input
                  type="text"
                  placeholder="Search customer, UTR, ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-surface-elevated border-border text-text-primary text-xs h-8 pl-8 rounded-lg"
                />
              </div>

              {/* Charge Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1 text-xs text-text-primary h-8"
              >
                <option value="ALL">All Charge Types</option>
                <option value="KYC_CHARGES">KYC Charges</option>
                <option value="PROCESSING_FEE">Processing Fee</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-surface-elevated border border-border rounded-lg px-2.5 py-1 text-xs text-text-primary h-8"
              >
                <option value="ALL">All Statuses ({meta.total})</option>
                <option value="PAID">Paid ({meta.paidCount})</option>
                <option value="PENDING">Pending ({meta.pendingCount})</option>
                <option value="FAILED">Failed ({meta.failedCount})</option>
              </select>
            </div>
          </div>
        </CardHeader>

        {/* Records Table */}
        <div className="overflow-x-auto min-h-[220px]">
          <table className="w-full text-left text-xs text-text-secondary">
            <thead className="bg-surface-elevated/60 text-[11px] uppercase tracking-wider text-text-secondary font-semibold border-b border-border">
              <tr>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Application ID</th>
                <th className="py-3 px-4">Mobile</th>
                <th className="py-3 px-4">Charge Type</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">UTR / Ref</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {isRecordsLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-text-secondary">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-text-secondary" />
                    Loading charge payment records...
                  </td>
                </tr>
              ) : records.length > 0 ? (
                records.map((record) => {
                  const isMenuOpen = openRowMenuId === record.id;
                  return (
                    <tr key={record.id} className="hover:bg-surface-elevated/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-text-primary">{record.customerName}</div>
                        <div className="text-[10px] text-text-secondary">{record.customerEmail}</div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-text-secondary">
                        {record.applicationNumber || '—'}
                      </td>
                      <td className="py-3 px-4 text-text-secondary">
                        {record.customerMobile || '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                            record.type === 'KYC_CHARGES'
                              ? 'bg-success/10 text-success border border-success/20'
                              : 'bg-warning/10 text-warning border border-warning/20'
                          }`}
                        >
                          {record.type === 'KYC_CHARGES' ? (
                            <ShieldCheck className="w-3 h-3" />
                          ) : (
                            <Briefcase className="w-3 h-3" />
                          )}
                          {record.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-text-primary font-mono">
                        ₹{Number(record.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            record.status === 'PAID'
                              ? 'bg-success/20 text-success'
                              : record.status === 'FAILED'
                              ? 'bg-danger/20 text-danger'
                              : 'bg-warning/20 text-warning'
                          }`}
                        >
                          {record.status === 'PAID' && <CheckCircle2 className="w-3 h-3" />}
                          {record.status === 'PENDING' && <Clock className="w-3 h-3" />}
                          {record.status === 'FAILED' && <XCircle className="w-3 h-3" />}
                          {record.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-text-secondary text-[11px]">
                        {record.transactionRef || 'Pending'}
                      </td>
                      <td className="py-3 px-4 text-text-secondary text-[11px] whitespace-nowrap">
                        {record.paymentDate
                          ? new Date(record.paymentDate).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right relative row-action-menu-container">
                        {/* SINGLE INVOICE ACTION DROPDOWN */}
                        {record.isInvoiceAvailable ? (
                          <div className="relative inline-block text-left">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={loadingInvoiceId === record.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRowMenuId(isMenuOpen ? null : record.id);
                              }}
                              className="border-border bg-surface-elevated hover:bg-surface-elevated text-text-primary text-xs h-7 px-2.5 rounded-lg flex items-center gap-1"
                            >
                              {loadingInvoiceId === record.id ? (
                                <RefreshCw className="w-3 h-3 text-primary animate-spin" />
                              ) : (
                                <FileText className="w-3 h-3 text-primary" />
                              )}
                              <span>Invoice</span>
                              <ChevronDown className="w-3 h-3 text-text-secondary" />
                            </Button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-40 bg-surface-elevated border border-border rounded-xl shadow-2xl py-1 z-40 text-left">
                                <button
                                  type="button"
                                  onClick={() => handleViewInvoice(record)}
                                  className="w-full px-3 py-2 text-xs text-text-primary hover:bg-surface flex items-center gap-2 hover:text-text-primary transition"
                                >
                                  <Eye className="w-3.5 h-3.5 text-primary" />
                                  <span>View Invoice</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadInvoice(record)}
                                  className="w-full px-3 py-2 text-xs text-text-primary hover:bg-surface flex items-center gap-2 hover:text-text-primary transition"
                                >
                                  <Download className="w-3.5 h-3.5 text-success" />
                                  <span>Download Invoice</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span
                            title="Invoice is available once payment is verified and paid"
                            className="inline-block text-[10px] text-text-secondary bg-surface-elevated/80 px-2 py-1 rounded-md border border-border/60 cursor-not-allowed"
                          >
                            Invoice Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-xs text-text-secondary">
                    No fee payment records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Invoice Preview Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={invoicePdfViewer.open}
        onClose={() => {
          invoicePdfViewer.closeModal();
          setInvoiceModalRecord(null);
        }}
        blob={invoicePdfViewer.blob}
        blobUrl={invoicePdfViewer.blobUrl}
        pdfBytes={invoicePdfViewer.pdfBytes}
        loading={invoicePdfViewer.loading}
        fetchError={invoicePdfViewer.error}
        title={invoiceModalRecord ? `Payment Invoice — ${invoiceModalRecord.label} (${invoiceModalRecord.applicationNumber || 'N/A'})` : 'Invoice'}
        description="Authoritative tax invoice for verified payment"
        downloadFilename={invoiceModalRecord ? `Invoice_${invoiceModalRecord.applicationNumber || invoiceModalRecord.id}.pdf` : 'invoice.pdf'}
        onDownload={invoiceModalRecord ? () => handleDownloadInvoice(invoiceModalRecord) : undefined}
        onRetry={invoicePdfViewer.retry}
      />
    </div>
  );
};

export default AdminChargesPage;

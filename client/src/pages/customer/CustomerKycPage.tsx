import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Camera,
  Eye,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  CreditCard,
  Lock,
  FileCheck2,
  Copy,
  Check,
  Receipt,
} from 'lucide-react';
import { useBrandTitle } from '@/hooks/useBrandTitle';

interface DocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  rejectionReason?: string;
  version: number;
  uploadedAt: string;
}

interface ProfileData {
  id: string;
  fullName: string;
  mobile: string;
  email: string;
  aadhaarMasked: string;
  kycStatus: string;
}

interface CustomerCharge {
  id: string;
  name: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  remark?: string;
  dueDate?: string;
  transactionRef?: string;
  paidAt?: string;
}

export const CustomerKycPage: React.FC = () => {
  useBrandTitle('KYC Verification');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeUploadType, setActiveUploadType] = useState<'AADHAAR_FRONT' | 'AADHAAR_BACK' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pay KYC Fee Modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [utrInput, setUtrInput] = useState('');
  const [isSubmittingUtr, setIsSubmittingUtr] = useState(false);
  const [utrError, setUtrError] = useState<string | null>(null);
  const [copiedVpa, setCopiedVpa] = useState(false);

  // Invoice preview state
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [invoicePreviewUrl, setInvoicePreviewUrl] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // 1. Fetch Profile for KYC status
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery<ProfileData>({
    queryKey: ['customer-profile'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.CUSTOMERS.PROFILE);
      return res.data?.data?.profile || res.data?.profile || res.data?.data || res.data;
    },
    refetchInterval: 1500,
  });

  // 2. Fetch Customer Documents
  const {
    data: documents = [],
    isLoading: isDocsLoading,
    refetch: refetchDocs,
  } = useQuery<DocumentItem[]>({
    queryKey: ['customer-documents'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_DOCS.LIST);
      const list = res.data?.data?.documents || res.data?.documents || res.data?.data || res.data;
      return Array.isArray(list) ? list : [];
    },
    refetchInterval: 1500,
  });

  // 3. Fetch Customer Charges
  const {
    data: customerCharges = [],
    refetch: refetchCharges,
  } = useQuery<CustomerCharge[]>({
    queryKey: ['customerChargesKyc'],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_CHARGES.LIST);
      return res.data?.data || res.data || [];
    },
    refetchInterval: 1500,
  });

  // 4. Fetch Payment Rail Options
  const { data: paymentOptions } = useQuery({
    queryKey: ['activePaymentOptionsKyc'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.ACTIVE_PAYMENT_OPTIONS);
        return res.data?.data || res.data;
      } catch {
        return null;
      }
    },
    refetchInterval: 1500,
  });

  // Filter Aadhaar documents
  const frontDoc = documents.find((d) => d.documentType === 'AADHAAR_FRONT');
  const backDoc = documents.find((d) => d.documentType === 'AADHAAR_BACK');

  const isFrontUploaded = Boolean(frontDoc && frontDoc.status !== 'REJECTED');
  const isBackUploaded = Boolean(backDoc && backDoc.status !== 'REJECTED');
  const areBothAadhaarUploaded = isFrontUploaded && isBackUploaded;

  // KYC Fee evaluation
  const kycCharge = customerCharges.find(
    (c) => c.name?.toUpperCase().includes('KYC') || c.remark?.toUpperCase().includes('KYC')
  );
  const isKycFeePaid = Boolean(kycCharge && kycCharge.status === 'PAID');
  const isKycFeeUnderVerification = Boolean(
    kycCharge && (kycCharge.status as any === 'UNDER_VERIFICATION' || (kycCharge.transactionRef && kycCharge.status !== 'PAID'))
  );
  const kycFeeAmount = kycCharge?.amount || 499;

  // Overall KYC status
  const rawKycStatus = profile?.kycStatus?.toUpperCase() || 'PENDING';
  const isKycVerified = (rawKycStatus === 'APPROVED' || rawKycStatus === 'VERIFIED');
  const isFrontReupload = frontDoc?.status === 'REUPLOAD_REQUIRED';
  const isBackReupload = backDoc?.status === 'REUPLOAD_REQUIRED';
  const hasAnyKycReupload = Boolean(isFrontReupload || isBackReupload);
  const isCorrectionRequired = rawKycStatus === 'REUPLOAD_REQUIRED' || hasAnyKycReupload;
  const isRejected = rawKycStatus === 'REJECTED';

  // Upload Mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ documentType, uploadFile }: { documentType: string; uploadFile: File }) => {
      const formData = new FormData();
      formData.append('documentType', documentType);
      formData.append('file', uploadFile);
      return apiClient.post(API_ENDPOINTS.CUSTOMER_DOCS.UPLOAD, formData);
    },
    onSuccess: (_, variables) => {
      const label = variables.documentType === 'AADHAAR_FRONT' ? 'Aadhaar Card (Front)' : 'Aadhaar Card (Back)';
      setSuccessMessage(`${label} uploaded successfully.`);
      setErrorMessage(null);
      setFile(null);
      setActiveUploadType(null);
      queryClient.invalidateQueries({ queryKey: ['customer-documents'] });
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
      queryClient.invalidateQueries({ queryKey: ['customerChargesKyc'] });
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to upload document. Please check file format and size (max 10MB).');
      setSuccessMessage(null);
    },
  });

  // Handle Submit UTR for KYC Fee
  const handleSubmitUtr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!utrInput.trim() || utrInput.trim().length < 6) {
      setUtrError('Please enter a valid 12-digit transaction reference (UTR) number.');
      return;
    }

    setIsSubmittingUtr(true);
    setUtrError(null);

    try {
      if (kycCharge) {
        await apiClient.post(
          API_ENDPOINTS.CUSTOMER_CHARGES.SUBMIT_UTR(kycCharge.id),
          {
            utr: utrInput.trim(),
            paymentMethod: 'UPI',
            notes: 'KYC Verification Fee settlement',
          },
          { tokenType: 'customer' }
        );
      } else {
        // Fallback generic payment UTR
        await apiClient.post(
          '/customer/payments/upi',
          {
            utr: utrInput.trim(),
            paymentMethod: 'UPI',
            paymentType: 'KYC_CHARGES',
          },
          { tokenType: 'customer' }
        );
      }

      setSuccessMessage('Payment submitted. Waiting for verification.');
      setPayModalOpen(false);
      setUtrInput('');
      refetchCharges();
      refetchProfile();
      queryClient.invalidateQueries({ queryKey: ['customerChargesList'] });
      queryClient.invalidateQueries({ queryKey: ['customerChargesKyc'] });
      queryClient.invalidateQueries({ queryKey: ['customer-documents'] });
      queryClient.invalidateQueries({ queryKey: ['customerProfile'] });
    } catch (err: any) {
      setUtrError(err.response?.data?.message || err.message || 'Failed to submit payment reference.');
    } finally {
      setIsSubmittingUtr(false);
    }
  };

  const handleViewInvoice = async () => {
    if (!kycCharge) return;
    try {
      setInvoiceLoading(true);
      setInvoicePreviewOpen(true);
      const res = await apiClient.get(
        API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(kycCharge.id, false),
        { responseType: 'blob' }
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      setInvoicePreviewUrl(url);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to preview invoice PDF.');
      setInvoicePreviewOpen(false);
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.size > 10 * 1024 * 1024) {
        setErrorMessage('File size exceeds the 10 MB limit.');
        setFile(null);
        e.target.value = '';
        return;
      }
      setErrorMessage(null);
      setFile(selected);
      e.target.value = '';
    }
  };

  const toggleUploadType = (type: 'AADHAAR_FRONT' | 'AADHAAR_BACK') => {
    setActiveUploadType((prev) => (prev === type ? null : type));
    setFile(null);
    setErrorMessage(null);
  };

  const handleUploadSubmit = (type: 'AADHAAR_FRONT' | 'AADHAAR_BACK') => {
    if (!file) {
      setErrorMessage('Please select a file to upload.');
      return;
    }
    uploadMutation.mutate({ documentType: type, uploadFile: file });
  };

  // Status Badge Helper
  const getOverallKycStatus = () => {
    if (isKycVerified) {
      return {
        label: 'Verified',
        badge: <Badge className="bg-[#16A34A] text-white font-bold px-3 py-1 text-xs">KYC Verified ✓</Badge>,
      };
    }
    if (isRejected) {
      return {
        label: 'Rejected',
        badge: <Badge className="bg-[#DC2626] text-white font-bold px-3 py-1 text-xs">KYC Rejected</Badge>,
      };
    }
    if (isCorrectionRequired) {
      return {
        label: 'Correction Required',
        badge: <Badge className="bg-[#F59E0B] text-white font-bold px-3 py-1 text-xs">Correction Required</Badge>,
      };
    }
    if (areBothAadhaarUploaded && isKycFeePaid) {
      return {
        label: 'Under Verification',
        badge: <Badge className="bg-[#2563EB] text-white font-bold px-3 py-1 text-xs">Under Review</Badge>,
      };
    }
    if (areBothAadhaarUploaded && isKycFeeUnderVerification) {
      return {
        label: 'Payment Under Verification',
        badge: <Badge className="bg-[#2563EB] text-white font-bold px-3 py-1 text-xs">Payment Submitted</Badge>,
      };
    }
    if (areBothAadhaarUploaded) {
      return {
        label: 'Payment Required',
        badge: <Badge className="bg-[#F59E0B] text-white font-bold px-3 py-1 text-xs">Payment Required</Badge>,
      };
    }
    return {
      label: 'Not Started',
      badge: <Badge variant="outline" className="text-[#64748B] border-[#D6E4F5] font-bold px-3 py-1 text-xs">Aadhaar Pending</Badge>,
    };
  };

  const statusInfo = getOverallKycStatus();

  // Loading state
  if (isProfileLoading || isDocsLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-[#2563EB]" />
        <p className="text-sm text-[#64748B] font-medium">Loading KYC verification status...</p>
      </div>
    );
  }

  // Error state
  if (isProfileError && !profile) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <Card className="border-red-200 bg-red-50/50 p-6 text-center space-y-4 shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto" />
          <h2 className="text-lg font-bold text-[#0F172A]">Unable to Load KYC Information</h2>
          <p className="text-xs text-[#64748B]">
            {(profileError as Error)?.message || 'A network error occurred while fetching your KYC profile.'}
          </p>
          <Button
            onClick={() => {
              refetchProfile();
              refetchDocs();
              refetchCharges();
            }}
            variant="outline"
            size="sm"
          >
            Try Again
          </Button>
        </Card>
      </div>
    );
  }

  const primaryUpiId = paymentOptions?.upi?.primaryUpiId || 'pay@loanapprove';

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#D6E4F5]">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0F172A] flex items-center space-x-2">
            <ShieldCheck className="w-7 h-7 text-[#2563EB]" />
            <span>KYC Verification & Identity Gate</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1">
            Complete your mandatory Aadhaar identity verification and KYC fee payment.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-[#64748B] font-medium">Status:</span>
          {statusInfo.badge}
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center space-x-2 shadow-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-center space-x-2 shadow-xs animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="font-semibold">{errorMessage}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 14. APPLICATION JOURNEY PROGRESS TRACKER (6 STAGES)                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Card className="border border-[#D6E4F5] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="p-4 sm:p-5 pb-3 border-b border-[#D6E4F5]/60 bg-[#F7FAFF]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs sm:text-sm font-bold text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2563EB]" />
              <span>Application Journey & Prerequisite Gates</span>
            </CardTitle>
            <span className="text-[11px] font-semibold text-[#64748B]">Sequential Verification</span>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 sm:gap-3 text-center">
            {/* Step 1: Identity Verification */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition-all ${
              areBothAadhaarUploaded
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-[#EFF6FF] border-[#2563EB]/40 text-[#2563EB] ring-1 ring-[#2563EB]/20'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">1. Identity</span>
                {areBothAadhaarUploaded ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Clock className="w-4 h-4 text-[#2563EB]" />
                )}
              </div>
              <p className="font-bold text-[11px] leading-tight">Aadhaar Upload</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">
                {areBothAadhaarUploaded ? '✓ Uploaded' : 'Action Required'}
              </span>
            </div>

            {/* Step 2: KYC Payment */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition-all ${
              isKycFeePaid
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : areBothAadhaarUploaded
                ? 'bg-amber-50/80 border-amber-300 text-amber-900 ring-1 ring-amber-300/40'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">2. Payment</span>
                {isKycFeePaid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : areBothAadhaarUploaded ? (
                  <CreditCard className="w-4 h-4 text-amber-600" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <p className="font-bold text-[11px] leading-tight">KYC Fee</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">
                {isKycFeePaid ? '✓ Paid' : isKycFeeUnderVerification ? 'Under Review' : areBothAadhaarUploaded ? 'Payment Due' : 'Locked'}
              </span>
            </div>

            {/* Step 3: KYC Verification */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition-all ${
              isKycVerified
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : isKycFeePaid
                ? 'bg-[#EFF6FF] border-[#2563EB]/40 text-[#2563EB]'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">3. Verification</span>
                {isKycVerified ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <p className="font-bold text-[11px] leading-tight">Compliance Desk</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">
                {isKycVerified ? '✓ Verified' : isKycFeePaid ? 'In Review' : 'Locked'}
              </span>
            </div>

            {/* Step 4: Loan Documents */}
            <div className={`p-3 rounded-xl border flex flex-col justify-between text-xs transition-all ${
              isKycVerified
                ? 'bg-[#EFF6FF] border-[#2563EB]/40 text-[#2563EB]'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">4. Loan Docs</span>
                {isKycVerified ? (
                  <FileCheck2 className="w-4 h-4 text-[#2563EB]" />
                ) : (
                  <Lock className="w-4 h-4 text-slate-300" />
                )}
              </div>
              <p className="font-bold text-[11px] leading-tight">PAN & Income</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">
                {isKycVerified ? 'Unlocked' : 'Locked'}
              </span>
            </div>

            {/* Step 5: Processing Fee */}
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex flex-col justify-between text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">5. Proc. Fee</span>
                <Lock className="w-4 h-4 text-slate-300" />
              </div>
              <p className="font-bold text-[11px] leading-tight">Processing Fee</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">Locked</span>
            </div>

            {/* Step 6: Underwriting */}
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex flex-col justify-between text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-[10px] uppercase tracking-wider">6. Sanction</span>
                <Lock className="w-4 h-4 text-slate-300" />
              </div>
              <p className="font-bold text-[11px] leading-tight">Underwriting</p>
              <span className="text-[10px] mt-1 font-medium opacity-80">Locked</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 5: VERIFIED BANNER (NO GUARANTEED / INSTANT LANGUAGE)           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isKycVerified && (
        <Card className="border border-emerald-300 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 p-6 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-emerald-950">
                  Identity KYC Verified!
                </h3>
                <p className="text-xs sm:text-sm text-emerald-800/90 mt-0.5">
                  Your KYC has been verified. You can now continue with your loan application.
                </p>
              </div>
            </div>
            <Link to="/customer/documents" className="shrink-0 w-full sm:w-auto">
              <Button className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-sm px-6 h-11 rounded-xl shadow-md flex items-center justify-center space-x-2">
                <span>Continue to Loan Documents</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Customer Demographic Info Header */}
      {profile && (
        <Card className="shadow-xs border border-[#D6E4F5] bg-white rounded-2xl">
          <CardContent className="p-4 sm:p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[#64748B] block font-medium">Registered Borrower</span>
                <span className="text-sm font-semibold text-[#0F172A]">{profile.fullName}</span>
              </div>
              <div>
                <span className="text-[#64748B] block font-medium">Aadhaar (Protected & Masked)</span>
                <span className="text-sm font-mono font-bold text-[#0F172A] tracking-wider flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-[#2563EB]" />
                  {profile.aadhaarMasked || 'XXXX-XXXX-XXXX'}
                </span>
              </div>
              <div>
                <span className="text-[#64748B] block font-medium">Registered Mobile</span>
                <span className="text-sm font-mono font-semibold text-[#0F172A] mt-0.5 block">
                  +91 {profile.mobile}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 3 & 4: KYC VERIFICATION FEE PAYMENT GATE CARD                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {areBothAadhaarUploaded && !isKycVerified && (
        <Card className="border-2 border-[#2563EB]/40 bg-[#F7FAFF] rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-3 border-b border-[#D6E4F5] bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-[#2563EB]" />
                </div>
                <div>
                  <CardTitle className="text-sm sm:text-base font-bold text-[#0F172A] uppercase tracking-wider">
                    KYC VERIFICATION PAYMENT
                  </CardTitle>
                  <CardDescription className="text-xs text-[#64748B]">
                    KYC Verification Fee is required before identity verification.
                  </CardDescription>
                </div>
              </div>
              <div>
                {isKycFeePaid ? (
                  <Badge className="bg-[#16A34A] text-white font-bold text-xs px-3 py-1">
                    PAID ✓
                  </Badge>
                ) : isKycFeeUnderVerification ? (
                  <Badge className="bg-[#2563EB] text-white font-bold text-xs px-3 py-1">
                    <Clock className="w-3.5 h-3.5 mr-1" /> Pending Verification
                  </Badge>
                ) : (
                  <Badge className="bg-[#F59E0B] text-white font-bold text-xs px-3 py-1">
                    Payment Required
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-[#D6E4F5]">
              <div>
                <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider block">
                  KYC Verification Fee
                </span>
                <div className="text-2xl font-black text-[#0F172A] font-mono mt-0.5">
                  ₹{kycFeeAmount.toLocaleString('en-IN')}
                </div>
                <p className="text-[11px] text-[#64748B] mt-0.5">
                  Status: <strong>{isKycFeePaid ? 'PAID ✓' : isKycFeeUnderVerification ? 'Pending Verification' : 'Payment Required'}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {isKycFeePaid ? (
                  <Button
                    onClick={handleViewInvoice}
                    disabled={invoiceLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10 px-5 rounded-xl shadow-xs flex items-center gap-1.5"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>View Invoice</span>
                  </Button>
                ) : isKycFeeUnderVerification ? (
                  <div className="text-right">
                    <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] border border-[#D6E4F5] px-3 py-1.5 rounded-xl block">
                      UTR Submitted: {kycCharge?.transactionRef}
                    </span>
                    <span className="text-[10px] text-[#64748B] block mt-1">
                      Payment submitted. Waiting for verification.
                    </span>
                  </div>
                ) : (
                  <Button
                    onClick={() => {
                      if (kycCharge?.id) {
                        navigate(`/customer/payments?chargeId=${kycCharge.id}`);
                      } else {
                        navigate('/customer/payments?charge=kyc');
                      }
                    }}
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Pay Now</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Mandatory Payment Gate Notice */}
            {!isKycFeePaid && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Strict Prerequisite Gate:</strong> KYC verification and subsequent loan application document uploads remain strictly locked until this fee is submitted and confirmed by underwriting.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 2: IDENTITY DOCUMENTS (VERIFIED READ-ONLY OR UPLOAD CONTROLS)  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isKycVerified && !hasAnyKycReupload ? (
        /* COMPLETED / READ-ONLY VERIFIED IDENTITY STATE */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                Verified Identity Credentials
              </h2>
              <p className="text-xs text-[#64748B]">
                Your government identity documents have been verified and approved by underwriting compliance.
              </p>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Verified & Locked
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Aadhaar Front - Verified Read-Only */}
            <Card className="bg-white border border-emerald-200 rounded-2xl shadow-xs">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                        ✓
                      </span>
                      <CardTitle className="text-sm font-bold text-[#0F172A]">
                        Aadhaar Card — Front Side
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-[#64748B] pl-8">
                      Identity photo and Aadhaar number
                    </CardDescription>
                  </div>
                  <Badge className="bg-[#16A34A] text-white font-bold text-xs px-2.5 py-0.5">
                    Verified ✓
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 pl-12 space-y-3">
                <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#0F172A] font-semibold truncate max-w-[200px]">
                      {frontDoc?.fileName || 'Aadhaar_Front.pdf'}
                    </span>
                    <span className="text-[10px] text-[#64748B]">v{frontDoc?.version || 1}</span>
                  </div>
                  {frontDoc && (
                    <div className="pt-1 border-t border-[#D6E4F5]">
                      <a
                        href={`/api/customer/documents/${frontDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View File</span>
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Aadhaar Back - Verified Read-Only */}
            <Card className="bg-white border border-emerald-200 rounded-2xl shadow-xs">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                        ✓
                      </span>
                      <CardTitle className="text-sm font-bold text-[#0F172A]">
                        Aadhaar Card — Back Side
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-[#64748B] pl-8">
                      Registered residential address
                    </CardDescription>
                  </div>
                  <Badge className="bg-[#16A34A] text-white font-bold text-xs px-2.5 py-0.5">
                    Verified ✓
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 pl-12 space-y-3">
                <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#0F172A] font-semibold truncate max-w-[200px]">
                      {backDoc?.fileName || 'Aadhaar_Back.pdf'}
                    </span>
                    <span className="text-[10px] text-[#64748B]">v{backDoc?.version || 1}</span>
                  </div>
                  {backDoc && (
                    <div className="pt-1 border-t border-[#D6E4F5]">
                      <a
                        href={`/api/customer/documents/${backDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View File</span>
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Primary Action Card */}
          <Card className="border border-[#2563EB]/30 bg-[#EFF6FF]/60 p-5 rounded-2xl shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-sm sm:text-base font-bold text-[#0F172A] flex items-center gap-2">
                  <FileCheck2 className="w-5 h-5 text-[#2563EB]" />
                  <span>Next Step: Upload Loan Application Documents</span>
                </h3>
                <p className="text-xs text-[#64748B] max-w-lg">
                  Identity KYC is fully verified. Proceed to upload your financial documents (PAN, Bank Statement, Income Proof) to complete your loan underwriting.
                </p>
              </div>
              <Link to="/customer/documents" className="shrink-0 w-full sm:w-auto">
                <Button className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-md flex items-center justify-center gap-2">
                  <span>Continue to Loan Documents</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      ) : (
        /* PRE-VERIFICATION OR RE-UPLOAD REQUIRED EXPERIENCE */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#0F172A]">
                Identity Documents (Aadhaar Card)
              </h2>
              <p className="text-xs text-[#64748B]">
                {hasAnyKycReupload
                  ? 'Please re-upload the requested document below as instructed by underwriting.'
                  : 'Upload high-resolution images or PDF copies of both sides of your official Aadhaar card.'}
              </p>
            </div>
            <span className="text-xs font-bold text-[#2563EB] bg-[#EFF6FF] px-2.5 py-1 rounded-full border border-[#D6E4F5]">
              {hasAnyKycReupload ? 'Correction Required' : '2 Documents Required'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Aadhaar Front */}
            <Card className={`bg-white border rounded-2xl shadow-xs transition-all ${
              frontDoc?.status === 'REUPLOAD_REQUIRED'
                ? 'border-amber-300 ring-1 ring-amber-300'
                : isFrontUploaded
                ? 'border-emerald-200'
                : 'border-[#D6E4F5]'
            }`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-[#EFF6FF] text-[#2563EB] font-bold text-xs flex items-center justify-center">
                        1
                      </span>
                      <CardTitle className="text-sm font-bold text-[#0F172A]">
                        Aadhaar Card — Front Side
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-[#64748B] pl-8">
                      Must clearly display your full name, photograph, and 12-digit Aadhaar number.
                    </CardDescription>
                  </div>
                  <div>
                    {frontDoc?.status === 'REUPLOAD_REQUIRED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                        Re-upload Required
                      </span>
                    ) : isFrontUploaded ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[#64748B] bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 pl-12 space-y-3">
                {frontDoc ? (
                  <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[#0F172A] font-semibold truncate max-w-[200px]">
                        {frontDoc.fileName}
                      </span>
                      <span className="text-[10px] text-[#64748B]">v{frontDoc.version}</span>
                    </div>

                    {frontDoc.rejectionReason && (
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Correction needed: {frontDoc.rejectionReason}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-[#D6E4F5]">
                      <a
                        href={`/api/customer/documents/${frontDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View File</span>
                      </a>
                      {(!isKycVerified || frontDoc.status === 'REUPLOAD_REQUIRED') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleUploadType('AADHAAR_FRONT')}
                          className="text-xs h-7 px-2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          {activeUploadType === 'AADHAAR_FRONT' ? 'Cancel' : 'Re-upload'}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleUploadType('AADHAAR_FRONT')}
                    className="text-xs w-full flex items-center justify-center space-x-1.5 h-9 border-[#D6E4F5]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Front Side</span>
                  </Button>
                )}

                {/* Inline Upload Form */}
                {activeUploadType === 'AADHAAR_FRONT' && (!isKycVerified || frontDoc?.status === 'REUPLOAD_REQUIRED') && (
                  <div className="p-3.5 rounded-xl border-2 border-dashed border-[#2563EB]/40 bg-[#EFF6FF]/40 space-y-3 animate-in fade-in">
                    <input
                      type="file"
                      id="frontFileInput"
                      aria-label="Upload Aadhaar Front"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="frontFileInput"
                      className="cursor-pointer block text-center p-3 hover:bg-white rounded-lg transition-colors border border-dashed border-[#D6E4F5]"
                    >
                      <Camera className="w-6 h-6 text-[#2563EB] mx-auto mb-1" />
                      <span className="text-xs font-bold text-[#0F172A] block">
                        {file ? file.name : 'Click to select photo or PDF'}
                      </span>
                      <span className="text-[10px] text-[#64748B]">JPG, PNG, PDF up to 10 MB</span>
                    </label>

                    {file && (
                      <Button
                        size="sm"
                        onClick={() => handleUploadSubmit('AADHAAR_FRONT')}
                        disabled={uploadMutation.isPending}
                        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold h-8.5 rounded-lg shadow-sm"
                      >
                        {uploadMutation.isPending ? 'Uploading...' : 'Confirm Upload'}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Card 2: Aadhaar Back */}
            <Card className={`bg-white border rounded-2xl shadow-xs transition-all ${
              backDoc?.status === 'REUPLOAD_REQUIRED'
                ? 'border-amber-300 ring-1 ring-amber-300'
                : isBackUploaded
                ? 'border-emerald-200'
                : 'border-[#D6E4F5]'
            }`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-[#EFF6FF] text-[#2563EB] font-bold text-xs flex items-center justify-center">
                        2
                      </span>
                      <CardTitle className="text-sm font-bold text-[#0F172A]">
                        Aadhaar Card — Back Side
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-[#64748B] pl-8">
                      Must clearly display your full residential address and barcode/QR code.
                    </CardDescription>
                  </div>
                  <div>
                    {backDoc?.status === 'REUPLOAD_REQUIRED' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                        Re-upload Required
                      </span>
                    ) : isBackUploaded ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-[#64748B] bg-slate-100 px-2.5 py-0.5 rounded-full">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 pt-2 pl-12 space-y-3">
                {backDoc ? (
                  <div className="p-3 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[#0F172A] font-semibold truncate max-w-[200px]">
                        {backDoc.fileName}
                      </span>
                      <span className="text-[10px] text-[#64748B]">v{backDoc.version}</span>
                    </div>

                    {backDoc.rejectionReason && (
                      <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Correction needed: {backDoc.rejectionReason}</span>
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-[#D6E4F5]">
                      <a
                        href={`/api/customer/documents/${backDoc.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View File</span>
                      </a>
                      {(!isKycVerified || backDoc.status === 'REUPLOAD_REQUIRED') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleUploadType('AADHAAR_BACK')}
                          className="text-xs h-7 px-2 text-[#64748B] hover:text-[#0F172A]"
                        >
                          {activeUploadType === 'AADHAAR_BACK' ? 'Cancel' : 'Re-upload'}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleUploadType('AADHAAR_BACK')}
                    className="text-xs w-full flex items-center justify-center space-x-1.5 h-9 border-[#D6E4F5]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Back Side</span>
                  </Button>
                )}

                {/* Inline Upload Form */}
                {activeUploadType === 'AADHAAR_BACK' && (!isKycVerified || backDoc?.status === 'REUPLOAD_REQUIRED') && (
                  <div className="p-3.5 rounded-xl border-2 border-dashed border-[#2563EB]/40 bg-[#EFF6FF]/40 space-y-3 animate-in fade-in">
                    <input
                      type="file"
                      id="backFileInput"
                      aria-label="Upload Aadhaar Back"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="backFileInput"
                      className="cursor-pointer block text-center p-3 hover:bg-white rounded-lg transition-colors border border-dashed border-[#D6E4F5]"
                    >
                      <Camera className="w-6 h-6 text-[#2563EB] mx-auto mb-1" />
                      <span className="text-xs font-bold text-[#0F172A] block">
                        {file ? file.name : 'Click to select photo or PDF'}
                      </span>
                      <span className="text-[10px] text-[#64748B]">JPG, PNG, PDF up to 10 MB</span>
                    </label>

                    {file && (
                      <Button
                        size="sm"
                        onClick={() => handleUploadSubmit('AADHAAR_BACK')}
                        disabled={uploadMutation.isPending}
                        className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold h-8.5 rounded-lg shadow-sm"
                      >
                        {uploadMutation.isPending ? 'Uploading...' : 'Confirm Upload'}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* STEP 2/3 DYNAMIC ACTION CONTROLLER                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!isKycVerified && (
        <Card className="border border-[#D6E4F5] bg-white p-5 sm:p-6 rounded-2xl shadow-xs">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
                KYC Verification Queue Status
              </h3>
              <p className="text-xs text-[#64748B] max-w-lg">
                {!areBothAadhaarUploaded
                  ? 'Please upload both front and back sides of your Aadhaar card to unlock verification.'
                  : !isKycFeePaid && !isKycFeeUnderVerification
                  ? 'Aadhaar documents received. Please complete your KYC Verification Fee to queue your file.'
                  : isKycFeeUnderVerification
                  ? 'Payment reference (UTR) submitted. Waiting for underwriting verification.'
                  : isKycFeePaid
                  ? 'KYC fee confirmed. Compliance officer is now reviewing your identity documents.'
                  : 'Documents ready for submission.'}
              </p>
            </div>

            <div className="shrink-0 w-full sm:w-auto">
              {!areBothAadhaarUploaded ? (
                <Button
                  disabled
                  className="w-full sm:w-auto bg-slate-100 text-slate-400 font-bold text-xs h-10 px-6 rounded-xl cursor-not-allowed"
                >
                  Upload Both Sides
                </Button>
              ) : isKycFeePaid ? (
                <Button
                  disabled
                  className="w-full sm:w-auto bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] font-bold text-xs h-10 px-6 rounded-xl cursor-default flex items-center gap-2"
                >
                  <Clock className="w-4 h-4 animate-pulse text-[#2563EB]" />
                  <span>KYC Verification In Progress</span>
                </Button>
              ) : isKycFeeUnderVerification ? (
                <Button
                  disabled
                  className="w-full sm:w-auto bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] font-bold text-xs h-10 px-6 rounded-xl cursor-default flex items-center gap-2"
                >
                  <Clock className="w-4 h-4 animate-spin text-[#2563EB]" />
                  <span>KYC Payment Under Verification</span>
                </Button>
              ) : (
                <Button
                  onClick={() => setPayModalOpen(true)}
                  className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Complete KYC Payment</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Footer Nav */}
      <div className="flex items-center justify-between text-xs pt-4 border-t border-[#D6E4F5]">
        <Link to="/customer/dashboard" className="text-[#64748B] hover:text-[#2563EB] transition-colors font-medium">
          ← Back to Dashboard
        </Link>
        {isKycVerified ? (
          <Link to="/customer/documents" className="font-bold text-[#2563EB] hover:underline flex items-center gap-1">
            <span>Continue to Loan Documents</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <Link to="/customer/payments" className="font-bold text-[#2563EB] hover:underline flex items-center gap-1">
            <span>Customer Payments Center</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DIALOG: PAY KYC VERIFICATION FEE (UPI / BANK + UTR SUBMISSION)      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-md bg-white border border-[#D6E4F5] rounded-2xl shadow-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0F172A] flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#2563EB]" />
              <span>Pay KYC Verification Fee</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Transfer the exact fee using your preferred UPI app or Net Banking, then submit the 12-digit UTR.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Amount Box */}
            <div className="p-3.5 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                  Payable Amount
                </span>
                <span className="text-2xl font-black text-[#0F172A] font-mono">
                  ₹{kycFeeAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <Badge className="bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] font-bold text-xs">
                KYC Verification Fee
              </Badge>
            </div>

            {/* UPI ID Copy Box */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                Official UPI VPA
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono font-bold text-[#0F172A] select-all">
                  {primaryUpiId}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(primaryUpiId);
                    setCopiedVpa(true);
                    setTimeout(() => setCopiedVpa(false), 2000);
                  }}
                  className="h-7 px-2.5 text-xs font-semibold"
                >
                  {copiedVpa ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="ml-1">{copiedVpa ? 'Copied' : 'Copy'}</span>
                </Button>
              </div>
            </div>

            {/* UTR Submission Form */}
            <form onSubmit={handleSubmitUtr} className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#0F172A] block">
                  12-Digit Transaction Reference (UTR Number) <span className="text-red-600">*</span>
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 202609061427"
                  value={utrInput}
                  onChange={(e) => setUtrInput(e.target.value.toUpperCase())}
                  maxLength={22}
                  className="font-mono text-xs uppercase h-10 border-[#D6E4F5]"
                />
                <span className="text-[10px] text-[#64748B] block">
                  Found in your Google Pay, PhonePe, Paytm, or bank transfer confirmation receipt.
                </span>
              </div>

              {utrError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{utrError}</span>
                </div>
              )}

              <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayModalOpen(false)}
                  className="w-full sm:w-auto text-xs h-9"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingUtr}
                  className="w-full sm:w-auto bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-9 px-5 rounded-xl shadow-sm"
                >
                  {isSubmittingUtr ? 'Submitting UTR...' : 'Submit Payment Reference'}
                </Button>
              </DialogFooter>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DIALOG: INVOICE PREVIEW MODAL                                       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <Dialog open={invoicePreviewOpen} onOpenChange={setInvoicePreviewOpen}>
        <DialogContent className="max-w-3xl h-[85vh] p-0 flex flex-col bg-white overflow-hidden rounded-2xl">
          <DialogHeader className="p-4 border-b border-[#D6E4F5] flex-row items-center justify-between">
            <DialogTitle className="text-sm font-bold text-[#0F172A] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#2563EB]" />
              <span>Official Tax Invoice — KYC Verification Fee</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
            {invoiceLoading ? (
              <div className="flex flex-col items-center gap-2 text-xs text-[#64748B]">
                <RefreshCw className="w-6 h-6 animate-spin text-[#2563EB]" />
                <span>Loading official invoice PDF...</span>
              </div>
            ) : invoicePreviewUrl ? (
              <iframe
                src={invoicePreviewUrl}
                title="KYC Invoice Preview"
                className="w-full h-full border-none"
              />
            ) : (
              <span className="text-xs text-red-600">Failed to render PDF preview</span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

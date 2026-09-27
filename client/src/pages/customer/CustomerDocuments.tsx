import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Eye,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Download,
  Receipt,
  FileSignature,
  Calendar,
  ExternalLink,
  ShieldCheck,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useBrandTitle } from '@/hooks/useBrandTitle';

interface DocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REUPLOAD_REQUIRED';
  version: number;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  uploadedAt: string;
  loanId?: string | null;
}

interface DocumentRequestItem {
  id: string;
  documentType: string;
  title: string;
  description?: string | null;
  status: string;
  createdAt: string;
}

interface CustomerLoanItem {
  id: string;
  applicationNumber: string;
  accountNumber?: string | null;
  approvalNumber?: string | null;
  requestedAmount: number;
  approvedAmount?: number | null;
  tenureMonths: number;
  finalEmi?: number | null;
  status: string;
  submittedAt: string;
  disbursementDate?: string | null;
  createdAt: string;
}

interface CustomerChargeItem {
  id: string;
  name: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  remark?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  transactionRef?: string | null;
  loanId?: string | null;
  createdAt: string;
}

export const KYC_DOC_DEFINITIONS = [
  {
    type: 'AADHAAR_FRONT',
    title: 'Aadhaar Card (Front)',
    description: 'Clear photo or scan of the front side showing your photo and name.',
    required: true,
  },
  {
    type: 'AADHAAR_BACK',
    title: 'Aadhaar Card (Back)',
    description: 'Clear photo or scan of the back side showing your full registered address.',
    required: true,
  },
];

export const LOAN_DOC_DEFINITIONS = [
  {
    type: 'PAN',
    title: 'PAN Card',
    description: 'Permanent Account Number card showing clear PAN number and signature.',
    required: true,
    buttonLabel: 'Upload PAN',
  },
  {
    type: 'BANK_STATEMENT',
    title: 'Bank Statement',
    description: 'Bank statement for the last 3-6 months in PDF or scanned format.',
    required: true,
    buttonLabel: 'Upload Bank Statement',
  },
  {
    type: 'INCOME_PROOF',
    title: 'Income Proof',
    description: 'Recent salary slip, Form 16, or ITR document verifying monthly income.',
    required: true,
    buttonLabel: 'Upload Income Proof',
  },
  {
    type: 'OTHER',
    title: 'Other Documents',
    description: 'Additional documentation requested by underwriting.',
    required: false,
    buttonLabel: 'Upload Document',
  },
];

export const CustomerDocuments: React.FC = () => {
  useBrandTitle('Document Center');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'LOAN_DOCS' | 'PAYMENT_DOCS' | 'KYC_UPLOADS'>('LOAN_DOCS');

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DocumentRequestItem[]>([]);
  const [kycStatus, setKycStatus] = useState<string>('PENDING');
  const [loans, setLoans] = useState<CustomerLoanItem[]>([]);
  const [charges, setCharges] = useState<CustomerChargeItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);
  const [selectedDocType, setSelectedDocType] = useState<string>('');
  const [targetReuploadDocId, setTargetReuploadDocId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Apply for Loan modal & submission state
  const [applyModalOpen, setApplyModalOpen] = useState<boolean>(false);
  const [applyAmount, setApplyAmount] = useState<number>(100000);
  const [applyTenure, setApplyTenure] = useState<number>(12);
  const [applyPurpose, setApplyPurpose] = useState<string>('Personal Financial Assistance');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState<boolean>(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Document preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentDownloadFn, setCurrentDownloadFn] = useState<(() => void) | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const fetchAllData = async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      setErrorMessage(null);

      const [docsRes, loansRes, chargesRes] = await Promise.allSettled([
        apiClient.get(API_ENDPOINTS.CUSTOMER_DOCS.LIST),
        apiClient.get(API_ENDPOINTS.LOANS.CUSTOMER_LIST),
        apiClient.get(API_ENDPOINTS.CUSTOMER_CHARGES.LIST),
      ]);

      if (docsRes.status === 'fulfilled') {
        const payload = docsRes.value.data?.data || docsRes.value.data || {};
        setDocuments(payload.documents || []);
        setPendingRequests(payload.pendingRequests || []);
        setKycStatus(payload.kycStatus || payload.customer?.kycStatus || 'PENDING');
      }

      if (loansRes.status === 'fulfilled') {
        const rawLoans = loansRes.value.data?.data || loansRes.value.data || [];
        setLoans(Array.isArray(rawLoans) ? rawLoans : [rawLoans]);
      }

      if (chargesRes.status === 'fulfilled') {
        const rawCharges = chargesRes.value.data?.data || chargesRes.value.data || [];
        setCharges(Array.isArray(rawCharges) ? rawCharges : []);
      }

    } catch (err: unknown) {
      if (!isSilent) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to load documents';
        setErrorMessage(msg);
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchAllData(true);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, []);

  const isKycApproved = kycStatus === 'APPROVED' || kycStatus === 'VERIFIED';
  const kycCharge = charges.find(
    (c) =>
      c.name?.toUpperCase().includes('KYC') ||
      c.name?.toUpperCase().includes('VERIFICATION') ||
      c.remark?.toUpperCase().includes('KYC')
  );
  const isKycChargePaid = Boolean(kycCharge && kycCharge.status === 'PAID');

  const openUploadModal = (docType: string, reuploadDocId?: string) => {
    const isRequestedDoc = pendingRequests.some((r) => r.documentType === docType);
    if (docType !== 'AADHAAR_FRONT' && docType !== 'AADHAAR_BACK' && !isRequestedDoc) {
      if (!isKycApproved && !isKycChargePaid) {
        setErrorMessage('Complete your KYC verification first before uploading loan documents.');
        return;
      }
    }
    setSelectedDocType(docType);
    setTargetReuploadDocId(reuploadDocId || null);
    setSelectedFile(null);
    setDialogError(null);
    setUploadDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setDialogError('File size exceeds 10 MB limit. Please select a smaller file.');
      setSelectedFile(null);
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setDialogError('Invalid file type. Supported formats: PDF, JPG, PNG.');
      setSelectedFile(null);
      return;
    }

    setDialogError(null);
    setSelectedFile(file);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !selectedDocType) {
      setDialogError('Please select a valid file to upload.');
      return;
    }

    setIsUploading(true);
    setDialogError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('documentType', selectedDocType);

    try {
      if (targetReuploadDocId) {
        await apiClient.post(
          API_ENDPOINTS.CUSTOMER_DOCS.REUPLOAD(targetReuploadDocId),
          formData
        );
        setSuccessMessage('Document re-uploaded successfully and queued for review.');
      } else {
        await apiClient.post(
          API_ENDPOINTS.CUSTOMER_DOCS.UPLOAD,
          formData
        );
        setSuccessMessage('Document uploaded successfully.');
      }

      setUploadDialogOpen(false);
      setSelectedFile(null);
      fetchAllData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to upload document. Please try again.';
      setDialogError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleApplyLoanSubmit = async () => {
    try {
      setIsSubmittingLoan(true);
      setApplyError(null);

      const res = await apiClient.post(API_ENDPOINTS.LOANS.CUSTOMER_APPLY, {
        amount: Number(applyAmount),
        tenureMonths: Number(applyTenure),
        purpose: applyPurpose.trim() || 'Personal Financial Assistance',
      });

      const appData = res.data?.data || res.data;
      setSuccessMessage(
        `Loan application #${appData.applicationNumber || 'Submitted'} submitted successfully! Forwarded to underwriting assessment desk.`
      );
      setApplyModalOpen(false);
      fetchAllData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to submit loan application. Please verify that KYC is approved and all 4 documents are uploaded.';
      setApplyError(msg);
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  // Preview / Download helpers
  const handleViewPdf = async (url: string, title: string, downloadFn?: () => void) => {
    try {
      setPreviewLoading(true);
      setPreviewTitle(title);
      setCurrentDownloadFn(() => downloadFn || null);
      setPreviewOpen(true);

      const res = await apiClient.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Could not load document preview.');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadBlob = async (url: string, filename: string) => {
    try {
      const res = await apiClient.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Failed to download document.');
    }
  };

  const handleViewGenericDoc = async (docId: string, fileName: string) => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_DOCS.FILE(docId), {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
      const blobUrl = window.URL.createObjectURL(blob);
      setPreviewUrl(blobUrl);
      setPreviewTitle(fileName);
      setCurrentDownloadFn(() => () => handleDownloadBlob(API_ENDPOINTS.CUSTOMER_DOCS.FILE(docId), fileName));
      setPreviewOpen(true);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Could not open document.');
    }
  };

  // Status badges
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge className="bg-success text-background hover:brightness-110 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            <span>Verified & Approved</span>
          </Badge>
        );
      case 'UNDER_REVIEW':
        return (
          <Badge className="bg-warning text-background hover:brightness-110 flex items-center space-x-1">
            <Clock className="w-3 h-3 mr-1" />
            <span>Under Review</span>
          </Badge>
        );
      case 'REUPLOAD_REQUIRED':
        return (
          <Badge className="bg-orange-600 text-text-primary flex items-center space-x-1">
            <RotateCw className="w-3 h-3 mr-1" />
            <span>Re-upload Required</span>
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge className="bg-danger text-text-primary flex items-center space-x-1">
            <AlertCircle className="w-3 h-3 mr-1" />
            <span>Declined</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-text-secondary border-border flex items-center space-x-1">
            <Clock className="w-3 h-3 mr-1" />
            <span>Not Uploaded</span>
          </Badge>
        );
    }
  };

  // Filter existing loan documents
  const activeLoan = loans.find((l) => !['REJECTED', 'CANCELLED', 'DRAFT'].includes(l.status));
  const approvedLoans = loans.filter((l) => l.status === 'APPROVED' || l.status === 'DISBURSED');
  const paidCharges = charges.filter((c) => c.status === 'PAID');
  const docFeeCharge = charges.find(
    (c) =>
      c.name?.toUpperCase().includes('DOCUMENT') ||
      c.name?.toUpperCase().includes('DOC UPLOAD') ||
      c.name?.toUpperCase().includes('UPLOAD FEE')
  );

  const isLoanDocsUnlocked = isKycApproved;
  const uploadedLoanDocsCount = LOAN_DOC_DEFINITIONS.filter((def) =>
    documents.some((d) => d.documentType === def.type && d.status !== 'REJECTED')
  ).length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-text-secondary font-medium">Loading your document repository...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">Customer Document Center</h1>
          <p className="text-xs text-text-secondary mt-1">
            Access official sanctioned loan documents, immutable payment invoices, and verified KYC credentials.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-text-secondary font-medium">KYC Status:</span>
          {getStatusBadge(kycStatus)}
        </div>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="flex items-center space-x-2 p-4 rounded-xl bg-success/10 border border-success/30 text-success text-sm">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center space-x-2 p-4 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle className="w-5 h-5 text-danger shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex border-b border-[#D9E6F2] space-x-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('LOAN_DOCS')}
          className={`py-3 px-4 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'LOAN_DOCS'
              ? 'border-[#2563EB] text-[#2563EB] font-bold bg-[#EAF4FF] rounded-t-xl'
              : 'border-transparent text-[#52657A] hover:text-[#0B1F3A]'
          }`}
        >
          <FileSignature className="w-4 h-4" />
          <span>LOAN DOCUMENTS ({uploadedLoanDocsCount} / 4)</span>
          {pendingRequests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-600 text-white font-bold">
              {pendingRequests.length} Needed
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('PAYMENT_DOCS')}
          className={`py-3 px-4 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'PAYMENT_DOCS'
              ? 'border-[#2563EB] text-[#2563EB] font-bold bg-[#EAF4FF] rounded-t-xl'
              : 'border-transparent text-[#52657A] hover:text-[#0B1F3A]'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>PAYMENT DOCUMENTS ({paidCharges.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('KYC_UPLOADS')}
          className={`py-3 px-4 border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5 ${
            activeTab === 'KYC_UPLOADS'
              ? 'border-[#2563EB] text-[#2563EB] font-bold bg-[#EAF4FF] rounded-t-xl'
              : 'border-transparent text-[#52657A] hover:text-[#0B1F3A]'
          }`}
        >
          <FolderOpen className="w-4 h-4" />
          <span>KYC UPLOADS ({documents.length})</span>
        </button>
      </div>


      {/* ==================================================== */}
      {/* TAB 1: LOAN DOCUMENTS (STAGE-AWARE CHECKLIST)        */}
      {/* ==================================================== */}
      {activeTab === 'LOAN_DOCS' && (
        <div className="space-y-6">
          {/* Pending Additional Document Requests from Underwriter */}
          {pendingRequests.length > 0 && (
            <Card className="border border-amber-300 bg-amber-50/80 p-5 rounded-2xl shadow-xs">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="text-base font-bold text-amber-950">
                      Underwriter Requested Additional Verification Documents ({pendingRequests.length})
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Your loan application requires additional documentation to complete verification. Please upload the requested files below.
                    </p>
                  </div>
                  <div className="space-y-2 pt-1">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="bg-white p-4 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{req.title}</span>
                            <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold">
                              ACTION REQUIRED
                            </Badge>
                          </div>
                          {req.description && (
                            <p className="text-xs text-slate-600 mt-1">{req.description}</p>
                          )}
                          <span className="text-[11px] text-slate-400 mt-1 block">
                            Requested on {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => openUploadModal(req.documentType)}
                          className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 h-9 px-4 rounded-xl"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload This Document</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Quick Link Banner to Loans Section */}
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-text-primary flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary text-background rounded-lg shrink-0">
                <FileSignature className="w-5 h-5 text-text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm text-text-primary">
                  Application Documents Center
                </p>
                <p className="text-xs text-text-secondary">
                  Upload PAN, Bank Statements, and Income Proof. Track stage-gated verification directly across both Documents and Loans sections.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/customer/loans')}
              className="bg-primary text-background hover:brightness-110 text-xs shrink-0 shadow-sm"
            >
              Go to My Loans
              <ExternalLink className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>

          {/* STAGE-AWARE GATE: IF KYC OR KYC PAYMENT NOT VERIFIED */}
          {!isLoanDocsUnlocked ? (
            <Card className="border border-[#D6E4F5] bg-[#F7FAFF] rounded-2xl shadow-xs p-6 sm:p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#D6E4F5] text-[#2563EB] flex items-center justify-center mx-auto shadow-xs">
                <Lock className="w-6 h-6 text-[#2563EB]" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-base font-bold text-[#0F172A]">
                  Loan Application Documents Locked
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Complete the required KYC verification and payment before uploading loan application documents.
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <Button
                  size="sm"
                  onClick={() => navigate('/customer/kyc')}
                  className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-9 px-5 rounded-xl shadow-sm flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Complete KYC Verification</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </Card>
          ) : (
            /* UNLOCKED: SHOW 4-CARD APPLICATION DOCUMENT CHECKLIST */
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-[#0F172A]">
                    Required Loan Documents Checklist
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    Please ensure all mandatory financial documents are uploaded for underwriting assessment.
                  </p>
                </div>
                <Badge className="bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] text-xs font-bold px-3 py-1">
                  {uploadedLoanDocsCount} / 4 Documents Uploaded
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LOAN_DOC_DEFINITIONS.map((def) => {
                  const doc = documents.find((d) => d.documentType === def.type);
                  const isUploaded = Boolean(doc && doc.status !== 'REJECTED');

                  return (
                    <Card
                      key={def.type}
                      className="bg-white border border-[#D6E4F5] rounded-2xl shadow-xs p-4 flex flex-col justify-between hover:border-[#2563EB]/40 transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[#0F172A]">{def.title}</h4>
                              {def.required && (
                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#64748B]">{def.description}</p>
                          </div>
                          <div>
                            {doc ? (
                              doc.status === 'APPROVED' ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                                  Verified ✓
                                </Badge>
                              ) : doc.status === 'REUPLOAD_REQUIRED' ? (
                                <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                                  Correction Required
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                                  Under Review
                                </Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-[#64748B] border-[#D6E4F5] text-[11px] font-bold">
                                Not Uploaded
                              </Badge>
                            )}
                          </div>
                        </div>

                        {doc && (
                          <div className="p-2.5 rounded-xl bg-[#F7FAFF] border border-[#D6E4F5] text-xs flex items-center justify-between">
                            <span className="text-[#0F172A] font-semibold truncate max-w-[200px]">
                              {doc.fileName}
                            </span>
                            <span className="text-[10px] text-[#64748B]">v{doc.version}</span>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 mt-2 border-t border-[#D6E4F5] flex items-center justify-between">
                        {doc ? (
                          <a
                            href={`/api/customer/documents/${doc.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Document</span>
                          </a>
                        ) : (
                          <span className="text-xs text-[#64748B]">Action needed</span>
                        )}

                        <Button
                          size="sm"
                          onClick={() => {
                            openUploadModal(def.type, doc?.id);
                          }}
                          className={`text-xs h-8 px-3 rounded-lg font-bold ${
                            isUploaded
                              ? 'bg-white border border-[#D6E4F5] text-[#0F172A] hover:bg-[#F7FAFF]'
                              : 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs'
                          }`}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          <span>{isUploaded ? 'Re-upload' : def.buttonLabel}</span>
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* ── LOAN APPLICATION SUBMISSION CTA (4/4 COMPLETE) ── */}
              {activeLoan ? (
                <Card className="border-2 border-emerald-300 bg-emerald-50/50 rounded-2xl shadow-xs overflow-hidden">
                  <CardHeader className="p-4 sm:p-5 pb-3 border-b border-emerald-200 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-[#0F172A]">
                            Loan Application Submitted Successfully
                          </CardTitle>
                          <CardDescription className="text-xs text-[#64748B]">
                            Application ID: <strong className="font-mono text-emerald-800">{activeLoan.applicationNumber}</strong> • Forwarded for Underwriting Review
                          </CardDescription>
                        </div>
                      </div>
                      <div>
                        <Badge className="bg-emerald-600 text-white font-bold text-xs px-3.5 py-1">
                          {activeLoan.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-emerald-200">
                      <div>
                        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                          Requested Loan Amount
                        </span>
                        <span className="text-2xl font-black text-[#0F172A] font-mono">
                          ₹{activeLoan.requestedAmount.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-[#64748B] block mt-0.5">
                          Tenure: <strong className="text-[#0F172A]">{activeLoan.tenureMonths} Months</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => navigate('/customer/loans')}
                          className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-5 rounded-xl shadow-md flex items-center gap-1.5"
                        >
                          <span>View My Loan</span>
                          <ArrowRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : uploadedLoanDocsCount >= 4 && isKycApproved ? (
                <Card className="border-2 border-blue-400 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-2xl shadow-md overflow-hidden animate-in fade-in duration-300">
                  <CardHeader className="p-5 pb-3 border-b border-blue-200/80 bg-white/80 backdrop-blur-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                          <FileSignature className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-bold text-[#0F172A]">
                            All Mandatory Documents Uploaded (4/4)
                          </CardTitle>
                          <CardDescription className="text-xs text-[#475569]">
                            KYC identity is approved and all required loan documents are ready for credit underwriting.
                          </CardDescription>
                        </div>
                      </div>
                      <div>
                        <Badge className="bg-emerald-600 text-white font-bold text-xs px-3 py-1 shadow-2xs">
                          ✓ Ready for Application
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-blue-200 shadow-2xs">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-[#0F172A]">Submit for Underwriting Assessment</h4>
                        <p className="text-xs text-[#64748B]">
                          Click the button below to submit your official loan application to our underwriting officers for review and sanctioning.
                        </p>
                      </div>
                      <Button
                        size="default"
                        onClick={() => {
                          setApplyError(null);
                          setApplyModalOpen(true);
                        }}
                        className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-extrabold text-sm h-11 px-7 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                      >
                        <span>Apply for Loan</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border border-[#D6E4F5] bg-[#F7FAFF] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-[#64748B] shrink-0" />
                    <span className="text-[#64748B]">
                      Upload all 4 mandatory loan documents ({uploadedLoanDocsCount}/4 uploaded) and complete KYC verification to unlock loan application submission.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    disabled
                    className="bg-slate-200 text-slate-400 cursor-not-allowed text-xs font-bold h-8 px-4 rounded-xl"
                  >
                    Apply for Loan (Locked)
                  </Button>
                </Card>
              )}

              {/* ── BEFORE-LOAN CHARGE: LOAN DOCUMENT UPLOAD FEE (ADMIN-CONTROLLED) ── */}
              {docFeeCharge && (
                <Card className="border-2 border-purple-300 bg-purple-50/40 rounded-2xl shadow-xs overflow-hidden">
                  <CardHeader className="p-4 sm:p-5 pb-3 border-b border-purple-200 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                          <Receipt className="w-5 h-5" />
                        </div>
                        <div>
                          <CardTitle className="text-sm sm:text-base font-bold text-[#0F172A]">
                            {docFeeCharge.name || 'Loan Document Upload Fee'}
                          </CardTitle>
                          <CardDescription className="text-xs text-[#64748B]">
                            Required before file moves to underwriting assessment.
                          </CardDescription>
                        </div>
                      </div>
                      <div>
                        {docFeeCharge.status === 'PAID' ? (
                          <Badge className="bg-[#16A34A] text-white font-bold text-xs px-3 py-1">
                            PAID ✓
                          </Badge>
                        ) : (docFeeCharge.status as any === 'UNDER_VERIFICATION' || docFeeCharge.transactionRef) ? (
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

                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-purple-200">
                      <div>
                        <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                          Payable Fee Amount
                        </span>
                        <span className="text-2xl font-black text-[#0F172A] font-mono">
                          ₹{docFeeCharge.amount.toLocaleString('en-IN')}
                        </span>
                        {docFeeCharge.transactionRef && (
                          <span className="text-xs text-[#64748B] block mt-0.5">
                            Submitted UTR: <strong className="font-mono text-[#0F172A]">{docFeeCharge.transactionRef}</strong>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {docFeeCharge.status === 'PAID' ? (
                          <Button
                            size="sm"
                            onClick={() =>
                              handleViewPdf(
                                API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(docFeeCharge.id, false),
                                `Document Upload Fee Invoice`,
                                () =>
                                  handleDownloadBlob(
                                    API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(docFeeCharge.id, true),
                                    `Invoice_Document_Upload_Fee.pdf`
                                  )
                              )
                            }
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>View Tax Invoice</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/customer/payments?chargeId=${docFeeCharge.id}`)}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs h-9 px-5 rounded-xl shadow-md flex items-center gap-1.5"
                          >
                            <span>{(docFeeCharge.status as any === 'UNDER_VERIFICATION' || docFeeCharge.transactionRef) ? 'View Payment Status' : 'Pay Document Fee'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Official Sanction Documents for Approved Loans */}
              {approvedLoans.length > 0 && (
                <div className="space-y-6 pt-4 border-t border-border">
                  <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                    Sanction & Disbursement Documents
                  </h3>
                  {approvedLoans.map((loan) => {
                    const approvalNo = loan.approvalNumber || loan.accountNumber || loan.applicationNumber;

              return (
                <div key={loan.id} className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                      Application #{loan.applicationNumber} • Approval #{approvalNo}
                    </span>
                    <Badge className="bg-success text-background font-bold text-xs">
                      APPROVED
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* 1. Approval Letter */}
                    <Card className="bg-surface border-border flex flex-col justify-between hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                            <ShieldCheck className="w-5 h-5" />
                          </div>
                          <Badge className="bg-success/20 text-success border border-success/30 text-[10px]">
                            ISSUED
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold mt-2">Approval Letter</CardTitle>
                        <CardDescription className="text-xs">
                          Official 2-page Sanction & Loan Approval Letter with sanctioned terms, EMI, and authorization seals.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <div className="bg-surface-elevated p-3 rounded-xl border border-border text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Sanctioned Amount:</span>
                            <strong className="text-success font-mono">
                              ₹{(loan.approvedAmount || loan.requestedAmount).toLocaleString('en-IN')}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Approval No:</span>
                            <span className="font-mono text-text-primary font-medium">{approvalNo}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleViewPdf(
                                `/customer/loans/${loan.id}/approval-letter/pdf`,
                                `Approval Letter - ${approvalNo}`,
                                () =>
                                  handleDownloadBlob(
                                    `/customer/loans/${loan.id}/approval-letter/pdf?download=true`,
                                    `Approval_Letter_${approvalNo}.pdf`
                                  )
                              )
                            }
                            className="flex-1 text-xs h-8 border-border"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleDownloadBlob(
                                `/customer/loans/${loan.id}/approval-letter/pdf?download=true`,
                                `Approval_Letter_${approvalNo}.pdf`
                              )
                            }
                            className="flex-1 text-xs h-8 bg-primary text-primary-foreground font-semibold"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Download PDF
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 2. Loan Agreement */}
                    <Card className="bg-surface border-border flex flex-col justify-between hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600">
                            <FileSignature className="w-5 h-5" />
                          </div>
                          {loan.status === 'DISBURSED' || loan.status === 'ACTIVE' || (loan as any).modifiedOfferAccepted ? (
                            <Badge className="bg-success/20 text-success border border-success/30 text-[10px] font-bold">
                              SIGNED ✓
                            </Badge>
                          ) : (
                            <Badge className="bg-warning/20 text-warning border border-warning/30 text-[10px] font-bold animate-pulse">
                              AWAITING SIGNATURE
                            </Badge>
                          )}
                        </div>
                        <CardTitle className="text-base font-bold mt-2">Loan Agreement</CardTitle>
                        <CardDescription className="text-xs">
                          Legally binding borrower terms, sanction covenants, and digital execution record.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <div className="bg-surface-elevated p-3 rounded-xl border border-border text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Signing Status:</span>
                            {loan.status === 'DISBURSED' || loan.status === 'ACTIVE' || (loan as any).modifiedOfferAccepted ? (
                              <span className="text-success font-semibold">Signed & Accepted</span>
                            ) : (
                              <span className="text-warning font-semibold">Pending Customer Signature</span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Tenure:</span>
                            <span className="text-text-primary font-medium">{loan.tenureMonths} Months</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Agreement Version:</span>
                            <span className="font-mono text-text-primary font-medium">v1.0 (Sanctioned)</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/customer/agreement/${loan.id}`, '_blank')}
                            className="flex-1 text-xs h-8 border-border"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                          {loan.status === 'DISBURSED' || loan.status === 'ACTIVE' || (loan as any).modifiedOfferAccepted ? (
                            <Button
                              size="sm"
                              onClick={() => window.open(`/customer/agreement/${loan.id}`, '_blank')}
                              className="flex-1 text-xs h-8 bg-blue-600 hover:bg-blue-700 text-text-primary font-semibold"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />
                              View Agreement
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => navigate(`/customer/agreement/${loan.id}`)}
                              className="flex-1 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-text-primary font-bold shadow-xs"
                            >
                              <FileSignature className="w-3.5 h-3.5 mr-1" />
                              Sign Agreement
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* 3. EMI Schedule */}
                    <Card className="bg-surface border-border flex flex-col justify-between hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-600">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <Badge className="bg-amber-500/20 text-amber-600 border border-amber-500/30 text-[10px]">
                            SCHEDULE
                          </Badge>
                        </div>
                        <CardTitle className="text-base font-bold mt-2">EMI Schedule</CardTitle>
                        <CardDescription className="text-xs">
                          Complete month-by-month repayment schedule with installment breakdown and due dates.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 pt-0">
                        <div className="bg-surface-elevated p-3 rounded-xl border border-border text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Monthly EMI:</span>
                            <strong className="text-text-primary font-mono">
                              ₹{(loan.finalEmi || 0).toLocaleString('en-IN')}
                            </strong>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Installments:</span>
                            <span className="text-text-primary font-medium">{loan.tenureMonths} Monthly EMIs</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleViewPdf(
                                `/customer/loans/${loan.id}/emi-pdf`,
                                `EMI Schedule - ${approvalNo}`,
                                () =>
                                  handleDownloadBlob(
                                    `/customer/loans/${loan.id}/emi-pdf?download=true`,
                                    `EMI_Schedule_${approvalNo}.pdf`
                                  )
                              )
                            }
                            className="flex-1 text-xs h-8 border-border"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleDownloadBlob(
                                `/customer/loans/${loan.id}/emi-pdf?download=true`,
                                `EMI_Schedule_${approvalNo}.pdf`
                              )
                            }
                            className="flex-1 text-xs h-8 bg-amber-600 hover:bg-amber-700 text-text-primary font-semibold"
                          >
                            <Download className="w-3.5 h-3.5 mr-1" />
                            Download PDF
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}
  </div>
)}

      {/* ==================================================== */}
      {/* TAB 2: PAYMENT DOCUMENTS (ONE CHARGE = ONE INVOICE) */}
      {/* ==================================================== */}
      {activeTab === 'PAYMENT_DOCS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Verified Tax Invoices & Receipts</h3>
              <p className="text-xs text-text-secondary">
                Each verified fee is issued its own independent, immutable tax invoice.
              </p>
            </div>
            <Badge className="bg-success text-background font-bold text-xs">
              {paidCharges.length} Invoices Available
            </Badge>
          </div>

          {paidCharges.length === 0 ? (
            <Card className="p-8 text-center bg-surface border-border">
              <Receipt className="w-10 h-10 text-text-secondary mx-auto mb-3 opacity-60" />
              <h3 className="text-base font-bold text-text-primary">No Payment Invoices Generated Yet</h3>
              <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                Invoices are generated automatically as soon as the verification team approves your payment reference (UTR) for each individual charge.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paidCharges.map((charge) => {
                const invoiceNumber = `INV-${charge.id.slice(-6).toUpperCase()}`;

                return (
                  <Card key={charge.id} className="bg-surface border-border flex flex-col justify-between hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base font-bold text-text-primary">{charge.name} Invoice</CardTitle>
                          </div>
                          <CardDescription className="text-xs font-mono text-primary font-medium">
                            Invoice #{invoiceNumber}
                          </CardDescription>
                        </div>
                        <Badge className="bg-success text-background text-[10px] font-bold">
                          PAID
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 pt-0">
                      <div className="bg-surface-elevated p-3 rounded-xl border border-border text-xs space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Charge Category:</span>
                          <span className="font-semibold text-text-primary">{charge.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Amount Paid:</span>
                          <strong className="text-success font-mono text-sm">
                            ₹{charge.amount.toLocaleString('en-IN')}
                          </strong>
                        </div>
                        {charge.transactionRef && (
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Payment UTR:</span>
                            <span className="font-mono text-text-secondary font-medium">{charge.transactionRef}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-text-secondary">Settlement Date:</span>
                          <span className="text-text-secondary">
                            {charge.paidAt
                              ? new Date(charge.paidAt).toLocaleDateString('en-IN')
                              : new Date(charge.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleViewPdf(
                              API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(charge.id, false),
                              `${charge.name} Invoice (${invoiceNumber})`,
                              () =>
                                handleDownloadBlob(
                                  API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(charge.id, true),
                                  `Invoice_${charge.name.replace(/\s+/g, '_')}_${invoiceNumber}.pdf`
                                )
                            )
                          }
                          className="flex-1 text-xs h-8 border-border"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleDownloadBlob(
                              API_ENDPOINTS.CUSTOMER_CHARGES.INVOICE(charge.id, true),
                              `Invoice_${charge.name.replace(/\s+/g, '_')}_${invoiceNumber}.pdf`
                            )
                          }
                          className="flex-1 text-xs h-8 bg-success hover:bg-success/90 text-background font-semibold"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          Download PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: KYC & IDENTITY UPLOADS */}
      {/* ==================================================== */}
      {activeTab === 'KYC_UPLOADS' && (
        <div className="space-y-4">
          {/* Pending Additional Document Requests from Admin */}
          {pendingRequests.length > 0 && (
            <Card className="border-warning/30 bg-warning/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-warning flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span>Requested Documents from Verification Officer</span>
                </CardTitle>
                <CardDescription className="text-warning/80 text-xs">
                  The administrator requested additional documentation to proceed with your verification.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-surface p-4 rounded-lg border border-warning/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <h5 className="font-semibold text-text-primary text-sm">{req.title}</h5>
                      {req.description && <p className="text-xs text-text-secondary mt-0.5">{req.description}</p>}
                      <span className="text-[10px] text-text-secondary mt-1 block">
                        Requested on {new Date(req.createdAt).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => openUploadModal(req.documentType)}
                      className="shrink-0 flex items-center space-x-1"
                    >
                      <Upload className="w-3.5 h-3.5 mr-1" />
                      <span>Upload This Document</span>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* SECTION 1: KYC DOCUMENTS */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-text-primary flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <span>KYC Documents</span>
                </h3>
                <p className="text-xs text-text-secondary">
                  Identity proof verified via Aadhaar Card. Only Aadhaar Front & Back are required for KYC.
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-text-secondary font-medium">Status:</span>
                {getStatusBadge(kycStatus)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {KYC_DOC_DEFINITIONS.map((def) => {
                const doc = documents.find((d) => d.documentType === def.type);
                const isUploaded = !!doc;
                const status = doc ? doc.status : 'NOT_UPLOADED';

                return (
                  <Card key={def.type} className="flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-semibold flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span>{def.title}</span>
                            <span className="text-[10px] font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                              Mandatory for KYC
                            </span>
                          </CardTitle>
                          <CardDescription className="text-xs">{def.description}</CardDescription>
                        </div>
                        {getStatusBadge(status)}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 flex-1 flex flex-col justify-end">
                      {doc && (doc.status === 'REUPLOAD_REQUIRED' || doc.status === 'REJECTED') && doc.rejectionReason && (
                        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                          <span className="font-semibold block mb-0.5">Admin Reviewer Feedback:</span>
                          <p className="text-danger/90">{doc.rejectionReason}</p>
                        </div>
                      )}

                      {doc && (
                        <div className="text-xs text-text-secondary bg-surface-elevated p-2.5 rounded-lg border border-border flex items-center justify-between">
                          <div className="truncate mr-2">
                            <span className="font-medium text-text-primary truncate block">{doc.fileName}</span>
                            <span className="text-[11px] text-text-secondary">
                              {(doc.fileSize / 1024).toFixed(1)} KB • Version {doc.version}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewGenericDoc(doc.id, doc.fileName)}
                            className="h-7 text-xs flex items-center text-text-secondary hover:text-primary shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            <span>View</span>
                          </Button>
                        </div>
                      )}

                      <div className="pt-2 border-t border-border flex items-center justify-end space-x-2">
                        {!isUploaded ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openUploadModal(def.type)}
                            className="w-full sm:w-auto flex items-center justify-center space-x-1"
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            <span>Upload Document</span>
                          </Button>
                        ) : doc.status === 'REUPLOAD_REQUIRED' || doc.status === 'REJECTED' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openUploadModal(def.type, doc.id)}
                            className="w-full sm:w-auto flex items-center justify-center space-x-1"
                          >
                            <RotateCw className="w-3.5 h-3.5 mr-1" />
                            <span>Re-upload Corrected Version</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUploadModal(def.type, doc.id)}
                            className="text-xs text-text-secondary hover:text-text-primary"
                          >
                            <span>Replace / Update</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: LOAN DOCUMENTS */}
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="pb-2">
              <h3 className="text-base font-bold text-text-primary flex items-center space-x-2">
                <FileText className="w-5 h-5 text-primary" />
                <span>Loan Documents</span>
              </h3>
              <p className="text-xs text-text-secondary">
                Upload the documents required to process your loan application.
              </p>
            </div>

            {!isKycApproved && !documents.some((d) => d.documentType === 'PAN') ? (
              <div className="p-8 rounded-2xl bg-surface border border-border text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-text-primary">Loan Documents Locked</h4>
                  <p className="text-xs text-text-secondary max-w-md mx-auto">
                    Complete your KYC verification first. Loan application documents can be uploaded once your identity is verified.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/customer/kyc')}
                  className="bg-primary text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-md"
                >
                  Go to KYC
                </Button>
              </div>
            ) : isKycApproved && !isKycChargePaid && !documents.some((d) => d.documentType === 'PAN') ? (
              <div className="p-8 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-text-primary">KYC Payment Required to Unlock</h4>
                  <p className="text-xs text-text-secondary max-w-md mx-auto">
                    KYC verified. Please pay the KYC Verification Charge to unlock loan document upload.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/customer/payments')}
                  className="bg-primary text-primary-foreground font-bold text-xs h-9 px-4 rounded-xl shadow-md"
                >
                  Go to Payments
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {LOAN_DOC_DEFINITIONS.map((def) => {
                const doc = documents.find((d) => d.documentType === def.type);
                const isUploaded = !!doc;
                const status = doc ? doc.status : 'NOT_UPLOADED';

                return (
                  <Card key={def.type} className="flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <CardTitle className="text-base font-semibold flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-primary" />
                            <span>{def.title}</span>
                            {def.required && (
                              <span className="text-[10px] font-semibold text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                                Mandatory
                              </span>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">{def.description}</CardDescription>
                        </div>
                        {getStatusBadge(status)}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 flex-1 flex flex-col justify-end">
                      {doc && (doc.status === 'REUPLOAD_REQUIRED' || doc.status === 'REJECTED') && doc.rejectionReason && (
                        <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs">
                          <span className="font-semibold block mb-0.5">Admin Reviewer Feedback:</span>
                          <p className="text-danger/90">{doc.rejectionReason}</p>
                        </div>
                      )}

                      {doc && (
                        <div className="text-xs text-text-secondary bg-surface-elevated p-2.5 rounded-lg border border-border flex items-center justify-between">
                          <div className="truncate mr-2">
                            <span className="font-medium text-text-primary truncate block">{doc.fileName}</span>
                            <span className="text-[11px] text-text-secondary">
                              {(doc.fileSize / 1024).toFixed(1)} KB • Version {doc.version}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewGenericDoc(doc.id, doc.fileName)}
                            className="h-7 text-xs flex items-center text-text-secondary hover:text-primary shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            <span>View</span>
                          </Button>
                        </div>
                      )}

                      <div className="pt-2 border-t border-border flex items-center justify-end space-x-2">
                        {!isUploaded ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openUploadModal(def.type)}
                            className="w-full sm:w-auto flex items-center justify-center space-x-1"
                          >
                            <Upload className="w-3.5 h-3.5 mr-1" />
                            <span>Upload Document</span>
                          </Button>
                        ) : doc.status === 'REUPLOAD_REQUIRED' || doc.status === 'REJECTED' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openUploadModal(def.type, doc.id)}
                            className="w-full sm:w-auto flex items-center justify-center space-x-1"
                          >
                            <RotateCw className="w-3.5 h-3.5 mr-1" />
                            <span>Re-upload Corrected Version</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openUploadModal(def.type, doc.id)}
                            className="text-xs text-text-secondary hover:text-text-primary"
                          >
                            <span>Replace / Update</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Dialog with Camera & File Picker */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {targetReuploadDocId ? 'Re-upload Corrected Document' : 'Upload Document'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Upload a clear photo or scanned PDF. Max file size: 10 MB. Supported: PDF, JPG, PNG.
            </DialogDescription>
          </DialogHeader>

          {dialogError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{dialogError}</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
              className="hidden"
            />
            <input
              type="file"
              ref={cameraInputRef}
              onChange={handleFileChange}
              accept="image/*"
              capture="environment"
              className="hidden"
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/10 transition-colors text-text-primary"
              >
                <FolderOpen className="w-8 h-8 text-primary mb-2" />
                <span className="text-xs font-semibold">Choose File</span>
                <span className="text-[10px] text-text-secondary">PDF, JPG, PNG</span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/10 transition-colors text-text-primary"
              >
                <Camera className="w-8 h-8 text-primary mb-2" />
                <span className="text-xs font-semibold">Use Camera</span>
                <span className="text-[10px] text-text-secondary">Capture photo</span>
              </button>
            </div>

            {selectedFile && (
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between text-xs">
                <div className="truncate mr-2">
                  <span className="font-semibold text-primary block truncate">{selectedFile.name}</span>
                  <span className="text-primary/80">{(selectedFile.size / 1024).toFixed(1)} KB</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  className="h-6 text-xs text-danger hover:text-danger/80"
                >
                  Remove
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="flex space-x-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleUploadSubmit}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-1.5" />
                  <span>Confirm Upload</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Document Viewer Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-4">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border">
            <div>
              <DialogTitle className="text-base font-bold text-text-primary">{previewTitle}</DialogTitle>
              <DialogDescription className="text-xs">
                Official document preview generated from authoritative storage.
              </DialogDescription>
            </div>
            {currentDownloadFn && (
              <Button
                size="sm"
                onClick={currentDownloadFn}
                className="bg-primary text-primary-foreground text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Download PDF
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 bg-surface-elevated rounded-xl overflow-hidden mt-2 relative">
            {previewLoading ? (
              <div className="flex flex-col items-center justify-center h-full space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <span className="text-xs text-text-secondary">Rendering document stream...</span>
              </div>
            ) : previewUrl ? (
              <iframe
                src={previewUrl}
                title={previewTitle}
                className="w-full h-full border-0 rounded-xl"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-text-secondary">
                Document preview unavailable.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── APPLY FOR LOAN MODAL ── */}
      <Dialog open={applyModalOpen} onOpenChange={setApplyModalOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-[#2563EB]" />
              <span>Submit Loan Application</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Confirm your requested loan particulars for credit underwriting.
            </DialogDescription>
          </DialogHeader>

          {applyError && (
            <div className="p-3.5 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{applyError}</span>
            </div>
          )}

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-[#0F172A]">Requested Loan Amount (₹)</Label>
              <Input
                type="number"
                min={10000}
                max={3000000}
                step={5000}
                value={applyAmount}
                onChange={(e) => setApplyAmount(Number(e.target.value))}
                className="text-sm font-mono mt-1 h-10 rounded-xl"
                placeholder="e.g. 100000"
              />
              <span className="text-[11px] text-[#64748B] mt-0.5 block">
                Amount: ₹{Number(applyAmount || 0).toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#0F172A]">Loan Tenure (Months)</Label>
              <select
                value={applyTenure}
                onChange={(e) => setApplyTenure(Number(e.target.value))}
                className="w-full text-xs h-10 rounded-xl border border-input bg-background px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value={6}>6 Months (Short Term)</option>
                <option value={12}>12 Months (1 Year)</option>
                <option value={24}>24 Months (2 Years)</option>
                <option value={36}>36 Months (3 Years)</option>
                <option value={48}>48 Months (4 Years)</option>
                <option value={60}>60 Months (5 Years)</option>
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-[#0F172A]">Purpose of Loan</Label>
              <Input
                type="text"
                value={applyPurpose}
                onChange={(e) => setApplyPurpose(e.target.value)}
                className="text-xs mt-1 h-10 rounded-xl"
                placeholder="e.g. Personal Financial Assistance / Emergency"
              />
            </div>

            <div className="p-3 bg-[#F7FAFF] rounded-xl border border-[#D6E4F5] text-xs space-y-1">
              <div className="flex items-center text-emerald-700 font-semibold gap-1.5 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Identity KYC Verified & Approved</span>
              </div>
              <div className="flex items-center text-emerald-700 font-semibold gap-1.5 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All 4 Mandatory Documents Uploaded</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApplyModalOpen(false)}
              disabled={isSubmittingLoan}
              className="rounded-xl text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApplyLoanSubmit}
              disabled={isSubmittingLoan || !applyAmount || applyAmount <= 0}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-md"
            >
              {isSubmittingLoan ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Loan Application</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

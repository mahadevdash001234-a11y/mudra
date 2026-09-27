import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  Eye,
  Loader2,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
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

interface KycDocumentDetail {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'REUPLOAD_REQUIRED';
  version: number;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  uploadedAt: string;
}

interface CustomerKycData {
  customer: {
    id: string;
    fullName: string;
    mobile: string;
    email: string;
    address: string;
    state: string;
    city: string;
    monthlyIncome: number;
    aadhaarMasked: string;
    accountStatus: string;
    kycStatus: string;
    createdAt: string;
    updatedAt: string;
  };
  kycPayment?: {
    chargeId: string | null;
    amount: number;
    utr: string | null;
    hasUtr: boolean;
    status: string;
    isPaid: boolean;
    paymentStatus: string;
  };
  documents: KycDocumentDetail[];
  documentHistory: KycDocumentDetail[];
  pendingRequests: Array<{
    id: string;
    documentType: string;
    title: string;
    description?: string | null;
    status: string;
    requestedBy?: string | null;
    createdAt: string;
  }>;
}

export const AdminKycDetail: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<CustomerKycData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // PDF Viewer state via react-pdf canvas renderer
  const pdfViewer = usePdfViewer();
  const [pdfTitle, setPdfTitle] = useState<string>('');
  const [pdfDownloadName, setPdfDownloadName] = useState<string>('document.pdf');

  // Review Dialog State
  const [reviewModalOpen, setReviewModalOpen] = useState<boolean>(false);
  const [activeDocForReview, setActiveDocForReview] = useState<KycDocumentDetail | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD'>('APPROVE');
  const [reviewReason, setReviewReason] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Request Document Dialog State
  const [requestModalOpen, setRequestModalOpen] = useState<boolean>(false);
  const [requestDocType, setRequestDocType] = useState<string>('OTHER');
  const [requestTitle, setRequestTitle] = useState<string>('');
  const [requestDescription, setRequestDescription] = useState<string>('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const fetchKycDetail = useCallback(async (isSilent = false) => {
    if (!customerId) return;
    try {
      if (!isSilent) setIsLoading(true);
      setErrorMessage(null);
      const res = await apiClient.get(API_ENDPOINTS.ADMIN.KYC_DETAIL(customerId));
      setData(res?.data?.data || res?.data || res);
    } catch (err: unknown) {
      if (!isSilent) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Failed to load customer KYC details';
        setErrorMessage(msg);
      }
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchKycDetail();

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchKycDetail(true);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [fetchKycDetail]);

  const handleVerifyKycPayment = async () => {
    if (!data?.kycPayment?.chargeId) return;
    try {
      setIsSubmittingReview(true);
      await apiClient.post(API_ENDPOINTS.CHARGES.SPECIFIC.VERIFY_PAYMENT(data.kycPayment.chargeId));
      setSuccessMessage('KYC Verification payment verified successfully. Tax invoice generated.');
      fetchKycDetail(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to verify payment';
      setErrorMessage(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleOpenReviewModal = (doc: KycDocumentDetail, action: 'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD') => {
    setActiveDocForReview(doc);
    setReviewAction(action);
    setReviewReason('');
    setReviewError(null);
    setReviewModalOpen(true);
  };

  const handleSubmitReview = async () => {
    if (!activeDocForReview) return;

    if ((reviewAction === 'REJECT' || reviewAction === 'REQUEST_REUPLOAD') && !reviewReason.trim()) {
      setReviewError('A review reason is mandatory when rejecting or requesting re-upload.');
      return;
    }

    try {
      setIsSubmittingReview(true);
      setReviewError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.REVIEW_DOCUMENT(activeDocForReview.id), {
        action: reviewAction,
        reason: reviewReason.trim() || undefined,
      });

      setSuccessMessage(`Document "${activeDocForReview.documentType}" review submitted successfully.`);
      setReviewModalOpen(false);
      fetchKycDetail();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to submit document review';
      setReviewError(msg);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleOpenDocumentFile = async (documentId: string, fileName: string) => {
    try {
      setPdfTitle(`KYC Document — ${fileName}`);
      setPdfDownloadName(fileName);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.ADMIN.DOCUMENT_FILE(documentId));
    } catch {
      setErrorMessage(`Failed to open document "${fileName}". Please try again.`);
    }
  };

  const handleSubmitRequestDocument = async () => {
    if (!customerId || !requestTitle.trim()) {
      setRequestError('Please provide a document title.');
      return;
    }

    try {
      setIsSubmittingRequest(true);
      setRequestError(null);

      await apiClient.post(API_ENDPOINTS.ADMIN.REQUEST_DOCUMENT(customerId), {
        documentType: requestDocType,
        title: requestTitle.trim(),
        description: requestDescription.trim() || undefined,
      });

      setSuccessMessage('Additional document requested successfully.');
      setRequestModalOpen(false);
      setRequestTitle('');
      setRequestDescription('');
      fetchKycDetail();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to request additional document';
      setRequestError(msg);
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleOverallKycDecision = async (status: 'APPROVED' | 'REJECTED') => {
    if (!customerId) return;
    const hasUtr = Boolean(data?.kycPayment?.hasUtr || data?.kycPayment?.isPaid);
    const isKycFeePaid = Boolean(data?.kycPayment?.isPaid);

    if (status === 'APPROVED' && !hasUtr && !isKycFeePaid) {
      setErrorMessage('UTR number is required before KYC approval.');
      return;
    }

    const confirmMsg =
      status === 'APPROVED'
        ? 'Are you sure you want to approve this customer for KYC compliance?'
        : 'Are you sure you want to reject this customer KYC?';

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiClient.post(API_ENDPOINTS.ADMIN.KYC_DECISION(customerId), {
        status,
        reason: status === 'REJECTED' ? 'KYC documents do not satisfy compliance guidelines.' : undefined,
      });
      setSuccessMessage('KYC verification completed successfully.');
      fetchKycDetail();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update KYC status';
      setErrorMessage(msg);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge variant="success" className="flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
          </Badge>
        );
      case 'REUPLOAD_REQUIRED':
        return (
          <Badge variant="warning" className="flex items-center space-x-1">
            <RotateCw className="w-3 h-3 mr-1" /> Re-upload Required
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="flex items-center space-x-1">
            <AlertCircle className="w-3 h-3 mr-1" /> Rejected
          </Badge>
        );
      case 'UNDER_REVIEW':
      case 'PENDING':
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 flex items-center space-x-1">
            <Clock className="w-3 h-3 mr-1" /> Under Review
          </Badge>
        );
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-text-secondary font-medium">Loading customer KYC review...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center max-w-lg mx-auto">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
        <h3 className="text-base font-semibold text-text-primary">Customer Not Found</h3>
        <p className="text-xs text-text-secondary mt-1 mb-4">{errorMessage || 'Unable to load customer KYC details.'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/kyc')}>
          Return to Queue
        </Button>
      </div>
    );
  }

  const { customer, documents, documentHistory, pendingRequests, kycPayment } = data;
  const frontDoc = documents.find((d) => d.documentType === 'AADHAAR_FRONT');
  const backDoc = documents.find((d) => d.documentType === 'AADHAAR_BACK');
  const hasUtr = Boolean(kycPayment?.hasUtr || kycPayment?.isPaid);
  const isKycFeePaid = Boolean(kycPayment?.isPaid);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back Button and Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#D6E4F5] shadow-xs">
        <Button
          variant="outline"
          onClick={() => navigate('/admin/kyc')}
          className="h-10 px-4 rounded-xl border border-[#D6E4F5] bg-white text-[#0F172A] hover:bg-[#EFF6FF] hover:border-[#2563EB] hover:text-[#2563EB] font-semibold text-xs gap-2 inline-flex items-center shadow-xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to KYC Queue</span>
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="default"
            variant="outline"
            onClick={() => setRequestModalOpen(true)}
            className="h-10 px-4 text-xs font-semibold flex items-center gap-2 border-[#D6E4F5] hover:bg-[#EFF6FF] text-[#334155] rounded-xl"
          >
            <RotateCw className="w-4 h-4 text-[#64748B]" />
            <span>Request Correction</span>
          </Button>

          {customer.kycStatus !== 'REJECTED' && (
            <Button
              size="default"
              variant="danger"
              onClick={() => handleOverallKycDecision('REJECTED')}
              className="h-10 px-4 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 shadow-xs rounded-xl"
            >
              <AlertCircle className="w-4 h-4" />
              <span>Reject KYC</span>
            </Button>
          )}

          {customer.kycStatus !== 'APPROVED' && customer.kycStatus !== 'VERIFIED' && (
            <Button
              size="default"
              disabled={!hasUtr && !isKycFeePaid}
              onClick={() => handleOverallKycDecision('APPROVED')}
              title={!hasUtr && !isKycFeePaid ? 'UTR number is required before KYC approval.' : 'Approve KYC'}
              className={`h-10 px-5 text-xs font-bold flex items-center gap-2 shadow-xs rounded-xl ${
                !hasUtr && !isKycFeePaid
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Approve KYC</span>
            </Button>
          )}
        </div>
      </div>


      {/* Messages */}
      {successMessage && (
        <div className="flex items-center space-x-2 p-4 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
          <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center space-x-2 p-4 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
          <AlertCircle className="w-5 h-5 text-danger shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* KYC VERIFICATION & KYC PAYMENT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* KYC VERIFICATION CARD */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold tracking-wider text-text-primary flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                KYC VERIFICATION
              </CardTitle>
              {getStatusBadge(customer.kycStatus)}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5 text-xs">
            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                Customer:
              </span>
              <span className="text-sm font-bold text-text-primary">{customer.fullName}</span>
            </div>

            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                Mobile:
              </span>
              <span className="font-mono text-xs font-semibold text-text-primary flex items-center">
                <Phone className="w-3.5 h-3.5 mr-1 text-text-secondary" />
                +91 {customer.mobile}
              </span>
            </div>

            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                Aadhaar:
              </span>
              <span className="font-mono text-xs font-bold text-text-primary tracking-wider flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-primary" />
                {customer.aadhaarMasked || 'XXXX XXXX 9564'}
              </span>
            </div>

            <div className="pt-2 border-t border-border">
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-2">
                KYC Documents:
              </span>
              <div className="flex flex-wrap gap-2">
                {frontDoc ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenDocumentFile(frontDoc.id, frontDoc.fileName)}
                    className="text-xs h-8 bg-blue-50/60 text-blue-700 border-blue-200 hover:bg-blue-100 font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    [ View Aadhaar Front ]
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-xs text-rose-600 bg-rose-50 border-rose-200">
                    ✕ Aadhaar Front Missing
                  </Badge>
                )}

                {backDoc ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenDocumentFile(backDoc.id, backDoc.fileName)}
                    className="text-xs h-8 bg-blue-50/60 text-blue-700 border-blue-200 hover:bg-blue-100 font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    [ View Aadhaar Back ]
                  </Button>
                ) : (
                  <Badge variant="outline" className="text-xs text-rose-600 bg-rose-50 border-rose-200">
                    ✕ Aadhaar Back Missing
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KYC PAYMENT CARD */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3 border-b border-border bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold tracking-wider text-text-primary flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-emerald-600" />
                KYC PAYMENT
              </CardTitle>
              {isKycFeePaid ? (
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                  ✓ Paid & Verified
                </Badge>
              ) : hasUtr ? (
                <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                  ✓ UTR Provided
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold">
                  ⚠ UTR Missing
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5 text-xs">
            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                KYC Charge:
              </span>
              <span className="text-sm font-bold text-text-primary flex items-center">
                <IndianRupee className="w-3.5 h-3.5 mr-0.5 text-text-secondary" />
                {(kycPayment?.amount ?? 500).toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                UTR Number:
              </span>
              {kycPayment?.utr ? (
                <span className="font-mono text-xs font-bold px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-md text-[#0F172A]">
                  [ {kycPayment.utr} ]
                </span>
              ) : (
                <span className="font-mono text-xs text-[#64748B] px-2.5 py-1 bg-slate-50 border border-dashed border-slate-200 rounded-md">
                  Not Provided
                </span>
              )}
            </div>

            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                UTR Status:
              </span>
              {hasUtr || isKycFeePaid ? (
                <span className="inline-flex items-center font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ✓ UTR Provided (YES)
                </span>
              ) : (
                <span className="inline-flex items-center font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  ✕ Not Provided (NO)
                </span>
              )}
            </div>

            <div>
              <span className="text-text-secondary block text-[11px] font-medium uppercase tracking-wider mb-0.5">
                Payment Status:
              </span>
              <span className="font-semibold text-text-primary">
                {kycPayment?.paymentStatus || (isKycFeePaid ? 'Paid / Verified' : 'Pending Verification')}
              </span>
            </div>

            {hasUtr && !isKycFeePaid && kycPayment?.chargeId && (
              <div className="pt-2 border-t border-border">
                <Button
                  size="sm"
                  onClick={handleVerifyKycPayment}
                  disabled={isSubmittingReview}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verify Payment Reference (UTR)</span>
                </Button>
              </div>
            )}

            {!hasUtr && !isKycFeePaid && (
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>UTR number is required before KYC approval.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Profile Summary */}
      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg font-bold flex items-center space-x-2">
                <User className="w-5 h-5 text-primary" />
                <span>{customer.fullName}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Registered on {new Date(customer.createdAt).toLocaleDateString('en-IN')} • ID: {customer.id}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-text-secondary font-medium">Overall KYC Status:</span>
              {getStatusBadge(customer.kycStatus)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-text-secondary block mb-0.5">Mobile Number</span>
              <span className="font-mono font-semibold text-text-primary flex items-center">
                <Phone className="w-3.5 h-3.5 mr-1 text-text-secondary" />
                +91 {customer.mobile}
              </span>
            </div>
            <div>
              <span className="text-text-secondary block mb-0.5">Email Address</span>
              <span className="font-medium text-text-primary truncate block">
                <Mail className="w-3.5 h-3.5 inline mr-1 text-text-secondary" />
                {customer.email}
              </span>
            </div>
            <div>
              <span className="text-text-secondary block mb-0.5">Location</span>
              <span className="font-medium text-text-primary">
                <MapPin className="w-3.5 h-3.5 inline mr-1 text-text-secondary" />
                {customer.city}, {customer.state}
              </span>
            </div>
            <div>
              <span className="text-text-secondary block mb-0.5">Declared Monthly Income</span>
              <span className="font-mono font-semibold text-text-primary">
                <IndianRupee className="w-3.5 h-3.5 inline mr-0.5 text-text-secondary" />
                {customer.monthlyIncome.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="col-span-2">
              <span className="text-text-secondary block mb-0.5">Residential Address</span>
              <span className="font-medium text-text-primary">{customer.address}</span>
            </div>
            <div className="col-span-2">
              <span className="text-text-secondary block mb-0.5">Aadhaar (Protected & Masked)</span>
              <span className="font-mono font-bold text-text-primary tracking-wider flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 mr-1 text-primary" />
                {customer.aadhaarMasked}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Additional Requests from Admin */}
      {pendingRequests.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-warning flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span>Pending Customer Action: Requested Documents ({pendingRequests.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingRequests.map((r) => (
              <div key={r.id} className="bg-surface p-3 rounded-md border border-warning/30 text-xs flex justify-between">
                <div>
                  <span className="font-semibold text-text-primary block">{r.title}</span>
                  {r.description && <p className="text-text-secondary mt-0.5">{r.description}</p>}
                </div>
                <Badge variant="outline" className="h-6 text-warning bg-warning/10 self-start">
                  Awaiting Customer
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Uploaded Documents for Review */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-text-primary flex items-center space-x-2">
          <FileCheck2 className="w-4 h-4 text-primary" />
          <span>Active KYC Documents ({documents.length})</span>
        </h3>

        {documents.length === 0 ? (
          <Card className="text-center py-8">
            <CardContent>
              <p className="text-xs text-text-secondary">The customer has not uploaded any documents yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <Card key={doc.id} className="flex flex-col justify-between">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-bold text-text-primary flex items-center space-x-2">
                        <span>{doc.documentType.replace('_', ' ')}</span>
                        <Badge variant="outline" className="text-[10px] bg-surface-elevated">
                          v{doc.version}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5 truncate max-w-[240px]">
                        {doc.fileName} • {(doc.fileSize / 1024).toFixed(1)} KB
                      </CardDescription>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-2">
                  {doc.rejectionReason && (
                    <div className="p-2.5 rounded-md bg-danger/10 border border-danger/30 text-xs text-danger">
                      <span className="font-semibold block mb-0.5">Feedback Note:</span>
                      <p>{doc.rejectionReason}</p>
                    </div>
                  )}

                  <div className="text-[11px] text-text-secondary flex items-center justify-between">
                    <span>Uploaded: {new Date(doc.uploadedAt).toLocaleString('en-IN')}</span>
                    {doc.reviewedBy && <span>Reviewed by: {doc.reviewedBy}</span>}
                  </div>

                  {/* Document Actions */}
                  <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenDocumentFile(doc.id, doc.fileName)}
                      className="text-xs flex items-center space-x-1"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      <span>View File</span>
                    </Button>

                    <div className="flex items-center space-x-1.5 ml-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        title="Request Document Correction"
                        onClick={() => handleOpenReviewModal(doc, 'REQUEST_REUPLOAD')}
                        className="text-xs text-warning hover:bg-warning/10"
                      >
                        <RotateCw className="w-3.5 h-3.5 mr-1" />
                        <span>Request Correction</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenReviewModal(doc, 'REJECT')}
                        className="text-xs text-destructive hover:bg-danger/10"
                      >
                        <AlertCircle className="w-3.5 h-3.5 mr-1" />
                        <span>Reject</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenReviewModal(doc, 'APPROVE')}
                        className="text-xs bg-success text-background hover:brightness-110 text-text-primary"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        <span>Approve</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Historical Versions if any */}
      {documentHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-text-primary">
              Archived Document Version History ({documentHistory.length})
            </CardTitle>
            <CardDescription className="text-xs">
              Previous versions preserved for audit compliance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border text-xs">
              {documentHistory.map((h) => (
                <div key={h.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-text-primary">
                      {h.documentType.replace('_', ' ')} (Version {h.version})
                    </span>
                    <span className="text-text-secondary block">{h.fileName} • {new Date(h.uploadedAt).toLocaleDateString('en-IN')}</span>
                    {h.rejectionReason && (
                      <span className="text-danger block mt-0.5">Prior Reason: {h.rejectionReason}</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    {getStatusBadge(h.status)}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOpenDocumentFile(h.id, h.fileName)}
                      className="text-xs text-text-secondary hover:text-text-primary"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'APPROVE'
                ? 'Approve Document'
                : reviewAction === 'REJECT'
                ? 'Reject Document'
                : 'Request Document Re-upload'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Reviewing {activeDocForReview?.documentType.replace('_', ' ')} (v{activeDocForReview?.version}).
            </DialogDescription>
          </DialogHeader>

          {reviewError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{reviewError}</span>
            </div>
          )}

          <div className="space-y-3 py-2">
            {(reviewAction === 'REJECT' || reviewAction === 'REQUEST_REUPLOAD') && (
              <div className="space-y-1.5">
                <Label htmlFor="reviewReason" className="text-xs font-semibold">
                  Reason for {reviewAction === 'REJECT' ? 'Rejection' : 'Re-upload'} *
                </Label>
                <textarea
                  id="reviewReason"
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="e.g. Image is blurry or corners are cropped. Please upload a clear original."
                  className="w-full rounded-md border border-input bg-background p-2.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="text-[11px] text-text-secondary">
                  This note will be displayed directly to the customer on their KYC dashboard.
                </p>
              </div>
            )}

            {reviewAction === 'APPROVE' && (
              <p className="text-xs text-text-secondary">
                Are you sure you want to mark this document as verified and approved?
              </p>
            )}
          </div>

          <DialogFooter className="flex space-x-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReviewModalOpen(false)}
              disabled={isSubmittingReview}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitReview}
              disabled={isSubmittingReview}
              variant={reviewAction === 'REJECT' ? 'destructive' : 'default'}
            >
              {isSubmittingReview ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              <span>Confirm {reviewAction.replace('_', ' ')}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Additional Document Dialog */}
      <Dialog open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Request Additional Document</DialogTitle>
            <DialogDescription className="text-xs">
              Specify the document requirement to be fulfilled by the customer.
            </DialogDescription>
          </DialogHeader>

          {requestError && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
              <span>{requestError}</span>
            </div>
          )}

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="requestDocType" className="text-xs">Document Type</Label>
              <select
                id="requestDocType"
                value={requestDocType}
                onChange={(e) => setRequestDocType(e.target.value)}
                className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1.5 text-xs"
              >
                <option value="BANK_STATEMENT">Bank Statement</option>
                <option value="INCOME_PROOF">Income Proof (Salary slip / ITR)</option>
                <option value="PAN">PAN Card</option>
                <option value="AADHAAR_FRONT">Aadhaar Front</option>
                <option value="AADHAAR_BACK">Aadhaar Back</option>
                <option value="OTHER">Other Specific Document</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="requestTitle" className="text-xs">Title *</Label>
              <Input
                id="requestTitle"
                value={requestTitle}
                onChange={(e) => setRequestTitle(e.target.value)}
                placeholder="e.g. Latest 3-month salary account statement"
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="requestDescription" className="text-xs">Instructions for Customer</Label>
              <textarea
                id="requestDescription"
                rows={3}
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                placeholder="e.g. Statement must show employer salary credit with bank stamp."
                className="w-full rounded-md border border-input bg-background p-2.5 text-xs ring-offset-background"
              />
            </div>
          </div>

          <DialogFooter className="flex space-x-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestModalOpen(false)}
              disabled={isSubmittingRequest}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitRequestDocument}
              disabled={isSubmittingRequest || !requestTitle.trim()}
            >
              {isSubmittingRequest ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              <span>Send Document Request</span>
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
        title={pdfTitle || 'Document Viewer'}
        downloadFilename={pdfDownloadName || 'document.pdf'}
        onRetry={pdfViewer.retry}
      />
    </div>
  );
};

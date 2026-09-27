import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { loanApi, CustomerLoanApplication } from '@/api/loanApi';
import { LoanStatusBadge } from '@/components/LoanStatusBadge';
import {
  FileText,
  Plus,
  Clock,
  AlertCircle,
  Loader2,
  FolderOpen,
  Upload,
  CheckCircle2,
  IndianRupee,
  FileSignature,
  Eye,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import { useBrandTitle } from '@/hooks/useBrandTitle';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import { normalizeChargeName } from './CustomerHome';

const LOAN_DOC_CHECKLIST = [
  { type: 'PAN', title: 'PAN Card', desc: 'Permanent Account Number verification', required: true },
  { type: 'BANK_STATEMENT', title: 'Bank Statement', desc: 'Last 3-6 months official banking statement', required: true },
  { type: 'INCOME_PROOF', title: 'Income Proof', desc: 'Recent Salary Slip, Form 16, or ITR', required: true },
  { type: 'OTHER', title: 'Other Documents', desc: 'Supporting documentation or address proof', required: false },
];

export const CustomerLoansPage: React.FC = () => {
  useBrandTitle('My Loans & Loan Offer');
  const navigate = useNavigate();

  // Loan Document Upload Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>('');
  const [targetReuploadDocId, setTargetReuploadDocId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Apply Eligibility Modals State
  const [eligibilityState, setEligibilityState] = useState<'NONE' | 'KYC_REQUIRED' | 'DOCS_REQUIRED'>('NONE');

  // Approval letter PDF viewer via react-pdf canvas renderer
  const letterPdfViewer = usePdfViewer();

  // 1. Fetch Customer Loan Applications via loanApi
  const {
    data: response,
    refetch: refetchLoans,
  } = useQuery({
    queryKey: ['customerLoans'],
    queryFn: () => loanApi.getCustomerApplications(),
    refetchInterval: 1500,
  });

  // 2. Fetch Customer Dashboard Overview (for unified loanSummary fallback)
  const { data: dashboardData } = useQuery({
    queryKey: ['customer-dashboard'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.DASHBOARD.CUSTOMER);
        return res.data;
      } catch {
        return null;
      }
    },
    refetchInterval: 2000,
  });

  // 3. Fetch Customer Documents
  const { data: docsData, refetch: refetchDocs } = useQuery({
    queryKey: ['customerDocs'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_DOCS.LIST);
        return res.data?.data || res.data || { documents: [], kycStatus: 'NOT_SUBMITTED' };
      } catch {
        return { documents: [], kycStatus: 'NOT_SUBMITTED' };
      }
    },
    refetchInterval: 1500,
  });

  // 4. Fetch Customer Charges
  const { data: chargesData = [], refetch: refetchCharges } = useQuery({
    queryKey: ['customerCharges'],
    queryFn: async () => {
      try {
        const res = await apiClient.get(API_ENDPOINTS.CUSTOMER_CHARGES.LIST);
        return res.data?.data || res.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 1500,
  });

  // Resiliently extract applications array from all possible API response formats
  const rawData = response?.data;
  const apiApplications: CustomerLoanApplication[] =
    (Array.isArray(rawData) ? rawData : null) ||
    (Array.isArray((rawData as any)?.applications) ? (rawData as any).applications : null) ||
    (Array.isArray((rawData as any)?.data) ? (rawData as any).data : null) ||
    (Array.isArray((response as any)?.applications) ? (response as any).applications : null) ||
    (Array.isArray((response as any)?.data) ? (response as any).data : null) ||
    (Array.isArray(response) ? (response as any) : null) ||
    [];

  // Merge dashboard loanSummary if not already in applications list
  const dashboardLoan = dashboardData?.loanSummary;
  const applications: CustomerLoanApplication[] = [...apiApplications];
  if (
    dashboardLoan &&
    !applications.some(
      (a) => a.id === dashboardLoan.id || a.applicationNumber === dashboardLoan.applicationNumber
    )
  ) {
    applications.unshift({
      id: dashboardLoan.id,
      applicationNumber: dashboardLoan.applicationNumber,
      requestedAmount: dashboardLoan.requestedAmount,
      approvedAmount: dashboardLoan.approvedAmount,
      tenureMonths: dashboardLoan.tenureMonths,
      purpose: 'Personal / Business Loan',
      status: dashboardLoan.status as any,
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const documents = docsData?.documents || [];
  const kycStatus =
    docsData?.kycStatus ||
    docsData?.customer?.kycStatus ||
    dashboardData?.customer?.kycStatus ||
    'NOT_SUBMITTED';
  const isKycApproved = kycStatus === 'APPROVED' || kycStatus === 'VERIFIED';

  const charges = Array.isArray(chargesData) ? chargesData : [];
  const paidCharges = charges.filter((c: any) => c.status === 'PAID');

  const uploadedLoanDocsCount = LOAN_DOC_CHECKLIST.filter((cfg) =>
    documents.some((d: any) => d.documentType === cfg.type && d.status !== 'REJECTED')
  ).length;
  const allDocsReady = uploadedLoanDocsCount >= 3;

  // Active / primary loan
  const activeLoan =
    applications.find((app) => !['REJECTED', 'CANCELLED', 'CLOSED'].includes(app.status)) ||
    applications[0] ||
    (dashboardLoan
      ? ({
          id: dashboardLoan.id,
          applicationNumber: dashboardLoan.applicationNumber,
          requestedAmount: dashboardLoan.requestedAmount,
          approvedAmount: dashboardLoan.approvedAmount,
          tenureMonths: dashboardLoan.tenureMonths,
          purpose: 'Personal / Business Loan',
          status: dashboardLoan.status as any,
        } as CustomerLoanApplication)
      : null);

  // Derived financial parameters for active loan
  const sanctionedAmount =
    activeLoan?.approvedAmount ||
    activeLoan?.proposedAmount ||
    activeLoan?.requestedAmount ||
    dashboardLoan?.approvedAmount ||
    dashboardLoan?.requestedAmount ||
    0;
  const interestRate = (activeLoan as any)?.interestRate || (dashboardLoan as any)?.interestRate || 8.5;
  const tenureMonths = activeLoan?.tenureMonths || dashboardLoan?.tenureMonths || 12;
  const monthlyEmi =
    (activeLoan as any)?.estimatedEmi ||
    dashboardLoan?.estimatedEmi ||
    (sanctionedAmount > 0 ? Math.round(sanctionedAmount / tenureMonths) : 0);
  const totalPayable = monthlyEmi * tenureMonths;
  const totalInterest = Math.max(0, totalPayable - sanctionedAmount);

  // Apply button handler
  const handleApplyClick = () => {
    if (!isKycApproved) {
      setEligibilityState('KYC_REQUIRED');
      return;
    }
    if (!allDocsReady) {
      setEligibilityState('DOCS_REQUIRED');
      return;
    }
    navigate('/customer/apply');
  };

  const handleOpenUpload = (docType: string, docId?: string) => {
    setSelectedDocType(docType);
    setTargetReuploadDocId(docId || null);
    setSelectedFile(null);
    setUploadError(null);
    setUploadModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds 10MB limit.');
      setSelectedFile(null);
      return;
    }
    setUploadError(null);
    setSelectedFile(f);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !selectedDocType) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('documentType', selectedDocType);

    try {
      if (targetReuploadDocId) {
        await apiClient.post(API_ENDPOINTS.CUSTOMER_DOCS.REUPLOAD(targetReuploadDocId), formData);
        setUploadSuccess('Document re-uploaded successfully.');
      } else {
        await apiClient.post(API_ENDPOINTS.CUSTOMER_DOCS.UPLOAD, formData);
        setUploadSuccess('Document uploaded successfully.');
      }

      setUploadModalOpen(false);
      setSelectedFile(null);
      refetchDocs();
      refetchCharges();
      refetchLoans();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to upload document.';
      setUploadError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const pendingOffers = applications.filter((app) => app.status === 'OFFER_PENDING_CUSTOMER');

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16 text-[#0F172A]">
      {/* ── TOP HEADER ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[#D6E4F5]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5]">
              Loan Portfolio
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0F2A5F] tracking-tight">
            My Loans & Loan Offer
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Track your active loan offer, underwriting appraisal, and official sanction details.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeLoan ? (
            <Button
              onClick={() => navigate(`/customer/loans/${activeLoan.id}`)}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-5 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              <span>View Loan Details</span>
            </Button>
          ) : (
            <Button
              onClick={handleApplyClick}
              className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs h-10 px-6 rounded-xl shadow-xs flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Apply for Loan</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── PENDING OFFER BANNER ───────────────────────────────────────── */}
      {pendingOffers.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span className="text-sm font-bold text-amber-900">
              You have an offer waiting for your review!
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => navigate(`/customer/loans/${pendingOffers[0].id}`)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs"
          >
            Review Offer
          </Button>
        </div>
      )}

      {/* ── 1. CURRENT LOAN / YOUR LOAN OFFER CARD ─────────────────────── */}
      {activeLoan ? (
        <Card className="bg-white border-[#D6E4F5] rounded-3xl shadow-sm overflow-hidden">
          <CardHeader className="p-5 sm:p-6 pb-4 border-b border-[#D6E4F5]/60 bg-[#F7FAFF]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-[#2563EB] uppercase tracking-wider block mb-0.5">
                  YOUR LOAN OFFER & SANCTION DETAILS
                </span>
                <CardTitle className="text-xl sm:text-2xl font-black text-[#0F2A5F]">
                  Application #{activeLoan.applicationNumber}
                </CardTitle>
                <span className="text-xs text-[#64748B]">Personal / Business Loan Facility</span>
              </div>
              <div className="shrink-0">
                <LoanStatusBadge status={activeLoan.status} />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 sm:p-6 space-y-6">
            {/* Financial Particulars Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 bg-[#F7FAFF] rounded-2xl border border-[#D6E4F5]">
              <div className="space-y-1">
                <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Requested Amount</span>
                <span className="text-base sm:text-lg font-black text-[#0F172A] font-mono block">
                  ₹{activeLoan.requestedAmount.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-[#64748B]">Applied amount</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#16A34A] uppercase font-bold tracking-wider block">Sanctioned Amount</span>
                <span className="text-base sm:text-lg font-black text-[#16A34A] font-mono block">
                  {sanctionedAmount > 0 ? `₹${sanctionedAmount.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Approved ceiling</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#2563EB] uppercase font-bold tracking-wider block">Monthly EMI</span>
                <span className="text-base sm:text-lg font-black text-[#2563EB] font-mono block">
                  {monthlyEmi > 0 ? `₹${monthlyEmi.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Monthly installment</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Interest Rate</span>
                <span className="text-base sm:text-lg font-black text-[#0F172A] block">
                  {interestRate}% p.a.
                </span>
                <span className="text-[10px] text-[#64748B]">Floating benchmark</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Tenure</span>
                <span className="text-base sm:text-lg font-black text-[#0F172A] block">
                  {tenureMonths} Months
                </span>
                <span className="text-[10px] text-[#64748B]">Repayment tenure</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Total Interest</span>
                <span className="text-base sm:text-lg font-black text-amber-700 font-mono block">
                  {monthlyEmi > 0 ? `₹${totalInterest.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Estimated interest</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#64748B] uppercase font-bold tracking-wider block">Total Payable</span>
                <span className="text-base sm:text-lg font-black text-[#0F172A] font-mono block">
                  {monthlyEmi > 0 ? `₹${totalPayable.toLocaleString('en-IN')}` : 'Under Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Principal + Interest</span>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-[#16A34A] uppercase font-bold tracking-wider block">Disbursement</span>
                <span className="text-sm font-black text-[#16A34A] block">
                  {activeLoan.status === 'APPROVED' ? 'Sanctioned • Ready' : 'In Review'}
                </span>
                <span className="text-[10px] text-[#64748B]">Direct bank release</span>
              </div>
            </div>

            {/* Quick Action Navigation Toolbar */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-[#D6E4F5]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/customer/loans/${activeLoan.id}`)}
                className="text-xs h-9 px-4 border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] font-semibold rounded-xl bg-white"
              >
                <Eye className="w-3.5 h-3.5 mr-1 text-[#2563EB]" />
                View Loan Details
              </Button>

              {activeLoan.status === 'APPROVED' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      letterPdfViewer.fetchAndOpen(`/customer/loans/${activeLoan.id}/approval-letter/pdf`);
                    }}
                    className="text-xs h-9 px-4 border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] font-semibold rounded-xl bg-white"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1 text-[#2563EB]" />
                    View Approval Letter
                  </Button>

                  <Link to={`/customer/agreement/${activeLoan.id}`}>
                    <Button size="sm" className="text-xs h-9 px-4 bg-[#16A34A] hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1">
                      <FileSignature className="w-3.5 h-3.5" />
                      <span>View Agreement</span>
                    </Button>
                  </Link>
                </>
              )}

              <Link to={`/customer/payment/${activeLoan.id}`}>
                <Button size="sm" className="text-xs h-9 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl shadow-xs flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>View Payments</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Empty State */
        <Card className="bg-white border-[#D6E4F5] rounded-3xl p-8 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center mx-auto">
            <IndianRupee className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-lg font-extrabold text-[#0F2A5F]">No loan applications yet</h3>
            <p className="text-xs text-[#64748B]">
              You currently do not have an open loan application. Complete your KYC and document submission to apply for credit.
            </p>
          </div>
          <Button
            onClick={handleApplyClick}
            className="h-11 px-6 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Start Your First Application</span>
          </Button>
        </Card>
      )}

      {/* ── 2. LOAN PROGRESS LIFECYCLE ─────────────────────────────────── */}
      <Card className="bg-white border-[#D6E4F5] rounded-3xl shadow-xs overflow-hidden">
        <CardHeader className="p-5 sm:p-6 pb-3 border-b border-[#D6E4F5]/60 bg-[#F7FAFF]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-extrabold text-[#0F2A5F] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2563EB]" />
              <span>Loan Lifecycle Stages</span>
            </CardTitle>
            <span className="text-xs font-semibold text-[#64748B]">7 Key Stages</span>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-center text-xs">
            {[
              { title: '1. Application', done: Boolean(activeLoan) },
              { title: '2. KYC Verified', done: isKycApproved },
              { title: '3. Underwriting', done: activeLoan?.status === 'APPROVED' || activeLoan?.status === 'UNDER_REVIEW' },
              { title: '4. Verification Fee', done: paidCharges.length > 0 },
              { title: '5. Loan Approved', done: activeLoan?.status === 'APPROVED' },
              { title: '6. Agreement', done: Boolean(dashboardLoan?.agreementAccepted) },
              { title: '7. Disbursement', done: Boolean(dashboardLoan?.isDisbursed) },
            ].map((st, i) => (
              <div
                key={st.title}
                className={`p-3 rounded-2xl border transition-all ${
                  st.done
                    ? 'bg-emerald-50 border-emerald-200 text-[#16A34A] font-bold'
                    : 'bg-[#F7FAFF] border-[#D6E4F5] text-[#64748B]'
                }`}
              >
                <div className="w-6 h-6 rounded-full mx-auto mb-1.5 flex items-center justify-center text-[10px] font-bold bg-white border border-current">
                  {st.done ? '✓' : i + 1}
                </div>
                <span className="text-[11px] block leading-tight">{st.title}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. LOAN DOCUMENTS (4 REQUIRED DOCUMENT CARDS) ──────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#0F2A5F] flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-[#2563EB]" />
              <span>LOAN DOCUMENTS</span>
            </h2>
            <p className="text-xs text-[#64748B]">
              Mandatory underwriting documents evaluated for loan processing and sanction.
            </p>
          </div>
          <Badge className="bg-[#EFF6FF] text-[#2563EB] border border-[#D6E4F5] text-xs font-bold px-3 py-1 w-fit">
            {uploadedLoanDocsCount} / 4 Uploaded
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LOAN_DOC_CHECKLIST.map((docCfg) => {
            const uploadedDoc = documents.find((d: any) => d.documentType === docCfg.type);
            const isApproved = uploadedDoc?.status === 'APPROVED';
            const isUploaded = Boolean(uploadedDoc);

            return (
              <div
                key={docCfg.type}
                className="p-5 rounded-2xl border border-[#D6E4F5] bg-white shadow-xs flex flex-col justify-between hover:border-[#2563EB] transition-all space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">{docCfg.title}</h3>
                      <p className="text-xs text-[#64748B] mt-0.5">{docCfg.desc}</p>
                    </div>
                    {isApproved ? (
                      <Badge className="bg-emerald-50 text-[#16A34A] border border-emerald-200 text-[10px] font-bold px-2 py-0.5">
                        APPROVED ✓
                      </Badge>
                    ) : isUploaded ? (
                      <Badge className="bg-blue-50 text-[#2563EB] border border-blue-200 text-[10px] font-bold px-2 py-0.5">
                        UPLOADED
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold px-2 py-0.5">
                        PENDING
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#D6E4F5] flex items-center justify-between gap-2">
                  {uploadedDoc ? (
                    <>
                      <span className="text-xs text-[#64748B] font-mono truncate max-w-[200px]">
                        {uploadedDoc.fileName}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenUpload(docCfg.type, uploadedDoc.id)}
                        className="text-xs h-8 px-3 border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] rounded-xl font-semibold bg-white"
                      >
                        Re-upload
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-[#64748B] italic">Awaiting upload</span>
                      <Button
                        size="sm"
                        onClick={() => handleOpenUpload(docCfg.type)}
                        className="text-xs h-8 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl shadow-xs flex items-center gap-1"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 4. PAYMENTS & CHARGES ───────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[#0F2A5F] flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#2563EB]" />
              <span>PAYMENTS & CHARGES</span>
            </h2>
            <p className="text-xs text-[#64748B]">Active fee settlements and verified tax invoices</p>
          </div>
          <Link to="/customer/payments">
            <Button variant="outline" size="sm" className="text-xs h-8 px-3 border-[#D6E4F5] text-[#0F172A] font-semibold rounded-xl bg-white">
              Open Payment Center
            </Button>
          </Link>
        </div>

        {charges.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {charges.map((chg: any) => {
              const displayName = normalizeChargeName(chg.name);
              const isPaid = chg.status === 'PAID';

              return (
                <div
                  key={chg.id}
                  className={`p-5 rounded-2xl border shadow-xs space-y-3 ${
                    isPaid ? 'bg-emerald-50/20 border-emerald-200' : 'bg-white border-[#D6E4F5]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">{displayName}</h3>
                      <p className="text-xs text-[#64748B]">{chg.remark || 'Application Fee'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-black text-[#0F172A] font-mono block">
                        ₹{chg.amount.toLocaleString('en-IN')}
                      </span>
                      <Badge className={isPaid ? 'bg-emerald-50 text-[#16A34A] border-emerald-200 text-[10px] font-bold' : 'bg-amber-50 text-amber-800 border-amber-200 text-[10px] font-bold'}>
                        {chg.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#D6E4F5]/60 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[#64748B]">
                      {isPaid ? `Settled on ${new Date(chg.paidAt || chg.updatedAt).toLocaleDateString('en-IN')}` : 'Immediate settlement'}
                    </span>
                    {!isPaid && (
                      <Link to={`/customer/payments?chargeId=${chg.id}`}>
                        <Button size="sm" className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs h-8 px-3.5 font-bold rounded-xl shadow-xs">
                          Pay Now →
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Card className="p-6 bg-white border-[#D6E4F5] text-center rounded-2xl shadow-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 text-[#16A34A] mx-auto opacity-80" />
            <h4 className="text-sm font-bold text-[#0F172A]">No payment is currently required</h4>
            <p className="text-xs text-[#64748B]">All active charges are up to date.</p>
          </Card>
        )}
      </div>

      {/* ── 5. ALL LOAN APPLICATIONS HISTORY ───────────────────────────── */}
      {applications.length > 0 && (
        <div className="space-y-4">
          <div className="px-1">
            <h2 className="text-lg font-bold text-[#0F2A5F]">All Loan Records</h2>
            <p className="text-xs text-[#64748B]">Historical and active loan applications registered to your profile</p>
          </div>

          <div className="space-y-3">
            {applications.map((app) => (
              <div
                key={app.id}
                className="p-4 sm:p-5 rounded-2xl bg-white border border-[#D6E4F5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#0F172A]">{app.applicationNumber}</span>
                    <LoanStatusBadge status={app.status} />
                  </div>
                  <p className="text-xs text-[#64748B]">
                    Requested: <strong className="font-mono text-[#0F172A]">₹{app.requestedAmount.toLocaleString('en-IN')}</strong> • Tenure: <strong>{app.tenureMonths} Mo.</strong>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/customer/loans/${app.id}`)}
                  className="text-xs h-9 px-4 border-[#D6E4F5] text-[#0F172A] hover:bg-[#EFF6FF] font-semibold rounded-xl bg-white"
                >
                  <Eye className="w-3.5 h-3.5 mr-1 text-[#2563EB]" /> View Details
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ELIGIBILITY MODAL 1: KYC REQUIRED ──────────────────────────── */}
      <Dialog open={eligibilityState === 'KYC_REQUIRED'} onOpenChange={(open) => !open && setEligibilityState('NONE')}>
        <DialogContent className="max-w-md bg-white rounded-3xl border border-[#D6E4F5] shadow-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-lg font-black text-[#0F2A5F]">KYC Required</DialogTitle>
            <DialogDescription className="text-xs text-[#64748B] leading-relaxed">
              Complete your identity verification before applying for a loan.
            </DialogDescription>
          </div>
          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEligibilityState('NONE')}
              className="flex-1 h-10 border-[#D6E4F5] text-[#0F172A] rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setEligibilityState('NONE');
                navigate('/customer/kyc');
              }}
              className="flex-1 h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Complete KYC
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── ELIGIBILITY MODAL 2: LOAN DOCUMENTS REQUIRED ───────────────── */}
      <Dialog open={eligibilityState === 'DOCS_REQUIRED'} onOpenChange={(open) => !open && setEligibilityState('NONE')}>
        <DialogContent className="max-w-md bg-white rounded-3xl border border-[#D6E4F5] shadow-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-lg font-black text-[#0F2A5F]">Loan Documents Required</DialogTitle>
            <DialogDescription className="text-xs text-[#64748B] leading-relaxed">
              Complete your required loan documents before submitting your loan application.
            </DialogDescription>
          </div>
          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setEligibilityState('NONE')}
              className="flex-1 h-10 border-[#D6E4F5] text-[#0F172A] rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setEligibilityState('NONE');
                navigate('/customer/documents');
              }}
              className="flex-1 h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Upload Documents
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── UPLOAD DOCUMENT MODAL ──────────────────────────────────────── */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl border border-[#D6E4F5] shadow-2xl p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-[#0F2A5F]">
              {targetReuploadDocId ? 'Re-upload Document' : 'Upload Underwriting Document'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#64748B]">
              Upload a clear PDF, JPEG, or PNG document (maximum 10MB).
            </DialogDescription>
          </DialogHeader>

          {uploadSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-[#16A34A] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}

          {uploadError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#DC2626] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-[#0F172A] uppercase">Document Type</label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                disabled={Boolean(targetReuploadDocId)}
                className="w-full h-10 rounded-xl border border-[#D6E4F5] bg-[#F7FAFF] px-3 text-xs focus:border-[#2563EB] focus:outline-none"
              >
                <option value="">Select Document Type</option>
                {LOAN_DOC_CHECKLIST.map((c) => (
                  <option key={c.type} value={c.type}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-[#0F172A] uppercase">Select File</label>
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/jpg"
                onChange={handleFileChange}
                className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#EFF6FF] file:text-[#2563EB] hover:file:bg-blue-100"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            <Button
              variant="outline"
              onClick={() => setUploadModalOpen(false)}
              className="flex-1 h-10 border-[#D6E4F5] text-[#0F172A] rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadSubmit}
              disabled={isUploading || !selectedFile || !selectedDocType}
              className="flex-1 h-10 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-1.5"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <span>Upload Document</span>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Letter PDF Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={letterPdfViewer.open}
        onClose={letterPdfViewer.closeModal}
        blob={letterPdfViewer.blob}
        blobUrl={letterPdfViewer.blobUrl}
        pdfBytes={letterPdfViewer.pdfBytes}
        loading={letterPdfViewer.loading}
        fetchError={letterPdfViewer.error}
        title="Loan Approval Letter"
        description="Official sanction document"
        downloadFilename={`Approval_Letter_${activeLoan?.applicationNumber || 'Loan'}.pdf`}
        onRetry={letterPdfViewer.retry}
      />
    </div>
  );
};

export default CustomerLoansPage;

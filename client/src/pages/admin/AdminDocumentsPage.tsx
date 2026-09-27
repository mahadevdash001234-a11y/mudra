import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileCheck,
  Receipt,
  FileSignature,
  Calendar,
  Search,
  RotateCcw,
  Eye,
  Download,
  ShieldCheck,
  Loader2,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/api/client';
import { useBrandTitle } from '@/hooks/useBrandTitle';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import { fetchAuthenticatedPdf, downloadBlob } from '@/utils/pdfClient';

type DocumentCategory = 'ALL' | 'KYC' | 'APPROVAL_LETTER' | 'INVOICE' | 'AGREEMENT' | 'EMI_SCHEDULE';

interface UnifiedDocument {
  id: string;
  category: DocumentCategory;
  categoryLabel: string;
  title: string;
  fileName?: string;
  customerName: string;
  customerMobile: string;
  customerId: string;
  applicationNumber?: string;
  loanId?: string;
  status: 'VERIFIED' | 'APPROVED' | 'PENDING' | 'SIGNED' | 'AWAITING_SIGNATURE' | 'NOT_GENERATED' | 'REJECTED';
  statusLabel: string;
  generatedAt?: string;
  amount?: number;
  viewUrl?: string;
  downloadUrl?: string;
  requiresSigning?: boolean;
}

export const AdminDocumentsPage: React.FC = () => {
  useBrandTitle('Document Operations & Records');
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeCategory, setActiveCategory] = useState<DocumentCategory>(
    (searchParams.get('category')?.toUpperCase() as DocumentCategory) || 'ALL'
  );
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');

  // Preview Modal — using react-pdf canvas renderer
  const docPdfViewer = usePdfViewer();
  const [previewTitle, setPreviewTitle] = useState('');
  const [currentDownloadUrl, setCurrentDownloadUrl] = useState<string | null>(null);
  const [currentDownloadName, setCurrentDownloadName] = useState<string>('document.pdf');

  // Fetch KYC customers and their uploaded documents
  const { data: kycData, isLoading: kycLoading, refetch: refetchKyc } = useQuery({
    queryKey: ['adminDocumentsKyc'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/kyc?pageSize=100');
      const list = res.data?.customers || res.data?.data || [];
      return Array.isArray(list) ? list : [];
    },
  });

  // Fetch Loan Applications (for Approval Letters, Agreements, EMI Schedules)
  const { data: loansData, isLoading: loansLoading, refetch: refetchLoans } = useQuery({
    queryKey: ['adminDocumentsLoans'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/loan-applications?pageSize=100');
      const list = res.data?.data || res.data?.applications || [];
      return Array.isArray(list) ? list : [];
    },
  });

  // Fetch Specific Charges (for Payment Invoices)
  const { data: chargesData, isLoading: chargesLoading, refetch: refetchCharges } = useQuery({
    queryKey: ['adminDocumentsCharges'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/charges/specific?pageSize=100');
      const list = res.data?.data || [];
      return Array.isArray(list) ? list : [];
    },
  });

  const isLoading = kycLoading || loansLoading || chargesLoading;

  const handleRefreshAll = () => {
    refetchKyc();
    refetchLoans();
    refetchCharges();
  };

  // Build unified document registry
  const allDocuments: UnifiedDocument[] = [];

  // 1. KYC Documents from KYC customer records
  if (Array.isArray(kycData)) {
    kycData.forEach((cust: any) => {
      if (Array.isArray(cust.documents)) {
        cust.documents.forEach((doc: any) => {
          allDocuments.push({
            id: doc.id,
            category: 'KYC',
            categoryLabel: 'KYC Document',
            title: doc.documentType?.replace(/_/g, ' ') || 'KYC Document',
            fileName: doc.fileName,
            customerName: cust.fullName || 'Customer',
            customerMobile: cust.mobile || '',
            customerId: cust.id,
            applicationNumber: cust.applicationId || cust.loanId,
            status:
              doc.status === 'APPROVED'
                ? 'VERIFIED'
                : doc.status === 'REJECTED'
                ? 'REJECTED'
                : 'PENDING',
            statusLabel:
              doc.status === 'APPROVED'
                ? 'Verified'
                : doc.status === 'REJECTED'
                ? 'Rejected'
                : 'Pending Review',
            generatedAt: doc.uploadedAt || cust.createdAt,
            viewUrl: `/admin/documents/${doc.id}/view`,
            downloadUrl: `/admin/documents/${doc.id}/download`,
            requiresSigning: false,
          });
        });
      }
    });
  }

  // 2. Loan Approval Letters, Loan Agreements, EMI Schedules from loans
  if (Array.isArray(loansData)) {
    loansData.forEach((loan: any) => {
      const custName = loan.customer?.fullName || loan.customerName || 'Customer';
      const custMobile = loan.customer?.mobile || loan.mobile || '';
      const custId = loan.customer?.id || loan.customerId || '';
      const isApproved = loan.status === 'APPROVED' || loan.status === 'DISBURSED' || loan.status === 'ACTIVE';

      // 2A. Approval Letter
      allDocuments.push({
        id: `AL-${loan.id}`,
        category: 'APPROVAL_LETTER',
        categoryLabel: 'Loan Approval Letter',
        title: `Approval Letter #${loan.approvalNumber || loan.accountNumber || loan.applicationNumber}`,
        fileName: `Approval_Letter_${loan.applicationNumber}.pdf`,
        customerName: custName,
        customerMobile: custMobile,
        customerId: custId,
        applicationNumber: loan.applicationNumber,
        loanId: loan.id,
        status: isApproved ? 'APPROVED' : 'NOT_GENERATED',
        statusLabel: isApproved ? 'Sanctioned & Issued' : 'Not generated yet',
        generatedAt: loan.updatedAt || loan.createdAt,
        amount: loan.approvedAmount || loan.requestedAmount,
        viewUrl: isApproved ? `/admin/loans/${loan.id}/approval-letter/pdf` : undefined,
        downloadUrl: isApproved ? `/admin/loans/${loan.id}/approval-letter/pdf?download=true` : undefined,
        requiresSigning: false,
      });

      // 2B. Loan Agreement (Requires signing)
      const isSigned = loan.modifiedOfferAccepted || loan.status === 'DISBURSED' || loan.status === 'ACTIVE';
      allDocuments.push({
        id: `AGR-${loan.id}`,
        category: 'AGREEMENT',
        categoryLabel: 'Loan Agreement',
        title: `Master Loan Agreement #${loan.applicationNumber}`,
        fileName: `Loan_Agreement_${loan.applicationNumber}.pdf`,
        customerName: custName,
        customerMobile: custMobile,
        customerId: custId,
        applicationNumber: loan.applicationNumber,
        loanId: loan.id,
        status: !isApproved
          ? 'NOT_GENERATED'
          : isSigned
          ? 'SIGNED'
          : 'AWAITING_SIGNATURE',
        statusLabel: !isApproved
          ? 'Not generated yet'
          : isSigned
          ? 'Signed ✓'
          : 'Awaiting Signature',
        generatedAt: loan.updatedAt,
        amount: loan.approvedAmount || loan.requestedAmount,
        viewUrl: isApproved ? `/admin/loans/${loan.id}/agreement` : undefined,
        downloadUrl: isApproved ? `/admin/loans/${loan.id}/approval-letter/pdf?download=true` : undefined,
        requiresSigning: true,
      });

      // 2C. EMI Schedule
      allDocuments.push({
        id: `EMI-${loan.id}`,
        category: 'EMI_SCHEDULE',
        categoryLabel: 'EMI Repayment Schedule',
        title: `Repayment Schedule (${loan.tenureMonths} EMIs)`,
        fileName: `EMI_Schedule_${loan.applicationNumber}.pdf`,
        customerName: custName,
        customerMobile: custMobile,
        customerId: custId,
        applicationNumber: loan.applicationNumber,
        loanId: loan.id,
        status: isApproved ? 'APPROVED' : 'NOT_GENERATED',
        statusLabel: isApproved ? 'Generated' : 'Not generated yet',
        generatedAt: loan.updatedAt,
        amount: loan.finalEmi || loan.estimatedEmi,
        viewUrl: isApproved ? `/customer/loans/${loan.id}/emi-pdf` : undefined,
        downloadUrl: isApproved ? `/customer/loans/${loan.id}/emi-pdf?download=true` : undefined,
        requiresSigning: false,
      });
    });
  }

  // 3. Payment Invoices from verified customer-specific charges
  if (Array.isArray(chargesData)) {
    chargesData.forEach((charge: any) => {
      const custName = charge.customer?.fullName || 'Customer';
      const custMobile = charge.customer?.mobile || '';
      const isPaid = charge.status === 'PAID';
      const invoiceNo = `INV-${charge.id.slice(-6).toUpperCase()}`;

      allDocuments.push({
        id: `INV-${charge.id}`,
        category: 'INVOICE',
        categoryLabel: 'Invoice',
        title: `${charge.name} Invoice #${invoiceNo}`,
        fileName: `Invoice_${charge.name.replace(/\s+/g, '_')}_${invoiceNo}.pdf`,
        customerName: custName,
        customerMobile: custMobile,
        customerId: charge.customerId,
        applicationNumber: charge.loanApplication?.applicationNumber || charge.applicationId,
        status: isPaid ? 'APPROVED' : 'NOT_GENERATED',
        statusLabel: isPaid ? 'Paid & Issued' : 'Pending Verification (Not generated yet)',
        generatedAt: charge.paidAt || charge.createdAt,
        amount: charge.amount,
        viewUrl: isPaid ? `/admin/charges/specific/${charge.id}/invoice` : undefined,
        downloadUrl: isPaid ? `/admin/charges/specific/${charge.id}/invoice?download=true` : undefined,
        requiresSigning: false,
      });
    });
  }

  // Filter by category and search
  const filteredDocuments = allDocuments.filter((doc) => {
    if (activeCategory !== 'ALL' && doc.category !== activeCategory) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.customerName.toLowerCase().includes(q) ||
      doc.customerMobile.includes(q) ||
      (doc.applicationNumber && doc.applicationNumber.toLowerCase().includes(q)) ||
      doc.categoryLabel.toLowerCase().includes(q)
    );
  });

  // Handle category tab change
  const handleCategoryChange = (cat: DocumentCategory) => {
    setActiveCategory(cat);
    setSearchParams({ category: cat, ...(search ? { search } : {}) });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setSearchParams({ category: activeCategory, ...(searchInput.trim() ? { search: searchInput.trim() } : {}) });
  };

  // Preview handler — uses react-pdf canvas renderer
  const handleViewDocument = async (doc: UnifiedDocument) => {
    if (!doc.viewUrl) return;
    setPreviewTitle(doc.title);
    setCurrentDownloadUrl(doc.downloadUrl || doc.viewUrl);
    setCurrentDownloadName(doc.fileName || `${doc.title}.pdf`);
    await docPdfViewer.fetchAndOpen(doc.viewUrl);
  };

  // Direct download handler
  const handleDownloadPersisted = async (downloadUrl?: string, filename?: string) => {
    if (!downloadUrl) return;
    try {
      const result = await fetchAuthenticatedPdf(downloadUrl, { fallbackFileName: filename });
      downloadBlob(result.blob, result.fileName);
    } catch (err: any) {
      alert(err.message || 'Failed to download document.');
    }
  };

  // Counts per category
  const categoryCounts = {
    ALL: allDocuments.length,
    KYC: allDocuments.filter((d) => d.category === 'KYC').length,
    APPROVAL_LETTER: allDocuments.filter((d) => d.category === 'APPROVAL_LETTER').length,
    INVOICE: allDocuments.filter((d) => d.category === 'INVOICE').length,
    AGREEMENT: allDocuments.filter((d) => d.category === 'AGREEMENT').length,
    EMI_SCHEDULE: allDocuments.filter((d) => d.category === 'EMI_SCHEDULE').length,
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-6 rounded-2xl border border-border shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight flex items-center gap-2">
              <FileCheck className="w-6 h-6 text-primary" /> Admin Document Management Center
            </h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold">
              Official Records
            </Badge>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Access, audit, view, and stream verified KYC documents, sanctioned Approval Letters, Payment Invoices, and digital Loan Agreements.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefreshAll}
          disabled={isLoading}
          className="self-start sm:self-auto text-xs h-9 border-border"
        >
          <RotateCcw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Records
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex border-b border-border space-x-2 overflow-x-auto text-xs font-semibold pb-1">
        {[
          { id: 'ALL', label: 'All Documents', icon: FolderOpen, count: categoryCounts.ALL },
          { id: 'KYC', label: 'KYC Documents', icon: ShieldCheck, count: categoryCounts.KYC },
          { id: 'APPROVAL_LETTER', label: 'Approval Letters', icon: FileCheck, count: categoryCounts.APPROVAL_LETTER },
          { id: 'INVOICE', label: 'Invoices & Receipts', icon: Receipt, count: categoryCounts.INVOICE },
          { id: 'AGREEMENT', label: 'Loan Agreements', icon: FileSignature, count: categoryCounts.AGREEMENT },
          { id: 'EMI_SCHEDULE', label: 'EMI Schedules', icon: Calendar, count: categoryCounts.EMI_SCHEDULE },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeCategory === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleCategoryChange(tab.id as DocumentCategory)}
              className={`py-2.5 px-3.5 border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 rounded-t-lg ${
                isActive
                  ? 'border-primary text-primary font-bold bg-primary/10'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <Badge
                className={`text-[10px] font-mono ${
                  isActive ? 'bg-primary text-primary-foreground font-bold' : 'bg-surface-elevated text-text-secondary border border-border'
                }`}
              >
                {tab.count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Search & Filter Bar */}
      <Card className="shadow-sm border-border bg-surface">
        <CardContent className="p-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-2.5" />
              <Input
                placeholder="Search by customer name, mobile, application #, or document title..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9 text-xs sm:text-sm h-10 border-border"
              />
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 px-5">
              Search
            </Button>
            {search && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setSearchInput('');
                  setSearchParams({ category: activeCategory });
                }}
                className="h-10 px-3 border-border text-xs"
              >
                Clear
              </Button>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Document List View */}
      <Card className="shadow-sm border-border bg-surface">
        <CardHeader className="pb-3 border-b border-border flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-bold text-text-primary">
              {activeCategory === 'ALL' && 'All Customer Documents'}
              {activeCategory === 'KYC' && 'Customer KYC & Identity Documents'}
              {activeCategory === 'APPROVAL_LETTER' && 'Sanction & Loan Approval Letters'}
              {activeCategory === 'INVOICE' && 'Fee & Charge Tax Invoices'}
              {activeCategory === 'AGREEMENT' && 'Master Loan Agreements'}
              {activeCategory === 'EMI_SCHEDULE' && 'EMI Repayment Schedules'}
              <span className="text-text-secondary font-normal ml-1">({filteredDocuments.length} records)</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Every persisted document can be viewed inline or streamed directly from authoritative server storage.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-text-secondary font-medium">Loading document repository...</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-16 text-center">
              <FolderOpen className="w-10 h-10 text-text-secondary mx-auto mb-2 opacity-50" />
              <h3 className="text-sm font-bold text-text-primary">No documents found</h3>
              <p className="text-xs text-text-secondary mt-1">
                No files matching your search or category filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-elevated border-b border-border text-text-secondary font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Document Type</th>
                    <th className="py-3 px-4">Title & Details</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">App #</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredDocuments.map((doc) => {
                    const isGenerated = doc.status !== 'NOT_GENERATED' && doc.viewUrl;

                    return (
                      <tr key={doc.id} className="hover:bg-surface-elevated/60 transition-colors">
                        {/* Type Badge */}
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-[10px] font-bold ${
                              doc.category === 'KYC'
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : doc.category === 'APPROVAL_LETTER'
                                ? 'bg-success/15 text-success border-success/30'
                                : doc.category === 'INVOICE'
                                ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                                : doc.category === 'AGREEMENT'
                                ? 'bg-blue-600/15 text-blue-700 border-blue-600/30'
                                : 'bg-surface-elevated text-text-secondary border border-border'
                            }`}
                          >
                            {doc.categoryLabel}
                          </Badge>
                        </td>

                        {/* Title & Date */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-text-primary">{doc.title}</div>
                          <div className="text-[11px] text-text-secondary">
                            {doc.fileName && <span>{doc.fileName} • </span>}
                            {doc.generatedAt && (
                              <span>
                                {new Date(doc.generatedAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-text-primary">{doc.customerName}</div>
                          <div className="text-[11px] text-text-secondary">+91 {doc.customerMobile}</div>
                        </td>

                        {/* Application # */}
                        <td className="py-3 px-4 font-mono text-text-secondary">
                          {doc.applicationNumber || '—'}
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4">
                          <Badge
                            className={`text-[10px] font-bold ${
                              doc.status === 'VERIFIED' || doc.status === 'APPROVED' || doc.status === 'SIGNED'
                                ? 'bg-success text-background'
                                : doc.status === 'AWAITING_SIGNATURE'
                                ? 'bg-warning text-background'
                                : doc.status === 'REJECTED'
                                ? 'bg-danger text-text-primary'
                                : 'bg-surface-elevated text-text-secondary border border-border'
                            }`}
                          >
                            {doc.statusLabel}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isGenerated ? (
                              <>
                                {/* [ View ] */}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewDocument(doc)}
                                  className="h-7 px-2.5 text-[11px] border-border"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  View
                                </Button>

                                {/* [ Download PDF ] */}
                                <Button
                                  size="sm"
                                  onClick={() => handleDownloadPersisted(doc.downloadUrl, doc.fileName)}
                                  className="h-7 px-2.5 text-[11px] bg-primary text-primary-foreground font-semibold hover:bg-primary/90"
                                >
                                  <Download className="w-3 h-3 mr-1" />
                                  Download PDF
                                </Button>

                                {/* Loan Agreement Status Indicator */}
                                {doc.category === 'AGREEMENT' && doc.status === 'AWAITING_SIGNATURE' && (
                                  <Badge className="bg-warning/15 text-warning border border-warning/30 text-[10px]">
                                    Awaiting Customer Signature
                                  </Badge>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] text-text-secondary italic px-2">
                                Not generated yet
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* DOCUMENT PREVIEW MODAL — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={docPdfViewer.open}
        onClose={docPdfViewer.closeModal}
        blob={docPdfViewer.blob}
        blobUrl={docPdfViewer.blobUrl}
        pdfBytes={docPdfViewer.pdfBytes}
        isImage={docPdfViewer.isImage}
        loading={docPdfViewer.loading}
        fetchError={docPdfViewer.error}
        title={previewTitle || 'Document'}
        description="Official document stream from authoritative server storage."
        downloadFilename={currentDownloadName || 'document.pdf'}
        onDownload={currentDownloadUrl ? () => handleDownloadPersisted(currentDownloadUrl, currentDownloadName) : undefined}
        onRetry={docPdfViewer.retry}
      />
    </div>
  );
};

export default AdminDocumentsPage;

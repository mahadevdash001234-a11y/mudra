import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Layers,
  RefreshCw,
  Archive,
  Check,
  X,
  FileCheck,
  Building2,
  Home,
  CreditCard,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { API_ENDPOINTS } from '../../api/endpoints';
import { usePdfViewer } from '../../hooks/usePdfViewer';
import PdfViewerModal from '../shared/PdfViewerModal';

export interface CustomerDocumentItem {
  id: string;
  documentType: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType: string;
  status: string;
  version: number;
  isCurrentVersion: boolean;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  uploadedAt: string;
  fileUrl?: string;
  versionsCount?: number;
  versions?: Array<CustomerDocumentItem>;
}

interface CustomerDocumentsResponse {
  customer: {
    id: string;
    fullName: string;
    email: string;
    mobile: string;
    kycStatus: string;
    status: string;
  };
  documents: CustomerDocumentItem[];
  pendingRequests: Array<{
    id: string;
    documentType: string;
    title: string;
    description?: string | null;
    status: string;
    requestedBy?: string | null;
    createdAt: string;
  }>;
  summary: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
    correctionRequired: number;
  };
}

interface Props {
  customerId: string;
  customerName?: string;
}

export const CustomerDocumentsSection: React.FC<Props> = ({
  customerId,
  customerName = 'Customer',
}) => {
  const queryClient = useQueryClient();

  // Modals state
  const pdfViewer = usePdfViewer();
  const [pdfDoc, setPdfDoc] = useState<CustomerDocumentItem | null>(null);
  const [previewDoc, setPreviewDoc] = useState<CustomerDocumentItem | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [rejectingDoc, setRejectingDoc] = useState<CustomerDocumentItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [correctionDoc, setCorrectionDoc] = useState<CustomerDocumentItem | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');

  const [versionHistoryDoc, setVersionHistoryDoc] = useState<CustomerDocumentItem | null>(null);

  const [isDownloadAllModalOpen, setIsDownloadAllModalOpen] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [downloadStep, setDownloadStep] = useState<
    'idle' | 'preparing' | 'generating' | 'starting'
  >('idle');
  const [downloadingIndividualId, setDownloadingIndividualId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Query: Documents
  const { data, isLoading, isError, error, refetch } = useQuery<{
    success: boolean;
    data: CustomerDocumentsResponse;
  }>({
    queryKey: ['admin-customer-documents', customerId],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.DOCUMENTS.CUSTOMER_LIST(customerId), {
        tokenType: 'admin',
      });
      return res;
    },
    enabled: Boolean(customerId),
    refetchInterval: 1500,
  });

  const documents = data?.data?.documents || [];
  const summary = data?.data?.summary || {
    total: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    correctionRequired: 0,
  };

  // Helper: Format file size
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Helper: Document Type info
  const getDocTypeInfo = (type: string) => {
    switch (type) {
      case 'AADHAAR_FRONT':
        return { label: 'Aadhaar Card (Front)', category: 'Identity', Icon: UserCheck };
      case 'AADHAAR_BACK':
        return { label: 'Aadhaar Card (Back)', category: 'Identity', Icon: UserCheck };
      case 'PAN':
        return { label: 'PAN Card', category: 'Identity', Icon: CreditCard };
      case 'BANK_STATEMENT':
        return { label: 'Bank Statement', category: 'Financial', Icon: Building2 };
      case 'SALARY_SLIP':
      case 'INCOME_PROOF':
        return { label: 'Salary Slip', category: 'Income', Icon: FileCheck };
      case 'ADDRESS_PROOF':
        return { label: 'Address Proof', category: 'Address', Icon: Home };
      default:
        return { label: type.replace(/_/g, ' '), category: 'General', Icon: FileText };
    }
  };

  // Helper: Status badge
  const getStatusBadge = (status: string) => {
    const norm = (status || '').toUpperCase();
    if (norm === 'APPROVED' || norm === 'VERIFIED') {
      return {
        label: 'VERIFIED',
        classes: 'bg-success/15 text-success border-success/40',
      };
    }
    if (norm === 'PENDING') {
      return {
        label: 'PENDING',
        classes: 'bg-warning/15 text-warning border-[#F5B942]/40',
      };
    }
    if (norm === 'UNDER_REVIEW') {
      return {
        label: 'UNDER REVIEW',
        classes: 'bg-primary/15 text-[#a39eff] border-primary/40',
      };
    }
    if (norm === 'REJECTED') {
      return {
        label: 'REJECTED',
        classes: 'bg-danger/15 text-danger border-[#FF5C70]/40',
      };
    }
    if (norm === 'REUPLOAD_REQUIRED' || norm === 'CORRECTION_REQUIRED') {
      return {
        label: 'CORRECTION REQUIRED',
        classes: 'bg-warning/15 text-warning border-warning/40',
      };
    }
    return {
      label: norm || 'UNKNOWN',
      classes: 'bg-slate-700/40 text-text-secondary border-slate-600/40',
    };
  };

  // Action: Open Preview
  const handleOpenPreview = async (doc: CustomerDocumentItem) => {
    const isPdf = doc.mimeType?.toLowerCase().includes('pdf') || doc.fileName?.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      setPdfDoc(doc);
      await pdfViewer.fetchAndOpen(API_ENDPOINTS.DOCUMENTS.VIEW(doc.id));
      return;
    }

    setPreviewDoc(doc);
    setPreviewLoading(true);
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }

    try {
      const res = await apiClient.get(API_ENDPOINTS.DOCUMENTS.VIEW(doc.id), {
        responseType: 'blob',
        tokenType: 'admin',
      });

      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: doc.mimeType });
      const objectUrl = window.URL.createObjectURL(blob);
      setPreviewBlobUrl(objectUrl);
    } catch {
      setActionError('Failed to load document preview. You can still download the file.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewDoc(null);
  };

  // Action: Download Single Document
  const handleDownloadSingle = async (doc: CustomerDocumentItem) => {
    setDownloadingIndividualId(doc.id);
    setActionError(null);
    try {
      const res = await apiClient.get(API_ENDPOINTS.DOCUMENTS.DOWNLOAD(doc.id), {
        responseType: 'blob',
        tokenType: 'admin',
      });

      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: doc.mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || `document_${doc.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setActionError('Failed to download document. Please try again.');
    } finally {
      setDownloadingIndividualId(null);
    }
  };

  // Action: Open Download All Modal
  const handleOpenDownloadAll = () => {
    setSelectedDocIds(documents.map((d) => d.id));
    setDownloadStep('idle');
    setIsDownloadAllModalOpen(true);
  };

  // Action: Trigger Download ZIP
  const handleExecuteZipDownload = async () => {
    if (selectedDocIds.length === 0) return;
    setActionError(null);
    setDownloadStep('preparing');

    setTimeout(() => {
      setDownloadStep('generating');
    }, 400);

    try {
      setTimeout(async () => {
        setDownloadStep('starting');
        const res = await apiClient.post(
          API_ENDPOINTS.DOCUMENTS.DOWNLOAD_ZIP(customerId),
          { documentIds: selectedDocIds },
          { responseType: 'blob', tokenType: 'admin' }
        );

        const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = customerName.replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `Customer_Documents_${safeName}_${customerId.slice(0, 8)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        setIsDownloadAllModalOpen(false);
        setDownloadStep('idle');
      }, 700);
    } catch {
      setActionError('Failed to generate ZIP archive. Please verify document access.');
      setDownloadStep('idle');
    }
  };

  // Mutation: Verify Document
  const verifyMutation = useMutation({
    mutationFn: async (docId: string) => {
      return apiClient.post(API_ENDPOINTS.DOCUMENTS.VERIFY(docId), {}, { tokenType: 'admin' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-documents', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-detail', customerId] });
    },
    onError: (err: unknown) => {
      setActionError((err as Error)?.message || 'Failed to verify document');
    },
  });

  // Mutation: Reject Document
  const rejectMutation = useMutation({
    mutationFn: async ({ docId, reason }: { docId: string; reason: string }) => {
      return apiClient.post(
        API_ENDPOINTS.DOCUMENTS.REJECT(docId),
        { reason },
        { tokenType: 'admin' }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-documents', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-detail', customerId] });
      setRejectingDoc(null);
      setRejectReason('');
    },
    onError: (err: unknown) => {
      setActionError((err as Error)?.message || 'Failed to reject document');
    },
  });

  // Mutation: Request Correction
  const correctionMutation = useMutation({
    mutationFn: async ({ docId, reason }: { docId: string; reason: string }) => {
      return apiClient.post(
        API_ENDPOINTS.DOCUMENTS.REQUEST_CORRECTION(docId),
        { reason },
        { tokenType: 'admin' }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-customer-documents', customerId] });
      queryClient.invalidateQueries({ queryKey: ['admin-customer-detail', customerId] });
      setCorrectionDoc(null);
      setCorrectionReason('');
    },
    onError: (err: unknown) => {
      setActionError((err as Error)?.message || 'Failed to request correction');
    },
  });

  // ==========================================
  // RENDER: LOADING STATE (Skeleton)
  // ==========================================
  if (isLoading) {
    return (
      <div className="bg-surface-elevated border border-border rounded-2xl p-6 space-y-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-48 bg-surface-elevated rounded-lg" />
            <div className="h-4 w-64 bg-surface-elevated/60 rounded" />
          </div>
          <div className="h-10 w-36 bg-surface-elevated rounded-xl" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 bg-surface-elevated/40 rounded-xl border border-border flex items-center justify-between px-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-700/50" />
                <div className="space-y-1">
                  <div className="h-4 w-32 bg-slate-700/50 rounded" />
                  <div className="h-3 w-24 bg-slate-700/30 rounded" />
                </div>
              </div>
              <div className="h-7 w-20 bg-slate-700/40 rounded-full" />
              <div className="h-8 w-28 bg-slate-700/50 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: ERROR STATE
  // ==========================================
  if (isError) {
    const errorStatus = (error as { status?: number })?.status;
    let errorMessage = 'Unable to load documents.';
    if (errorStatus === 401) errorMessage = 'Session expired. Please log in again.';
    else if (errorStatus === 403) errorMessage = 'Access forbidden: Administrator privileges required.';
    else if (errorStatus === 404) errorMessage = 'Customer record not found.';
    else if (errorStatus === 500) errorMessage = 'Server error occurred while fetching documents.';

    return (
      <div className="bg-surface-elevated border border-danger/30 rounded-2xl p-8 text-center max-w-xl mx-auto my-6">
        <AlertCircle className="w-10 h-10 text-danger mx-auto mb-3" />
        <h3 className="text-lg font-bold text-text-primary">Unable to load documents</h3>
        <p className="text-sm text-text-secondary mt-1 mb-5">{errorMessage}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary hover:bg-[#5b52e0] text-text-primary text-sm font-semibold rounded-xl transition-colors shadow-sm inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  // ==========================================
  // MAIN COMPONENT VIEW
  // ==========================================
  return (
    <div className="space-y-6">
      {/* Alert Banner for errors */}
      {actionError && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex items-center justify-between text-sm text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-danger hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 1: HEADER & PRIMARY ACTION */}
      <div className="bg-surface-elevated border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black tracking-tight text-text-primary">Customer Documents</h2>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-primary/20 text-[#a39eff] border border-primary/30">
                Documents ({documents.length})
              </span>
            </div>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Documents submitted by this customer
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenDownloadAll}
              disabled={documents.length === 0}
              className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all shadow-sm ${
                documents.length === 0
                  ? 'bg-surface-elevated text-text-secondary cursor-not-allowed border border-border'
                  : 'bg-primary hover:bg-[#5b52e0] text-text-primary cursor-pointer active:scale-98'
              }`}
            >
              <Archive className="w-4 h-4" />
              Download All
            </button>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="bg-surface/60 border border-border rounded-xl p-3">
            <span className="text-[11px] font-medium text-text-secondary uppercase tracking-wider">Total</span>
            <p className="text-lg font-bold text-text-primary mt-0.5">{summary.total}</p>
          </div>
          <div className="bg-surface/60 border border-border rounded-xl p-3">
            <span className="text-[11px] font-medium text-success uppercase tracking-wider">Verified</span>
            <p className="text-lg font-bold text-success mt-0.5">{summary.verified}</p>
          </div>
          <div className="bg-surface/60 border border-border rounded-xl p-3">
            <span className="text-[11px] font-medium text-warning uppercase tracking-wider">Pending</span>
            <p className="text-lg font-bold text-warning mt-0.5">{summary.pending}</p>
          </div>
          <div className="bg-surface/60 border border-border rounded-xl p-3">
            <span className="text-[11px] font-medium text-warning uppercase tracking-wider">Correction</span>
            <p className="text-lg font-bold text-warning mt-0.5">{summary.correctionRequired}</p>
          </div>
        </div>
      </div>

      {/* SECTION 2: DOCUMENT TABLE & EMPTY STATE */}
      <div className="bg-surface-elevated border border-border rounded-2xl overflow-hidden shadow-sm">
        {documents.length === 0 ? (
          /* SECTION 15: EMPTY STATE */
          <div className="py-16 px-4 text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4 text-text-secondary">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-text-primary">No documents submitted yet.</h3>
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
              Documents uploaded by the customer will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-text-primary">
              <thead className="bg-surface/80 text-text-secondary border-b border-border uppercase text-[10px] tracking-wider font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Document</th>
                  <th className="py-3.5 px-3">Document Type</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Uploaded Date</th>
                  <th className="py-3.5 px-3">File Size</th>
                  <th className="py-3.5 px-3">Version</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D3047]/60">
                {documents.map((doc) => {
                  const typeInfo = getDocTypeInfo(doc.documentType);
                  const statusBadge = getStatusBadge(doc.status);
                  const Icon = typeInfo.Icon;
                  const isDownloading = downloadingIndividualId === doc.id;
                  const normStatus = (doc.status || '').toUpperCase();
                  const isPending = normStatus === 'PENDING' || normStatus === 'UNDER_REVIEW';
                  const isRejected = normStatus === 'REJECTED';
                  const isCorrection = normStatus === 'REUPLOAD_REQUIRED' || normStatus === 'CORRECTION_REQUIRED';

                  return (
                    <tr
                      key={doc.id}
                      className="hover:bg-surface/40 transition-colors group"
                    >
                      {/* 1. Document Name & Icon */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-primary group-hover:border-focus/40 transition-colors flex-shrink-0">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="font-bold text-text-primary block text-xs">
                              {typeInfo.label}
                            </span>
                            <span className="text-[11px] text-text-secondary truncate max-w-[180px] block font-mono">
                              {doc.fileName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Document Type */}
                      <td className="py-3.5 px-3">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-semibold bg-surface-elevated text-text-secondary border border-border/60">
                          {typeInfo.category}
                        </span>
                      </td>

                      {/* 3. Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.classes}`}
                        >
                          {statusBadge.label}
                        </span>
                        {doc.rejectionReason && (
                          <p className="text-[10px] text-danger mt-1 line-clamp-1 italic max-w-[140px]" title={doc.rejectionReason}>
                            Reason: {doc.rejectionReason}
                          </p>
                        )}
                      </td>

                      {/* 4. Uploaded Date */}
                      <td className="py-3.5 px-3 text-text-secondary whitespace-nowrap text-[11px]">
                        {new Date(doc.uploadedAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      {/* 5. File Size */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-text-secondary">
                        {formatFileSize(doc.fileSize)}
                      </td>

                      {/* 6. Version */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-xs text-text-primary">
                            v{doc.version}
                          </span>
                          {(doc.versionsCount || 0) > 1 && (
                            <button
                              onClick={() => setVersionHistoryDoc(doc)}
                              title="View version history"
                              className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary/20 text-[#a39eff] border border-primary/40 hover:bg-primary/30 transition-colors flex items-center gap-0.5"
                            >
                              <Layers className="w-2.5 h-2.5" />
                              {doc.versionsCount}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 7. Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View */}
                          <button
                            onClick={() => handleOpenPreview(doc)}
                            title="View Document"
                            className="p-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-focus/60 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Download */}
                          <button
                            onClick={() => handleDownloadSingle(doc)}
                            disabled={isDownloading}
                            title="Download Document"
                            className="p-1.5 rounded-lg bg-surface border border-border text-text-secondary hover:text-success hover:border-success/60 transition-colors disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-success" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>

                          {/* Status-Based Admin Actions */}
                          {isPending && (
                            <>
                              <button
                                onClick={() => verifyMutation.mutate(doc.id)}
                                disabled={verifyMutation.isPending}
                                title="Verify Document"
                                className="px-2 py-1 rounded-lg bg-success/15 border border-success/40 text-success hover:bg-success/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <Check className="w-3 h-3" />
                                Verify
                              </button>
                              <button
                                onClick={() => setRejectingDoc(doc)}
                                title="Reject Document"
                                className="px-2 py-1 rounded-lg bg-danger/15 border border-[#FF5C70]/40 text-danger hover:bg-[#FF5C70]/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <X className="w-3 h-3" />
                                Reject
                              </button>
                              <button
                                onClick={() => setCorrectionDoc(doc)}
                                title="Request Correction"
                                className="px-2 py-1 rounded-lg bg-warning/15 border border-warning/40 text-warning hover:bg-amber-500/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <AlertCircle className="w-3 h-3" />
                                Correction
                              </button>
                            </>
                          )}

                          {isRejected && (
                            <button
                              onClick={() => setCorrectionDoc(doc)}
                              title="Request Re-upload"
                              className="px-2 py-1 rounded-lg bg-warning/15 border border-warning/40 text-warning hover:bg-amber-500/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Re-upload
                            </button>
                          )}

                          {isCorrection && (
                            <button
                              onClick={() => verifyMutation.mutate(doc.id)}
                              disabled={verifyMutation.isPending}
                              title="Verify Corrected Document"
                              className="px-2 py-1 rounded-lg bg-success/15 border border-success/40 text-success hover:bg-success/25 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            >
                              <Check className="w-3 h-3" />
                              Verify
                            </button>
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
      </div>

      {/* ==========================================
          SECTION 5: DOCUMENT VIEWER MODAL
      ========================================== */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-surface">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-text-primary">
                    {getDocTypeInfo(previewDoc.documentType).label}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-surface-elevated text-text-secondary border border-border">
                    v{previewDoc.version}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(previewDoc.status).classes}`}
                  >
                    {getStatusBadge(previewDoc.status).label}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mt-0.5 font-mono">{previewDoc.fileName}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadSingle(previewDoc)}
                  className="px-3 py-1.5 rounded-xl bg-primary hover:bg-[#5b52e0] text-text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  onClick={handleClosePreview}
                  className="p-1.5 rounded-xl bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metadata Bar */}
            <div className="px-6 py-2.5 bg-surface/50 border-b border-border grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-text-secondary text-[10px] block">Uploaded Date</span>
                <span className="text-text-primary font-medium">
                  {new Date(previewDoc.uploadedAt).toLocaleString('en-GB')}
                </span>
              </div>
              <div>
                <span className="text-text-secondary text-[10px] block">File Size</span>
                <span className="text-text-primary font-mono">{formatFileSize(previewDoc.fileSize)}</span>
              </div>
              <div>
                <span className="text-text-secondary text-[10px] block">MIME Type</span>
                <span className="text-text-primary font-mono">{previewDoc.mimeType}</span>
              </div>
              <div>
                <span className="text-text-secondary text-[10px] block">Reviewed By</span>
                <span className="text-text-primary">{previewDoc.reviewedBy || 'Not reviewed'}</span>
              </div>
            </div>

            {/* Preview Viewport */}
            <div className="flex-1 overflow-auto p-6 bg-background flex items-center justify-center min-h-[380px]">
              {previewLoading ? (
                <div className="text-center text-text-secondary space-y-2">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <p className="text-xs">Preparing document preview...</p>
                </div>
              ) : previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt={previewDoc.fileName}
                  className="max-h-[540px] max-w-full rounded-xl border border-border object-contain shadow-md"
                />
              ) : (
                <div className="text-center text-text-secondary p-8">
                  <AlertCircle className="w-8 h-8 text-warning mx-auto mb-2" />
                  <p className="text-sm font-semibold text-text-primary">Preview not available inline</p>
                  <p className="text-xs text-text-secondary mt-1 mb-4">
                    Please use the download button to inspect the document locally.
                  </p>
                  <button
                    onClick={() => handleDownloadSingle(previewDoc)}
                    className="px-4 py-2 bg-primary text-text-primary rounded-xl text-xs font-semibold"
                  >
                    Download File
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-border bg-surface flex justify-end">
              <button
                onClick={handleClosePreview}
                className="px-4 py-2 rounded-xl bg-surface-elevated text-text-secondary hover:text-text-primary text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SECTION 7 & 8: DOWNLOAD ALL / ZIP MODAL
      ========================================== */}
      {isDownloadAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">Download Customer Documents</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Select documents belonging to {customerName} to bundle into a ZIP archive.
                </p>
              </div>
              <button
                onClick={() => setIsDownloadAllModalOpen(false)}
                disabled={downloadStep !== 'idle'}
                className="p-1 text-text-secondary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Quick Select Buttons */}
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border">
                <span className="text-text-secondary">
                  Selected: <strong className="text-text-primary">{selectedDocIds.length}</strong> of{' '}
                  {documents.length}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDocIds(documents.map((d) => d.id))}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={() => setSelectedDocIds([])}
                    className="text-[11px] font-semibold text-text-secondary hover:underline"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Document Checkbox List */}
              <div className="space-y-2">
                {documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  const typeInfo = getDocTypeInfo(doc.documentType);
                  return (
                    <label
                      key={doc.id}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-surface border-primary/60 text-text-primary'
                          : 'bg-surface/40 border-border text-text-secondary opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocIds([...selectedDocIds, doc.id]);
                            } else {
                              setSelectedDocIds(selectedDocIds.filter((id) => id !== doc.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-primary bg-surface border-border focus:ring-0 focus:ring-offset-0"
                        />
                        <div>
                          <p className="text-xs font-bold text-text-primary">{typeInfo.label}</p>
                          <p className="text-[10px] text-text-secondary font-mono">
                            v{doc.version} • {formatFileSize(doc.fileSize)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(doc.status).classes}`}
                      >
                        {getStatusBadge(doc.status).label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer with Download Status */}
            <div className="px-6 py-4 border-t border-border bg-surface flex items-center justify-between">
              <button
                onClick={() => setIsDownloadAllModalOpen(false)}
                disabled={downloadStep !== 'idle'}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-elevated transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleExecuteZipDownload}
                disabled={selectedDocIds.length === 0 || downloadStep !== 'idle'}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-text-primary transition-all shadow-sm flex items-center gap-2 ${
                  selectedDocIds.length === 0 || downloadStep !== 'idle'
                    ? 'bg-surface-elevated text-text-secondary cursor-not-allowed border border-border'
                    : 'bg-primary hover:bg-[#5b52e0] cursor-pointer active:scale-98'
                }`}
              >
                {downloadStep === 'idle' && (
                  <>
                    <Archive className="w-4 h-4" />
                    Download ZIP ({selectedDocIds.length})
                  </>
                )}
                {downloadStep === 'preparing' && (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Preparing documents...
                  </>
                )}
                {downloadStep === 'generating' && (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-success" />
                    Generating ZIP...
                  </>
                )}
                {downloadStep === 'starting' && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    Download starting...
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SECTION 10: VERSION HISTORY MODAL
      ========================================== */}
      {versionHistoryDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">
                  {getDocTypeInfo(versionHistoryDoc.documentType).label} History
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Inspection of uploaded revisions
                </p>
              </div>
              <button
                onClick={() => setVersionHistoryDoc(null)}
                className="p-1 text-text-secondary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
              {(versionHistoryDoc.versions || [versionHistoryDoc]).map((v) => {
                const statusBadge = getStatusBadge(v.status);
                return (
                  <div
                    key={v.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between ${
                      v.isCurrentVersion
                        ? 'bg-surface border-primary/50 shadow-xs'
                        : 'bg-surface/40 border-border'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-text-primary">
                          v{v.version}
                        </span>
                        {v.isCurrentVersion ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/20 text-[#a39eff] border border-primary/30">
                            Current
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-secondary">Previous</span>
                        )}
                        <span
                          className={`text-[9px] font-bold px-2 py-0.2 rounded-full border ${statusBadge.classes}`}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary mt-1">
                        {new Date(v.uploadedAt).toLocaleDateString('en-GB')} •{' '}
                        {formatFileSize(v.fileSize)}
                      </p>
                      {v.rejectionReason && (
                        <p className="text-[10px] text-danger mt-0.5 italic">
                          {v.rejectionReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenPreview(v)}
                        title="View"
                        className="p-1.5 rounded-lg bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDownloadSingle(v)}
                        title="Download"
                        className="p-1.5 rounded-lg bg-surface-elevated text-text-secondary hover:text-success transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-3 border-t border-border bg-surface flex justify-end">
              <button
                onClick={() => setVersionHistoryDoc(null)}
                className="px-4 py-2 rounded-xl bg-surface-elevated text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          SECTION 12: REQUEST CORRECTION MODAL
      ========================================== */}
      {correctionDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary">Request Correction</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Document: <strong className="text-text-primary">{getDocTypeInfo(correctionDoc.documentType).label}</strong>
                </p>
              </div>
              <button
                onClick={() => setCorrectionDoc(null)}
                className="p-1 text-text-secondary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <label className="text-xs font-semibold text-text-secondary block">
                Correction Instructions / Reason: <span className="text-danger">*</span>
              </label>
              <textarea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="E.g., The corners of the Aadhaar card are cut off. Please re-upload a clear scanned copy showing full name and QR code."
                rows={4}
                className="w-full bg-surface border border-border rounded-xl p-3 text-xs text-text-primary focus:border-primary focus:outline-none placeholder:text-slate-600"
              />
            </div>

            <div className="px-6 py-3 border-t border-border bg-surface flex items-center justify-end gap-3">
              <button
                onClick={() => setCorrectionDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  correctionMutation.mutate({
                    docId: correctionDoc.id,
                    reason: correctionReason,
                  })
                }
                disabled={!correctionReason.trim() || correctionMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold text-text-primary bg-warning text-background hover:bg-amber-500 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {correctionMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                Request Correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          REJECT DOCUMENT MODAL
      ========================================== */}
      {rejectingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-surface-elevated border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-danger">Reject Document</h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Document: <strong className="text-text-primary">{getDocTypeInfo(rejectingDoc.documentType).label}</strong>
                </p>
              </div>
              <button
                onClick={() => setRejectingDoc(null)}
                className="p-1 text-text-secondary hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <label className="text-xs font-semibold text-text-secondary block">
                Rejection Reason: <span className="text-danger">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="E.g., Name on the PAN card does not match the application record."
                rows={4}
                className="w-full bg-surface border border-border rounded-xl p-3 text-xs text-text-primary focus:border-[#FF5C70] focus:outline-none placeholder:text-slate-600"
              />
            </div>

            <div className="px-6 py-3 border-t border-border bg-surface flex items-center justify-end gap-3">
              <button
                onClick={() => setRejectingDoc(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary bg-surface-elevated transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  rejectMutation.mutate({
                    docId: rejectingDoc.id,
                    reason: rejectReason,
                  })
                }
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold text-text-primary bg-[#FF5C70] hover:bg-red-600 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {rejectMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
                Reject Document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Document Viewer Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={pdfViewer.open}
        onClose={() => {
          pdfViewer.closeModal();
          setPdfDoc(null);
        }}
        blob={pdfViewer.blob}
        blobUrl={pdfViewer.blobUrl}
        pdfBytes={pdfViewer.pdfBytes}
        isImage={pdfViewer.isImage}
        loading={pdfViewer.loading}
        fetchError={pdfViewer.error}
        title={pdfDoc ? `${getDocTypeInfo(pdfDoc.documentType).label} — ${pdfDoc.fileName}` : 'Document Preview'}
        description="Customer uploaded document"
        downloadFilename={pdfDoc?.fileName || 'document.pdf'}
        onDownload={() => pdfDoc && handleDownloadSingle(pdfDoc)}
        onRetry={pdfViewer.retry}
      />
    </div>
  );
};

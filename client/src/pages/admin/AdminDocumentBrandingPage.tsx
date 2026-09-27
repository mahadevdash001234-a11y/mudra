import React, { useEffect, useState, useRef } from 'react';
import { api } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { useBranding } from '@/contexts/BrandingContext';
import { usePdfViewer } from '@/hooks/usePdfViewer';
import PdfViewerModal from '@/components/shared/PdfViewerModal';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Check,
  Trash2,
  FileText,
  SlidersHorizontal,
  Info,
} from 'lucide-react';

export const AdminDocumentBrandingPage: React.FC = () => {
  const { refreshBranding } = useBranding();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Upload states
  const [uploadingHeader, setUploadingHeader] = useState(false);
  const [uploadingWatermark, setUploadingWatermark] = useState(false);

  const headerFileInputRef = useRef<HTMLInputElement | null>(null);
  const watermarkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Form fields
  const [approvalLetterHeaderUrl, setApprovalLetterHeaderUrl] = useState('');
  const [watermarkLogoUrl, setWatermarkLogoUrl] = useState('');
  const [documentWatermarkEnabled, setDocumentWatermarkEnabled] = useState(true);
  const [invoiceWatermarkEnabled, setInvoiceWatermarkEnabled] = useState(true);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.10);
  const [watermarkSize, setWatermarkSize] = useState('MEDIUM');
  const [watermarkPosition, setWatermarkPosition] = useState('CENTER');
  const [primaryLogoUrl, setPrimaryLogoUrl] = useState('');

  // Live PDF Preview Modal State — using react-pdf canvas renderer
  const [previewType, setPreviewType] = useState<'APPROVAL_LETTER' | 'INVOICE'>('APPROVAL_LETTER');
  const pdfViewer = usePdfViewer();

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const res = await api.get(API_ENDPOINTS.SETTINGS.DOCUMENT_BRANDING_GET);
      const data = res.data?.data || res.data;
      if (data) {
        setApprovalLetterHeaderUrl(data.approvalLetterHeaderUrl || '');
        setWatermarkLogoUrl(data.watermarkLogoUrl || '');
        setDocumentWatermarkEnabled(data.documentWatermarkEnabled !== false);
        setInvoiceWatermarkEnabled(data.invoiceWatermarkEnabled !== false);
        setWatermarkOpacity(typeof data.watermarkOpacity === 'number' ? data.watermarkOpacity : 0.10);
        setWatermarkSize(data.watermarkSize || 'MEDIUM');
        setWatermarkPosition(data.watermarkPosition || 'CENTER');
        setPrimaryLogoUrl(data.primaryLogoUrl || '');
      }
    } catch (err: unknown) {
      console.error('Failed to load document branding settings:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load document branding settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // No blob URL cleanup needed — usePdfViewer manages arraybuffer internally

  const handleHeaderFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg|webp|svg\+xml)$/)) {
      setErrorMessage('Invalid file format. Please upload a PNG, JPG, WebP, or SVG file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('File size exceeds 2MB limit. Please upload a smaller image.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingHeader(true);
    setErrorMessage('');
    try {
      const res = await api.post(API_ENDPOINTS.SETTINGS.BRANDING_UPLOAD_APPROVAL_HEADER, formData, {
        tokenType: 'admin',
      });
      const uploadedUrl = res.data?.url || res.data?.data?.url || (res as any)?.url;
      if (uploadedUrl) {
        setApprovalLetterHeaderUrl(uploadedUrl);
        setSuccessMessage('Approval Letter Header PNG uploaded successfully. Click Save to persist.');
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err: unknown) {
      console.error('Approval Header upload failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload approval header PNG');
    } finally {
      setUploadingHeader(false);
      if (headerFileInputRef.current) headerFileInputRef.current.value = '';
    }
  };

  const handleWatermarkFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg|webp|svg\+xml)$/)) {
      setErrorMessage('Invalid file format. Please upload a PNG, JPG, WebP, or SVG file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('File size exceeds 2MB limit. Please upload a smaller image.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setUploadingWatermark(true);
    setErrorMessage('');
    try {
      const res = await api.post(API_ENDPOINTS.SETTINGS.BRANDING_UPLOAD_WATERMARK_LOGO, formData, {
        tokenType: 'admin',
      });
      const uploadedUrl = res.data?.url || res.data?.data?.url || (res as any)?.url;
      if (uploadedUrl) {
        setWatermarkLogoUrl(uploadedUrl);
        setSuccessMessage('Background Watermark PNG uploaded successfully. Click Save to persist.');
        setTimeout(() => setSuccessMessage(''), 4000);
      }
    } catch (err: unknown) {
      console.error('Watermark upload failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to upload watermark PNG');
    } finally {
      setUploadingWatermark(false);
      if (watermarkFileInputRef.current) watermarkFileInputRef.current.value = '';
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        approvalLetterHeaderUrl: approvalLetterHeaderUrl || null,
        watermarkLogoUrl: watermarkLogoUrl || null,
        documentWatermarkEnabled,
        invoiceWatermarkEnabled,
        watermarkOpacity: Number(watermarkOpacity),
        watermarkSize,
        watermarkPosition,
      };

      await api.put(API_ENDPOINTS.SETTINGS.DOCUMENT_BRANDING_UPDATE, payload);
      await refreshBranding();
      setSuccessMessage('✓ Document branding saved successfully.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: unknown) {
      console.error('Failed to save document branding:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save document branding');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPreview = async (type: 'APPROVAL_LETTER' | 'INVOICE') => {
    setPreviewType(type);
    setErrorMessage('');
    const endpoint =
      type === 'APPROVAL_LETTER'
        ? API_ENDPOINTS.SETTINGS.PREVIEW_APPROVAL_LETTER
        : API_ENDPOINTS.SETTINGS.PREVIEW_INVOICE;
    // fetchAndOpen opens modal immediately, then fetches bytes via arraybuffer
    await pdfViewer.fetchAndOpen(endpoint);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-slate-600 font-medium text-sm">Loading document branding settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">DOCUMENT BRANDING</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Configure generated PDF layouts for Approval Letters & Tax Invoices with dynamic headers and subtle watermarks.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => handleOpenPreview('APPROVAL_LETTER')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold text-sm hover:bg-blue-100 transition shadow-sm"
          >
            <Eye className="w-4 h-4" />
            Preview Approval Letter
          </button>
          <button
            type="button"
            onClick={() => handleOpenPreview('INVOICE')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 font-semibold text-sm hover:bg-indigo-100 transition shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Preview Invoice
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-600/30 transition disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>SAVE DOCUMENT BRANDING</span>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 text-emerald-800 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-rose-800 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm font-semibold">{errorMessage}</p>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        ref={headerFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleHeaderFileUpload}
      />
      <input
        ref={watermarkFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleWatermarkFileUpload}
      />

      <form onSubmit={handleSave} className="space-y-8">
        {/* SECTION A — APPROVAL LETTER HEADER */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-700 font-bold text-xs uppercase tracking-wider">
                  Section A
                </span>
                <h2 className="text-lg font-bold text-slate-900">APPROVAL LETTER HEADER</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Complete 1024 × 232 header artwork intended exclusively for the top of the Loan Approval Letter.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Status:</span>
              {approvalLetterHeaderUrl ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Not Configured
                </span>
              )}
            </div>
          </div>

          {/* Banner Artwork Preview */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Approval Letter Header PNG Artwork
            </label>

            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 flex flex-col items-center justify-center min-h-[160px] text-center">
              {approvalLetterHeaderUrl ? (
                <div className="space-y-4 w-full flex flex-col items-center">
                  <div className="max-w-2xl w-full bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center">
                    <img
                      src={approvalLetterHeaderUrl}
                      alt="Approval Letter Header Artwork"
                      className="w-full max-h-36 object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => headerFileInputRef.current?.click()}
                      disabled={uploadingHeader}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
                    >
                      {uploadingHeader ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Replace PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalLetterHeaderUrl('')}
                      className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition flex items-center gap-2 border border-rose-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalLetterHeaderUrl('/assets/approval-header.png')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                      Reset to Official Mudra Banner
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto shadow-sm">
                    <ImageIcon className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">No header artwork configured</p>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Upload the 1024 × 232 header artwork. When empty, a clean text header is used.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => headerFileInputRef.current?.click()}
                      disabled={uploadingHeader}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-blue-500/20"
                    >
                      {uploadingHeader ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Upload Header PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovalLetterHeaderUrl('/assets/approval-header.png')}
                      className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
                    >
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      Use Default Provided Asset
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-500 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Dynamic Behavior:</strong> Newly generated Approval Letters immediately render this header PNG.
                Previously generated historical documents remain immutable.
              </span>
            </div>
          </div>
        </div>

        {/* SECTION B — DOCUMENT WATERMARK */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                  Section B
                </span>
                <h2 className="text-lg font-bold text-slate-900">DOCUMENT WATERMARK</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Background watermark (300 × 300 round Rupee Emblem) rendered subtly <strong>behind</strong> content.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Approval Letter Watermark:</label>
              <button
                type="button"
                onClick={() => setDocumentWatermarkEnabled(!documentWatermarkEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  documentWatermarkEnabled ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    documentWatermarkEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-slate-600">{documentWatermarkEnabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left: Watermark Asset Upload & Preview */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Background Watermark PNG (300 × 300 Emblem)
              </label>

              <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50 flex flex-col items-center justify-center text-center space-y-4 min-h-[220px]">
                {watermarkLogoUrl ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div
                      className="w-36 h-36 rounded-2xl bg-white p-3 border border-slate-200 shadow-sm flex items-center justify-center transition-all"
                      style={{ opacity: watermarkOpacity }}
                    >
                      <img
                        src={watermarkLogoUrl}
                        alt="Watermark Preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-semibold text-slate-600">
                      Visual Preview (rendered at {(watermarkOpacity * 100).toFixed(0)}% opacity)
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => watermarkFileInputRef.current?.click()}
                        disabled={uploadingWatermark}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                      >
                        {uploadingWatermark ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Replace PNG
                      </button>
                      <button
                        type="button"
                        onClick={() => setWatermarkLogoUrl('/assets/brand-emblem.png')}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                      >
                        Reset Default
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                      <SlidersHorizontal className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">No watermark asset set</p>
                      <p className="text-xs text-slate-500 mt-0.5">Upload a 300 × 300 round emblem PNG</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => watermarkFileInputRef.current?.click()}
                      disabled={uploadingWatermark}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Watermark PNG
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Controls (Opacity Slider, Size, Position) */}
            <div className="space-y-6">
              {/* Opacity Slider (5% to 30%) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Watermark Opacity
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-800">
                    {(watermarkOpacity * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.30"
                  step="0.01"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>5% (Subtle)</span>
                  <span>10% (Default)</span>
                  <span>20% (Noticeable)</span>
                  <span>30% (Maximum)</span>
                </div>
                <p className="text-xs text-slate-500 pt-1">
                  Bounded between 5% and 30% to guarantee complete readability of document text.
                </p>
              </div>

              {/* Size Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Watermark Size
                </label>
                <select
                  value={watermarkSize}
                  onChange={(e) => setWatermarkSize(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="SMALL">Small (160 pt width)</option>
                  <option value="MEDIUM">Medium (260 pt width - Default)</option>
                  <option value="LARGE">Large (380 pt width)</option>
                </select>
              </div>

              {/* Position Dropdown */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Watermark Position
                </label>
                <select
                  value={watermarkPosition}
                  onChange={(e) => setWatermarkPosition(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="CENTER">Center of Document (Default)</option>
                  <option value="TOP">Top Area</option>
                  <option value="BOTTOM">Bottom Area</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION C — INVOICE BRANDING */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                  Section C
                </span>
                <h2 className="text-lg font-bold text-slate-900">INVOICE BRANDING</h2>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Official Tax Invoice styling. Uses Primary Website Logo and independent watermark control.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-700">Invoice Watermark:</label>
              <button
                type="button"
                onClick={() => setInvoiceWatermarkEnabled(!invoiceWatermarkEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                  invoiceWatermarkEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    invoiceWatermarkEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-xs font-bold text-slate-600">{invoiceWatermarkEnabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Invoice Header Logo</span>
              <p className="text-sm font-semibold text-slate-900">Uses Primary Brand / Website Logo</p>
              <p className="text-xs text-slate-500">
                Invoices strictly NEVER use the Approval Letter Header artwork. They use your primary website identity.
              </p>
              {primaryLogoUrl ? (
                <div className="pt-2">
                  <img src={primaryLogoUrl} alt="Primary Brand Logo" className="h-9 object-contain" />
                </div>
              ) : (
                <span className="inline-block text-xs font-medium text-slate-400 italic pt-1">
                  (Default logo or company typography rendered)
                </span>
              )}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Shared Watermark System</span>
              <p className="text-sm font-semibold text-slate-900">
                {invoiceWatermarkEnabled ? 'Active (Subtle Watermark Behind Content)' : 'Disabled for Invoices'}
              </p>
              <p className="text-xs text-slate-500">
                When enabled, the same configured watermark emblem (at {(watermarkOpacity * 100).toFixed(0)}% opacity) is rendered behind invoice tables.
              </p>
            </div>
          </div>
        </div>

        {/* Form Bottom Save Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 bg-slate-900 rounded-2xl shadow-md text-white">
          <div className="space-y-1">
            <h4 className="font-bold text-sm tracking-wide">Save Document Configuration</h4>
            <p className="text-xs text-slate-400">
              Applies immediately to all new Approval Letters & Tax Invoices. Historical documents remain untouched.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-blue-600/40 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>SAVE DOCUMENT BRANDING</span>
          </button>
        </div>
      </form>

      {/* Live PDF Preview Modal — native in-app Blob rendering, no IDM interception */}
      <PdfViewerModal
        open={pdfViewer.open}
        onClose={pdfViewer.closeModal}
        blob={pdfViewer.blob}
        blobUrl={pdfViewer.blobUrl}
        pdfBytes={pdfViewer.pdfBytes}
        loading={pdfViewer.loading}
        fetchError={pdfViewer.error}
        title={`Live PDF Preview: ${previewType === 'APPROVAL_LETTER' ? 'Loan Approval Letter' : 'Tax Invoice'}`}
        description="Generated authoritatively by server with current branding settings"
        downloadFilename={previewType === 'APPROVAL_LETTER' ? 'Approval_Letter_Preview.pdf' : 'Invoice_Preview.pdf'}
        onRetry={pdfViewer.retry}
      />
    </div>
  );
};

export default AdminDocumentBrandingPage;

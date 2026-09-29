import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../../services/adminService';
import { apiClient } from '@/api/client';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Search,
  Filter,
  Users,
  X,
  Settings,
  Layers,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export const AdminEmailSettings: React.FC = () => {
  // Navigation tabs: 'MESSAGING' | 'SMTP_SETTINGS'
  const [activeTab, setActiveTab] = useState<'MESSAGING' | 'SMTP_SETTINGS'>('MESSAGING');

  // Customer selection & email composer state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState('Loan Application Update — {{applicationId}}');
  const [emailMessage, setEmailMessage] = useState(
    'Dear {{customerName}},\n\nYour loan application {{applicationId}} status is currently {{loanStatus}}.\n\nPlease log in to your Loan Approve account for details.\n\nWarm regards,\nSupport Team\n{{companyName}}'
  );

  // Send & Confirmation Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [campaignResult, setCampaignResult] = useState<{
    total: number;
    sentCount: number;
    failedCount: number;
    results: Array<{
      customerId: string;
      customerName?: string;
      email?: string;
      recipient?: string;
      status: string;
      success?: boolean;
      error?: string;
      failureReason?: string;
    }>;
  } | null>(null);

  // SMTP Settings state
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [fromName, setFromName] = useState('LoanApprove Finance');
  const [fromEmail, setFromEmail] = useState('support@loanapprove.com');
  const [replyToEmail, setReplyToEmail] = useState('support@loanapprove.com');
  const [encryption, setEncryption] = useState('TLS');
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<string>('NOT_CONFIGURED');
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Fetch real customers for email dispatch
  const {
    data: customerData,
    isLoading: isLoadingCustomers,
  } = useQuery({
    queryKey: ['adminCommunicationCustomersEmail', customerSearch, customerFilter, page],
    queryFn: async () => {
      const res = await adminService.getCommunicationCustomers({
        search: customerSearch.trim() || undefined,
        status: customerFilter,
        page,
        limit: pageSize,
      });
      return res;
    },
    refetchInterval: 5000,
  });

  const customers: any[] = customerData?.data || [];
  const pagination = customerData?.pagination || {
    total: customers.length,
    page: 1,
    limit: pageSize,
    totalPages: 1,
  };

  // Reset selection when search, filter or tab changes
  useEffect(() => {
    setSelectedCustomerIds([]);
  }, [customerSearch, customerFilter, activeTab]);

  // Load Email Settings
  const fetchEmailSettings = async () => {
    setSettingsError('');
    try {
      const data = await adminService.getEmailSettings();
      if (data) {
        setSmtpHost(data.smtpHost || '');
        setSmtpPort(data.smtpPort || 587);
        setSmtpUsername(data.smtpUsername || '');
        setFromName(data.fromName || 'LoanApprove Finance');
        setFromEmail(data.fromEmail || 'support@loanapprove.com');
        setReplyToEmail(data.replyToEmail || 'support@loanapprove.com');
        setEncryption(data.encryption || 'TLS');
        setEnabled(data.enabled ?? true);
        setHasExistingPassword(Boolean(data.hasPassword));
        setStatus(data.status || (data.smtpHost ? 'CONFIGURED' : 'NOT_CONFIGURED'));
        setLastTestedAt(data.lastTestedAt || null);
        setLastError(data.lastError || null);
      }
    } catch (err: unknown) {
      console.error('Failed to load email settings:', err);
      setSettingsError(err instanceof Error ? err.message : 'Failed to load email settings');
    }
  };

  useEffect(() => {
    fetchEmailSettings();
  }, []);

  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setSettingsError('');
    setSettingsSuccess('');
    try {
      const res = await adminService.testEmailConnection();
      if (res.success) {
        setSettingsSuccess(res.message || 'SMTP connection verified successfully.');
        setStatus('CONNECTED');
      } else {
        setSettingsError(res.error || res.message || 'Failed to connect to SMTP server.');
        setStatus((res as any).status || 'CONNECTION_FAILED');
      }
      await fetchEmailSettings();
    } catch (err: unknown) {
      setSettingsError(err instanceof Error ? err.message : 'Error testing connection');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError('');
    setSettingsSuccess('');

    try {
      const updated = await adminService.updateEmailSettings({
        smtpHost: smtpHost.trim(),
        smtpPort: Number(smtpPort),
        smtpUsername: smtpUsername.trim(),
        smtpPassword: smtpPassword.trim() || undefined,
        fromName: fromName.trim(),
        fromEmail: fromEmail.trim(),
        replyToEmail: replyToEmail.trim() || undefined,
        encryption,
        enabled,
      });

      setStatus(updated?.status || 'CONFIGURED');
      setSettingsSuccess('SMTP configuration saved and integrated successfully.');
      setSmtpPassword('');
      await fetchEmailSettings();
    } catch (err: unknown) {
      console.error('Failed to update email settings:', err);
      setSettingsError(err instanceof Error ? err.message : 'Failed to save email settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Selection handlers
  const isAllMatchingSelected =
    customers.length > 0 && customers.every((c) => selectedCustomerIds.includes(c.customerId));

  const handleToggleSelectAll = () => {
    if (isAllMatchingSelected) {
      const pageIds = new Set(customers.map((c) => c.customerId));
      setSelectedCustomerIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = new Set([...selectedCustomerIds, ...customers.map((c) => c.customerId)]);
      setSelectedCustomerIds(Array.from(newIds));
    }
  };

  const handleToggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const insertVariable = (tag: string) => {
    setEmailMessage((prev) => `${prev} {{${tag}}}`);
  };

  // Dispatch Email campaign
  const handleConfirmSend = async () => {
    if (selectedCustomerIds.length === 0 || !emailSubject.trim() || !emailMessage.trim()) return;

    setIsSending(true);
    try {
      const res = await apiClient<{
        success: boolean;
        message?: string;
        data?: any;
      }>('/admin/email/bulk-send', {
        method: 'POST',
        tokenType: 'admin',
        body: JSON.stringify({
          customerIds: selectedCustomerIds,
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
        }),
      });

      const data = res.data || (res as any);
      setCampaignResult({
        total: data.total || selectedCustomerIds.length,
        sentCount: data.sentCount || 0,
        failedCount: data.failedCount || 0,
        results: Array.isArray(data.results) ? data.results : [],
      });
      setShowConfirmModal(false);
      setSelectedCustomerIds([]);
    } catch (err: unknown) {
      console.error('Failed to dispatch bulk email:', err);
      alert(err instanceof Error ? err.message : 'Failed to dispatch email campaign.');
    } finally {
      setIsSending(false);
    }
  };

  // Preview resolved sample message
  const previewCustomer = customers.find((c) => selectedCustomerIds.includes(c.customerId)) || customers[0];
  const sampleResolvedSubject = previewCustomer
    ? emailSubject
        .replace(/\{\{\s*customerName\s*\}\}/gi, previewCustomer.customerName || 'Rahul')
        .replace(/\{\{\s*applicationId\s*\}\}/gi, previewCustomer.applicationId || 'LA-2026-000001')
        .replace(/\{\{\s*(loanAmount|amount)\s*\}\}/gi, '₹5,00,000')
        .replace(/\{\{\s*loanStatus\s*\}\}/gi, previewCustomer.loanStatus || 'PENDING')
        .replace(/\{\{\s*companyName\s*\}\}/gi, 'Loan Approve')
    : emailSubject;

  const sampleResolvedPreview = previewCustomer
    ? emailMessage
        .replace(/\{\{\s*customerName\s*\}\}/gi, previewCustomer.customerName || 'Rahul')
        .replace(/\{\{\s*applicationId\s*\}\}/gi, previewCustomer.applicationId || 'LA-2026-000001')
        .replace(/\{\{\s*(loanAmount|amount)\s*\}\}/gi, '₹5,00,000')
        .replace(/\{\{\s*loanStatus\s*\}\}/gi, previewCustomer.loanStatus || 'PENDING')
        .replace(/\{\{\s*companyName\s*\}\}/gi, 'Loan Approve')
    : emailMessage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Customer Email Messaging</h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                status === 'CONNECTED' || status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : status === 'CONFIGURED'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status === 'CONNECTED' || status === 'ACTIVE'
                    ? 'bg-emerald-500 animate-pulse'
                    : status === 'CONFIGURED'
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
                }`}
              />
              {status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Select customers, compose personalized emails with dynamic variables, and send through your active SMTP server.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('MESSAGING')}
            className={`px-4 py-2 text-xs font-bold rounded-md transition flex items-center gap-2 ${
              activeTab === 'MESSAGING'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-4 h-4" />
            Customer Email
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SMTP_SETTINGS')}
            className={`px-4 py-2 text-xs font-bold rounded-md transition flex items-center gap-2 ${
              activeTab === 'SMTP_SETTINGS'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            SMTP Configuration
          </button>
        </div>
      </div>

      {/* VIEW 1: DIRECT EMAIL MESSAGING COMPOSER */}
      {activeTab === 'MESSAGING' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Customer Selection Table (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-gray-200 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search customers by name, email, mobile, or application ID..."
                    className="w-full pl-9 pr-4 py-2 text-xs border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={customerFilter}
                    onChange={(e) => {
                      setCustomerFilter(e.target.value);
                      setPage(1);
                    }}
                    className="text-xs border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="ALL">All Customers</option>
                    <option value="PENDING">Pending Applications</option>
                    <option value="KYC_PENDING">KYC Pending</option>
                    <option value="UNDER_REVIEW">Under Review</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="PAYMENT_PENDING">Payment Pending</option>
                    <option value="ACTIVE">Active / Disbursed</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <label className="flex items-center gap-2 font-medium cursor-pointer text-gray-700">
                  <input
                    type="checkbox"
                    checked={isAllMatchingSelected}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                  />
                  <span>Select All Matching ({customers.length})</span>
                </label>
                <span>Total: {pagination.total} customers</span>
              </div>
            </div>

            {/* Customer Table */}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllMatchingSelected}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Customer ID</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Application ID</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoadingCustomers ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                        Loading customers...
                      </td>
                    </tr>
                  ) : customers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400">
                        No customers match your search or filter.
                      </td>
                    </tr>
                  ) : (
                    customers.map((c) => {
                      const isSelected = selectedCustomerIds.includes(c.customerId);
                      return (
                        <tr
                          key={c.customerId}
                          onClick={() => handleToggleSelectCustomer(c.customerId)}
                          className={`cursor-pointer transition ${
                            isSelected ? 'bg-emerald-50/70' : 'hover:bg-gray-50'
                          }`}
                        >
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCustomer(c.customerId)}
                              className="w-4 h-4 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-gray-900">{c.customerName}</div>
                            <div className="text-[11px] text-gray-400">
                              {c.city && c.city !== '—' ? `${c.city}, ` : ''}
                              {c.state || ''}
                            </div>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-gray-500">
                            {c.customerId.substring(0, 8)}...
                          </td>
                          <td className="p-3 font-mono text-gray-800 font-medium">
                            {c.email || '—'}
                          </td>
                          <td className="p-3 font-mono text-emerald-700 font-semibold">
                            {c.applicationId || '—'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.loanStatus === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.loanStatus === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {c.loanStatus || c.kycStatus || 'ACTIVE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {pagination.totalPages > 1 && (
              <div className="p-3 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 bg-gray-50">
                <span>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="p-1 border rounded bg-white hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Email Composer Section (5 cols) */}
          <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-600" />
                Compose Customer Email
              </h3>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Selected: {selectedCustomerIds.length} customers
              </span>
            </div>

            {/* Subject Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Email Subject
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Loan Application Update..."
                className="w-full border border-gray-300 rounded-lg p-2.5 text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                required
              />
            </div>

            {/* Dynamic Variable Helper Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Dynamic Variable Tags (Click to Insert)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: 'customerName', label: 'Customer Name' },
                  { tag: 'applicationId', label: 'Application ID' },
                  { tag: 'loanAmount', label: 'Loan Amount' },
                  { tag: 'loanStatus', label: 'Loan Status' },
                  { tag: 'companyName', label: 'Company Name' },
                ].map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    className="px-2.5 py-1 text-[11px] font-mono font-medium bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 rounded-md border border-slate-200 transition"
                  >
                    + {`{{${v.tag}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Body Textarea */}
            <div className="space-y-1.5 flex-1 flex flex-col">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Message Body
              </label>
              <textarea
                rows={6}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Write your email body here..."
                className="w-full border border-gray-300 rounded-lg p-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 font-sans leading-relaxed flex-1"
                required
              />
            </div>

            {/* Preview Box */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs text-slate-700">
              <div className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                Sample Live Preview ({previewCustomer?.customerName || 'Borrower'}):
              </div>
              <div className="font-semibold text-gray-900 text-xs">{sampleResolvedSubject}</div>
              <p className="whitespace-pre-wrap font-sans text-gray-800 leading-relaxed bg-white p-2.5 rounded border border-gray-200 text-[11px]">
                {sampleResolvedPreview}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedCustomerIds([])}
                disabled={selectedCustomerIds.length === 0}
                className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
              >
                Clear Selection
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={selectedCustomerIds.length === 0 || !emailSubject.trim() || !emailMessage.trim()}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow transition flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Email ({selectedCustomerIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: SMTP CONFIGURATION */}
      {activeTab === 'SMTP_SETTINGS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                SMTP Email Gateway Configuration
              </h2>
              <p className="text-xs text-gray-500">
                Configure your outgoing SMTP server credentials. Changes take effect dynamically without server restart.
              </p>
            </div>

            {settingsSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {settingsSuccess}
              </div>
            )}

            {settingsError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                {settingsError}
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    SMTP Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.example.com"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    SMTP Port
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    placeholder="587"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Security / Encryption Mode
                  </label>
                  <select
                    value={encryption}
                    onChange={(e) => setEncryption(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="TLS">STARTTLS (Port 587)</option>
                    <option value="SSL">SSL / TLS (Port 465)</option>
                    <option value="NONE">None (Port 25 / Local)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    SMTP Username
                  </label>
                  <input
                    type="text"
                    value={smtpUsername}
                    onChange={(e) => setSmtpUsername(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    From Name
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="LoanApprove Finance"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    From Email
                  </label>
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="noreply@loanapprove.com"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Reply-To Email
                  </label>
                  <input
                    type="email"
                    value={replyToEmail}
                    onChange={(e) => setReplyToEmail(e.target.value)}
                    placeholder="support@loanapprove.com"
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    SMTP Password
                  </label>
                  <input
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={hasExistingPassword ? '•••••••••••• (Leave blank to keep existing)' : 'Enter SMTP Password'}
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold text-sm rounded-lg shadow-sm transition flex items-center gap-2"
                >
                  {savingSettings ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving Configuration...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      Save SMTP Configuration
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* SMTP Metadata Card */}
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-gray-500" />
                SMTP Metadata
              </h4>

              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-400">Current Status:</span>
                  <span className="font-semibold text-gray-900">{status}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-400">Active Host:</span>
                  <span className="font-mono text-gray-800">{smtpHost || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-400">Active Port:</span>
                  <span className="font-mono text-gray-800">{smtpPort || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-400">Sender Identity:</span>
                  <span className="font-mono text-gray-800">{fromEmail || '—'}</span>
                </div>
                {lastTestedAt && (
                  <div className="flex justify-between py-1 border-b border-gray-100">
                    <span className="text-gray-400">Last Checked:</span>
                    <span className="text-gray-700">{new Date(lastTestedAt).toLocaleTimeString()}</span>
                  </div>
                )}
                {lastError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700">
                    <span className="font-semibold">Last Provider Error:</span> {lastError}
                  </div>
                )}

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection || savingSettings}
                    className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition flex items-center justify-center gap-2"
                  >
                    {isTestingConnection ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Testing Connection...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        Test Connection
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-emerald-600" />
                Confirm Email Dispatch
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-gray-700">
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-emerald-900 font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Recipients: {selectedCustomerIds.length} customer(s)</span>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-gray-700 uppercase tracking-wide text-[11px]">
                  Subject
                </span>
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-lg font-medium text-gray-900">
                  {emailSubject}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-bold text-gray-700 uppercase tracking-wide text-[11px]">
                  Message Preview
                </span>
                <p className="p-3 bg-gray-50 border border-gray-200 rounded-lg whitespace-pre-wrap font-sans leading-relaxed text-gray-900 max-h-40 overflow-y-auto">
                  {emailMessage}
                </p>
              </div>

              <p className="text-gray-500 text-[11px]">
                Each email will be personalized and dispatched through the configured SMTP gateway.
              </p>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSending}
                onClick={handleConfirmSend}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-2"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending Emails...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CAMPAIGN SUMMARY BREAKDOWN MODAL */}
      {campaignResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Email Sending Complete
              </h3>
              <button
                type="button"
                onClick={() => setCampaignResult(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-lg border text-center">
                  <div className="text-[11px] text-gray-500 uppercase font-bold">Total</div>
                  <div className="text-lg font-extrabold text-gray-900">{campaignResult.total}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-center">
                  <div className="text-[11px] text-emerald-700 uppercase font-bold">Sent</div>
                  <div className="text-lg font-extrabold text-emerald-700">{campaignResult.sentCount}</div>
                </div>
                <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-center">
                  <div className="text-[11px] text-rose-700 uppercase font-bold">Failed</div>
                  <div className="text-lg font-extrabold text-rose-700">{campaignResult.failedCount}</div>
                </div>
              </div>

              {campaignResult.results.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-bold text-gray-700 uppercase text-[11px]">
                    Recipient Breakdown
                  </span>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-gray-50 border-b text-gray-600 font-semibold">
                        <tr>
                          <th className="p-2.5">Customer</th>
                          <th className="p-2.5">Status</th>
                          <th className="p-2.5">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {campaignResult.results.map((r, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="p-2.5 font-medium text-gray-900">
                              {r.customerName || r.customerId.substring(0, 8)}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.status === 'SENT' || r.success
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {r.status || (r.success ? 'SENT' : 'FAILED')}
                              </span>
                            </td>
                            <td className="p-2.5 text-gray-500 font-mono text-[11px]">
                              {r.error || r.failureReason || 'Dispatched via SMTP'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                type="button"
                onClick={() => setCampaignResult(null)}
                className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminEmailSettings;

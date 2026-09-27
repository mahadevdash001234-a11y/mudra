import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { API_ENDPOINTS } from '@/api/endpoints';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileSignature,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Printer,
  Download,
  ShieldCheck,
  RefreshCw,
  QrCode as QrIcon,
  ExternalLink,
} from 'lucide-react';

import { useBranding } from '@/contexts/BrandingContext';
import { useBrandTitle } from '@/hooks/useBrandTitle';

interface AgreementData {
  agreementId: string;
  loanId: string;
  applicationNumber: string;
  customerName: string;
  sanctionedAmount: number;
  tenureMonths: number;
  emi: number;
  interestRate: number;
  agreementVersion: string;
  contentHtml?: string;
  acceptanceStatus: string;
  acceptedAt?: string;
  accountNumber?: string;
  purpose?: string;
  verificationToken?: string;
}

export const CustomerAgreementPage: React.FC = () => {
  const navigate = useNavigate();
  const { branding } = useBranding();
  useBrandTitle('Loan Agreement');
  const { loanId, id } = useParams<{ loanId?: string; id?: string }>();
  const effectiveLoanId = loanId || id || 'test-loan-1';
  const queryClient = useQueryClient();

  const [agreedCheckbox, setAgreedCheckbox] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<AgreementData>({
    queryKey: ['loan-agreement', effectiveLoanId],
    queryFn: async () => {
      const res = await apiClient.get(API_ENDPOINTS.AGREEMENTS.CUSTOMER_GET(effectiveLoanId));
      return res.data?.data || res.data;
    },
    enabled: Boolean(effectiveLoanId),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveLoanId) throw new Error('Missing Loan ID');
      return apiClient.post(API_ENDPOINTS.AGREEMENTS.CUSTOMER_ACCEPT(effectiveLoanId));
    },
    onSuccess: () => {
      setSuccessMessage('Loan agreement accepted and signed successfully! Redirecting to enter loan amount details...');
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ['loan-agreement', effectiveLoanId] });
      queryClient.invalidateQueries({ queryKey: ['customer-dashboard'] });
      setTimeout(() => {
        navigate('/customer/apply');
      }, 1200);
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Failed to sign loan agreement. Please retry.');
      setSuccessMessage(null);
    },
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      setErrorMessage(null);
      const res = await apiClient.get(
        `/customer/loans/${effectiveLoanId}/approval-letter/pdf?download=true`,
        { responseType: 'blob' }
      );
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Approval_Letter_${data?.applicationNumber || effectiveLoanId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error downloading PDF';
      setErrorMessage(msg);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse max-w-4xl mx-auto py-8">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-96 bg-slate-200 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="max-w-2xl mx-auto border-red-200 bg-red-50 p-6 text-center my-8">
        <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
        <h3 className="text-base font-semibold text-red-900">Failed to load loan agreement</h3>
        <p className="text-xs text-red-700 mt-1 mb-4">Could not retrieve the agreement document for this loan.</p>
        <Button onClick={() => refetch()} size="sm" variant="outline" className="border-red-300">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          Retry
        </Button>
      </Card>
    );
  }

  const isAccepted = data.acceptanceStatus === 'ACCEPTED';
  const verificationCode = data.verificationToken || data.agreementId || effectiveLoanId;
  const verificationUrl = `${window.location.origin}/verify/document/${verificationCode}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 px-2 sm:px-4">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center space-x-2">
            <FileSignature className="w-6 h-6 text-primary" />
            <span>Master Loan Agreement</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600">
            Application: <span className="font-mono font-bold text-slate-900">{data.applicationNumber}</span> | Borrower: {data.customerName}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {isAccepted ? (
            <Badge className="bg-success text-background text-text-primary px-3 py-1 text-xs">Agreement Accepted ✓</Badge>
          ) : (
            <Badge className="bg-warning text-background text-text-primary px-3 py-1 text-xs">Pending Digital Signature</Badge>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs h-8">
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print / Save PDF
          </Button>
          <Button
            size="sm"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="text-xs h-8 bg-primary text-primary-foreground font-semibold"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Accepted Confirmation Stamp */}
      {isAccepted && (
        <Card className="border-emerald-300 bg-emerald-50 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-success text-background text-text-primary flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="text-xs">
                <p className="font-bold text-emerald-950 text-sm">Digitally Signed & Confirmed</p>
                <p className="text-emerald-800">
                  Signed on {data.acceptedAt ? new Date(data.acceptedAt).toLocaleString('en-IN') : 'Recently'} | Document Version: {data.agreementVersion}
                </p>
              </div>
            </div>
            <Link to="/customer/loans">
              <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-800 text-xs h-8">
                My Loans
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Screen 10 Financial Summary Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
        <div className="bg-surface text-text-primary text-xs font-bold uppercase tracking-wider px-4 py-2.5">
          Approved Loan Parameters
        </div>
        <div className="divide-y divide-slate-200 text-xs">
          <div className="grid grid-cols-2 p-3 bg-slate-50">
            <span className="text-text-secondary font-medium">Sanctioned Amount</span>
            <span className="text-slate-900 font-bold text-sm text-right">
              ₹{Number(data.sanctionedAmount).toLocaleString('en-IN')}
            </span>
          </div>
          <div className="grid grid-cols-2 p-3">
            <span className="text-text-secondary font-medium">Interest Rate (p.a.)</span>
            <span className="text-slate-900 font-semibold text-right">{data.interestRate}%</span>
          </div>
          <div className="grid grid-cols-2 p-3 bg-slate-50">
            <span className="text-text-secondary font-medium">Loan Tenure</span>
            <span className="text-slate-900 font-semibold text-right">{data.tenureMonths} Months</span>
          </div>
          <div className="grid grid-cols-2 p-3 bg-emerald-50/60">
            <span className="text-emerald-900 font-bold">Monthly Equated Installment (EMI)</span>
            <span className="text-emerald-700 font-extrabold text-sm text-right">
              ₹{Number(data.emi).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Agreement Terms Paper Box */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">Legal Agreement {data.agreementVersion || 'v1.0'}</span>
            <span className="font-mono text-text-secondary">ID: {(data.agreementId || '').slice(0, 8)}...</span>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div
            className="prose prose-sm max-w-none text-slate-800"
            dangerouslySetInnerHTML={{ __html: data.contentHtml || '<p>This Loan Agreement is made between Lender and Borrower under applicable fintech lending guidelines.</p>' }}
          />
        </CardContent>
      </Card>

      {/* Screen 10 Verification & Authorized Signature Block */}
      <div className="p-4 bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="w-14 h-14 bg-white border border-slate-300 rounded p-1 shrink-0 flex items-center justify-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verificationUrl)}`}
              alt="Verification QR"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-[11px] text-slate-600">
            <p className="font-bold text-slate-900 flex items-center gap-1">
              <QrIcon className="w-3 h-3 text-primary" />
              Document Authenticity QR
            </p>
            <p className="text-text-secondary text-[10px] mt-0.5">
              Ref: <span className="font-mono text-slate-700">{verificationCode}</span>
            </p>
            <Link
              to={`/verify/document/${verificationCode}`}
              target="_blank"
              className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5 mt-0.5 text-[10px]"
            >
              Verify Online <ExternalLink className="w-2.5 h-2.5" />
            </Link>
          </div>
        </div>

        <div className="text-left sm:text-right space-y-0.5">
          <div className="inline-block border-b border-slate-400 pb-0.5 px-3">
            <span className="font-serif italic text-sm text-slate-800 font-bold">
              Authorized Signatory
            </span>
          </div>
          <p className="text-xs font-bold text-slate-900">{branding.companyName || branding.appName} Operations</p>
          <p className="text-[10px] text-text-secondary">Digital Seal & Verification Authority</p>
        </div>
      </div>

      {/* Acceptance Section */}
      {!isAccepted && (
        <Card className="shadow-sm border-primary/30 bg-emerald-50/40">
          <CardContent className="p-5 space-y-4">
            {successMessage && (
              <div className="p-3 rounded bg-emerald-100 text-emerald-900 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded bg-red-100 text-red-900 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="agreeTerms"
                checked={agreedCheckbox}
                onChange={(e) => setAgreedCheckbox(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
              />
              <label htmlFor="agreeTerms" className="text-xs text-slate-700 leading-relaxed cursor-pointer select-none">
                <strong>I have read, understood, and agree to the loan agreement and repayment terms.</strong> I understand
                that this constitutes an electronically executed binding agreement under the Information Technology Act, 2000.
              </label>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <Link to="/customer/dashboard">
                <Button variant="outline" size="sm" className="text-xs h-9">
                  Review Later
                </Button>
              </Link>
              <Button
                size="sm"
                disabled={!agreedCheckbox || acceptMutation.isPending}
                onClick={() => acceptMutation.mutate()}
                className="bg-emerald-700 hover:bg-emerald-800 text-text-primary text-xs h-9 px-4"
              >
                {acceptMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    Signing Agreement...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    Accept & Digitally Sign Agreement
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CustomerAgreementPage;

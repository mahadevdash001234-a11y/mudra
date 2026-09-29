import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { BrandingProvider } from '@/contexts/BrandingContext';
import { CustomerRoute, AdminRoute, AdminPermissionRoute, CustomerPublicOnlyRoute, AdminPublicOnlyRoute } from '@/routes/RouteGuards';

// Public Pages
import { LandingPage } from '@/pages/LandingPage';
import { PublicEmiCalculatorPage } from '@/pages/PublicEmiCalculatorPage';
import { VerifyDocumentPage } from '@/pages/VerifyDocumentPage';
import { StaticInfoPage } from '@/pages/StaticInfoPage';

// Customer Pages
import { CustomerLogin } from '@/pages/customer/CustomerLogin';
import { CustomerRegister } from '@/pages/customer/CustomerRegister';
import { CustomerHome } from '@/pages/customer/CustomerHome';
import { CustomerProfile } from '@/pages/customer/CustomerProfile';
import { CustomerDocuments } from '@/pages/customer/CustomerDocuments';
import { CustomerKycPage } from '@/pages/customer/CustomerKycPage';
import { CustomerPaymentPage } from '@/pages/customer/CustomerPaymentPage';
import { CustomerAgreementPage } from '@/pages/customer/CustomerAgreementPage';
import { CustomerLoanTimelinePage } from '@/pages/customer/CustomerLoanTimelinePage';
import { CustomerEmiSchedulePage } from '@/pages/customer/CustomerEmiSchedulePage';
import { CustomerNotificationsPage } from '@/pages/customer/CustomerNotificationsPage';
import { CustomerSupportPage } from '@/pages/customer/CustomerSupportPage';
import { ApplyLoanPage } from '@/pages/customer/ApplyLoanPage';
import { CustomerLoansPage } from '@/pages/customer/CustomerLoansPage';
import { CustomerLoanDetailPage } from '@/pages/customer/CustomerLoanDetailPage';
import { CustomerLayout } from '@/layouts/CustomerLayout';

// Admin Pages
import { AdminLogin } from '@/pages/admin/AdminLogin';
import { AdminDashboard } from '@/pages/admin/AdminDashboard';
import { AdminCustomersPage } from '@/pages/admin/AdminCustomersPage';
import { AdminCustomerDetailPage } from '@/pages/admin/AdminCustomerDetailPage';
import { AdminAddCustomerPage } from '@/pages/admin/AdminAddCustomerPage';
import { AdminLoansPage } from '@/pages/admin/AdminLoansPage';
import { AdminLoanApprovalPage } from '@/pages/admin/AdminLoanApprovalPage';
import { AdminPendingLoansPage } from '@/pages/admin/AdminPendingLoansPage';
import { AdminApprovedLoansPage } from '@/pages/admin/AdminApprovedLoansPage';
import { AdminRejectedLoansPage } from '@/pages/admin/AdminRejectedLoansPage';
import { AdminActiveLoansPage } from '@/pages/admin/AdminActiveLoansPage';
import { AdminLoanDetailPage } from '@/pages/admin/AdminLoanDetailPage';
import { AdminDocumentsPage } from '@/pages/admin/AdminDocumentsPage';
import { AdminKycList } from '@/pages/admin/AdminKycList';
import { AdminKycDetail } from '@/pages/admin/AdminKycDetail';
import { AdminPaymentsPage } from '@/pages/admin/AdminPaymentsPage';
import { AdminChargesApprovalPage } from '@/pages/admin/AdminChargesApprovalPage';
import { AdminDisbursementsPage } from '@/pages/admin/AdminDisbursementsPage';
import { AdminReportsPage } from '@/pages/admin/AdminReportsPage';
import { AdminAuditLogsPage } from '@/pages/admin/AdminAuditLogsPage';
import { AdminSupportPage } from '@/pages/admin/AdminSupportPage';
import { AdminNotificationsPage } from '@/pages/admin/AdminNotificationsPage';
import { AdminDomainManagementPage } from '@/pages/admin/AdminDomainManagementPage';
import { AdminChargesPage } from '@/pages/admin/AdminChargesPage';
import { AdminUpiSettingsPage } from '@/pages/admin/AdminUpiSettingsPage';
import { AdminBankSettingsPage } from '@/pages/admin/AdminBankSettingsPage';
import { AdminPaymentLinksPage } from '@/pages/admin/AdminPaymentLinksPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminBrandingSettings } from '@/pages/admin/AdminBrandingSettings';
import { AdminDocumentBrandingPage } from '@/pages/admin/AdminDocumentBrandingPage';
import { AdminApprovalLetterPage } from '@/pages/admin/AdminApprovalLetterPage';
import { AdminWebsiteContentPage } from '@/pages/admin/AdminWebsiteContentPage';
import { AdminEmailSettings } from '@/pages/admin/AdminEmailSettings';
import { AdminWhatsAppSettings } from '@/pages/admin/AdminWhatsAppSettings';
import { AdminLayout } from '@/layouts/AdminLayout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  const appMode = (import.meta.env.VITE_APP_MODE || 'all').trim().toLowerCase();
  const isCustomerEnabled = appMode === 'all' || appMode === 'customer';
  const isAdminEnabled = appMode === 'all' || appMode === 'admin';

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingProvider>
          <BrowserRouter>
            <Routes>
              {/* Admin Mode Root Redirect */}
              {isAdminEnabled && !isCustomerEnabled && (
                <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
              )}

              {/* Customer & Public Routes (Mounted in 'all' and 'customer' modes) */}
              {isCustomerEnabled && (
                <>
                  {/* Landing & Public Pages */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/emi-calculator" element={<PublicEmiCalculatorPage />} />
                  <Route path="/verify/document/:token" element={<VerifyDocumentPage />} />
                  <Route path="/about" element={<StaticInfoPage />} />
                  <Route path="/terms" element={<StaticInfoPage />} />
                  <Route path="/privacy" element={<StaticInfoPage />} />
                  <Route path="/contact" element={<StaticInfoPage />} />
                  <Route path="/loan-information" element={<StaticInfoPage />} />

                  {/* URL Aliases for Direct Convenience */}
                  <Route path="/register" element={<Navigate to="/customer/register" replace />} />
                  <Route path="/signup" element={<Navigate to="/customer/register" replace />} />
                  <Route path="/login" element={<Navigate to="/customer/login" replace />} />
                  <Route path="/apply" element={<Navigate to="/customer/register" replace />} />

                  {/* Direct links for Timeline & Approval Letters */}
                  <Route path="/approval-letter/:loanId" element={<CustomerAgreementPage />} />
                  <Route path="/loan/:id/timeline" element={<CustomerLoanTimelinePage />} />
                  <Route path="/loan/:id/emi" element={<CustomerEmiSchedulePage />} />

                  {/* Public Customer Authentication */}
                  <Route
                    path="/customer/login"
                    element={
                      <CustomerPublicOnlyRoute>
                        <CustomerLogin />
                      </CustomerPublicOnlyRoute>
                    }
                  />
                  <Route
                    path="/customer/register"
                    element={
                      <CustomerPublicOnlyRoute>
                        <CustomerRegister />
                      </CustomerPublicOnlyRoute>
                    }
                  />

                  {/* Protected Customer Portal */}
                  <Route element={<CustomerRoute />}>
                    <Route path="/customer" element={<CustomerLayout />}>
                      <Route index element={<Navigate to="/customer/dashboard" replace />} />
                      <Route path="dashboard" element={<CustomerHome />} />
                      <Route path="loans" element={<CustomerLoansPage />} />
                      <Route path="loans/:id" element={<CustomerLoanDetailPage />} />
                      <Route path="loans/:id/timeline" element={<CustomerLoanTimelinePage />} />
                      <Route path="loans/:id/emi" element={<CustomerEmiSchedulePage />} />
                      <Route path="loans/:id/agreement" element={<CustomerAgreementPage />} />
                      <Route path="timeline/:id" element={<CustomerLoanTimelinePage />} />
                      <Route path="emi/:id" element={<CustomerEmiSchedulePage />} />
                      <Route path="agreement/:loanId" element={<CustomerAgreementPage />} />
                      <Route path="applications" element={<CustomerLoansPage />} />
                      <Route path="applications/:id" element={<CustomerLoanDetailPage />} />
                      <Route path="apply" element={<ApplyLoanPage />} />
                      <Route path="payment" element={<CustomerPaymentPage />} />
                      <Route path="payments" element={<CustomerPaymentPage />} />
                      <Route path="payments/:loanId" element={<CustomerPaymentPage />} />
                      <Route path="payment/:loanId" element={<CustomerPaymentPage />} />
                      <Route path="documents" element={<CustomerDocuments />} />
                      <Route path="kyc" element={<CustomerKycPage />} />
                      <Route path="notifications" element={<CustomerNotificationsPage />} />
                      <Route path="support" element={<CustomerSupportPage />} />
                      <Route path="profile" element={<CustomerProfile />} />
                    </Route>
                  </Route>
                </>
              )}

              {/* Admin Routes (Mounted in 'all' and 'admin' modes) */}
              {isAdminEnabled && (
                <>
                  {/* Public Admin Authentication */}
                  <Route
                    path="/admin/login"
                    element={
                      <AdminPublicOnlyRoute>
                        <AdminLogin />
                      </AdminPublicOnlyRoute>
                    }
                  />

                  {/* Protected Admin Console */}
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminLayout />}>
                      <Route index element={<Navigate to="/admin/dashboard" replace />} />
                      <Route path="dashboard" element={<AdminDashboard />} />

                      {/* Customers */}
                      <Route element={<AdminPermissionRoute permission="customers.view" />}>
                        <Route path="customers" element={<AdminCustomersPage />} />
                        <Route path="customers/:id" element={<AdminCustomerDetailPage />} />
                      </Route>
                      <Route element={<AdminPermissionRoute permission="customers.create" />}>
                        <Route path="customers/new" element={<AdminAddCustomerPage />} />
                        <Route path="customers/create" element={<AdminAddCustomerPage />} />
                      </Route>

                      {/* Loans */}
                      <Route element={<AdminPermissionRoute permission="applications.view" />}>
                        <Route path="loans" element={<AdminLoansPage />} />
                        <Route path="loan-approval" element={<AdminLoanApprovalPage />} />
                        <Route path="loan-approvals" element={<AdminLoanApprovalPage />} />
                        <Route path="pending-review" element={<AdminLoanApprovalPage />} />
                        <Route path="loans/pending" element={<AdminPendingLoansPage />} />
                        <Route path="loans/approved" element={<AdminApprovedLoansPage />} />
                        <Route path="loans/rejected" element={<AdminRejectedLoansPage />} />
                        <Route path="loans/active" element={<AdminActiveLoansPage />} />
                        <Route path="loans/disbursed" element={<AdminDisbursementsPage />} />
                        <Route path="pending-loans" element={<AdminPendingLoansPage />} />
                        <Route path="approved-loans" element={<AdminApprovedLoansPage />} />
                        <Route path="rejected-loans" element={<AdminRejectedLoansPage />} />
                        <Route path="loans/:id" element={<AdminLoanDetailPage />} />
                        <Route path="applications" element={<AdminLoansPage />} />
                        <Route path="applications/:id" element={<AdminLoanDetailPage />} />
                      </Route>

                      {/* KYC & Documents */}
                      <Route element={<AdminPermissionRoute permission={['kyc.view', 'documents.view']} />}>
                        <Route path="documents" element={<AdminDocumentsPage />} />
                        <Route path="documents-center" element={<AdminDocumentsPage />} />
                        <Route path="kyc" element={<AdminKycList />} />
                        <Route path="kyc/:customerId" element={<AdminKycDetail />} />
                      </Route>

                      {/* Payments & Disbursements */}
                      <Route element={<AdminPermissionRoute permission="payments.view" />}>
                        <Route path="payments" element={<AdminPaymentsPage />} />
                        <Route path="disbursements" element={<AdminDisbursementsPage />} />
                      </Route>

                      {/* Charges & Fee Approval */}
                      <Route element={<AdminPermissionRoute permission={['charges.view', 'payments.view']} />}>
                        <Route path="charges-approval" element={<AdminChargesApprovalPage />} />
                        <Route path="payments/charges-approval" element={<AdminChargesApprovalPage />} />
                      </Route>

                      {/* Reporting & Audit */}
                      <Route element={<AdminPermissionRoute permission="reports.view" />}>
                        <Route path="reports" element={<AdminReportsPage />} />
                      </Route>
                      <Route element={<AdminPermissionRoute permission="activity_logs.view" />}>
                        <Route path="audit" element={<AdminAuditLogsPage />} />
                        <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                      </Route>

                      {/* Communication & Multi-tenant */}
                      <Route element={<AdminPermissionRoute permission="communication.history" />}>
                        <Route path="support" element={<AdminSupportPage />} />
                        <Route path="messages" element={<AdminSupportPage />} />
                        <Route path="communication/messages" element={<AdminSupportPage />} />
                      </Route>
                      <Route path="notifications" element={<AdminNotificationsPage />} />

                      <Route element={<AdminPermissionRoute permission="domains.view" />}>
                        <Route path="domains" element={<AdminDomainManagementPage />} />
                        <Route path="settings/domains" element={<AdminDomainManagementPage />} />
                      </Route>

                      <Route element={<AdminPermissionRoute permission="charges.view" />}>
                        <Route path="payments/charges-fees" element={<AdminChargesPage />} />
                        <Route path="charges" element={<AdminChargesPage />} />
                        <Route path="settings/charges" element={<AdminChargesPage />} />
                      </Route>

                      <Route element={<AdminPermissionRoute permission="admin_users.view" />}>
                        <Route path="users" element={<AdminUsersPage />} />
                        <Route path="settings/users" element={<AdminUsersPage />} />
                      </Route>

                      {/* Settings */}
                      <Route path="settings" element={<Navigate to="/admin/settings/branding" replace />} />
                      <Route element={<AdminPermissionRoute permission="branding.view" />}>
                        <Route path="settings/branding" element={<AdminBrandingSettings />} />
                        <Route path="settings/document-branding" element={<AdminDocumentBrandingPage />} />
                        <Route path="document-branding" element={<AdminDocumentBrandingPage />} />
                        <Route path="settings/website-content" element={<AdminWebsiteContentPage />} />
                        <Route path="settings/content" element={<AdminWebsiteContentPage />} />
                        <Route path="settings/approval-letter" element={<AdminApprovalLetterPage />} />
                      </Route>
                      <Route element={<AdminPermissionRoute permission="upi.view" />}>
                        <Route path="settings/upi" element={<AdminUpiSettingsPage />} />
                        <Route path="settings/bank" element={<AdminBankSettingsPage />} />
                        <Route path="settings/payment-links" element={<AdminPaymentLinksPage />} />
                      </Route>
                      <Route element={<AdminPermissionRoute permission={['settings.view', 'communication.email', 'communication.whatsapp']} />}>
                        <Route path="settings/email" element={<AdminEmailSettings />} />
                        <Route path="settings/whatsapp" element={<AdminWhatsAppSettings />} />
                        <Route path="email" element={<AdminEmailSettings />} />
                        <Route path="whatsapp" element={<AdminWhatsAppSettings />} />
                        <Route path="communication/email" element={<AdminEmailSettings />} />
                        <Route path="communication/whatsapp" element={<AdminWhatsAppSettings />} />
                      </Route>
                    </Route>
                  </Route>
                </>
              )}

              {/* Fallback */}
              <Route
                path="*"
                element={<Navigate to={isAdminEnabled && !isCustomerEnabled ? "/admin/dashboard" : "/"} replace />}
              />
            </Routes>
          </BrowserRouter>
        </BrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}


export default App;

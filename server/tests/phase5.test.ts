import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSION_KEYS } from '../src/constants/permissions';

describe('Phase 5 — Complete Customer & Admin Integration Suite', () => {
  const customerMobile = '9811111111';
  const customerMobile2 = '9822222222';
  const adminEmail = 'phase5admin@loanapprove.com';
  const adminPassword = 'AdminSecret@2026';

  let customerToken: string;
  let customerId: string;
  let customerToken2: string;
  let customerId2: string;
  let adminToken: string;
  let testLoanId: string;
  let testPaymentId: string;

  beforeAll(async () => {
    // Clean up previous test artifacts
    await prisma.invoice.deleteMany({});
    await prisma.supportTicket.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerMobile, customerMobile2] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });

    // 1. Create Admin
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Operations VP',
        role: 'ADMIN',
        permissions: JSON.stringify(ALL_PERMISSION_KEYS),
        isActive: true,
      },
    });

    const adminLoginRes = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLoginRes.body.data.token;

    // 2. Register Customer 1
    const custRes = await request(app)
      .post('/api/auth/customer/register')
      .send({
        fullName: 'Vikram Malhotra',
        mobile: customerMobile,
        email: 'vikram.malhotra@fintech.test',
        address: 'B-402, Lotus Towers, Andheri West',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaar: '556677889900',
        monthlyIncome: 85000,
      });
    customerToken = custRes.body.data.token;
    customerId = custRes.body.data.user.id;

    // 3. Register Customer 2
    const cust2Res = await request(app)
      .post('/api/auth/customer/register')
      .send({
        fullName: 'Anita Sharma',
        mobile: customerMobile2,
        email: 'anita.sharma@fintech.test',
        address: '12-C, Residency Road',
        state: 'Karnataka',
        city: 'Bengaluru',
        aadhaar: '112233445566',
        monthlyIncome: 65000,
      });
    customerToken2 = cust2Res.body.data.token;
    customerId2 = cust2Res.body.data.user.id;
    expect(customerId2).toBeDefined();

    // Approve KYC for test customers to enable loan application
    await prisma.customer.update({
      where: { id: customerId },
      data: { kycStatus: 'APPROVED' },
    });
    await prisma.customer.update({
      where: { id: customerId2 },
      data: { kycStatus: 'APPROVED' },
    });

    // Create 4 mandatory loan documents for Customer 1 and Customer 2
    for (const dt of ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF', 'OTHER']) {
      await prisma.loanDocument.create({
        data: {
          customerId: customerId,
          documentType: dt,
          fileName: `${dt.toLowerCase()}.pdf`,
          filePath: `uploads/${dt.toLowerCase()}.pdf`,
          fileUrl: `/uploads/${dt.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          fileSize: 1024,
          status: 'PENDING',
          isCurrentVersion: true,
        },
      });
      await prisma.loanDocument.create({
        data: {
          customerId: customerId2,
          documentType: dt,
          fileName: `${dt.toLowerCase()}_2.pdf`,
          filePath: `uploads/${dt.toLowerCase()}_2.pdf`,
          fileUrl: `/uploads/${dt.toLowerCase()}_2.pdf`,
          mimeType: 'application/pdf',
          fileSize: 1024,
          status: 'PENDING',
          isCurrentVersion: true,
        },
      });
    }

    // 4. Submit Loan for Customer 1
    const loanRes = await request(app)
      .post('/api/customer/loan-applications')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        amount: 250000,
        tenureMonths: 24,
        purpose: 'Medical and healthcare expenses',
      });
    testLoanId = loanRes.body.data.id;
  }, 30000);

  afterAll(async () => {
    await prisma.invoice.deleteMany({});
    await prisma.supportTicket.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerMobile, customerMobile2] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });
  });

  // -------------------------------------------------------------
  // 1. PUBLIC BRANDING & SYSTEM SETTINGS
  // -------------------------------------------------------------
  describe('Public Configuration & Dynamic Branding', () => {
    it('should return public non-sensitive configuration without auth', async () => {
      const res = await request(app).get('/api/public/config');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.companyName).toBeDefined();
      expect(res.body.data.primaryColor).toMatch(/^#/);
      expect(res.body.data.payment).toBeDefined();
      expect(res.body.data.payment.chargeAmount).toBeGreaterThan(0);
      // Secrets must NOT be returned
      expect(res.body.data.smtpPasswordEnc).toBeUndefined();
      expect(res.body.data.accessTokenEnc).toBeUndefined();
    });

    it('should update branding via admin and reflect dynamically in public config', async () => {
      const updateRes = await request(app)
        .patch('/api/admin/settings/branding')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          companyName: 'Fintech Prestige Capital',
          appName: 'Prestige Loans',
          primaryColor: '#059669',
          email: 'contact@prestigecapital.in',
          phone: '+91 91234 56789',
          address: 'Bandra Kurla Complex, Mumbai 400051',
          website: 'https://prestigecapital.in',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.companyName).toBe('Fintech Prestige Capital');

      // Check public endpoint reflects this immediately
      const pubRes = await request(app).get('/api/public/config');
      expect(pubRes.body.data.companyName).toBe('Fintech Prestige Capital');
      expect(pubRes.body.data.primaryColor).toBe('#059669');
    });

    it('should update and retrieve email settings with masked password', async () => {
      const updateRes = await request(app)
        .patch('/api/admin/settings/email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          smtpHost: 'smtp.sendgrid.net',
          smtpPort: 587,
          smtpUsername: 'apikey',
          smtpPassword: 'SG.SuperSecretPassword123',
          fromName: 'Fintech Prestige Capital',
          fromEmail: 'alerts@prestigecapital.in',
          encryption: 'STARTTLS',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.hasPassword).toBe(true);
      expect(updateRes.body.data.maskedPassword).toBe('••••••••••••');
      // Plain text password must not leak
      expect(updateRes.body.data.smtpPassword).toBeUndefined();

      const getRes = await request(app)
        .get('/api/admin/settings/email')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.maskedPassword).toBe('••••••••••••');
    });

    it('should dispatch test email', async () => {
      const res = await request(app)
        .post('/api/admin/settings/email/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ toEmail: 'test.admin@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }, 15000);

    it('should update and retrieve WhatsApp settings with masked token', async () => {
      const updateRes = await request(app)
        .patch('/api/admin/settings/whatsapp')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          provider: 'META',
          phoneNumber: '+919123456789',
          phoneNumberId: '10987654321',
          businessAccountId: '5432167890',
          apiEndpoint: 'https://graph.facebook.com/v19.0',
          accessToken: 'EAAX_MetaAccessTokenSecret',
          enabled: true,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.hasAccessToken).toBe(true);
      expect(updateRes.body.data.maskedAccessToken).toBe('••••••••••••');
    });
  });

  // -------------------------------------------------------------
  // 2. CUSTOMER PAYMENT SUBMISSION & VERIFICATION
  // -------------------------------------------------------------
  describe('Payment Workflow & Automatic Server-Side Approval', () => {
    const testUtr = 'UTR202609199999';

    it('Customer fetches payment requirement for loan', async () => {
      const res = await request(app)
        .get(`/api/customer/payments/${testLoanId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.loanId).toBe(testLoanId);
      expect(res.body.data.chargeAmount).toBeGreaterThan(0);
      expect(res.body.data.paymentStatus).toBe('PAYMENT_REQUIRED');
      expect(res.body.data.upiId).toBeDefined();
    });

    it('Customer submits UTR transaction reference', async () => {
      const res = await request(app)
        .post(`/api/customer/payments/${testLoanId}/submit-utr`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          utr: testUtr,
          paymentMethod: 'UPI',
          notes: 'Paid from GPay UPI handle',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UNDER_VERIFICATION');
      expect(res.body.data.transactionRef).toBe(testUtr);
      testPaymentId = res.body.data.id;
    });

    it('PREVENT DUPLICATE UTR: Re-submitting the same UTR on another loan must fail', async () => {
      // Create a second loan for customer 2
      const secondLoanRes = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerToken2}`)
        .send({
          amount: 50000,
          tenureMonths: 12,
          purpose: 'Consumer electronics',
        });
      const loan2Id = secondLoanRes.body.data.id;

      const dupRes = await request(app)
        .post(`/api/customer/payments/${loan2Id}/submit-utr`)
        .set('Authorization', `Bearer ${customerToken2}`)
        .send({
          utr: testUtr, // Duplicate!
          paymentMethod: 'UPI',
        });

      expect(dupRes.status).toBe(400);
      expect(dupRes.body.message).toContain('Duplicate UTR');
    });

    it('Admin lists payments and views submitted payment', async () => {
      const res = await request(app)
        .get('/api/admin/payments?status=UNDER_VERIFICATION')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.find((p: { utr: string }) => p.utr === testUtr);
      expect(found).toBeDefined();
      expect(found.customerName).toBe('Vikram Malhotra');
    });

    it('Admin approves loan application: transitions loan to APPROVED, creates EMI schedule and agreement', async () => {
      // Ensure KYC verified so underwriting approves
      await prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'VERIFIED' },
      });

      const approveRes = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          approvedAmount: 250000,
          tenureMonths: 24,
          interestRate: 2.0,
        });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('APPROVED');
      expect(approveRes.body.data.approvedAmount).toBe(250000);

      // Verify EMI schedule generated
      const emiCount = await prisma.eMISchedule.count({ where: { loanId: testLoanId } });
      expect(emiCount).toBe(24);

      // Verify Loan Agreement generated
      const agreement = await prisma.loanAgreement.findUnique({ where: { loanId: testLoanId } });
      expect(agreement).not.toBeNull();
      expect(agreement?.acceptanceStatus).toBe('PENDING');

      // Verify Customer Notification created
      const notif = await prisma.notification.findFirst({
        where: { customerId, eventType: 'LOAN_STATUS' },
      });
      expect(notif).not.toBeNull();
    }, 30000);

    it('Admin verifies payment: marks Payment as PAID and Charge as PAID without altering loan approval status', async () => {
      const res = await request(app)
        .post(`/api/admin/payments/${testPaymentId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedPayment.status).toBe('PAID');
      expect(res.body.data.updatedLoan.paymentStatus).toBe('PAID');
      expect(res.body.data.updatedLoan.status).toBe('APPROVED'); // Remained approved by explicit admin action

      // Verify Customer Notification created
      const notif = await prisma.notification.findFirst({
        where: { customerId, eventType: 'PAYMENT_VERIFIED' },
      });
      expect(notif).not.toBeNull();
    });

    it('Idempotency: Re-verifying an already PAID payment must fail', async () => {
      const res = await request(app)
        .post(`/api/admin/payments/${testPaymentId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already been verified');
    });
  });

  // -------------------------------------------------------------
  // 3. ONE ACTIVE LOAN RULE ENFORCEMENT
  // -------------------------------------------------------------
  describe('One Approved Loan Rule Enforcement', () => {
    it('Strictly prevents submitting a second loan when one is already active (One-Active-Loan Rule)', async () => {
      // Customer 1 already has an APPROVED active loan from the previous describe block.
      // Attempting to create a SECOND loan application must be blocked at submission time.
      const loan2Res = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          amount: 100000,
          tenureMonths: 12,
          purpose: 'Home renovation',
        });

      // One-Active-Loan-Per-Customer rule enforced at creation — returns 409 Conflict
      expect(loan2Res.status).toBe(409);
      expect(loan2Res.body.success).toBe(false);
      expect(loan2Res.body.code).toBe('ACTIVE_APPLICATION_EXISTS');
      // No second loan ID created
      expect(loan2Res.body.data?.id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------
  // 4. LOAN AGREEMENT SIGNING
  // -------------------------------------------------------------
  describe('Customer Loan Agreement Flow', () => {
    it('Customer views loan agreement', async () => {
      const res = await request(app)
        .get(`/api/customer/loans/${testLoanId}/agreement`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.loanId).toBe(testLoanId);
      expect(res.body.data.acceptanceStatus).toBe('PENDING');
      expect(res.body.data.contentHtml).toContain('LOAN SANCTION & BORROWER AGREEMENT');
    });

    it('Customer accepts loan agreement', async () => {
      const res = await request(app)
        .post(`/api/customer/loans/${testLoanId}/agreement/accept`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.acceptanceStatus).toBe('ACCEPTED');
      expect(res.body.data.acceptedAt).toBeDefined();
    });

    it('Idempotency: Re-accepting agreement must fail', async () => {
      const res = await request(app)
        .post(`/api/customer/loans/${testLoanId}/agreement/accept`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already been accepted');
    });
  });

  // -------------------------------------------------------------
  // 5. DISBURSEMENT WORKFLOW
  // -------------------------------------------------------------
  describe('Admin Disbursement Recording', () => {
    const disbRef = 'DISB-HDFC-2026-001';

    it('Admin records disbursement for approved loan', async () => {
      const res = await request(app)
        .post('/api/admin/disbursements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          loanId: testLoanId,
          amount: 250000,
          method: 'BANK_TRANSFER',
          referenceId: disbRef,
          notes: 'Disbursed to HDFC Bank primary account',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.referenceId).toBe(disbRef);
    });

    it('Customer views disbursement details', async () => {
      const res = await request(app)
        .get(`/api/customer/loans/${testLoanId}/disbursement`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.referenceId).toBe(disbRef);
      expect(res.body.data.amount).toBe(250000);
    });
  });

  // -------------------------------------------------------------
  // 6. DYNAMIC DASHBOARDS & CUSTOMER 360
  // -------------------------------------------------------------
  describe('Dynamic Dashboards, Funnel, Reports & Audit', () => {
    it('Admin Dashboard returns dynamic 12 KPIs and funnel statistics', async () => {
      const res = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.kpis).toBeDefined();
      expect(res.body.data.kpis.totalCustomers).toBeGreaterThanOrEqual(2);
      expect(res.body.data.kpis.approvedLoans).toBeGreaterThanOrEqual(1);
      expect(res.body.data.kpis.totalDisbursed).toBeGreaterThanOrEqual(250000);
      expect(res.body.data.funnel).toBeDefined();
      expect(res.body.data.funnel.length).toBe(6);
      expect(res.body.data.trackingTable).toBeDefined();
      expect(res.body.data.trackingTable.length).toBeGreaterThanOrEqual(1);
    });

    it('Customer Dashboard returns dynamic personal summary, timeline and notifications', async () => {
      const res = await request(app)
        .get('/api/customer/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customer.fullName).toBe('Vikram Malhotra');
      expect(res.body.data.loanSummary).toBeDefined();
      expect(res.body.data.loanSummary.status).toBe('APPROVED');
      expect(res.body.data.loanSummary.isDisbursed).toBe(true);
      expect(res.body.data.timeline.length).toBe(7);
      expect(res.body.data.notifications.length).toBeGreaterThanOrEqual(1);
    });

    it('Admin Customer 360 returns complete customer profile, loans, disbursements, and audit timeline', async () => {
      const res = await request(app)
        .get(`/api/admin/customers/${customerId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customer.mobile).toBe(customerMobile);
      expect(res.body.data.loans.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.payments.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.disbursements.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.timeline.length).toBeGreaterThanOrEqual(1);
    });

    it('Admin exports reports as CSV', async () => {
      const res = await request(app)
        .get('/api/admin/reports/export/excel?type=loans')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Application ID,Customer Name,Mobile');
    });

    it('Admin queries audit logs with filters', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?action=PAYMENT_VERIFIED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].action).toBe('PAYMENT_VERIFIED');
    });
  });

  // -------------------------------------------------------------
  // 7. SUPPORT TICKETS & NOTIFICATIONS
  // -------------------------------------------------------------
  describe('Customer Support & In-App Notifications', () => {
    let ticketId: string;

    it('Customer creates a support ticket', async () => {
      const res = await request(app)
        .post('/api/customer/support/tickets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          subject: 'EMI Payment Schedule Query',
          message: 'Can I change my monthly deduction date from 5th to 10th of the month?',
          category: 'PAYMENT',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('OPEN');
      ticketId = res.body.data.id;
    });

    it('Admin lists and replies to support ticket', async () => {
      const res = await request(app)
        .post(`/api/admin/support/tickets/${ticketId}/reply`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adminReply: 'Hello Vikram, deduction dates are aligned with NACH clearing. We have recorded your preference.',
          status: 'RESOLVED',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');
      expect(res.body.data.adminReply).toContain('NACH clearing');
    });

    it('Customer retrieves notifications and marks as read', async () => {
      const listRes = await request(app)
        .get('/api/customer/notifications')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
      const targetNotifId = listRes.body.data[0].id;

      const readRes = await request(app)
        .patch(`/api/customer/notifications/${targetNotifId}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.isRead).toBe(true);
    });
  });
});

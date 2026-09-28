import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import bcrypt from 'bcryptjs';

describe('Phase 4 — Loan Application & Management Suite', () => {
  const customerMobileA = '9800000001';
  const customerMobileB = '9800000002';
  const adminEmail = 'loanadmin@loanapprove.com';
  const adminPassword = 'AdminSecret@2026';

  let customerTokenA: string;
  let customerTokenB: string;
  let customerIdA: string;
  let customerIdB: string;
  let adminToken: string;

  beforeAll(async () => {
    // Clean up previous test data
    await prisma.invoice.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.verificationToken.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerMobileA, customerMobileB] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });

    // Register Customer A
    const resCustA = await request(app)
      .post('/api/auth/customer/register')
      .send({
        mobile: customerMobileA,
        fullName: 'Borrower Alpha',
        email: 'borrower.a@example.com',
        address: '123 MG Road, Indiranagar',
        state: 'Karnataka',
        city: 'Bengaluru',
        aadhaar: '123456789012',
        monthlyIncome: 75000,
      });
    expect(resCustA.status).toBe(201);
    customerTokenA = resCustA.body.data.token;
    customerIdA = resCustA.body.data.user.id;

    // Register Customer B
    const resCustB = await request(app)
      .post('/api/auth/customer/register')
      .send({
        mobile: customerMobileB,
        fullName: 'Borrower Beta',
        email: 'borrower.b@example.com',
        address: '456 FC Road, Deccan',
        state: 'Maharashtra',
        city: 'Pune',
        aadhaar: '987654321098',
        monthlyIncome: 60000,
      });
    expect(resCustB.status).toBe(201);
    customerTokenB = resCustB.body.data.token;
    customerIdB = resCustB.body.data.user.id;
    expect(customerIdB).toBeDefined();

    // Create and seed Admin
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Lead Loan Underwriter',
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Login Admin
    const resAdmin = await request(app)
      .post('/api/auth/admin/login')
      .send({
        email: adminEmail,
        password: adminPassword,
      });
    expect(resAdmin.status).toBe(200);
    adminToken = resAdmin.body.data.token;
  }, 30000);

  afterAll(async () => {
    await prisma.invoice.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.verificationToken.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerMobileA, customerMobileB] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });
  }, 30000);

  // -------------------------------------------------------------
  // 1. CUSTOMER APPLICATION CREATION & VALIDATION
  // -------------------------------------------------------------
  describe('Customer Application Submission', () => {
    it('should reject unauthenticated application creation', async () => {
      const res = await request(app)
        .post('/api/customer/loan-applications')
        .send({
          amount: 50000,
          tenureMonths: 12,
          purpose: 'Medical emergency',
        });
      expect(res.status).toBe(401);
    });

    it('should fail validation when loan amount is zero or negative', async () => {
      const resZero = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 0,
          tenureMonths: 12,
          purpose: 'Education fees',
        });
      expect(resZero.status).toBe(400);

      const resNeg = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: -15000,
          tenureMonths: 12,
          purpose: 'Education fees',
        });
      expect(resNeg.status).toBe(400);
    });

    it('should fail validation when tenure is non-positive or not an integer', async () => {
      const resFloat = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 50000,
          tenureMonths: 12.5,
          purpose: 'Home renovation',
        });
      expect(resFloat.status).toBe(400);

      const resZero = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 50000,
          tenureMonths: 0,
          purpose: 'Home renovation',
        });
      expect(resZero.status).toBe(400);
    });

    it('should fail validation when purpose is missing or empty', async () => {
      const resMissing = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 50000,
          tenureMonths: 12,
        });
      expect(resMissing.status).toBe(400);

      const resEmpty = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 50000,
          tenureMonths: 12,
          purpose: '   ',
        });
      expect(resEmpty.status).toBe(400);
    });

    it('should reject loan application with 403 KYC_REQUIRED when customer KYC is not approved', async () => {
      // Ensure customer has unapproved KYC
      await prisma.customer.update({
        where: { id: customerIdA },
        data: { kycStatus: 'UNDER_REVIEW' },
      });

      const res = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 150000,
          tenureMonths: 24,
          purpose: 'Higher education',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('KYC_REQUIRED');
      expect(res.body.message).toContain('KYC approval is required');

      // Now approve KYC for subsequent tests
      await prisma.customer.update({
        where: { id: customerIdA },
        data: { kycStatus: 'APPROVED' },
      });
      await prisma.customer.update({
        where: { id: customerIdB },
        data: { kycStatus: 'APPROVED' },
      });

      for (const cid of [customerIdA, customerIdB]) {
        for (const dt of ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF', 'OTHER']) {
          await prisma.loanDocument.create({
            data: {
              customerId: cid,
              documentType: dt,
              fileName: `${dt}.pdf`,
              filePath: `uploads/${dt}.pdf`,
              fileUrl: `/uploads/${dt}.pdf`,
              mimeType: 'application/pdf',
              fileSize: 1024,
              status: 'PENDING',
              isCurrentVersion: true,
            },
          });
        }
      }
    });

    it('should successfully submit a valid loan application for Customer A once KYC is approved', async () => {
      const res = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 150000,
          tenureMonths: 24,
          purpose: 'Higher education and certification fees',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.applicationNumber).toMatch(/^LA-\d{4}-\d{6}$/);
      expect(res.body.data.customerId).toBe(customerIdA);
      expect(res.body.data.requestedAmount).toBe(150000);
      expect(res.body.data.tenureMonths).toBe(24);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.submittedAt).toBeDefined();

      // Verify audit logs generated
      const logs = await prisma.auditLog.findMany({
        where: { entityId: res.body.data.id },
      });
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('APPLICATION_CREATED');
      expect(actions).toContain('APPLICATION_SUBMITTED');
    });

    it('should REJECT a second application while one is already active (One-Active-Loan Rule)', async () => {
      const res = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 75000,
          tenureMonths: 12,
          purpose: 'Small business working capital',
        });

      // One-Active-Loan-Per-Customer rule: must return 409 Conflict
      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('ACTIVE_APPLICATION_EXISTS');
    });
  });

  // -------------------------------------------------------------
  // 2. CUSTOMER LIST & DETAIL & IDOR SECURITY
  // -------------------------------------------------------------
  describe('Customer Read & IDOR Protection', () => {
    let appAId: string;
    let appBId: string;

    beforeAll(async () => {
      // Customer B creates an application
      const resB = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenB}`)
        .send({
          amount: 200000,
          tenureMonths: 36,
          purpose: 'Debt consolidation',
        });
      appBId = resB.body.data.id;

      // Fetch Customer A's first application
      const resListA = await request(app)
        .get('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`);
      appAId = resListA.body.data[0].id;
    });

    it('should list only applications belonging to the authenticated customer', async () => {
      const res = await request(app)
        .get('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(200);
      // One-Active-Loan rule: only 1 application per customer at a time
      expect(res.body.data.length).toBe(1);
      res.body.data.forEach((appItem: { requestedAmount: number }) => {
        expect([150000]).toContain(appItem.requestedAmount);
      });
    });

    it('should allow Customer A to get details of their own application', async () => {
      const res = await request(app)
        .get(`/api/customer/loan-applications/${appAId}`)
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(appAId);
      expect(res.body.data.requestedAmount).toBeDefined();
      expect(res.body.data.purpose).toBeDefined();
    });

    it('IDOR TEST: Customer A must NOT be able to view Customer B application', async () => {
      const res = await request(app)
        .get(`/api/customer/loan-applications/${appBId}`)
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('IDOR TEST: Customer A must NOT be able to view Customer B application via direct /api/loan-applications/:id', async () => {
      const res = await request(app)
        .get(`/api/loan-applications/${appBId}`)
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('TAMPER TEST: Customer cannot directly alter application status via PATCH', async () => {
      const res = await request(app)
        .patch(`/api/customer/loan-applications/${appAId}`)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('TAMPER TEST: Customer cannot directly alter application status via direct /api/loan-applications/:id', async () => {
      const res = await request(app)
        .patch(`/api/loan-applications/${appAId}`)
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('AUTHORIZATION TEST: Customer cannot access admin applications list', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(403);
    });
  });

  // -------------------------------------------------------------
  // 3. ADMIN LIST, SEARCH, FILTERS & PAGINATION
  // -------------------------------------------------------------
  describe('Admin Application Dashboard & Search', () => {
    it('should list applications with pagination', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications?page=1&pageSize=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
      // One-Active-Loan rule: 1 app for Customer A + 1 for Customer B = 2 total
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should search applications by customer name', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications?search=Alpha')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].customerName).toContain('Alpha');
    });

    it('should search applications by mobile number', async () => {
      const res = await request(app)
        .get(`/api/admin/loan-applications?search=${customerMobileB}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].mobile).toBe(customerMobileB);
    });

    it('should filter applications by status', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications?status=SUBMITTED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((item: { status: string }) => {
        expect(item.status).toBe('SUBMITTED');
      });
    });

    it('should filter applications by location (state and city)', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications?state=Karnataka&city=Bengaluru')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.forEach((item: { state: string; city: string }) => {
        expect(item.state).toBe('Karnataka');
        expect(item.city).toBe('Bengaluru');
      });
    });

    it('should filter applications by dateFilter TODAY', async () => {
      const res = await request(app)
        .get('/api/admin/loan-applications?dateFilter=TODAY')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // One-Active-Loan rule: 1 per Customer A + 1 for Customer B = 2 created today
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should get detailed application info with borrower profile and KYC status', async () => {
      const listRes = await request(app)
        .get('/api/admin/loan-applications')
        .set('Authorization', `Bearer ${adminToken}`);

      const targetId = listRes.body.data[0].id;
      const res = await request(app)
        .get(`/api/admin/loan-applications/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.customer.fullName).toBeDefined();
      expect(res.body.data.customer.kycStatus).toBeDefined();
      expect(res.body.data.customer.aadhaarMasked).toBeDefined();
    });
  });

  // -------------------------------------------------------------
  // 4. ADMIN REVIEW WORKFLOW & CONTROLLED TRANSITIONS
  // -------------------------------------------------------------
  describe('Admin Review Actions & State Machine', () => {
    let testLoanId: string;

    beforeAll(async () => {
      // Close any existing active loan for Customer A before creating a fresh one
      await prisma.loanApplication.updateMany({
        where: {
          customerId: customerIdA,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'ON_HOLD', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED'] },
        },
        data: { status: 'REJECTED', rejectionReason: 'Test cleanup — closing prior test section loan' },
      });

      // Create a fresh application for testing review actions
      const res = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 300000,
          tenureMonths: 36,
          purpose: 'Home expansion',
        });
      testLoanId = res.body.data.id;
    });

    it('should move SUBMITTED -> UNDER_REVIEW when admin starts review', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
      expect(res.body.data.reviewedBy).toBe('Lead Loan Underwriter');
      expect(res.body.data.reviewedAt).toBeDefined();

      const log = await prisma.auditLog.findFirst({
        where: { entityId: testLoanId, action: 'APPLICATION_REVIEW_STARTED' },
      });
      expect(log).not.toBeNull();
    });

    it('should reject invalid transition to UNDER_REVIEW if already UNDER_REVIEW', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
    });

    it('should request additional documents and set status to DOCUMENTS_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/request-documents`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          documentType: 'BANK_STATEMENT',
          title: 'Latest 6 Months Bank Statement',
          description: 'Required for income verification',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.application.status).toBe('DOCUMENTS_REQUIRED');
      expect(res.body.data.documentRequest).toBeDefined();
      expect(res.body.data.documentRequest.loanId).toBe(testLoanId);
      expect(res.body.data.documentRequest.documentType).toBe('BANK_STATEMENT');

      // Verify DocumentRequest exists in database linked to loan
      const docReq = await prisma.documentRequest.findFirst({
        where: { loanId: testLoanId },
      });
      expect(docReq).not.toBeNull();
      expect(docReq?.title).toBe('Latest 6 Months Bank Statement');
    });

    it('should allow admin to resume review from DOCUMENTS_REQUIRED', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
    });

    it('should put application ON_HOLD with mandatory reason', async () => {
      // Test missing reason fails
      const failRes = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/hold`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(failRes.status).toBe(400);

      // Valid reason succeeds
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/hold`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ holdReason: 'Awaiting primary employer verification check' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ON_HOLD');
      expect(res.body.data.holdReason).toBe('Awaiting primary employer verification check');
    });

    it('should resume review from ON_HOLD', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${testLoanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('UNDER_REVIEW');
    });
  });

  // -------------------------------------------------------------
  // 5. OFFER MANAGEMENT (MODIFY AMOUNT + ACCEPT / REJECT)
  // -------------------------------------------------------------
  describe('Offer Workflow: Modify Amount & Borrower Decision', () => {
    let offerLoanA: string;
    let offerLoanB: string;

    beforeAll(async () => {
      // Close any existing active loan for Customer A before creating test offers
      await prisma.loanApplication.updateMany({
        where: {
          customerId: customerIdA,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'ON_HOLD', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED'] },
        },
        data: { status: 'REJECTED', rejectionReason: 'Test cleanup — closing prior test section loan' },
      });

      // Create application A: ₹2,00,000
      const resA = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 200000,
          tenureMonths: 24,
          purpose: 'Consumer electronics',
        });
      offerLoanA = resA.body.data.id;
      // Start review
      await request(app)
        .post(`/api/admin/loan-applications/${offerLoanA}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Reject offerLoanA to free up the slot for offerLoanB
      // (offerLoanA is in UNDER_REVIEW; we need B too — accept/reject happen in the tests themselves)
      // We'll close A after offer modify test; for now just create B via admin direct DB insert
      offerLoanB = (await prisma.loanApplication.create({
        data: {
          customerId: customerIdA,
          applicationNumber: `LA-TEST-${Date.now()}`,
          requestedAmount: 500000,
          tenureMonths: 48,
          purpose: 'Vehicle purchase',
          status: 'UNDER_REVIEW',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      })).id;
    });

    it('Admin modifies loan amount from ₹2,00,000 to ₹1,50,000', async () => {
      const res = await request(app)
        .post(`/api/admin/loan-applications/${offerLoanA}/modify-amount`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ proposedAmount: 150000 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('OFFER_PENDING_CUSTOMER');
      expect(res.body.data.proposedAmount).toBe(150000);
      expect(res.body.data.requestedAmount).toBe(200000); // Unchanged!

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { entityId: offerLoanA, action: 'LOAN_AMOUNT_MODIFIED' },
      });
      expect(log).not.toBeNull();
    });

    it('IDOR TEST: Customer B cannot accept offer on Customer A application', async () => {
      const res = await request(app)
        .post(`/api/customer/loan-applications/${offerLoanA}/offer/accept`)
        .set('Authorization', `Bearer ${customerTokenB}`);

      expect(res.status).toBe(403);
    });

    it('IDOR TEST: Customer B cannot reject offer on Customer A application', async () => {
      const res = await request(app)
        .post(`/api/customer/loan-applications/${offerLoanA}/offer/reject`)
        .set('Authorization', `Bearer ${customerTokenB}`);

      expect(res.status).toBe(403);
    });

    it('Customer A accepts offer of ₹1,50,000 -> OFFER_ACCEPTED', async () => {
      const res = await request(app)
        .post(`/api/customer/loan-applications/${offerLoanA}/offer/accept`)
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('OFFER_ACCEPTED');
      expect(res.body.data.acceptedAmount).toBe(150000);
      expect(res.body.data.approvedAmount).toBe(150000);
      expect(res.body.data.modifiedOfferAccepted).toBe(true);
      expect(res.body.data.requestedAmount).toBe(200000); // Preserved!

      // Audit log check
      const log = await prisma.auditLog.findFirst({
        where: { entityId: offerLoanA, action: 'OFFER_ACCEPTED' },
      });
      expect(log).not.toBeNull();
    });

    it('Customer A rejects offer on application B -> OFFER_REJECTED', async () => {
      // Admin modifies B
      await request(app)
        .post(`/api/admin/loan-applications/${offerLoanB}/modify-amount`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ proposedAmount: 350000 });

      const res = await request(app)
        .post(`/api/customer/loan-applications/${offerLoanB}/offer/reject`)
        .set('Authorization', `Bearer ${customerTokenA}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('OFFER_REJECTED');
      expect(res.body.data.modifiedOfferAccepted).toBe(false);

      // Audit log check
      const log = await prisma.auditLog.findFirst({
        where: { entityId: offerLoanB, action: 'OFFER_REJECTED' },
      });
      expect(log).not.toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 6. ADMIN REJECTION & APPROVAL WORKFLOW
  // -------------------------------------------------------------
  describe('Direct Admin Rejection & Approval', () => {
    let rejectLoanId: string;
    let approveLoanId: string;

    beforeAll(async () => {
      // Close any existing active loan for Customer A before creating rejection/approval test loans
      await prisma.loanApplication.updateMany({
        where: {
          customerId: customerIdA,
          status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED', 'ON_HOLD', 'OFFER_PENDING_CUSTOMER', 'OFFER_ACCEPTED'] },
        },
        data: { status: 'REJECTED', rejectionReason: 'Test cleanup — closing prior test section loan' },
      });

      // Create loan for rejection
      const resR = await request(app)
        .post('/api/customer/loan-applications')
        .set('Authorization', `Bearer ${customerTokenA}`)
        .send({
          amount: 80000,
          tenureMonths: 12,
          purpose: 'Travel and vacation',
        });
      rejectLoanId = resR.body.data.id;
      await request(app)
        .post(`/api/admin/loan-applications/${rejectLoanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`);

      // Reject the first loan to free up the slot, then create approval loan
      await prisma.loanApplication.update({
        where: { id: rejectLoanId },
        data: { status: 'UNDER_REVIEW' },  // ensure it's reviewable
      });

      // Create loan for approval using direct DB insert (avoids one-loan guard)
      approveLoanId = (await prisma.loanApplication.create({
        data: {
          customerId: customerIdA,
          applicationNumber: `LA-TEST-${Date.now()}`,
          requestedAmount: 100000,
          tenureMonths: 18,
          purpose: 'Laptop and work station equipment',
          status: 'UNDER_REVIEW',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      })).id;
    });

    it('should reject application with mandatory rejection reason', async () => {
      // Missing reason fails
      const failRes = await request(app)
        .post(`/api/admin/loan-applications/${rejectLoanId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(failRes.status).toBe(400);

      // Valid rejection succeeds
      const res = await request(app)
        .post(`/api/admin/loan-applications/${rejectLoanId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ rejectionReason: 'Debt-to-income ratio exceeds permissible threshold' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('REJECTED');
      expect(res.body.data.rejectionReason).toBe(
        'Debt-to-income ratio exceeds permissible threshold'
      );

      const log = await prisma.auditLog.findFirst({
        where: { entityId: rejectLoanId, action: 'APPLICATION_REJECTED' },
      });
      expect(log).not.toBeNull();
    }, 15000);

    it('should block loan approval if customer KYC is not verified (KYC GATE)', async () => {
      // Set Customer A to unapproved KYC
      await prisma.customer.update({
        where: { id: customerIdA },
        data: { kycStatus: 'UNDER_REVIEW' },
      });

      const res = await request(app)
        .post(`/api/admin/loan-applications/${approveLoanId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('KYC is not verified');
    }, 15000);

    it('should approve application directly at requested amount once KYC is approved', async () => {
      // Complete KYC Gate
      await prisma.customer.update({
        where: { id: customerIdA },
        data: { kycStatus: 'APPROVED' },
      });

      const res = await request(app)
        .post(`/api/admin/loan-applications/${approveLoanId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('APPROVED');
      expect(res.body.data.approvedAmount).toBe(100000);

      const log = await prisma.auditLog.findFirst({
        where: { entityId: approveLoanId, action: 'APPLICATION_APPROVED' },
      });
      expect(log).not.toBeNull();
    }, 30000);
  });
});

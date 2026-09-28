import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import { adminKycService } from '../src/services/adminKycService';
import bcrypt from 'bcryptjs';

describe('KYC Document-Level Verification & Authoritative Lifecycle Suite (Mandatory 14 Tests)', () => {
  const adminEmail = 'kyc-compliance-officer@loanapprove.com';
  const adminPassword = 'AdminSecret@2026';
  let adminToken: string;
  let adminUser: any;

  // Sample dummy PDF buffers for uploads
  const samplePdfBuffer = Buffer.from('%PDF-1.4 sample kyc test document content');
  const samplePanBuffer = Buffer.from('%PDF-1.4 sample pan card document content');

  beforeAll(async () => {
    // Ensure clean state for test admin
    await prisma.adminUser.deleteMany({ where: { email: adminEmail } });

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    adminUser = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        fullName: 'KYC Compliance Lead',
        passwordHash,
        role: 'SUPER_ADMIN',
        isActive: true,
      },
    });

    const loginRes = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword });
    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.data.token;
  }, 30000);

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: adminEmail } });
  }, 30000);

  // Helper to register a new customer
  async function createTestCustomer(suffix: string) {
    const mobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const regRes = await request(app)
      .post('/api/auth/customer/register')
      .send({
        mobile,
        fullName: `KYC Test User ${suffix}`,
        email: `kyc.test.${suffix.toLowerCase()}.${Date.now()}@example.com`,
        address: '100 Compliance Park, Sector 4',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaar: '123456789012',
        monthlyIncome: 65000,
      });
    expect(regRes.status).toBe(201);
    return {
      id: regRes.body.data.user.id,
      token: regRes.body.data.token,
      mobile,
      fullName: `KYC Test User ${suffix}`,
    };
  }

  // ---------------------------------------------------------------------------
  // TEST 1: New customer, no documents -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 1: New customer with no documents -> KYC NOT VERIFIED (PENDING)', async () => {
    const customer = await createTestCustomer('Test1');

    const profileRes = await request(app)
      .get('/api/customer/profile')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.data.profile.kycStatus).toBe('PENDING');
    expect(profileRes.body.data.profile.kycStatus).not.toBe('APPROVED');
    expect(profileRes.body.data.profile.kycStatus).not.toBe('VERIFIED');

    // Admin KYC details endpoint also reflects PENDING
    const adminDetailRes = await request(app)
      .get(`/api/admin/kyc/${customer.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.customer.kycStatus).toBe('PENDING');
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Front uploaded only -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 2: Front uploaded only -> KYC NOT VERIFIED', async () => {
    const customer = await createTestCustomer('Test2');

    // Upload Aadhaar Front only
    const uploadFrontRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'aadhaar_front.pdf');
    expect(uploadFrontRes.status).toBe(201);
    expect(uploadFrontRes.body.data.document.status).toBe('PENDING');

    // Verify KYC status is NOT VERIFIED/APPROVED
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');
    expect(dbCustomer?.kycStatus).not.toBe('VERIFIED');

    // Attempting to submit KYC without back document is rejected
    const submitRes = await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(submitRes.status).toBe(400);
    expect(submitRes.body.message).toContain('Both Aadhaar Front and Aadhaar Back');
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Front + Back uploaded -> KYC NOT VERIFIED until Admin review/approval
  // ---------------------------------------------------------------------------
  it('TEST 3: Front + Back uploaded -> KYC NOT VERIFIED until Admin review/approval (UNDER_REVIEW)', async () => {
    const customer = await createTestCustomer('Test3');

    // Upload Front
    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');

    // Upload Back
    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    // Customer Submits KYC for review
    const submitRes = await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.data.kycStatus).toBe('UNDER_REVIEW');

    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('UNDER_REVIEW');
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');
    expect(dbCustomer?.kycStatus).not.toBe('VERIFIED');

    // No KYC charge created prematurely upon submission
    const charges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    expect(charges.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Front APPROVED, Back PENDING -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 4: Front APPROVED, Back PENDING -> KYC NOT VERIFIED', async () => {
    const customer = await createTestCustomer('Test4');

    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const frontDocId = fRes.body.data.document.id;

    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);

    // Admin approves Front only
    const reviewRes = await request(app)
      .post(`/api/admin/kyc/documents/${frontDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.data.document.status).toBe('APPROVED');

    // KYC must NOT be APPROVED because Back is still PENDING/UNDER_REVIEW
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('UNDER_REVIEW');
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');

    // Direct override to APPROVED must be rejected by backend guard
    const overrideRes = await request(app)
      .post(`/api/admin/kyc/${customer.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });
    expect(overrideRes.status).toBe(400);
    expect(overrideRes.body.message).toContain('All required documents must be individually reviewed and approved first');
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Front APPROVED, Back REJECTED -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 5: Front APPROVED, Back REJECTED -> KYC NOT VERIFIED (REJECTED)', async () => {
    const customer = await createTestCustomer('Test5');

    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const frontDocId = fRes.body.data.document.id;

    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');
    const backDocId = bRes.body.data.document.id;

    await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);

    // Admin approves Front
    await request(app)
      .post(`/api/admin/kyc/documents/${frontDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // Admin rejects Back
    const rejRes = await request(app)
      .post(`/api/admin/kyc/documents/${backDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'REJECT', reason: 'Blurry back image, barcode unreadable' });
    expect(rejRes.status).toBe(200);

    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('REJECTED');
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Front APPROVED, Back CORRECTION_REQUIRED -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 6: Front APPROVED, Back CORRECTION_REQUIRED -> KYC NOT VERIFIED (REUPLOAD_REQUIRED)', async () => {
    const customer = await createTestCustomer('Test6');

    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const frontDocId = fRes.body.data.document.id;

    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');
    const backDocId = bRes.body.data.document.id;

    await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);

    await request(app)
      .post(`/api/admin/kyc/documents/${frontDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // Admin requests re-upload for Back
    const reqRes = await request(app)
      .post(`/api/admin/kyc/documents/${backDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'REQUEST_REUPLOAD', reason: 'Corners are cut off, please upload full sheet' });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.data.document.status).toBe('REUPLOAD_REQUIRED');

    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('REUPLOAD_REQUIRED');
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Front APPROVED, Back APPROVED -> KYC can become APPROVED
  // ---------------------------------------------------------------------------
  it('TEST 7: Front APPROVED, Back APPROVED -> KYC transitions to APPROVED & charge is activated', async () => {
    const customer = await createTestCustomer('Test7');

    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const frontDocId = fRes.body.data.document.id;

    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');
    const backDocId = bRes.body.data.document.id;

    await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customer.token}`);

    // Approve Front
    await request(app)
      .post(`/api/admin/kyc/documents/${frontDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // Approve Back
    await request(app)
      .post(`/api/admin/kyc/documents/${backDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // Customer KYC must now be APPROVED!
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('APPROVED');

    // KYC Verification charge is now activated exactly once
    const charges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    expect(charges.length).toBe(1);
    expect(charges[0].name).toContain('KYC');
    expect(charges[0].status).toBe('PENDING');
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Payment/UTR exists but documents are not approved -> KYC NOT VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 8: Payment/UTR exists but documents are not approved -> KYC NOT VERIFIED', async () => {
    const customer = await createTestCustomer('Test8');

    // Create a mock charge and payment with UTR for this customer
    const charge = await prisma.charge.create({
      data: {
        name: 'KYC Verification Charge',
        amount: 499,
        type: 'FIXED',
        isMandatory: true,
        isActive: true,
        status: 'UNDER_VERIFICATION',
        transactionRef: 'UTR998877665544',
        customerId: customer.id,
      },
    });

    // Upload Aadhaar Front & Back, but leave them PENDING
    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');

    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    // Customer kycStatus is still PENDING or UNDER_REVIEW, NOT VERIFIED
    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');
    expect(dbCustomer?.kycStatus).not.toBe('VERIFIED');

    // Admin KYC list check: does NOT report VERIFIED
    const listRes = await request(app)
      .get('/api/admin/kyc?status=VERIFIED')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    const inVerifiedList = listRes.body.data.customers.find((c: any) => c.id === customer.id);
    expect(inVerifiedList).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Customer has 0 documents -> Impossible to become VERIFIED
  // ---------------------------------------------------------------------------
  it('TEST 9: Customer has 0 documents -> impossible to become VERIFIED', async () => {
    const customer = await createTestCustomer('Test9');

    // Admin attempts to override KYC status to APPROVED for customer with 0 documents
    const overrideRes = await request(app)
      .post(`/api/admin/kyc/${customer.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(overrideRes.status).toBe(400);
    expect(overrideRes.body.message).toContain('Both Aadhaar Front and Aadhaar Back must be uploaded');

    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('PENDING');
    expect(dbCustomer?.kycStatus).not.toBe('APPROVED');

    // Even if evaluateCustomerKycStatus is manually invoked, status remains PENDING
    await adminKycService.evaluateCustomerKycStatus(customer.id);
    const refreshed = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(refreshed?.kycStatus).toBe('PENDING');
  });

  // ---------------------------------------------------------------------------
  // TEST 10: KYC not approved -> loan/application document API must reject access
  // ---------------------------------------------------------------------------
  it('TEST 10: KYC not approved -> loan document upload and application APIs reject access (403)', async () => {
    const customer = await createTestCustomer('Test10');

    // 1. Try uploading PAN when KYC is PENDING
    const uploadPanRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'PAN')
      .attach('file', samplePanBuffer, 'pan.pdf');
    expect(uploadPanRes.status).toBe(403);
    expect(uploadPanRes.body.message).toContain('Loan documents are locked');

    // 2. Try applying for a loan when KYC is PENDING
    const applyLoanRes = await request(app)
      .post('/api/customer/loan-applications')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        amount: 100000,
        tenureMonths: 12,
        purpose: 'Medical Emergency',
      });
    expect(applyLoanRes.status).toBe(403);
    expect(applyLoanRes.body.message).toContain('KYC approval is required');
  });

  // ---------------------------------------------------------------------------
  // TEST 11: KYC approved -> downstream loan document stage becomes available
  // ---------------------------------------------------------------------------
  it('TEST 11: KYC approved -> downstream loan document stage becomes available', async () => {
    const customer = await createTestCustomer('Test11');

    // Upload & approve Aadhaar Front & Back
    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');

    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    await request(app)
      .post(`/api/admin/kyc/documents/${fRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    await request(app)
      .post(`/api/admin/kyc/documents/${bRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    const dbCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(dbCustomer?.kycStatus).toBe('APPROVED');

    // Now upload PAN (non-KYC loan document) -> must SUCCEED!
    const uploadPanRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'PAN')
      .attach('file', samplePanBuffer, 'pan.pdf');
    expect(uploadPanRes.status).toBe(201);
    expect(uploadPanRes.body.data.document.documentType).toBe('PAN');
  });

  // ---------------------------------------------------------------------------
  // TEST 12: Admin verifies payment -> exact payment becomes PAID
  // ---------------------------------------------------------------------------
  it('TEST 12: Customer submits UTR -> Admin verifies exact payment -> status becomes PAID', async () => {
    const customer = await createTestCustomer('Test12');

    // 1. Complete KYC to activate charge
    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    await request(app)
      .post(`/api/admin/kyc/documents/${fRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    await request(app)
      .post(`/api/admin/kyc/documents/${bRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // 2. Fetch the generated KYC Charge
    const charge = await prisma.charge.findFirst({ where: { customerId: customer.id } });
    expect(charge).not.toBeNull();
    const chargeId = charge!.id;

    // 3. Customer submits UTR for this exact charge
    const utrValue = `UTR${Date.now()}`;
    const submitUtrRes = await request(app)
      .post(`/api/customer/charges/${chargeId}/submit-utr`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        utr: utrValue,
        paymentMethod: 'UPI',
        amount: charge!.amount,
      });
    expect([200, 201]).toContain(submitUtrRes.status);

    const chargeAfterUtr = await prisma.charge.findUnique({ where: { id: chargeId } });
    expect(chargeAfterUtr?.status).toBe('UNDER_VERIFICATION');

    // 4. Admin verifies the exact payment reference
    const verifyPayRes = await request(app)
      .post(`/api/admin/charges/specific/${chargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyPayRes.status).toBe(200);

    // Charge and linked payment are now PAID
    const verifiedCharge = await prisma.charge.findUnique({ where: { id: chargeId } });
    expect(verifiedCharge?.status).toBe('PAID');
    expect(verifiedCharge?.paidAt).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // TEST 13: Invoice generated only after payment verification
  // ---------------------------------------------------------------------------
  it('TEST 13: Invoice generated only after payment verification, with exact chargeId link', async () => {
    const customer = await createTestCustomer('Test13');

    // Complete KYC
    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    await request(app)
      .post(`/api/admin/kyc/documents/${fRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    await request(app)
      .post(`/api/admin/kyc/documents/${bRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    const charge = await prisma.charge.findFirst({ where: { customerId: customer.id } });
    const chargeId = charge!.id;

    // Before payment: Invoice must NOT exist
    const invoiceBefore = await prisma.invoice.findFirst({ where: { chargeId } });
    expect(invoiceBefore).toBeNull();

    // Customer submits UTR & Admin verifies
    await request(app)
      .post(`/api/customer/charges/${chargeId}/submit-utr`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        utr: `UTR${Date.now()}`,
        paymentMethod: 'UPI',
        amount: charge!.amount,
      });

    await request(app)
      .post(`/api/admin/charges/specific/${chargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);

    // After payment verification: Invoice must exist and be linked to exact charge
    const invoiceAfter = await prisma.invoice.findFirst({ where: { chargeId } });
    expect(invoiceAfter).not.toBeNull();
    expect(invoiceAfter?.customerId).toBe(customer.id);
    expect(invoiceAfter?.amount).toBe(charge!.amount);
    expect(invoiceAfter?.invoiceNumber).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // TEST 14: Duplicate KYC charge -> prevented
  // ---------------------------------------------------------------------------
  it('TEST 14: Duplicate KYC charge is strictly prevented on repeated evaluations', async () => {
    const customer = await createTestCustomer('Test14');

    // Complete KYC
    const fRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_FRONT')
      .attach('file', samplePdfBuffer, 'front.pdf');
    const bRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customer.token}`)
      .field('documentType', 'AADHAAR_BACK')
      .attach('file', samplePdfBuffer, 'back.pdf');

    await request(app)
      .post(`/api/admin/kyc/documents/${fRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    await request(app)
      .post(`/api/admin/kyc/documents/${bRes.body.data.document.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });

    // Repeated calls to ensureKycChargeActivated or evaluateCustomerKycStatus
    await adminKycService.ensureKycChargeActivated(customer.id);
    await adminKycService.evaluateCustomerKycStatus(customer.id);
    await adminKycService.ensureKycChargeActivated(customer.id);

    // Verify exactly ONE KYC charge exists for this customer
    const charges = await prisma.charge.findMany({
      where: {
        customerId: customer.id,
        OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
      },
    });
    expect(charges.length).toBe(1);
  });
});

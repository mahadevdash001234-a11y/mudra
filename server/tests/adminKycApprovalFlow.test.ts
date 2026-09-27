import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSION_KEYS } from '../src/constants/permissions';

describe('Admin KYC Verification & UTR Synchronization Flow (Regression Suite)', () => {
  const adminEmail = 'kyc-reg-admin@loanapprove.local';
  const adminPassword = 'AdminPassword123!';
  let adminToken: string;

  const custAMobile = '9811122299';
  let custAId: string;
  let custAToken: string;
  let custAChargeId: string;
  const sampleUtr = '202609061427';

  const custBMobile = '9822233388';
  let custBId: string;
  let custBToken: string;
  let custBChargeId: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [custAMobile, custBMobile] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });

    // Create Admin
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Master System Administrator',
        role: 'SUPER_ADMIN',
        permissions: JSON.stringify(ALL_PERMISSION_KEYS),
        isActive: true,
      },
    });

    const adminLoginRes = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLoginRes.body.data.token;

    // Register Customer A
    const custARes = await request(app)
      .post('/api/auth/customer/register')
      .send({
        fullName: 'Test User',
        mobile: custAMobile,
        email: 'test.reg@loanapprove.local',
        state: 'Maharashtra',
        city: 'Mumbai',
        address: 'Nariman Point, Mumbai',
        monthlyIncome: 65000,
        aadhaar: '657896322645',
      });
    custAId = custARes.body.data.user.id;
    custAToken = custARes.body.data.token;

    // Register Customer B
    const custBRes = await request(app)
      .post('/api/auth/customer/register')
      .send({
        fullName: 'Other Borrower',
        mobile: custBMobile,
        email: 'other.borrower@loanapprove.local',
        state: 'Delhi',
        city: 'New Delhi',
        address: 'Connaught Place, New Delhi',
        monthlyIncome: 75000,
        aadhaar: '987654321012',
      });
    custBId = custBRes.body.data.user.id;
    custBToken = custBRes.body.data.token;

    // Customer A uploads Aadhaar Front and Back
    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${custAToken}`)
      .attach('file', Buffer.from('mock front'), 'front.png')
      .field('documentType', 'AADHAAR_FRONT');

    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${custAToken}`)
      .attach('file', Buffer.from('mock back'), 'back.png')
      .field('documentType', 'AADHAAR_BACK');

    // Fetch active KYC charge for customer A
    const chargesRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${custAToken}`);
    expect(chargesRes.status).toBe(200);
    const kycChg = chargesRes.body.data.find(
      (c: any) => c.name.includes('KYC') || c.remark?.includes('KYC') || c.name.includes('Processing') || c.status === 'PENDING'
    ) || chargesRes.body.data[0];
    expect(kycChg).toBeDefined();
    custAChargeId = kycChg.id;
  }, 30000);

  afterAll(async () => {
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.emailMessage.deleteMany({});
    await prisma.eMISchedule.deleteMany({});
    await prisma.loanAgreement.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.disbursement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.charge.deleteMany({});
    await prisma.loanDocument.deleteMany({});
    await prisma.loanApplication.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [custAMobile, custBMobile] } },
    });
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });
  });

  it('TEST 1: Customer submits UTR -> payment record created/updated & UTR persisted in DB', async () => {
    const res = await request(app)
      .post(`/api/customer/charges/${custAChargeId}/submit-utr`)
      .set('Authorization', `Bearer ${custAToken}`)
      .send({
        utr: sampleUtr,
        paymentMethod: 'UPI',
        notes: 'KYC Verification Fee settlement',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify DB persistence
    const persistedCharge = await prisma.charge.findUnique({
      where: { id: custAChargeId },
    });
    expect(persistedCharge).toBeDefined();
    expect(persistedCharge?.transactionRef).toBe(sampleUtr);
    expect(persistedCharge?.paymentId).toBeDefined();

    const persistedPayment = await prisma.payment.findFirst({
      where: { transactionRef: sampleUtr },
    });
    expect(persistedPayment).toBeDefined();
    expect(persistedPayment?.customerId).toBe(custAId);
    expect(persistedPayment?.status).toBe('UNDER_VERIFICATION');
  });

  it('TEST 2: Customer UTR submission response contains persisted UTR', async () => {
    const detailRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${custAToken}`);

    expect(detailRes.status).toBe(200);
    const kycChg = detailRes.body.data.find((c: any) => c.id === custAChargeId);
    expect(kycChg).toBeDefined();
    expect(kycChg.transactionRef).toBe(sampleUtr);
  });

  it('TEST 3: Admin KYC queue returns same UTR and PENDING_VERIFICATION payment status', async () => {
    const listRes = await request(app)
      .get('/api/admin/kyc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const itemA = listRes.body.data.customers.find((c: any) => c.id === custAId);
    expect(itemA).toBeDefined();
    expect(itemA.hasUtr).toBe(true);
    expect(itemA.utrSubmitted).toBe(true);
    expect(itemA.utr).toBe(sampleUtr);
    expect(itemA.paymentStatus).toBe('PENDING_VERIFICATION');
    expect(itemA.kycPaymentStatus).toBe('UNDER_VERIFICATION');
    expect(itemA.isKycFeePaid).toBe(false);
    expect(itemA.kycStatus).toBe('UNDER_REVIEW');

    const detailRes = await request(app)
      .get(`/api/admin/kyc/${custAId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.kycPayment.hasUtr).toBe(true);
    expect(detailRes.body.data.kycPayment.utr).toBe(sampleUtr);
    expect(detailRes.body.data.kycPayment.isPaid).toBe(false);
  });

  it('TEST 4: Admin verifies payment -> payment becomes VERIFIED / PAID & UTR remains unchanged', async () => {
    const verifyRes = await request(app)
      .post(`/api/admin/charges/specific/${custAChargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyRes.status).toBe(200);

    const charge = await prisma.charge.findUnique({ where: { id: custAChargeId } });
    expect(charge?.status).toBe('PAID');
    expect(charge?.transactionRef).toBe(sampleUtr);

    const payment = await prisma.payment.findFirst({ where: { transactionRef: sampleUtr } });
    expect(payment?.status).toBe('PAID');
    expect(payment?.verifiedBy).toBeDefined();
    expect(payment?.verifiedAt).toBeDefined();

    // 1:1 invoice generated
    const invoice = await prisma.invoice.findUnique({ where: { chargeId: custAChargeId } });
    expect(invoice).toBeDefined();
    expect(invoice?.status).toBe('PAID');
  });

  it('TEST 5: KYC is NOT automatically approved after payment verification', async () => {
    const customer = await prisma.customer.findUnique({ where: { id: custAId } });
    expect(customer?.kycStatus).toBe('UNDER_REVIEW');

    const listRes = await request(app)
      .get('/api/admin/kyc')
      .set('Authorization', `Bearer ${adminToken}`);
    const itemA = listRes.body.data.customers.find((c: any) => c.id === custAId);
    expect(itemA.isKycFeePaid).toBe(true);
    expect(itemA.paymentStatus).toBe('VERIFIED');
    expect(itemA.kycStatus).toBe('UNDER_REVIEW');
  });

  it('TEST 6: Admin explicitly approves KYC -> KYC becomes APPROVED', async () => {
    const res = await request(app)
      .post(`/api/admin/kyc/${custAId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    expect(res.status).toBe(200);

    const customer = await prisma.customer.findUnique({ where: { id: custAId } });
    expect(customer?.kycStatus).toBe('APPROVED');

    const listRes = await request(app)
      .get('/api/admin/kyc')
      .set('Authorization', `Bearer ${adminToken}`);
    const itemA = listRes.body.data.customers.find((c: any) => c.id === custAId);
    expect(itemA.kycStatus).toBe('APPROVED');
    expect(itemA.isKycFeePaid).toBe(true);
  });

  it('TEST 7: After KYC approval -> customer can proceed to subsequent documents / loan stage', async () => {
    const profileRes = await request(app)
      .get('/api/customer/profile')
      .set('Authorization', `Bearer ${custAToken}`);

    expect(profileRes.status).toBe(200);
    const profile = profileRes.body.data?.profile || profileRes.body.data;
    expect(profile.kycStatus).toBe('APPROVED');

    // Customer can now upload subsequent mandatory loan documents (PAN)
    const panRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${custAToken}`)
      .attach('file', Buffer.from('mock pan'), 'pan.png')
      .field('documentType', 'PAN');

    expect(panRes.status).toBe(201);
  });

  it('TEST 8: Unauthorized customer cannot modify another customer payment/UTR', async () => {
    const res = await request(app)
      .post(`/api/customer/charges/${custAChargeId}/submit-utr`)
      .set('Authorization', `Bearer ${custBToken}`)
      .send({
        utr: '999888777666',
        paymentMethod: 'UPI',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Access Denied');
  });

  it('TEST 9: Duplicate UTR submission follows existing duplicate-payment rules', async () => {
    // Upload Customer B Aadhaar docs
    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${custBToken}`)
      .attach('file', Buffer.from('mock b front'), 'front_b.png')
      .field('documentType', 'AADHAAR_FRONT');

    await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${custBToken}`)
      .attach('file', Buffer.from('mock b back'), 'back_b.png')
      .field('documentType', 'AADHAAR_BACK');

    const chargesRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${custBToken}`);
    const kycChgB = chargesRes.body.data.find(
      (c: any) => c.name.includes('KYC') || c.remark?.includes('KYC')
    );
    expect(kycChgB).toBeDefined();
    custBChargeId = kycChgB.id;

    // Customer B tries to submit the same UTR that is already verified for Customer A
    const dupRes = await request(app)
      .post(`/api/customer/charges/${custBChargeId}/submit-utr`)
      .set('Authorization', `Bearer ${custBToken}`)
      .send({
        utr: sampleUtr,
        paymentMethod: 'UPI',
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.message).toContain('Duplicate UTR');
  });
});

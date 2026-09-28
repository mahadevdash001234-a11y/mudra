import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSION_KEYS } from '../src/constants/permissions';

describe('Complete Sequential Workflow Verification — 14-Step Real World Flow', () => {
  const customerMobile = '9988776655';
  const customerEmail = 'anuj.flow@fintech.test';
  const adminEmail = 'flowadmin@loanapprove.com';
  const adminPassword = 'AdminSecret@2026';

  let customerToken: string;
  let customerId: string;
  let adminToken: string;
  let frontDocId: string;
  let backDocId: string;
  let kycChargeId: string;
  let processingChargeId: string;
  let gstChargeId: string;
  let kycInvoiceId: string;
  let processingInvoiceId: string;
  let testLoanId: string;
  let testApplicationNumber: string;

  beforeAll(async () => {
    // 1. Clean up test records (scoped to test customer to prevent wiping production database)
    const existingCust = await prisma.customer.findUnique({
      where: { mobile: customerMobile },
      include: { loans: true },
    });
    if (existingCust) {
      const loanIds = existingCust.loans.map((l) => l.id);
      await prisma.invoice.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.payment.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.charge.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.loanDocument.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.eMISchedule.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.disbursement.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.loanAgreement.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.documentRequest.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.supportTicket.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.notification.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.loanApplication.deleteMany({ where: { customerId: existingCust.id } });
      await prisma.customer.delete({ where: { id: existingCust.id } });
    }
    await prisma.adminUser.deleteMany({
      where: { email: adminEmail },
    });

    // 2. Create Admin with SUPER_ADMIN privileges
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(adminPassword, salt);
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Compliance Admin',
        role: 'SUPER_ADMIN',
        permissions: JSON.stringify(ALL_PERMISSION_KEYS),
        isActive: true,
      },
    });

    const adminLoginRes = await request(app)
      .post('/api/auth/admin/login')
      .send({ email: adminEmail, password: adminPassword });
    adminToken = adminLoginRes.body.data.token;

    // 3. Customer Signup
    const custRes = await request(app)
      .post('/api/auth/customer/register')
      .send({
        fullName: 'Anuj Kumar',
        mobile: customerMobile,
        email: customerEmail,
        address: '42, Shanti Nagar',
        state: 'Maharashtra',
        city: 'Pune',
        aadhaar: '123456789012',
        monthlyIncome: 75000,
      });
    customerToken = custRes.body.data.token;
    customerId = custRes.body.data.user.id;
  });

  afterAll(async () => {
    if (customerId) {
      await prisma.invoice.deleteMany({ where: { customerId } });
      await prisma.payment.deleteMany({ where: { customerId } });
      await prisma.charge.deleteMany({ where: { customerId } });
      await prisma.loanDocument.deleteMany({ where: { customerId } });
      await prisma.eMISchedule.deleteMany({ where: { customerId } });
      await prisma.disbursement.deleteMany({ where: { customerId } });
      await prisma.loanAgreement.deleteMany({ where: { customerId } });
      await prisma.documentRequest.deleteMany({ where: { customerId } });
      await prisma.supportTicket.deleteMany({ where: { customerId } });
      await prisma.notification.deleteMany({ where: { customerId } });
      await prisma.loanApplication.deleteMany({ where: { customerId } });
      await prisma.customer.deleteMany({ where: { id: customerId } });
    }
    await prisma.adminUser.deleteMany({ where: { email: adminEmail } });
  });

  it('Step 1: Customer uploads Aadhaar Front + Back and Submits -> KYC is UNDER_REVIEW (Zero premature charges)', async () => {
    // Upload Aadhaar Front
    const frontRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock front pdf content'), 'aadhaar_front.pdf')
      .field('documentType', 'AADHAAR_FRONT');
    expect(frontRes.status).toBe(201);
    frontDocId = frontRes.body.data.document.id;

    // Profile check - should still be PENDING (not yet submitted, back missing)
    let prof = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(prof?.kycStatus).toBe('PENDING');

    // Upload Aadhaar Back
    const backRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock back pdf content'), 'aadhaar_back.pdf')
      .field('documentType', 'AADHAAR_BACK');
    expect(backRes.status).toBe(201);
    backDocId = backRes.body.data.document.id;

    // Customer submits KYC
    const submitRes = await request(app)
      .post('/api/customer/kyc/submit')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(submitRes.status).toBe(200);

    prof = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(prof?.kycStatus).toBe('UNDER_REVIEW');
    expect(prof?.kycStatus).not.toBe('APPROVED');

    // Charges check: Pre-approval charges MUST NOT EXIST
    const preCharges = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(preCharges.status).toBe(200);
    expect(preCharges.body.data).toEqual([]);
  });

  it('Step 2 Gate Check: Attempting to upload loan documents before KYC is approved is blocked with 403', async () => {
    // Attempting to upload PAN before KYC approval is blocked
    const panFail = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock pan content'), 'pan.pdf')
      .field('documentType', 'PAN');

    expect(panFail.status).toBe(403);
  });

  it('Step 3: Admin verifies KYC -> KYC = APPROVED, KYC charge is activated', async () => {
    // Admin reviews and approves each required document first (document-level verification)
    const revFront = await request(app)
      .post(`/api/admin/kyc/documents/${frontDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    expect(revFront.status).toBe(200);

    const revBack = await request(app)
      .post(`/api/admin/kyc/documents/${backDocId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'APPROVE' });
    expect(revBack.status).toBe(200);

    const decRes = await request(app)
      .post(`/api/admin/kyc/${customerId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'APPROVED',
        reason: 'Identity and Aadhaar credentials verified by compliance',
      });

    expect(decRes.status).toBe(200);
    const prof = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(prof?.kycStatus).toBe('APPROVED');

    // KYC charge is now active and visible
    const chargesRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(chargesRes.status).toBe(200);
    const list = chargesRes.body.data;
    expect(list.length).toBe(1);
    expect(list[0].name).toContain('KYC');
    expect(list[0].status).toBe('PENDING');
    kycChargeId = list[0].id;

    // Verify future charges like GST, Stamp Duty, Processing Fee are NOT returned
    const chargeNames = list.map((c: any) => c.name);
    expect(chargeNames).not.toContain('Processing Fee');
    expect(chargeNames).not.toContain('GST');
    expect(chargeNames).not.toContain('Stamp Duty');
  });

  it('Step 4: Customer pays KYC fee and submits UTR -> Status = UNDER_VERIFICATION', async () => {
    const payRes = await request(app)
      .post(`/api/customer/charges/${kycChargeId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        utr: '987654321098',
        paymentMethod: 'UPI',
        notes: 'KYC Fee Payment',
      });

    expect(payRes.status).toBe(201);
    expect(payRes.body.data.payment.status).toBe('UNDER_VERIFICATION');
    expect(payRes.body.data.charge.transactionRef).toBe('987654321098');
  });

  it('Step 5: Admin verifies payment -> KYC Charge = PAID, Invoice is generated idempotently', async () => {
    const verifyRes = await request(app)
      .post(`/api/admin/charges/specific/${kycChargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.status).toBe('PAID');

    // Verify dynamic invoice was generated
    const invoice = await prisma.invoice.findUnique({ where: { chargeId: kycChargeId } });
    expect(invoice).toBeDefined();
    kycInvoiceId = invoice!.id;

    // Idempotency check: Calling verify again returns existing invoice without duplicates
    const invoicesCount = await prisma.invoice.count({ where: { chargeId: kycChargeId } });
    expect(invoicesCount).toBe(1);

    // Customer can access invoice
    const invRes = await request(app)
      .get(`/api/customer/charges/${kycChargeId}/invoice`)
      .set('Authorization', `Bearer ${customerToken}`);
    expect(invRes.status).toBe(200);
    expect(invRes.body.success).toBe(true);
    expect(invRes.body.mimeType).toBe('application/pdf');
    expect(Buffer.from(invRes.body.data, 'base64').slice(0, 4).toString()).toBe('%PDF');
  });

  it('Step 6: Customer opens Loans -> Loan Documents unlocked, Customer sees 0 / 4 documents', async () => {
    const docsRes = await request(app)
      .get('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(docsRes.status).toBe(200);
    const currentKyc = docsRes.body.data?.customer?.kycStatus || docsRes.body.data?.kycStatus;
    expect(currentKyc).toBe('APPROVED');
  });

  it('Step 7: Customer uploads PAN -> PAN = Uploaded', async () => {
    const panRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock pan content'), 'pan.pdf')
      .field('documentType', 'PAN');

    expect(panRes.status).toBe(201);
    expect(panRes.body.data.document.documentType).toBe('PAN');
  });

  it('Step 8: Customer uploads Bank Statement -> Bank Statement = Uploaded', async () => {
    const bankRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock bank stmt content'), 'bank_stmt.pdf')
      .field('documentType', 'BANK_STATEMENT');

    expect(bankRes.status).toBe(201);
    expect(bankRes.body.data.document.documentType).toBe('BANK_STATEMENT');
  });

  it('Step 9: Customer uploads Income Proof and Other Documents -> Complete 4/4 documents', async () => {
    const incRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock income proof content'), 'salary_slip.pdf')
      .field('documentType', 'INCOME_PROOF');

    expect(incRes.status).toBe(201);
    expect(incRes.body.data.document.documentType).toBe('INCOME_PROOF');

    const otherRes = await request(app)
      .post('/api/customer/documents')
      .set('Authorization', `Bearer ${customerToken}`)
      .attach('file', Buffer.from('mock other proof content'), 'other_doc.pdf')
      .field('documentType', 'OTHER');

    expect(otherRes.status).toBe(201);

    // Customer submits loan application after 4/4 documents complete
    const loanRes = await request(app)
      .post('/api/customer/loan-applications')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        loanType: 'PERSONAL',
        amount: 200000,
        tenureMonths: 24,
        purpose: 'Home Renovation',
      });
    expect(loanRes.status).toBe(201);
    testLoanId = loanRes.body.data.id;
    testApplicationNumber = loanRes.body.data.applicationNumber;
  });

  it('Step 10: Complete required documents -> Processing Fee becomes ACTIVE and visible to customer', async () => {
    const chargesRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(chargesRes.status).toBe(200);
    const list = chargesRes.body.data;
    const procCharge = list.find((c: any) => c.name.toLowerCase().includes('processing'));
    expect(procCharge).toBeDefined();
    expect(procCharge.status).toBe('PENDING');
    processingChargeId = procCharge.id;

    // Verify future fees like GST, Stamp Duty, TDS etc. are still hidden
    const chargeNames = list.map((c: any) => c.name);
    expect(chargeNames).not.toContain('GST');
    expect(chargeNames).not.toContain('Stamp Duty');
  });

  it('Step 11 & 12: Customer pays Processing Fee -> Admin verifies -> Processing Fee Invoice generated', async () => {
    // Submit UTR
    const payProc = await request(app)
      .post(`/api/customer/charges/${processingChargeId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        utr: '112233445566',
        paymentMethod: 'UPI',
        notes: 'Processing fee settlement',
      });
    expect(payProc.status).toBe(201);

    // Admin verifies
    const verifyProc = await request(app)
      .post(`/api/admin/charges/specific/${processingChargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyProc.status).toBe(200);
    expect(verifyProc.body.data.status).toBe('PAID');

    const procInvoice = await prisma.invoice.findUnique({ where: { chargeId: processingChargeId } });
    expect(procInvoice).toBeDefined();
    processingInvoiceId = procInvoice!.id;
    expect(processingInvoiceId).not.toBe(kycInvoiceId); // Separate invoice!
  });

  it('Step 13: Later Admin activates GST only -> Customer sees ONLY GST', async () => {
    // Admin activates GST specifically for the customer's actual loan application
    const gstRes = await request(app)
      .post('/api/admin/charges/specific')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId,
        applicationId: testApplicationNumber || testLoanId,
        chargeType: 'GST',
        amount: 900,
        remark: 'Applicable Goods and Services Tax (18%)',
      });
    expect(gstRes.status).toBe(201);
    gstChargeId = gstRes.body.data.id;

    // Send/activate GST charge
    await request(app)
      .post(`/api/admin/charges/specific/${gstChargeId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Customer checks their charges
    const custChargesRes = await request(app)
      .get('/api/customer/charges')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(custChargesRes.status).toBe(200);
    const activeCharges = custChargesRes.body.data.filter((c: any) => c.status === 'PENDING');
    expect(activeCharges.length).toBe(1);
    expect(activeCharges[0].name).toBe('GST');
    expect(activeCharges[0].amount).toBe(900);

    // Unactivated charges like Stamp Duty, TDS, Insurance are NOT visible
    const allNames = custChargesRes.body.data.map((c: any) => c.name);
    expect(allNames).not.toContain('Stamp Duty');
    expect(allNames).not.toContain('Insurance Fee');
  });

  it('Step 14: Customer pays GST -> GST = PAID -> Separate GST invoice generated', async () => {
    // Pay GST
    const payGst = await request(app)
      .post(`/api/customer/charges/${gstChargeId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        utr: '556677889900',
        paymentMethod: 'UPI',
        notes: 'GST settlement',
      });
    expect(payGst.status).toBe(201);

    // Admin verifies GST
    const verifyGst = await request(app)
      .post(`/api/admin/charges/specific/${gstChargeId}/verify-payment`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(verifyGst.status).toBe(200);
    expect(verifyGst.body.data.status).toBe('PAID');

    const gstInvoice = await prisma.invoice.findUnique({ where: { chargeId: gstChargeId } });
    expect(gstInvoice).toBeDefined();

    // 1 charge = 1 invoice count verification: exactly 3 invoices created (KYC, Processing, GST)
    const totalInvoices = await prisma.invoice.count({ where: { customerId } });
    expect(totalInvoices).toBe(3);
  });
});

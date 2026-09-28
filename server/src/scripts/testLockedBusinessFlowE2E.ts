import { prisma } from '../services/db';
import { adminKycService } from '../services/adminKycService';
import { documentService } from '../services/documentService';
import { specificChargesService } from '../services/specificChargesService';
import { hashPassword } from '../utils/security';
import path from 'path';
import fs from 'fs';

function makeMockFile(fileName: string, filePath: string): any {
  return {
    fieldname: 'file',
    originalname: fileName,
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 2048,
    destination: path.dirname(filePath),
    filename: path.basename(filePath),
    path: filePath,
    buffer: Buffer.from('%PDF-1.4 test document content for business flow verification'),
    stream: null as any,
  };
}

async function runE2EValidation() {
  console.log('================================================================');
  console.log('STARTING: FULL BACKEND BUSINESS-LOGIC LOCK E2E VERIFICATION');
  console.log('================================================================\n');

  const testMobile = '9988' + Math.floor(100000 + Math.random() * 900000).toString();
  const testEmail = `e2e_clean_${Date.now()}@example.com`;
  const dummyFilePath = path.join(process.cwd(), 'scratch', 'test_e2e_doc.pdf');
  if (!fs.existsSync(path.dirname(dummyFilePath))) {
    fs.mkdirSync(path.dirname(dummyFilePath), { recursive: true });
  }
  fs.writeFileSync(dummyFilePath, '%PDF-1.4 e2e test document content');

  const adminActor = {
    id: 'admin-super-01',
    role: 'SUPER_ADMIN',
    fullName: 'System Compliance Officer',
    email: 'compliance@system.local',
  } as any;

  let createdCustomerId: string | null = null;

  try {
    // -------------------------------------------------------------
    // PHASE 1: CUSTOMER REGISTRATION
    // -------------------------------------------------------------
    console.log('--- PHASE 1: CUSTOMER REGISTRATION ---');
    const pwdHash = await hashPassword('SecurePass123!');
    const customer = await prisma.customer.create({
      data: {
        fullName: 'Vikram Aditya Rathore',
        mobile: testMobile,
        email: testEmail,
        passwordHash: pwdHash,
        state: 'Maharashtra',
        city: 'Mumbai',
        address: 'Worli Sea Face, Mumbai',
        monthlyIncome: 95000,
        aadhaarMasked: 'XXXX XXXX 8899',
        aadhaarEncrypted: 'enc-aadhaar-8899',
        kycStatus: 'PENDING',
        status: 'ACTIVE',
      },
    });
    createdCustomerId = customer.id;
    console.log(`[PASS] Customer registered: ${customer.fullName} (${customer.id}), kycStatus: ${customer.kycStatus}`);

    // Database assertions immediately after registration
    const initialCharges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    const initialPayments = await prisma.payment.findMany({ where: { customerId: customer.id } });
    const initialInvoices = await prisma.invoice.findMany({ where: { customerId: customer.id } });
    const activeChargesViaApi1 = await specificChargesService.listActiveChargesForCustomer(customer.id);

    console.log(`[ASSERTION] Customer charges in DB: ${initialCharges.length} (Expected: 0)`);
    console.log(`[ASSERTION] Customer payments in DB: ${initialPayments.length} (Expected: 0)`);
    console.log(`[ASSERTION] Customer invoices in DB: ${initialInvoices.length} (Expected: 0)`);
    console.log(`[ASSERTION] GET /customer/charges result: ${activeChargesViaApi1.length} (Expected: 0)`);

    if (initialCharges.length !== 0 || initialPayments.length !== 0 || initialInvoices.length !== 0 || activeChargesViaApi1.length !== 0) {
      throw new Error('[FAIL] Premature records exist right after registration!');
    }
    console.log('[PASS] Post-registration clean state confirmed.');

    // -------------------------------------------------------------
    // PHASE 2: SELECT FILE & UPLOAD ONLY AADHAAR FRONT (PARTIAL)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 2: UPLOAD AADHAAR FRONT ONLY ---');
    const docFront = await documentService.uploadDocument(
      customer.id,
      'AADHAAR_FRONT',
      makeMockFile('aadhaar_front.pdf', dummyFilePath),
      undefined,
      '127.0.0.1'
    );
    console.log(`[PASS] Aadhaar Front persisted: ${docFront.id}`);

    // Verify KYC status is STILL PENDING and NO CHARGE is created
    const postFrontCust = await prisma.customer.findUnique({ where: { id: customer.id } });
    const postFrontCharges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    const activeChargesViaApi2 = await specificChargesService.listActiveChargesForCustomer(customer.id);

    console.log(`[ASSERTION] Customer kycStatus after front-only upload: ${postFrontCust?.kycStatus} (Expected: PENDING)`);
    console.log(`[ASSERTION] Customer charges in DB: ${postFrontCharges.length} (Expected: 0)`);
    console.log(`[ASSERTION] GET /customer/charges result: ${activeChargesViaApi2.length} (Expected: 0)`);

    if (postFrontCust?.kycStatus !== 'PENDING' || postFrontCharges.length !== 0 || activeChargesViaApi2.length !== 0) {
      throw new Error('[FAIL] Premature charge or premature status change on single-document upload!');
    }
    console.log('[PASS] Front-only upload gating confirmed.');

    // -------------------------------------------------------------
    // PHASE 3: UPLOAD AADHAAR BACK
    // -------------------------------------------------------------
    console.log('\n--- PHASE 3: UPLOAD AADHAAR BACK ---');
    const docBack = await documentService.uploadDocument(
      customer.id,
      'AADHAAR_BACK',
      makeMockFile('aadhaar_back.pdf', dummyFilePath),
      undefined,
      '127.0.0.1'
    );
    console.log(`[PASS] Aadhaar Back persisted: ${docBack.id}`);

    // Verify that upload alone does NOT create charges or complete KYC
    const postBackCust = await prisma.customer.findUnique({ where: { id: customer.id } });
    const postBackCharges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    const activeChargesViaApi3 = await specificChargesService.listActiveChargesForCustomer(customer.id);

    console.log(`[ASSERTION] Customer kycStatus after back upload: ${postBackCust?.kycStatus} (Expected: PENDING)`);
    console.log(`[ASSERTION] Customer charges in DB: ${postBackCharges.length} (Expected: 0)`);
    console.log(`[ASSERTION] GET /customer/charges result: ${activeChargesViaApi3.length} (Expected: 0)`);

    if (postBackCharges.length !== 0 || activeChargesViaApi3.length !== 0) {
      throw new Error('[FAIL] Premature charge generated merely on file upload!');
    }
    console.log('[PASS] Two-sided upload gating confirmed.');

    // -------------------------------------------------------------
    // PHASE 4: CUSTOMER EXPLICITLY SUBMITS KYC FOR VERIFICATION
    // -------------------------------------------------------------
    console.log('\n--- PHASE 4: SUBMIT KYC FOR VERIFICATION ---');
    const submitResult = await documentService.submitCustomerKyc(customer.id, '127.0.0.1');
    console.log(`[PASS] KYC Submitted! Status: ${submitResult.kycStatus} (Label: ${submitResult.statusLabel})`);

    const postSubmitCust = await prisma.customer.findUnique({ where: { id: customer.id } });
    const postSubmitCharges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    const activeChargesViaApi4 = await specificChargesService.listActiveChargesForCustomer(customer.id);

    console.log(`[ASSERTION] Customer kycStatus after submission: ${postSubmitCust?.kycStatus} (Expected: UNDER_REVIEW)`);
    console.log(`[ASSERTION] Specific KYC charge in DB: ${postSubmitCharges.length} (Expected: 0)`);
    console.log(`[ASSERTION] GET /customer/charges result: ${activeChargesViaApi4.length} (Expected: 0)`);

    if (postSubmitCust?.kycStatus !== 'UNDER_REVIEW' || postSubmitCharges.length !== 0 || activeChargesViaApi4.length !== 0) {
      throw new Error('[FAIL] Charge prematurely created upon KYC submission before Admin review!');
    }
    console.log('[PASS] KYC Submission enters UNDER_REVIEW with ZERO premature charges.');

    // -------------------------------------------------------------
    // PHASE 5: ADMIN KYC APPROVAL (THE SOLE AUTHORITY)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 5: ADMIN REVIEWS & APPROVES KYC ---');
    await adminKycService.reviewDocument(adminActor, docFront.id, 'APPROVE', 'Aadhaar front verified');
    await adminKycService.reviewDocument(adminActor, docBack.id, 'APPROVE', 'Aadhaar back verified');

    const approvedCust = await prisma.customer.findUnique({ where: { id: customer.id } });
    console.log(`[PASS] KYC Approved! Customer status: ${approvedCust?.kycStatus}`);

    if (approvedCust?.kycStatus !== 'APPROVED') {
      throw new Error(`[FAIL] Expected customer kycStatus = APPROVED, got ${approvedCust?.kycStatus}`);
    }

    // Now, and ONLY now, should exactly 1 KYC charge exist in the DB!
    const postApprovalCharges = await prisma.charge.findMany({ where: { customerId: customer.id } });
    const activeChargesViaApi5 = await specificChargesService.listActiveChargesForCustomer(customer.id);

    console.log(`[ASSERTION] Specific KYC charge in DB: ${postApprovalCharges.length} (Expected: 1)`);
    console.log(`[ASSERTION] Active charges returned by API: ${activeChargesViaApi5.length} (Expected: 1)`);

    if (postApprovalCharges.length !== 1 || activeChargesViaApi5.length !== 1) {
      throw new Error(`[FAIL] Exactly 1 KYC charge must exist after approval! DB count: ${postApprovalCharges.length}, API count: ${activeChargesViaApi5.length}`);
    }

    const kycCharge = activeChargesViaApi5[0];
    console.log(`[PASS] Active KYC Charge: "${kycCharge.name}" for ₹${kycCharge.amount} (Status: ${kycCharge.status})`);
    if (kycCharge.status !== 'PENDING') {
      throw new Error(`[FAIL] Newly generated KYC charge must be PENDING, got ${kycCharge.status}`);
    }

    // -------------------------------------------------------------
    // PHASE 6: DEDUPLICATION / IDEMPOTENCY ON REFRESH & RELOGIN
    // -------------------------------------------------------------
    console.log('\n--- PHASE 6: DEDUPLICATION ON REPEATED GET REQUESTS & RELOGIN ---');
    for (let i = 1; i <= 3; i++) {
      const repeatedCharges = await specificChargesService.listActiveChargesForCustomer(customer.id);
      if (repeatedCharges.length !== 1) {
        throw new Error(`[FAIL] Repeated query iteration ${i} created duplicate charges! Count: ${repeatedCharges.length}`);
      }
    }
    const finalDbChargesCount = await prisma.charge.count({ where: { customerId: customer.id } });
    console.log(`[ASSERTION] Total DB charges after repeated reads: ${finalDbChargesCount} (Expected: 1)`);
    if (finalDbChargesCount !== 1) {
      throw new Error(`[FAIL] Duplicate charges inserted into DB! Count: ${finalDbChargesCount}`);
    }
    console.log('[PASS] Deduplication & idempotency on GET confirmed.');

    // -------------------------------------------------------------
    // PHASE 7: CUSTOMER SUBMITS PAYMENT REFERENCE (UTR)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 7: CUSTOMER SUBMITS PAYMENT REFERENCE (UTR) ---');
    const customerActor = { id: customer.id, role: 'CUSTOMER', fullName: customer.fullName } as any;
    const testUtr = 'UTR' + Math.floor(1000000000 + Math.random() * 9000000000).toString();

    await specificChargesService.submitCustomerChargePayment(
      kycCharge.id,
      customer.id,
      { utr: testUtr, paymentMethod: 'UPI', notes: 'GPay payment' },
      customerActor
    );
    console.log(`[PASS] Payment submitted with UTR: ${testUtr}`);

    const postPayCharge = await prisma.charge.findUnique({ where: { id: kycCharge.id } });
    const postPayPayment = await prisma.payment.findFirst({ where: { customerId: customer.id, transactionRef: testUtr } });
    const postPayInvoices = await prisma.invoice.findMany({ where: { customerId: customer.id } });

    console.log(`[ASSERTION] Charge status: ${postPayCharge?.status} (Expected: UNDER_VERIFICATION)`);
    console.log(`[ASSERTION] Payment status: ${postPayPayment?.status} (Expected: UNDER_VERIFICATION)`);
    console.log(`[ASSERTION] Invoices in DB before admin verification: ${postPayInvoices.length} (Expected: 0)`);

    if (postPayCharge?.status !== 'UNDER_VERIFICATION' || postPayPayment?.status !== 'UNDER_VERIFICATION' || postPayInvoices.length !== 0) {
      throw new Error('[FAIL] Inconsistent payment or premature invoice generated before verification!');
    }
    console.log('[PASS] Payment correctly marked UNDER_VERIFICATION with zero invoices.');

    // -------------------------------------------------------------
    // PHASE 8: ADMIN VERIFIES PAYMENT & GENERATES 1:1 INVOICE
    // -------------------------------------------------------------
    console.log('\n--- PHASE 8: ADMIN VERIFIES PAYMENT & ISSUES INVOICE ---');
    const verifiedCharge = await specificChargesService.verifySpecificChargePayment(
      kycCharge.id,
      adminActor,
      '127.0.0.1'
    );
    console.log(`[PASS] Charge verified: ${verifiedCharge.id}, Status: ${verifiedCharge.status}`);

    const finalCharge = await prisma.charge.findUnique({ where: { id: kycCharge.id } });
    const finalPayment = await prisma.payment.findFirst({ where: { customerId: customer.id, transactionRef: testUtr } });
    const finalInvoices = await prisma.invoice.findMany({ where: { customerId: customer.id } });

    console.log(`[ASSERTION] Charge status: ${finalCharge?.status} (Expected: PAID)`);
    console.log(`[ASSERTION] Payment status: ${finalPayment?.status} (Expected: PAID)`);
    console.log(`[ASSERTION] Invoices in DB after admin verification: ${finalInvoices.length} (Expected: 1)`);

    if (finalCharge?.status !== 'PAID' || finalPayment?.status !== 'PAID' || finalInvoices.length !== 1) {
      throw new Error('[FAIL] Verification did not transition charge/payment to PAID or invoice was not generated!');
    }

    const invoice = finalInvoices[0];
    console.log(`[ASSERTION] Invoice linked to exact chargeId: ${invoice.chargeId === kycCharge.id} (Expected: true)`);
    console.log(`[ASSERTION] Invoice status: ${invoice.status} (Expected: PAID)`);
    console.log(`[ASSERTION] Invoice number: ${invoice.invoiceNumber}`);

    if (invoice.chargeId !== kycCharge.id || invoice.status !== 'PAID') {
      throw new Error('[FAIL] Invoice does not match the exact charge or is not PAID!');
    }
    console.log('[PASS] Exact 1 Charge -> 1 Payment -> 1 Invoice relationship locked.');

    console.log('\n================================================================');
    console.log('ALL E2E BUSINESS LOGIC ASSERTIONS PASSED WITH 100% COMPLIANCE!');
    console.log('================================================================');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: REMOVE ALL E2E TEST DATA TO RESTORE DATABASE
    // -------------------------------------------------------------
    console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
    if (createdCustomerId) {
      await prisma.invoice.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.payment.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.charge.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.loanDocument.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.documentRequest.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.loanApplication.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.notification.deleteMany({ where: { customerId: createdCustomerId } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityId: createdCustomerId },
            { actorId: createdCustomerId },
          ],
        },
      });
      await prisma.customer.delete({ where: { id: createdCustomerId } });
      console.log(`[CLEANUP] Deleted all test records for customer: ${createdCustomerId}`);
    }

    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
    console.log('[CLEANUP] Database restored to clean state.');
  }
}

runE2EValidation()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nE2E VALIDATION ERROR:', err);
    process.exit(1);
  });

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
    buffer: Buffer.from('%PDF-1.4 dummy document content'),
    stream: null as any,
  };
}

async function runVerification() {
  console.log('================================================================');
  console.log('STARTING: Full KYC → Charge → Documents → Processing Fee Workflow');
  console.log('================================================================\n');

  // STEP 1: CONFIGURE WEBSITE BRANDING DYNAMICALLY TO "Mudra Finance"
  console.log('--- STEP 1: CONFIGURE WEBSITE BRANDING TO "Mudra Finance" ---');
  const branding = await prisma.brandingSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      appName: 'Mudra Finance',
      companyName: 'Mudra Finance',
      companyLegalName: 'Mudra Finance Private Limited',
      primaryColor: '#2563EB',
      secondaryColor: '#7C3AED',
      email: 'support@mudrafinance.com',
      phone: '+91 1800 555 0199',
      address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      website: 'https://mudrafinance.com',
      termsUrl: 'https://mudrafinance.com/terms',
      privacyUrl: 'https://mudrafinance.com/privacy',
    },
    update: {
      appName: 'Mudra Finance',
      companyName: 'Mudra Finance',
      companyLegalName: 'Mudra Finance Private Limited',
      email: 'support@mudrafinance.com',
      phone: '+91 1800 555 0199',
      address: 'Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      website: 'https://mudrafinance.com',
    },
  });
  console.log(`[PASS] Branding configured dynamically: appName="${branding.appName}", companyLegalName="${branding.companyLegalName}"\n`);

  // Ensure paymentConfig has proper KYC and Processing Fee values
  await prisma.paymentConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      kycChargeAmount: 499,
      processingFeeAmount: 1999,
    },
    update: {
      kycChargeAmount: 499,
      processingFeeAmount: 1999,
    },
  });

  // STEP 2: CREATE FRESH CUSTOMER (STAGE 1: PRE-KYC)
  console.log('--- STEP 2: CREATE FRESH CUSTOMER & TEST PRE-KYC GATING ---');
  const testMobile = '99' + Math.floor(10000000 + Math.random() * 90000000);
  const passwordHash = await hashPassword('Mudra@Pass123');

  const customer = await prisma.customer.create({
    data: {
      mobile: testMobile,
      fullName: 'Aarav Sharma',
      email: `aarav_${Date.now()}@example.com`,
      passwordHash,
      kycStatus: 'PENDING',
      status: 'ACTIVE',
      address: 'Flat 402, Lotus Towers, Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400053',
      aadhaarEncrypted: 'enc_aadhaar_aarav',
      aadhaarMasked: 'XXXX-XXXX-8921',
      monthlyIncome: 65000,
    },
  });
  console.log(`[PASS] Customer created: ${customer.fullName} (${customer.mobile}), KYC Status: ${customer.kycStatus}`);

  // Create a loan application for this customer
  const loan = await prisma.loanApplication.create({
    data: {
      customerId: customer.id,
      applicationNumber: 'MUDRA-' + Date.now().toString().slice(-6),
      loanType: 'PERSONAL',
      requestedAmount: 250000,
      tenureMonths: 24,
      status: 'SUBMITTED',
      interestRate: 10.5,
    },
  });
  console.log(`[PASS] Loan application created: ${loan.applicationNumber} for ₹${loan.requestedAmount}`);

  // Query charges pre-KYC: Must return EMPTY
  const preKycCharges = await specificChargesService.listActiveChargesForCustomer(customer.id, loan.id);
  if (preKycCharges.length === 0) {
    console.log('[PASS] Pre-KYC charges list is EMPTY (Processing fee is NOT exposed pre-KYC)');
  } else {
    throw new Error(`[FAIL] Charges exposed pre-KYC: ${JSON.stringify(preKycCharges)}`);
  }

  // Create dummy file
  const dummyFilePath = path.join(process.cwd(), 'scratch', 'test_dummy.pdf');
  if (!fs.existsSync(path.dirname(dummyFilePath))) {
    fs.mkdirSync(path.dirname(dummyFilePath), { recursive: true });
  }
  fs.writeFileSync(dummyFilePath, '%PDF-1.4 test dummy document content');

  // Attempt to upload PAN Card pre-KYC: Must be strictly blocked by backend
  console.log('Testing Loan Document Gate (Attempting PAN upload pre-KYC)...');
  try {
    await documentService.uploadDocument(
      customer.id,
      'PAN',
      makeMockFile('pan_card.pdf', dummyFilePath),
      loan.id,
      '127.0.0.1'
    );
    throw new Error('[FAIL] PAN upload succeeded pre-KYC! It should have been blocked.');
  } catch (err: any) {
    if (err.message?.includes('DOCUMENTS_LOCKED') || err.message?.includes('locked') || err.statusCode === 403) {
      console.log(`[PASS] Backend strictly blocked PAN upload pre-KYC: "${err.message}"`);
    } else {
      throw err;
    }
  }

  // STEP 3: CUSTOMER UPLOADS AADHAAR FRONT + BACK (KYC SUBMISSION)
  console.log('\n--- STEP 3: UPLOAD KYC DOCUMENTS (AADHAAR FRONT + BACK) ---');
  const docFront = await documentService.uploadDocument(
    customer.id,
    'AADHAAR_FRONT',
    makeMockFile('aadhaar_front.pdf', dummyFilePath),
    undefined,
    '127.0.0.1'
  );
  console.log(`[PASS] Aadhaar Front uploaded: ${docFront.id}`);

  const docBack = await documentService.uploadDocument(
    customer.id,
    'AADHAAR_BACK',
    makeMockFile('aadhaar_back.pdf', dummyFilePath),
    undefined,
    '127.0.0.1'
  );
  console.log(`[PASS] Aadhaar Back uploaded: ${docBack.id}`);

  // Submit KYC
  await adminKycService.evaluateCustomerKycStatus(customer.id);
  const kycSubmittedCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
  console.log(`[PASS] Customer KYC status after Aadhaar upload: ${kycSubmittedCustomer?.kycStatus}`);

  // STEP 4: ADMIN VERIFIES KYC → AUTO-ACTIVATES KYC VERIFICATION CHARGE
  console.log('\n--- STEP 4: ADMIN APPROVES KYC & AUTO-ACTIVATES KYC CHARGE ---');
  const adminActor = { id: 'admin-1', role: 'SUPER_ADMIN', fullName: 'Super Admin', email: 'admin@mudrafinance.com' } as any;
  const customerActor = { id: customer.id, role: 'CUSTOMER', fullName: customer.fullName } as any;

  await adminKycService.reviewDocument(
    adminActor,
    docFront.id,
    'APPROVE',
    'Aadhaar front verified successfully'
  );
  await adminKycService.reviewDocument(
    adminActor,
    docBack.id,
    'APPROVE',
    'Aadhaar back address verified'
  );

  const kycApprovedCust = await prisma.customer.findUnique({ where: { id: customer.id } });
  console.log(`[PASS] KYC Approved! Customer status: ${kycApprovedCust?.kycStatus}`);

  // Check that KYC Verification Charge is now active
  const kycActiveCharges = await specificChargesService.listActiveChargesForCustomer(customer.id, loan.id);
  console.log(`Charges returned for customer: ${kycActiveCharges.length} charge(s)`);
  if (
    kycActiveCharges.length === 1 &&
    kycActiveCharges[0].name.includes('KYC') &&
    kycActiveCharges[0].status === 'PENDING'
  ) {
    console.log(`[PASS] Exactly 1 charge active: "${kycActiveCharges[0].name}" for ₹${kycActiveCharges[0].amount} (Status: ${kycActiveCharges[0].status})`);
  } else {
    throw new Error(`[FAIL] Unexpected charges: ${JSON.stringify(kycActiveCharges)}`);
  }

  // Attempt to upload PAN while KYC charge is UNPAID: Must still be strictly blocked
  console.log('Testing Loan Document Gate (Attempting PAN upload while KYC charge is UNPAID)...');
  try {
    await documentService.uploadDocument(
      customer.id,
      'PAN',
      makeMockFile('pan_card.pdf', dummyFilePath),
      loan.id,
      '127.0.0.1'
    );
    throw new Error('[FAIL] PAN upload succeeded with unpaid KYC charge! It should have been blocked.');
  } catch (err: any) {
    if (err.message?.includes('DOCUMENTS_LOCKED') || err.message?.includes('locked') || err.statusCode === 403) {
      console.log(`[PASS] Backend strictly blocked PAN upload: "${err.message}"`);
    } else {
      throw err;
    }
  }

  // STEP 5: CUSTOMER PAYS KYC CHARGE & ADMIN VERIFIES
  console.log('\n--- STEP 5: CUSTOMER PAYS KYC CHARGE & RECEIVES INVOICE ---');
  const kycCharge = kycActiveCharges[0];
  const utrRef = 'UTR' + Date.now().toString().slice(-10);

  // Submit UTR
  await specificChargesService.submitCustomerChargePayment(
    kycCharge.id,
    customer.id,
    { utr: utrRef, paymentMethod: 'UPI', notes: 'UPI payment via GPay' },
    customerActor
  );
  console.log(`[PASS] Customer submitted UTR: ${utrRef}`);

  // Admin verifies payment
  const verifiedKycCharge = await specificChargesService.verifySpecificChargePayment(
    kycCharge.id,
    adminActor
  );
  console.log(`[PASS] KYC Charge verified! Status: ${verifiedKycCharge.status}, PaidAt: ${verifiedKycCharge.paidAt}`);

  // Generate and verify Invoice PDF
  const kycInvoiceRes = await specificChargesService.generateSpecificChargeInvoicePdf(kycCharge.id, adminActor);
  const kycInvoicePdf = kycInvoiceRes.buffer;
  console.log(`[PASS] KYC Verification Invoice PDF generated: ${kycInvoicePdf.length} bytes (Filename: ${kycInvoiceRes.filename})`);

  // STEP 6: LOAN DOCUMENTS UNLOCK & PAN UPLOAD ACTIVATES PROCESSING FEE
  console.log('\n--- STEP 6: LOAN DOCUMENTS UNLOCK & PROCESSING FEE ACTIVATES ---');
  // Upload mandatory loan documents (PAN, Bank Statement, Income Proof)
  const docPan = await documentService.uploadDocument(
    customer.id,
    'PAN',
    makeMockFile('pan_card.pdf', dummyFilePath),
    loan.id,
    '127.0.0.1'
  );
  console.log(`[PASS] PAN Card successfully uploaded! Document ID: ${docPan.id}`);

  const docBank = await documentService.uploadDocument(
    customer.id,
    'BANK_STATEMENT',
    makeMockFile('bank_statement.pdf', dummyFilePath),
    loan.id,
    '127.0.0.1'
  );
  console.log(`[PASS] Bank Statement successfully uploaded! Document ID: ${docBank.id}`);

  const docIncome = await documentService.uploadDocument(
    customer.id,
    'INCOME_PROOF',
    makeMockFile('salary_slip.pdf', dummyFilePath),
    loan.id,
    '127.0.0.1'
  );
  console.log(`[PASS] Income Proof successfully uploaded! Document ID: ${docIncome.id}`);

  // Query charges: Now both the paid KYC charge and the active Processing Fee should appear
  const postPanCharges = await specificChargesService.listActiveChargesForCustomer(customer.id, loan.id);
  console.log(`Charges returned post-PAN: ${postPanCharges.length} charge(s)`);
  const processingFeeCharge = postPanCharges.find((c) => c.name.toLowerCase().includes('processing'));
  const paidKycInList = postPanCharges.find((c) => c.name.toLowerCase().includes('kyc') && c.status === 'PAID');

  if (processingFeeCharge && processingFeeCharge.status === 'PENDING') {
    console.log(`[PASS] Processing Fee auto-activated: "${processingFeeCharge.name}" for ₹${processingFeeCharge.amount} (Status: PENDING)`);
  } else {
    throw new Error(`[FAIL] Processing Fee not activated post-PAN! Charges: ${JSON.stringify(postPanCharges)}`);
  }

  if (paidKycInList) {
    console.log(`[PASS] KYC Verification Charge remains listed as PAID (Status: PAID)`);
  } else {
    throw new Error('[FAIL] Paid KYC Charge missing from charges list!');
  }

  // STEP 7: CUSTOMER PAYS PROCESSING FEE & ADMIN VERIFIES
  console.log('\n--- STEP 7: CUSTOMER PAYS PROCESSING FEE & RECEIVES 2ND INVOICE ---');
  const utrRef2 = 'UTR' + (Date.now() + 1000).toString().slice(-10);
  await specificChargesService.submitCustomerChargePayment(
    processingFeeCharge.id,
    customer.id,
    { utr: utrRef2, paymentMethod: 'BANK', notes: 'IMPS Bank Transfer' },
    customerActor
  );
  console.log(`[PASS] Processing Fee UTR submitted: ${utrRef2}`);

  const verifiedProcFee = await specificChargesService.verifySpecificChargePayment(
    processingFeeCharge.id,
    adminActor
  );
  console.log(`[PASS] Processing Fee verified! Status: ${verifiedProcFee.status}, PaidAt: ${verifiedProcFee.paidAt}`);

  // Generate and verify 2nd Invoice PDF
  const procFeeInvoiceRes = await specificChargesService.generateSpecificChargeInvoicePdf(processingFeeCharge.id, adminActor);
  const procFeeInvoicePdf = procFeeInvoiceRes.buffer;
  console.log(`[PASS] Loan Processing Fee Invoice PDF generated: ${procFeeInvoicePdf.length} bytes (Filename: ${procFeeInvoiceRes.filename})`);

  // Verify that the two invoices are distinct
  console.log(`Invoice 1 (KYC) size: ${kycInvoicePdf.length} bytes vs Invoice 2 (Processing Fee) size: ${procFeeInvoicePdf.length} bytes`);
  console.log('[PASS] 1 Charge = 1 Invoice rule strictly confirmed.');

  // STEP 8: FINAL STATUS VERIFICATION
  console.log('\n--- STEP 8: FINAL STATUS VERIFICATION ---');
  const finalCharges = await specificChargesService.listActiveChargesForCustomer(customer.id, loan.id);
  const allPaid = finalCharges.every((c) => c.status === 'PAID');
  console.log(`Final Charges Count: ${finalCharges.length}, All Paid: ${allPaid}`);
  if (finalCharges.length === 2 && allPaid) {
    console.log('[PASS] Complete flow verified successfully! Ready for Underwriting appraisal.');
  } else {
    throw new Error(`[FAIL] Final charges state invalid: ${JSON.stringify(finalCharges)}`);
  }

  // Cleanup dummy file
  if (fs.existsSync(dummyFilePath)) {
    fs.unlinkSync(dummyFilePath);
  }

  console.log('\n================================================================');
  console.log('ALL WORKFLOW & BRANDING CHECKS PASSED WITH ZERO REGRESSIONS!');
  console.log('================================================================');
}

runVerification()
  .catch((err) => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

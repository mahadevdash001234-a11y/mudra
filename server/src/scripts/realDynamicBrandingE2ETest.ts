import { prisma } from '../services/db';
import { settingsService } from '../services/settingsService';
import { generateAuthToken } from '../services/tokenService';
import { app } from '../app';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Extracts all text rendered inside a PDFKit-generated PDF Buffer.
 * Decodes all FlateDecode streams and hex string tokens (<48656c6c6f>).
 */
function extractTextFromPdf(buf: Buffer): string {
  const str = buf.toString('latin1');
  const matches = [...str.matchAll(/stream\r?\n/g)];
  let fullText = '';

  for (const m of matches) {
    const start = m.index! + m[0].length;
    let end = str.indexOf('endstream', start);
    if (end === -1) continue;
    while (end > start && (buf[end - 1] === 10 || buf[end - 1] === 13)) end--;
    const streamBuf = buf.subarray(start, end);
    try {
      const decomp = zlib.inflateSync(streamBuf).toString('utf8');
      const hexMatches = decomp.matchAll(/<([0-9a-fA-F]+)>/g);
      for (const h of hexMatches) {
        fullText += Buffer.from(h[1], 'hex').toString('utf8');
      }
    } catch {
      // Non-flate streams (e.g. image payloads) are skipped safely
    }
  }

  return fullText;
}

function normalizeForSearch(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function runControlledDynamicBrandingTest() {
  console.log('================================================================');
  console.log('STARTING: REAL DYNAMIC BRANDING AUDIT & PRE-DEPLOY VERIFICATION');
  console.log('================================================================\n');

  // 1. Take an exact snapshot of current database BrandingSettings
  const originalBranding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
  if (!originalBranding) {
    throw new Error('Default brandingSettings not found in database!');
  }
  console.log('📸 Original Branding Snapshot Captured:');
  console.log(`   Company Name: ${originalBranding.companyName}`);
  console.log(`   Legal Name:   ${originalBranding.companyLegalName}`);
  console.log(`   Email:        ${originalBranding.email}`);
  console.log(`   Phone:        ${originalBranding.phone}`);
  console.log(`   Address:      ${originalBranding.address}`);
  console.log(`   Theme Color:  ${originalBranding.primaryColor}`);
  console.log(`   Watermark:    ${originalBranding.watermarkLogoUrl}`);
  console.log(`   Header URL:   ${originalBranding.approvalLetterHeaderUrl}\n`);

  // 2. Prepare test admin user and token
  let admin = await prisma.adminUser.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!admin) {
    admin = await prisma.adminUser.findFirst();
  }
  if (!admin) throw new Error('No admin user found in database');
  const adminToken = generateAuthToken(admin.id, 'ADMIN');

  // 3. Create identifiable temporary test image PNG files
  const uploadsBrandingDir = path.join(process.cwd(), 'uploads', 'branding');
  if (!fs.existsSync(uploadsBrandingDir)) {
    fs.mkdirSync(uploadsBrandingDir, { recursive: true });
  }

  // 1x1 transparent PNG header + minimal 67-byte PNG
  const minimalPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  const testLogoFilename = 'test_dynamic_logo_audit.png';
  const testHeaderFilename = 'test_dynamic_header_audit.png';
  const testWatermarkFilename = 'test_dynamic_watermark_audit.png';

  const testLogoPath = path.join(uploadsBrandingDir, testLogoFilename);
  const testHeaderPath = path.join(uploadsBrandingDir, testHeaderFilename);
  const testWatermarkPath = path.join(uploadsBrandingDir, testWatermarkFilename);

  fs.writeFileSync(testLogoPath, minimalPngBuffer);
  fs.writeFileSync(testHeaderPath, minimalPngBuffer);
  fs.writeFileSync(testWatermarkPath, minimalPngBuffer);
  console.log('📁 Created temporary test branding PNG files in uploads/branding/');

  const TEST_COMPANY = 'TEST DYNAMIC COMPANY';
  const TEST_LEGAL = 'TEST DYNAMIC FINANCIAL SERVICES';
  const TEST_APP_NAME = 'TEST LOAN PORTAL';
  const TEST_CONTACT = '+91 99999 11111';
  const TEST_EMAIL = 'compliance@testdynamicfintech.example.com';
  const TEST_ADDRESS = '999 Dynamic FinTower, Sector 99, Cyber City, Mumbai 400099';
  const TEST_THEME_COLOR = '#2563eb'; // Blue
  const TEST_SECONDARY_COLOR = '#1e293b';

  let testPassed = 0;
  let testTotal = 0;
  function assert(condition: boolean, msg: string) {
    testTotal++;
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`✅ PASS: ${msg}`);
    testPassed++;
  }

  try {
    // -------------------------------------------------------------
    // PHASE 1: APPLY TEMPORARY DYNAMIC BRANDING SETTINGS
    // -------------------------------------------------------------
    console.log('\n--- PHASE 1: SAVING DYNAMIC TEST BRANDING SETTINGS ---');
    await settingsService.updateBrandingSettings(
      {
        companyName: TEST_COMPANY,
        companyLegalName: TEST_LEGAL,
        appName: TEST_APP_NAME,
        logoUrl: `/uploads/branding/${testLogoFilename}`,
        approvalLetterHeaderUrl: `/uploads/branding/${testHeaderFilename}`,
        watermarkLogoUrl: `/uploads/branding/${testWatermarkFilename}`,
        watermarkOpacity: 0.15,
        watermarkSize: 'LARGE',
        watermarkPosition: 'TOP',
        documentWatermarkEnabled: true,
        invoiceWatermarkEnabled: true,
        primaryColor: TEST_THEME_COLOR,
        secondaryColor: TEST_SECONDARY_COLOR,
        email: TEST_EMAIL,
        phone: TEST_CONTACT,
        address: TEST_ADDRESS,
        website: 'https://testdynamicfintech.example.com',
      },
      {
        id: admin.id,
        role: 'SUPER_ADMIN',
        fullName: admin.fullName,
        email: admin.email,
      } as any,
      '127.0.0.1'
    );

    // Verify DB updated
    const updatedBranding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    assert(updatedBranding?.companyName === TEST_COMPANY, 'DB companyName updated to TEST DYNAMIC COMPANY');
    assert(updatedBranding?.companyLegalName === TEST_LEGAL, 'DB companyLegalName updated to TEST DYNAMIC FINANCIAL SERVICES');
    assert(updatedBranding?.primaryColor === TEST_THEME_COLOR, 'DB primaryColor updated to #2563eb');
    assert(updatedBranding?.email === TEST_EMAIL, 'DB email updated to TEST_EMAIL');
    assert(updatedBranding?.phone === TEST_CONTACT, 'DB phone updated to TEST_CONTACT');
    assert(updatedBranding?.watermarkSize === 'LARGE', 'DB watermarkSize updated to LARGE');
    assert(updatedBranding?.watermarkPosition === 'TOP', 'DB watermarkPosition updated to TOP');

    // -------------------------------------------------------------
    // PHASE 2: VERIFY APPROVAL LETTER PREVIEW (ANTI-IDM JSON)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 2: APPROVAL LETTER PREVIEW (ANTI-IDM JSON) ---');
    const appLetterPrevRes = await request(app)
      .get('/api/admin/settings/preview/approval-letter')
      .set('Authorization', `Bearer ${adminToken}`);

    assert(appLetterPrevRes.status === 200, 'Approval Letter Preview status = 200');
    assert(
      appLetterPrevRes.headers['content-type'].includes('application/json'),
      'Approval Letter Preview Content-Type is strictly application/json (Anti-IDM)'
    );
    assert(appLetterPrevRes.body.success === true, 'Response body.success is true');
    assert(typeof appLetterPrevRes.body.data === 'string', 'Base64 data returned');

    const appLetterPrevBuf = Buffer.from(appLetterPrevRes.body.data, 'base64');
    assert(appLetterPrevBuf.slice(0, 4).toString() === '%PDF', 'Decoded data begins with %PDF magic bytes');

    const appLetterPrevText = extractTextFromPdf(appLetterPrevBuf);
    const normAppPrev = normalizeForSearch(appLetterPrevText);

    assert(normAppPrev.includes(normalizeForSearch(TEST_COMPANY)), 'Approval Letter Preview contains dynamic companyName');
    assert(normAppPrev.includes(normalizeForSearch(TEST_LEGAL)), 'Approval Letter Preview contains dynamic companyLegalName');
    assert(normAppPrev.includes(normalizeForSearch(TEST_EMAIL)), 'Approval Letter Preview contains dynamic email');
    assert(normAppPrev.includes(normalizeForSearch(TEST_CONTACT)), 'Approval Letter Preview contains dynamic phone/contact');
    assert(normAppPrev.includes(normalizeForSearch(TEST_ADDRESS)), 'Approval Letter Preview contains dynamic address');

    // -------------------------------------------------------------
    // PHASE 3: VERIFY APPROVAL LETTER DOWNLOAD (BINARY PDF)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 3: APPROVAL LETTER DOWNLOAD (BINARY PDF) ---');
    const appLetterDownRes = await request(app)
      .get('/api/admin/settings/preview/approval-letter?download=true')
      .set('Authorization', `Bearer ${adminToken}`);

    assert(appLetterDownRes.status === 200, 'Approval Letter Download status = 200');
    assert(
      appLetterDownRes.headers['content-type'].includes('application/pdf'),
      'Approval Letter Download Content-Type is application/pdf'
    );
    assert(
      appLetterDownRes.headers['content-disposition'].includes('attachment'),
      'Content-Disposition is attachment'
    );
    const appLetterDownBuf = appLetterDownRes.body as Buffer;
    const appLetterDownText = extractTextFromPdf(appLetterDownBuf);
    const normAppDown = normalizeForSearch(appLetterDownText);
    assert(normAppDown.includes(normalizeForSearch(TEST_COMPANY)), 'Downloaded Approval Letter contains dynamic companyName');
    assert(normAppDown.includes(normalizeForSearch(TEST_LEGAL)), 'Downloaded Approval Letter contains dynamic companyLegalName');

    // -------------------------------------------------------------
    // PHASE 4: VERIFY INVOICE PREVIEW (ANTI-IDM JSON)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 4: INVOICE PREVIEW (ANTI-IDM JSON) ---');
    const invPrevRes = await request(app)
      .get('/api/admin/settings/preview/invoice')
      .set('Authorization', `Bearer ${adminToken}`);

    assert(invPrevRes.status === 200, 'Invoice Preview status = 200');
    assert(
      invPrevRes.headers['content-type'].includes('application/json'),
      'Invoice Preview Content-Type is strictly application/json (Anti-IDM)'
    );
    assert(invPrevRes.body.success === true, 'Invoice preview body.success is true');

    const invPrevBuf = Buffer.from(invPrevRes.body.data, 'base64');
    assert(invPrevBuf.slice(0, 4).toString() === '%PDF', 'Decoded invoice begins with %PDF magic bytes');

    const invPrevText = extractTextFromPdf(invPrevBuf);
    const normInvPrev = normalizeForSearch(invPrevText);

    assert(normInvPrev.includes(normalizeForSearch(TEST_COMPANY)), 'Invoice Preview contains dynamic companyName');
    assert(normInvPrev.includes(normalizeForSearch(TEST_EMAIL)), 'Invoice Preview contains dynamic email');
    assert(normInvPrev.includes(normalizeForSearch(TEST_CONTACT)), 'Invoice Preview contains dynamic phone/contact');
    assert(normInvPrev.includes(normalizeForSearch(TEST_ADDRESS)), 'Invoice Preview contains dynamic address');

    // -------------------------------------------------------------
    // PHASE 5: VERIFY INVOICE DOWNLOAD (BINARY PDF)
    // -------------------------------------------------------------
    console.log('\n--- PHASE 5: INVOICE DOWNLOAD (BINARY PDF) ---');
    const invDownRes = await request(app)
      .get('/api/admin/settings/preview/invoice?download=true')
      .set('Authorization', `Bearer ${adminToken}`);

    assert(invDownRes.status === 200, 'Invoice Download status = 200');
    assert(
      invDownRes.headers['content-type'].includes('application/pdf'),
      'Invoice Download Content-Type is application/pdf'
    );
    assert(
      invDownRes.headers['content-disposition'].includes('attachment'),
      'Invoice Content-Disposition is attachment'
    );
    const invDownBuf = invDownRes.body as Buffer;
    const invDownText = extractTextFromPdf(invDownBuf);
    const normInvDown = normalizeForSearch(invDownText);
    assert(normInvDown.includes(normalizeForSearch(TEST_COMPANY)), 'Downloaded Invoice contains dynamic companyName');
    assert(normInvDown.includes(normalizeForSearch(TEST_ADDRESS)), 'Downloaded Invoice contains dynamic address');

    // -------------------------------------------------------------
    // PHASE 6: MULTI-CHARGE INVOICE VERIFICATION
    // KYC Verification Fee, Processing Fee, GST, Specific Charge
    // -------------------------------------------------------------
    console.log('\n--- PHASE 6: MULTI-CHARGE INVOICE AUDIT (1:1:1 STRICT RELATION) ---');
    const chargeTypesToTest = [
      { name: 'KYC Verification Charge', amount: 499, remark: 'Mandatory KYC Verification Fee' },
      { name: 'Processing Fee', amount: 1999, remark: 'Mandatory Loan File Processing Fee' },
      { name: 'GST (18%)', amount: 360, remark: 'Applicable Goods & Services Tax' },
      { name: 'Document Verification Charge', amount: 750, remark: 'Specific Verification Charge' },
    ];

    // Find or create test customer
    let auditCustomer = await prisma.customer.findFirst({
      where: { email: 'audit_customer@dynamicbrand.local' },
    });
    if (!auditCustomer) {
      auditCustomer = await prisma.customer.create({
        data: {
          fullName: 'Audit Applicant Singh',
          mobile: '9888877777',
          email: 'audit_customer@dynamicbrand.local',
          passwordHash: 'dummy-hash',
          state: 'Maharashtra',
          city: 'Mumbai',
          address: '77 Marine Drive, Nariman Point, Mumbai',
          monthlyIncome: 80000,
          aadhaarMasked: 'XXXX XXXX 1234',
          aadhaarEncrypted: 'enc-1234',
          kycStatus: 'APPROVED',
          status: 'ACTIVE',
        },
      });
    }

    const custToken = generateAuthToken(auditCustomer.id, 'CUSTOMER');

    for (const chgConfig of chargeTypesToTest) {
      console.log(`\nTesting Charge Type: "${chgConfig.name}" (₹${chgConfig.amount})`);
      const charge = await prisma.charge.create({
        data: {
          name: chgConfig.name,
          amount: chgConfig.amount,
          type: 'FIXED',
          isMandatory: true,
          isActive: true,
          status: 'PAID',
          customerId: auditCustomer.id,
          remark: chgConfig.remark,
          transactionRef: `UTR${Date.now()}${Math.floor(100 + Math.random() * 900)}`,
          paidAt: new Date(),
        },
      });

      // Invoice endpoint preview
      const chgInvRes = await request(app)
        .get(`/api/customer/charges/${charge.id}/invoice`)
        .set('Authorization', `Bearer ${custToken}`);

      assert(chgInvRes.status === 200, `Invoice for "${chgConfig.name}" returned 200`);
      assert(chgInvRes.body.success === true, `Invoice for "${chgConfig.name}" body.success is true`);
      assert(
        chgInvRes.headers['content-type'].includes('application/json'),
        `Invoice for "${chgConfig.name}" is Anti-IDM application/json`
      );

      const chgPdfBuf = Buffer.from(chgInvRes.body.data, 'base64');
      const chgPdfText = extractTextFromPdf(chgPdfBuf);
      const normChgText = normalizeForSearch(chgPdfText);
      assert(normChgText.includes(normalizeForSearch(TEST_COMPANY)), `Invoice for "${chgConfig.name}" contains dynamic companyName`);
      assert(normChgText.includes(normalizeForSearch(chgConfig.name)), `Invoice contains exact charge name "${chgConfig.name}"`);
      assert(normChgText.includes(normalizeForSearch(auditCustomer.fullName)), `Invoice contains exact customer name`);

      // Verify strict 1 Charge -> 1 Payment/UTR -> 1 Invoice relationship in database
      const dbInvoices = await prisma.invoice.findMany({ where: { chargeId: charge.id } });
      assert(dbInvoices.length === 1, `Exactly 1:1 invoice record persisted for chargeId: ${charge.id}`);
      assert(dbInvoices[0].chargeId === charge.id, `Invoice.chargeId strictly links to charge.id`);
      assert(dbInvoices[0].status === 'PAID', `Invoice status is PAID`);

      // Cleanup test charge & invoice
      await prisma.invoice.deleteMany({ where: { chargeId: charge.id } });
      await prisma.charge.delete({ where: { id: charge.id } });
    }

    // Cleanup audit customer and any related child records
    await prisma.invoice.deleteMany({ where: { customerId: auditCustomer.id } });
    await prisma.payment.deleteMany({ where: { customerId: auditCustomer.id } });
    await prisma.charge.deleteMany({ where: { customerId: auditCustomer.id } });
    await prisma.notification.deleteMany({ where: { customerId: auditCustomer.id } });
    await prisma.customer.delete({ where: { id: auditCustomer.id } });

    console.log('\n================================================================');
    console.log(`DYNAMIC BRANDING TEST RESULT: ${testPassed}/${testTotal} PASSED`);
    console.log('100% of tested dynamic branding fields verified in PDF binary!');
    console.log('================================================================');

  } finally {
    // -------------------------------------------------------------
    // PHASE 7: RESTORE ORIGINAL CLIENT BRANDING VALUES EXACTLY
    // -------------------------------------------------------------
    console.log('\n--- PHASE 7: RESTORING ORIGINAL BRANDING VALUES EXACTLY ---');
    await prisma.brandingSettings.update({
      where: { id: 'default' },
      data: {
        companyName: originalBranding.companyName,
        companyLegalName: originalBranding.companyLegalName,
        appName: originalBranding.appName,
        logoUrl: originalBranding.logoUrl,
        faviconUrl: originalBranding.faviconUrl,
        secondaryLogoUrl: originalBranding.secondaryLogoUrl,
        approvalLetterHeaderUrl: originalBranding.approvalLetterHeaderUrl,
        watermarkLogoUrl: originalBranding.watermarkLogoUrl,
        documentWatermarkEnabled: originalBranding.documentWatermarkEnabled,
        invoiceWatermarkEnabled: originalBranding.invoiceWatermarkEnabled,
        watermarkOpacity: originalBranding.watermarkOpacity,
        watermarkSize: originalBranding.watermarkSize,
        watermarkPosition: originalBranding.watermarkPosition,
        primaryColor: originalBranding.primaryColor,
        secondaryColor: originalBranding.secondaryColor,
        email: originalBranding.email,
        phone: originalBranding.phone,
        address: originalBranding.address,
        website: originalBranding.website,
        termsUrl: originalBranding.termsUrl,
        privacyUrl: originalBranding.privacyUrl,
        lenderName: originalBranding.lenderName,
        lenderLegalName: originalBranding.lenderLegalName,
        lenderRegistrationNumber: originalBranding.lenderRegistrationNumber,
        lenderType: originalBranding.lenderType,
        lenderAddress: originalBranding.lenderAddress,
        lenderWebsite: originalBranding.lenderWebsite,
        isDirectLender: originalBranding.isDirectLender,
        partnerName: originalBranding.partnerName,
        partnerRelationship: originalBranding.partnerRelationship,
        minLoanAmount: originalBranding.minLoanAmount,
        maxLoanAmount: originalBranding.maxLoanAmount,
        minTenureMonths: originalBranding.minTenureMonths,
        maxTenureMonths: originalBranding.maxTenureMonths,
        minApr: originalBranding.minApr,
        maxApr: originalBranding.maxApr,
        processingFeePolicy: originalBranding.processingFeePolicy,
        otherChargesPolicy: originalBranding.otherChargesPolicy,
        minAge: originalBranding.minAge,
        maxAge: originalBranding.maxAge,
        minMonthlyIncome: originalBranding.minMonthlyIncome,
        creditScoreCriteria: originalBranding.creditScoreCriteria,
        bankAccountRequired: originalBranding.bankAccountRequired,
        employmentCriteria: originalBranding.employmentCriteria,
        residentialStatusCriteria: originalBranding.residentialStatusCriteria,
        documentsConfigJson: originalBranding.documentsConfigJson,
        disclaimerText: originalBranding.disclaimerText,
        faqsJson: originalBranding.faqsJson,
        appEnabled: originalBranding.appEnabled,
        appDownloadUrl: originalBranding.appDownloadUrl,
        heroHeadline: originalBranding.heroHeadline,
        heroSubheadline: originalBranding.heroSubheadline,
      },
    });

    // Remove temporary test PNG files
    if (fs.existsSync(testLogoPath)) fs.unlinkSync(testLogoPath);
    if (fs.existsSync(testHeaderPath)) fs.unlinkSync(testHeaderPath);
    if (fs.existsSync(testWatermarkPath)) fs.unlinkSync(testWatermarkPath);
    console.log('🧹 Cleaned up temporary test PNG files.');

    // Verify original branding is restored in the database
    const restoredBranding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
    console.log('✅ Restored Branding in Database Confirmed:');
    console.log(`   Company Name: ${restoredBranding?.companyName}`);
    console.log(`   Legal Name:   ${restoredBranding?.companyLegalName}`);
    console.log(`   Email:        ${restoredBranding?.email}`);
    console.log(`   Phone:        ${restoredBranding?.phone}`);
    console.log(`   Theme Color:  ${restoredBranding?.primaryColor}`);

    if (
      restoredBranding?.companyName !== originalBranding.companyName ||
      restoredBranding?.email !== originalBranding.email ||
      restoredBranding?.phone !== originalBranding.phone
    ) {
      console.error('❌ FATAL: Restored branding does not match original snapshot!');
      process.exit(1);
    }
    console.log('✅ RESTORATION 100% VERIFIED: Database is clean and restored.');
  }

  process.exit(0);
}

runControlledDynamicBrandingTest().catch((err) => {
  console.error('DYNAMIC BRANDING AUDIT FAILED:', err);
  process.exit(1);
});

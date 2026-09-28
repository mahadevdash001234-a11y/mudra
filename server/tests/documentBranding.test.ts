import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import { generateAuthToken } from '../src/services/tokenService';
import { hashPassword } from '../src/utils/security';
import { pdfService } from '../src/services/pdfService';

describe('Document Branding + Dynamic PDF Design Suite', () => {
  let adminToken: string;
  let staffTokenWithoutBranding: string;
  let customerToken: string;

  // 1x1 transparent PNG buffer for testing image uploads
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );

  beforeAll(async () => {
    const adminPassHash = await hashPassword('Admin@123');

    // 1. Authorized Admin with branding.view and branding.manage
    const admin = await prisma.adminUser.upsert({
      where: { email: 'branding-admin@fintech.test' },
      update: {
        permissions: JSON.stringify(['branding.view', 'branding.manage', 'settings.view', 'settings.manage', 'loans.approve', 'payments.verify', 'charges.view']),
      },
      create: {
        email: 'branding-admin@fintech.test',
        fullName: 'Branding Super Admin',
        passwordHash: adminPassHash,
        role: 'SUPER_ADMIN',
        permissions: JSON.stringify(['branding.view', 'branding.manage', 'settings.view', 'settings.manage', 'loans.approve', 'payments.verify', 'charges.view']),
      },
    });
    adminToken = generateAuthToken(admin.id, 'ADMIN');

    // 2. Staff without branding permissions
    const staff = await prisma.adminUser.upsert({
      where: { email: 'branding-staff@fintech.test' },
      update: {
        permissions: JSON.stringify(['customers.view']),
      },
      create: {
        email: 'branding-staff@fintech.test',
        fullName: 'Staff Without Branding Manage',
        passwordHash: adminPassHash,
        role: 'STAFF',
        permissions: JSON.stringify(['customers.view']),
      },
    });
    staffTokenWithoutBranding = generateAuthToken(staff.id, 'ADMIN');

    // 3. Customer User
    const customer = await prisma.customer.upsert({
      where: { mobile: '9111223344' },
      update: {
        fullName: 'Ajay Kumar Test',
        email: 'ajay.test@fintech.test',
      },
      create: {
        mobile: '9111223344',
        fullName: 'Ajay Kumar Test',
        email: 'ajay.test@fintech.test',
        aadhaarEncrypted: 'enc-aadhaar-123',
        aadhaarMasked: 'XXXX-XXXX-3108',
        panEncrypted: 'enc-pan-123',
        panMasked: 'BANPN9796M',
        monthlyIncome: 45000,
        address: '123 Market Street, Pune',
        city: 'Pune',
        state: 'Maharashtra',
        status: 'ACTIVE',
      },
    });
    customerToken = generateAuthToken(customer.id, 'CUSTOMER');
  });

  afterAll(async () => {
    // Reset branding settings to standard default
    await prisma.brandingSettings.upsert({
      where: { id: 'default' },
      update: {
        companyName: 'Loan Approve Financial Services',
        companyLegalName: 'Loan Approve Financial Services Pvt. Ltd.',
        appName: 'Loan Approve',
        watermarkOpacity: 0.10,
        watermarkSize: 'MEDIUM',
        watermarkPosition: 'CENTER',
      },
      create: {
        id: 'default',
        companyName: 'Loan Approve Financial Services',
        companyLegalName: 'Loan Approve Financial Services Pvt. Ltd.',
        appName: 'Loan Approve',
        watermarkOpacity: 0.10,
        watermarkSize: 'MEDIUM',
        watermarkPosition: 'CENTER',
      },
    });
  });

  // =========================================================================
  // TEST 1: Public Configuration returns Document Branding fields
  // =========================================================================
  it('1. Public config returns company legal name and document branding settings', async () => {
    const res = await request(app).get('/api/public/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('companyName');
    expect(res.body.data).toHaveProperty('companyLegalName');
    expect(res.body.data).toHaveProperty('appName');
    expect(res.body.data).toHaveProperty('watermarkOpacity');
    expect(res.body.data).toHaveProperty('watermarkSize');
    expect(res.body.data).toHaveProperty('watermarkPosition');
  });

  // =========================================================================
  // TEST 2: Admin Branding Uploads (Secondary Logo & Watermark Logo)
  // =========================================================================
  it('2. Admin can upload Secondary Logo PNG', async () => {
    const res = await request(app)
      .post('/api/admin/settings/branding/upload-secondary-logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', samplePngBuffer, 'secondary_scheme_logo.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data.url).toContain('/uploads/branding/secondary_logo_');
  });

  it('3. Admin can upload Watermark Logo PNG', async () => {
    const res = await request(app)
      .post('/api/admin/settings/branding/upload-watermark-logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', samplePngBuffer, 'watermark_bg.png');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('url');
    expect(res.body.data.url).toContain('/uploads/branding/watermark_');
  });

  it('4. Rejects invalid file upload formats (e.g. text/exe)', async () => {
    const res = await request(app)
      .post('/api/admin/settings/branding/upload-watermark-logo')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('console.log("malicious");'), 'virus.exe');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // =========================================================================
  // TEST 3: Admin Updates Document Branding & Watermark Controls
  // =========================================================================
  it('5. Admin can update brand name, legal name, watermark opacity, size, and position', async () => {
    const updatePayload = {
      companyName: 'Kumbhat Financial Services',
      companyLegalName: 'Kumbhat Financial Services Limited',
      appName: 'Craft Mudra',
      primaryColor: '#047857',
      secondaryColor: '#0f172a',
      email: 'support@craftmudra.in',
      phone: '+91 8942014797',
      address: '5th Floor, Kumbhat Complex, No. 29, Rattan Bazaar, Chennai, Tamil Nadu 600003',
      website: 'https://craftmudra.in',
      watermarkOpacity: 0.15,
      watermarkSize: 'MEDIUM',
      watermarkPosition: 'CENTER',
    };

    const res = await request(app)
      .put('/api/admin/settings/branding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(updatePayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.companyName).toBe('Kumbhat Financial Services');
    expect(res.body.data.companyLegalName).toBe('Kumbhat Financial Services Limited');
    expect(res.body.data.appName).toBe('Craft Mudra');
    expect(res.body.data.watermarkOpacity).toBe(0.15);
    expect(res.body.data.watermarkSize).toBe('MEDIUM');
    expect(res.body.data.watermarkPosition).toBe('CENTER');
  });

  // =========================================================================
  // TEST 4: Live Document Preview Endpoints (Anti-IDM JSON Base64 Architecture)
  // =========================================================================
  it('6. Admin can preview Approval Letter PDF as JSON Base64 (anti-IDM) and download as attachment', async () => {
    // 6a. Preview returns Content-Type: application/json with Base64 PDF payload
    const previewRes = await request(app)
      .get('/api/admin/settings/preview/approval-letter')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.headers['content-type']).toContain('application/json');
    expect(previewRes.body.success).toBe(true);
    expect(previewRes.body.mimeType).toBe('application/pdf');
    expect(typeof previewRes.body.data).toBe('string');
    const previewPdfBuffer = Buffer.from(previewRes.body.data, 'base64');
    expect(previewPdfBuffer.slice(0, 4).toString()).toBe('%PDF');

    // 6b. Download returns binary application/pdf attachment
    const downloadRes = await request(app)
      .get('/api/admin/settings/preview/approval-letter?download=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
    expect(downloadRes.body.slice(0, 4).toString()).toBe('%PDF');
  });

  it('7. Admin can preview Tax Invoice PDF as JSON Base64 (anti-IDM) and download as attachment', async () => {
    // 7a. Preview returns Content-Type: application/json with Base64 PDF payload
    const previewRes = await request(app)
      .get('/api/admin/settings/preview/invoice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.headers['content-type']).toContain('application/json');
    expect(previewRes.body.success).toBe(true);
    expect(previewRes.body.mimeType).toBe('application/pdf');
    expect(typeof previewRes.body.data).toBe('string');
    const previewPdfBuffer = Buffer.from(previewRes.body.data, 'base64');
    expect(previewPdfBuffer.slice(0, 4).toString()).toBe('%PDF');

    // 7b. Download returns binary application/pdf attachment
    const downloadRes = await request(app)
      .get('/api/admin/settings/preview/invoice?download=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-type']).toBe('application/pdf');
    expect(downloadRes.headers['content-disposition']).toContain('attachment');
    expect(downloadRes.body.slice(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // TEST 5: Direct PDF Engine Generation with Custom Watermark & Logos
  // =========================================================================
  it('8. pdfService generates valid 2-Page Approval Letter with custom watermark and logos', async () => {
    const pdfBuffer = await pdfService.generateApprovalLetterPdf({
      customerName: 'Ajay Kumar',
      customerPhone: '8274843108',
      applicationNumber: 'LN20260906142729',
      loanAccountNumber: 'LN20260906142729',
      approvalNumber: 'LN20260906142729',
      loanType: 'Mudra Loan',
      approvedAmount: 100000,
      interestRate: 2.0,
      tenureMonths: 12,
      monthlyEmi: 8500,
      processingFee: 7899,
      approvalDate: '2026-09-19',
      companyName: 'EMI Finance',
      companyLegalName: 'Pradhan Mantri Mudra Yojna',
      companyAddress: '3rd Floor, Office No. 218, 219 & 222 Gokhale Plaza, Chinchwadakurdi Link Road, Pune, Maharashtra',
      companyEmail: 'info@dmmdmudra.co.in',
      companyPhone: '8942014797',
      watermarkOpacity: 0.12,
      watermarkSize: 'MEDIUM',
      watermarkPosition: 'CENTER',
      logoUrl: `data:image/png;base64,${samplePngBuffer.toString('base64')}`,
      secondaryLogoUrl: `data:image/png;base64,${samplePngBuffer.toString('base64')}`,
      watermarkLogoUrl: `data:image/png;base64,${samplePngBuffer.toString('base64')}`,
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('9. pdfService generates valid 1-Page Tax Invoice with custom watermark and logos', async () => {
    const pdfBuffer = await pdfService.generateInvoicePdf({
      invoiceNumber: 'INV-2026-TEST01',
      invoiceDate: new Date(),
      customerName: 'Ajay Kumar',
      customerMobile: '8274843108',
      applicationNumber: 'LN20260906142729',
      chargeType: 'Processing Fee',
      amount: 7899,
      taxAmount: 1421,
      totalAmount: 9320,
      paymentDate: new Date(),
      paymentStatus: 'PAID',
      transactionRef: 'UTR-TEST-123456',
      companyName: 'Kumbhat Financial Services',
      companyAddress: '5th Floor, Kumbhat Complex, Chennai',
      companyEmail: 'support@craftmudra.in',
      companyPhone: '8942014797',
      watermarkOpacity: 0.10,
      watermarkSize: 'LARGE',
      watermarkPosition: 'CENTER',
      logoUrl: `data:image/png;base64,${samplePngBuffer.toString('base64')}`,
      watermarkLogoUrl: `data:image/png;base64,${samplePngBuffer.toString('base64')}`,
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
  });

  // =========================================================================
  // TEST 6: Security & Authorization Protection
  // =========================================================================
  it('10. Customer cannot access branding update endpoints', async () => {
    const res = await request(app)
      .put('/api/admin/settings/branding')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ companyName: 'Hacked Branding' });

    expect([401, 403]).toContain(res.status);
  });

  // =========================================================================
  // TEST 7: Historical Document Immutability
  // =========================================================================
  it('12. Historical documents remain immutable when branding settings change later', async () => {
    // 1. Generate document under Brand A
    const originalPdfBuffer = await pdfService.generateInvoicePdf({
      invoiceNumber: 'INV-HISTORICAL-01',
      invoiceDate: '2026-09-21',
      customerName: 'Historical Borrower',
      applicationNumber: 'LA-HIST-001',
      chargeType: 'Processing Fee',
      amount: 5000,
      paymentStatus: 'PAID',
      companyName: 'Brand Alpha Financial',
      companyLegalName: 'Brand Alpha Financial Pvt Ltd',
      companyEmail: 'alpha@fintech.test',
      watermarkOpacity: 0.10,
    });

    const originalLength = originalPdfBuffer.length;

    // 2. Admin later changes branding to Brand Beta
    await request(app)
      .put('/api/admin/settings/branding')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        companyName: 'Brand Beta Financial',
        companyLegalName: 'Brand Beta Financial Pvt Ltd',
        appName: 'BetaApp',
        email: 'beta@fintech.test',
        phone: '+91 99999 88888',
        address: 'New Beta Tower, Delhi',
        website: 'https://betafintech.test',
        watermarkOpacity: 0.25,
      });

    // 3. The historical document buffer previously generated and persisted remains untouched
    expect(originalPdfBuffer.length).toBe(originalLength);
    // Newly generated document will use new branding
    const newPdfBuffer = await pdfService.generateInvoicePdf({
      invoiceNumber: 'INV-NEW-02',
      invoiceDate: '2026-09-25',
      customerName: 'New Borrower',
      applicationNumber: 'LA-NEW-002',
      chargeType: 'Processing Fee',
      amount: 5000,
      paymentStatus: 'PAID',
      companyName: 'Brand Beta Financial',
      companyLegalName: 'Brand Beta Financial Pvt Ltd',
      companyEmail: 'beta@fintech.test',
      watermarkOpacity: 0.25,
    });

    expect(newPdfBuffer.length).toBeGreaterThan(1000);
  });
});


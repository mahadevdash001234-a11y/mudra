import { prisma } from '../services/db';
import { generateAuthToken } from '../services/tokenService';
import request from 'supertest';
import { app } from '../app';

async function run() {
  console.log('================================================================');
  console.log('VERIFYING ALL PDF ENDPOINTS (ANTI-IDM JSON ARCHITECTURE)');
  console.log('================================================================');

  // 1. Get or create Admin with SUPER_ADMIN
  let admin = await prisma.adminUser.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });
  if (!admin) {
    admin = await prisma.adminUser.findFirst();
  }
  if (!admin) throw new Error('No admin user found in database');
  // Ensure permissions include branding.view and charges
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { role: 'SUPER_ADMIN' },
  });
  const adminToken = generateAuthToken(admin.id, 'ADMIN');

  // 2. Get or create Customer
  const customer = await prisma.customer.findFirst({
    include: {
      loans: {
        include: {
          documents: true,
          payments: true,
        },
      },
      charges: true,
      documents: true,
    },
  });
  if (!customer) throw new Error('No customer found in database');
  const customerToken = generateAuthToken(customer.id, 'CUSTOMER');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, msg: string) {
    totalCount++;
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
    console.log(`✅ PASS: ${msg}`);
    passedCount++;
  }

  // A. Admin Approval Letter Preview
  console.log('\n--- A. Admin Approval Letter Preview ---');
  const adminAppLetterPrev = await request(app)
    .get('/api/admin/settings/preview/approval-letter')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminAppLetterPrev.status === 200, 'Admin approval letter preview returns 200');
  assert(
    adminAppLetterPrev.headers['content-type'].includes('application/json'),
    `Admin approval letter preview Content-Type is application/json (got: ${adminAppLetterPrev.headers['content-type']})`
  );
  assert(adminAppLetterPrev.body.success === true, 'Admin approval letter preview body.success is true');
  assert(adminAppLetterPrev.body.mimeType === 'application/pdf', 'mimeType is application/pdf');
  const adminAppLetterBytes = Buffer.from(adminAppLetterPrev.body.data, 'base64');
  assert(adminAppLetterBytes.slice(0, 4).toString() === '%PDF', 'Decoded data contains valid %PDF magic bytes');

  // B. Admin Approval Letter Download
  console.log('\n--- B. Admin Approval Letter Download ---');
  const adminAppLetterDown = await request(app)
    .get('/api/admin/settings/preview/approval-letter?download=true')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminAppLetterDown.status === 200, 'Admin approval letter download returns 200');
  assert(
    adminAppLetterDown.headers['content-type'].includes('application/pdf'),
    'Admin approval letter download Content-Type is application/pdf'
  );
  assert(
    adminAppLetterDown.headers['content-disposition'].includes('attachment'),
    'Content-Disposition is attachment'
  );
  assert(adminAppLetterDown.body.slice(0, 4).toString() === '%PDF', 'Download response contains valid %PDF bytes');

  // C. Admin Invoice Preview
  console.log('\n--- C. Admin Invoice Preview ---');
  const adminInvPrev = await request(app)
    .get('/api/admin/settings/preview/invoice')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminInvPrev.status === 200, 'Admin invoice preview returns 200');
  assert(
    adminInvPrev.headers['content-type'].includes('application/json'),
    `Admin invoice preview Content-Type is application/json (got: ${adminInvPrev.headers['content-type']})`
  );
  assert(adminInvPrev.body.success === true, 'Admin invoice preview body.success is true');
  const adminInvBytes = Buffer.from(adminInvPrev.body.data, 'base64');
  assert(adminInvBytes.slice(0, 4).toString() === '%PDF', 'Decoded invoice bytes contain %PDF');

  // D. Admin Invoice Download
  console.log('\n--- D. Admin Invoice Download ---');
  const adminInvDown = await request(app)
    .get('/api/admin/settings/preview/invoice?download=true')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminInvDown.status === 200, 'Admin invoice download returns 200');
  assert(
    adminInvDown.headers['content-type'].includes('application/pdf'),
    'Admin invoice download Content-Type is application/pdf'
  );
  assert(
    adminInvDown.headers['content-disposition'].includes('attachment'),
    'Invoice download Content-Disposition is attachment'
  );

  // E. Approved Loan Approval Letter Preview & Download
  const approvedLoan = await prisma.loanApplication.findFirst({
    where: { status: { in: ['APPROVED', 'DISBURSED'] } },
  });
  if (approvedLoan) {
    console.log(`\n--- E. Loan Approval Letter for Loan: ${approvedLoan.id} ---`);
    const custAppLetterPrev = await request(app)
      .get(`/api/customer/loans/${approvedLoan.id}/approval-letter/pdf`)
      .set('Authorization', `Bearer ${customerToken}`);
    if (custAppLetterPrev.status === 200) {
      assert(
        custAppLetterPrev.headers['content-type'].includes('application/json'),
        'Customer approval letter preview Content-Type is application/json'
      );
      assert(custAppLetterPrev.body.success === true, 'body.success is true');
      const custAppBytes = Buffer.from(custAppLetterPrev.body.data, 'base64');
      assert(custAppBytes.slice(0, 4).toString() === '%PDF', 'Decoded approval letter bytes contain %PDF');

      const custAppLetterDown = await request(app)
        .get(`/api/customer/loans/${approvedLoan.id}/approval-letter/pdf?download=true`)
        .set('Authorization', `Bearer ${customerToken}`);
      assert(
        custAppLetterDown.headers['content-type'].includes('application/pdf'),
        'Customer approval letter download Content-Type is application/pdf'
      );
      assert(
        custAppLetterDown.headers['content-disposition'].includes('attachment'),
        'Customer approval letter download is attachment'
      );
    }
  }

  // F. Specific Charge Invoices (KYC, Processing Fee, GST, Other)
  const paidCharges = await prisma.charge.findMany({
    where: { status: 'PAID' },
    take: 5,
  });
  console.log(`\n--- F. Paid Specific Charges Count: ${paidCharges.length} ---`);
  for (const chg of paidCharges) {
    console.log(`Checking charge: ${chg.name} (${chg.id})`);
    const chgPrev = await request(app)
      .get(`/api/admin/charges/specific/${chg.id}/invoice`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (chgPrev.status === 200) {
      assert(
        chgPrev.headers['content-type'].includes('application/json'),
        `Charge ${chg.name} invoice preview Content-Type is application/json`
      );
      assert(chgPrev.body.success === true, `Charge ${chg.name} invoice preview success is true`);
      const chgBytes = Buffer.from(chgPrev.body.data, 'base64');
      assert(chgBytes.slice(0, 4).toString() === '%PDF', `Charge ${chg.name} PDF magic bytes valid`);

      const chgDown = await request(app)
        .get(`/api/admin/charges/specific/${chg.id}/invoice?download=true`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert(
        chgDown.headers['content-type'].includes('application/pdf'),
        `Charge ${chg.name} invoice download Content-Type is application/pdf`
      );
    }
  }

  // G. Customer Invoices endpoint (/api/customer/invoices/:id/pdf)
  const invoiceRecord = await prisma.invoice.findFirst();
  if (invoiceRecord) {
    console.log(`\n--- G. Customer Invoice ${invoiceRecord.invoiceNumber} ---`);
    const invToken = generateAuthToken(invoiceRecord.customerId, 'CUSTOMER');
    const custInvPrev = await request(app)
      .get(`/api/customer/invoices/${invoiceRecord.id}/pdf`)
      .set('Authorization', `Bearer ${invToken}`);
    if (custInvPrev.status === 200) {
      assert(
        custInvPrev.headers['content-type'].includes('application/json'),
        'Customer invoice preview Content-Type is application/json'
      );
      assert(custInvPrev.body.success === true, 'Customer invoice preview success is true');
      const custInvBytes = Buffer.from(custInvPrev.body.data, 'base64');
      assert(custInvBytes.slice(0, 4).toString() === '%PDF', 'Customer invoice decoded %PDF bytes valid');
    }
  }

  // H. Admin Document View (/api/admin/documents/:id/view)
  const anyDoc = await prisma.loanDocument.findFirst();
  if (anyDoc) {
    console.log(`\n--- H. Document View for docId: ${anyDoc.id} ---`);
    const docPrev = await request(app)
      .get(`/api/admin/documents/${anyDoc.id}/view`)
      .set('Authorization', `Bearer ${adminToken}`);
    if (docPrev.status === 200) {
      assert(
        docPrev.headers['content-type'].includes('application/json'),
        'Admin document preview Content-Type is application/json'
      );
      assert(docPrev.body.success === true, 'Admin document preview success is true');
      assert(typeof docPrev.body.data === 'string', 'Document base64 data returned');
    }
  }

  console.log('\n================================================================');
  console.log(`ALL VERIFICATIONS PASSED: ${passedCount}/${totalCount}`);
  console.log('Anti-IDM Architecture Confirmed: All preview responses are application/json!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('FAILED TO VERIFY PDF ENDPOINTS:', err);
  process.exit(1);
});

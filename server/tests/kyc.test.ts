import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/services/db';
import { generateAuthToken } from '../src/services/tokenService';
import bcrypt from 'bcryptjs';

describe('KYC & Document Management Suite', () => {
  const customerAMobile = '9222333444';
  const customerBMobile = '9333444555';
  const adminEmail = 'kycadmin@loanapprove.com';

  let customerAId: string;
  let customerAToken: string;
  let customerBId: string;
  let customerBToken: string;
  let adminId: string;
  let adminToken: string;

  let customerADocId: string;

  beforeAll(async () => {
    // Clean up test data
    await prisma.loanDocument.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerAMobile, customerBMobile] } },
    });
    await prisma.adminUser.deleteMany({ where: { email: adminEmail } });

    // Create Customer A
    const custA = await prisma.customer.create({
      data: {
        mobile: customerAMobile,
        fullName: 'Customer Alpha',
        email: 'alpha@example.com',
        address: '101 Residency Rd',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_alpha',
        aadhaarMasked: 'XXXX XXXX 1111',
        monthlyIncome: 60000,
        status: 'ACTIVE',
        kycStatus: 'PENDING',
      },
    });
    customerAId = custA.id;
    customerAToken = generateAuthToken(customerAId, 'CUSTOMER');

    // Create Customer B (for IDOR attack tests)
    const custB = await prisma.customer.create({
      data: {
        mobile: customerBMobile,
        fullName: 'Customer Beta',
        email: 'beta@example.com',
        address: '202 Marine Lines',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_beta',
        aadhaarMasked: 'XXXX XXXX 2222',
        monthlyIncome: 70000,
        status: 'ACTIVE',
        kycStatus: 'PENDING',
      },
    });
    customerBId = custB.id;
    customerBToken = generateAuthToken(customerBId, 'CUSTOMER');

    // Create Admin
    const passHash = await bcrypt.hash('AdminPass@123', 10);
    const admin = await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: passHash,
        fullName: 'KYC Reviewer Admin',
        role: 'ADMIN',
        isActive: true,
      },
    });
    adminId = admin.id;
    adminToken = generateAuthToken(adminId, 'ADMIN');
  });

  afterAll(async () => {
    await prisma.loanDocument.deleteMany({});
    await prisma.documentRequest.deleteMany({});
    await prisma.customer.deleteMany({
      where: { mobile: { in: [customerAMobile, customerBMobile] } },
    });
    await prisma.adminUser.deleteMany({ where: { email: adminEmail } });
  });

  describe('Customer Document Upload & Validation', () => {
    it('should reject unauthenticated upload with 401', async () => {
      const res = await request(app)
        .post('/api/customer/documents')
        .field('documentType', 'PAN')
        .attach('file', Buffer.from('fake pdf content'), 'test.pdf');

      expect(res.status).toBe(401);
    });

    it('should reject unsupported file types with 400', async () => {
      const res = await request(app)
        .post('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`)
        .field('documentType', 'PAN')
        .attach('file', Buffer.from('fake script content'), 'malicious.exe');

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/unsupported file extension/i);
    });

    it('should successfully upload a valid PDF document', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 mock pdf content for testing');
      const res = await request(app)
        .post('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`)
        .field('documentType', 'AADHAAR_FRONT')
        .attach('file', pdfBuffer, 'aadhaar_front.pdf');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.document.documentType).toBe('AADHAAR_FRONT');
      expect(res.body.data.document.status).toBe('PENDING');
      expect(res.body.data.document.version).toBe(1);

      customerADocId = res.body.data.document.id;

      // Customer KYC status should still be PENDING (since back is missing and not submitted)
      const cust = await prisma.customer.findUnique({ where: { id: customerAId } });
      expect(cust?.kycStatus).toBe('PENDING');
    });

    it('should successfully upload a valid JPG document (Aadhaar Back) and submit KYC', async () => {
      const imgBuffer = Buffer.from('mock jpg data');
      const res = await request(app)
        .post('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`)
        .field('documentType', 'AADHAAR_BACK')
        .attach('file', imgBuffer, 'aadhaar_back.jpg');

      expect(res.status).toBe(201);
      expect(res.body.data.document.documentType).toBe('AADHAAR_BACK');
      expect(res.body.data.document.version).toBe(1);

      // Customer submits KYC
      const submitRes = await request(app)
        .post('/api/customer/kyc/submit')
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(submitRes.status).toBe(200);

      const cust = await prisma.customer.findUnique({ where: { id: customerAId } });
      expect(cust?.kycStatus).toBe('UNDER_REVIEW');
    });
  });

  describe('Customer Document Listing & Metadata', () => {
    it('should list all active documents for the authenticated customer', async () => {
      const res = await request(app)
        .get('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents.length).toBe(2); // AADHAAR_FRONT and PAN
      expect(res.body.data.customer.kycStatus).toBe('UNDER_REVIEW');
    });

    it('should get document metadata for owned document', async () => {
      const res = await request(app)
        .get(`/api/customer/documents/${customerADocId}`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.document.id).toBe(customerADocId);
      expect(res.body.data.document.documentType).toBe('AADHAAR_FRONT');
    });

    it('should reject access to another customer document metadata (IDOR Protection)', async () => {
      // Customer B attempts to inspect Customer A's document metadata
      const res = await request(app)
        .get(`/api/customer/documents/${customerADocId}`)
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/unauthorized/i);
    });
  });

  describe('Document File Streaming & IDOR Protection', () => {
    it('should allow customer to stream/download their own document', async () => {
      // Preview request (anti-IDM JSON Base64 architecture)
      const res = await request(app)
        .get(`/api/customer/documents/${customerADocId}/file`)
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mimeType).toBe('application/pdf');
      expect(typeof res.body.data).toBe('string');

      // Direct download request
      const downloadRes = await request(app)
        .get(`/api/customer/documents/${customerADocId}/file?download=true`)
        .set('Authorization', `Bearer ${customerAToken}`);
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers['content-type']).toContain('application/pdf');
    });

    it('should strictly reject customer streaming another customer document (IDOR Protection)', async () => {
      // Customer B attempts to stream Customer A's document
      const res = await request(app)
        .get(`/api/customer/documents/${customerADocId}/file`)
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/forbidden/i);
    });
  });

  describe('Document Re-upload & Versioning', () => {
    it('should create version 2 on re-upload and preserve version 1 in history', async () => {
      const newPdfBuffer = Buffer.from('%PDF-1.4 updated aadhaar version 2');
      const res = await request(app)
        .post(`/api/customer/documents/${customerADocId}/reupload`)
        .set('Authorization', `Bearer ${customerAToken}`)
        .attach('file', newPdfBuffer, 'aadhaar_front_v2.pdf');

      expect(res.status).toBe(201);
      expect(res.body.data.document.version).toBe(2);
      customerADocId = res.body.data.document.id; // Update to latest active version

      // Verify in DB that version 1 is preserved and marked isCurrentVersion = false
      const allVersions = await prisma.loanDocument.findMany({
        where: {
          customerId: customerAId,
          documentType: 'AADHAAR_FRONT',
        },
        orderBy: { version: 'asc' },
      });

      expect(allVersions.length).toBe(2);
      expect(allVersions[0].version).toBe(1);
      expect(allVersions[0].isCurrentVersion).toBe(false);
      expect(allVersions[1].version).toBe(2);
      expect(allVersions[1].isCurrentVersion).toBe(true);
    });
  });

  describe('Admin KYC Review & Additional Document Requests', () => {
    it('should reject customer accessing admin KYC endpoints with 403', async () => {
      const res = await request(app)
        .get('/api/admin/kyc')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/requires admin privileges/i);
    });

    it('should allow admin to list KYC customers with filters and pagination', async () => {
      const res = await request(app)
        .get('/api/admin/kyc?status=UNDER_REVIEW')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customers.length).toBeGreaterThanOrEqual(1);
      const custAFound = res.body.data.customers.find((c: { id: string }) => c.id === customerAId);
      expect(custAFound).toBeDefined();
      expect(custAFound.docStats.total).toBe(2); // Active docs
    });

    it('should allow admin to view customer KYC details with active and historical documents', async () => {
      const res = await request(app)
        .get(`/api/admin/kyc/${customerAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.customer.id).toBe(customerAId);
      expect(res.body.data.documents.length).toBe(2); // Active
      expect(res.body.data.documentHistory.length).toBe(1); // v1 history
    });

    it('should allow admin to stream/view document for review and write audit log', async () => {
      const res = await request(app)
        .get(`/api/admin/kyc/documents/${customerADocId}/file`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'DOCUMENT_VIEWED',
          entityId: customerADocId,
        },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorType).toBe('ADMIN');
    });

    it('should reject document rejection without reason with 400', async () => {
      const res = await request(app)
        .post(`/api/admin/kyc/documents/${customerADocId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'REJECT',
          reason: '', // Empty reason should fail
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should allow admin to request re-upload with mandatory reason', async () => {
      const res = await request(app)
        .post(`/api/admin/kyc/documents/${customerADocId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'REQUEST_REUPLOAD',
          reason: 'Document corners are cropped. Please upload a full view.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.document.status).toBe('REUPLOAD_REQUIRED');
      expect(res.body.data.document.rejectionReason).toBe(
        'Document corners are cropped. Please upload a full view.'
      );

      // Customer KYC status should now be REUPLOAD_REQUIRED
      const cust = await prisma.customer.findUnique({ where: { id: customerAId } });
      expect(cust?.kycStatus).toBe('REUPLOAD_REQUIRED');
    });

    it('should allow admin to approve a valid document', async () => {
      const res = await request(app)
        .post(`/api/admin/kyc/documents/${customerADocId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'APPROVE',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.document.status).toBe('APPROVED');
    });

    it('should allow admin to request an additional document from the customer', async () => {
      const res = await request(app)
        .post(`/api/admin/kyc/${customerAId}/request-document`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          documentType: 'BANK_STATEMENT',
          title: 'Latest 3 Months Bank Statement',
          description: 'Please provide salary bank statement for the last 3 months with bank seal.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.request.title).toBe('Latest 3 Months Bank Statement');
      expect(res.body.data.request.status).toBe('PENDING');

        // Customer document list should now include this pending request
      const custDocs = await request(app)
        .get('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(custDocs.body.data.pendingRequests.length).toBe(1);
      expect(custDocs.body.data.pendingRequests[0].title).toBe('Latest 3 Months Bank Statement');
    });

    it('should submit customer KYC when Aadhaar front and back are present', async () => {
      const res = await request(app)
        .post('/api/customer/kyc/submit')
        .set('Authorization', `Bearer ${customerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kycStatus).toBe('UNDER_REVIEW');
    });

    it('should reject KYC submission when customer is missing required Aadhaar documents', async () => {
      // Customer B has no documents uploaded
      const res = await request(app)
        .post('/api/customer/kyc/submit')
        .set('Authorization', `Bearer ${customerBToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Aadhaar Front and Aadhaar Back/i);
    });

    it('should exclude loan documents (PAN, etc.) from Admin KYC details view', async () => {
      // Upload a PAN card (Loan Document) for Customer A
      await request(app)
        .post('/api/customer/documents')
        .set('Authorization', `Bearer ${customerAToken}`)
        .field('documentType', 'PAN')
        .attach('file', Buffer.from('pan bytes'), 'pan.jpg');

      // Admin requests KYC details for Customer A
      const res = await request(app)
        .get(`/api/admin/kyc/${customerAId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      // Admin KYC details must ONLY show Aadhaar documents (front and back), NOT PAN
      const docTypes = res.body.data.documents.map((d: { documentType: string }) => d.documentType);
      expect(docTypes).toContain('AADHAAR_FRONT');
      expect(docTypes).toContain('AADHAAR_BACK');
      expect(docTypes).not.toContain('PAN');
    });
  });
});


import path from 'path';
import crypto from 'crypto';
import { prisma } from './db';
import { storageProvider } from '../providers/storage';
import { AppError } from '../middleware/errorHandler';
import { auditService } from './auditService';
import { DocumentType } from '../validators/documentValidators';

export const documentService = {
  /**
   * Lists all current KYC documents and pending document requests for a customer.
   */
  async listCustomerDocuments(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        kycStatus: true,
        status: true,
      },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    // Retrieve active versions of uploaded documents
    const documents = await prisma.loanDocument.findMany({
      where: {
        customerId,
        isCurrentVersion: true,
      },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        originalFileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        version: true,
        rejectionReason: true,
        reviewedAt: true,
        uploadedAt: true,
      },
    });

    // Retrieve any pending additional document requests from admin
    const pendingRequests = await prisma.documentRequest.findMany({
      where: {
        customerId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        kycStatus: customer.kycStatus,
      },
      kycStatus: customer.kycStatus,
      documents,
      pendingRequests,
    };
  },

  /**
   * Uploads a new document for a customer.
   */
  async uploadDocument(
    customerId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    loanId?: string,
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer not found');
    }

    // ── STAGE GATE: LOAN DOCUMENTS UNLOCK CHECK ───────────────────────────
    const isKycDoc = documentType === 'AADHAAR_FRONT' || documentType === 'AADHAAR_BACK';
    if (!isKycDoc) {
      if (customer.kycStatus !== 'APPROVED' && customer.kycStatus !== 'VERIFIED') {
        throw new AppError(
          403,
          'Loan documents are locked. Complete KYC verification first.',
          'DOCUMENTS_LOCKED'
        );
      }
    } else {
      // If customer KYC is already APPROVED / VERIFIED
      if (customer.kycStatus === 'APPROVED' || customer.kycStatus === 'VERIFIED') {
        // Check if there is an explicit REUPLOAD_REQUIRED on this document
        const existingKycDoc = await prisma.loanDocument.findFirst({
          where: {
            customerId,
            documentType,
            isCurrentVersion: true,
          },
          orderBy: { version: 'desc' },
        });

        const pendingRequest = await prisma.documentRequest.findFirst({
          where: {
            customerId,
            documentType,
            status: 'PENDING',
          },
        });

        const isDocReuploadRequired = existingKycDoc?.status === 'REUPLOAD_REQUIRED';

        if (!isDocReuploadRequired && !pendingRequest) {
          throw new AppError(
            403,
            'KYC is already approved and verified. Identity document uploads are locked unless requested by admin.',
            'KYC_ALREADY_APPROVED'
          );
        }
      }
    }

    // Resolve targetLoanId if not explicitly provided
    let targetLoanId = loanId;
    if (!targetLoanId && !isKycDoc) {
      const activeLoan = await prisma.loanApplication.findFirst({
        where: {
          customerId,
          status: { notIn: ['REJECTED', 'CANCELLED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (activeLoan) {
        targetLoanId = activeLoan.id;
      }
    }

    // Check existing documents of this type for versioning
    const existingDoc = await prisma.loanDocument.findFirst({
      where: {
        customerId,
        documentType,
        isCurrentVersion: true,
      },
      orderBy: { version: 'desc' },
    });

    const nextVersion = existingDoc ? existingDoc.version + 1 : 1;

    // Generate safe storage key
    const fileExt = path.extname(file.originalname).toLowerCase() || '.bin';
    const uniqueFileId = crypto.randomUUID();
    const storageKey = `documents/${customerId}/${documentType}/${uniqueFileId}-v${nextVersion}${fileExt}`;

    // Store file safely
    const stored = await storageProvider.saveFile(
      storageKey,
      file.buffer,
      file.mimetype
    );

    // If an existing active version exists, archive it (preserve history)
    if (existingDoc) {
      await prisma.loanDocument.update({
        where: { id: existingDoc.id },
        data: { isCurrentVersion: false },
      });
    }

    // Create the new document record
    const document = await prisma.loanDocument.create({
      data: {
        id: uniqueFileId,
        customerId,
        loanId: targetLoanId || null,
        documentType,
        fileName: path.basename(file.originalname),
        originalFileName: file.originalname,
        storageKey,
        filePath: stored.filePath,
        fileUrl: `/api/customer/documents/${uniqueFileId}/file`, // safe logical URL
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'PENDING',
        version: nextVersion,
        isCurrentVersion: true,
      },
    });

    // Check if there was an open DocumentRequest for this type and fulfill it
    await prisma.documentRequest.updateMany({
      where: {
        customerId,
        documentType,
        status: 'PENDING',
      },
      data: { status: 'FULFILLED' },
    });

    // Check if any open loan applications in DOCUMENTS_REQUIRED have all pending requests satisfied
    const remainingPendingRequests = await prisma.documentRequest.count({
      where: {
        customerId,
        status: 'PENDING',
      },
    });

    if (remainingPendingRequests === 0) {
      await prisma.loanApplication.updateMany({
        where: {
          customerId,
          status: 'DOCUMENTS_REQUIRED',
        },
        data: {
          status: 'UNDER_REVIEW',
        },
      });
    }

    // ── STAGE-GATED CHARGE ACTIVATION & KYC EVALUATION ───────────────────
    if (!isKycDoc) {
      // Non-KYC document uploaded (e.g. PAN, Bank Statement, Income Proof)
      // Check if all mandatory loan documents are now uploaded
      await this.checkAndActivateProcessingFee(customerId, loanId || undefined);
    } else {
      // Re-evaluate customer's overall KYC status (e.g., transition from REUPLOAD_REQUIRED to UNDER_REVIEW)
      const { adminKycService } = await import('./adminKycService');
      await adminKycService.evaluateCustomerKycStatus(customerId, undefined, ipAddress);
    }

    // Audit log entry
    await auditService.record({
      actorType: 'CUSTOMER',
      actorId: customer.id,
      actorName: customer.fullName,
      action: existingDoc ? 'DOCUMENT_REUPLOADED' : 'DOCUMENT_UPLOADED',
      entity: 'LoanDocument',
      entityId: document.id,
      newValue: {
        documentType: document.documentType,
        version: document.version,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        status: document.status,
      },
      ipAddress,
    });

    return {
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      status: document.status,
      version: document.version,
      uploadedAt: document.uploadedAt,
    };
  },

  /**
   * Re-uploads a document for a specific existing document record.
   */
  async reuploadDocument(
    customerId: string,
    documentId: string,
    file: Express.Multer.File,
    ipAddress?: string
  ) {
    const existingDoc = await prisma.loanDocument.findUnique({
      where: { id: documentId },
    });

    if (!existingDoc) {
      throw new AppError(404, 'Document record not found');
    }

    // Strict IDOR check
    if (existingDoc.customerId !== customerId) {
      throw new AppError(403, 'Unauthorized: You do not own this document');
    }

    return this.uploadDocument(
      customerId,
      existingDoc.documentType as DocumentType,
      file,
      existingDoc.loanId || undefined,
      ipAddress
    );
  },

  /**
   * Retrieves document metadata with strict customer ownership check.
   */
  async getDocumentMetadata(documentId: string, customerId: string) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    if (document.customerId !== customerId) {
      throw new AppError(403, 'Unauthorized access to document');
    }

    return {
      id: document.id,
      documentType: document.documentType,
      fileName: document.fileName,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      status: document.status,
      version: document.version,
      rejectionReason: document.rejectionReason,
      reviewedAt: document.reviewedAt,
      uploadedAt: document.uploadedAt,
    };
  },

  /**
   * Streams file content for authenticated download/viewing with strict authorization.
   */
  async getDocumentStream(
    documentId: string,
    requester: { id: string; role: 'CUSTOMER' | 'ADMIN'; fullName?: string },
    ipAddress?: string
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
      include: { customer: true },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    // IDOR protection: if CUSTOMER, enforce ownership
    if (requester.role === 'CUSTOMER' && document.customerId !== requester.id) {
      throw new AppError(403, 'Forbidden: You do not have permission to access this document');
    }

    const stream = await storageProvider.getFileStream(document.storageKey);

    // Audit log if viewed by Admin
    if (requester.role === 'ADMIN') {
      await auditService.record({
        actorType: 'ADMIN',
        actorId: requester.id,
        actorName: requester.fullName || 'Admin',
        action: 'DOCUMENT_VIEWED',
        entity: 'LoanDocument',
        entityId: document.id,
        newValue: {
          customerId: document.customerId,
          documentType: document.documentType,
          version: document.version,
        },
        ipAddress,
      });
    }

    return {
      stream,
      mimeType: document.mimeType,
      fileName: document.fileName,
      fileSize: document.fileSize,
    };
  },

  /**
   * Admin: List all documents (with version history) for a specific customer in Customer 360.
   */
  async listCustomerDocumentsForAdmin(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        email: true,
        mobile: true,
        kycStatus: true,
        status: true,
      },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    // Retrieve all documents for this customer ordered by upload date
    const allDocuments = await prisma.loanDocument.findMany({
      where: { customerId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        originalFileName: true,
        fileSize: true,
        mimeType: true,
        status: true,
        version: true,
        isCurrentVersion: true,
        rejectionReason: true,
        reviewedBy: true,
        reviewedAt: true,
        uploadedAt: true,
        fileUrl: true,
      },
    });

    // Separate into current active documents and historical versions
    const currentDocuments = allDocuments.filter((d) => d.isCurrentVersion);
    const historicalDocuments = allDocuments.filter((d) => !d.isCurrentVersion);

    // Group version history by document type for easy frontend inspection
    const documentsWithHistory = currentDocuments.map((doc) => {
      const versions = allDocuments
        .filter((d) => d.documentType === doc.documentType)
        .sort((a, b) => b.version - a.version);

      return {
        ...doc,
        versionsCount: versions.length,
        versions,
      };
    });

    // Also include any historical documents whose type has no current version
    const representedTypes = new Set(currentDocuments.map((d) => d.documentType));
    const orphanHistorical = historicalDocuments.filter((d) => !representedTypes.has(d.documentType));
    orphanHistorical.forEach((orphan) => {
      documentsWithHistory.push({
        ...orphan,
        versionsCount: 1,
        versions: [orphan],
      });
    });

    // Retrieve active document requests
    const pendingRequests = await prisma.documentRequest.findMany({
      where: {
        customerId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        documentType: true,
        title: true,
        description: true,
        status: true,
        requestedBy: true,
        createdAt: true,
      },
    });

    // Calculate status counts
    const summary = {
      total: documentsWithHistory.length,
      verified: documentsWithHistory.filter((d) => d.status === 'APPROVED' || d.status === 'VERIFIED').length,
      pending: documentsWithHistory.filter((d) => d.status === 'PENDING' || d.status === 'UNDER_REVIEW').length,
      rejected: documentsWithHistory.filter((d) => d.status === 'REJECTED').length,
      correctionRequired: documentsWithHistory.filter((d) => d.status === 'REUPLOAD_REQUIRED' || d.status === 'CORRECTION_REQUIRED').length,
    };

    return {
      customer,
      documents: documentsWithHistory,
      pendingRequests,
      summary,
    };
  },

  /**
   * Admin: Verify / Approve customer document.
   */
  async verifyDocument(
    documentId: string,
    admin: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    const updatedDocument = await prisma.loanDocument.update({
      where: { id: documentId },
      data: {
        status: 'APPROVED',
        rejectionReason: null,
        reviewedBy: admin.fullName,
        reviewedAt: new Date(),
      },
    });

    // Audit log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: 'DOCUMENT_VERIFIED',
      entity: 'LoanDocument',
      entityId: document.id,
      previousValue: { status: document.status },
      newValue: {
        adminId: admin.id,
        customerId: document.customerId,
        documentId: document.id,
        documentType: document.documentType,
        action: 'DOCUMENT_VERIFIED',
        status: 'VERIFIED',
        timestamp: new Date().toISOString(),
      },
      ipAddress,
    });

    // Re-evaluate customer's overall KYC status
    const { adminKycService } = await import('./adminKycService');
    await adminKycService.evaluateCustomerKycStatus(document.customerId, admin, ipAddress);

    return updatedDocument;
  },

  /**
   * Admin: Reject customer document with mandatory reason.
   */
  async rejectDocument(
    documentId: string,
    reason: string,
    admin: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    const updatedDocument = await prisma.loanDocument.update({
      where: { id: documentId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason,
        reviewedBy: admin.fullName,
        reviewedAt: new Date(),
      },
    });

    // Audit log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: 'DOCUMENT_REJECTED',
      entity: 'LoanDocument',
      entityId: document.id,
      previousValue: { status: document.status },
      newValue: {
        adminId: admin.id,
        customerId: document.customerId,
        documentId: document.id,
        documentType: document.documentType,
        reason,
        action: 'DOCUMENT_REJECTED',
        status: 'REJECTED',
        timestamp: new Date().toISOString(),
      },
      ipAddress,
    });

    // Re-evaluate customer's overall KYC status
    const { adminKycService } = await import('./adminKycService');
    await adminKycService.evaluateCustomerKycStatus(document.customerId, admin, ipAddress);

    return updatedDocument;
  },

  /**
   * Admin: Request correction / re-upload from customer.
   */
  async requestCorrection(
    documentId: string,
    reason: string,
    admin: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    const updatedDocument = await prisma.loanDocument.update({
      where: { id: documentId },
      data: {
        status: 'REUPLOAD_REQUIRED',
        rejectionReason: reason,
        reviewedBy: admin.fullName,
        reviewedAt: new Date(),
      },
    });

    // Create in-app notification for customer
    try {
      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId: document.customerId,
          title: 'Document Correction Required',
          message: `Correction requested for your ${document.documentType.replace(/_/g, ' ')}: ${reason}`,
          eventType: 'DOCUMENT_CORRECTION_REQUIRED',
          isRead: false,
        },
      });
    } catch {
      // Non-blocking notification write
    }

    // Audit log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: 'DOCUMENT_CORRECTION_REQUESTED',
      entity: 'LoanDocument',
      entityId: document.id,
      previousValue: { status: document.status },
      newValue: {
        adminId: admin.id,
        customerId: document.customerId,
        documentId: document.id,
        documentType: document.documentType,
        reason,
        action: 'DOCUMENT_CORRECTION_REQUESTED',
        status: 'CORRECTION_REQUIRED',
        timestamp: new Date().toISOString(),
      },
      ipAddress,
    });

    // Re-evaluate customer's overall KYC status
    const { adminKycService } = await import('./adminKycService');
    await adminKycService.evaluateCustomerKycStatus(document.customerId, admin, ipAddress);

    return updatedDocument;
  },

  /**
   * Admin: Get document stream for viewing or downloading with audit logging.
   */
  async getDocumentStreamForAdmin(
    documentId: string,
    admin: { id: string; fullName: string },
    ipAddress?: string,
    asAttachment = false
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
      include: { customer: true },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    const fileExists = await storageProvider.fileExists(document.storageKey);
    if (!fileExists) {
      throw new AppError(404, 'Document file not found in storage');
    }

    const stream = await storageProvider.getFileStream(document.storageKey);

    // Record audit log
    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: asAttachment ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_VIEWED',
      entity: 'LoanDocument',
      entityId: document.id,
      newValue: {
        adminId: admin.id,
        customerId: document.customerId,
        documentId: document.id,
        documentType: document.documentType,
        version: document.version,
        action: asAttachment ? 'DOCUMENT_DOWNLOADED' : 'DOCUMENT_VIEWED',
        timestamp: new Date().toISOString(),
      },
      ipAddress,
    });

    return {
      stream,
      mimeType: document.mimeType,
      fileName: document.fileName,
      fileSize: document.fileSize,
      document,
    };
  },

  /**
   * Admin: Generates a secure ZIP archive of a customer's documents.
   * Strict IDOR protection: only documents belonging to customerId are included.
   */
  async generateCustomerDocumentsZip(
    customerId: string,
    documentIds?: string[],
    admin?: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    // Query documents
    let docs: Array<any>;
    if (documentIds && documentIds.length > 0) {
      docs = await prisma.loanDocument.findMany({
        where: {
          id: { in: documentIds },
        },
      });

      // Strict IDOR Check: Ensure EVERY document belongs to customerId
      const unauthorizedDoc = docs.find((d) => d.customerId !== customerId);
      if (unauthorizedDoc || docs.length !== documentIds.length) {
        throw new AppError(403, 'Forbidden: One or more requested documents do not belong to this customer');
      }
    } else {
      // All current documents for this customer
      docs = await prisma.loanDocument.findMany({
        where: {
          customerId,
          isCurrentVersion: true,
        },
        orderBy: { uploadedAt: 'desc' },
      });
    }

    if (docs.length === 0) {
      throw new AppError(404, 'No documents available for this customer to download');
    }

    // Create ZIP archive
    const { ZipArchive } = (await import('archiver')) as any;
    const archive = new ZipArchive({
      zlib: { level: 9 },
    });

    // Queue files into ZIP archive
    for (const doc of docs) {
      const exists = await storageProvider.fileExists(doc.storageKey);
      if (exists) {
        const fileStream = await storageProvider.getFileStream(doc.storageKey);
        const safeDocType = doc.documentType.replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeFileName = `${safeDocType}_v${doc.version}_${doc.fileName}`;
        archive.append(fileStream, { name: safeFileName });
      }
    }

    // Audit log
    if (admin) {
      await auditService.record({
        actorType: 'ADMIN',
        actorId: admin.id,
        actorName: admin.fullName,
        action: 'DOCUMENTS_BULK_DOWNLOADED',
        entity: 'Customer',
        entityId: customer.id,
        newValue: {
          adminId: admin.id,
          customerId: customer.id,
          documentCount: docs.length,
          documentIds: docs.map((d) => d.id),
          action: 'DOCUMENTS_BULK_DOWNLOADED',
          timestamp: new Date().toISOString(),
        },
        ipAddress,
      });
    }

    const safeCustomerName = customer.fullName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const zipFileName = `Customer_Documents_${safeCustomerName}_${customerId.slice(0, 8)}.zip`;

    return {
      archive,
      zipFileName,
      count: docs.length,
    };
  },

  /**
   * Explicitly submits customer KYC for verification.
   * Enforces that both AADHAAR_FRONT and AADHAAR_BACK are uploaded.
   */
  async submitCustomerKyc(customerId: string, ipAddress?: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        documents: {
          where: { isCurrentVersion: true },
        },
      },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer record not found');
    }

    const frontDoc = customer.documents.find(
      (d) => d.documentType === 'AADHAAR_FRONT' && d.status !== 'REJECTED'
    );
    const backDoc = customer.documents.find(
      (d) => d.documentType === 'AADHAAR_BACK' && d.status !== 'REJECTED'
    );

    if (!frontDoc || !backDoc) {
      throw new AppError(
        400,
        'Both Aadhaar Front and Aadhaar Back documents must be uploaded before submitting KYC for verification.'
      );
    }

    // Set customer KYC status to UNDER_REVIEW (Pending Verification)
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: { kycStatus: 'UNDER_REVIEW' },
    });

    // Mark active Aadhaar docs as UNDER_REVIEW if they were PENDING or REUPLOAD_REQUIRED
    await prisma.loanDocument.updateMany({
      where: {
        customerId,
        isCurrentVersion: true,
        documentType: { in: ['AADHAAR_FRONT', 'AADHAAR_BACK'] },
        status: { in: ['PENDING', 'REUPLOAD_REQUIRED'] },
      },
      data: { status: 'UNDER_REVIEW' },
    });

    // Note: KYC Verification Charge is created ONLY after explicit Admin KYC approval,
    // not upon submission when documents are still UNDER_REVIEW.

    // Record audit event
    await auditService.record({
      actorType: 'CUSTOMER',
      actorId: customerId,
      actorName: customer.fullName,
      action: 'KYC_SUBMITTED',
      entity: 'Customer',
      entityId: customerId,
      previousValue: { kycStatus: customer.kycStatus },
      newValue: { kycStatus: 'UNDER_REVIEW' },
      ipAddress,
    });

    return {
      customerId: updatedCustomer.id,
      kycStatus: updatedCustomer.kycStatus,
      statusLabel: 'Pending Verification',
      kycCharge: null,
      submittedAt: new Date(),
    };
  },

  /**
   * Activates the KYC Verification Charge for a customer upon submitting Aadhaar documents.
   */
  async ensureKycChargeActivated(customerId: string, loanId?: string) {
    const existing = await prisma.charge.findFirst({
      where: {
        customerId,
        OR: [
          { name: { contains: 'KYC' } },
          { remark: { contains: 'KYC' } },
        ],
      },
    });

    if (!existing) {
      const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
      const kycAmount = paymentConfig?.kycChargeAmount || 499;

      const latestLoan = await prisma.loanApplication.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });

      return await prisma.charge.create({
        data: {
          name: 'KYC Verification Charge',
          amount: kycAmount,
          type: 'FIXED',
          isMandatory: true,
          isActive: true,
          status: 'PENDING',
          customerId,
          loanId: loanId || latestLoan?.id || null,
          remark: 'Mandatory KYC Verification Fee',
          sentAt: new Date(),
        },
      });
    }

    return existing;
  },

  /**
   * Activates the Processing Fee charge ONLY after all required loan documents
   * (PAN, BANK_STATEMENT, INCOME_PROOF) have been uploaded.
   */
  async checkAndActivateProcessingFee(customerId: string, loanId?: string) {
    const requiredDocs = ['PAN', 'BANK_STATEMENT', 'INCOME_PROOF'];
    const activeDocs = await prisma.loanDocument.findMany({
      where: {
        customerId,
        isCurrentVersion: true,
        documentType: { in: requiredDocs },
        status: { notIn: ['REJECTED', 'REUPLOAD_REQUIRED'] },
      },
    });

    const hasAll = requiredDocs.every((t) => activeDocs.some((d) => d.documentType === t));
    if (hasAll) {
      const existingProcFee = await prisma.charge.findFirst({
        where: {
          customerId,
          name: { contains: 'Processing' },
        },
      });

      if (!existingProcFee) {
        const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
        const procAmount = paymentConfig?.processingFeeAmount || 1999;

        const latestLoan = await prisma.loanApplication.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });

        return await prisma.charge.create({
          data: {
            name: 'Processing Fee',
            amount: procAmount,
            type: 'FIXED',
            isMandatory: true,
            isActive: true,
            status: 'PENDING',
            customerId,
            loanId: loanId || latestLoan?.id || null,
            remark: 'Standard Pre-Loan Underwriting Processing Fee',
            sentAt: new Date(),
          },
        });
      }
      return existingProcFee;
    }
    return null;
  },
};


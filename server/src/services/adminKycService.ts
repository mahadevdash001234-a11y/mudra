import { prisma } from './db';
import { AppError } from '../middleware/errorHandler';
import { auditService } from './auditService';
import { DocumentType } from '../validators/documentValidators';
import { specificChargesService } from './specificChargesService';

export const adminKycService = {
  /**
   * Lists customers with their KYC progress, document statistics, and search/filter capabilities.
   */
  async listKycCustomers(filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      isDeleted: false,
    };

    if (filters.status && filters.status !== 'ALL') {
      const s = filters.status.toUpperCase();
      if (s === 'PENDING_VERIFICATION') {
        where.kycStatus = { in: ['PENDING', 'UNDER_REVIEW', 'NOT_SUBMITTED', 'REUPLOAD_REQUIRED'] };
        where.OR = [
          {
            charges: {
              some: {
                AND: [
                  { OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }] },
                  {
                    OR: [
                      { status: 'PAID' },
                      { status: 'UNDER_VERIFICATION' },
                      { NOT: { transactionRef: null } },
                    ],
                  },
                ],
              },
            },
          },
          {
            payments: {
              some: {
                status: { in: ['PAID', 'SUCCESS', 'UNDER_VERIFICATION'] },
                OR: [
                  { paymentType: 'KYC_CHARGES' },
                  { notes: { contains: 'KYC' } },
                ],
              },
            },
          },
        ];
      } else if (s === 'PAYMENT_PENDING') {
        where.kycStatus = { in: ['PENDING', 'UNDER_REVIEW', 'NOT_SUBMITTED', 'REUPLOAD_REQUIRED'] };
        where.charges = {
          some: {
            OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
            status: { not: 'PAID' },
            transactionRef: null,
          },
        };
      } else if (s === 'PENDING_APPROVAL') {
        where.kycStatus = { in: ['PENDING', 'UNDER_REVIEW'] };
      } else if (s === 'VERIFIED') {
        where.kycStatus = { in: ['APPROVED', 'VERIFIED'] };
        where.documents = {
          some: {
            documentType: 'AADHAAR_FRONT',
            status: 'APPROVED',
            isCurrentVersion: true,
          },
        };
        where.AND = [
          {
            documents: {
              some: {
                documentType: 'AADHAAR_BACK',
                status: 'APPROVED',
                isCurrentVersion: true,
              },
            },
          },
        ];
      } else if (s === 'REJECTED') {
        where.kycStatus = 'REJECTED';
      } else if (s === 'CORRECTION_REQUIRED' || s === 'REUPLOAD_REQUIRED') {
        where.kycStatus = 'REUPLOAD_REQUIRED';
      } else {
        where.kycStatus = filters.status;
      }
    }

    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim();
      const searchCond = [
        { fullName: { contains: term } },
        { mobile: { contains: term } },
        { email: { contains: term } },
        { state: { contains: term } },
      ];
      if (where.OR) {
        const existingOr = where.OR;
        delete where.OR;
        where.AND = [{ OR: existingOr }, { OR: searchCond }];
      } else {
        where.OR = searchCond;
      }
    }

    const [
      total,
      customers,
      allCount,
      pendingVerificationCount,
      pendingApprovalCount,
      verifiedCount,
      rejectedCount,
      correctionRequiredCount,
      paymentPendingCount,
    ] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          fullName: true,
          mobile: true,
          email: true,
          state: true,
          city: true,
          aadhaarMasked: true,
          panMasked: true,
          status: true,
          kycStatus: true,
          createdAt: true,
          updatedAt: true,
          loans: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              applicationNumber: true,
              loanType: true,
              status: true,
              requestedAmount: true,
            },
          },
          charges: {
            where: {
              OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
            },
            orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
            select: {
              id: true,
              name: true,
              amount: true,
              status: true,
              transactionRef: true,
              paidAt: true,
              paymentId: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          payments: {
            where: {
              OR: [
                { paymentType: 'KYC_CHARGES' },
                { notes: { contains: 'KYC' } },
                { status: { in: ['UNDER_VERIFICATION', 'PAID', 'SUCCESS'] } },
              ],
            },
            orderBy: [{ paymentDate: 'desc' }],
            select: {
              id: true,
              amount: true,
              status: true,
              transactionRef: true,
              paymentType: true,
              notes: true,
              verifiedAt: true,
              verifiedBy: true,
              paymentDate: true,
            },
          },
          documents: {
            where: { isCurrentVersion: true },
            select: {
              id: true,
              documentType: true,
              fileName: true,
              mimeType: true,
              status: true,
              uploadedAt: true,
              rejectionReason: true,
            },
          },
        },
      }),
      prisma.customer.count({ where: { isDeleted: false } }),
      prisma.customer.count({
        where: {
          isDeleted: false,
          kycStatus: { in: ['PENDING', 'UNDER_REVIEW'] },
          OR: [
            {
              charges: {
                some: {
                  AND: [
                    { OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }] },
                    {
                      OR: [
                        { status: 'PAID' },
                        { NOT: { transactionRef: null } },
                      ],
                    },
                  ],
                },
              },
            },
            {
              payments: {
                some: {
                  status: { in: ['PAID', 'SUCCESS', 'UNDER_VERIFICATION'] },
                  OR: [
                    { paymentType: 'KYC_CHARGES' },
                    { notes: { contains: 'KYC' } },
                  ],
                },
              },
            },
          ],
        },
      }),
      prisma.customer.count({
        where: { isDeleted: false, kycStatus: { in: ['PENDING', 'UNDER_REVIEW'] } },
      }),
      prisma.customer.count({
        where: {
          isDeleted: false,
          kycStatus: { in: ['APPROVED', 'VERIFIED'] },
          documents: {
            some: {
              documentType: 'AADHAAR_FRONT',
              status: 'APPROVED',
              isCurrentVersion: true,
            },
          },
          AND: [
            {
              documents: {
                some: {
                  documentType: 'AADHAAR_BACK',
                  status: 'APPROVED',
                  isCurrentVersion: true,
                },
              },
            },
          ],
        },
      }),
      prisma.customer.count({
        where: { isDeleted: false, kycStatus: 'REJECTED' },
      }),
      prisma.customer.count({
        where: { isDeleted: false, kycStatus: 'REUPLOAD_REQUIRED' },
      }),
      prisma.customer.count({
        where: {
          isDeleted: false,
          kycStatus: { in: ['PENDING', 'UNDER_REVIEW'] },
          charges: {
            some: {
              OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
              status: { not: 'PAID' },
              transactionRef: null,
            },
          },
          payments: {
            none: {
              status: { in: ['PAID', 'VERIFIED', 'UNDER_VERIFICATION'] },
              OR: [
                { paymentType: 'KYC_CHARGES' },
                { notes: { contains: 'KYC' } },
              ],
            },
          },
        },
      }),
    ]);

    const formatted = customers.map((c) => {
      const kycDocs = c.documents.filter(
        (d) => d.documentType === 'AADHAAR_FRONT' || d.documentType === 'AADHAAR_BACK'
      );
      const totalDocs = kycDocs.length;
      const approvedDocs = kycDocs.filter((d) => d.status === 'APPROVED').length;
      const pendingDocs = kycDocs.filter(
        (d) => d.status === 'PENDING' || d.status === 'UNDER_REVIEW'
      ).length;
      const reuploadRequiredDocs = kycDocs.filter(
        (d) => d.status === 'REUPLOAD_REQUIRED'
      ).length;
      const rejectedDocs = kycDocs.filter((d) => d.status === 'REJECTED').length;

      const hasAadhaar =
        !!c.aadhaarMasked || c.documents.some((d) => d.documentType.startsWith('AADHAAR'));
      const kycType = hasAadhaar ? 'Aadhaar (Front + Back)' : 'Standard KYC';

      const latestLoan = c.loans[0] || null;

      // 1. Resolve KYC Charge: Prioritize PAID, then one with transactionRef, then most recent
      const paidCharge = c.charges.find((ch) => ch.status === 'PAID');
      const chargeWithUtr = c.charges.find((ch) => ch.transactionRef && ch.transactionRef.trim().length > 0);
      const kycCharge = paidCharge || chargeWithUtr || c.charges[0] || null;

      // 2. Resolve KYC Payment: Prioritize PAID/VERIFIED, then UNDER_VERIFICATION, then one with transactionRef
      const paidPayment = c.payments.find((p) => p.status === 'PAID' || p.status === 'VERIFIED');
      const paymentWithUtr = c.payments.find((p) => p.transactionRef && p.transactionRef.trim().length > 0);
      const kycPayment = paidPayment || paymentWithUtr || c.payments[0] || null;

      // 3. Resolve Effective UTR & Payment Status
      const utr = (kycCharge?.transactionRef?.trim() || kycPayment?.transactionRef?.trim() || null);
      const hasUtr = Boolean(utr && utr.length > 0);
      const isKycFeePaid = Boolean(
        kycCharge?.status === 'PAID' ||
        kycPayment?.status === 'PAID' ||
        kycPayment?.status === 'VERIFIED'
      );

      // Payment Status semantics:
      // 'NOT_SUBMITTED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'
      const paymentStatus = isKycFeePaid
        ? 'VERIFIED'
        : hasUtr
        ? 'PENDING_VERIFICATION'
        : (kycCharge?.status === 'FAILED' || kycCharge?.status === 'REJECTED' || kycPayment?.status === 'REJECTED')
        ? 'REJECTED'
        : 'NOT_SUBMITTED';

      const kycPaymentStatus = isKycFeePaid
        ? 'PAID'
        : hasUtr
        ? 'UNDER_VERIFICATION'
        : (kycCharge?.status === 'FAILED' || kycCharge?.status === 'REJECTED' || kycPayment?.status === 'REJECTED')
        ? 'REJECTED'
        : 'NOT_PAID';

      const utrStatus = isKycFeePaid
        ? 'VERIFIED'
        : hasUtr
        ? 'SUBMITTED'
        : 'NOT_SUBMITTED';

      // Authoritative KYC Status calculation:
      // KYC can ONLY be APPROVED/VERIFIED if ALL required documents (AADHAAR_FRONT & AADHAAR_BACK)
      // exist and are individually APPROVED. If 0 docs or unapproved, it can NEVER be VERIFIED.
      let authoritativeKycStatus = c.kycStatus;
      if (authoritativeKycStatus === 'APPROVED' || authoritativeKycStatus === 'VERIFIED') {
        const hasFrontApproved = kycDocs.some(
          (d) => d.documentType === 'AADHAAR_FRONT' && d.status === 'APPROVED'
        );
        const hasBackApproved = kycDocs.some(
          (d) => d.documentType === 'AADHAAR_BACK' && d.status === 'APPROVED'
        );
        if (!hasFrontApproved || !hasBackApproved) {
          authoritativeKycStatus = totalDocs === 0 ? 'PENDING' : 'UNDER_REVIEW';
          prisma.customer
            .update({
              where: { id: c.id },
              data: { kycStatus: authoritativeKycStatus },
            })
            .catch(() => {});
        }
      }

      return {
        id: c.id,
        fullName: c.fullName,
        mobile: c.mobile,
        email: c.email,
        state: c.state,
        city: c.city,
        aadhaarMasked: c.aadhaarMasked,
        panMasked: c.panMasked,
        accountStatus: c.status,
        kycStatus: authoritativeKycStatus,
        isKycFeePaid,
        hasUtr,
        utr,
        utrSubmitted: hasUtr,
        paymentStatus,
        kycPaymentStatus,
        utrStatus,
        kycChargeStatus: isKycFeePaid ? 'PAID' : (kycCharge?.status || 'PENDING'),
        kycChargeAmount: kycCharge?.amount || kycPayment?.amount || 500,
        kycChargeId: kycCharge?.id || null,
        kycPaymentId: kycPayment?.id || kycCharge?.paymentId || null,
        kycType,
        applicationId: latestLoan?.applicationNumber || 'N/A',
        loanId: latestLoan?.id || null,
        loanType: latestLoan?.loanType || 'Personal Loan',
        loanStatus: latestLoan?.status || null,
        requestedAmount: latestLoan?.requestedAmount || null,
        submittedAt: c.documents[0]?.uploadedAt || c.updatedAt || c.createdAt,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        documents: c.documents,
        docStats: {
          total: totalDocs,
          approved: approvedDocs,
          pending: pendingDocs,
          reuploadRequired: reuploadRequiredDocs,
          rejected: rejectedDocs,
        },
      };
    });

    return {
      customers: formatted,
      counts: {
        all: allCount,
        pendingVerification: pendingVerificationCount,
        pendingApproval: pendingApprovalCount,
        paymentPending: paymentPendingCount,
        verified: verifiedCount,
        rejected: rejectedCount,
        correctionRequired: correctionRequiredCount,
      },
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Retrieves comprehensive KYC detail for an individual customer.
   */
  async getCustomerKycDetails(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        documents: {
          orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
        },
        documentRequests: {
          orderBy: { createdAt: 'desc' },
        },
        charges: {
          where: {
            OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
          },
          orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
          select: {
            id: true,
            name: true,
            amount: true,
            status: true,
            transactionRef: true,
            paidAt: true,
            paymentId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        payments: {
          where: {
            OR: [
              { paymentType: 'KYC_CHARGES' },
              { notes: { contains: 'KYC' } },
              { status: { in: ['UNDER_VERIFICATION', 'PAID', 'SUCCESS'] } },
            ],
          },
          orderBy: [{ paymentDate: 'desc' }],
          select: {
            id: true,
            amount: true,
            status: true,
            transactionRef: true,
            paymentType: true,
            notes: true,
            verifiedAt: true,
            verifiedBy: true,
            paymentDate: true,
          },
        },
      },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer record not found');
    }

    // Separate active versions from historical archived versions (KYC identity documents only: AADHAAR_FRONT, AADHAAR_BACK)
    const isKycDoc = (d: { documentType: string }) =>
      d.documentType === 'AADHAAR_FRONT' || d.documentType === 'AADHAAR_BACK';
    const activeDocuments = customer.documents.filter((d) => d.isCurrentVersion && isKycDoc(d));
    const documentHistory = customer.documents.filter((d) => !d.isCurrentVersion && isKycDoc(d));

    // 1. Resolve KYC Charge: Prioritize PAID, then one with transactionRef, then most recent
    const paidCharge = customer.charges.find((ch) => ch.status === 'PAID');
    const chargeWithUtr = customer.charges.find((ch) => ch.transactionRef && ch.transactionRef.trim().length > 0);
    const kycCharge = paidCharge || chargeWithUtr || customer.charges[0] || null;

    // 2. Resolve KYC Payment: Prioritize PAID/VERIFIED, then UNDER_VERIFICATION, then one with transactionRef
    const paidPayment = customer.payments.find((p) => p.status === 'PAID' || p.status === 'VERIFIED');
    const paymentWithUtr = customer.payments.find((p) => p.transactionRef && p.transactionRef.trim().length > 0);
    const kycPayment = paidPayment || paymentWithUtr || customer.payments[0] || null;

    const utr = (kycCharge?.transactionRef?.trim() || kycPayment?.transactionRef?.trim() || null);
    const hasUtr = Boolean(utr && utr.length > 0);
    const isKycFeePaid = Boolean(
      kycCharge?.status === 'PAID' ||
      kycPayment?.status === 'PAID' ||
      kycPayment?.status === 'VERIFIED'
    );

    const paymentStatus = isKycFeePaid
      ? 'PAID / Verified'
      : hasUtr
      ? 'Pending Verification'
      : 'Payment Required';

    // Authoritative KYC Status calculation:
    let authoritativeKycStatus = customer.kycStatus;
    if (authoritativeKycStatus === 'APPROVED' || authoritativeKycStatus === 'VERIFIED') {
      const hasFrontApproved = activeDocuments.some(
        (d) => d.documentType === 'AADHAAR_FRONT' && d.status === 'APPROVED'
      );
      const hasBackApproved = activeDocuments.some(
        (d) => d.documentType === 'AADHAAR_BACK' && d.status === 'APPROVED'
      );
      if (!hasFrontApproved || !hasBackApproved) {
        authoritativeKycStatus = activeDocuments.length === 0 ? 'PENDING' : 'UNDER_REVIEW';
        prisma.customer
          .update({
            where: { id: customer.id },
            data: { kycStatus: authoritativeKycStatus },
          })
          .catch(() => {});
      }
    }

    return {
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        mobile: customer.mobile,
        email: customer.email,
        address: customer.address,
        state: customer.state,
        city: customer.city,
        monthlyIncome: customer.monthlyIncome,
        aadhaarMasked: customer.aadhaarMasked,
        accountStatus: customer.status,
        kycStatus: authoritativeKycStatus,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      kycPayment: {
        chargeId: kycCharge?.id || null,
        paymentId: kycPayment?.id || kycCharge?.paymentId || null,
        amount: kycCharge?.amount || kycPayment?.amount || 500,
        utr: utr || 'Not Provided',
        hasUtr,
        status: isKycFeePaid ? 'PAID' : (kycCharge?.status || kycPayment?.status || 'PENDING'),
        isPaid: isKycFeePaid,
        paymentStatus,
      },
      documents: activeDocuments.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        status: d.status,
        version: d.version,
        rejectionReason: d.rejectionReason,
        reviewedBy: d.reviewedBy,
        reviewedAt: d.reviewedAt,
        uploadedAt: d.uploadedAt,
      })),
      documentHistory: documentHistory.map((d) => ({
        id: d.id,
        documentType: d.documentType,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        status: d.status,
        version: d.version,
        rejectionReason: d.rejectionReason,
        reviewedBy: d.reviewedBy,
        reviewedAt: d.reviewedAt,
        uploadedAt: d.uploadedAt,
      })),
      pendingRequests: customer.documentRequests.map((r) => ({
        id: r.id,
        documentType: r.documentType,
        title: r.title,
        description: r.description,
        status: r.status,
        requestedBy: r.requestedBy,
        createdAt: r.createdAt,
      })),
    };
  },

  /**
   * Reviews a specific customer document (Approve, Reject, or Request Re-upload).
   */
  async reviewDocument(
    admin: { id: string; fullName: string },
    documentId: string,
    action: 'APPROVE' | 'REJECT' | 'REQUEST_REUPLOAD',
    reason?: string,
    ipAddress?: string
  ) {
    const document = await prisma.loanDocument.findUnique({
      where: { id: documentId },
      include: { customer: true },
    });

    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    let newStatus: string;
    let auditAction: string;

    if (action === 'APPROVE') {
      newStatus = 'APPROVED';
      auditAction = 'DOCUMENT_APPROVED';
    } else if (action === 'REJECT') {
      newStatus = 'REJECTED';
      auditAction = 'DOCUMENT_REJECTED';
    } else {
      newStatus = 'REUPLOAD_REQUIRED';
      auditAction = 'DOCUMENT_REUPLOAD_REQUESTED';
    }

    const updatedDocument = await prisma.loanDocument.update({
      where: { id: documentId },
      data: {
        status: newStatus,
        rejectionReason: reason || null,
        reviewedBy: admin.fullName,
        reviewedAt: new Date(),
      },
    });

    // Record audit event
    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: auditAction,
      entity: 'LoanDocument',
      entityId: document.id,
      previousValue: {
        status: document.status,
        rejectionReason: document.rejectionReason,
      },
      newValue: {
        status: newStatus,
        rejectionReason: reason || null,
        reviewedBy: admin.fullName,
      },
      ipAddress,
    });

    // Re-evaluate customer's overall KYC status
    await this.evaluateCustomerKycStatus(document.customerId, admin, ipAddress);

    return {
      id: updatedDocument.id,
      documentType: updatedDocument.documentType,
      status: updatedDocument.status,
      rejectionReason: updatedDocument.rejectionReason,
      reviewedBy: updatedDocument.reviewedBy,
      reviewedAt: updatedDocument.reviewedAt,
    };
  },

  /**
   * Re-evaluates customer overall KYC status based on current active document statuses.
   * Authoritative KYC Lifecycle Rules:
   * 1. If customer has 0 documents, KYC status can NEVER be APPROVED or VERIFIED (defaults to PENDING).
   * 2. If any active document requires correction/re-upload or pendingRequest exists, status is REUPLOAD_REQUIRED.
   * 3. If any active document is REJECTED, status is REJECTED.
   * 4. ALL required documents (AADHAAR_FRONT and AADHAAR_BACK) must exist, belong to customer,
   *    and have document-level status === 'APPROVED'.
   * 5. Only when ALL required documents are APPROVED can KYC status become APPROVED.
   * 6. KYC charge is activated ONLY when KYC status transitions to APPROVED.
   */
  async evaluateCustomerKycStatus(
    customerId: string,
    admin?: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        documents: {
          where: { isCurrentVersion: true },
        },
      },
    });

    if (!customer) return;

    const docs = customer.documents;
    const kycDocs = docs.filter(
      (d) => d.documentType === 'AADHAAR_FRONT' || d.documentType === 'AADHAAR_BACK'
    );
    const aadhaarFront = kycDocs.find((d) => d.documentType === 'AADHAAR_FRONT');
    const aadhaarBack = kycDocs.find((d) => d.documentType === 'AADHAAR_BACK');

    const pendingRequest = await prisma.documentRequest.findFirst({
      where: { customerId, status: 'PENDING' },
    });

    let targetKycStatus = customer.kycStatus;

    if (docs.length === 0) {
      // Rule: Customer with 0 documents can NEVER be VERIFIED or APPROVED
      targetKycStatus = 'PENDING';
    } else if (docs.some((d) => d.status === 'REUPLOAD_REQUIRED') || pendingRequest) {
      targetKycStatus = 'REUPLOAD_REQUIRED';
    } else if (docs.some((d) => d.status === 'REJECTED')) {
      targetKycStatus = 'REJECTED';
    } else if (!aadhaarFront || !aadhaarBack) {
      // Rule: Incomplete document uploads cannot transition beyond PENDING
      targetKycStatus = 'PENDING';
    } else {
      // Both required Aadhaar Front and Back exist
      const bothRequiredApproved =
        aadhaarFront.status === 'APPROVED' &&
        aadhaarBack.status === 'APPROVED';

      if (bothRequiredApproved) {
        targetKycStatus = 'APPROVED';
      } else if (customer.kycStatus === 'PENDING') {
        // Customer uploaded documents but has not yet submitted KYC for verification
        targetKycStatus = 'PENDING';
      } else {
        targetKycStatus = 'UNDER_REVIEW';
      }
    }

    if (targetKycStatus !== customer.kycStatus) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: targetKycStatus },
      });

      const auditAction =
        targetKycStatus === 'APPROVED'
          ? 'KYC_APPROVED'
          : targetKycStatus === 'REJECTED'
          ? 'KYC_REJECTED'
          : targetKycStatus === 'REUPLOAD_REQUIRED'
          ? 'KYC_CORRECTION_REQUESTED'
          : 'KYC_STATUS_UPDATED';

      await auditService.record({
        actorType: 'ADMIN',
        actorId: admin?.id,
        actorName: admin?.fullName || 'System Admin',
        action: auditAction,
        entity: 'Customer',
        entityId: customer.id,
        previousValue: { kycStatus: customer.kycStatus },
        newValue: { kycStatus: targetKycStatus },
        ipAddress,
      });

      if (targetKycStatus === 'APPROVED') {
        await this.ensureKycChargeActivated(customerId);
      }
    }
  },

  /**
   * Activates the KYC Verification Charge for a customer upon successful KYC approval.
   */
  async ensureKycChargeActivated(customerId: string) {
    const existing = await prisma.charge.findFirst({
      where: {
        customerId,
        OR: [
          { name: { contains: 'KYC' } },
          { remark: { contains: 'KYC' } },
        ],
      },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    });

    if (!existing) {
      const paymentConfig = await prisma.paymentConfig.findUnique({ where: { id: 'default' } });
      const kycAmount = paymentConfig?.kycChargeAmount || 499;

      const latestLoan = await prisma.loanApplication.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });

      await prisma.charge.create({
        data: {
          name: 'KYC Verification Charge',
          amount: kycAmount,
          type: 'FIXED',
          isMandatory: true,
          isActive: true,
          status: 'PENDING',
          customerId,
          loanId: latestLoan?.id || null,
          remark: 'Mandatory KYC Verification Fee',
          sentAt: new Date(),
        },
      });
    } else if (!existing.loanId) {
      const latestLoan = await prisma.loanApplication.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (latestLoan) {
        await prisma.charge.update({
          where: { id: existing.id },
          data: { loanId: latestLoan.id },
        });
      }
    }
  },

  /**
   * Requests an additional document from the customer.
   */
  async requestAdditionalDocument(
    admin: { id: string; fullName: string },
    customerId: string,
    data: { documentType: DocumentType; title: string; description?: string },
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer record not found');
    }

    const request = await prisma.documentRequest.create({
      data: {
        customerId,
        documentType: data.documentType,
        title: data.title,
        description: data.description || null,
        status: 'PENDING',
        requestedBy: admin.fullName,
      },
    });

    // Mark customer KYC status as REUPLOAD_REQUIRED so customer sees action needed
    if (customer.kycStatus !== 'REUPLOAD_REQUIRED') {
      await prisma.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'REUPLOAD_REQUIRED' },
      });
    }

    // Customer Notification
    try {
      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId: customer.id,
          title: `Additional KYC Document Requested: ${data.title}`,
          message: `Dear ${customer.fullName}, our verification team has requested an additional document (${data.documentType}): ${data.title}. ${data.description ? `Note: ${data.description}` : ''}`,
          eventType: 'KYC_STATUS',
        },
      });
    } catch {
      // Non-blocking notification
    }

    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: 'ADDITIONAL_DOCUMENT_REQUESTED',
      entity: 'DocumentRequest',
      entityId: request.id,
      newValue: {
        customerId,
        documentType: data.documentType,
        title: data.title,
        requestedBy: admin.fullName,
      },
      ipAddress,
    });

    return request;
  },

  /**
   * Explicitly sets customer KYC status with an admin audit record.
   */
  async overrideKycStatus(
    admin: { id: string; fullName: string },
    customerId: string,
    status: string,
    reason?: string,
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer || customer.isDeleted) {
      throw new AppError(404, 'Customer record not found');
    }

    const isApproval = status === 'APPROVED' || status === 'VERIFIED';

    if (isApproval) {
      // 1. Fetch required KYC documents from MySQL
      const requiredDocs = await prisma.loanDocument.findMany({
        where: {
          customerId,
          isCurrentVersion: true,
          documentType: { in: ['AADHAAR_FRONT', 'AADHAAR_BACK'] },
        },
      });

      const aadhaarFront = requiredDocs.find((d) => d.documentType === 'AADHAAR_FRONT');
      const aadhaarBack = requiredDocs.find((d) => d.documentType === 'AADHAAR_BACK');

      // 2. Verify both exist and belong to this customer
      if (!aadhaarFront || !aadhaarBack) {
        throw new AppError(
          400,
          'Cannot approve KYC: Both Aadhaar Front and Aadhaar Back must be uploaded.'
        );
      }

      // 3. Verify every required document has document-level APPROVED status
      if (aadhaarFront.status !== 'APPROVED' || aadhaarBack.status !== 'APPROVED') {
        throw new AppError(
          400,
          `Cannot approve KYC: All required documents must be individually reviewed and approved first. Aadhaar Front is ${aadhaarFront.status}, Aadhaar Back is ${aadhaarBack.status}.`
        );
      }

      // 4. Verify no pending document requests
      const pendingRequest = await prisma.documentRequest.findFirst({
        where: { customerId, status: 'PENDING' },
      });
      if (pendingRequest) {
        throw new AppError(
          400,
          `Cannot approve KYC: Additional document "${pendingRequest.title}" was requested and is still pending submission.`
        );
      }

      // 5. Verify no other active KYC documents are REJECTED or REUPLOAD_REQUIRED
      const blockingDoc = await prisma.loanDocument.findFirst({
        where: {
          customerId,
          isCurrentVersion: true,
          status: { in: ['REJECTED', 'REUPLOAD_REQUIRED'] },
        },
      });
      if (blockingDoc) {
        throw new AppError(
          400,
          `Cannot approve KYC: Document "${blockingDoc.documentType}" has status ${blockingDoc.status}. All documents must be resolved before KYC approval.`
        );
      }
    }

    const finalKycStatus = isApproval ? 'APPROVED' : status;

    await prisma.customer.update({
      where: { id: customerId },
      data: { kycStatus: finalKycStatus },
    });

    // Cascade document status if needed for KYC identity documents only
    const kycDocFilter = {
      customerId,
      isCurrentVersion: true,
      documentType: { in: ['AADHAAR_FRONT', 'AADHAAR_BACK'] },
      status: { in: ['PENDING', 'UNDER_REVIEW'] },
    };

    if (isApproval) {
      await this.ensureKycChargeActivated(customerId);
    } else if (status === 'REJECTED') {
      await prisma.loanDocument.updateMany({
        where: kycDocFilter,
        data: {
          status: 'REJECTED',
          reviewedBy: admin.fullName,
          reviewedAt: new Date(),
          rejectionReason: reason || 'KYC verification declined by compliance officer',
        },
      });
    } else if (status === 'REUPLOAD_REQUIRED') {
      await prisma.loanDocument.updateMany({
        where: kycDocFilter,
        data: {
          status: 'REUPLOAD_REQUIRED',
          reviewedBy: admin.fullName,
          reviewedAt: new Date(),
          rejectionReason: reason || 'Re-upload required',
        },
      });
    }

    // Customer Notification
    try {
      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId: customer.id,
          title:
            isApproval
              ? 'KYC Verification Approved'
              : status === 'REJECTED'
              ? 'KYC Verification Rejected'
              : 'KYC Document Correction Required',
          message:
            isApproval
              ? 'KYC verification completed successfully.'
              : status === 'REJECTED'
              ? `Dear ${customer.fullName}, your KYC verification was declined. Reason: ${reason || 'Does not meet verification criteria.'}`
              : `Dear ${customer.fullName}, action is required on your KYC documents. Reason: ${reason || 'Please re-upload a clear copy.'}`,
          eventType: 'KYC_STATUS',
        },
      });
    } catch {
      // Non-blocking notification
    }

    let auditAction = 'KYC_STATUS_UPDATED';
    if (isApproval) auditAction = 'KYC_APPROVED';
    else if (status === 'REJECTED') auditAction = 'KYC_REJECTED';
    else if (status === 'REUPLOAD_REQUIRED') auditAction = 'KYC_CORRECTION_REQUESTED';

    await auditService.record({
      actorType: 'ADMIN',
      actorId: admin.id,
      actorName: admin.fullName,
      action: auditAction,
      entity: 'Customer',
      entityId: customer.id,
      previousValue: { kycStatus: customer.kycStatus },
      newValue: { kycStatus: finalKycStatus, reason: reason || (isApproval ? 'KYC Verified' : undefined) },
      ipAddress,
    });

    return {
      customerId: customer.id,
      kycStatus: finalKycStatus,
    };
  },

  /**
   * DELETE /api/admin/kyc/:customerId
   *
   * KYC-ONLY reset. Removes the KYC submission from the verification queue by:
   *   1. Deleting KYC identity documents (AADHAAR_FRONT, AADHAAR_BACK, PAN) only.
   *   2. Resetting kycStatus to PENDING on the Customer record.
   *   3. Sending a re-submit KYC notification to the customer.
   *
   * DOES NOT delete the customer, loans, charges, payments, invoices, or any other data.
   */
  async resetKycSubmission(
    customerId: string,
    actor: { id: string; fullName: string },
    ipAddress?: string
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, isDeleted: false },
      select: { id: true, fullName: true, kycStatus: true },
    });

    if (!customer) {
      throw new AppError(404, 'Customer not found');
    }

    const kycDocumentTypes = ['AADHAAR_FRONT', 'AADHAAR_BACK', 'PAN'];

    await prisma.$transaction(async (tx) => {
      await tx.loanDocument.deleteMany({
        where: { customerId, documentType: { in: kycDocumentTypes } },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: { kycStatus: 'PENDING' },
      });
    });

    try {
      await prisma.notification.create({
        data: {
          recipientType: 'CUSTOMER',
          customerId,
          title: 'KYC Verification Required',
          message: `Dear ${customer.fullName}, your KYC submission has been removed by the admin. Please re-submit your KYC documents to continue the verification process.`,
          eventType: 'KYC_STATUS',
        },
      });
    } catch {
      // Non-blocking
    }

    await auditService.record({
      actorType: 'ADMIN',
      actorId: actor.id,
      actorName: actor.fullName,
      action: 'KYC_SUBMISSION_RESET',
      entity: 'Customer',
      entityId: customerId,
      previousValue: { kycStatus: customer.kycStatus },
      newValue: { kycStatus: 'PENDING', note: 'KYC documents deleted and status reset. Customer account preserved.' },
      ipAddress,
    });

    return {
      customerId: customer.id,
      kycStatus: 'PENDING',
      message: 'KYC submission removed. Customer account is intact. Customer can re-submit KYC.',
    };
  },
};

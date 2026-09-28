import { prisma } from '../services/db';

async function auditKycRecords() {
  console.log('===============================================================');
  console.log('       KYC DATA INTEGRITY AUDIT - CURRENT CUSTOMER RECORDS      ');
  console.log('===============================================================');

  const customers = await prisma.customer.findMany({
    where: { isDeleted: false },
    include: {
      documents: {
        where: { isCurrentVersion: true },
      },
      charges: {
        where: {
          OR: [{ name: { contains: 'KYC' } }, { remark: { contains: 'KYC' } }],
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
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total non-deleted customers found: ${customers.length}\n`);

  const inconsistentRecords: any[] = [];
  const validRecords: any[] = [];

  for (const c of customers) {
    const kycDocs = c.documents.filter(
      (d) => d.documentType === 'AADHAAR_FRONT' || d.documentType === 'AADHAAR_BACK'
    );
    const frontDoc = kycDocs.find((d) => d.documentType === 'AADHAAR_FRONT');
    const backDoc = kycDocs.find((d) => d.documentType === 'AADHAAR_BACK');

    const paidCharge = c.charges.find((ch) => ch.status === 'PAID');
    const chargeWithUtr = c.charges.find((ch) => ch.transactionRef && ch.transactionRef.trim().length > 0);
    const kycCharge = paidCharge || chargeWithUtr || c.charges[0] || null;

    const paidPayment = c.payments.find((p) => p.status === 'PAID' || p.status === 'VERIFIED');
    const paymentWithUtr = c.payments.find((p) => p.transactionRef && p.transactionRef.trim().length > 0);
    const kycPayment = paidPayment || paymentWithUtr || c.payments[0] || null;

    const utr = kycCharge?.transactionRef?.trim() || kycPayment?.transactionRef?.trim() || null;
    const isPaid = Boolean(
      kycCharge?.status === 'PAID' ||
      kycPayment?.status === 'PAID' ||
      kycPayment?.status === 'VERIFIED'
    );
    const paymentStatus = isPaid ? 'PAID' : (utr ? 'UNDER_VERIFICATION' : (kycCharge?.status || 'NOT_PAID'));

    const docStatuses = {
      front: frontDoc ? frontDoc.status : 'MISSING',
      back: backDoc ? backDoc.status : 'MISSING',
    };

    const isVerified = c.kycStatus === 'APPROVED' || c.kycStatus === 'VERIFIED';
    const allRequiredApproved = frontDoc?.status === 'APPROVED' && backDoc?.status === 'APPROVED';

    let inconsistencyReason: string | null = null;
    if (isVerified && kycDocs.length === 0) {
      inconsistencyReason = 'VERIFIED with 0 documents';
    } else if (isVerified && (!frontDoc || !backDoc)) {
      inconsistencyReason = 'VERIFIED with missing Aadhaar Front or Back';
    } else if (isVerified && !allRequiredApproved) {
      inconsistencyReason = `VERIFIED but documents not all APPROVED (Front: ${docStatuses.front}, Back: ${docStatuses.back})`;
    }

    const summaryItem = {
      customerId: c.id,
      customerName: c.fullName,
      mobile: c.mobile,
      kycStatus: c.kycStatus,
      requiredDocCount: kycDocs.length,
      docStatuses,
      paymentStatus,
      utrStatus: utr ? `SUBMITTED (${utr})` : 'NOT_SUBMITTED',
      inconsistencyReason,
    };

    if (inconsistencyReason) {
      inconsistentRecords.push(summaryItem);
    } else {
      validRecords.push(summaryItem);
    }
  }

  console.log('--- INCONSISTENT CUSTOMERS ---');
  if (inconsistentRecords.length === 0) {
    console.log('None found! All records are consistent.');
  } else {
    console.table(inconsistentRecords);
  }

  console.log('\n--- VALID / CONSISTENT CUSTOMERS ---');
  console.table(validRecords);

  console.log('\n===============================================================');
  console.log(`Summary: ${inconsistentRecords.length} inconsistent, ${validRecords.length} consistent`);
  console.log('===============================================================');

  await prisma.$disconnect();
}

auditKycRecords().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});

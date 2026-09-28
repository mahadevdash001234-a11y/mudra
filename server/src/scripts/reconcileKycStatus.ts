import { prisma } from '../services/db';

async function reconcileKycStatuses() {
  console.log('Starting KYC status reconciliation for inconsistent customer records...');

  const customers = await prisma.customer.findMany({
    where: {
      isDeleted: false,
      kycStatus: { in: ['APPROVED', 'VERIFIED'] },
    },
    include: {
      documents: {
        where: { isCurrentVersion: true },
      },
    },
  });

  console.log(`Found ${customers.length} customers with kycStatus in ['APPROVED', 'VERIFIED']. Checking document integrity...`);

  let reconciledCount = 0;

  for (const c of customers) {
    const kycDocs = c.documents.filter(
      (d) => d.documentType === 'AADHAAR_FRONT' || d.documentType === 'AADHAAR_BACK'
    );
    const hasFrontApproved = kycDocs.some(
      (d) => d.documentType === 'AADHAAR_FRONT' && d.status === 'APPROVED'
    );
    const hasBackApproved = kycDocs.some(
      (d) => d.documentType === 'AADHAAR_BACK' && d.status === 'APPROVED'
    );

    if (!hasFrontApproved || !hasBackApproved) {
      const newStatus = kycDocs.length === 0 ? 'PENDING' : 'UNDER_REVIEW';
      await prisma.customer.update({
        where: { id: c.id },
        data: { kycStatus: newStatus },
      });
      console.log(`Reconciled customer ${c.fullName} (${c.id}): ${c.kycStatus} -> ${newStatus} (docs count: ${kycDocs.length})`);
      reconciledCount++;
    }
  }

  console.log(`\nReconciliation complete! Reconciled ${reconciledCount} records.`);
  await prisma.$disconnect();
}

reconcileKycStatuses().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});

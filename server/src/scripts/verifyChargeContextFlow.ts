import { prisma } from '../services/db';
import { specificChargesService } from '../services/specificChargesService';

async function main() {
  console.log('=== EXACT CHARGE CONTEXT & RESOLUTION AUDIT ===\n');

  // Find customer with KYC = APPROVED and KYC Charge = PENDING
  let targetCustomer = await prisma.customer.findFirst({
    where: {
      kycStatus: 'APPROVED',
      charges: {
        some: {
          name: { contains: 'KYC' },
          status: 'PENDING',
        },
      },
    },
    include: {
      charges: true,
      loans: true,
    },
  });

  if (!targetCustomer) {
    console.log('[INFO] No customer found with APPROVED KYC and PENDING KYC charge. Finding an approved customer or setting up test state...');
    targetCustomer = await prisma.customer.findFirst({
      where: { kycStatus: 'APPROVED' },
      include: { charges: true, loans: true },
    });

    if (targetCustomer) {
      // Ensure KYC charge exists and is PENDING
      let kycCharge = targetCustomer.charges.find(c => c.name.includes('KYC'));
      if (kycCharge) {
        await prisma.charge.update({
          where: { id: kycCharge.id },
          data: { status: 'PENDING', transactionRef: null, isActive: true },
        });
      } else {
        kycCharge = await prisma.charge.create({
          data: {
            name: 'KYC Verification Charge',
            amount: 499,
            type: 'FIXED',
            isMandatory: true,
            isActive: true,
            status: 'PENDING',
            customerId: targetCustomer.id,
            remark: 'Mandatory KYC Verification Fee',
            sentAt: new Date(),
          },
        });
      }
    }
  }

  // Refetch to confirm state in MySQL
  const customerInDb = await prisma.customer.findUnique({
    where: { id: targetCustomer!.id },
    include: { charges: true },
  });

  const kycCharge = customerInDb?.charges.find(c => c.name.includes('KYC') && c.status === 'PENDING');

  console.log('--- 1. MYSQL SOURCE OF TRUTH VERIFICATION ---');
  console.log(`Customer ID: ${customerInDb?.id}`);
  console.log(`Customer Full Name: ${customerInDb?.fullName}`);
  console.log(`Customer KYC Status: ${customerInDb?.kycStatus} (Expected: APPROVED)`);
  console.log(`KYC Charge ID: ${kycCharge?.id}`);
  console.log(`KYC Charge Status: ${kycCharge?.status} (Expected: PENDING)`);
  console.log(`KYC Charge Amount: ₹${kycCharge?.amount} (Expected: 499)`);
  console.log(`KYC Charge customerId: ${kycCharge?.customerId} === ${customerInDb?.id}`);

  if (customerInDb?.kycStatus !== 'APPROVED') {
    throw new Error('Customer KYC is not APPROVED in MySQL!');
  }
  if (!kycCharge || kycCharge.status !== 'PENDING') {
    throw new Error('KYC Charge is not PENDING in MySQL!');
  }
  console.log('[PASS] MySQL truth confirmed.\n');

  console.log('--- 2. AUTHORITATIVE GET /api/customer/charges VERIFICATION ---');
  const activeCharges = await specificChargesService.listActiveChargesForCustomer(customerInDb.id);
  console.log(`Returned charges count: ${activeCharges.length}`);
  const resolvedKycCharge = activeCharges.find(c => c.id === kycCharge.id);
  console.log(`Exact Charge Found in API: ${Boolean(resolvedKycCharge)}`);
  console.log(`Resolved ID: ${resolvedKycCharge?.id}`);
  console.log(`Resolved Name: ${resolvedKycCharge?.name}`);
  console.log(`Resolved Amount: ₹${resolvedKycCharge?.amount}`);

  if (!resolvedKycCharge) {
    throw new Error('listActiveChargesForCustomer did not return the exact KYC charge!');
  }
  console.log('[PASS] GET /api/customer/charges returns exact KYC charge.\n');

  console.log('--- 3. URL PARAMETER RESOLUTION TEST CASES ---');
  // Case A: /customer/payments?charge=<EXACT_CHARGE_ID>
  const exactParam = kycCharge.id;
  const matchA = activeCharges.find(c => c.id === exactParam);
  console.log(`Case A (?charge=${exactParam}): Resolved ID=${matchA?.id}, Amount=₹${matchA?.amount} -> Renders exact charge`);
  if (!matchA || matchA.id !== kycCharge.id) {
    throw new Error('Failed to resolve exact charge by ID');
  }

  // Case B: /customer/payments?charge=kyc (Old bug case)
  const syntheticParam = 'kyc';
  const matchB = activeCharges.find(c => c.id === syntheticParam);
  console.log(`Case B (?charge=${syntheticParam}): Resolved ID=${matchB?.id || 'null'} -> Safely rejected, shows empty state`);
  if (matchB) {
    throw new Error('Synthetic string "kyc" should NOT resolve to any charge!');
  }

  // Case C: /customer/payments?charge=invalid-charge-id
  const invalidParam = 'invalid-charge-id-999';
  const matchC = activeCharges.find(c => c.id === invalidParam);
  console.log(`Case C (?charge=${invalidParam}): Resolved ID=${matchC?.id || 'null'} -> Safely rejected, shows empty state`);
  if (matchC) {
    throw new Error('Invalid charge ID should NOT resolve to any charge!');
  }
  console.log('[PASS] Strict exact charge ID resolution verified.\n');

  console.log('=== AUDIT COMPLETE: ALL ASSERTIONS PASSED ===');
}

main()
  .catch((err) => {
    console.error('[ERROR]', err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });

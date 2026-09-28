import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/services/db';
import { adminCustomerService } from '../src/services/adminCustomerService';
import { loanApplicationService } from '../src/services/loanApplicationService';
import { paymentService } from '../src/services/paymentService';

describe('Safe Data-Management & Destructive Action Safeguards Test Suite', () => {
  const dummyActor = {
    id: 'test-admin-super-id',
    email: 'admin@loanapprove.com',
    fullName: 'Super Admin Test',
    role: 'SUPER_ADMIN',
  };

  beforeAll(async () => {
    // Ensure clean state for test dummy records
    await prisma.payment.deleteMany({ where: { notes: { contains: 'TEST_DATA_MGMT' } } });
    await prisma.charge.deleteMany({ where: { remark: { contains: 'TEST_DATA_MGMT' } } });
    await prisma.loanApplication.deleteMany({ where: { purpose: 'TEST_DATA_MGMT' } });
    await prisma.customer.deleteMany({
      where: {
        OR: [
          { email: { contains: 'datamgmt_test' } },
          { mobile: '9988776650' },
        ],
      },
    });
  });

  afterAll(async () => {
    // Cleanup remaining test records
    await prisma.payment.deleteMany({ where: { notes: { contains: 'TEST_DATA_MGMT' } } });
    await prisma.charge.deleteMany({ where: { remark: { contains: 'TEST_DATA_MGMT' } } });
    await prisma.loanApplication.deleteMany({ where: { purpose: 'TEST_DATA_MGMT' } });
    await prisma.customer.deleteMany({
      where: {
        OR: [
          { email: { contains: 'datamgmt_test' } },
          { mobile: '9988776650' },
        ],
      },
    });
  });

  it('1. Foreign-Key Protection & Soft-Deactivation: Customer with approved loans cannot be hard deleted', async () => {
    const customer = await prisma.customer.create({
      data: {
        mobile: '9988776650',
        email: 'datamgmt_test_fk@example.com',
        fullName: 'FK Test Customer',
        passwordHash: 'dummyhash',
        address: '123 Test St, Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_aadhaar',
        aadhaarMasked: 'XXXX XXXX 1234',
        monthlyIncome: 50000,
        status: 'ACTIVE',
        isActive: true,
      },
    });

    await prisma.loanApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: 'LN_DM_TEST_01',
        loanType: 'PERSONAL',
        requestedAmount: 50000,
        approvedAmount: 50000,
        tenureMonths: 12,
        status: 'APPROVED',
        purpose: 'TEST_DATA_MGMT',
      },
    });

    // Attempting raw delete on Customer with financial records MUST be blocked
    await expect(
      adminCustomerService.deleteCustomer(customer.id, dummyActor, '127.0.0.1')
    ).rejects.toThrow('Cannot permanently delete customer');

    // Deactivate customer account instead
    await adminCustomerService.deactivateCustomer(customer.id, 'Safety Deactivation', dummyActor, '127.0.0.1');

    // Verify customer account was soft-deactivated while preserving database records
    const updatedCustomer = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(updatedCustomer).not.toBeNull();
    expect(updatedCustomer?.status).toBe('DEACTIVATED');
    expect(updatedCustomer?.isActive).toBe(false);
  });

  it('2. Single & Bulk Archive and Restore for Loan Applications', async () => {
    const customer = await prisma.customer.create({
      data: {
        mobile: '9988776656',
        email: 'datamgmt_test_app@example.com',
        fullName: 'App Archive Test Customer',
        passwordHash: 'dummyhash',
        address: '123 Test St, Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_aadhaar',
        aadhaarMasked: 'XXXX XXXX 1234',
        monthlyIncome: 50000,
      },
    });

    const loan1 = await prisma.loanApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: 'LN_DM_TEST_02',
        loanType: 'PERSONAL',
        requestedAmount: 75000,
        tenureMonths: 12,
        status: 'UNDER_REVIEW',
        purpose: 'TEST_DATA_MGMT',
      },
    });

    const loan2 = await prisma.loanApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: 'LN_DM_TEST_03',
        loanType: 'BUSINESS',
        requestedAmount: 150000,
        tenureMonths: 24,
        status: 'UNDER_REVIEW',
        purpose: 'TEST_DATA_MGMT',
      },
    });

    // Test Single Archive
    await loanApplicationService.archiveLoanApplication(loan1.id, dummyActor, '127.0.0.1');
    let archived1 = await prisma.loanApplication.findUnique({ where: { id: loan1.id } });
    expect(archived1?.status).toBe('CANCELLED');

    // Test Single Restore
    await loanApplicationService.restoreLoanApplication(loan1.id, dummyActor, '127.0.0.1');
    let restored1 = await prisma.loanApplication.findUnique({ where: { id: loan1.id } });
    expect(restored1?.status).toBe('SUBMITTED');

    // Test Bulk Archive
    await loanApplicationService.bulkArchiveApplications([loan1.id, loan2.id], dummyActor, '127.0.0.1');
    let bulkArchived1 = await prisma.loanApplication.findUnique({ where: { id: loan1.id } });
    let bulkArchived2 = await prisma.loanApplication.findUnique({ where: { id: loan2.id } });
    expect(bulkArchived1?.status).toBe('CANCELLED');
    expect(bulkArchived2?.status).toBe('CANCELLED');

    // Test Bulk Restore
    await loanApplicationService.bulkRestoreApplications([loan1.id, loan2.id], dummyActor, '127.0.0.1');
    let bulkRestored1 = await prisma.loanApplication.findUnique({ where: { id: loan1.id } });
    let bulkRestored2 = await prisma.loanApplication.findUnique({ where: { id: loan2.id } });
    expect(bulkRestored1?.status).toBe('SUBMITTED');
    expect(bulkRestored2?.status).toBe('SUBMITTED');
  });

  it('3. Hard Deletion Protection on Approved Loans', async () => {
    const customer = await prisma.customer.create({
      data: {
        mobile: '9988776657',
        email: 'datamgmt_test_approved@example.com',
        fullName: 'Approved Loan Protection Test',
        passwordHash: 'dummyhash',
        address: '123 Test St, Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_aadhaar',
        aadhaarMasked: 'XXXX XXXX 1234',
        monthlyIncome: 50000,
      },
    });

    const approvedLoan = await prisma.loanApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: 'LN_DM_TEST_APPROVED',
        loanType: 'PERSONAL',
        requestedAmount: 100000,
        approvedAmount: 100000,
        tenureMonths: 12,
        status: 'APPROVED',
        purpose: 'TEST_DATA_MGMT',
      },
    });

    // Attempting raw delete on APPROVED loan MUST be rejected
    await expect(
      loanApplicationService.deleteLoanApplication(approvedLoan.id, dummyActor, '127.0.0.1')
    ).rejects.toThrow('Cannot permanently delete an approved');

    // Verify loan is preserved
    const checkedLoan = await prisma.loanApplication.findUnique({ where: { id: approvedLoan.id } });
    expect(checkedLoan).not.toBeNull();
    expect(checkedLoan?.status).toBe('APPROVED');
  });

  it('4. Payment Single & Bulk Archive/Restore', async () => {
    const customer = await prisma.customer.create({
      data: {
        mobile: '9988776658',
        email: 'datamgmt_test_pay@example.com',
        fullName: 'Payment Mgmt Test',
        passwordHash: 'dummyhash',
        address: '123 Test St, Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_aadhaar',
        aadhaarMasked: 'XXXX XXXX 1234',
        monthlyIncome: 50000,
      },
    });

    const loan = await prisma.loanApplication.create({
      data: {
        customerId: customer.id,
        applicationNumber: 'LN_DM_TEST_PAY',
        loanType: 'PERSONAL',
        requestedAmount: 50000,
        tenureMonths: 6,
        status: 'SUBMITTED',
        purpose: 'TEST_DATA_MGMT',
      },
    });

    const payment = await prisma.payment.create({
      data: {
        loanId: loan.id,
        customerId: customer.id,
        amount: 2500,
        paymentType: 'PROCESSING_FEE',
        paymentMethod: 'UPI',
        receiptNumber: 'RCP_TEST_MGMT_01',
        status: 'UNDER_VERIFICATION',
        transactionRef: 'TXN_TEST_MGMT_01',
        paymentDate: new Date(),
        notes: 'TEST_DATA_MGMT payment',
      },
    });

    // Archive Payment
    await paymentService.archivePayment(payment.id, dummyActor, '127.0.0.1');
    let archivedPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(archivedPay?.status).toBe('REJECTED');

    // Restore Payment
    await paymentService.restorePayment(payment.id, dummyActor, '127.0.0.1');
    let restoredPay = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(restoredPay?.status).toBe('UNDER_VERIFICATION');
  });

  it('5. Safe Unlinked Record Deletion', async () => {
    const customer = await prisma.customer.create({
      data: {
        mobile: '9988776659',
        email: 'datamgmt_test_safe_del@example.com',
        fullName: 'Safe Delete Test Customer',
        passwordHash: 'dummyhash',
        address: '123 Test St, Mumbai',
        state: 'Maharashtra',
        city: 'Mumbai',
        aadhaarEncrypted: 'enc_aadhaar',
        aadhaarMasked: 'XXXX XXXX 1234',
        monthlyIncome: 50000,
        status: 'PENDING',
      },
    });

    // Customer with 0 loans / payments can be deleted safely
    await adminCustomerService.deleteCustomer(customer.id, dummyActor, '127.0.0.1');
    const deletedCust = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(deletedCust).toBeNull();
  });
});

import { pdfService } from '../src/services/pdfService';
import { prisma } from '../src/services/db';

async function main() {
  console.log('============================================================');
  console.log('SECTION 26: DYNAMIC DATA REGRESSION TEST');
  console.log('============================================================');

  const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });
  console.log('Current Branding Settings:');
  console.log(`- Company Name: ${branding?.companyName}`);
  console.log(`- Logo URL: ${branding?.logoUrl}`);
  console.log(`- Header URL: ${branding?.approvalLetterHeaderUrl}`);
  console.log(`- Watermark URL: ${branding?.watermarkLogoUrl}`);

  // Test 1: Dynamic Approval Letter Generation
  console.log('\n--- 1. Testing Dynamic Approval Letter Generation ---');
  const approvalLetterBuffer = await pdfService.generateApprovalLetterPdf({
    customerName: 'TEST PDF CUSTOMER',
    customerPhone: '9876543210',
    applicationNumber: 'TEST-LOAN-001',
    loanAccountNumber: 'TEST-LOAN-001',
    approvalNumber: 'TEST-LOAN-001',
    loanType: 'Personal Loan',
    approvedAmount: 123456,
    interestRate: 10.5,
    tenureMonths: 24,
    monthlyEmi: 5724,
    disbursementBank: 'State Bank of India',
    disbursementAccount: '••••••••1234',
    disbursementIfsc: 'SBIN0001234',
    companyName: branding?.companyName || 'Loan Approve Finance Ltd',
    companyAddress: branding?.address || 'Corporate Tower, Mumbai, India',
    companyPhone: branding?.phone || '+91 22 1234 5678',
    companyEmail: branding?.email || 'support@loanapprove.com',
    companyWebsite: branding?.website || 'https://loanapprove.com',
    authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Signatory',
    authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Head of Credit Underwriting',
    approvalLetterHeaderUrl: branding?.approvalLetterHeaderUrl,
    watermarkLogoUrl: branding?.watermarkLogoUrl,
    documentWatermarkEnabled: branding?.documentWatermarkEnabled ?? true,
    watermarkOpacity: branding?.watermarkOpacity ?? 0.1,
    watermarkSize: branding?.watermarkSize ?? 'MEDIUM',
    watermarkPosition: branding?.watermarkPosition ?? 'CENTER',
    verificationUrl: 'https://loanapprove.com/verify/document/TEST-LOAN-001',
  });

  if (!approvalLetterBuffer || approvalLetterBuffer.length === 0) {
    throw new Error('Approval letter PDF buffer is empty');
  }
  const isPdfHeader = approvalLetterBuffer.slice(0, 4).toString() === '%PDF';
  if (!isPdfHeader) {
    throw new Error('Approval letter does not begin with %PDF header');
  }
  console.log(`✓ Approval letter generated successfully: ${approvalLetterBuffer.length} bytes`);
  console.log(`✓ Verified %PDF header: ${approvalLetterBuffer.slice(0, 8).toString()}`);

  // Test 2: Dynamic Invoice Generation
  console.log('\n--- 2. Testing Dynamic Invoice Generation ---');
  const invoiceBuffer = await pdfService.generateInvoicePdf({
    invoiceNumber: 'INV-TEST-001',
    invoiceDate: new Date(),
    customerName: 'TEST PDF CUSTOMER',
    customerMobile: '+91 9876543210',
    customerEmail: 'test.customer@example.com',
    customerAddress: '123 Test Street, Financial District, Mumbai 400001',
    applicationNumber: 'TEST-LOAN-001',
    loanAccountNumber: 'TEST-LOAN-001',
    chargeType: 'Processing & Verification Fee',
    chargeDescription: 'Mandatory Loan File Processing and Verification Charge',
    amount: 123456,
    taxAmount: Math.round(123456 * 0.18),
    totalAmount: Math.round(123456 * 1.18),
    paymentDate: new Date(),
    paymentStatus: 'PAID',
    transactionRef: 'UTR-TEST-998877665544',
    companyName: branding?.companyName || 'Loan Approve Finance Ltd',
    companyLegalName: branding?.companyLegalName || 'Loan Approve Technologies Pvt Ltd',
    companyAddress: branding?.address || 'Corporate Tower, Mumbai, India',
    companyEmail: branding?.email || 'billing@loanapprove.com',
    companyPhone: branding?.phone || '+91 22 1234 5678',
    companyWebsite: branding?.website || 'https://loanapprove.com',
    authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Officer',
    authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Billing Manager',
    logoUrl: branding?.logoUrl,
    watermarkLogoUrl: branding?.watermarkLogoUrl,
    invoiceWatermarkEnabled: branding?.invoiceWatermarkEnabled ?? true,
    watermarkOpacity: branding?.watermarkOpacity ?? 0.1,
    watermarkSize: branding?.watermarkSize ?? 'MEDIUM',
    watermarkPosition: branding?.watermarkPosition ?? 'CENTER',
    generatedDate: new Date(),
  });

  if (!invoiceBuffer || invoiceBuffer.length === 0) {
    throw new Error('Invoice PDF buffer is empty');
  }
  const isInvoicePdf = invoiceBuffer.slice(0, 4).toString() === '%PDF';
  if (!isInvoicePdf) {
    throw new Error('Invoice does not begin with %PDF header');
  }
  console.log(`✓ Invoice generated successfully: ${invoiceBuffer.length} bytes`);
  console.log(`✓ Verified %PDF header: ${invoiceBuffer.slice(0, 8).toString()}`);

  console.log('\n============================================================');
  console.log('✓ DYNAMIC DATA REGRESSION TEST PASSED SUCCESSFULLY!');
  console.log('============================================================');
}

main()
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

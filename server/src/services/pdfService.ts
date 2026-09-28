import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

/**
 * Robustly resolves image input (file path, data URI, or URL) into a Buffer.
 * Never throws — returns null on any resolution or read failure.
 */
export async function resolveImageBuffer(urlOrPath: string | null | undefined): Promise<Buffer | null> {
  if (!urlOrPath || typeof urlOrPath !== 'string' || !urlOrPath.trim()) {
    return null;
  }

  const trimmed = urlOrPath.trim();

  // 1. Data URI (Base64)
  if (trimmed.startsWith('data:image/')) {
    try {
      const commaIdx = trimmed.indexOf(',');
      if (commaIdx !== -1) {
        const base64Data = trimmed.slice(commaIdx + 1);
        return Buffer.from(base64Data, 'base64');
      }
    } catch {
      return null;
    }
  }

  // 2. Local candidate directories
  const candidateDirs = [
    path.join(process.cwd(), 'uploads', 'branding'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'client', 'public', 'assets'),
    path.join(process.cwd(), '..', 'client', 'public', 'assets'),
    path.join(process.cwd(), 'public', 'assets'),
    path.join(__dirname, '..', '..', '..', 'client', 'public', 'assets'),
    path.join(__dirname, '..', '..', 'uploads', 'branding'),
    path.join(__dirname, '..', '..', '..', 'uploads', 'branding'),
  ];

  // Uploads match
  const uploadMatch = trimmed.match(/\/uploads\/branding\/([^?#]+)/);
  if (uploadMatch) {
    const filename = uploadMatch[1];
    for (const dir of candidateDirs) {
      const full = path.join(dir, filename);
      if (fs.existsSync(full)) {
        try { return fs.readFileSync(full); } catch { /* ignore */ }
      }
    }
  }

  const assetsMatch = trimmed.match(/\/assets\/([^?#]+)/);
  if (assetsMatch) {
    const filename = assetsMatch[1];
    for (const dir of candidateDirs) {
      const full = path.join(dir, filename);
      if (fs.existsSync(full)) {
        try { return fs.readFileSync(full); } catch { /* ignore */ }
      }
    }
  }

  // Direct basename match across candidate dirs
  const baseName = path.basename(trimmed);
  for (const dir of candidateDirs) {
    const full = path.join(dir, baseName);
    if (fs.existsSync(full)) {
      try { return fs.readFileSync(full); } catch { /* ignore */ }
    }
  }

  // Direct file path
  try {
    if (fs.existsSync(trimmed)) {
      return fs.readFileSync(trimmed);
    }
  } catch {
    // continue
  }

  // 3. HTTP / HTTPS Remote URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function getWatermarkLayout(pageWidth: number, pageHeight: number, size = 'MEDIUM', position = 'CENTER') {
  let wmWidth = 260;
  if (size === 'SMALL') wmWidth = 160;
  else if (size === 'LARGE') wmWidth = 380;

  const wmX = (pageWidth - wmWidth) / 2;
  let wmY = (pageHeight - wmWidth) / 2;

  if (position === 'TOP') {
    wmY = 120;
  } else if (position === 'BOTTOM') {
    wmY = pageHeight - wmWidth - 100;
  }

  return { wmWidth, wmX, wmY };
}


export interface ApprovalLetterData {
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  applicationNumber: string;
  loanAccountNumber: string;
  approvalNumber?: string | null;
  loanType: string;
  approvedAmount: number;
  interestRate: number;
  tenureMonths: number;
  monthlyEmi: number;
  processingFee: number;
  approvalDate: Date | string;
  disbursementDate?: Date | string | null;
  panMasked?: string | null;
  aadhaarMasked?: string | null;
  accountHolderName?: string | null;
  accountNumberMasked?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  kycVerificationId?: string | null;
  companyName?: string | null;
  companyLegalName?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyAddress?: string | null;
  companyWebsite?: string | null;
  authorizedSignatoryName?: string | null;
  authorizedSignatoryDesignation?: string | null;
  authorizedSignatureUrl?: string | null;
  companyStampUrl?: string | null;
  verificationUrl?: string | null;
  logoUrl?: string | null;
  secondaryLogoUrl?: string | null;
  approvalLetterHeaderUrl?: string | null;
  watermarkLogoUrl?: string | null;
  documentWatermarkEnabled?: boolean;
  watermarkOpacity?: number;
  watermarkSize?: string;
  watermarkPosition?: string;
}

export interface PaymentReceiptData {
  receiptNumber: string;
  transactionRef: string;
  customerName: string;
  applicationNumber: string;
  amount: number;
  paymentMethod: string;
  paymentType: string;
  status: string;
  paymentDate: Date | string;
  companyName?: string | null;
}

export interface EmiSchedulePdfData {
  customerName: string;
  applicationNumber: string;
  loanAccountNumber: string;
  loanAmount: number;
  tenureMonths: number;
  monthlyEmi: number;
  schedules: Array<{
    installmentNumber: number;
    dueDate: Date | string;
    principalAmount: number;
    interestAmount: number;
    totalAmount: number;
    status: string;
  }>;
  companyName?: string | null;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: Date | string;
  customerName: string;
  customerMobile?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  applicationNumber: string;
  loanAccountNumber?: string | null;
  chargeId?: string | null;
  recordId?: string | null;
  chargeType: string;
  chargeDescription?: string | null;
  amount: number;
  taxAmount?: number;
  totalAmount?: number;
  paymentMethod?: string | null;
  paymentDate?: Date | string | null;
  paymentStatus: string;
  transactionRef?: string | null;
  remark?: string | null;
  companyName?: string | null;
  companyLegalName?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyWebsite?: string | null;
  authorizedSignatoryName?: string | null;
  authorizedSignatoryDesignation?: string | null;
  authorizedSignatureUrl?: string | null;
  companyStampUrl?: string | null;
  generatedDate?: Date | string;
  logoUrl?: string | null;
  watermarkLogoUrl?: string | null;
  invoiceWatermarkEnabled?: boolean;
  watermarkOpacity?: number;
  watermarkSize?: string;
  watermarkPosition?: string;
}

/**
 * Helper: Converts integer or float amount into English words (Indian numbering system).
 */
export function numberToWordsInRupees(num: number): string {
  if (!num || isNaN(num) || num <= 0) return 'Zero Rupees Only';
  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ',
    'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n: number): string {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? inWords(n % 10000000) : '');
  }

  const rounded = Math.round(num);
  const words = inWords(rounded).trim();
  return (words ? words : 'Zero') + ' Rupees Only';
}

export class PdfService {
  /**
   * Generates a 2-Page PDF Approval Letter matching Master Reference PDF exactly.
   * - Native PDFKit vector typography for crisp rendering at all zoom levels (100%, 200%, 300%+).
   * - Exact 2-page A4 layout with subtle Rupee watermark (5-10% opacity) behind content.
   * - Dynamic customer details, loan parameters, PAN, Aadhaar, bank details, and branding.
   */
  async generateApprovalLetterPdf(data: ApprovalLetterData): Promise<Buffer> {
    const company = data.companyName || 'MUDRA LOAN';
    const companyLegal = data.companyLegalName || 'Pradhan Mantri Mudra Yojna';
    const companyAddress = data.companyAddress || '3rd Floor, Office No. 218, 219 & 222 Gokhale Plaza, Chinchwadakurdi Link Road, Pune, Maharashtra';
    const companyEmail = data.companyEmail || 'info@dmmdmudra.co.in';
    const companyPhone = data.companyPhone || '8942014797';

    // Resolve images with high-resolution fallbacks
    let [logoBuffer, watermarkBuffer, approvalHeaderBuffer] = await Promise.all([
      resolveImageBuffer(data.logoUrl),
      resolveImageBuffer(data.watermarkLogoUrl),
      resolveImageBuffer(data.approvalLetterHeaderUrl),
    ]);

    // Fallbacks to default assets if not custom uploaded
    if (!logoBuffer) {
      logoBuffer = await resolveImageBuffer('/assets/brand-emblem.png') ||
                   await resolveImageBuffer('default_watermark.png') ||
                   await resolveImageBuffer('/assets/watermark-emblem.png');
    }
    if (!watermarkBuffer) {
      watermarkBuffer = await resolveImageBuffer('/assets/watermark-emblem.png') ||
                        await resolveImageBuffer('default_watermark.png') ||
                        await resolveImageBuffer('/assets/brand-emblem.png');
    }
    if (!approvalHeaderBuffer) {
      approvalHeaderBuffer = await resolveImageBuffer('/assets/approval-header.png') ||
                             await resolveImageBuffer('default_approval_header.png');
    }

    const approvalNumber = data.approvalNumber || data.loanAccountNumber || data.applicationNumber;
    const approvalDateObj = new Date(data.approvalDate);
    const dateFormatted = isNaN(approvalDateObj.getTime())
      ? new Date().toISOString().slice(0, 10)
      : approvalDateObj.toISOString().slice(0, 10);

    const issuedDateFormatted = isNaN(approvalDateObj.getTime())
      ? new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : approvalDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const kycRef = data.kycVerificationId || `MUDFNC/437/907/687`;
    const recordId = `LN-${approvalNumber.replace(/\D/g, '').slice(-9) || '906142729'}`;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 0, size: 'A4', autoFirstPage: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const margin = 35;
        const contentWidth = pageWidth - margin * 2; // 525.28

        const isWatermarkEnabled = data.documentWatermarkEnabled !== false;
        const rawOpacity = typeof data.watermarkOpacity === 'number' ? data.watermarkOpacity : 0.07;
        // Strictly bound watermark opacity between 0.05 (5%) and 0.10 (10%) for subtle background appearance
        const wmOpacity = Math.max(0.05, Math.min(0.10, rawOpacity));
        const wmWidth = 260;
        const wmX = (pageWidth - wmWidth) / 2;
        const wmY = (pageHeight - wmWidth) / 2;

        // ==========================================
        // PAGE 1 — Background Watermark (Rendered BEHIND content)
        // ==========================================
        if (isWatermarkEnabled && watermarkBuffer) {
          try {
            doc.save();
            doc.opacity(wmOpacity);
            doc.image(watermarkBuffer, wmX, wmY, { width: wmWidth, align: 'center', valign: 'center' });
            doc.restore();
          } catch {
            // Gracefully ignore image decoding errors
          } finally {
            doc.opacity(1.0);
          }
          doc.opacity(1.0);
        }

        let currentY = 28;

        // 1. Header Section: Left Logo + Center Title Banner + Right Approved Badge & Info
        // Left Logo (Circular Rupee Emblem)
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, margin, currentY, { width: 50, height: 50 });
          } catch {
            // Programmatic fallback
            doc.circle(margin + 25, currentY + 25, 24).lineWidth(1).strokeColor('#d97706').fillAndStroke('#fffbeb', '#d97706');
            doc.font('Helvetica-Bold').fontSize(18).fillColor('#b45309').text('₹', margin + 18, currentY + 16);
          }
        }

        // Center Title Banner: Lion Emblem + Tricolor Ribbon + MUDRA LOAN + LOAN APPROVAL LETTER
        if (approvalHeaderBuffer) {
          try {
            const bannerW = 236;
            const bannerH = 53.5;
            const bannerX = (pageWidth - bannerW) / 2;
            doc.image(approvalHeaderBuffer, bannerX, currentY - 2, { width: bannerW, height: bannerH });
          } catch {
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#262626').text(company, 160, currentY + 4, { width: 275, align: 'center' });
            doc.font('Helvetica-Bold').fontSize(16).fillColor('#580505').text('LOAN APPROVAL LETTER', 160, currentY + 22, { width: 275, align: 'center' });
          }
        } else {
          doc.font('Helvetica-Bold').fontSize(11).fillColor('#262626').text(company, 160, currentY + 4, { width: 275, align: 'center' });
          doc.font('Helvetica-Bold').fontSize(16).fillColor('#580505').text('LOAN APPROVAL LETTER', 160, currentY + 22, { width: 275, align: 'center' });
        }

        // Right Status & Details Area: Approved Pill Badge + Numbers
        const badgeW = 92;
        const badgeH = 17;
        const badgeX = margin + contentWidth - badgeW;
        doc.roundedRect(badgeX, currentY, badgeW, badgeH, 8.5).lineWidth(0.8).strokeColor('#10b981').fillAndStroke('#ecfdf5', '#10b981');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#059669').text('✓ APPROVED', badgeX, currentY + 4.5, { width: badgeW, align: 'center' });

        const rightTextX = margin + contentWidth - 180;
        const rightTextW = 180;
        let rightInfoY = currentY + 22;
        doc.font('Helvetica').fontSize(6.8).fillColor('#334155').text('Loan Approval No:', rightTextX, rightInfoY, { width: rightTextW, align: 'right' });
        rightInfoY += 9;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(approvalNumber, rightTextX, rightInfoY, { width: rightTextW, align: 'right' });
        rightInfoY += 10;
        doc.font('Helvetica').fontSize(6.8).fillColor('#334155').text(`Date: ${dateFormatted}`, rightTextX, rightInfoY, { width: rightTextW, align: 'right' });
        rightInfoY += 9;
        doc.font('Helvetica').fontSize(6.8).fillColor('#475569').text(`KYC Ref: ${kycRef}`, rightTextX, rightInfoY, { width: rightTextW, align: 'right' });

        currentY = 88;

        // 2. Office Address Line
        doc.roundedRect(margin, currentY, contentWidth, 16, 2).lineWidth(0.5).strokeColor('#e2e8f0').fillAndStroke('#f8fafc', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#475569').text(
          `Office Address: ${companyAddress}`,
          margin + 8,
          currentY + 4.5,
          { width: contentWidth - 16, align: 'left' }
        );
        currentY += 24;

        // 3. APPLICANT DETAILS OVERVIEW (2x2 Grid)
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('APPLICANT DETAILS OVERVIEW', margin, currentY);
        currentY += 11;

        const gridH = 46;
        const colMidX = margin + contentWidth / 2;
        doc.roundedRect(margin, currentY, contentWidth, gridH, 3).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
        // Vertical divider
        doc.moveTo(colMidX, currentY).lineTo(colMidX, currentY + gridH).lineWidth(0.6).strokeColor('#cbd5e1').stroke();
        // Horizontal divider
        doc.moveTo(margin, currentY + gridH / 2).lineTo(margin + contentWidth, currentY + gridH / 2).lineWidth(0.6).strokeColor('#cbd5e1').stroke();

        // Cell 1: Top Left - Applicant Name
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#64748b').text('APPLICANT NAME', margin + 10, currentY + 4);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(`Mr/Mrs ${data.customerName}`, margin + 10, currentY + 12);

        // Cell 2: Top Right - Loan Approval Number
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#64748b').text('LOAN APPROVAL NUMBER', colMidX + 10, currentY + 4);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(approvalNumber, colMidX + 10, currentY + 12);

        // Cell 3: Bottom Left - Phone Number
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#64748b').text('PHONE NUMBER', margin + 10, currentY + gridH / 2 + 4);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(data.customerPhone || 'N/A', margin + 10, currentY + gridH / 2 + 12);

        // Cell 4: Bottom Right - Approved Loan Amount
        doc.font('Helvetica-Bold').fontSize(6.2).fillColor('#64748b').text('APPROVED LOAN AMOUNT', colMidX + 10, currentY + gridH / 2 + 4);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#7f1d1d').text(`Rs. ${data.approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, colMidX + 10, currentY + gridH / 2 + 12);

        currentY += gridH + 11;

        // 4. Salutation & Acceptance Paragraph
        const applicantDisplayName = data.customerName || (data as any).applicantName || 'Customer';
        const loanTypeDisplayName = (data.loanType || 'Business Loan').toUpperCase();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(`Dear ${applicantDisplayName},`, margin, currentY);
        currentY += 10;
        const welcomeEntity = companyLegal ? `${companyLegal} (${company})` : company;
        doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b').text(
          `${welcomeEntity} welcomes you. We are pleased to inform you that your application for ${loanTypeDisplayName} of amount Rs. ${data.approvedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been accepted. The information mentioned by you has been investigated securely by the company team through online database checks based on the details provided below. Please go through them carefully and report immediately in case of any discrepancy.`,
          margin,
          currentY,
          { width: contentWidth, align: 'justify', lineGap: 2 }
        );
        currentY += 31;

        // 5. YOUR APPLICATION DETAILS Table
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('YOUR APPLICATION DETAILS', margin, currentY);
        currentY += 10;

        const col1W = 195;
        const col2W = contentWidth - col1W;
        const thH = 15;
        const rowH = 14;

        // Table 1 Header (Dark Maroon)
        doc.rect(margin, currentY, contentWidth, thH).fill('#6b1515');
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff').text('PARAMETER / FIELD', margin + 8, currentY + 4);
        doc.text('VERIFIED APPLICANT INFORMATION', margin + col1W + 8, currentY + 4);
        currentY += thH;

        const t1Rows = [
          ['Application / Loan No.', approvalNumber],
          ['Applicant Full Name', applicantDisplayName],
          ['PAN Number', data.panMasked || 'BANPN9796M'],
          ['Aadhaar Number', data.aadhaarMasked || 'XXXX-XXXX-3108'],
          ['Account Holder Name', data.accountHolderName || applicantDisplayName],
          ['Account Number', data.accountNumberMasked || 'XXXXXX6776'],
          ['IFSC Code', data.bankIfsc || 'SBIN0004235'],
          ['Bank Name', data.bankName || 'State Bank of India'],
        ];

        for (const [fld, val] of t1Rows) {
          doc.rect(margin, currentY, col1W, rowH).lineWidth(0.5).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
          doc.rect(margin + col1W, currentY, col2W, rowH).lineWidth(0.5).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text(fld, margin + 8, currentY + 3.5);
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text(val, margin + col1W + 8, currentY + 3.5);
          currentY += rowH;
        }

        currentY += 5;

        // 6. SANCTIONED LOAN AMOUNT Banner
        const sancH = 26;
        doc.roundedRect(margin, currentY, contentWidth, sancH, 3).lineWidth(0.8).strokeColor('#fde68a').fillAndStroke('#fffbeb', '#fde68a');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#7f1d1d').text('SANCTIONED LOAN AMOUNT', margin + 10, currentY + 5);
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`${company} Approval`, margin + 10, currentY + 15);
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#7f1d1d').text(
          `Rs. ${Number(data.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          margin + contentWidth - 180,
          currentY + 7,
          { width: 170, align: 'right' }
        );
        currentY += sancH + 9;

        // 7. EMI AND LOAN AMOUNT APPROVED Table
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('EMI AND LOAN AMOUNT APPROVED', margin, currentY);
        currentY += 10;

        // Table 2 Header (Dark Maroon)
        doc.rect(margin, currentY, contentWidth, thH).fill('#6b1515');
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff').text('FINANCIAL PARAMETER', margin + 8, currentY + 4);
        doc.text('APPROVED VALUE', margin + col1W + 8, currentY + 4);
        currentY += thH;

        const monthlyEmiVal = data.monthlyEmi || (data as any).emiAmount || 0;
        const interestRateVal = data.interestRate || (data as any).interestRateApr || 0;
        const t2Rows = [
          ['Monthly EMI', `Rs. ${Number(monthlyEmiVal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
          ['Loan Amount', `Rs. ${Number(data.approvedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
          ['Loan Tenure', `${data.tenureMonths || 12} Months`],
          ['Interest Rate', `${Number(interestRateVal).toFixed(2)}% per annum`],
        ];

        for (const [fld, val] of t2Rows) {
          doc.rect(margin, currentY, col1W, rowH).lineWidth(0.5).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
          doc.rect(margin + col1W, currentY, col2W, rowH).lineWidth(0.5).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text(fld, margin + 8, currentY + 3.5);
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text(val, margin + col1W + 8, currentY + 3.5);
          currentY += rowH;
        }

        currentY += 7;

        // 8. APPROVED AMOUNT IN WORDS Box
        const wordsBoxH = 26;
        doc.roundedRect(margin, currentY, contentWidth, wordsBoxH, 3).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text('APPROVED AMOUNT IN WORDS', margin + 10, currentY + 4);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(numberToWordsInRupees(data.approvedAmount), margin + 10, currentY + 13);
        currentY += wordsBoxH + 7;

        // 9. 3 Metadata Boxes (Side-by-side)
        const metaBoxW = (contentWidth - 14) / 3;
        const metaBoxH = 28;

        // Box 1: APPROVAL STATUS
        doc.roundedRect(margin, currentY, metaBoxW, metaBoxH, 3).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text('APPROVAL STATUS', margin, currentY + 4, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#16a34a').text('APPROVED / VERIFIED', margin, currentY + 14, { width: metaBoxW, align: 'center' });

        // Box 2: RECORD ID
        const box2X = margin + metaBoxW + 7;
        doc.roundedRect(box2X, currentY, metaBoxW, metaBoxH, 3).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text('RECORD ID', box2X, currentY + 4, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(recordId, box2X, currentY + 14, { width: metaBoxW, align: 'center' });

        // Box 3: ISSUED DATE
        const box3X = margin + (metaBoxW + 7) * 2;
        doc.roundedRect(box3X, currentY, metaBoxW, metaBoxH, 3).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#64748b').text('ISSUED DATE', box3X, currentY + 4, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text(issuedDateFormatted, box3X, currentY + 14, { width: metaBoxW, align: 'center' });

        currentY += metaBoxH + 9;

        // 10. Loan Management Services & Barcode
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('Loan Management Services', margin, currentY);
        currentY += 9;
        doc.font('Helvetica').fontSize(6).fillColor('#64748b').text(
          'Computer-generated payment receipt. This document records the transaction\ndetails shown above and should be retained with your loan records.',
          margin,
          currentY,
          { width: 280, lineGap: 1.5 }
        );
        currentY += 16;

        // Barcode vector lines
        let bX = margin;
        const barcodePatterns = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 2, 1, 3, 1, 2, 4, 1];
        for (const w of barcodePatterns) {
          doc.rect(bX, currentY, w, 16).fill('#0f172a');
          bX += w + 1.8;
        }

        // 11. Page 1 Footer
        const footerLineY = pageHeight - 38;
        const footerTextY = pageHeight - 32;
        doc.rect(margin, footerLineY, contentWidth, 0.5).fill('#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`${company} | Email: ${companyEmail} | Helpline: ${companyPhone}`, margin, footerTextY);
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('PAGE 1 OF 2', margin, footerTextY, { width: contentWidth, align: 'right' });

        // ==========================================
        // PAGE 2 — Subtle Background Watermark
        // ==========================================
        doc.addPage({ margin: 0, size: 'A4' });

        if (isWatermarkEnabled && watermarkBuffer) {
          try {
            doc.save();
            doc.opacity(wmOpacity);
            doc.image(watermarkBuffer, wmX, wmY, { width: wmWidth, align: 'center', valign: 'center' });
            doc.restore();
          } catch {
            // Gracefully ignore image decoding errors
          } finally {
            doc.opacity(1.0);
          }
          doc.opacity(1.0);
        }

        let p2Y = 28;

        // 1. Header on Page 2: Logo + Mudra Title + DOCUMENTATION Pill Badge + Date/Ref No
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, margin, p2Y + 2, { width: 38, height: 38 });
          } catch {
            doc.circle(margin + 19, p2Y + 21, 18).lineWidth(1).strokeColor('#d97706').fillAndStroke('#fffbeb', '#d97706');
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#b45309').text('₹', margin + 14, p2Y + 14);
          }
        }

        const p2TitleX = margin + 46;
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#7f1d1d').text(company.toUpperCase(), p2TitleX, p2Y + 6);
        const p2Sub = companyLegal ? `${companyLegal.toUpperCase()} • DOCUMENT CHECKLIST & GUIDELINES` : 'DOCUMENT CHECKLIST & VERIFICATION GUIDELINES';
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#b45309').text(p2Sub, p2TitleX, p2Y + 23);

        // Right Side: DOCUMENTATION Pill Badge + Date + Ref No
        const docBadgeW = 84;
        const docBadgeH = 16;
        const docBadgeX = margin + contentWidth - docBadgeW;
        doc.roundedRect(docBadgeX, p2Y + 2, docBadgeW, docBadgeH, 8).lineWidth(0.8).strokeColor('#0284c7').fillAndStroke('#e0f2fe', '#0284c7');
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#0369a1').text('DOCUMENTATION', docBadgeX, p2Y + 6, { width: docBadgeW, align: 'center' });

        doc.font('Helvetica').fontSize(6.8).fillColor('#334155').text(`Dated: ${dateFormatted}`, margin + contentWidth - 150, p2Y + 22, { width: 150, align: 'right' });
        doc.font('Helvetica').fontSize(6.8).fillColor('#334155').text(`Ref No: ${approvalNumber}`, margin + contentWidth - 150, p2Y + 31, { width: 150, align: 'right' });

        // Subtle Header Separator Line
        doc.rect(margin, p2Y + 46, contentWidth, 0.8).fill('#fde68a');

        p2Y = 88;

        // 2. KINDLY SUBMIT / COMPLETE ALL REQUIRED DOCUMENTS
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#7f1d1d').text('KINDLY SUBMIT / COMPLETE ALL REQUIRED DOCUMENTS', margin, p2Y);
        p2Y += 11;

        // Document Checklist Box
        const checkListH = 158;
        doc.roundedRect(margin, p2Y, contentWidth, checkListH, 4).lineWidth(0.6).strokeColor('#cbd5e1').fillAndStroke('#ffffff', '#cbd5e1');

        const docItems = [
          'Self-attested copy of Voter Card / Aadhar Card',
          'Self-attested copy of PAN card',
          'Self-attested passport size photographs (two)',
          'Two references from your locality with full contact details including contact number',
          'Copy of bank statement / Cancelled Cheque / bank passbook copy',
          `Processing amount Rs. ${Number(data.processingFee || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/- which is refundable.`
        ];

        let itemY = p2Y + 12;
        docItems.forEach((text, idx) => {
          // Circular maroon badge with number
          const circleCenterX = margin + 18;
          const circleCenterY = itemY + 5;
          doc.circle(circleCenterX, circleCenterY, 6).fill('#6b1515');
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#ffffff').text(String(idx + 1), circleCenterX - 6, circleCenterY - 3.5, { width: 12, align: 'center' });

          if (idx === 5) {
            doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#0f172a').text(text, margin + 30, itemY + 1.5);
          } else {
            doc.font('Helvetica').fontSize(7.8).fillColor('#1e293b').text(text, margin + 30, itemY + 1.5);
          }
          itemY += 23;
        });

        p2Y += checkListH + 11;

        // 3. PROCESSING FEE DEPOSIT (REFUNDABLE) Box
        const feeBoxH = 32;
        doc.roundedRect(margin, p2Y, contentWidth, feeBoxH, 3).lineWidth(0.8).strokeColor('#fcd34d').fillAndStroke('#fefce8', '#fcd34d');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#78350f').text('PROCESSING FEE DEPOSIT (REFUNDABLE)', margin + 12, p2Y + 6);
        doc.font('Helvetica').fontSize(6.8).fillColor('#64748b').text('Mandatory for loan file clearance & verification', margin + 12, p2Y + 17);
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#78350f').text(
          `Rs. ${Number(data.processingFee || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}/-`,
          margin + contentWidth - 180,
          p2Y + 9,
          { width: 168, align: 'right' }
        );

        p2Y += feeBoxH + 11;

        // 4. Payment Mode Box
        const pmodeH = 34;
        doc.roundedRect(margin, p2Y, contentWidth, pmodeH, 3).lineWidth(0.6).strokeColor('#93c5fd').fillAndStroke('#f0f9ff', '#93c5fd');
        doc.rect(margin, p2Y, 3.5, pmodeH).fill('#0284c7');

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0369a1').text('Payment Mode:', margin + 12, p2Y + 6);
        doc.font('Helvetica').fontSize(7.5).fillColor('#334155').text('You can make payments through NEFT / RTGS / IMPS / UPI / Net Banking.', margin + 76, p2Y + 6);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#b91c1c').text('Cash Deposits are not allowed as per company rules and regulations.', margin + 12, p2Y + 18);

        p2Y += pmodeH + 11;

        // 5. Important Note Box
        const noteH = 24;
        doc.roundedRect(margin, p2Y, contentWidth, noteH, 3).lineWidth(0.6).strokeColor('#86efac').fillAndStroke('#f0fdf4', '#86efac');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#15803d').text('Important Note:', margin + 12, p2Y + 7);
        doc.font('Helvetica').fontSize(7.5).fillColor('#166534').text('Processing Fee is completely refundable within 15 days.', margin + 80, p2Y + 7);

        // Page 2 Footer
        doc.rect(margin, footerLineY, contentWidth, 0.5).fill('#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(`${company} | Email: ${companyEmail} | Helpline: ${companyPhone}`, margin, footerTextY);
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('PAGE 2 OF 2', margin, footerTextY, { width: contentWidth, align: 'right' });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates a 1-Page Official Payment Receipt / Tax Invoice PDF matching Master Reference Screenshot.
   * - Pure white A4 background.
   * - Burgundy table header, Total received box, Amount in words box, 3 metadata boxes, Barcode, Authorized Signatory.
   */
  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    const company = data.companyName || 'Loan Approve Financial Services';
    const companyLegal = data.companyLegalName || 'Loan Approve Financial Services Pvt. Ltd.';
    const companyAddress = data.companyAddress || 'Nariman Point, Mumbai, Maharashtra 400021';
    const companyEmail = data.companyEmail || 'billing@loanapprove.com';
    const companyPhone = data.companyPhone || '+91 8042054797';
    const signatoryName = data.authorizedSignatoryName || 'Authorized Officer';
    const signatoryDesignation = data.authorizedSignatoryDesignation || 'Authorized Signatory';

    const [logoBuffer, watermarkBuffer] = await Promise.all([
      resolveImageBuffer(data.logoUrl),
      resolveImageBuffer(data.watermarkLogoUrl),
    ]);

    const invoiceDateObj = new Date(data.invoiceDate || Date.now());
    const formattedDate = isNaN(invoiceDateObj.getTime())
      ? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : invoiceDateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const issuedAtStr = new Date(data.generatedDate || Date.now()).toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 35, size: 'A4', autoFirstPage: true });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const margin = 35;
        const contentWidth = pageWidth - margin * 2; // 525.28

        const isInvoiceWatermarkEnabled = data.invoiceWatermarkEnabled !== false;
        const rawOpacity = typeof data.watermarkOpacity === 'number' ? data.watermarkOpacity : 0.10;
        // Strictly bound watermark opacity between 0.05 (5%) and 0.30 (30%)
        const wmOpacity = Math.max(0.05, Math.min(0.30, rawOpacity));
        const { wmWidth, wmX, wmY } = getWatermarkLayout(pageWidth, pageHeight, data.watermarkSize, data.watermarkPosition);

        // Watermark rendered BEHIND content
        if (isInvoiceWatermarkEnabled && watermarkBuffer) {
          try {
            doc.save();
            doc.opacity(wmOpacity);
            doc.image(watermarkBuffer, wmX, wmY, { width: wmWidth, align: 'center', valign: 'center' });
            doc.restore();
          } catch {
            // Gracefully ignore image decoding errors
          } finally {
            doc.opacity(1.0);
          }
        }
        // Explicitly enforce 100% solid opacity for all document text, lines, and foreground elements
        doc.opacity(1.0);

        // Outer Double Border / Clean Frame
        doc.rect(margin - 10, margin - 10, contentWidth + 20, pageHeight - (margin - 10) * 2).lineWidth(0.5).strokeColor('#e2e8f0').stroke();
        doc.rect(margin - 7, margin - 7, contentWidth + 14, pageHeight - (margin - 7) * 2).lineWidth(0.5).strokeColor('#f1f5f9').stroke();

        let currentY = 38;

        // Top Left: Golden Circular Emblem / Dynamic Logo + PAYMENT RECEIPT
        if (logoBuffer) {
          try {
            doc.image(logoBuffer, margin + 10, currentY, { fit: [110, 36], align: 'center', valign: 'center' });
            doc.font('Helvetica-Bold').fontSize(15).fillColor('#7f1d1d').text('PAYMENT RECEIPT', margin + 130, currentY + 4);
            doc.font('Helvetica-Bold').fontSize(7).fillColor('#b45309').text('LOAN ACCOUNT • OFFICIAL TRANSACTION RECORD', margin + 130, currentY + 22);
          } catch {
            doc.circle(margin + 20, currentY + 16, 16).lineWidth(1.2).strokeColor('#b45309').fillAndStroke('#fffbeb', '#b45309');
            doc.font('Helvetica-Bold').fontSize(14).fillColor('#78350f').text('₹', margin + 14, currentY + 9);
            doc.font('Helvetica-Bold').fontSize(16).fillColor('#7f1d1d').text('PAYMENT RECEIPT', margin + 44, currentY + 4);
            doc.font('Helvetica-Bold').fontSize(7).fillColor('#b45309').text('LOAN ACCOUNT • OFFICIAL TRANSACTION RECORD', margin + 45, currentY + 22);
          }
        } else {
          doc.circle(margin + 20, currentY + 16, 16).lineWidth(1.2).strokeColor('#b45309').fillAndStroke('#fffbeb', '#b45309');
          doc.font('Helvetica-Bold').fontSize(14).fillColor('#78350f').text('₹', margin + 14, currentY + 9);
          doc.font('Helvetica-Bold').fontSize(16).fillColor('#7f1d1d').text('PAYMENT RECEIPT', margin + 44, currentY + 4);
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#b45309').text('LOAN ACCOUNT • OFFICIAL TRANSACTION RECORD', margin + 45, currentY + 22);
        }

        // Top Right: PAID Pill Badge + Receipt No + Transaction Date + Company Tagline
        const rightBadgeX = margin + 350;
        doc.roundedRect(rightBadgeX + 115, currentY + 2, 45, 16, 8).fillAndStroke('#dcfce7', '#16a34a');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#15803d').text('PAID', rightBadgeX + 115, currentY + 6, { width: 45, align: 'center' });

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(`Receipt No: ${data.invoiceNumber}`, rightBadgeX, currentY + 22, { width: 160, align: 'right' });
        doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Transaction Date: ${formattedDate}`, rightBadgeX, currentY + 34, { width: 160, align: 'right' });
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(company, rightBadgeX, currentY + 46, { width: 160, align: 'right' });
        doc.text('Official Customer Payment Record', rightBadgeX, currentY + 54, { width: 160, align: 'right' });

        currentY += 66;

        // Horizontal Red Accent Line
        doc.rect(margin, currentY, contentWidth, 1.5).fill('#7f1d1d');
        currentY += 12;

        // ==========================================
        // SECTION 1: BILL TO / ACCOUNT HOLDER
        // ==========================================
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#7f1d1d').text('BILL TO / ACCOUNT HOLDER', margin, currentY);
        currentY += 10;

        const boxW = (contentWidth - 10) / 2; // ~257pt
        const boxH = 42;

        // Box 1 (Customer Name) & Box 2 (Loan Account Number)
        doc.roundedRect(margin, currentY, boxW, boxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('CUSTOMER NAME', margin + 10, currentY + 8);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(data.customerName, margin + 10, currentY + 20);

        doc.roundedRect(margin + boxW + 10, currentY, boxW, boxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('LOAN ACCOUNT NUMBER', margin + boxW + 20, currentY + 8);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(data.loanAccountNumber || data.applicationNumber, margin + boxW + 20, currentY + 20);

        currentY += boxH + 8;

        // Box 3 (Transaction Ref) & Box 4 (Payment Method)
        doc.roundedRect(margin, currentY, boxW, boxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('TRANSACTION REFERENCE (UTR)', margin + 10, currentY + 8);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(data.transactionRef || 'TXN-VERIFIED', margin + 10, currentY + 20);

        doc.roundedRect(margin + boxW + 10, currentY, boxW, boxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('PAYMENT METHOD', margin + boxW + 20, currentY + 8);
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(data.paymentMethod || 'Account Payment / Verified', margin + boxW + 20, currentY + 20);

        currentY += boxH + 16;

        // ==========================================
        // SECTION 2: TRANSACTION DETAILS
        // ==========================================
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#7f1d1d').text('TRANSACTION DETAILS', margin, currentY);
        currentY += 10;

        // Table Header (Burgundy / Maroon)
        const tableHeaderH = 22;
        doc.rect(margin, currentY, contentWidth, tableHeaderH).fill('#6b1515');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text('DESCRIPTION OF CHARGE / SERVICE', margin + 12, currentY + 6);
        doc.text('AMOUNT RECEIVED', margin + contentWidth - 140, currentY + 6, { width: 125, align: 'right' });

        currentY += tableHeaderH + 6;

        // Line Item Row
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(data.chargeType, margin + 12, currentY);
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(data.amount.toLocaleString('en-IN'), margin + contentWidth - 140, currentY, { width: 125, align: 'right' });
        currentY += 14;
        doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(data.chargeDescription || 'Loan account charge / fee payment', margin + 12, currentY);

        currentY += 22;

        // Two Sub-boxes: REMARK / PAYMENT NOTE & VERIFICATION STATUS
        const subBoxH = 38;
        doc.roundedRect(margin, currentY, boxW, subBoxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('REMARK / PAYMENT NOTE', margin + 10, currentY + 7);
        doc.font('Helvetica').fontSize(7.5).fillColor('#0f172a').text(data.remark || `Standard ${data.chargeType} for loan file clearance and verification.`, margin + 10, currentY + 18, { width: boxW - 20 });

        doc.roundedRect(margin + boxW + 10, currentY, boxW, subBoxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('VERIFICATION STATUS', margin + boxW + 20, currentY + 7);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#15803d').text('Verified & Successfully Paid', margin + boxW + 20, currentY + 18);

        currentY += subBoxH + 12;

        // Total Amount Received Box (Golden / Amber Border)
        const totalBoxH = 36;
        doc.roundedRect(margin, currentY, contentWidth, totalBoxH, 4).lineWidth(1.2).strokeColor('#ca8a04').fillAndStroke('#ffffff', '#ca8a04');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#78350f').text('TOTAL AMOUNT RECEIVED', margin + 14, currentY + 12);
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(data.amount.toLocaleString('en-IN'), margin + contentWidth - 150, currentY + 9, { width: 135, align: 'right' });

        currentY += totalBoxH + 12;

        // Amount in Words Box (Dashed border)
        const wordsBoxH = 30;
        doc.roundedRect(margin, currentY, contentWidth, wordsBoxH, 4).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('AMOUNT RECEIVED — IN WORDS', margin + 14, currentY + 6);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(numberToWordsInRupees(data.amount), margin + 14, currentY + 16);

        currentY += wordsBoxH + 12;

        // 3 Metadata Boxes: RECEIPT STATUS | RECORD ID | ISSUED
        const metaBoxW = (contentWidth - 16) / 3; // ~170pt
        const metaBoxH = 36;

        // Box 1: Receipt Status
        doc.roundedRect(margin, currentY, metaBoxW, metaBoxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('RECEIPT STATUS', margin, currentY + 7, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('PAID / VERIFIED', margin, currentY + 18, { width: metaBoxW, align: 'center' });

        // Box 2: Record ID
        doc.roundedRect(margin + metaBoxW + 8, currentY, metaBoxW, metaBoxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('RECORD ID', margin + metaBoxW + 8, currentY + 7, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(data.recordId || data.chargeId?.slice(-6) || '2', margin + metaBoxW + 8, currentY + 18, { width: metaBoxW, align: 'center' });

        // Box 3: Issued
        doc.roundedRect(margin + (metaBoxW + 8) * 2, currentY, metaBoxW, metaBoxH, 4).lineWidth(0.8).strokeColor('#e2e8f0').fillAndStroke('#ffffff', '#e2e8f0');
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text('ISSUED', margin + (metaBoxW + 8) * 2, currentY + 7, { width: metaBoxW, align: 'center' });
        doc.font('Helvetica').fontSize(7.5).fillColor('#0f172a').text(issuedAtStr, margin + (metaBoxW + 8) * 2, currentY + 18, { width: metaBoxW, align: 'center' });

        currentY += metaBoxH + 28;

        // ==========================================
        // FOOTER SECTION: Company, Barcode & Signature
        // ==========================================
        const footerLeftX = margin + 10;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#7f1d1d').text(company, footerLeftX, currentY);
        doc.font('Helvetica').fontSize(6).fillColor('#475569').text(
          `${companyAddress}\nHelpline: ${companyPhone} | Email: ${companyEmail}\nComputer-generated payment receipt. Retain for official records.`,
          footerLeftX,
          currentY + 11,
          { width: 250, lineGap: 1.5 }
        );

        // Simulated Barcode Graphic
        const barcodeY = currentY + 36;
        let bX = footerLeftX;
        const linePatterns = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3];
        for (const w of linePatterns) {
          doc.rect(bX, barcodeY, w, 24).fill('#0f172a');
          bX += w + 2;
        }

        // Right Side: Authorized Signature
        const signX = margin + contentWidth - 150;
        doc.save();
        // Cursive styled signature text or stroke
        doc.moveTo(signX, currentY + 22)
          .bezierCurveTo(signX + 25, currentY + 8, signX + 45, currentY + 32, signX + 75, currentY + 14)
          .bezierCurveTo(signX + 95, currentY + 4, signX + 115, currentY + 24, signX + 135, currentY + 12)
          .lineWidth(1.2)
          .strokeColor('#1e3a8a')
          .stroke();

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e3a8a').text(signatoryName, signX, currentY + 26, { width: 140, align: 'center' });
        doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(signatoryDesignation.toUpperCase(), signX, currentY + 40, { width: 140, align: 'center' });
        doc.restore();

        // Bottom disclaimer
        const btmY = pageHeight - 35;
        doc.font('Helvetica').fontSize(6).fillColor('#94a3b8').text(
          'This receipt is generated from the loan account record. Verify the receipt number, account number and payment amount against your records. No alteration is permitted after issuance.',
          margin,
          btmY,
          { width: contentWidth, align: 'center' }
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates a PDF Payment Receipt (legacy/compact fallback).
   */
  async generatePaymentReceiptPdf(data: PaymentReceiptData): Promise<Buffer> {
    return this.generateInvoicePdf({
      invoiceNumber: data.receiptNumber,
      invoiceDate: data.paymentDate,
      customerName: data.customerName,
      applicationNumber: data.applicationNumber,
      chargeType: data.paymentType,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.status,
      transactionRef: data.transactionRef,
      companyName: data.companyName,
    });
  }

  /**
   * Generates a PDF EMI Repayment Schedule.
   */
  async generateEmiSchedulePdf(data: EmiSchedulePdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        const company = data.companyName || 'Loan Approve Financial Services';

        // Header
        doc.fontSize(16).fillColor('#1E3A8A').text(company, { align: 'center' });
        doc.fontSize(11).fillColor('#0F172A').text('LOAN REPAYMENT & EMI SCHEDULE', { align: 'center' });
        doc.moveDown(0.5);

        // Details
        doc.fontSize(9).fillColor('#475569');
        doc.text(`Customer: ${data.customerName} | Loan Account: ${data.loanAccountNumber} | Loan Amount: ₹${data.loanAmount.toLocaleString('en-IN')}`);
        doc.text(`Tenure: ${data.tenureMonths} Months | Monthly EMI: ₹${data.monthlyEmi.toLocaleString('en-IN')}`);
        doc.moveDown(0.8);

        // Table Header
        const headerY = doc.y;
        doc.rect(40, headerY, 515, 20).fill('#1E3A8A');
        doc.fillColor('#FFFFFF').fontSize(8.5).font('Helvetica-Bold');
        doc.text('#', 45, headerY + 5, { width: 30 });
        doc.text('Due Date', 85, headerY + 5, { width: 90 });
        doc.text('Principal', 185, headerY + 5, { width: 85, align: 'right' });
        doc.text('Interest', 280, headerY + 5, { width: 85, align: 'right' });
        doc.text('Total EMI', 375, headerY + 5, { width: 85, align: 'right' });
        doc.text('Status', 475, headerY + 5, { width: 75, align: 'center' });

        let currentY = headerY + 22;
        doc.font('Helvetica').fontSize(8).fillColor('#0F172A');

        data.schedules.forEach((s) => {
          if (currentY > 750) {
            doc.addPage();
            currentY = 40;
          }

          doc.rect(40, currentY, 515, 18).fill(s.installmentNumber % 2 === 0 ? '#F8FAFC' : '#FFFFFF');
          doc.fillColor('#0F172A');
          doc.text(String(s.installmentNumber), 45, currentY + 4, { width: 30 });
          doc.text(new Date(s.dueDate).toLocaleDateString('en-IN'), 85, currentY + 4, { width: 90 });
          doc.text(`₹${s.principalAmount.toLocaleString('en-IN')}`, 185, currentY + 4, { width: 85, align: 'right' });
          doc.text(`₹${s.interestAmount.toLocaleString('en-IN')}`, 280, currentY + 4, { width: 85, align: 'right' });
          doc.text(`₹${s.totalAmount.toLocaleString('en-IN')}`, 375, currentY + 4, { width: 85, align: 'right' });

          const statusColor = s.status === 'PAID' ? '#16A34A' : s.status === 'DUE' ? '#EA580C' : '#64748B';
          doc.fillColor(statusColor).text(s.status, 475, currentY + 4, { width: 75, align: 'center' });

          currentY += 18;
        });

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Helper: Generates Invoice PDF for a charge record on-the-fly if needed
   */
  async generateInvoicePdfForCharge(
    chargeId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { prisma } = await import('./db');
    const charge = await prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        customer: true,
        loan: true,
      },
    });

    if (!charge) {
      throw new Error('Charge record not found');
    }

    const customer = charge.customer;
    const loanApp = charge.loan;
    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

    const customerName = customer?.fullName || 'Customer';
    const customerMobile = customer?.mobile || '';
    const customerEmail = customer?.email || '';
    const customerAddress = customer ? `${customer.address}, ${customer.city}, ${customer.state}` : '';
    const applicationNumber = loanApp?.applicationNumber || 'N/A';
    const loanAccountNumber = loanApp?.accountNumber || loanApp?.applicationNumber || 'N/A';
    const chargeType = charge.name;
    const chargeDesc = charge.remark || `${charge.name} for Loan Application ${applicationNumber}`;
    const amount = charge.amount;
    const paymentDate = charge.paidAt || charge.updatedAt || new Date();
    const transactionRef = charge.transactionRef || 'VERIFIED';
    const invoiceNum = `INV-CHG-${charge.id.slice(0, 8).toUpperCase()}`;

    const pdfBuffer = await this.generateInvoicePdf({
      invoiceNumber: invoiceNum,
      invoiceDate: paymentDate,
      customerName,
      customerMobile,
      customerEmail,
      customerAddress,
      applicationNumber,
      loanAccountNumber,
      chargeType,
      chargeDescription: chargeDesc,
      amount,
      taxAmount: Math.round(amount * 0.18),
      totalAmount: Math.round(amount * 1.18),
      paymentDate,
      paymentStatus: charge.status === 'PAID' ? 'PAID' : 'PENDING',
      transactionRef,
      companyName: branding?.companyName || 'Loan Approve Financial Services',
      companyLegalName: branding?.companyLegalName || 'Loan Approve Financial Services Pvt. Ltd.',
      companyAddress: branding?.address || 'Nariman Point, Mumbai, Maharashtra 400021',
      companyEmail: branding?.email || 'billing@loanapprove.com',
      companyPhone: branding?.phone || '+91 8042054797',
      authorizedSignatoryName: branding?.authorizedSignatoryName || 'Authorized Officer',
      authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation || 'Authorized Signatory',
      logoUrl: branding?.logoUrl,
      watermarkLogoUrl: branding?.watermarkLogoUrl,
      invoiceWatermarkEnabled: branding?.invoiceWatermarkEnabled,
      watermarkOpacity: branding?.watermarkOpacity,
      watermarkSize: branding?.watermarkSize,
      watermarkPosition: branding?.watermarkPosition,
      generatedDate: new Date(),
    });

    return {
      buffer: pdfBuffer,
      filename: `Invoice_${invoiceNum}.pdf`,
    };
  }

  async generateSanctionLetter(loanId: string): Promise<Buffer> {
    const { prisma } = await import('./db');
    const loan = await prisma.loanApplication.findFirst({
      where: {
        OR: [{ id: loanId }, { applicationNumber: loanId }, { accountNumber: loanId }],
      },
      include: { customer: true },
    });
    if (!loan) throw new Error('Loan not found');

    const branding = await prisma.brandingSettings.findUnique({ where: { id: 'default' } });

    return this.generateApprovalLetterPdf({
      customerName: loan.customer.fullName,
      customerPhone: loan.customer.mobile,
      customerEmail: loan.customer.email,
      customerAddress: loan.customer.address,
      applicationNumber: loan.applicationNumber,
      loanAccountNumber: loan.accountNumber || loan.applicationNumber,
      approvalNumber: loan.approvalNumber || loan.accountNumber || loan.applicationNumber,
      loanType: loan.loanType || 'Personal Loan',
      approvedAmount: loan.approvedAmount || loan.requestedAmount,
      interestRate: loan.interestRate || 12.0,
      tenureMonths: loan.tenureMonths,
      monthlyEmi: loan.finalEmi || loan.estimatedEmi || 0,
      processingFee: loan.processingFeeAmount || 1250,
      approvalDate: loan.updatedAt,
      panMasked: loan.customer.panMasked || undefined,
      aadhaarMasked: loan.customer.aadhaarMasked || undefined,
      accountHolderName: loan.customer.fullName,
      accountNumberMasked: loan.customer.bankAccountNumber ? `XXXXXX${loan.customer.bankAccountNumber.slice(-4)}` : undefined,
      bankIfsc: loan.customer.bankIfsc || undefined,
      bankName: loan.customer.bankName || undefined,
      companyName: branding?.companyName,
      companyLegalName: branding?.companyLegalName,
      companyEmail: branding?.email,
      companyPhone: branding?.phone,
      companyAddress: branding?.address,
      authorizedSignatoryName: branding?.authorizedSignatoryName,
      authorizedSignatoryDesignation: branding?.authorizedSignatoryDesignation,
      logoUrl: branding?.logoUrl,
      secondaryLogoUrl: branding?.secondaryLogoUrl,
      watermarkLogoUrl: branding?.watermarkLogoUrl,
      watermarkOpacity: branding?.watermarkOpacity,
      watermarkSize: branding?.watermarkSize,
      watermarkPosition: branding?.watermarkPosition,
      verificationUrl: `https://loanapprove.com/verify/document/${loan.applicationNumber}`,
    });
  }
}

export const pdfService = new PdfService();

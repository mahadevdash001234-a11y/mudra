import app from '../src/app';

// Ensure @vercel/nft traces and packages all standard PDFKit fonts into the serverless bundle
try {
  require('pdfkit/standard-fonts/Courier');
  require('pdfkit/standard-fonts/CourierBold');
  require('pdfkit/standard-fonts/CourierBoldOblique');
  require('pdfkit/standard-fonts/CourierOblique');
  require('pdfkit/standard-fonts/Helvetica');
  require('pdfkit/standard-fonts/HelveticaBold');
  require('pdfkit/standard-fonts/HelveticaBoldOblique');
  require('pdfkit/standard-fonts/HelveticaOblique');
  require('pdfkit/standard-fonts/Symbol');
  require('pdfkit/standard-fonts/TimesBold');
  require('pdfkit/standard-fonts/TimesBoldItalic');
  require('pdfkit/standard-fonts/TimesItalic');
  require('pdfkit/standard-fonts/TimesRoman');
  require('pdfkit/standard-fonts/ZapfDingbats');
} catch {
  // Tracing hint for Vercel NFT bundler
}

export default app;

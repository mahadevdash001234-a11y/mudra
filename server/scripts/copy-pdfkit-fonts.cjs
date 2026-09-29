const fs = require('fs');
const path = require('path');

const candidates = [
  path.resolve(__dirname, '../../node_modules/pdfkit/js/standard-fonts'),
  path.resolve(__dirname, '../node_modules/pdfkit/js/standard-fonts'),
];

const dest = path.resolve(
  __dirname,
  '../node_modules/pdfkit/js/standard-fonts'
);

let copied = false;

for (const src of candidates) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    copied = true;
    console.log(`Copied PDFKit standard fonts from: ${src}`);
    console.log(`PDFKit standard fonts destination: ${dest}`);
    break;
  }
}

if (!copied) {
  console.error('PDFKit standard-fonts directory was not found.');
  console.error('Checked:');
  for (const candidate of candidates) {
    console.error(`- ${candidate}`);
  }
  process.exit(1);
}

const requiredFiles = [
  'Helvetica.cjs',
  'HelveticaBold.cjs',
  'TimesRoman.cjs'
];

for (const file of requiredFiles) {
  const target = path.join(dest, file);

  if (!fs.existsSync(target)) {
    console.error(`Required PDFKit font module missing after copy: ${target}`);
    process.exit(1);
  }
}

console.log('PDFKit standard-font assets verified successfully.');

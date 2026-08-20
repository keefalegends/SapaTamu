#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');

// ─── Arg Parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { prefix: 'Meja', start: 1, outdir: 'output/qr-codes', pdf: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--phone':   args.phone = argv[++i]; break;
      case '--tables':  args.tables = parseInt(argv[++i], 10); break;
      case '--start':   args.start = parseInt(argv[++i], 10); break;
      case '--prefix':  args.prefix = argv[++i]; break;
      case '--outdir':  args.outdir = argv[++i]; break;
      case '--pdf':     args.pdf = true; break;
      case '--help': case '-h': printUsage(); process.exit(0);
    }
  }
  return args;
}

function printUsage() {
  console.log(`
🏨 SapaTamu QR Generator
=========================

Usage:
  node tools/generate-qr.js --tables <n> --phone <628xxx> [options]

Required:
  --phone <num>      Nomor WhatsApp (misal: 628123456789)
  --tables <n>       Jumlah meja

Options:
  --start <n>        Nomor meja mulai dari (default: 1)
  --prefix <text>    Label prefix (default: "Meja")
  --outdir <path>    Folder output (default: output/qr-codes)
  --pdf              Generate combined PDF untuk print
  -h, --help         Tampilkan help ini

Examples:
  node tools/generate-qr.js --tables 20 --phone 628123456789
  node tools/generate-qr.js --tables 15 --phone 628123456789 --prefix "Table" --pdf
  node tools/generate-qr.js --tables 10 --phone 628123456789 --start 5
`);
}

function validate(args) {
  const errors = [];

  if (!args.phone) errors.push('--phone wajib diisi');
  if (!args.tables) errors.push('--tables wajib diisi');

  if (args.phone) {
    // Strip + prefix
    if (args.phone.startsWith('+')) {
      console.log(`⚠  Stripping "+" dari nomor: ${args.phone} → ${args.phone.slice(1)}`);
      args.phone = args.phone.slice(1);
    }
    if (!/^\d{10,15}$/.test(args.phone)) {
      errors.push(`--phone harus 10-15 digit, dapat: "${args.phone}"`);
    }
  }

  if (args.tables !== undefined && (isNaN(args.tables) || args.tables < 1)) {
    errors.push(`--tables harus angka positif, dapat: "${args.tables}"`);
  }

  if (args.start !== undefined && (isNaN(args.start) || args.start < 1)) {
    errors.push(`--start harus angka positif, dapat: "${args.start}"`);
  }

  if (errors.length) {
    console.error('❌ Error:');
    errors.forEach(e => console.error(`   ${e}`));
    console.error('\nJalankan --help untuk usage.');
    process.exit(1);
  }
}

// ─── QR Generation ──────────────────────────────────────────────────────────

async function generateLabeledQR(tableNum, phone, prefix) {
  const padWidth = tableNum >= 100 ? 3 : 2;
  const padded = String(tableNum).padStart(padWidth, '0');
  const label = `${prefix} ${padded}`;
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(label)}`;

  // Generate raw QR as buffer
  const qrBuffer = await QRCode.toBuffer(url, {
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#FFFFFF' },
  });

  // Create canvas with extra space for label
  const qrImg = await loadImage(qrBuffer);
  const canvas = createCanvas(400, 470);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 400, 470);

  // Draw QR
  ctx.drawImage(qrImg, 0, 0, 400, 400);

  // Draw label centered below
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 200, 438);

  // Small subtitle
  ctx.fillStyle = '#666666';
  ctx.font = '14px sans-serif';
  ctx.fillText('Scan untuk pesan via WhatsApp', 200, 460);

  const filename = `qr-${prefix.toLowerCase()}-${padded}.png`;
  return { buffer: canvas.toBuffer('image/png'), filename, label, url };
}

// ─── PDF Generation ─────────────────────────────────────────────────────────

async function generatePDF(images, outdir) {
  const PDFDocument = require('pdfkit');
  const pdfPath = path.join(outdir, 'all-tables.pdf');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const colCount = 2;
    const rowCount = 3;
    const perPage = colCount * rowCount;
    const qrSize = 200;
    const cellW = 250;
    const cellH = 250;
    const startX = 40;
    const startY = 40;

    images.forEach((img, i) => {
      if (i > 0 && i % perPage === 0) doc.addPage();

      const posOnPage = i % perPage;
      const col = posOnPage % colCount;
      const row = Math.floor(posOnPage / colCount);
      const x = startX + col * cellW;
      const y = startY + row * cellH;

      doc.image(img.buffer, x + (cellW - qrSize) / 2, y, { width: qrSize });
      doc.fontSize(14).font('Helvetica-Bold')
        .text(img.label, x, y + qrSize + 5, { width: cellW, align: 'center' });
    });

    doc.end();
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.phone && !args.tables) {
    printUsage();
    process.exit(0);
  }

  validate(args);

  const outdir = path.resolve(args.outdir);
  fs.mkdirSync(outdir, { recursive: true });

  const endTable = args.start + args.tables - 1;

  console.log(`
🏨 SapaTamu QR Generator
=========================
Phone  : ${args.phone}
Tables : ${args.start}–${endTable}
Prefix : ${args.prefix}
Output : ${outdir}
PDF    : ${args.pdf ? 'Ya' : 'Tidak'}
`);

  const images = [];

  for (let t = args.start; t <= endTable; t++) {
    const result = await generateLabeledQR(t, args.phone, args.prefix);
    const filepath = path.join(outdir, result.filename);
    fs.writeFileSync(filepath, result.buffer);
    console.log(`  ✓ ${result.filename}`);
    images.push(result);
  }

  if (args.pdf) {
    const pdfPath = await generatePDF(images, outdir);
    const pages = Math.ceil(images.length / 6);
    console.log(`  ✓ all-tables.pdf (${pages} page${pages > 1 ? 's' : ''})`);
  }

  console.log(`\n✅ Done! ${args.tables} QR codes saved to ${outdir}/\n`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

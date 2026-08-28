// ─── Meja Detection (QR Scan Entry) ─────────────────────────────────────────
// Detect "Meja XX" pattern from QR code scan.
// QR link: wa.me/628xxx?text=Meja%2004 → user sends "Meja 04"

function detectMeja(text) {
  if (!text) return null;
  const match = text.trim().match(/^Meja\s+(\d{1,3})$/i);
  if (!match) return null;
  return { tableNumber: parseInt(match[1], 10) };
}

module.exports = { detectMeja };

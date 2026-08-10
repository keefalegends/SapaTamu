/**
 * Cek apakah pesan mengandung kata kunci eskalasi.
 * Case-insensitive substring match.
 */
function cekEskalasi(pesan, keywords) {
  if (!pesan || !keywords?.length) return false;
  const lower = pesan.toLowerCase();
  return keywords.some(kw => lower.includes(kw));
}

module.exports = { cekEskalasi };

const fs   = require('fs');
const path = require('path');

let _knowledgeText = null;

function getKnowledgeText() {
  if (_knowledgeText) return _knowledgeText;

  const filePath = path.join(__dirname, 'data.json');
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    _knowledgeText = data
      .filter(item => item.topik && item.jawaban)
      .map(item => `Topik: ${item.topik}\nJawaban: ${item.jawaban}`)
      .join('\n\n');
  } catch (err) {
    console.error('[Knowledge] Gagal load data.json:', err.message);
    _knowledgeText = '';
  }
  return _knowledgeText;
}

module.exports = { getKnowledgeText };

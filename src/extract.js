// extract.js — udtræk søgbar TEKST fra dokumenter (lokalt, offline).
// PDF via pdf.js · .docx via fflate (pak ud + strip XML) · tekstfiler direkte. Billeder = ingen (OCR senere).
import { GlobalWorkerOptions, getDocument } from '../vendor/pdf.min.js';
import { unzipSync, strFromU8 } from '../vendor/fflate.min.js';
import { fileKind } from './model.js';
import { log } from './log.js';

GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;

async function pdfText(uint8) {
  const pdf = await getDocument({ data: uint8 }).promise;
  const pages = Math.min(pdf.numPages, 200);
  let out = '';
  for (let i = 1; i <= pages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  return out;
}

function docxText(uint8) {
  try {
    const files = unzipSync(uint8);
    const xml = files['word/document.xml'];
    if (!xml) return '';
    return strFromU8(xml)
      .replace(/<w:p[ >]/g, '\n<w:p ')                 // afsnit → linjeskift
      .replace(/<[^>]+>/g, ' ')                         // fjern alle tags
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#?\w+;/g, ' ')
      .replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  } catch { return ''; }
}

// Returnerer udtrukket tekst (eller '' hvis ikke muligt). Fejler aldrig hårdt.
export async function extractText(blob, name = '', mime = '') {
  const kind = fileKind(mime, name);
  try {
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (kind === 'pdf') return await pdfText(buf);
    if (kind === 'word' && /\.docx$/i.test(name)) return docxText(buf);
    if ((mime || '').startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) return strFromU8(buf).slice(0, 300000);
    return '';
  } catch (e) { log.warn('extract', 'kunne ikke læse tekst af ' + name, e.message); return ''; }
}

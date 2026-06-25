// summarize.js — EKSTRAKTIV opsummering (offline, deterministisk, KAN IKKE hallucinere).
// Vælger de vigtigste EKSISTERENDE passager — opfinder aldrig ny tekst. v5: nøglepunkter + boilerplate-frasortering.

const STOP = new Set((
  'og i jeg det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ' +
  'ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind ' +
  'når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine ' +
  'alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været jer sådan via samt ' +
  'the a an of to in is are was were be been and or for on at by it this that with as from'
).split(' '));

const words = (s) => (s.toLowerCase().match(/[a-zæøåéü0-9]+/gi) || []);

// forkortelser/tal hvor et punktum IKKE afslutter en sætning
const ABBR = /(\b(bl\.a|f\.eks|m\.fl|jf|pkt|nr|stk|kr|ca|inkl|ekskl|evt|osv|mht|iht|vedr|adv|red|tlf|s|t|fx|dvs|p\.t|d\.d)\.?|\b\p{Lu}|\b\d{1,4})\.$/u;

export function splitSentences(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const rough = t.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9"«(])/u);
  const out = [];
  for (const part of rough) {
    if (out.length && ABBR.test(out[out.length - 1].trim())) out[out.length - 1] += ' ' + part;
    else out.push(part);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// del i kandidat-passager: linjer FØRST (bevarer struktur i dokumenter), så sætninger pr. linje
function segment(text) {
  const out = [];
  for (const line of (text || '').split(/\r?\n/)) for (const s of splitSentences(line)) out.push(s.trim());
  return out.filter(Boolean);
}

// boilerplate der ALDRIG er et nøglepunkt (sidehoveder, sidetal, rene datoer, journal-id'er)
const BOILER = [
  /^\s*side\s+\d+\s+af\s+\d+/i, /udskrevet\s*:/i, /^\s*\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4}\b/, /^\s*[\d.\s:\/-]+$/,
  /^\s*(bilag|side|sagsnr\.?|journalnr\.?|j\.?nr\.?|cvr|cpr|tlf|ref\.?)\b/i, /copyright|all rights reserved|cookie/i,
];
const isBoiler = (s) => { const t = s.trim(); return t.length < 18 || t.length > 600 || BOILER.some((r) => r.test(t)); };

function rank(units) {
  const seen = new Set();
  const uniq = units.filter((u) => { const k = u.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; });
  const freq = {};
  for (const s of uniq) for (const w of words(s)) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  return uniq.map((s, i) => {
    const ws = words(s).filter((w) => !STOP.has(w) && w.length > 2);
    return { s, i, score: ws.reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(ws.length || 1) };
  });
}
const shorten = (s, max = 260) => (s.length > max ? s.slice(0, max).replace(/\s\S*$/, '') + '…' : s);

// længde-modes: repræsentér HELE pointen (ikke for kort) — adaptivt efter tekstlængde
export const SUMMARY_MODES = ['kort', 'normal', 'lang'];
const MODES = { kort: { min: 2, max: 3, chars: 220 }, normal: { min: 3, max: 6, chars: 280 }, lang: { min: 5, max: 9, chars: 380 } };

// NØGLEPUNKTER (array af korte uddrag). Hvert punkt er EKSISTERENDE tekst (evt. afkortet). Adaptivt antal.
export function keyPoints(text, mode = 'normal') {
  const cfg = MODES[mode] || MODES.normal;
  let units = segment(text).filter((u) => !isBoiler(u));
  if (!units.length) units = splitSentences(text);          // fallback hvis alt blev filtreret
  if (!units.length) return [];
  const n = Math.max(cfg.min, Math.min(cfg.max, Math.ceil(units.length / 3)));   // flere punkter for længere tekst
  const top = rank(units).sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
  return top.map((x) => shorten(x.s, cfg.chars));
}

// bevaret API: kort opsummering som tekst (nøglepunkter samlet)
export function extractiveSummary(text) { return keyPoints(text, 'normal').join(' '); }

// overskrift = bedste IKKE-boilerplate passage, afkortet (stadig eksisterende tekst)
export function suggestHeading(text, max = 70) {
  let one = keyPoints(text, 1)[0] || splitSentences(text)[0] || (text || '').trim();
  one = one.replace(/^[\s\-–—•·]+/, '').replace(/…$/, '');
  return one.length > max ? one.slice(0, max).replace(/\s\S*$/, '') + '…' : one;
}

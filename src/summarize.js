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

// indholdsord (uden stopord/korte ord) → grundlag for både scoring og dedup
const content = (s) => words(s).filter((w) => !STOP.has(w) && w.length > 2);

// jura-vigtige signaler (dansk): datoer, beløb, frist-/forpligtelses-ord, egennavne midt i sætning
const DATE_RE = /\b\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\b|\b\d{1,2}\.?\s*(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)/i;
const MONEY_RE = /\b\d[\d.\s]*\s*(kr|kroner|dkk)\b|\bkr\.?\s*\d|\d\s*%/i;
const LEGAL_RE = /\b(frist|senest|inden|anke|påkrav|forpligt\w*|skal|aftal\w*|betinget|accept\w*|mislighold\w*|ophæv\w*|erstatning|krav|underskr\w*|opsig\w*|tinglys\w*|sameje)\b/i;
const PROPER_RE = /[a-zæøå),.]\s+[A-ZÆØÅ][a-zæøåA-ZÆØÅ]{2,}/;   // Stort-bogstavsord EFTER et småt ord = navn/egennavn

function juraBoost(s) {
  let b = 1;
  if (DATE_RE.test(s)) b += 0.5;
  if (MONEY_RE.test(s)) b += 0.5;
  if (LEGAL_RE.test(s)) b += 0.4;
  if (PROPER_RE.test(s)) b += 0.2;
  return b;
}

// Jaccard-lighed mellem to token-sæt → fjern nær-dubletter (mere robust end "første 60 tegn")
function jaccard(a, b) { if (!a.size || !b.size) return 0; let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter / (a.size + b.size - inter); }

function rank(units) {
  // 1) dedup: drop sætninger der ligner en allerede beholdt (Jaccard > 0.6)
  const kept = [], sets = [];
  for (const u of units) { const set = new Set(content(u)); if (sets.some((s) => jaccard(set, s) > 0.6)) continue; kept.push(u); sets.push(set); }
  const N = kept.length || 1;
  // 2) TF-IDF: ord der står i MANGE sætninger vægtes ned (idf), distinktive nøgleord op
  const df = {};
  for (const set of sets) for (const w of set) df[w] = (df[w] || 0) + 1;
  const idf = (w) => Math.log((N + 1) / ((df[w] || 0) + 0.5));
  return kept.map((s, i) => {
    const ws = content(s); const tf = {};
    for (const w of ws) tf[w] = (tf[w] || 0) + 1;
    let sc = 0; for (const w in tf) sc += tf[w] * idf(w);
    sc = sc / Math.sqrt(ws.length || 1);
    // 3) positions-vægt (tidlige + sidste sætning = ofte konklusion) + 4) jura-boost
    const pos = i === 0 ? 1.25 : i === 1 ? 1.12 : i === N - 1 ? 1.08 : 1;
    return { s, i, score: sc * juraBoost(s) * pos };
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

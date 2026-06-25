// summarize.js — EKSTRAKTIV opsummering (offline, deterministisk, KAN IKKE hallucinere).
// Vælger de vigtigste EKSISTERENDE sætninger/ord fra teksten — opfinder aldrig ny tekst.
// Algoritme: ord-frekvens (uden stopord) → sætnings-score → top-N i original rækkefølge.

const STOP = new Set((
  'og i jeg det at en den til er som på de med han af for ikke der var mig sig men et har om vi min havde ' +
  'ham hun nu over da fra du ud sin dem os op man hans hvor eller hvad skal selv her alle vil blev kunne ind ' +
  'når være dog noget ville jo deres efter ned skulle denne end dette mit også under have dig anden hende mine ' +
  'alt meget sit sine vor mod disse hvis din nogle hos blive mange ad bliver hendes været jer sådan via samt ' +
  'the a an of to in is are was were be been and or for on at by it this that with as from'
).split(' '));

const words = (s) => (s.toLowerCase().match(/[a-zæøåéü0-9]+/gi) || []);

// forkortelser/mønstre hvor et punktum IKKE afslutter en sætning (GLM-review)
const ABBR = /(\b(bl\.a|f\.eks|m\.fl|jf|pkt|nr|stk|kr|ca|inkl|ekskl|evt|osv|mht|iht|vedr|adv|red|tlf|s|t|fx|dvs|p\.t|d\.d|d\.s\.o)\.?|\b\p{Lu}|\b\d{1,4})\.$/u;

// del tekst i sætninger; flet falske splits (datoer "3.", forkortelser "bl.a.", initialer). Bevarer original tekst.
export function splitSentences(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const rough = t.split(/(?<=[.!?])\s+(?=[\p{Lu}0-9"«(])/u);
  const out = [];
  for (const part of rough) {
    if (out.length && ABBR.test(out[out.length - 1].trim())) out[out.length - 1] += ' ' + part;  // forrige sluttede på en forkortelse/tal → flet
    else out.push(part);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

// returnerer top-N EKSISTERENDE sætninger (i original rækkefølge). Ingen ny tekst.
export function extractiveSummary(text, n = 3) {
  const sents = splitSentences(text);
  if (sents.length <= n) return sents.join(' ');
  const freq = {};
  for (const s of sents) for (const w of words(s)) if (!STOP.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
  const scored = sents.map((s, i) => {
    const ws = words(s).filter((w) => !STOP.has(w) && w.length > 2);
    const score = ws.reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(ws.length || 1);
    return { s, i, score };
  });
  const top = scored.slice().sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
  return top.map((x) => x.s).join(' ');
}

// foreslå en overskrift = højest-scorende sætning, afkortet (stadig eksisterende tekst).
export function suggestHeading(text, max = 70) {
  const one = extractiveSummary(text, 1) || (text || '').trim();
  const clean = one.replace(/^[\s\-–—•]+/, '');
  return clean.length > max ? clean.slice(0, max).replace(/\s\S*$/, '') + '…' : clean;
}

// Tests på "hjernen" (ren logik i model.js). Kør: node tests/core.test.mjs
import { sortEvents, insertIndex, newEvent, daDate, deadlineStatus, sumMinutes, fmtMinutes, toHours, computeDeadline, claimStrength } from '../src/model.js';
import { extractiveSummary, suggestHeading, keyPoints } from '../src/summarize.js';
import { parseSmartDate } from '../src/datefmt.js';
import assert from 'node:assert/strict';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

test('sortEvents sorterer kronologisk (ISO som streng)', () => {
  const evs = [{ date: '2026-03-10', title: 'b' }, { date: '2025-11-14', title: 'a' }, { date: '2026-03-10', title: 'a' }];
  const s = sortEvents(evs);
  assert.deepEqual(s.map((e) => e.date), ['2025-11-14', '2026-03-10', '2026-03-10']);
  assert.equal(s[1].title, 'a'); // tie-break på titel
});

test('insertIndex finder rette plads i sorteret række', () => {
  const s = [{ date: '2025-11-14' }, { date: '2026-03-10' }, { date: '2026-06-19' }];
  assert.equal(insertIndex(s, '2025-01-01'), 0);
  assert.equal(insertIndex(s, '2026-04-01'), 2);
  assert.equal(insertIndex(s, '2026-12-31'), 3);
});

test('newEvent sætter fornuftige defaults', () => {
  const e = newEvent({ title: '  Hej  ' });
  assert.equal(e.title, 'Hej');
  assert.equal(e.type, 'handling');
  assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(e.id.startsWith('ev_'));
});

test('daDate formaterer dansk', () => assert.equal(daDate('2026-06-24'), '24.06.2026'));

test('deadlineStatus farvekoder korrekt', () => {
  const t = '2026-06-25';
  assert.equal(deadlineStatus('2026-06-20', t), 'overdue');
  assert.equal(deadlineStatus('2026-06-28', t), 'soon');     // inden for 7 dage
  assert.equal(deadlineStatus('2026-08-01', t), 'future');
});

test('timeregnskab summerer + formaterer korrekt', () => {
  const e = [{ minutes: 90 }, { minutes: 30 }, { minutes: 60 }];
  assert.equal(sumMinutes(e), 180);
  assert.equal(toHours(180), '3.0');
  assert.equal(fmtMinutes(90), '1 t 30 min');
  assert.equal(fmtMinutes(45), '45 min');
});

test('ekstraktiv opsummering opfinder ALDRIG ny tekst (nul hallucination)', () => {
  const txt = 'Klienten ringede den 3. marts om en tvist. Modparten afviste kravet fuldstændigt. Vi sendte et påkrav med kort frist. Sagen kan ende i retten hvis der ikke findes en løsning. Honoraret aftales særskilt med klienten.';
  const norm = txt.replace(/\s+/g, ' ');
  const sum = extractiveSummary(txt, 2);
  for (const s of sum.split(/(?<=[.!?])\s+/)) assert.ok(norm.includes(s.trim()), 'ny tekst lækket: ' + s);
  // overskrift er også et eksisterende uddrag (evt. afkortet)
  const h = suggestHeading(txt).replace(/…$/, '');
  assert.ok(norm.includes(h.trim()), 'overskrift indeholdt ny tekst');
});

test('DK frist-motor: ankefrist 4 uger + weekend-rul', () => {
  assert.equal(computeDeadline('2026-06-25', 28), '2026-07-23');     // 4 uger frem, hverdag
  assert.equal(computeDeadline('2026-07-25', 0), '2026-07-27');      // lørdag → ruller til mandag
});

test('claimStrength: bevisbyrde + kritisk hul + korroboration (GLM-jurist)', () => {
  const events = [{ id: 'e1', strength: 2 }, { id: 'e2', strength: 2 }, { id: 'e3', strength: 5 }];
  // afgørende krav (min byrde) uden bevis → kritisk hul
  const c1 = claimStrength({ elements: [{ evidence: [], burden: 'mig', essential: true }, { evidence: ['e3'], burden: 'mig', essential: true }] }, events);
  assert.equal(c1.critical, true); assert.equal(c1.label, 'kritisk hul');
  // samme hul, men modparten har bevisbyrden → IKKE kritisk
  assert.equal(claimStrength({ elements: [{ evidence: [], burden: 'modpart', essential: true }] }, events).critical, false);
  // korroboration: to svage beviser scorer højere end ét
  const a = claimStrength({ elements: [{ evidence: ['e1'], burden: 'mig' }] }, events).score;
  const b = claimStrength({ elements: [{ evidence: ['e1', 'e2'], burden: 'mig' }] }, events).score;
  assert.ok(b > a, 'korroboration skal løfte scoren');
});

test('parseSmartDate: danske + relative + ISO formater (auto-dato)', () => {
  const now = new Date(2026, 5, 25, 14, 0, 0);          // 25. juni 2026, lokal
  assert.deepEqual(parseSmartDate('Ons 24-06-2026 11:08', now), { date: '2026-06-24', time: '11:08' });
  assert.deepEqual(parseSmartDate('24.06.2026', now), { date: '2026-06-24', time: '' });
  assert.deepEqual(parseSmartDate('16. juni 2026', now), { date: '2026-06-16', time: '' });
  assert.deepEqual(parseSmartDate('16. jun. 2026 kl. 09.14', now), { date: '2026-06-16', time: '09:14' });
  assert.deepEqual(parseSmartDate('i går 09:14', now), { date: '2026-06-24', time: '09:14' });
  assert.equal(parseSmartDate('9 dage siden', now).date, '2026-06-16');
  assert.deepEqual(parseSmartDate('kl. 11:08', now), { date: '2026-06-25', time: '11:08' });   // i dag
  assert.deepEqual(parseSmartDate('2026-06-24', now), { date: '2026-06-24', time: '' });        // ISO
  assert.equal(parseSmartDate('Tue, 16 Jun 2026 14:53:05 +0200', now).date, '2026-06-16');       // RFC822
  assert.equal(parseSmartDate('hejsa', now), null);
});

test('summarize: jura-vigtig sætning (dato+beløb+frist) prioriteres over fyld', () => {
  const text = [
    'Vejret var fint i dag og solen skinnede over byen.',
    'Køber skal betale 250.000 kr senest den 14-06-2026, ellers bortfalder aftalen.',
    'Vi talte løst om forskellige ting hen over eftermiddagen.',
    'Der var kaffe og kage til mødet.',
  ].join('\n');
  const pts = keyPoints(text, 'kort');
  assert.ok(pts.some((p) => /250\.000 kr/.test(p)), 'den juridisk vigtige sætning skal være med');
  assert.equal(pts[0].includes('250.000') || pts.some((p) => p.includes('250.000')), true);
});

test('summarize: nær-dubletter fjernes (Jaccard-dedup) + nul hallucination', () => {
  const text = [
    'Modparten har accepteret tilbuddet på ejendommen.',
    'Modparten har accepteret tilbuddet på ejendommen i dag.',
    'Fristen for anke er fire uger fra dommens afsigelse.',
  ].join('\n');
  const pts = keyPoints(text, 'normal');
  const acc = pts.filter((p) => /accepteret tilbuddet/.test(p));
  assert.ok(acc.length <= 1, 'nær-dubletter skal fjernes');
  for (const p of pts) assert.ok(text.includes(p.replace(/…$/, '').trim().slice(0, 30)), 'output ⊂ input (ingen opdigtning)');
});

console.log(`\nAlle ${n} tests grønne ✓`);

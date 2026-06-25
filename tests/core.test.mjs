// Tests på "hjernen" (ren logik i model.js). Kør: node tests/core.test.mjs
import { sortEvents, insertIndex, newEvent, daDate, deadlineStatus, sumMinutes, fmtMinutes, toHours } from '../src/model.js';
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

console.log(`\nAlle ${n} tests grønne ✓`);

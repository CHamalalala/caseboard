// connectors.js — tegner forbindelses-tråde fra opsummeringer (frit placeret) til deres begivenheder.
// Hver opsummering har SIN farve. Den valgte fremhæves. Lægges oven på .layout (position:relative).
let svg = null;
const NS = 'http://www.w3.org/2000/svg';

export function clearConnectors() { if (svg) { svg.remove(); svg = null; } }

function ensureSvg(layoutEl) {
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'connectors');
  svg.style.cssText = `position:absolute;left:0;top:0;width:${layoutEl.scrollWidth}px;height:${layoutEl.scrollHeight}px;pointer-events:none;overflow:visible;z-index:4`;
  layoutEl.appendChild(svg);
}

// summaries: alle opsummeringer · selectedId: fremhæv denne (eller null = alle ens)
export function drawConnectors(layoutEl, summaries, selectedId) {
  clearConnectors();
  if (!layoutEl || !summaries || !summaries.length) return;
  const lr = layoutEl.getBoundingClientRect();
  ensureSvg(layoutEl);
  // tegn ikke-valgte først (svagere), så den valgte ligger øverst
  const order = [...summaries].sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0));
  for (const s of order) {
    if (!s.links || !s.links.length) continue;
    const card = layoutEl.querySelector('.card.summary[data-sid="' + CSS.escape(s.id) + '"]');
    if (!card) continue;
    const sel = selectedId && s.id === selectedId;
    const dim = selectedId && !sel;                 // andre dæmpes når én er valgt
    const color = s.color || '#e08a00';
    const sr = card.getBoundingClientRect();
    const sLeft = sr.left - lr.left, sRight = sr.right - lr.left;
    const sy = sr.top - lr.top + Math.min(sr.height, 64) / 2;
    for (const l of s.links) {
      const ec = layoutEl.querySelector('.card.ev[data-id="' + CSS.escape(l.refId) + '"]');
      if (!ec) continue;
      const er = ec.getBoundingClientRect();
      const eLeft = er.left - lr.left, eRight = er.right - lr.left;
      const ey = er.top - lr.top + Math.min(er.height, 42) / 2;
      // vælg de NÆRMESTE kanter, så tråden ikke krydser baglæns til en knude (GLM-review)
      let ex, sx;
      if (sLeft >= eRight) { ex = eRight; sx = sLeft; }        // opsummering til højre for event
      else if (sRight <= eLeft) { ex = eLeft; sx = sRight; }   // opsummering til venstre
      else { ex = eRight; sx = sLeft; }                        // overlap → default
      const mx = (ex + sx) / 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M ${ex} ${ey} C ${mx} ${ey}, ${mx} ${sy}, ${sx} ${sy}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', sel ? 3 : 2);
      path.setAttribute('stroke-dasharray', '5 4');
      path.setAttribute('opacity', dim ? 0.25 : 0.9);
      svg.appendChild(path);
      for (const [x, y] of [[ex, ey], [sx, sy]]) {
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', sel ? 4.5 : 3.5);
        dot.setAttribute('fill', color); dot.setAttribute('opacity', dim ? 0.3 : 1);
        dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', 1.5);
        svg.appendChild(dot);
      }
    }
  }
}

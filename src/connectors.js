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

// activeId: tegn KUN denne opsummerings tråde (valgt eller hover). null → rent lærred, ingen tråde.
// Bevidst on-demand: alle tråde på én gang er visuel støj — man fremkalder forbindelsen for én opsummering ad gangen.
export function drawConnectors(layoutEl, summaries, activeId) {
  clearConnectors();
  if (!layoutEl || !summaries || !summaries.length || !activeId) return;
  const s = summaries.find((x) => x.id === activeId);
  if (!s || !s.links || !s.links.length) return;
  const card = layoutEl.querySelector('.card.summary[data-sid="' + CSS.escape(s.id) + '"]');
  if (!card) return;
  const lr = layoutEl.getBoundingClientRect();
  ensureSvg(layoutEl);
  const color = s.color || '#2b5797';
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
    path.setAttribute('stroke-width', 1.75);            // fin hårstreg i stedet for tyk stiplet
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('opacity', 0.6);
    svg.appendChild(path);
    // én diskret prik i begivenheds-enden (markerer målet uden at fylde)
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', ex); dot.setAttribute('cy', ey); dot.setAttribute('r', 3.5);
    dot.setAttribute('fill', color); dot.setAttribute('opacity', 0.95);
    dot.setAttribute('stroke', '#fff'); dot.setAttribute('stroke-width', 1.5);
    svg.appendChild(dot);
  }
}

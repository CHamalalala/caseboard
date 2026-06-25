// connectors.js — tegner forbindelses-streger fra den valgte opsummering til dens begivenheder.
// Et SVG-lag lægges oven på .layout (position:relative). Koordinater er layout-relative,
// så de holder ved scroll; gen-tegnes ved resize/render.
let svg = null;
const NS = 'http://www.w3.org/2000/svg';

export function clearConnectors() { if (svg) { svg.remove(); svg = null; } }

export function drawConnectors(layoutEl, summary) {
  clearConnectors();
  if (!layoutEl || !summary) return;
  const sumCard = layoutEl.querySelector('.card.summary.selected');
  if (!sumCard) return;
  const evCards = (summary.links || [])
    .map((l) => layoutEl.querySelector('.card.ev[data-id="' + CSS.escape(l.refId) + '"]')).filter(Boolean);
  if (!evCards.length) return;

  const lr = layoutEl.getBoundingClientRect();
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'connectors');
  svg.style.cssText = `position:absolute;left:0;top:0;width:${layoutEl.scrollWidth}px;height:${layoutEl.scrollHeight}px;pointer-events:none;overflow:visible;z-index:4`;

  const sr = sumCard.getBoundingClientRect();
  const sx = sr.left - lr.left;                 // venstre kant af opsummeringen (sidder til højre)
  const sy = sr.top - lr.top + Math.min(sr.height, 60) / 2;

  for (const ec of evCards) {
    const er = ec.getBoundingClientRect();
    const ex = er.right - lr.left;              // højre kant af begivenheden (sidder til venstre)
    const ey = er.top - lr.top + Math.min(er.height, 42) / 2;
    const mx = (ex + sx) / 2;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', `M ${ex} ${ey} C ${mx} ${ey}, ${mx} ${sy}, ${sx} ${sy}`);
    path.setAttribute('class', 'conn');
    svg.appendChild(path);
    for (const [x, y] of [[ex, ey], [sx, sy]]) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 4); dot.setAttribute('class', 'conndot');
      svg.appendChild(dot);
    }
  }
  layoutEl.appendChild(svg);
}

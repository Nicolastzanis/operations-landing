/**
 * Features page: the sticky module rail's scroll-spy.
 *
 * Everything else on this page — the hero canvas, nav drawer, reveals,
 * pointer tilt, anchor scrolling — comes from main.js.
 */

const modules = [...document.querySelectorAll('[data-module]')];
const railLinks = new Map(
  [...document.querySelectorAll('[data-rail-item]')].map((a) => [a.dataset.railItem, a])
);

if (modules.length && railLinks.size) {
  let activeId = null;

  const setActive = (id) => {
    if (id === activeId) return;
    if (activeId) railLinks.get(activeId)?.classList.remove('is-active');
    activeId = id;
    const link = railLinks.get(id);
    if (!link) return;
    link.classList.add('is-active');

    // On mobile the rail is a horizontal scroller — keep the active chip in view.
    if (window.innerWidth <= 900) {
      link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  };

  // Pick whichever module is nearest a line ~30% down the viewport. A single
  // reference line avoids the ambiguity of two modules both "intersecting"
  // on tall screens.
  const spy = () => {
    const line = window.innerHeight * 0.3;
    let best = null;
    let bestDist = Infinity;
    for (const m of modules) {
      const rect = m.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const dist = Math.abs(rect.top - line);
      if (dist < bestDist) { bestDist = dist; best = m; }
    }
    if (best) setActive(best.dataset.module);
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { spy(); ticking = false; });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  spy();
}

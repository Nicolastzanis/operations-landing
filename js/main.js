/**
 * Nomous — site bootstrap.
 *
 * Every motion section is declared in markup, not here:
 *
 *   <section class="scroll-track"
 *            style="--track-height: 450vh"   <- scroll distance / scrub speed
 *            data-scroll-canvas               <- marks it as a motion section
 *            data-name="security"             <- assets/frames/<name>/<name>_0001.webp
 *            data-frames="121"                <- frame count from extract-frames.sh
 *            data-ease="0.065"                <- brake weight (lower = heavier)
 *            data-preload="eager">            <- omit for lazy (default)
 *
 * Adding a fourth section means adding markup and frames. No edits below.
 */

import { ScrollCanvas } from './scroll-canvas.js';

const FRAME_EXT = 'webp'; // switch to 'jpg' if you extracted JPEG frames
const PAD = 4;            // zero-padding in filenames: hero_0001.webp

/**
 * Reveals overlay copy across a scroll window declared per block via
 * data-enter / data-exit (0-1 through the section).
 */
function bindOverlay(section) {
  const blocks = [...section.querySelectorAll('.overlay__block')];
  const ranges = blocks.map((el) => ({
    el,
    enter: parseFloat(el.dataset.enter ?? '0'),
    exit: parseFloat(el.dataset.exit ?? '1'),
    active: false,
  }));

  return (progress) => {
    for (const r of ranges) {
      const shouldShow = progress >= r.enter && progress < r.exit;
      if (shouldShow === r.active) continue; // only touch the DOM on change
      r.active = shouldShow;
      r.el.classList.toggle('is-active', shouldShow);
    }
  };
}

/**
 * Fades out the "Scroll" cue the first moment progress moves off zero, and
 * never re-shows it — a one-shot hint, not a persistent nag.
 */
function bindScrollCue(section) {
  const cue = section.querySelector('[data-scroll-cue]');
  if (!cue) return null;
  let dismissed = false;
  return (progress) => {
    if (dismissed || progress <= 0.025) return;
    dismissed = true;
    cue.classList.add('is-hidden');
  };
}

function initSection(section) {
  const name = section.dataset.name;
  const frameCount = parseInt(section.dataset.frames, 10);
  const canvas = section.querySelector('[data-canvas]');

  if (!name || !frameCount || !canvas) {
    console.warn('[nomous] skipping malformed motion section', section);
    return null;
  }

  const onOverlay = bindOverlay(section);
  const onCue = bindScrollCue(section);

  return new ScrollCanvas({
    canvas,
    container: section,
    frameCount,
    ease: parseFloat(section.dataset.ease ?? '0.075'),
    preload: section.dataset.preload === 'eager' ? 'eager' : 'lazy',
    framePath: (i) =>
      `assets/frames/${name}/${name}_${String(i).padStart(PAD, '0')}.${FRAME_EXT}`,
    onFrame: (p) => { onOverlay(p); onCue?.(p); },
  });
}

/* ---------------------------------------------------------------
   Boot
   --------------------------------------------------------------- */

const sections = [...document.querySelectorAll('[data-scroll-canvas]')];
// Keep nulls here so indices stay aligned with `sections`; compact only after
// the eager instance has been matched to its element.
const built = sections.map(initSection);
const instances = built.filter(Boolean);

/* Loader — tracks the eager (above-the-fold) sequence only. Lazy sections
   stream in later and must not hold up first paint. */
const loader = document.querySelector('[data-loader]');
const loaderFill = document.querySelector('[data-loader-fill]');
const hero = built.find((inst, i) => inst && sections[i].dataset.preload === 'eager');

if (loader) {
  const dismiss = () => loader.classList.add('is-done');

  if (!hero) {
    dismiss();
  } else {
    hero.onProgress = (p) => {
      if (loaderFill) loaderFill.style.width = `${Math.round(p * 100)}%`;
    };
    hero.onReady = dismiss;
    // Never let a stalled CDN response trap the visitor behind the loader.
    setTimeout(dismiss, 8000);
  }
}

/* Nav hairline on scroll. */
const nav = document.querySelector('[data-nav]');
if (nav) {
  const sync = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

/* Anchor links: the engine owns the scroll feel, so jump instantly rather
   than layering CSS smooth-scroll on top of the lerp. */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    // getBoundingClientRect + scrollY, not offsetTop: offsetTop is measured
    // against the nearest positioned ancestor, so it's wrong for anything
    // nested (the feature modules sit inside a positioned grid).
    // scroll-margin-top keeps the sticky nav from covering the anchor.
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const top = target.getBoundingClientRect().top + window.scrollY - margin;
    window.scrollTo({ top, behavior: 'auto' });
  });
});

/* Mobile nav drawer. */
const burger = document.querySelector('[data-burger]');
if (nav && burger) {
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
  // Close on navigation and on Escape.
  nav.querySelectorAll('.nav__links a').forEach((a) =>
    a.addEventListener('click', () => setOpen(false))
  );
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
}

/* Reveal on scroll — used by every page. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const revealTargets = document.querySelectorAll('[data-reveal]');

if (reducedMotion || !('IntersectionObserver' in window)) {
  revealTargets.forEach((el) => el.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target); // one-shot
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );
  revealTargets.forEach((el) => revealObserver.observe(el));
}

/* FAQ disclosure. */
document.querySelectorAll('[data-faq]').forEach((item) => {
  const btn = item.querySelector('.faq__q');
  const panel = item.querySelector('.faq__a');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const open = item.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
});

/* Contact form. Posts to server.py's /api/contact, which sends through
   Resend after verifying the reCAPTCHA token server-side. */
document.querySelectorAll('[data-contact-form]').forEach((form) => {
  const status = form.querySelector('[data-form-status]');
  const btn = form.querySelector('button[type="submit"]');
  const get = (n) => (form.elements[n]?.value || '').trim();

  const showStatus = (ok, text) => {
    if (!status) return;
    status.textContent = text;
    status.style.color = ok ? '#15803d' : '#b91c1c';
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    const recaptchaToken = (typeof grecaptcha !== 'undefined') ? grecaptcha.getResponse() : '';
    if (!recaptchaToken) {
      showStatus(false, "Please confirm you're not a robot before sending.");
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending…';
    showStatus(true, '');

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: get('name'),
        email: get('email'),
        telegram: get('telegram'),
        subject: get('subject'),
        message: get('message'),
        recaptchaToken,
      }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
        if (ok) {
          showStatus(true, 'Message sent. We will get back to you as soon as possible.');
          btn.textContent = 'Message sent';
          form.reset();
        } else {
          showStatus(false, data.error || 'Something went wrong. Please email us directly at hello@nomous.tech.');
          btn.disabled = false;
          btn.textContent = 'Send Message';
        }
      })
      .catch(() => {
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
        showStatus(false, 'Something went wrong. Please email us directly at hello@nomous.tech.');
        btn.disabled = false;
        btn.textContent = 'Send Message';
      });
  });
});

/* Pointer tilt. Deliberately shallow (max ~3deg) — enough to feel responsive
   and three-dimensional; past that it visibly distorts the artwork. */
if (!reducedMotion && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const MAX_DEG = 3;
  for (const el of document.querySelectorAll('[data-tilt]')) {
    let frame = null;
    el.style.transformStyle = 'preserve-3d';

    el.addEventListener('pointermove', (e) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const r = el.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 … 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform =
          `perspective(1100px) rotateX(${(-ny * MAX_DEG).toFixed(2)}deg) ` +
          `rotateY(${(nx * MAX_DEG).toFixed(2)}deg) translate3d(0,-2px,0)`;
      });
    });

    el.addEventListener('pointerleave', () => {
      if (frame) { cancelAnimationFrame(frame); frame = null; }
      el.style.transform = '';
    });
  }
}

/* Exposed for tuning from the console:
     nomous[0].setEase(0.04)  -> much heavier brake
     nomous[0].setEase(0.15)  -> tighter, more responsive  */
window.nomous = instances;

/* ── Product tour: tab-switched screenshots with a soft crossfade ─────────── */
for (const tour of document.querySelectorAll('[data-tour]')) {
  const img = tour.querySelector('[data-tour-img]');
  const cap = tour.querySelector('[data-tour-caption]');
  const tabs = [...tour.querySelectorAll('.tour__tab')];
  // fetch ahead so the first click doesn't show a blank frame
  for (const t of tabs) { const pre = new Image(); pre.src = `assets/screens/${t.dataset.shot}.webp`; }
  for (const t of tabs) {
    t.addEventListener('click', () => {
      tabs.forEach(x => { x.classList.toggle('is-active', x === t); x.setAttribute('aria-selected', x === t); });
      img.classList.add('is-swapping');
      setTimeout(() => {
        img.src = `assets/screens/${t.dataset.shot}.webp`;
        img.onload = () => img.classList.remove('is-swapping');
      }, 180);
      if (cap) cap.textContent = t.dataset.caption || '';
    });
  }
}

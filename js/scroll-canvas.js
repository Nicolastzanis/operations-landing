/**
 * ScrollCanvas — scroll-driven frame-sequence playback with momentum braking.
 *
 * Each instance owns one <canvas> pinned with `position: sticky` inside a tall
 * container. Scroll position maps to a frame index, but the index is never read
 * straight from the scrollbar: the raw value feeds a `target`, and a `current`
 * value chases it via linear interpolation every rAF tick. Because the gap
 * closes by a fixed *fraction* per frame, motion decays exponentially — the
 * sequence keeps gliding after the wheel stops and eases into rest instead of
 * halting dead. That decay is the "braking" feel.
 */

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

export class ScrollCanvas {
  /**
   * @param {object}   opts
   * @param {HTMLCanvasElement} opts.canvas    the sticky canvas element
   * @param {HTMLElement} opts.container       tall scroll track wrapping the canvas
   * @param {(i:number)=>string} opts.framePath maps 1-based index -> image URL
   * @param {number}   opts.frameCount         total frames in the sequence
   * @param {number}  [opts.ease=0.075]        0-1. Lower = heavier, longer brake.
   * @param {number}  [opts.settleEpsilon=0.00005] gap below which motion is "at rest"
   * @param {'eager'|'lazy'} [opts.preload='lazy'] 'eager' fetches on construction;
   *        'lazy' waits until the section is within `preloadMargin` of the viewport.
   *        Use 'eager' only for the above-the-fold sequence.
   * @param {string}  [opts.preloadMargin='150%'] rootMargin that triggers a lazy load
   * @param {(p:number)=>void} [opts.onProgress] load progress 0-1
   * @param {(s:ScrollCanvas)=>void} [opts.onReady] fired once all frames decode
   * @param {(p:number)=>void} [opts.onFrame] eased progress 0-1, per rendered tick
   */
  constructor({
    canvas,
    container,
    framePath,
    frameCount,
    ease = 0.075,
    settleEpsilon = 0.00005,
    preload = 'lazy',
    preloadMargin = '150%',
    onProgress,
    onFrame,
    onReady,
  }) {
    this.canvas = canvas;
    this.container = container;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.framePath = framePath;
    this.frameCount = frameCount;
    this.ease = ease;
    this.settleEpsilon = settleEpsilon;
    this.onProgress = onProgress;
    this.onFrame = onFrame;
    this.onReady = onReady;

    this.preloadMargin = preloadMargin;
    this.frames = new Array(frameCount);
    this.loaded = 0;
    this.ready = false;
    this.loadStarted = false;

    this.target = 0;        // where the scrollbar says we are
    this.current = 0;       // where the animation actually is (lags behind)
    this.renderedIndex = -1;
    this.visible = false;
    this.running = false;
    this.lastTime = 0;

    // Users who ask for reduced motion get the frame snapped to the scrollbar:
    // still fully scrubbable, just no glide.
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._tick = this._tick.bind(this);
    this._onResize = this._onResize.bind(this);
    this._wake = this._wake.bind(this);

    this._bind();
    this._resize();
    if (preload === 'eager') this._load();
    else this._observeForLoad();
  }

  /**
   * Hold the frame fetch until the section is within `preloadMargin` of the
   * viewport. Three 121-frame sequences are ~20MB combined; loading them all on
   * first paint would stall the hero. This spends that budget only as the user
   * actually travels toward each section.
   */
  _observeForLoad() {
    this.loadObserver = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        this.loadObserver.disconnect();
        this.loadObserver = null;
        this._load();
      },
      { rootMargin: `${this.preloadMargin} 0px ${this.preloadMargin} 0px` }
    );
    this.loadObserver.observe(this.container);
  }

  _bind() {
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('scroll', this._wake, { passive: true });

    // Only burn rAF while the section is actually on screen. The generous
    // rootMargin keeps the loop warm just off-viewport so the first frame after
    // entry is already correct rather than snapping into place.
    this.observer = new IntersectionObserver(
      ([entry]) => {
        this.visible = entry.isIntersecting;
        if (this.visible) this._wake();
      },
      { rootMargin: '25% 0px 25% 0px' }
    );
    this.observer.observe(this.container);
  }

  _onResize() {
    this._resize();
    this.renderedIndex = -1; // force a redraw at the new backing-store size
    this._wake();
  }

  _resize() {
    // Cap DPR at 2 — beyond that the pixel cost climbs fast with no visible gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
  }

  _load() {
    if (this.loadStarted) return;
    this.loadStarted = true;

    const first = this._loadFrame(0);

    // Paint frame 1 the moment it decodes so the section is never blank.
    first.then(() => this._draw(0)).catch(() => {});

    const rest = [];
    for (let i = 1; i < this.frameCount; i++) rest.push(this._loadFrame(i));

    Promise.allSettled([first, ...rest]).then(() => {
      this.ready = true;
      this.onReady?.(this);
      this._wake();
    });
  }

  _loadFrame(i) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = this.framePath(i + 1);
      const done = () => {
        this.frames[i] = img;
        this.loaded++;
        this.onProgress?.(this.loaded / this.frameCount);
        resolve(img);
      };
      // decode() moves the cost off the first paint; fall back if unsupported.
      img.onload = () => (img.decode ? img.decode().then(done, done) : done());
      img.onerror = () => {
        this.loaded++;
        this.onProgress?.(this.loaded / this.frameCount);
        reject(new Error(`frame ${i + 1} failed: ${img.src}`));
      };
    });
  }

  /** Raw scroll progress through the container, 0-1. */
  _scrollProgress() {
    const rect = this.container.getBoundingClientRect();
    const scrollable = this.container.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return 0;
    return clamp(-rect.top / scrollable, 0, 1);
  }

  _wake() {
    if (this.running || !this.visible) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this._tick);
  }

  _tick(now) {
    if (!this.visible) { this.running = false; return; }

    const dt = Math.min(now - this.lastTime, 100); // clamp tab-switch spikes
    this.lastTime = now;

    this.target = this._scrollProgress();

    if (this.reducedMotion) {
      this.current = this.target;
    } else {
      // Frame-rate-independent lerp. A raw `current += gap * ease` brakes faster
      // on a 120Hz display than on 60Hz because it runs twice as often; the
      // pow() rewrites the per-frame fraction as a per-millisecond decay so the
      // brake feels identical at any refresh rate.
      const t = 1 - Math.pow(1 - this.ease, (dt * 60) / 1000);
      this.current += (this.target - this.current) * t;
    }

    const gap = Math.abs(this.target - this.current);
    const settled = gap < this.settleEpsilon;
    if (settled) this.current = this.target;

    const index = clamp(
      Math.round(this.current * (this.frameCount - 1)),
      0,
      this.frameCount - 1
    );
    if (index !== this.renderedIndex) this._draw(index);
    this.onFrame?.(this.current);

    // Park the loop once motion has decayed to nothing; the scroll listener
    // and IntersectionObserver restart it.
    if (settled) { this.running = false; return; }
    requestAnimationFrame(this._tick);
  }

  _draw(index) {
    const img = this.frames[index];
    if (!img || !img.complete || !img.naturalWidth) return;

    const { ctx, canvas } = this;
    const cw = canvas.width;
    const ch = canvas.height;
    if (!cw || !ch) return;

    // object-fit: cover, computed manually — canvas has no CSS equivalent.
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const canvasRatio = cw / ch;
    let dw, dh;
    if (imgRatio > canvasRatio) {
      dh = ch;
      dw = ch * imgRatio;
    } else {
      dw = cw;
      dh = cw / imgRatio;
    }
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    this.renderedIndex = index;
  }

  /** Retune the brake at runtime. Lower = heavier. */
  setEase(ease) {
    this.ease = clamp(ease, 0.001, 1);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._wake);
    this.observer?.disconnect();
    this.loadObserver?.disconnect();
    this.running = false;
    this.visible = false;
    this.frames.length = 0;
  }
}

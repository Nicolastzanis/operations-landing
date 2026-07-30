# Nomous

Static marketing site. Dark hero into a light body with animated wave
dividers, plus one scroll-scrubbed `<canvas>` frame sequence (security).

```
├── index.html                 home — static hero + security sequence
├── features.html              the eight platform modules
├── pricing.html               plan + FAQ
├── about.html                 story + principles
├── contact.html               channels + message form
├── privacy.html / terms.html  legal
├── css/
│   ├── style.css              tokens, nav, stage, overlay, shared primitives
│   ├── sections.css           hero, waves, steps, plan, FAQ, footer…
│   └── features.css           module rail + screenshot frames
├── js/
│   ├── scroll-canvas.js       the engine (physics, loading, rendering)
│   ├── main.js                engines, nav drawer, reveals, tilt, FAQ, form
│   └── features.js            module rail scroll-spy
├── scripts/extract-frames.sh  video -> optimized frame sequence
├── assets/video/              source .mp4 files
├── assets/frames/<name>/      <name>_0001.webp …
└── assets/screens/            product screenshots (WebP)
```

`js/main.js` runs on every page — it boots any `[data-scroll-canvas]` section
it finds, handles the nav drawer, reveals, tilt, FAQ and the contact form.
Only `index.html` still has a canvas section.

## Nav and footer

Every page carries the same nav (Features · Pricing · About Us · Contact ·
Get Started) and the same four-column footer. They are duplicated in each HTML
file — there is no templating layer in this static build, so **a nav or footer
change has to be applied to all seven pages**. If that becomes annoying, the
natural next step is a small build step (Eleventy, Astro) or HTML includes.

Below 900px the nav collapses to a burger drawer. All five items stay
reachable — the earlier build hid them entirely at narrow widths.

## Content sourcing

Copy came from the existing `nomous.tech` pages and
`~/Desktop/operations-landing`. Two things were normalised on the way in:

- **Module count.** The old pages disagreed — About said 6, Pricing said 7,
  Features listed 8. Everything now says **8**.
- **Legal pages** were carried across verbatim rather than reworded, since
  they are regulated copy. Only the surrounding markup changed.

The contact form has **no backend**. `main.js` composes a `mailto:` from the
fields on submit and hands off to the visitor's mail client. Replace
`data-mailto-form` with a real `action`/`method` once an endpoint exists.

## Run it

```bash
python3 -m http.server 5173
```

Then open <http://localhost:5173>. It must be served over HTTP — opening
`index.html` from `file://` breaks ES module imports.

## Theme

The site follows the YambaPay pattern: a **dark nav, a dark hero, then a light
body, and a dark footer**, with animated wave dividers at every dark↔light
boundary.

`css/style.css` holds light-first tokens (`--bg: #fff`, `--bg-alt: #f5f5f7`,
slate-900 text). Any dark band carries **`.theme-dark`**, which re-points the
*same* token names to their dark values. Components therefore work on either
background with no per-surface variant class:

```html
<section class="hero theme-dark"> … </section>
<footer  class="site-footer theme-dark"> … </footer>
```

One exception: `.nav` is a dark bar but deliberately *not* `.theme-dark`, since
that would overwrite its translucent background. It opts into the dark button
treatment explicitly (`.nav .btn--ghost`). Without that, its "Get Started"
label renders slate-900 on navy — invisible.

### Waves

```html
<div class="wave" style="--wave-to: #ffffff"> … three <path>s … </div>
<div class="wave wave--up" style="--wave-to: #ffffff"> … </div>
```

Three offset crests scroll horizontally on an 18s loop, then dissolve into
`--wave-to`. `.wave--up` is rotated 180° for a light→dark transition; the
default goes dark→light. **Set `--wave-to` to whatever surface follows** —
`#ffffff` before a white section, `#f5f5f7` before a grey one, or the seam
shows.

### Type

**Playfair Display** (700–900, plus italics) for every display heading —
`.display`, `.headline`, `.hero__title`, `.module__title`, `.plan__price`.
Inter for body, JetBrains Mono for labels. Change `--display-font` in
`style.css` to swap the whole editorial voice at once.

## The hero

`index.html` opens with a **static hero — no canvas, no frame sequence.** It is
a navy gradient, three heavily blurred orbs on a 14s drift, eight rising
particles, and an SVG hub, all CSS/SMIL. Nothing to preload, so no loader.

The visual is a **centre hub built around the logo**
(`assets/brand/logo-n.webp`). The flow chains in from the left and fans out:

```
MT5 server → Live data → [ N ] → Pricing Monitor
                                 Risk Monitor
                                 Alerts
                                 Nomous AI
```

Packets are sequenced (indigo inbound, teal outbound, staggered `begin`) so the
eye follows the direction of travel — the hub visibly *processes*.

Logo source is `~/Desktop/Nomous NEW Logo.png` (9921×7016). Cropped to its
content bbox and exported at 512px — **217K PNG → 20K WebP**:

```bash
python3 -c "from PIL import Image; s=Image.open('<src>.png'); i=s.crop(s.getbbox()); i.thumbnail((512,512), Image.LANCZOS); i.save('assets/brand/logo-n.png')"
cwebp -q 90 -alpha_q 100 -m 6 assets/brand/logo-n.png -o assets/brand/logo-n.webp
```

## How the motion works

Scroll position is never read straight onto the frame index. The raw value
feeds `target`; a separate `current` chases it every rAF tick:

```js
current += (target - current) * ease;
```

Because the gap closes by a fixed *fraction* each tick, the remaining distance
decays exponentially — motion keeps gliding after the wheel stops and eases
into rest instead of halting dead. That decay is the braking feel.

The per-tick fraction is rewritten as a per-millisecond decay
(`1 - Math.pow(1 - ease, dt * 60 / 1000)`) so the brake feels identical on a
60Hz and a 144Hz display. Verified: 0.6206 / 0.6235 / 0.6206 at 60/120/144Hz.

### Tuning the brake

`data-ease` on each section. Lower = heavier, longer glide.

| Value | Feel |
|-------|------|
| 0.04  | very heavy, cinematic |
| 0.07  | current hero setting |
| 0.12  | responsive |
| 0.25  | nearly locked to the scrollbar |

Live-tune from the console, then write the value back into the markup:

```js
nomous[0].setEase(0.04)
```

`--track-height` controls scroll distance — how far you scroll to cross the
sequence. Taller = slower, more deliberate scrub.

## Adding a section

Markup only — no JS changes:

```html
<section class="scroll-track"
         style="--track-height: 450vh; --scrim: 0.3"
         data-scroll-canvas
         data-name="vault"      <!-- assets/frames/vault/vault_0001.webp -->
         data-frames="121"      <!-- count printed by extract-frames.sh -->
         data-ease="0.07">
  <div class="scroll-stage">
    <canvas class="scroll-stage__canvas" data-canvas></canvas>
    <div class="overlay">
      <div class="overlay__block" data-enter="0" data-exit="0.5">
        <h2 class="headline">Your copy</h2>
      </div>
    </div>
  </div>
</section>
```

`data-enter` / `data-exit` are progress values (0–1) through that section —
each copy block declares its own scroll window and fades in and out on cue.
Blocks stack in one grid cell, so they cross-fade without layout shift.

Alignment: `overlay--left`, `overlay--right`, `overlay--bottom` on `.overlay`.

`--scrim` (default 0.3) is how hard the frame is darkened behind copy. Lower it
for already-dark clips — the dashboard runs 0.1.

## Extracting frames

```bash
./scripts/extract-frames.sh <input.mp4> <name> [fps] [width] [format] [quality] [start] [dur]
```

What was run for this build:

```bash
./scripts/extract-frames.sh assets/video/hero.mp4      hero      24 1600 webp 82
./scripts/extract-frames.sh assets/video/dashboard.mp4 dashboard 24 1600 webp 82
./scripts/extract-frames.sh assets/video/security.mp4  security  24 1600 webp 82
```

No trim is needed on the current clips — all three open on usable frames.
Check any new clip for a black or empty opening before wiring it up, since
that wastes the first stretch of the user's scroll on nothing. The earlier
dashboard clip needed `0.95` for exactly that reason.

### Art direction

Hero and dashboard are dark glass-architecture interiors with floating
candlestick charts in blue and amber — both compose around a clear centre or
left third, which is why the overlay copy stays legible without a heavy scrim.
The first-generation clips (fiber-optic node, glass slab) are kept in
`assets/video/archive/` if you ever want them back.

Note the palette: those clips use blue + **amber**, while the site's
`--accent-warm` is green (`#2fd6a5`). It reads fine — blue/amber is the
conventional up/down pairing in trading UIs — but if you want them to agree,
change `--accent-warm` in `css/style.css` rather than regenerating footage.

Requires `ffmpeg` and `webp`:

```bash
brew install ffmpeg webp
```

This ffmpeg build has no `libwebp` encoder, so the script routes WebP through
`cwebp` (PNG intermediates, encoded in parallel). JPEG comes straight out of
ffmpeg — pass `jpg` as the format and set `FRAME_EXT = 'jpg'` in `js/main.js`.

### Sizing

1600px wide is the sweet spot for canvas scrubbing. 4K frame sequences are
counterproductive — the payload multiplies while the canvas still rasterizes at
viewport size. Current cost:

| Sequence  | Frames | Size |
|-----------|--------|------|
| security  | 121    | 4.6M |

**Only the security sequence remains.** The hero and dashboard sequences were
removed; their source clips are in `assets/video/` and `assets/video/archive/`
and can be re-extracted at any time.

**`data-frames` in the markup must match what the script prints.** It is
declared in `index.html` and, for the dashboard sequence, again in
`features.html` — re-extracting a clip at a different length means updating
both.

Only the hero loads up front (`data-preload="eager"`). The other two fetch when
they come within 150% of the viewport, so they never delay first paint.

To cut weight further: drop to `20` fps, or `1280` width, or quality `76`.

## Performance notes

- The rAF loop parks itself once motion settles and restarts on scroll, so an
  idle page burns no frames.
- Sections outside the viewport don't tick at all (IntersectionObserver).
- Frames are only redrawn when the frame *index* changes, not every tick.
- DPR is capped at 2.
- `prefers-reduced-motion` snaps the frame straight to the scrollbar — still
  fully scrubbable, just without the glide.

## Features page

`features.html` documents the eight modules. Content came from the existing
`nomous.tech/features.html`; the screenshots came from
`~/Desktop/operations-landing/assets/screens/` and were converted PNG → WebP at
1600px wide, which took them from **2.1 MB to 356 KB**.

Structure: a sticky module rail on the left with scroll-spy, module blocks on
the right, each ending in a framed screenshot. Futuristic treatment is a
drifting CSS grid field, monospace route labels (`/pricing`, `/risk`), pulsing
live dots, a hover scanline sweep, and a shallow (3°) pointer tilt on the
frames. All of it drops out under `prefers-reduced-motion`.

Screenshots carry explicit `width`/`height` attributes. They are lazy-loaded,
and without intrinsic dimensions the browser can't reserve space — content
below jumped as each one arrived. Verified zero shift after the fix. **Keep
those attributes when swapping a screenshot**, and update them if the new
image has a different aspect ratio:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
  -of csv=p=0:s=x assets/screens/pricing-monitor.webp
```

To re-convert a screenshot:

```bash
cwebp -q 84 -resize 1600 0 -m 6 input.png -o assets/screens/output.webp
```

## Replacing the footage

Drop a new `.mp4` into `assets/video/`, re-run the extract script, and update
`data-frames` to the count it prints. Nothing else changes.

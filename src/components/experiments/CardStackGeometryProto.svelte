<!-- PROTOTYPE (issue #98) — throwaway. One route, scrubable controls, the whole
     D1 occlusion geometry at once. Not production code: no tests, no a11y pass,
     no store. Geometry lives in ./proto-geometry.ts so #99 can lift it. -->
<script lang="ts">
  import { computeGeometry, type GeoParams, type BottomEdge } from './proto-geometry';

  type Kind = 'lens' | 'short' | 'long' | 'puzzle';

  // ── scrubable inputs ────────────────────────────────────────────────
  let depth = $state(6);
  let activeIndex = $state(3);
  let lengths = $state<'short' | 'mixed' | 'long' | 'puzzle'>('mixed');
  let loadState = $state<'ready' | 'placeholder'>('ready');

  // ── parameter knobs, one per open question ──────────────────────────
  let collapsedWidth = $state(48);
  let stagger = $state(8);
  let forwardOverlap = $state(16);
  let backwardStrip = $state(3);
  let forwardFan = $state(2);
  let ditherMid = $state(3);
  let ditherStep = $state(2);
  let bottomEdge = $state<BottomEdge>('staircase');
  let headerMode = $state<'rotated' | 'horizontal' | 'icon'>('rotated');
  let depth1Page = $state(true);
  let revealMode = $state<'clip' | 'dissolve'>('clip');
  // Surfaced by the puzzle fixture: an opaque spine means every collapsed card
  // crops to an identical title strip, showing nothing of the card itself —
  // which sits awkwardly against #67's "a preview IS the card". The
  // alternative lets the card's own leftmost 48px show through. Legible vs
  // truthful; the prototype should not pick for you.
  let spineBacking = $state<'opaque' | 'content'>('opaque');
  let activeWidth = $state(680);
  let panelOpen = $state(true);

  // ── fixtures ────────────────────────────────────────────────────────
  const TITLES = [
    'Home', 'Most* Interesting', 'Cityscrapers', 'Plans of a Medic',
    'SeeThrough Studios', 'Particulars', 'Svalbard, day 3', 'Numbeanies',
    'Puzzles', 'A very long card title that will not fit in a spine',
  ];

  const kindFor = (i: number): Kind => {
    if (i === 0) return 'lens';
    if (lengths === 'mixed') return (['short', 'long', 'puzzle', 'long'] as Kind[])[i % 4];
    return lengths as Kind;
  };

  const PARA =
    'The stack is the path you walked, and a path can pass the same place twice. ' +
    'Every card here is a full-size opaque node; what you read as a collapsed ' +
    'spine is the same card, cropped by the one in front of it. Printing never moves.';

  const paras = (n: number) => Array.from({ length: n }, (_, k) => `${k + 1}. ${PARA}`);

  const params = $derived<GeoParams>({
    collapsedWidth, stagger, forwardOverlap, backwardStrip, forwardFan,
    ditherMid, ditherStep, bottomEdge, activeWidth,
  });
  const geo = $derived(computeGeometry(depth, activeIndex, params));
  const pageMode = $derived(depth === 1 && depth1Page);

  // Reveal replays on demand so the dissolve/clip can be judged repeatedly.
  let revealed = $state(true);
  function replayReveal() {
    revealed = false;
    requestAnimationFrame(() => requestAnimationFrame(() => (revealed = true)));
  }
  $effect(() => { activeIndex; depth; loadState; replayReveal(); });

  // ── shimmer test ────────────────────────────────────────────────────
  let shimmerOn = $state(false);
  let shimmerMove = $state(false);
</script>

<div class="proto-viewport" style={`--cw:${collapsedWidth}px; --w:${activeWidth}px; --ctl-w:${panelOpen ? 320 : 0}px;`}>
  <div class="proto-rail">
    <div class="proto-stack" class:page={pageMode}>
      {#each geo.cards as c (c.index)}
        {@const kind = kindFor(c.index)}
        {@const active = c.role === 'active'}
        <article
          class="pc"
          class:pc--ahead={c.role === 'ahead'}
          class:pc--active={active}
          class:pc--page={active && pageMode}
          style={`
            left:${c.left}px; top:${c.top}px; z-index:${c.z};
            --left-col:${active ? 0 : collapsedWidth}px;
            --extra:${c.extraHeight}px;
            --spine-bg:${`var(--dither-${active ? Math.max(0, Math.min(16, ditherMid)) : c.dither})`};
            background:${active ? 'var(--color-bg)' : `var(--dither-${c.dither})`};
          `}
        >
          <!-- left spine header: shown for every non-active card, both sides -->
          <div class="spine" class:bare={spineBacking === 'content'} aria-hidden={active}>
            <div class="spine-inner spine--{headerMode}">
              {#if headerMode === 'icon'}
                <span class="spine-glyph">{TITLES[c.index % TITLES.length][0]}</span>
              {:else}
                <span class="spine-text">{TITLES[c.index % TITLES.length]}</span>
              {/if}
            </div>
          </div>

          <header class="pc-header">
            <span class="pc-title">{TITLES[c.index % TITLES.length]}</span>
            {#if active && !pageMode}<span class="pc-close">×</span>{/if}
          </header>

          <div
            class="pc-body"
            class:reveal-clip={active && revealMode === 'clip'}
            class:reveal-dissolve={active && revealMode === 'dissolve'}
            class:on={revealed}
          >
            {#if loadState === 'placeholder' && active}
              <div class="skel"><i></i><i></i><i></i><i style="width:60%"></i></div>
            {:else if kind === 'puzzle'}
              <div class="puzzle-art"></div>
              <p>{PARA}</p>
            {:else if kind === 'lens'}
              <ul class="lens-list">
                {#each TITLES.slice(1, 7) as t}<li>{t}</li>{/each}
              </ul>
            {:else}
              {#each paras(kind === 'long' ? 12 : 2) as p}<p>{p}</p>{/each}
            {/if}
          </div>
        </article>
      {/each}

      {#each geo.markers as m (m.side)}
        <div
          class="marker marker--{m.side}"
          style={`left:${m.left}px; top:${m.top}px; z-index:${m.z}; background:var(--dither-${m.dither});`}
        >
          <span>{m.count}<br />{m.side === 'behind' ? 'back' : 'ahead'}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<!-- ── shimmer test: does a mask re-anchor a fixed dither? ─────────────── -->
<section class="shimmer">
  <h2>Dissolve shimmer test — build this first</h2>
  <p>
    Both blocks are <code>--dither-6</code>. The right one carries the dissolve
    <code>mask-image</code>. Toggle <em>animate mask</em> and <em>move blocks</em>
    and watch the dot grid: if the masked block's dots crawl or re-phase while
    the bare one stays locked, the mask has re-anchored the
    <code>background-attachment: fixed</code> grid and <strong>geometric clip is
    the whole vocabulary</strong>.
  </p>
  <label><input type="checkbox" bind:checked={shimmerOn} /> animate mask</label>
  <label><input type="checkbox" bind:checked={shimmerMove} /> move blocks</label>
  <div class="shimmer-row" class:moving={shimmerMove}>
    <div class="sh-block">bare</div>
    <div class="sh-block sh-masked" class:on={shimmerOn}>masked</div>
  </div>
</section>

<!-- ── controls ───────────────────────────────────────────────────────── -->
<aside class="ctl" class:closed={!panelOpen}>
  <button class="ctl-toggle" onclick={() => (panelOpen = !panelOpen)}>
    {panelOpen ? '▸' : '◂'} knobs
  </button>
  {#if panelOpen}
    <div class="ctl-body">
      <h3>inputs</h3>
      <label>stack depth <b>{depth}</b><input type="range" min="1" max="10" bind:value={depth} /></label>
      <label>active index <b>{activeIndex}</b><input type="range" min="0" max={depth - 1} bind:value={activeIndex} /></label>
      <label>lengths
        <select bind:value={lengths}>
          <option>short</option><option>mixed</option><option>long</option><option>puzzle</option>
        </select>
      </label>
      <label>load state
        <select bind:value={loadState}><option>ready</option><option>placeholder</option></select>
      </label>
      <button onclick={replayReveal}>replay reveal</button>

      <h3>knobs</h3>
      <label>collapsedWidth <b>{collapsedWidth}px</b><input type="range" min="16" max="200" bind:value={collapsedWidth} /></label>
      <label>stagger <b>{stagger}px</b><input type="range" min="0" max="40" bind:value={stagger} /></label>
      <label>forwardOverlap <b>{forwardOverlap}px</b><input type="range" min="0" max="120" bind:value={forwardOverlap} /></label>
      <label>backward strip count <b>{backwardStrip}</b><input type="range" min="0" max="8" bind:value={backwardStrip} /></label>
      <label>forward fan count <b>{forwardFan}</b><input type="range" min="0" max="8" bind:value={forwardFan} /></label>
      <label>dither mid <b>{ditherMid}</b><input type="range" min="0" max="16" bind:value={ditherMid} /></label>
      <label>dither step <b>{ditherStep}</b><input type="range" min="0" max="6" bind:value={ditherStep} /></label>
      <label>active width <b>{activeWidth}px</b><input type="range" min="400" max="1100" step="20" bind:value={activeWidth} /></label>
      <label>bottom edge
        <select bind:value={bottomEdge}><option>staircase</option><option>flush</option></select>
      </label>
      <label>spine header
        <select bind:value={headerMode}>
          <option>rotated</option><option>horizontal</option><option>icon</option>
        </select>
      </label>
      <label>spine backing
        <select bind:value={spineBacking}><option>opaque</option><option>content</option></select>
      </label>
      <label>reveal mode
        <select bind:value={revealMode}><option>clip</option><option>dissolve</option></select>
      </label>
      <label><input type="checkbox" bind:checked={depth1Page} /> depth-1 is page-like</label>

      <h3>state</h3>
      <pre>{JSON.stringify({ depth, activeIndex, cards: geo.cards.map(c => [c.index, c.role, c.left, c.top, `L${c.dither}`]), markers: geo.markers }, null, 1)}</pre>
    </div>
  {/if}
</aside>

<style>
  /* No `transform` anywhere near a dithered surface — see proto-geometry.ts. */
  @property --thr { syntax: '<length>'; inherits: false; initial-value: 0px; }

  .proto-viewport {
    overflow-x: clip;
    padding: var(--space-xl) 0 var(--space-xl);
    /* keeps the ahead-side slivers and markers clear of the fixed knobs panel */
    padding-right: var(--ctl-w, 0px);
    transition: padding-right 200ms ease-out;
  }
  .proto-rail { max-width: var(--w); margin: 0 auto; }
  .proto-stack { position: relative; }

  .pc {
    position: absolute;
    width: var(--w);
    height: calc(100% + var(--extra, 0px));
    box-sizing: border-box;
    border: var(--border-width) solid var(--color-border);
    display: grid;
    grid-template-columns: var(--left-col) 1fr;
    grid-template-rows: auto 1fr;
    overflow: clip;
    transition: left 320ms ease-out, top 320ms ease-out,
                grid-template-columns 320ms ease-out, background 320ms linear;
  }
  .pc--active { position: relative; height: auto; }

  /* THE ASYMMETRY. A behind-card is cropped for free by the card in front of
     it — painting order does all the work. An ahead-card has nothing in front
     of it, so on that side the crop has to be asked for: without this, the
     last ahead-card's full width bleeds out to the right of the fan.
     Still a full-size node (printing never moves) — this crops what is
     PAINTED, which is the same thing "collapsed is a crop, not a reflow"
     already says. clip-path, not width: no containing block for the fixed
     dither, unlike a transform. */
  .pc--ahead { clip-path: inset(0 calc(100% - var(--cw)) 0 0); }
  /* The clip cuts the card's own right border off with the rest of the card,
     so the sliver was left open-ended. Drawn inside the clip region instead.
     Sits above the spine so the tucked corner reads as a card edge. */
  .pc--ahead::after {
    content: '';
    position: absolute; top: 0; bottom: 0;
    left: calc(var(--cw) - var(--border-width));
    width: var(--border-width);
    background: var(--color-border);
    z-index: 3;
  }
  .pc--page { border: none; }

  /* The spine sits in column 1 spanning both rows, OVER the body — which also
     spans column 1 — so opening it crops the body rather than reflowing it. */
  .spine {
    grid-column: 1; grid-row: 1 / -1;
    z-index: 2; overflow: clip;
    /* Opaque, and the same dither as its card: the spine is what OCCLUDES the
       body it overlays. Left transparent, the body reads straight through it
       and there is no occlusion at all. */
    background: var(--spine-bg);
  }
  /* the card's own content shows through the crop instead */
  .spine.bare { background: transparent; }

  .spine-inner {
    /* NO height here. `height: 100vh` made this grid item's row 100vh tall,
       which set a floor under every card in the stack — a short card rendered
       as tall as the viewport and looked deliberate. The .spine grid item
       already stretches to the card, which is what carries the dither; this
       is only the label that follows the viewport. */
    position: sticky; top: 0;
    width: var(--cw);
    box-sizing: border-box;
    padding: var(--space-sm) 4px;
    display: flex; align-items: flex-start; justify-content: center;
    /* 5. the sticky label carries the card's top edge with it, so a scrolled
       spine isn't left open at the top. The negative margin lands it exactly
       on the card's own border at rest, so it doesn't read as double-weight. */
    border-top: var(--border-width) solid var(--color-border);
    margin-top: calc(var(--border-width) * -1);
  }
  .pc--active .spine-inner { border-top: none; margin-top: 0; }
  .spine-text, .spine-glyph {
    font-family: var(--font-ui); font-size: 0.95rem; white-space: nowrap;
    -webkit-text-stroke: 3px var(--color-bg);
    paint-order: stroke fill;
  }
  .spine--rotated .spine-text { writing-mode: vertical-rl; }
  .spine--horizontal .spine-inner, .spine--horizontal { align-items: flex-start; }
  .spine--horizontal .spine-text { overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; }
  .spine-glyph { font-size: 1.6rem; font-weight: 600; }

  .pc-header {
    grid-column: 2; grid-row: 1;
    display: flex; align-items: center; justify-content: space-between;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-lg);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--dither-2);
    font-family: var(--font-ui); font-size: 1.1rem;
  }
  .pc-title { -webkit-text-stroke: 3px var(--color-bg); paint-order: stroke fill; }
  .pc-close { font-size: 1.5rem; font-weight: 300; }

  .pc-body {
    grid-column: 1 / -1; grid-row: 2;
    padding: var(--space-lg);
    background: transparent;
  }
  .pc--active .pc-body { background: var(--color-bg); }
  .pc:has(.spine.bare) .pc-body { background: var(--color-bg); }
  .pc:not(.pc--active) .pc-header { background: transparent; }
  .pc-body p { margin: 0 0 var(--space-md); }

  /* reveal — geometric clip */
  .reveal-clip { clip-path: inset(0 0 100% 0); transition: clip-path 600ms ease-out; }
  .reveal-clip.on { clip-path: inset(0 0 0 0); }

  /* reveal — dither dissolve: threshold sweep over the same 4px cell */
  .reveal-dissolve {
    --thr: 0px;
    mask-image: radial-gradient(circle at 0.5px 0.5px, #000 var(--thr), #0000 calc(var(--thr) + 0.05px));
    mask-size: 4px 4px;
    -webkit-mask-image: radial-gradient(circle at 0.5px 0.5px, #000 var(--thr), #0000 calc(var(--thr) + 0.05px));
    -webkit-mask-size: 4px 4px;
    transition: --thr 700ms linear;
  }
  .reveal-dissolve.on { --thr: 5px; }

  .marker {
    position: absolute;
    width: var(--cw); height: 100%;
    box-sizing: border-box;
    border: var(--border-width) solid var(--color-border);
    font-family: var(--font-ui); font-size: 0.75rem; text-align: center; line-height: 1.15;
    transition: left 320ms ease-out, top 320ms ease-out;
    overflow: clip;
  }
  /* A marker is a collapsed spine too, so its label follows the viewport the
     same way — otherwise it scrolls away while every spine beside it stays. */
  .marker span {
    position: sticky; top: 0; display: block;
    padding-top: var(--space-sm);
    border-top: var(--border-width) solid var(--color-border);
    margin-top: calc(var(--border-width) * -1);
    -webkit-text-stroke: 3px var(--color-bg); paint-order: stroke fill;
  }

  .puzzle-art {
    /* stands in for a full-bleed header image: what the collapsed crop gets */
    margin: calc(var(--space-lg) * -1) calc(var(--space-lg) * -1) var(--space-lg);
    height: 320px;
    background:
      repeating-linear-gradient(to right, var(--color-text) 0 2px, #0000 2px 40px),
      repeating-linear-gradient(to bottom, var(--color-text) 0 2px, #0000 2px 40px),
      var(--dither-4);
  }
  .lens-list { list-style: none; padding: 0; margin: 0; }
  .lens-list li {
    padding: var(--space-sm) var(--space-md);
    border-bottom: 1px solid var(--color-border-light);
  }
  .skel i { display: block; height: 1rem; margin-bottom: var(--space-sm); background: var(--dither-4); }

  /* shimmer test */
  .shimmer { max-width: 700px; margin: var(--space-xl) auto; padding: 0 var(--space-md); }
  .shimmer label { display: inline-block; margin-right: var(--space-md); font-family: var(--font-ui); }
  .shimmer-row { display: flex; gap: var(--space-md); margin-top: var(--space-md); }
  .sh-block {
    flex: 1; height: 220px; background: var(--dither-6);
    border: var(--border-width) solid var(--color-border);
    font-family: var(--font-ui); padding: var(--space-sm);
    -webkit-text-stroke: 3px var(--color-bg); paint-order: stroke fill;
    position: relative;
  }
  .sh-masked {
    --thr: 5px;
    mask-image: radial-gradient(circle at 0.5px 0.5px, #000 var(--thr), #0000 calc(var(--thr) + 0.05px));
    mask-size: 4px 4px;
    -webkit-mask-image: radial-gradient(circle at 0.5px 0.5px, #000 var(--thr), #0000 calc(var(--thr) + 0.05px));
    -webkit-mask-size: 4px 4px;
  }
  .sh-masked.on { animation: thr 2.4s linear infinite alternate; }
  @keyframes thr { from { --thr: 0.6px; } to { --thr: 5px; } }
  .shimmer-row.moving .sh-block { animation: slide 3s ease-in-out infinite alternate; }
  @keyframes slide { from { left: 0; } to { left: 37px; } }

  /* controls */
  .ctl {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 9999;
    background: var(--color-bg);
    border-left: var(--border-width) solid var(--color-border);
    font-family: var(--font-ui); font-size: 0.8rem;
    display: flex;
  }
  .ctl.closed { border: none; background: none; bottom: auto; }
  .ctl-toggle {
    align-self: flex-start; margin: var(--space-sm);
    font-family: var(--font-ui); cursor: pointer;
    background: var(--color-selected-bg); color: var(--color-selected-fg);
    border: none; padding: 6px 10px;
  }
  .ctl-body { width: 280px; overflow-y: auto; padding: var(--space-sm) var(--space-md) var(--space-xl); }
  .ctl-body h3 { margin: var(--space-md) 0 var(--space-sm); font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; }
  .ctl-body label { display: block; margin-bottom: 8px; }
  .ctl-body input[type=range] { width: 100%; }
  .ctl-body b { float: right; font-weight: 600; }
  .ctl-body pre { font-size: 0.65rem; white-space: pre-wrap; background: var(--dither-2); padding: 6px; }
</style>

<!-- PROTOTYPE (issue #98) — throwaway. One route, scrubable controls, the whole
     D1 occlusion geometry at once. Not production code: no tests, no a11y pass,
     no store. Geometry lives in ./proto-geometry.ts so #99 can lift it. -->
<script lang="ts">
  import { computeGeometry, pileSections, type GeoParams, type BottomEdge, type Pile } from './proto-geometry';

  type Kind = 'lens' | 'short' | 'long' | 'puzzle';

  // Defaults are the SETTLED values (#98 resolution, 2026-08-22), so the
  // branch opens in the chosen configuration rather than in whatever the
  // scrubbing started from. The knobs remain because the record of what was
  // rejected is half of what this prototype is for.
  // ── scrubable inputs ────────────────────────────────────────────────
  let depth = $state(6);
  let activeIndex = $state(3);
  let lengths = $state<'short' | 'mixed' | 'long' | 'puzzle'>('mixed');
  let loadState = $state<'ready' | 'placeholder'>('ready');

  // ── parameter knobs, one per open question ──────────────────────────
  let collapsedWidth = $state(40);
  let stagger = $state(8);
  let forwardOverlap = $state(4);
  let backwardStrip = $state(3);
  let forwardFan = $state(3);
  let ditherMid = $state(5);
  let ditherStepBack = $state(-2);
  let ditherStepAhead = $state(-2);
  let bottomEdge = $state<BottomEdge>('staircase');
  let headerMode = $state<'rotated' | 'horizontal' | 'icon'>('rotated');
  let depth1Page = $state(true);
  let revealMode = $state<'clip' | 'dissolve' | 'none'>('clip');
  // Surfaced by the puzzle fixture: an opaque spine means every collapsed card
  // crops to an identical title strip, showing nothing of the card itself —
  // which sits awkwardly against #67's "a preview IS the card". The
  // alternative lets the card's own leftmost 48px show through. Legible vs
  // truthful; the prototype should not pick for you.
  let spineBacking = $state<'opaque' | 'content'>('opaque');
  // Animating a length inside mask-image regenerates the mask every frame, over
  // the whole card, on top of dithered surfaces that repaint with it. Two
  // mitigations: quantise the sweep so it rasterises N times instead of ~40,
  // and carry no mask at all at rest.
  let dissolveSteps = $state(8);
  // Hovering a marker splits its slot into one band per card it hides, so any
  // of them is one click away instead of several hops back through the stack.
  let hoveredMarker = $state<'behind' | 'ahead' | null>(null);
  let markerMaxBands = $state(12);
  // Bands run in the same direction the pile's stagger already does: a behind
  // pile staggers UP as it deepens, so its deepest card is the top band; an
  // ahead pile staggers down, so its deepest is the bottom band.
  // Past the midpoint of the 0-16 ramp the spine is an INVERTED surface, so
  // its label needs the mirror of the flat-surface rule and not just a swap:
  // ink glyphs held together by a paper stroke stop reading around L9, and a
  // paper stroke behind paper glyphs would fatten them instead of clearing
  // dots. Both halves flip together (CLAUDE.md, --color-selected-* section).
  const onInk = (level: number) => level >= 9;

  const bandsFor = (pile: Pile) => {
    const secs = pileSections(pile.indices, markerMaxBands);
    return pile.side === 'behind' ? secs.slice().reverse() : secs;
  };
  const pileFor = (index: number) => geo.piles.find(pl => pl.labelIndex === index);
  // THE TENSION, made scrubable. Every card carries a --dither-N: a stack of
  // ~7 viewport-anchored `fixed` gradient layers. A fixed background cannot be
  // translated by the compositor, so moving the element REPAINTS all of them —
  // 7 cards x 7 layers, every frame, for the length of the slide. That is the
  // lag, and CLAUDE.md already names the cost for scrolling.
  //   offset    — left/top. Correct dither, repaint per frame.
  //   transform — composited and cheap, but a transform re-anchors the fixed
  //               grid to the card, so the dither shimmers WHILE MOVING. The
  //               ban in #67 was never tested against motion this short; this
  //               is how to judge whether it is actually visible.
  //   none      — snap. Costs nothing, and a 1-bit aesthetic can carry it.
  // The active card's header follows the viewport like the spines do, and
  // shrinks once it is carrying the page rather than sitting on the card.
  let stickyHeader = $state(true);
  let headerStuck = $state(false);
  let motionMode = $state<'offset' | 'transform' | 'none'>('offset');
  let motionMs = $state(320);
  const moveMs = $derived(motionMode === 'none' ? 0 : motionMs);
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
    ditherMid, ditherStepBack, ditherStepAhead, bottomEdge, activeWidth,
  });
  const geo = $derived(computeGeometry(depth, activeIndex, params));
  const pageMode = $derived(depth === 1 && depth1Page);

  // Reveal replays on demand so the dissolve/clip can be judged repeatedly.
  const REVEAL_MS = 700;
  let revealed = $state(true);
  // Only true for the length of the sweep. The mask is the expensive part, so
  // it must not outlive the animation: left applied at rest it re-composites
  // on every later scroll and repaint, for a fully-opaque result that looks
  // identical to no mask at all.
  let dissolving = $state(false);
  let revealTimer: ReturnType<typeof setTimeout> | undefined;
  function replayReveal() {
    clearTimeout(revealTimer);
    revealed = false;
    if (revealMode === 'dissolve') dissolving = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      revealed = true;
      if (revealMode === 'dissolve') {
        revealTimer = setTimeout(() => (dissolving = false), REVEAL_MS + 80);
      }
    }));
  }
  $effect(() => { activeIndex; depth; loadState; replayReveal(); });

  // The split divides the SHORTER of the viewport and the strip's own height.
  // `max-height: 100%` cannot express that: a percentage does not resolve
  // against a stretched grid item, so on a card shorter than the viewport the
  // split stayed 100vh and overflowed the strip it was meant to divide.
  // Measured instead, which is a thin effect over one number.
  let stackH = $state(0);
  let stackEl: HTMLElement | undefined = $state();
  $effect(() => {
    if (!stackEl) return;
    const ro = new ResizeObserver(([e]) => (stackH = e.contentRect.height));
    ro.observe(stackEl);
    return () => ro.disconnect();
  });

  let sentinel: HTMLElement | undefined = $state();
  $effect(() => {
    if (!sentinel) return;
    const io = new IntersectionObserver(
      ([e]) => (headerStuck = !e.isIntersecting),
      { threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  });

  // ── settings round-trip ─────────────────────────────────────────────
  // So a chosen configuration can be handed over as one string instead of
  // read off nineteen sliders. The URL carries it too, which means a pasted
  // link reopens the exact thing that was being looked at.
  const SETTINGS = {
    get: () => ({
      collapsedWidth, stagger, forwardOverlap, backwardStrip, forwardFan,
      ditherMid, ditherStepBack, ditherStepAhead, activeWidth,
      bottomEdge, headerMode, spineBacking, depth1Page,
      revealMode, dissolveSteps, markerMaxBands,
      motionMode, motionMs, stickyHeader,
      // scenario, not settings — recorded so the view can be reproduced
      depth, activeIndex, lengths, loadState,
    }),
    set: (v: Record<string, string>) => {
      const num = (k: string, d: number) => (v[k] !== undefined && v[k] !== '' && !Number.isNaN(+v[k]) ? +v[k] : d);
      const bool = (k: string, d: boolean) => (v[k] === undefined ? d : v[k] === 'true');
      collapsedWidth = num('collapsedWidth', collapsedWidth);
      stagger = num('stagger', stagger);
      forwardOverlap = num('forwardOverlap', forwardOverlap);
      backwardStrip = num('backwardStrip', backwardStrip);
      forwardFan = num('forwardFan', forwardFan);
      ditherMid = num('ditherMid', ditherMid);
      ditherStepBack = num('ditherStepBack', ditherStepBack);
      ditherStepAhead = num('ditherStepAhead', ditherStepAhead);
      activeWidth = num('activeWidth', activeWidth);
      dissolveSteps = num('dissolveSteps', dissolveSteps);
      markerMaxBands = num('markerMaxBands', markerMaxBands);
      motionMs = num('motionMs', motionMs);
      depth = num('depth', depth);
      activeIndex = num('activeIndex', activeIndex);
      depth1Page = bool('depth1Page', depth1Page);
      stickyHeader = bool('stickyHeader', stickyHeader);
      if (v.bottomEdge) bottomEdge = v.bottomEdge as typeof bottomEdge;
      if (v.headerMode) headerMode = v.headerMode as typeof headerMode;
      if (v.spineBacking) spineBacking = v.spineBacking as typeof spineBacking;
      if (v.revealMode) revealMode = v.revealMode as typeof revealMode;
      if (v.motionMode) motionMode = v.motionMode as typeof motionMode;
      if (v.lengths) lengths = v.lengths as typeof lengths;
      if (v.loadState) loadState = v.loadState as typeof loadState;
    },
  };

  const settingsQuery = $derived(
    new URLSearchParams(
      Object.entries(SETTINGS.get()).map(([k, v]) => [k, String(v)]),
    ).toString(),
  );
  const settingsText = $derived(
    Object.entries(SETTINGS.get())
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
  );

  let restored = false;
  $effect(() => {
    // Read the query FIRST, unconditionally. Reading it only on the later
    // branch means the first run registers no reactive dependency (the early
    // return happens before the read), so the effect never runs again and the
    // URL silently stops tracking the knobs.
    const q = settingsQuery;
    if (!restored) {
      restored = true;
      const h = location.hash.slice(1);
      if (h) SETTINGS.set(Object.fromEntries(new URLSearchParams(h)));
      return;
    }
    // replaceState, not a hash assignment: a knob nudge must not fill history
    history.replaceState(null, '', `#${q}`);
  });

  let copied = $state(false);
  async function copySettings() {
    try {
      await navigator.clipboard.writeText(`${settingsText}\n\nurl: ${location.href}`);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }

  // ── shimmer test ────────────────────────────────────────────────────
  let shimmerOn = $state(false);
  let shimmerMove = $state(false);
</script>

<div class="proto-viewport" style={`--cw:${collapsedWidth}px; --w:${activeWidth}px; --ctl-w:${panelOpen ? 320 : 0}px; --stack-h:${stackH}px; --reveal-ms:${REVEAL_MS}ms; --reveal-ease:steps(${dissolveSteps}); --move-ms:${moveMs}ms;`}>
  <div class="proto-rail">
    <div class="proto-stack" class:page={pageMode} bind:this={stackEl}>
      {#each geo.cards as c (c.index)}
        {@const kind = kindFor(c.index)}
        {@const active = c.role === 'active'}
        {@const pile = c.pileLabel ? pileFor(c.index) : undefined}
        {@const splitOpen = !!pile && hoveredMarker === pile.side}
        <article
          class="pc"
          class:pc--piled={c.piled}
          onclick={() => { if (!active) activeIndex = c.index; }}
          onmouseenter={() => { if (c.piled) hoveredMarker = c.role === 'behind' ? 'behind' : 'ahead'; }}
          onmouseleave={(e) => {
            const to = e.relatedTarget as HTMLElement | null;
            if (!to?.closest?.('.pc--piled')) hoveredMarker = null;
          }}
          class:pc--ahead={c.role === 'ahead'}
          class:pc--active={active}
          class:pc--page={active && pageMode}
          style={`
            ${motionMode === 'transform'
              ? `left:0; top:0; transform:${c.left || c.top ? `translate(${c.left}px, ${c.top}px)` : 'none'};`
              : `left:${c.left}px; top:${c.top}px;`}
            z-index:${c.z};
            --left-col:${active ? 0 : collapsedWidth}px;
            --extra:${c.extraHeight}px;
            --spine-bg:var(--dither-${c.dither});
            --header-bg:var(--dither-${c.dither});
            background:var(--color-bg);
          `}
        >
          <!-- left spine header: shown for every non-active card, both sides -->
          <div class="spine" class:bare={spineBacking === 'content'} class:ink={onInk(c.dither)} aria-hidden={active}>
            {#if splitOpen && pile}
              <div class="marker-split">
                {#each bandsFor(pile) as sec (sec.index)}
                  <button
                    class="marker-band"
                    onclick={(e) => { e.stopPropagation(); activeIndex = sec.index; }}
                  >
                    <span class="band-text">
                      {sec.count > 1 ? `${sec.count} more` : TITLES[sec.index % TITLES.length]}
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <div class="spine-inner spine--{headerMode}">
                {#if pile}
                  <span class="spine-text marker-label">{pile.count} more</span>
                {:else if c.piled}
                  <!-- buried in the pile: its edge is the only part that shows -->
                {:else if headerMode === 'icon'}
                  <span class="spine-glyph">{TITLES[c.index % TITLES.length][0]}</span>
                {:else}
                  <span class="spine-text">{TITLES[c.index % TITLES.length]}</span>
                {/if}
              </div>
            {/if}
          </div>

          {#if active}<div class="header-sentinel" bind:this={sentinel}></div>{/if}
          <header
            class="pc-header"
            class:ink={onInk(c.dither)}
            class:sticky={active && stickyHeader}
            class:stuck={active && stickyHeader && headerStuck}
          >
            <span class="pc-title">{TITLES[c.index % TITLES.length]}</span>
            {#if active && !pageMode}<span class="pc-close">×</span>{/if}
          </header>

          <div
            class="pc-body"
            class:reveal-clip={active && revealMode === 'clip'}
            class:reveal-dissolve={active && revealMode === 'dissolve' && dissolving}
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
      <label>dither mid (active header) <b>{ditherMid}</b><input type="range" min="0" max="16" bind:value={ditherMid} /></label>
      <label>dither step back <b>{ditherStepBack}</b><input type="range" min="-6" max="6" bind:value={ditherStepBack} /></label>
      <label>dither step ahead <b>{ditherStepAhead}</b><input type="range" min="-6" max="6" bind:value={ditherStepAhead} /></label>
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
      <label><input type="checkbox" bind:checked={stickyHeader} /> sticky active header</label>
      <label>motion
        <select bind:value={motionMode}>
          <option>offset</option><option>transform</option><option>none</option>
        </select>
      </label>
      <label><input type="checkbox" bind:checked={stickyHeader} /> sticky active header</label>
      <label>motion ms <b>{motionMs}</b><input type="range" min="0" max="800" step="20" bind:value={motionMs} /></label>
      <label>marker max bands <b>{markerMaxBands}</b><input type="range" min="2" max="24" bind:value={markerMaxBands} /></label>
      <label>dissolve steps <b>{dissolveSteps}</b><input type="range" min="2" max="24" bind:value={dissolveSteps} /></label>
      <label>reveal mode
        <select bind:value={revealMode}>
          <option>clip</option><option>dissolve</option><option>none</option>
        </select>
      </label>
      <label><input type="checkbox" bind:checked={depth1Page} /> depth-1 is page-like</label>

      <h3>settings</h3>
      <button onclick={copySettings}>{copied ? 'copied ✓' : 'copy settings'}</button>
      <textarea class="settings-out" readonly rows="6">{settingsText}</textarea>
      <p class="hint">The URL carries these too — paste it to reopen this exact view.</p>

      <h3>state</h3>
      <pre>{JSON.stringify({ depth, activeIndex, cards: geo.cards.map(c => [c.index, c.role, c.left, c.top, `L${c.dither}`, c.piled ? 'piled' : '']), piles: geo.piles }, null, 1)}</pre>
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
    /* grid-template-columns is a LAYOUT animation — it re-runs grid layout on
       the card every frame — so it shares the motion budget and stops with it. */
    transition: left var(--move-ms) ease-out, top var(--move-ms) ease-out,
                transform var(--move-ms) ease-out,
                grid-template-columns var(--move-ms) ease-out;
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
     Sits above the spine so the tucked corner reads as a card edge.
     The `* 2` is load-bearing: an absolutely positioned child is offset from
     the PADDING box, while clip-path measures from the BORDER box. One
     border-width out and this lands just past the clip and vanishes. */
  .pc--ahead::after {
    content: '';
    position: absolute; top: 0; bottom: 0;
    left: calc(var(--cw) - var(--border-width) * 2);
    width: var(--border-width);
    background: var(--color-border);
    z-index: 3;
  }
  .pc--page { border: none; }
  .pc:not(.pc--active) { cursor: pointer; }
  .marker-label { font-size: 0.8rem; }

  /* Follows the viewport like every other spine label, and is capped to the
     card so a short stack doesn't get a 100vh child forcing its height —
     the bug that made every card viewport-tall earlier. */
  .marker-split {
    position: sticky; top: 0;
    width: var(--cw);
    height: min(100vh, var(--stack-h, 100vh));
    display: flex; flex-direction: column;
    border-top: var(--border-width) solid var(--color-border);
    margin-top: calc(var(--border-width) * -1);
  }
  .marker-band {
    flex: 1; min-height: 0;
    /* "Left-aligned" in a vertical writing mode means starting at the TOP,
       since the text runs downward. */
    display: flex; align-items: flex-start; justify-content: center;
    padding: 0; margin: 0; overflow: hidden; cursor: pointer;
    background: transparent; color: var(--color-text);
    border: none;
    border-bottom: 1px solid var(--color-border);
    font-family: var(--font-ui);
  }
  .marker-band:last-child { border-bottom: none; }
  .marker-band:hover {
    background: var(--color-selected-bg);
    color: var(--color-selected-fg);
  }
  /* In vertical-rl the INLINE axis is vertical, so height is what constrains
     the line — which is why capping height (not width) is what makes
     text-overflow fire. */
  .band-text {
    writing-mode: vertical-rl; white-space: nowrap; font-size: 0.75rem;
    box-sizing: border-box;
    max-height: 100%;
    /* Logical, and easy to get backwards: in vertical-rl the INLINE axis is
       vertical and the BLOCK axis is horizontal. So inline padding is what
       insets the title from the divider it starts under, and block padding is
       what holds it off the spine's edges. `padding-block` alone — which is
       what this had — moved it sideways and left it butted against the rule. */
    padding-inline: var(--space-sm) var(--space-xs);
    padding-block: 4px;
    overflow: hidden; text-overflow: ellipsis;
    -webkit-text-stroke: 3px var(--color-bg); paint-order: stroke fill;
  }
  /* An inverted surface needs the MIRROR of the stroke rule, not just swapped
     colours: a paper stroke behind paper glyphs fattens them instead of
     clearing dots (CLAUDE.md, --color-selected-* section). */
  .marker-band:hover .band-text { -webkit-text-stroke-color: var(--color-selected-bg); }

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
  /* Inverted surface: flip the glyph and its stroke together. */
  .spine.ink :is(.spine-text, .spine-glyph, .band-text) {
    color: var(--color-bg);
    -webkit-text-stroke-color: var(--color-text);
  }

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
  .spine-inner { max-height: min(100vh, var(--stack-h, 100vh)); }
  .spine--rotated .spine-text {
    max-height: 100%;
    overflow: hidden; text-overflow: ellipsis;
  }
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
    background: var(--header-bg);
    font-family: var(--font-ui); font-size: 1.1rem;
  }
  /* Sticky resolves against the viewport, not the card: .pc uses `overflow:
     clip`, which clips without creating a scroll container (`hidden` would,
     and would pin this to a box that never scrolls). Below the spine's z so
     the two sit side by side rather than fighting. */
  .pc-header.sticky {
    position: sticky; top: 0; z-index: 1;
    /* Same treatment as .spine-inner: carry the card's top edge, landing on
       the card's own border at rest so it isn't double-weight. Without it a
       stuck header bleeds into the viewport edge while the spines beside it
       are properly closed. */
    border-top: var(--border-width) solid var(--color-border);
    margin-top: calc(var(--border-width) * -1);
  }
  .pc-header.stuck {
    padding-top: var(--space-xs);
    padding-bottom: var(--space-xs);
    font-size: 0.85rem;
  }
  .pc-header { transition: padding 180ms ease-out, font-size 180ms ease-out; }
  /* 1px marker at the card's top edge; once it leaves the viewport the header
     is carrying the page rather than sitting on the card. */
  .header-sentinel {
    grid-column: 2; grid-row: 1;
    height: 1px; width: 100%;
    align-self: start;
    pointer-events: none;
  }
  .pc-title { -webkit-text-stroke: 3px var(--color-bg); paint-order: stroke fill; }
  /* `dither mid` is scrubable to ink now, so the active header is an inverted
     surface at the top of the range and needs the same mirror the spines do. */
  .pc-header.ink { color: var(--color-bg); }
  .pc-header.ink .pc-title { -webkit-text-stroke-color: var(--color-text); }
  .pc-close { font-size: 1.5rem; font-weight: 300; }

  .pc-body {
    grid-column: 1 / -1; grid-row: 2;
    padding: var(--space-lg);
    /* Paper on EVERY card, active or not. A card that has just been pushed
       behind is still full-size on screen while its spine animates shut, so a
       body that flips to the depth ramp the instant it loses `active` flashes
       the whole card dark for the length of the slide — and it cannot be
       transitioned out of, since a gradient does not interpolate to a colour.
       The ramp is carried by the two surfaces that stay visible once the card
       IS collapsed: the spine and the header. */
    background: var(--color-bg);
  }
  /* The header is the top staircase band — the sliver of a behind-card that
     shows above the card in front — so it carries the ramp rather than its own
     resting L2 (--header-bg, set per card). Dither-to-dither, so nothing
     flashes when a card is pushed. */
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
    transition: --thr var(--reveal-ms) var(--reveal-ease);
  }
  .reveal-dissolve.on { --thr: 5px; }


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
  .settings-out {
    width: 100%; margin-top: 6px; font-family: var(--font-ui);
    font-size: 0.65rem; padding: 6px; resize: vertical;
    border: 1px solid var(--color-border); background: var(--color-bg);
    color: var(--color-text);
  }
  .hint { font-size: 0.65rem; margin: 4px 0 0; }
</style>

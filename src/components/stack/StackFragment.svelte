<!-- One stack card's server-rendered HTML, mounted once and never re-rendered.

     This exists for exactly one reason: `{@html expr}` re-renders whenever
     `expr` CHANGES, and the fragment cache's value for a slot legitimately
     changes underneath it. A card pushed through a view transition mounts from
     a placeholder and `replaceBody` then caches the real HTML for that slot —
     so the next store change (re-activating anything, closing anything) made
     the `{@html}` in the each block see a different string and swap the node.

     That is trap 4 of #99, and it is invisible: the replacement node carries
     the same content at the same position, and `getBoundingClientRect` agrees
     with the old one. What it costs is everything the geometry is built on —
     a rebuilt node mounts at its destination instead of travelling there, so
     nothing animates — plus every island mounted inside it (a lens's filter
     panel, its revealed rows) silently resetting.

     Capturing the prop once ties the DOM node's lifetime to the each block's,
     which is the invariant we actually want: a card's node lives exactly as
     long as its entry is in the stack. `replaceBody` patches the live node
     directly, so freezing here loses nothing — the cache stays authoritative
     for `factsFor` and for the next time this location is mounted fresh.

     THE RULE IT IMPOSES: once a location is mounted, a cache write no longer
     reaches its DOM. Anything that seeds a placeholder and then lets a fetch
     land in the cache behind it must go through `replaceBody`, or that card
     keeps its placeholder for the rest of the session. -->
<script lang="ts">
  import { untrack } from 'svelte';

  interface Props { html: string }
  const { html }: Props = $props();
  // Read once, deliberately un-reactive — a later value for this slot must not
  // re-render. `untrack` rather than a bare read so the intent is stated rather
  // than warned about (`state_referenced_locally` is exactly this, flagged).
  const initial = untrack(() => html);
</script>

{@html initial}

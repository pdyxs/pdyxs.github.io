---
title: Particulars
description: A particle in a box, to steer around
date: 2026-10-14
tags: []
inspected: false
headerMedia: particulars
---
Throwaway sample card for the Particulars toy. Steer the particle with the arrow keys, WASD, or by holding a pointer.

<button type="button" data-particulars-button="formation">Send a formation</button>
<button type="button" data-particulars-button="electron">Send an electron</button>

<!--
Authoring a prose button: plain HTML in the markdown body (Astro passes it
through unsanitised), `data-particulars-button="<name>"` on a <button>. A click
becomes a command for the toy of the card the button sits in, and the toy runs
the `page-button` trigger in index.json whose `button` is that name:
  { "kind": "page-button", "button": "<name>", "actions": [{ "kind": "spawn", "wave": "<wave id>" }] }
A wave with one entry spawning a single particle type is a "single particle" button.
-->

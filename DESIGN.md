# Site Design: Cards & Inquiry

## Philosophy

Content should have the footprint and simplicity of social media (each item is a
clear articulation of a single idea) while prioritising depth of understanding.

A reasonable person should be able to ask questions of any piece of content and
continue to get reasonable answers — either routed to existing content, or
forwarded to the author, who answers and weaves the answer back in.

**Site is the source of truth.** Substack and other platforms are distribution.

---

## The Primitive: Cards

The fundamental unit of content is a **card**.

- Cards prefer short-form, but long-form is allowed (blogs and essays can live here)
- Cards are *not* hierarchically organised by default
- Cards can include or *be* interactive media (D3 visualisations, embedded games, etc.)

### Navigation model

Rather than a tree/hierarchy, navigation is built from:

- **Linking** — explicit card-to-card connections
- **Tag links** — link to a tag rather than a specific card; the system surfaces the most relevant card for that tag (see below)
- **Breadcrumb stack** — as you explore, you build a traversable history of your path through the site. Navigation surfaces this so you can easily backtrack or see where you've been. A visitor arriving cold at a single card still has a path forward because that card links to others. A persistent **home button** is always available as an escape hatch.
- **Ordered navigation** — optional on a card or group of cards; provides prev/next for sequential content (blog posts, story chapters, etc.)

### Sharing & embedding

Cards are designed to be portable.

- **Share a card** — a card can be shared as a standalone URL or embedded into any website (iframe or web component)
- **Share a stack** — when sharing, you can choose to share the full navigation stack you've built, not just the card. The recipient receives your reading path and can continue exploring or fork from it.
- A shared stack is **forkable** — the recipient can diverge and build their own path from any point.
- Ideally a stack records not just *which* cards were visited but *where in each card* a link was followed — so the recipient can see exactly what prompted each step. How to pinpoint content within a card in a robust, holistic way is an open problem; leave this for later.
- **v1 implementation:** the stack is a sequence of card IDs, encoded as a URL parameter (minified/encoded). No backend required. Persistent saved stacks and intra-card location come later.

### Tagging system

Tags are the primary connective tissue.

- Cards are tagged; tags create implicit links between cards
- **Indirect tagging** — tags can have aliases (multiple names for the same concept) and relationships to other tags (so you can traverse tag-to-tag, not just card-to-tag)
- **Tag links** — instead of linking directly to a card, a card can link to a tag, and the system resolves this to the most relevant card at that tag. Resolution starts with an explicit `priority` field on cards per-tag.
- **LLM-assisted linking** — LLMs are a good fit for suggesting and maintaining tag links and cross-links at authoring time. Worth experimenting with as the card count grows.

---

## Front Page

An accordion of 5 entry-point cards:

| Panel | Topic |
|---|---|
| Who | Who I am |
| What | What I've done / am doing |
| When | History / timeline of work and activity |
| Where | How to contact me / find me |
| Why | Why this site is designed the way it is |

Each panel is itself a card (or entry into a card cluster). Opening it begins
the visitor's exploration stack.

The **When** panel surfaces a **timeline card** — a special card type that
presents work and activity chronologically, linking out to the relevant cards.

---

## The Inquiry Loop

*(From the design philosophy — not yet designed in detail)*

- Each card can receive questions from readers
- The system tries to route the question to existing content that answers it
- If no good answer exists, the question is forwarded to the author
- The author answers; the answer becomes a card (or is woven into existing cards)
- The network grows in response to reader curiosity, not author schedule

**Interaction:** Questions are triggered by **highlighting text** on a card —
selecting a passage surfaces a "ask about this" affordance. Not in v1.

---

## Experiment Scope

**The goal is to test the UI and interaction model.** The data layer is important
but not the focus of this experiment. Keep the data layer simple.

What "success" looks like for the experiment (TBD — worth deciding before building):
- Does the breadcrumb/stack navigation feel natural?
- Do tag links surface the right content?
- Does the inquiry loop get used?

---

## Open Questions

- **Ordered navigation and the stack** — if you're reading a blog series in order,
  does the ordered nav replace the stack, or coexist with it?

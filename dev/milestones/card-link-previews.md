# Milestone: CardLink Previews + In-Card Push Animations

## Goal

Replace card listing items (e.g. tag card project lists) with `CardLink` components, and add hover/tap previews before committing to opening a card. This gives in-card pushes the same clean view-transition morph as panel links, and lets users peek at a card's content before opening it.

## Motivation

Currently, in-card `[data-push-card]` elements are plain listing rows — visually different from the card header. A VT morph from a listing row to a full card looks like a flying squish rather than a clean grow. Replacing them with `CardLink` (striped header, bordered box) makes old/new VT screenshots visually identical, enabling the same clean morph as panel link → card.

The preview feature also improves discoverability: users can hover to peek at content without committing to a navigation, and on mobile a tap shows the preview before a second tap confirms.

## Scope

### CardLink in card bodies

- Replace `.card-listing-item [data-push-card]` elements in `TagRenderer` (and any other renderers) with `CardLink` components
- `CardLink` already exists (`src/components/CardLink.astro`) — renderers just need to use it
- Wire up the cardStack `[data-push-card]` click handler to pass `clickedLink` so VT fires for in-card pushes (same path as panel links)

### Hover/tap preview

- Hovering a `CardLink` (desktop) shows a preview panel adjacent to it with a summary of the card content
- On mobile (touch), first tap shows the preview; second tap (or a "Go" button in the preview) confirms navigation
- Preview content: fetched lazily on hover-intent / first tap; could be a truncated version of the card body or a dedicated summary field
- Preview dismisses on mouse-leave (desktop) or tap-outside / tap-close (mobile)
- Preview position: anchored to the `CardLink`, avoiding viewport edges

### View transition from preview

- On confirm (desktop: click after hover, mobile: second tap), the VT morphs from the preview panel (not the `CardLink` row) to the full card — the preview is already the right size/shape to make the morph seamless

## Open Questions

- Should the preview be a separate fetch (e.g. `GET /card/{uid}?preview=true`) or derived from content collections at build time?
- Does the preview panel use `CardLink`'s bordered-box shape, or is it a popover?
- On mobile, does the preview slide in from the side, or overlay in place?
- Should the VT morph from the `CardLink` row (if no preview was shown) fall back gracefully, or always require the preview step?

## Dependencies

- `CardLink.astro` (exists)
- View Transitions architecture (established in `front-page-panel-links`)
- `body-wrapper` expand pattern (established in `front-page-panel-links`)

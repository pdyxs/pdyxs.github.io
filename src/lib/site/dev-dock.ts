// The fixed bottom-right column the dev-only page buttons share (open in
// editor, mark inspected). Each button mounts into it and sets its own CSS
// `order`, so they stack the same way whichever loads first, and neither needs
// to know whether the other is showing. Dev only: nothing imports this in a
// build.

const ID = 'dev-dock';

export function devDock(): HTMLElement {
  const existing = document.getElementById(ID);
  if (existing) return existing;
  const dock = document.createElement('div');
  dock.id = ID;
  dock.style.cssText = [
    'position: fixed',
    'right: var(--space-md)',
    'bottom: var(--space-md)',
    'z-index: 1000',
    'display: flex',
    'flex-direction: column',
    'align-items: flex-end',
    'gap: var(--space-xs)',
  ].join(';');
  document.body.append(dock);
  return dock;
}

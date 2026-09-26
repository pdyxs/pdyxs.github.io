import { describe, it, expect } from 'vitest';
import { SOLO_BUTTON, CLOSE_BUTTON } from '@render/header-icons';

function parse(html: string): HTMLButtonElement {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.querySelector('button')!;
}

describe('header icon buttons', () => {
  it('solo and close draw the identical box', () => {
    const box = (html: string) => parse(html).querySelector('.header-icon-box')!.innerHTML;
    expect(box(SOLO_BUTTON)).toBe(box(CLOSE_BUTTON));
  });

  it('carry the classes and labels the stack click handler and CSS match on', () => {
    expect(parse(SOLO_BUTTON).className).toBe('stack-card-solo');
    expect(parse(CLOSE_BUTTON).className).toBe('stack-card-close');
    expect(parse(SOLO_BUTTON).getAttribute('aria-label')).toBe('Show only this card');
    expect(parse(CLOSE_BUTTON).getAttribute('aria-label')).toBe('Close');
  });

  it('hides the icon itself from assistive tech, leaving the button label', () => {
    expect(parse(CLOSE_BUTTON).querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

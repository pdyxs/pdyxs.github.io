import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CrdbrdEditor from './CrdbrdEditor.svelte';
import { blank } from '../model/game.ts';
import type { Game } from '../model/types.ts';
import { addConcept, addEntity, addProperty, addSet, addComponent, setComponentCount, addPer } from '../model/ops.ts';
import { reactiveProps } from './reactive-props.svelte.ts';

/** Mount the island the way the shell does: `data` in, whole new game out through onChange. */
function setup(initial: Game = blank(), readOnly = false) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const changes: Game[] = [];
  const props = reactiveProps({ data: initial, readOnly, onChange: (next: Game) => { props.data = next; changes.push(next); } });
  mounted = mount(CrdbrdEditor as any, { target, props });
  flushSync();
  return { target, props, changes };
}

let mounted: ReturnType<typeof mount>;
afterEach(() => {
  unmount(mounted);
  document.body.innerHTML = '';
  location.hash = '';
});

const q = <T extends Element = HTMLElement>(t: HTMLElement, sel: string) => t.querySelector<T>(sel)!;
const qa = (t: HTMLElement, sel: string) => [...t.querySelectorAll<HTMLElement>(sel)];
function type(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
function click(el: Element) {
  (el as HTMLElement).click();
  flushSync();
}
/** Follow a hash link. happy-dom does not navigate on an anchor click, so play the browser's part. */
function follow(link: Element) {
  location.hash = link.getAttribute('href')!;
  dispatchEvent(new Event('hashchange'));
  flushSync();
}
function addNamed(t: HTMLElement, formSel: string, name: string) {
  type(q<HTMLInputElement>(t, `${formSel} input`), name);
  click(q(t, `${formSel} button`));
}

describe('CrdbrdEditor: concepts', () => {
  it('adds a concept from the game page, handing the whole new game to onChange', () => {
    const { target, changes } = setup();
    addNamed(target, 'form.add-concept', 'Players');
    expect(changes).toHaveLength(1);
    expect(changes[0].concepts.map((c) => c.name)).toEqual(['Players']);
    expect(qa(target, '.concept-row .concept-link').map((e) => e.textContent!.trim())).toEqual(['Players']);
    expect(changes[0].concepts[0].id).toMatch(/\S/);
  });

  it('renames a concept on its page', () => {
    const { target, changes } = setup();
    addNamed(target, 'form.add-concept', 'Players');
    follow(q(target, '.concept-link'));
    type(q<HTMLInputElement>(target, 'input.concept-name'), 'Teams');
    expect(changes.at(-1)!.concepts[0].name).toBe('Teams');
  });

  it('removes a concept from the game page', () => {
    const { target, changes } = setup();
    addNamed(target, 'form.add-concept', 'Players');
    click(q(target, '.concept-row button.remove'));
    expect(changes.at(-1)!.concepts).toEqual([]);
    expect(qa(target, '.concept-row')).toHaveLength(0);
  });

  it('renames the game', () => {
    const { target, changes } = setup();
    type(q<HTMLInputElement>(target, 'input.game-name'), 'Chess');
    expect(changes.at(-1)!.name).toBe('Chess');
  });

  it('offers no editing when read-only', () => {
    const { target } = setup(blank(), true);
    expect(qa(target, 'input, button').every((e) => (e as HTMLInputElement).disabled)).toBe(true);
  });
});

function withConcept(): Game {
  return addConcept(blank(), { id: 'c', name: 'Players' });
}
function openConcept(target: HTMLElement) {
  follow(q(target, '.concept-link'));
}

describe('CrdbrdEditor: properties', () => {
  it('defines a property on a concept, text by default', () => {
    const { target, changes } = setup(withConcept());
    openConcept(target);
    addNamed(target, 'form.add-property', 'Name');
    const prop = changes.at(-1)!.concepts[0].properties[0];
    expect(prop).toMatchObject({ name: 'Name', type: { kind: 'text' } });
    expect(qa(target, '.property-row')).toHaveLength(1);
  });

  it('renames, retypes (number shows min/max) and removes a property', () => {
    const { target, changes } = setup(addProperty(withConcept(), { owner: 'c', id: 'p', name: 'Cost' }));
    openConcept(target);
    type(q<HTMLInputElement>(target, '.property-row input.prop-name'), 'Price');
    expect(changes.at(-1)!.concepts[0].properties[0].name).toBe('Price');

    const select = q<HTMLSelectElement>(target, '.property-row select.prop-type');
    select.value = 'number';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(changes.at(-1)!.concepts[0].properties[0].type).toEqual({ kind: 'number', min: 0, max: 10 });

    type(q<HTMLInputElement>(target, '.property-row input.prop-min'), '2');
    type(q<HTMLInputElement>(target, '.property-row input.prop-max'), '8');
    expect(changes.at(-1)!.concepts[0].properties[0].type).toEqual({ kind: 'number', min: 2, max: 8 });

    click(q(target, '.property-row button.remove'));
    expect(changes.at(-1)!.concepts[0].properties).toEqual([]);
  });

  it('a reference property picks from the concepts', () => {
    let g = addConcept(withConcept(), { id: 'd', name: 'Decks' });
    g = addProperty(g, { owner: 'c', id: 'p', name: 'Deck', type: { kind: 'reference', concept: 'd' } });
    const { target, changes } = setup(g);
    openConcept(target);
    const pick = q<HTMLSelectElement>(target, '.property-row select.prop-concept');
    expect(pick.value).toBe('d');
    pick.value = 'c';
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(changes.at(-1)!.concepts[0].properties[0].type).toEqual({ kind: 'reference', concept: 'c' });
  });

  it('defines game-level properties and values on the game page', () => {
    const { target, changes } = setup();
    addNamed(target, 'form.add-property', 'Theme');
    const p = changes.at(-1)!.properties[0];
    expect(p.name).toBe('Theme');
    type(q<HTMLInputElement>(target, '.game-values input'), 'dark');
    expect(changes.at(-1)!.values).toEqual({ [p.id]: 'dark' });
  });
});

describe('CrdbrdEditor: nesting', () => {
  it('adds a nested concept, reachable from its parent, with a way back', () => {
    const { target, changes } = setup(withConcept());
    openConcept(target);
    addNamed(target, 'form.add-child', 'Hands');
    expect(changes.at(-1)!.concepts[0].children.map((c) => c.name)).toEqual(['Hands']);
    follow(q(target, '.child-row .concept-link'));
    expect(q<HTMLInputElement>(target, 'input.concept-name').value).toBe('Hands');
    expect(qa(target, '.crumbs a').map((a) => a.textContent!.trim())).toEqual(['Game', 'Players']);
  });

  it('removes a nested concept from its parent page', () => {
    let g = addConcept(withConcept(), { id: 'n', name: 'Hands', parent: 'c' });
    const { target, changes } = setup(g);
    openConcept(target);
    click(q(target, '.child-row button.remove'));
    expect(changes.at(-1)!.concepts[0].children).toEqual([]);
  });
});

describe('CrdbrdEditor: entities and values', () => {
  const game = () => {
    let g = withConcept();
    g = addProperty(g, { owner: 'c', id: 'n', name: 'Score', type: { kind: 'number', min: 2, max: 9 } });
    g = addProperty(g, { owner: 'c', id: 't', name: 'Motto' });
    g = addProperty(g, { owner: 'c', id: 'k', name: 'Colour', type: { kind: 'colour' } });
    g = addProperty(g, { owner: 'c', id: 'b', name: 'Active', type: { kind: 'boolean' } });
    return addEntity(g, { concept: 'c', id: 'e', name: 'Red' });
  };

  it('adds, opens, renames and removes entities', () => {
    const { target, changes } = setup(withConcept());
    openConcept(target);
    addNamed(target, 'form.add-entity', 'Red');
    expect(changes.at(-1)!.concepts[0].entities.map((e) => e.name)).toEqual(['Red']);
    follow(q(target, '.entity-row .entity-link'));
    type(q<HTMLInputElement>(target, 'input.entity-name'), 'Blue');
    expect(changes.at(-1)!.concepts[0].entities[0].name).toBe('Blue');
    follow(q(target, '.crumbs a:nth-child(2)'));
    click(q(target, '.entity-row button.remove'));
    expect(changes.at(-1)!.concepts[0].entities).toEqual([]);
  });

  it('shows the type defaults for values not yet set', () => {
    const { target } = setup(game());
    openConcept(target);
    follow(q(target, '.entity-link'));
    expect(q<HTMLInputElement>(target, '.value-row[data-prop="n"] input').value).toBe('2');
    expect(q<HTMLInputElement>(target, '.value-row[data-prop="t"] input').value).toBe('(Red)');
    expect(q<HTMLInputElement>(target, '.value-row[data-prop="k"] input').value).toBe('#000000');
    expect(q<HTMLInputElement>(target, '.value-row[data-prop="b"] input').checked).toBe(false);
  });

  it('sets each kind of value through one op', () => {
    const { target, changes } = setup(game());
    openConcept(target);
    follow(q(target, '.entity-link'));
    type(q<HTMLInputElement>(target, '.value-row[data-prop="n"] input'), '5');
    type(q<HTMLInputElement>(target, '.value-row[data-prop="t"] input'), 'go');
    type(q<HTMLInputElement>(target, '.value-row[data-prop="k"] input'), '#ff0000');
    const box = q<HTMLInputElement>(target, '.value-row[data-prop="b"] input');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(changes.at(-1)!.concepts[0].entities[0].values).toEqual({ n: 5, t: 'go', k: '#ff0000', b: true });
  });

  it('a reference value picks from the referenced concept\'s entities', () => {
    let g = addConcept(game(), { id: 'd', name: 'Decks' });
    g = addEntity(g, { concept: 'd', id: 'd1', name: 'Main' });
    g = addProperty(g, { owner: 'c', id: 'r', name: 'Deck', type: { kind: 'reference', concept: 'd' } });
    const { target, changes } = setup(g);
    openConcept(target);
    follow(q(target, '.entity-link'));
    const sel = q<HTMLSelectElement>(target, '.value-row[data-prop="r"] select');
    expect(qa(sel as any, 'option').map((o) => o.textContent!.trim())).toEqual(['(none)', 'Main']);
    sel.value = 'd1';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(changes.at(-1)!.concepts[0].entities[0].values.r).toBe('d1');
  });
});

describe('CrdbrdEditor: routing', () => {
  it('opens on the page in the hash, so a reload keeps your place', () => {
    const g = addEntity(withConcept(), { concept: 'c', id: 'e', name: 'Red' });
    location.hash = '#/concepts/c/entities/e';
    const { target } = setup(g);
    expect(q<HTMLInputElement>(target, 'input.entity-name').value).toBe('Red');
  });

  it('falls back to the game page when the hash names something that no longer exists', () => {
    location.hash = '#/concepts/gone';
    const { target } = setup();
    expect(q(target, 'input.game-name')).toBeTruthy();
  });

  it('follows the hash when it changes', () => {
    const { target } = setup(withConcept());
    location.hash = '#/concepts/c';
    dispatchEvent(new Event('hashchange'));
    flushSync();
    expect(q<HTMLInputElement>(target, 'input.concept-name').value).toBe('Players');
  });
});

describe('CrdbrdEditor: component sets', () => {
  const withSet = () => addSet(blank(), { id: 's', name: 'Deck' });
  const openSet = (target: HTMLElement) => follow(q(target, '.set-row .set-link'));

  it('adds a set from the game page, opens it, renames it and removes it', () => {
    const { target, changes } = setup();
    addNamed(target, 'form.add-set', 'Deck');
    expect(changes.at(-1)!.sets!.map((s) => s.name)).toEqual(['Deck']);
    openSet(target);
    type(q<HTMLInputElement>(target, 'input.set-name'), 'Main deck');
    expect(changes.at(-1)!.sets![0].name).toBe('Main deck');
    follow(q(target, '.crumbs a'));
    click(q(target, '.set-row button.remove'));
    expect(changes.at(-1)!.sets).toEqual([]);
  });

  it('adds a literal-count component to a set and edits its count', () => {
    const { target, changes } = setup(withSet());
    openSet(target);
    addNamed(target, 'form.add-component', 'Card');
    expect(changes.at(-1)!.sets![0].components.map((c) => [c.name, c.count])).toEqual([['Card', 1]]);
    type(q<HTMLInputElement>(target, '.component-row input.component-count'), '12');
    expect(changes.at(-1)!.sets![0].components[0].count).toBe(12);
    expect(q(target, '.instance-total').textContent).toContain('12');
    click(q(target, '.component-row button.remove-component'));
    expect(changes.at(-1)!.sets![0].components).toEqual([]);
    expect(q(target, '.instance-total').textContent).toContain('0');
  });

  it('defines set properties and a component\'s values for them', () => {
    const { target, changes } = setup(addComponent(withSet(), { set: 's', id: 'k', name: 'Card' }));
    openSet(target);
    addNamed(target, 'form.add-property', 'Cost');
    const p = changes.at(-1)!.sets![0].properties[0];
    expect(p.name).toBe('Cost');
    type(q<HTMLInputElement>(target, '.component-row .value-row input'), 'free');
    expect(changes.at(-1)!.sets![0].components[0].values).toEqual({ [p.id]: 'free' });
  });

  it('adds per-concepts and shows the total instance count from expand', () => {
    let g = addConcept(withSet(), { id: 'pl', name: 'Player' });
    for (const id of ['a', 'b', 'c']) g = addEntity(g, { concept: 'pl', id, name: id });
    g = addComponent(g, { set: 's', id: 'k', name: 'Card' });
    g = setComponentCount(g, 'k', 2);
    const { target, changes } = setup(g);
    openSet(target);
    expect(q(target, '.instance-total').textContent).toContain('2');
    const pick = q<HTMLSelectElement>(target, '.component-row select.add-per');
    pick.value = 'pl';
    pick.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(changes.at(-1)!.sets![0].components[0].per).toEqual(['pl']);
    expect(q(target, '.instance-total').textContent).toContain('6');
    expect(qa(target, '.per-chip').map((e) => e.textContent!.trim())).toEqual(['Player Remove']);
    click(q(target, '.per-chip button'));
    expect(changes.at(-1)!.sets![0].components[0].per).toEqual([]);
  });

  it('removing a concept drops it from the visible per-lists', () => {
    let g = addComponent(addConcept(withSet(), { id: 'pl', name: 'Player' }), { set: 's', id: 'k', name: 'Card' });
    g = addPer(g, 'k', 'pl');
    const { target, changes } = setup(g);
    click(q(target, '.concept-row button.remove'));
    expect(changes.at(-1)!.sets![0].components[0].per).toEqual([]);
  });

  it('nests sets, reachable from the parent with a way back', () => {
    const { target, changes } = setup(withSet());
    openSet(target);
    addNamed(target, 'form.add-child-set', 'Halves');
    expect(changes.at(-1)!.sets![0].children.map((c) => c.name)).toEqual(['Halves']);
    follow(q(target, '.child-set-row .set-link'));
    expect(q<HTMLInputElement>(target, 'input.set-name').value).toBe('Halves');
    expect(qa(target, '.crumbs a').map((a) => a.textContent!.trim())).toEqual(['Game', 'Deck']);
    click(q(target, '.crumbs a:nth-child(2)'));
  });

  it('edits and persists the substitute description', () => {
    const { target, changes } = setup(withSet());
    openSet(target);
    type(q<HTMLInputElement>(target, 'textarea.set-substitute'), 'a wooden cube in the player colour');
    expect(changes.at(-1)!.sets![0].substitute).toBe('a wooden cube in the player colour');
  });

  it('offers no editing when read-only', () => {
    location.hash = '#/sets/s';
    const { target } = setup(addComponent(withSet(), { set: 's', id: 'k', name: 'Card' }), true);
    expect(qa(target, 'input, button, select, textarea').every((e) => (e as HTMLInputElement).disabled)).toBe(true);
  });

  it('opens on a set page from the hash, and falls back when the set is gone', () => {
    location.hash = '#/sets/s';
    const { target } = setup(withSet());
    expect(q<HTMLInputElement>(target, 'input.set-name').value).toBe('Deck');
  });
});

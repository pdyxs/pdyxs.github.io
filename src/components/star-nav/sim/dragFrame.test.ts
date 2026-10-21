import { describe, it, expect } from 'vitest';
import { approachFrame, dragToControls, isDrag, type DragFrame } from './dragFrame';
import { defaultTuning, type Tuning } from './tuning';

const tuning: Tuning = { ...defaultTuning, dragRange: 0.5, maxOffset: 1, defaultCommit: 0.5 };
// approaching straight up the screen, in a 200px box: the full range is 100px
const frame: DragFrame = { heading: 0, boxWidth: 200, deadZone: 0, minOffset: 0.05, lowestCommit: 0.2 };

describe('approachFrame', () => {
  it('points from the ship to the intercept, as a heading clockwise from up', () => {
    const f = approachFrame({ x: 0, y: 4 }, { x: 0, y: 0 }, { boxWidth: 200, deadZone: 3, minOffset: 0.05, lowestCommit: 0.2 });
    expect(f.heading).toBeCloseTo(0, 9);
    const east = approachFrame({ x: 0, y: 0 }, { x: 2, y: 0 }, { boxWidth: 200, deadZone: 3, minOffset: 0.05, lowestCommit: 0.2 });
    expect(east.heading).toBeCloseTo(90, 9);
    expect(east).toMatchObject({ boxWidth: 200, deadZone: 3, minOffset: 0.05, lowestCommit: 0.2 });
  });
});

describe('dragToControls: the pass axis', () => {
  it('the side the drag is on is the side the ship passes, scaled by the drag range', () => {
    expect(dragToControls({ x: 50, y: 0 }, frame, tuning).offset).toBeCloseTo(0.5, 9);
    expect(dragToControls({ x: -50, y: 0 }, frame, tuning).offset).toBeCloseTo(-0.5, 9);
  });

  it('never passes closer than the planet radius, and clamps at the maximum', () => {
    expect(dragToControls({ x: 1, y: 0 }, frame, tuning).offset).toBe(0.05);
    expect(dragToControls({ x: -1, y: 0 }, frame, tuning).offset).toBe(-0.05);
    expect(dragToControls({ x: 900, y: 0 }, frame, tuning).offset).toBe(1);
    expect(dragToControls({ x: -900, y: 0 }, frame, tuning).offset).toBe(-1);
  });

  it('"perpendicular" follows the frame: approaching east, the pass axis is vertical', () => {
    const east = { ...frame, heading: 90 };
    // dragging down the screen is dragging right of an eastward heading
    expect(dragToControls({ x: 0, y: 50 }, east, tuning).offset).toBeCloseTo(0.5, 9);
    expect(dragToControls({ x: 50, y: 0 }, east, tuning).offset).toBeCloseTo(0.05, 9);
  });
});

describe('dragToControls: the commitment axis', () => {
  it('forward is more commitment, back is less', () => {
    // drag up the screen = toward the direction of travel
    expect(dragToControls({ x: 0, y: -20 }, frame, tuning).commit).toBeCloseTo(0.7, 9);
    expect(dragToControls({ x: 0, y: 20 }, frame, tuning).commit).toBeCloseTo(0.3, 9);
  });

  it('is clamped to [lowestCommit, 1]', () => {
    expect(dragToControls({ x: 0, y: -900 }, frame, tuning).commit).toBe(1);
    expect(dragToControls({ x: 0, y: 900 }, frame, tuning).commit).toBe(0.2);
  });
});

describe('dragToControls: the dead zone', () => {
  it('ignores a drag inside it: the neutral controls', () => {
    const touch = { ...frame, deadZone: 8 };
    expect(dragToControls({ x: 5, y: -5 }, touch, tuning)).toEqual({ offset: 0.05, commit: 0.5 });
    expect(dragToControls({ x: 50, y: -20 }, touch, tuning).offset).toBeCloseTo(0.5, 9);
  });

  it('a box with no width ignores the drag rather than dividing by it', () => {
    expect(dragToControls({ x: 50, y: -20 }, { ...frame, boxWidth: 0 }, tuning)).toEqual({ offset: 0.05, commit: 0.5 });
  });
});

describe('isDrag', () => {
  it('a mouse that has not moved is a tap; any movement is a drag', () => {
    expect(isDrag({ x: 0, y: 0 }, frame)).toBe(false);
    expect(isDrag({ x: 0.5, y: 0 }, frame)).toBe(true);
  });

  it('a touch is a tap until it leaves the dead zone', () => {
    const touch = { ...frame, deadZone: 8 };
    expect(isDrag({ x: 5, y: 5 }, touch)).toBe(false);
    expect(isDrag({ x: 6, y: 6 }, touch)).toBe(true);
  });
});

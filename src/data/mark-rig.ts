// The suspended-dot mark's five threads, as authored data. Edited live on
// /experiments/suspended-dot ("edit strands") and pasted back here.
//
// Units are the title's em, so the rig holds at any title size and grows with
// it. Every thread runs from its ANCHOR (on a letter) to its ATTACH point (on
// the dot), as a cubic Bézier with two control points, authored twice:
//
//   rest — the dot sitting in the title. Control points are in the thread's
//          own chord frame: t runs along the chord (0 = anchor, 1 = dot), u
//          across it (× chord length; +u is clockwise of anchor→dot, which is
//          "down" for a thread running left to right). Stretching the chord
//          stretches the curve with it.
//   hang — the dot stopped at the top edge with the letters gone above it.
//          Control points are em offsets from the attach point, because the
//          anchors are off-screen and the shape that matters is the loop the
//          visitor sees under the dot.
//
// Between the two poses each control point blends linearly, from the moment
// the dot stops to the moment the departing title reaches its final place.

export interface RigPoint {
  x: number;
  y: number;
}

export interface ChordPoint {
  t: number;
  u: number;
}

export interface RigThread {
  /** Where it ties to the letters: em from the dot's centre. */
  anchor: RigPoint;
  /** Where it meets the dot: fraction of the dot's square (0..1). */
  attach: RigPoint;
  /** [near anchor, near dot], in the chord frame. */
  rest: [ChordPoint, ChordPoint];
  /** [near anchor, near dot], em from the attach point. */
  hang: [RigPoint, RigPoint];
}

export interface MarkRig {
  /** Stroke width, em (never drawn under 1.2px). */
  width: number;
  threads: RigThread[];
}

export const MARK_RIG: MarkRig = {
  width: 0.012,
  threads: [
    {
      // s top tip
      anchor: { x: -0.2028, y: -0.4125 },
      attach: { x: 0.0807, y: 0.088 },
      rest: [{ t: 0.5793, u: 0.0764 }, { t: 0.8318, u: 0.1499 }],
      hang: [{ x: -0.03, y: -0.45 }, { x: 0, y: -0.15 }],
    },
    {
      // w top
      anchor: { x: 0.1484, y: -0.4558 },
      attach: { x: 0.9527, y: 0.072 },
      rest: [{ t: 0.4975, u: -0.107 }, { t: 0.7907, u: -0.183 }],
      hang: [{ x: 0.03, y: -0.45 }, { x: 0, y: -0.15 }],
    },
    {
      // s bottom tip
      anchor: { x: -0.2928, y: 0.0503 },
      attach: { x: 0.114, y: 0.9167 },
      rest: [{ t: 0.2013, u: 0.3485 }, { t: 0.5606, u: 0.5948 }],
      hang: [{ x: -0.35, y: 0.15 }, { x: -0.0711, y: 0.0444 }],
    },
    {
      // x foot — loops under the s
      anchor: { x: -0.6423, y: 0.0424 },
      attach: { x: 0.486, y: 0.9367 },
      rest: [{ t: 0.2878, u: 0.4986 }, { t: 0.9852, u: 0.3996 }],
      hang: [{ x: -0.6, y: 0.35 }, { x: -0.1142, y: 0.1975 }],
    },
    {
      // w foot
      anchor: { x: 0.6471, y: 0.0238 },
      attach: { x: 0.8673, y: 0.9367 },
      rest: [{ t: 0.3333, u: -0.383 }, { t: 0.6324, u: -0.4052 }],
      hang: [{ x: 0.55, y: 0.3 }, { x: 0.1678, y: 0.1215 }],
    },
  ],
};

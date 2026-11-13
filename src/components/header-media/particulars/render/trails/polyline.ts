// A timestamped point history: append at the head, drop from the tail. Reuses its storage.

export class Polyline {
  xs: Float64Array;
  ys: Float64Array;
  ts: Float64Array;
  /** Index of the oldest live point. */
  start = 0;
  /** One past the newest point. */
  end = 0;

  constructor(capacity = 32) {
    this.xs = new Float64Array(capacity);
    this.ys = new Float64Array(capacity);
    this.ts = new Float64Array(capacity);
  }

  get length(): number {
    return this.end - this.start;
  }

  clear(): void {
    this.start = 0;
    this.end = 0;
  }

  /** The i-th live point, oldest first. */
  x(i: number): number { return this.xs[this.start + i]; }
  y(i: number): number { return this.ys[this.start + i]; }
  t(i: number): number { return this.ts[this.start + i]; }

  push(x: number, y: number, t: number): void {
    if (this.end === this.xs.length) this.makeRoom();
    this.xs[this.end] = x;
    this.ys[this.end] = y;
    this.ts[this.end] = t;
    this.end++;
  }

  /** Drop the oldest n points. */
  shift(n = 1): void {
    this.start = Math.min(this.end, this.start + n);
    if (this.start === this.end) this.clear();
  }

  /**
   * Drop points older than `maxAge`, keeping the newest point that is too old
   * so the tail can be clipped exactly at maxAge rather than popping.
   */
  expire(now: number, maxAge: number): void {
    let drop = 0;
    const n = this.length;
    while (drop + 1 < n && now - this.t(drop + 1) >= maxAge) drop++;
    if (drop > 0) this.shift(drop);
  }

  private makeRoom(): void {
    const n = this.length;
    if (this.start > 0 && n < this.xs.length / 2) {
      this.xs.copyWithin(0, this.start, this.end);
      this.ys.copyWithin(0, this.start, this.end);
      this.ts.copyWithin(0, this.start, this.end);
    } else {
      const grow = (a: Float64Array) => {
        const b = new Float64Array(a.length * 2);
        b.set(a.subarray(this.start, this.end));
        return b;
      };
      this.xs = grow(this.xs);
      this.ys = grow(this.ys);
      this.ts = grow(this.ts);
    }
    this.start = 0;
    this.end = n;
  }
}

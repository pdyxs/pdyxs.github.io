// Collects triangle-strip vertices (x, y, r, g, b, a — world units, straight alpha)
// for many strips into one buffer, joined by degenerate triangles, so a frame is one draw.

export const FLOATS_PER_VERTEX = 6;

export class StripWriter {
  data = new Float32Array(4096 * FLOATS_PER_VERTEX);
  /** Vertices written. */
  count = 0;
  private stripOpen = false;

  reset(): void {
    this.count = 0;
    this.stripOpen = false;
  }

  /** Start a new strip. Its vertices must come in pairs (left, right) so winding parity holds. */
  begin(): void {
    this.stripOpen = false;
  }

  vertex(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (!this.stripOpen) {
      this.stripOpen = true;
      if (this.count > 0) {
        // Join to the previous strip: repeat its last vertex, then this one.
        this.copyLast();
        this.write(x, y, r, g, b, a);
      }
    }
    this.write(x, y, r, g, b, a);
  }

  private copyLast(): void {
    const o = (this.count - 1) * FLOATS_PER_VERTEX;
    const d = this.data;
    this.write(d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5]);
  }

  private write(x: number, y: number, r: number, g: number, b: number, a: number): void {
    let o = this.count * FLOATS_PER_VERTEX;
    if (o + FLOATS_PER_VERTEX > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const d = this.data;
    d[o++] = x; d[o++] = y; d[o++] = r; d[o++] = g; d[o++] = b; d[o] = a;
    this.count++;
  }
}

// SVG path data check, pure. Lives in the model so validation can use it.

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const TOKEN = /([a-zA-Z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|[\s,]+/y;

/** Whether `d` is SVG path data: starts with a move, known commands, whole argument groups, arc flags 0 or 1. */
export function validPathData(d: string): boolean {
  const tokens: (string | number)[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < d.length) {
    const m = TOKEN.exec(d);
    if (!m) return false;
    if (m[1]) tokens.push(m[1]);
    else if (m[2]) tokens.push(parseFloat(m[2]));
  }
  if (typeof tokens[0] !== 'string' || tokens[0].toLowerCase() !== 'm') return false;
  for (let i = 0; i < tokens.length; ) {
    const cmd = tokens[i++] as string;
    const n = ARGS[cmd.toLowerCase()];
    if (n === undefined) return false;
    let count = 0;
    const groupStart = i;
    while (typeof tokens[i] === 'number') i++;
    count = i - groupStart;
    if (n === 0 ? count !== 0 : count === 0 || count % n !== 0) return false;
    if (n === 7) for (let g = groupStart; g < i; g += 7) if (![3, 4].every((k) => tokens[g + k] === 0 || tokens[g + k] === 1)) return false;
  }
  return true;
}

/** What is wrong with an outline value, if anything: its shape or parameters (`outline`), or a custom path (`path`). */
export function outlineProblem(o: unknown): 'outline' | 'path' | null {
  if (typeof o !== 'object' || o === null) return 'outline';
  const v = o as Record<string, unknown>;
  switch (v.kind) {
    case 'rectangle':
      return v.radius === undefined || (typeof v.radius === 'number' && Number.isFinite(v.radius) && v.radius >= 0) ? null : 'outline';
    case 'circle':
      return null;
    case 'hexagon':
      return (v.orientation === 'pointy' || v.orientation === 'flat') && (v.measure === 'flat-to-flat' || v.measure === 'point-to-point') ? null : 'outline';
    case 'custom':
      return typeof v.path === 'string' ? (validPathData(v.path) ? null : 'path') : 'outline';
    default:
      return 'outline';
  }
}

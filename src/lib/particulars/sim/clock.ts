/** Pure: how many fixed steps are due after `elapsed` seconds, and the leftover time. */
export function stepsDue(
  accumulator: number,
  elapsed: number,
  dt: number,
  maxSteps: number,
): { steps: number; remainder: number } {
  const total = accumulator + elapsed;
  const due = Math.floor(total / dt + 1e-9);
  if (due > maxSteps) return { steps: maxSteps, remainder: 0 };
  return { steps: due, remainder: Math.max(0, total - due * dt) };
}

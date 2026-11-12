// Semver bump. Pure: a version and a kind in, the next version out.

export type BumpKind = 'major' | 'minor' | 'patch';
export const BUMP_KINDS: readonly BumpKind[] = ['major', 'minor', 'patch'];

export function bump(version: string, kind: BumpKind): string {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!m) throw new Error(`not a semver version: ${version}`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

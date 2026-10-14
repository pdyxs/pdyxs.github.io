import type { Scenario } from './types';
import { validate } from './validate';

/**
 * Picks `<entryId>/index.json` out of a glob result and validates it.
 * Throws a readable error rather than returning something the toy might mount.
 */
export function scenarioFor(files: Record<string, unknown>, entryId: string): Scenario {
  const key = `/src/content/${entryId}/index.json`;
  if (!(key in files)) throw new Error(`Particulars: ${entryId} has no index.json beside its index.md`);
  const result = validate(files[key]);
  if (!result.ok) {
    throw new Error(
      `Particulars: invalid scenario for ${entryId}\n${result.errors.map((e) => `- ${e}`).join('\n')}`,
    );
  }
  return result.scenario;
}

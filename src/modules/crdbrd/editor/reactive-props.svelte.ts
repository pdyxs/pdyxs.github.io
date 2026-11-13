// Test helper: a reactive props object, so a test can play the shell's part
// (`data` replaced after each onChange). Needs `.svelte.ts` for the runes.
export function reactiveProps<T extends object>(initial: T): T {
  const props = $state(initial);
  return props;
}

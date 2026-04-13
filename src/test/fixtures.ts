export function fakeEntry(overrides?: { description?: string }): { data: { description?: string } } {
  return { data: { description: undefined, ...overrides } };
}

export function fakeContent(): undefined {
  return undefined;
}

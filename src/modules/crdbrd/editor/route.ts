// The island's hash route. Pure: parse and write only; the island owns the
// location.

export type Route =
  | { page: 'game' }
  | { page: 'concept'; concept: string }
  | { page: 'entity'; concept: string; entity: string };

const GAME: Route = { page: 'game' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    const [a, concept, b, entity, ...rest] = parts.map(decodeURIComponent);
    if (rest.length) return GAME;
    if (a === 'concepts' && concept && parts.length === 2) return { page: 'concept', concept };
    if (a === 'concepts' && concept && b === 'entities' && entity) return { page: 'entity', concept, entity };
  } catch {
    // malformed escape
  }
  return GAME;
}

export function routeHash(route: Route): string {
  const e = encodeURIComponent;
  switch (route.page) {
    case 'game': return '#/';
    case 'concept': return `#/concepts/${e(route.concept)}`;
    case 'entity': return `#/concepts/${e(route.concept)}/entities/${e(route.entity)}`;
  }
}

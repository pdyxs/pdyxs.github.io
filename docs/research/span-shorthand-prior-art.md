# `span:` shorthand — prior art for a breakpoint-scoped value in a config file

Research note for the `span` field being added to `src/content/what/home.lens.yaml`
(a 12-column grid span declared per tier: mobile — always 12, never authored —
plus `small` and `large`).

*Filed under `docs/research/` because the repo has no existing research-notes
convention: `docs/` holds flat markdown (`content-vault.md`) plus `docs/agents/`
for skill-facing docs. A one-off investigation note is neither, so it gets its
own directory.*

Everything below is traced to the documentation or source repository that owns
it. URLs fetched are listed at the end. Negative findings are stated as
negatives, not smoothed over.

---

## Summary — recommendation

**Use a nested mapping, with the bare scalar kept as the shorthand:**

```yaml
span: 4                 # both tiers

span:                   # tiers differ
  small: 6
  large: 4
```

**The single strongest reason:** every framework and library that expresses a
breakpoint-scoped value **as a configuration value rather than a CSS class
name** uses a *map keyed by breakpoint name*. Foundation — the very framework
whose class syntax `small-6 large-4` is one of the two candidates — does **not**
use that string shape in its own Sass config; it uses
`(small: 20px, medium: 30px)`, and ships a documented function
(`-zf-get-bp-val`) whose fallback rule is "the value matching the next lowest
breakpoint in the config map". The space-separated string is a *class-name*
encoding, forced on those frameworks by the fact that a CSS class name cannot be
a map. This config file is under no such constraint.

Neither candidate string form (`small-6 large-4`, `6sm 4lg`) has any precedent
*as a config value* in anything surveyed. If a string form is chosen anyway,
`small-6 large-4` is the defensible one and `6sm 4lg` is not — see Part 1's
ordering column and the HTML `sizes` precedent.

---

## Part 1 — CSS framework prior art

| Framework | Class-string syntax | Ordering | Mobile-first (min-width, inherits upward)? | Breakpoint-scoped value **as a config value**? |
|---|---|---|---|---|
| Bootstrap 5.3 | `col-sm-4`, `col-md-8`, `col-lg-4` | **tier-first** | Yes, explicitly | **No.** `$grid-breakpoints` is a *breakpoint registry*, not a per-breakpoint value; no other such map documented |
| Tailwind v3 | `md:w-32`, `lg:w-48` | **tier-first** (variant prefix) | Yes, explicitly | **No.** `theme.screens` registers breakpoints; no theme scale is breakpoint-keyed |
| Tailwind v4 | same class syntax | tier-first | Yes | **No.** Breakpoints move to `@theme { --breakpoint-xs: 30rem }` — still a registry |
| Foundation 6 (XY grid) | `small-6 large-4` | **tier-first** | Yes ("cells stack on small screens, become even-width on large") | **YES — and it is a map, not this string.** `$grid-margin-gutters: ("small": 20px, "medium": 30px)`, consumed by `-zf-get-bp-val` |
| Bulma | `is-half-desktop`, `is-two-thirds-tablet` | **value-first** | Partially — columns "only activated from tablet onwards"; no mobile-first inheritance sentence in the docs | **No** documented per-breakpoint Sass value map on the responsiveness page |
| Open Props | n/a (no grid classes) | n/a | n/a | **No.** `@custom-media --md-n-above (width >= 768px)` names *queries*; sizes are exposed as `var(--size-md)` etc. Never a token whose value varies per breakpoint |

### Bootstrap 5.3

Class syntax is `.col-{breakpoint}-{width}` — tier before value. On inheritance,
the docs are explicit:

> "Breakpoints are based on `min-width` media queries, meaning they affect that
> breakpoint and all those above it (e.g., `.col-sm-4` applies to `sm`, `md`,
> `lg`, `xl`, and `xxl`)."

The Sass side:

```scss
$grid-breakpoints: (
  xs: 0,
  sm: 576px,
  md: 768px,
  lg: 992px,
  xl: 1200px,
  xxl: 1400px
);
```

**This is not the pattern being looked for.** `$grid-breakpoints` maps breakpoint
name → *the width at which the breakpoint starts*. It is a registry of
breakpoints, not a value that varies by breakpoint. Consumed via
`@include media-breakpoint-up(sm) { ... }`. The breakpoints page documents **no
other** Sass map whose values are per-breakpoint scalars.

Sources: <https://getbootstrap.com/docs/5.3/layout/grid/>,
<https://getbootstrap.com/docs/5.3/layout/breakpoints/>

### Tailwind CSS (v3 and v4)

Tier-first variant prefix, and the mobile-first rule stated outright:

> "What this means is that unprefixed utilities (like `uppercase`) take effect on
> all screen sizes, while prefixed utilities (like `md:uppercase`) only take
> effect at the specified breakpoint _and above_."

> "Where this approach surprises people most often is that to style something for
> mobile, you need to use the unprefixed version of a utility, not the `sm:`
> prefixed version."

```html
<!-- Width of 16 by default, 32 on medium screens, and 48 on large screens -->
<img class="w-16 md:w-32 lg:w-48" src="..." />
```

That example is worth noting: the **base value is the unsuffixed one**, which is
exactly the "bare scalar is the common case" shape being proposed here.

v4 config:

```css
@import "tailwindcss";
@theme {
  --breakpoint-xs: 30rem;
  --breakpoint-2xl: 100rem;
}
```

v3 config:

```javascript
theme: {
  screens: {
    'sm': '640px', 'md': '768px', 'lg': '1024px',
    'xl': '1280px', '2xl': '1536px',
  }
}
```

> "The keys become your responsive modifiers (like `md:text-center`), and the
> values are the `min-width` where that breakpoint should start."

Again a **registry**, not a breakpoint-keyed value. I found **no** Tailwind theme
scale (spacing, colors, fontSize, …) whose value may be a per-breakpoint map, in
either version.

*Flagged as unverified:* the v3 screens page contains no sentence explicitly
saying "`screens` is the only place breakpoints are named", so the "no other
breakpoint-keyed theme value" claim above is an absence-of-evidence reading of
the docs, not a quoted statement.

Sources: <https://tailwindcss.com/docs/responsive-design>,
<https://v3.tailwindcss.com/docs/screens>

### Foundation for Sites 6 — the load-bearing finding

Class syntax is tier-first, `"small-6 large-4"` / `"medium-6 large-8"`, and the
docs describe upward cascade: *"the cells stack on small screens, and become
even-width on large screens."*

But the **config** form is a Sass map, and Foundation ships a first-class
mechanism for it. From `scss/util/_breakpoint.scss` (`develop`):

```scss
/// A list of named breakpoints. You can use these with the `breakpoint()`
/// mixin to quickly create media queries.
/// @type Map
$breakpoints: (
  "small": 0,
  "medium": 640px,
  "large": 1024px,
  "xlarge": 1200px,
  "xxlarge": 1440px,
) !default;
```

and, crucially:

```scss
/// Get a value for a breakpoint from a responsive config map or single value.
/// - If the config is a single value, return it regardless of `$value`.
/// - If the config is a map and has the key `$value`, the exact breakpoint
/// value is returned.
/// - If the config is a map and does *not* have the breakpoint, the value
/// matching the next lowest breakpoint in the config map is returned.
@function -zf-get-bp-val($map, $value)
```

Three things follow directly, and they answer the design question almost
completely:

1. **The union of "bare scalar or per-breakpoint map" is Foundation's own
   documented shape** — "If the config is a single value, return it regardless
   of `$value`". That is precisely `span: 4` vs `span: {small: 6, large: 4}`.
2. **The degradation rule is stated**: a missing tier takes *the next lowest
   breakpoint present in the map*. Mobile-first, in a config value.
3. **Foundation did not reuse its own class string** for this. Given a free
   choice of encoding in Sass, it chose a map.

The live example is the gutter config:

```scss
$grid-margin-gutters: (
  "small": 20px,
  "medium": 30px
)
$grid-padding-gutters: $grid-margin-gutters
```

consumed as a map-or-scalar union in `scss/xy-grid/_gutters.scss`:

```scss
/// @param {Number|Map} $gutters [$grid-margin-gutters] - Map or single value for gutters.
...
@if (type-of($gutters) == 'map') {
  @include -zf-breakpoint-value(auto, $gutters) {
    $gutter: rem-calc($-zf-bp-value) * 0.5;
    ...
  }
}
```

The `breakpoint()` mixin itself takes keywords, not maps:
`@include breakpoint(medium)`, `@include breakpoint(medium down)`,
`@include breakpoint(medium only)`, `@include breakpoint(medium, large, xlarge up)`.

Sources: <https://get.foundation/sites/docs/xy-grid.html>,
<https://get.foundation/sites/docs/media-queries.html>,
<https://raw.githubusercontent.com/foundation/foundation-sites/develop/scss/util/_breakpoint.scss>,
<https://raw.githubusercontent.com/foundation/foundation-sites/develop/scss/xy-grid/_gutters.scss>

### Bulma — the one value-first counterexample, and it is a class name

Every breakpoint-scoped column class puts the value **before** the tier:

- `is-three-quarters-mobile`
- `is-two-thirds-tablet`
- `is-half-desktop`
- `is-one-third-widescreen`
- `is-one-quarter-fullhd`

So `6sm 4lg`'s value-first ordering does have *one* precedent — but it is a CSS
class name, not a config value, and Bulma is the outlier among the five
frameworks surveyed. The responsiveness page states no mobile-first inheritance
rule (it notes only that "by default, columns are only activated from **tablet**
onwards") and documents no per-breakpoint Sass value map.

Source: <https://bulma.io/documentation/columns/responsiveness/>

### Open Props

Open Props names media *queries* as custom media, and exposes the widths
separately as size tokens:

```css
@custom-media --md-only (480px <= width < 768px);
@custom-media --md-n-above (width >= 768px);
@custom-media --md-n-below (width < 768px);
```

> "Media query widths also available as custom properties. Use like `var(--size-sm)`"

**Open Props never encodes a breakpoint into a token's value.** Adaptive values
are built by the consumer redeclaring a custom property inside one of the
`@custom-media` blocks — i.e. the CSS cascade does the per-breakpoint selection,
and the token stays a single scalar. This is a genuine negative result and it is
consistent with the DTCG finding in Part 2.

Source: <https://open-props.style/#media-queries>

### Part 1 conclusion

- **Tier-first is the majority ordering** in class strings (Bootstrap, Tailwind,
  Foundation), with Bulma the lone value-first exception.
- **Mobile-first min-width inheritance — an omitted tier inherits from the tier
  below — is universal** where it is stated at all (Bootstrap, Tailwind,
  Foundation, and Panda in Part 2). Nothing surveyed inherits *downward*.
- **The space-separated string is an artefact of the medium.** A CSS class name
  is a string; a Sass/JS config is not. The only framework in this set that
  needed a config-value encoding (Foundation) chose a map and explicitly allowed
  a bare scalar alongside it.

---

## Part 2 — config-file ecosystems

| Ecosystem | Shape for a per-breakpoint value | Verdict |
|---|---|---|
| Astro `image.*` | `image.breakpoints: [640, 750, 828, …]` — a flat array of *widths* | **No per-breakpoint scalar anywhere in Astro config** |
| Storybook viewports | map keyed by viewport name → `{ name, styles: {width, height}, type }` | Map-keyed, but it declares *viewports*, not a value that varies by one |
| DTCG format spec | token has one required `$value` | **Spec defines no conditional/responsive value mechanism at all** |
| DTCG Resolver draft | `modifiers.<name>.contexts` → arrays of token *sources* | Swaps whole token sets; never a per-breakpoint value inside a token |
| Tokens Studio | themes = combinations of token **sets**, resolved by set order | Same model: swap sets, not values |
| Decap CMS | Boolean, Code, Color, DateTime, File, Hidden, Image, List, Map, Number, Object, Relation, Select, String, Text | **No breakpoint-aware widget or shorthand** |
| Chakra UI | array `["medium", undefined, undefined, "bold"]` **or** object `{ base: "medium", lg: "bold" }` | **Object/array of breakpoint-keyed values — closest prior art** |
| Panda CSS | object `{ base: 'red', md: 'blue' }` or array `['medium', undefined, undefined, 'bold']` | Same |
| Styled System | array `width={[1, 1/2, 1/4]}` or object `{ _: 1, sm: 1, md: 1/2, lg: 1/4 }` | Same, and it originated the pattern |
| HTML `sizes` attribute | `<media-condition> <source-size-value>`, comma-separated, last entry bare | **Condition-first string with a bare fallback — strong precedent for the *string* form's ordering** |

### Astro

`image.breakpoints` — *"The breakpoints used to generate responsive images"* —
defaults to `[640, 750, 828, 1080, 1280, 1668, 2048, 2560]` (local service) or a
longer list (remote). It is an **array of numbers**, not a map keyed by
breakpoint name; the numbers *are* the widths, generated into `srcset`.
`image.layout` (`undefined` by default), `image.responsiveStyles` (`false`) and
`image.objectFit` (`"cover"`) are all plain scalars.

**Nothing in Astro's configuration takes a per-breakpoint scalar.** There is no
house precedent to follow here.

Sources: <https://docs.astro.build/en/guides/images/>,
<https://docs.astro.build/en/reference/configuration-reference/>

### Storybook viewports

```typescript
{
  [key: string]: {
    name: string;
    styles: { height: string, width: string };
    type: 'desktop' | 'mobile' | 'tablet' | 'other';
  };
}
```

```javascript
const kindleViewports = {
  kindleFire2:  { name: 'Kindle Fire 2',  styles: { width: '600px', height: '963px' } },
  kindleFireHD: { name: 'Kindle Fire HD', styles: { width: '533px', height: '801px' } },
};
```

Map keyed by name, object value. But like `$grid-breakpoints` this *declares the
viewports*; it is not a value that varies across them. Included for completeness;
it is weak prior art for the question.

Source: <https://storybook.js.org/docs/essentials/viewport>

### Design token specs — a clean negative

The DTCG format spec is unambiguous that a token carries **one** value:

> "An object with a `$value` property is a token. Thus, `$value` is a reserved
> word in our spec, meaning you can't have a token whose name is '$value'. The
> parent object's key is the token name."

> "Name and value are both **required**."

Searching the draft for *condition*, *responsive*, *breakpoint*, *mode* and
*theme* turns up nothing that permits a conditional or breakpoint-scoped value
inside a token. The mechanisms it does define — type inheritance, aliases,
groups, `$extensions`, composite types — none of them select a value by context.

Variation is handled *outside* the token, in the companion **Resolver Module
draft**, and it swaps whole sets:

```json
{
  "modifiers": {
    "theme": {
      "contexts": {
        "light": [{ "$ref": "theme/light.json" }],
        "dark":  [{ "$ref": "theme/dark.json" }]
      }
    }
  }
}
```

A modifier is *"similar to a set, but allows for conditional inclusion via the
contexts map"*, and `contexts` is *"a map of a string value to an array of token
sources"* — files, not values.

**Tokens Studio follows the same model**: themes are named combinations of token
**sets**, and *"the resolved values change based on the position of the theme
Token Sets, with whichever Token Set is lowest in the list passing its value."*
Token names collide across sets deliberately; that collision *is* the theming
mechanism. There is no per-breakpoint shorthand inside a single token value.

*Flagged:* the Tokens Studio finding comes from search-surfaced excerpts of
`docs.tokens.studio` (the specific themes-overview page 404'd on direct fetch),
so it is one notch weaker than the rest. The DTCG findings are from the spec
drafts themselves.

**This is a load-bearing negative for the design question**: the design-token
world, which is *exactly* the world of "a scalar declared in a config file",
has deliberately not put conditions inside values. It puts them outside, as
named sets. That argues against inventing a condition-encoding string here, and
mildly in favour of the plainest possible in-value shape if one is needed at all.

Sources: <https://www.designtokens.org/TR/drafts/format/>,
<https://www.designtokens.org/tr/drafts/resolver/>,
<https://docs.tokens.studio/manage-themes/themes-overview>,
<https://docs.tokens.studio/manage-tokens/token-sets/>

### Decap CMS — a clean negative

Built-in widgets: *"Boolean Code Color DateTime File Hidden Image List Map
Richtext (Beta) Markdown (deprecated) Number Object Relation Select String
Text"*. There is **no breakpoint-aware widget and no per-breakpoint shorthand**.
A per-breakpoint value would be modelled with the `Object` widget — i.e. a
nested mapping — or a custom widget.

Worth noting for authorability: of the candidate shapes, **only the nested
mapping is expressible in a generic schema-driven CMS field UI**. A
`"small-6 large-4"` string is a free-text box with a regex, in any of them.

Source: <https://decapcms.org/docs/widgets/>

### Chakra / Panda / Styled System — the closest real prior art

This is the family that answers "a breakpoint-scoped value as a config VALUE
rather than a class string", and all three landed on the same two options.

**Styled System** (the origin):

```jsx
<Box width={[1, 1/2, 1/4]} />
```

— *"100% below the smallest breakpoint"*, *"50% from the next breakpoint and
up"*, *"25% from the next breakpoint and up"*. Object form with aliases:

```jsx
<Box width={{ _: 1, sm: 1, md: 1/2, lg: 1/4 }} />
```

where `_` is the base value, and *"any undefined alias key will define the base,
non-responsive value"*. Explicitly *"mobile-first"*.

**Chakra UI**:

```jsx
<Text fontWeight={["medium", undefined, undefined, "bold"]}>Text</Text>
<Text fontWeight={{ base: "medium", lg: "bold" }}>Text</Text>
```

with *"Pass the corresponding value for each breakpoint in the array"* and
*"Notice the use of `undefined` for the breakpoints to skip the `md` and `lg`
breakpoints."*

**Panda CSS**:

```js
fontWeight: { base: 'medium', lg: 'bold' }
fontWeight: ['medium', undefined, undefined, 'bold']
```

> "Panda uses a mobile-first breakpoint system and leverages min-width media
> queries `@media(min-width)` when you write responsive styles."

> "styles assigned to a specific breakpoint will be effective at that breakpoint
> and will persist as applied styles at larger breakpoints"

**Array vs object — what the docs actually say.** Honest answer: *none of the
three states a preference in the pages fetched.* Chakra's docs give no reasoning
comparing them; Panda presents both as alternatives (introducing the object form
as *"a more concise syntax"* relative to a nested-object form, not relative to
arrays). So "the object form is the recommended one" is community lore I could
**not** verify from primary docs, and I am flagging it as such.

What the docs *do* show, without needing an editorial preference, is the array
form's cost: **`["medium", undefined, undefined, "bold"]` and
`['medium', undefined, undefined, 'bold']` are the documented examples.** Two
positional holes to skip two tiers. With only three tiers here (mobile / small /
large) that is less painful, but the hazard is structural: an array's meaning
depends on the *position count matching the breakpoint count*, so adding a tier
silently re-points every existing array. A map does not have that failure mode.

**None of the three offers a string shorthand.** Not `"6sm 4lg"`, not
`"sm:6 lg:4"`, not `"small-6 large-4"`. Given a config value and total freedom,
three independent projects picked object-or-array and nobody picked a string.

Sources: <https://chakra-ui.com/docs/styling/responsive-design>,
<https://panda-css.com/docs/concepts/responsive-design>,
<https://github.com/styled-system/styled-system/blob/master/docs/responsive-styles.md>

### HTML `sizes` / `srcset` — the genuine string precedent

This is the one place in the surveyed material where a media-condition-scoped
scalar really is encoded in a **string**, and it is a spec, so it is worth
reporting precisely.

Grammar from the HTML Standard:

```
<source-size-list> = <source-size>#? , <source-size-value>
<source-size> = <media-condition> <source-size-value> | auto
<source-size-value> = <length> | auto
```

Two properties matter here:

1. **Condition-first.** Each entry is `<media-condition>` *then*
   `<source-size-value>` — e.g. `(max-width: 600px) 480px`. The condition leads.
2. **A bare fallback, and it is last.** The grammar's final term is a lone
   `<source-size-value>` with no condition, and the parse algorithm treats a
   conditionless entry anywhere but the end as an error: *"If this was not the
   last item in unparsed sizes list, that is a parse error."*

By contrast, `srcset`'s descriptors *are* value-first-ish — *"An image candidate
string consists of the following components, in order… A valid non-empty URL…
Zero or one of the following: A width descriptor, consisting of: ASCII
whitespace, a valid non-negative integer… and a U+0077 LATIN SMALL LETTER W
character"* — i.e. `image.jpg 640w`. But note what that is: the *subject* comes
first (the URL) and the descriptor qualifies it. It is not a condition-scoped
value; it is an item with a measurement attached.

**So the spec precedent for "a condition-scoped scalar in a string" is
condition-first with a bare fallback.** That maps onto `small-6 large-4` (with
`span: 4` as the bare fallback) and directly against `6sm 4lg`.

Sources: <https://html.spec.whatwg.org/multipage/images.html#sizes-attributes>

---

## Part 3 — zod cost, error quality, degradation, and YAML hazards

### What the repo actually uses — three corrections worth stating first

1. **zod v4.** `package.json` pins `astro: ^6.1.4`; Astro 6 depends on
   `"zod": "^4.3.6"`, and `node_modules/zod` is **4.3.6**. House style is
   `import { z } from "astro/zod"` (see `src/content.config.ts`), so any schema
   written here is zod **v4**, not v3.
2. **`home.lens.yaml` is not a content collection and is not zod-validated
   today.** `scripts/generate-lens-registry.mjs` reads every
   `<dimension>/<id>.lens.yaml` with `js-yaml` and emits
   `src/data/lenses.generated.ts`; the file header explicitly forbids that
   script from importing anything from `src/lib`. So a zod schema for `span`
   is **new plumbing**, and it cannot go in `src/content.config.ts` (that
   schema covers markdown frontmatter). It would have to be either a hand-rolled
   validation in the generator (no zod, to keep the generator's import ban) or a
   zod schema in `src/lib/frontpage.ts` applied where `FrontPageConfig` is
   consumed. Worth settling before costing the syntax.
3. **The parser is `js-yaml` 4.1.1, not the `yaml` npm package.**
   `src/lib/folder-config.ts`, `tag-registry.ts`, `collapse-config.ts` and the
   lens generator all use `import { load as parseYaml } from 'js-yaml'`. YAML
   behaviour below was tested against that exact parser.

### YAML resolution — measured, not assumed

Run through `js-yaml@4.1.1`'s default schema:

| YAML | parsed as | type |
|---|---|---|
| `span: 4` | `4` | number |
| `span: '4'` | `"4"` | string |
| `span: 6sm 4lg` | `"6sm 4lg"` | string |
| `span: small-6 large-4` | `"small-6 large-4"` | string |
| `span: 6sm` | `"6sm"` | string |
| `span: sm-6` | `"sm-6"` | string |
| `span: 4lg` | `"4lg"` | string |
| `span: small:6 large:4` | `"small:6 large:4"` | string |
| `span: {small: 6, large: 4}` | `{small: 6, large: 4}` | object |
| `span: [6, 4]` | `[6, 4]` | array |

**No YAML hazard in any candidate.** Every string form resolves cleanly as a
string — none is coerced to a number, and none needs quoting. `span: 4` is a
number and `span: "4"` is a string, which is the ordinary YAML core-schema
distinction (plain scalars matching the int pattern resolve as `int`, everything
else falls through to `str`; see YAML 1.2.2 §10.3 Core Schema — *flagged: I could
not fetch the resolution table verbatim, the yaml.org page and the spec source on
GitHub both truncate before Chapter 10, so this is stated from js-yaml's own
`lib/type/int.js` resolver and the measured behaviour above*).

Two small notes that don't change the ranking:

- `span: small:6 large:4` (the Tailwind-style form) is fine here **only because
  it has no space after the colon.** `span: small: 6` would be a YAML error. It
  is a form one keystroke from breaking, which is a mark against it.
- A double space (`6sm  4lg`) survives as-is, so any string parser must split on
  `/\s+/`, not `' '`.

### Candidate A — nested mapping (recommended)

```yaml
span: 4
span: { small: 6, large: 4 }
# or block form:
span:
  small: 6
  large: 4
```

```ts
import { z } from "astro/zod";

const spanValue = z.number().int().min(1).max(12);

// A span is either one number for every tier, or a per-tier map.
// Mobile is always 12 and is never authored. An omitted tier inherits from
// the tier below (Foundation's -zf-get-bp-val rule), so `{ large: 4 }` means
// small stays at mobile's 12.
export const span = z.union([
  spanValue,
  z.object({
    small: spanValue.optional(),
    large: spanValue.optional(),
  }).strict(),
]);

export type Span = z.infer<typeof span>;

// Thin resolver, pure:
export function spanFor(s: Span | undefined, tier: 'mobile' | 'small' | 'large'): number {
  if (s === undefined) return 12;
  if (typeof s === 'number') return s;
  if (tier === 'mobile') return 12;
  if (tier === 'small') return s.small ?? 12;
  return s.large ?? s.small ?? 12;
}
```

- **Schema lines:** ~10, and **fully declarative** — no `.transform()`, no
  `.refine()`. The `min(1).max(12)` bound is enforced by zod itself.
- **Error quality — the best of the three.** `.strict()` on the object means
  `span: { smal: 6, large: 4 }` reports **`Unrecognized key: "smal"`** at path
  `span`, naming the typo. `span: { small: 13 }` reports
  *"Too big: expected number to be <=12"* at path `span.small` — the error
  points at the offending *field*, which no string form can do. The union does
  degrade the message slightly for a wholly wrong type (`span: "big"` yields an
  invalid-union error listing both branches), but that is the one bad case, not
  the common one.
- **Degradation when a tier is omitted:** natural and matches every framework in
  Part 1. `{ large: 4 }` → small inherits mobile's 12 → widens to 4 at large.
  `{ small: 6 }` → 6 from small **upward**, i.e. large is 6 too. That second
  behaviour is exactly Tailwind's *"and above"*, Bootstrap's *"and all those
  above it"*, and Foundation's *"next lowest breakpoint in the config map"*.
  Nothing has to be invented.
- **Extensibility:** adding a third authored tier is one optional key. Nothing
  existing changes meaning.
- **CMS/tooling:** the only candidate a generic schema UI (Decap's `Object`
  widget) can render as fields.

### Candidate B — tier-first string, `span: small-6 large-4`

```ts
import { z } from "astro/zod";

const TIER_SPAN = /^(?:small|large)-(?:[1-9]|1[0-2])$/;

export const span = z.union([
  z.number().int().min(1).max(12),
  z
    .string()
    .refine(
      (s) => s.trim().split(/\s+/).every((t) => TIER_SPAN.test(t)),
      { message: 'Expected e.g. "small-6 large-4" (tiers: small, large; spans 1-12)' },
    )
    .transform((s) => {
      const out: { small?: number; large?: number } = {};
      for (const token of s.trim().split(/\s+/)) {
        const [tier, n] = token.split('-');
        out[tier as 'small' | 'large'] = Number(n);
      }
      return out;
    }),
]);
```

- **Schema lines:** ~18, and it **needs both `.refine()` and `.transform()`.**
  The regex can only validate one token; the multi-token rule, the
  duplicate-tier rule (`small-6 small-4`) and the empty-string rule all have to
  be hand-written in the refine if you want them caught at all. The version above
  silently accepts `small-6 small-4`.
- **Error quality — poor, and it is the union that makes it poor.**
  `span: smal-6 large-4` produces zod's invalid-union error, which reports *both*
  branch failures: "expected number, received string" from the number branch plus
  the custom message from the string branch. The author sees a complaint about
  numbers alongside a complaint about the string, and **nothing points at
  `smal`**. The custom message is the only useful part and it has to restate the
  whole grammar because it cannot name the offending token. This is the known
  `z.union([z.number(), z.string().regex(...)])` failure mode, and it is real
  here.
- **Degradation:** the same natural mobile-first reading as A, and it inherits
  the ordering precedent (Foundation's own classes, Bootstrap, Tailwind, and
  HTML `sizes`' condition-first grammar). This is the **defensible string form**
  if a string is chosen.
- **Post-parse shape is the same object as A**, which is worth noting: the
  transform's whole job is to arrive at `{small, large}`. Candidate A is
  Candidate B with the string round-trip deleted.

### Candidate C — value-first suffixed string, `span: 6sm 4lg`

```ts
const TIER_SPAN = /^(?:[1-9]|1[0-2])(?:sm|lg)$/;
// …otherwise identical to Candidate B, ~18 lines, refine + transform.
```

Mechanically identical cost to B — same lines, same `.refine()`, same
`.transform()`, same bad union error on `span: 6sn 4lg`. It differs only in
ordering, and on ordering it is the weaker choice:

- **No config-value precedent anywhere.** Nothing surveyed encodes a
  breakpoint-scoped config value as a value-first suffixed string.
- **Against the string precedent that does exist.** HTML `sizes` is
  condition-first with the bare fallback last.
- **Against three of the four class-string frameworks** (Bootstrap, Tailwind,
  Foundation). Its only precedent is Bulma's `is-half-desktop`, a class name.
- **Two abbreviation schemes to remember instead of one.** The tier names are
  already `small`/`large`; `sm`/`lg` introduces a second vocabulary for the same
  three things, and `sm` collides visually with Tailwind's/Bootstrap's `sm`,
  which is a *different* width.
- **It reads worse in the degenerate case.** `span: 4lg` looks like "4 large
  columns"; `span: large-4` looks like "at large, 4". The tier-first form scans
  as a scoped assignment, which is what it is.

### Candidate D — array, `span: [6, 4]`

```ts
export const span = z.union([
  z.number().int().min(1).max(12),
  z.tuple([spanValue, spanValue]),   // [small, large]
]);
```

Shortest schema of all (~4 lines), and it has the strongest library precedent
(Styled System / Chakra / Panda all offer it). **Rejected anyway**: an array's
meaning is positional, so the tier a slot refers to is nowhere in the file. It
also has the documented hole problem — Chakra's own example is
`["medium", undefined, undefined, "bold"]` — and adding a third authored tier
silently re-points every existing array in the file. In a **hand-edited** config
read by a human in an Obsidian vault, self-describing keys beat two characters
saved.

### Candidate E — Tailwind-style `span: small:6 large:4`

Same cost as B/C. Rejected on the YAML hazard noted above: it parses only
because there is no space after the colon, and `span: small: 6` — the shape an
author's fingers will produce — is a YAML syntax error, not a validation error.
A syntax error in a hand-edited YAML file inside a vault is the worst failure
mode on the list.

### Cost summary

| Candidate | Schema lines | transform/refine needed? | Error names the typo? | Degradation natural? | Config-value precedent |
|---|---|---|---|---|---|
| **A. mapping** | ~10 | **no** | **yes** (`Unrecognized key: "smal"`) | yes | Foundation, Chakra, Panda, Styled System, Storybook |
| B. `small-6 large-4` | ~18 | both | no | yes | none (class names + HTML `sizes` ordering only) |
| C. `6sm 4lg` | ~18 | both | no | yes | none |
| D. `[6, 4]` | ~4 | no | n/a (positional) | ambiguous | Styled System / Chakra / Panda arrays |
| E. `small:6 large:4` | ~18 | both | no | yes | none; plus a YAML footgun |

---

## Recommendation

**Adopt the nested mapping, keeping the bare scalar as the shorthand:**

```yaml
span: 4                 # both tiers — the common case, unchanged
span:
  small: 6              # optional; omitted → inherits mobile's 12
  large: 4              # optional; omitted → inherits small
```

Reasoning:

1. **It is what everything does when the medium allows it.** Foundation, whose
   `small-6 large-4` class syntax is candidate B's entire inspiration, uses a
   *map* the moment it moves the same idea into Sass config —
   `("small": 20px, "medium": 30px)` — with a documented scalar-or-map union.
   Chakra, Panda and Styled System independently reached the same shape. Nobody
   with a free choice picked a string.
2. **The scalar-or-map union is itself prior art**, not an invention:
   *"If the config is a single value, return it regardless of `$value`"*
   (`-zf-get-bp-val`).
3. **The degradation rule is already written down.** *"the value matching the
   next lowest breakpoint in the config map"* — which is the same mobile-first
   inheritance Bootstrap, Tailwind and Panda all state for their class strings.
   No new convention has to be explained to the author, and `span: {large: 4}`
   meaning "12 until large" is what every one of those frameworks would predict.
4. **It is the only candidate whose error names the mistake.** `.strict()` turns
   `smal:` into *"Unrecognized key"* at path `span`; a regex on a string can only
   say the whole string is wrong. For a file hand-edited in a vault with no
   schema-aware editor, that difference is the whole ergonomic argument.
5. **It costs the least code and no transform.** ~10 declarative lines against
   ~18 with a `.refine()` and a `.transform()` — and the string form's transform
   exists solely to reconstruct the object the mapping form already is.

### Rejected alternative

**`span: 6sm 4lg`** — rejected. It costs the same schema lines as the mapping,
produces a strictly worse error message (the `z.union([number, string.regex])`
failure mode: `span: 6sn 4lg` reports both branch failures and names neither
token), and its ordering has **no precedent as a config value anywhere** and runs
against the only string-form precedent that is a spec — HTML `sizes`, which is
media-condition-first with the bare fallback last. Its single supporting example
is Bulma's `is-half-desktop`, which is a CSS class name in a framework that is
the outlier among the five surveyed. It also introduces a second abbreviation
vocabulary (`sm`/`lg`) for tiers the file already names `small`/`large`, with
`sm` colliding visually with Bootstrap's and Tailwind's differently-sized `sm`.

**If a string form is chosen regardless of this recommendation, choose
`small-6 large-4`.** Tier-first is the majority ordering across Bootstrap,
Tailwind and Foundation, it matches the HTML `sizes` grammar, and it reads as
what it is: an assignment scoped to a tier.

---

## Things I could not verify from a primary source

- **No documented array-vs-object preference.** Chakra, Panda and Styled System
  all present both forms; none of the pages fetched states a recommendation or a
  reason. The "prefer the object" guidance is community convention, and Part 2
  argues against arrays on structural grounds instead.
- **Tailwind's "no theme value is ever breakpoint-keyed"** is an absence of
  evidence across the responsive-design and screens pages, not a quoted
  statement.
- **Tokens Studio** findings come from search-surfaced doc excerpts;
  `docs.tokens.studio/manage-themes/themes-overview` and
  `docs.tokens.studio/token-values/themes` both 404'd on direct fetch.
- **The YAML 1.2.2 Core Schema resolution table** could not be quoted: both
  `yaml.org/spec/1.2.2` and the spec source in `yaml/yaml-spec` truncate before
  Chapter 10 in the fetched rendering. The YAML claims in Part 3 are backed by a
  measured run against `js-yaml@4.1.1` (the parser this repo actually uses) and
  its `lib/type/int.js` resolver, which is arguably the more load-bearing source
  anyway.
- **Bulma's Sass variables** were checked only via the responsiveness page; the
  full variable list page was not fetched, so "no per-breakpoint Sass value map
  in Bulma" is scoped to that page.
- **Styled System's own site** (`styled-system.com`) no longer serves the docs —
  the domain now returns unrelated content. The quotes used come from the
  project's GitHub docs source.

---

## Sources (every URL fetched)

Framework docs and source:

- <https://getbootstrap.com/docs/5.3/layout/grid/>
- <https://getbootstrap.com/docs/5.3/layout/breakpoints/>
- <https://tailwindcss.com/docs/responsive-design>
- <https://v3.tailwindcss.com/docs/screens>
- <https://get.foundation/sites/docs/xy-grid.html>
- <https://get.foundation/sites/docs/media-queries.html>
- <https://raw.githubusercontent.com/foundation/foundation-sites/develop/scss/util/_breakpoint.scss>
- <https://raw.githubusercontent.com/foundation/foundation-sites/develop/scss/xy-grid/_gutters.scss>
- <https://bulma.io/documentation/columns/responsiveness/>
- <https://open-props.style/#media-queries>

Config ecosystems and specs:

- <https://docs.astro.build/en/guides/images/>
- <https://docs.astro.build/en/reference/configuration-reference/>
- <https://storybook.js.org/docs/essentials/viewport>
- <https://www.designtokens.org/TR/drafts/format/> (redirected from <https://tr.designtokens.org/format/>)
- <https://www.designtokens.org/tr/drafts/resolver/>
- <https://docs.tokens.studio/manage-themes/themes-overview> (404 on direct fetch; content via search excerpts)
- <https://docs.tokens.studio/manage-tokens/token-sets/> (via search excerpts)
- <https://decapcms.org/docs/widgets/>
- <https://chakra-ui.com/docs/styling/responsive-design>
- <https://panda-css.com/docs/concepts/responsive-design>
- <https://github.com/styled-system/styled-system/blob/master/docs/responsive-styles.md>
- <https://html.spec.whatwg.org/multipage/images.html#sizes-attributes>
- <https://yaml.org/spec/1.2.2/> (Chapter 10 truncated in fetched rendering)
- <https://raw.githubusercontent.com/yaml/yaml-spec/main/spec/1.2.2/spec.md> (same truncation)

Local repository facts (not web sources):

- `package.json` — `astro: ^6.1.4`; `node_modules/astro/package.json` — `"zod": "^4.3.6"`; `node_modules/zod` — 4.3.6
- `node_modules/js-yaml/package.json` — 4.1.1; `node_modules/js-yaml/lib/type/int.js`
- `scripts/generate-lens-registry.mjs`, `src/lib/frontpage.ts`, `src/content.config.ts`, `src/content/what/home.lens.yaml`

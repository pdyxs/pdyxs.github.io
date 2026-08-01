// svelte-check only. Not part of the main tsconfig project.
//
// svelte-check runs plain tsc, which can't resolve `.astro` imports — every
// `import Renderer from './Foo.astro'` in a .ts file reports "Cannot find
// module", drowning the real Svelte diagnostics. `astro check` already
// typechecks those imports properly (via the Astro language server), so this
// shim only has to stop svelte-check tripping over them.
//
// It lives outside src/ and is excluded from tsconfig.json on purpose: pulled
// into the main project, this `any` would shadow Astro's real generated
// component types and silently drop prop checking across every .astro import.
// The division is: astro check owns .astro, svelte-check owns .svelte.
declare module '*.astro' {
  const component: (props: Record<string, any>) => any;
  export default component;
}

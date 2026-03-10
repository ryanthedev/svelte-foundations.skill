# SvelteKit Best Practices Checklist

## SSR Safety

- [ ] No browser-only APIs (`window`, `document`, `localStorage`) outside `onMount` / `$effect`
- [ ] No mutable module-level state (leaks between requests in server context)
- [ ] Components render correctly with SSR disabled (for debugging)
- [ ] Dynamic imports for browser-only libraries (`import { browser } from '$app/environment'`)

## Load Functions

- [ ] `+page.ts` for universal load, `+page.server.ts` for server-only
- [ ] Return serializable data from load (no class instances, functions, or Dates)
- [ ] Use `depends()` for invalidation of custom dependencies
- [ ] Error handling with `error()` helper from `@sveltejs/kit`
- [ ] Avoid fetching from own API routes in server load (call the logic directly)

## Form Actions

- [ ] Default actions in `+page.server.ts`
- [ ] Named actions with `?/actionName`
- [ ] Progressive enhancement with `use:enhance`
- [ ] Validation on server side (never trust client)
- [ ] Return `fail()` for validation errors (not `throw error()`)

## Environment Variables

- [ ] Public vars use `PUBLIC_` prefix
- [ ] Private vars only in server files (`+page.server.ts`, `+server.ts`, `hooks.server.ts`)
- [ ] `$env/static/*` for build-time constants, `$env/dynamic/*` for runtime values
- [ ] No secrets in client bundles (verify with browser devtools)

## Routing

- [ ] `+layout.svelte` for shared UI
- [ ] `+error.svelte` for error pages (at least root level)
- [ ] Route parameters validated in load functions
- [ ] Redirect via `redirect()` helper, not `window.location`
- [ ] Group routes with `(groupName)` for shared layouts without URL segments

## Adapter and Deployment

- [ ] Correct adapter for target platform (`adapter-auto`, `adapter-node`, `adapter-static`, etc.)
- [ ] Prerender configured for static pages (`export const prerender = true`)
- [ ] CSP headers configured if needed (in `svelte.config.js` or hooks)
- [ ] Base path set if not serving from `/` (`paths.base` in config)
- [ ] Trailing slash behavior configured (`trailingSlash` in config)

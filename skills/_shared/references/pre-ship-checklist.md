# Pre-ship checklist — the things good Svelte code still slips on

You already write solid modern Svelte. This is the short list of items that *measurably* get
dropped or done subtly wrong even when the fundamentals are right — plus the verification
gate. Scan it before declaring a change done; don't pad it with what you'd already do.

## Reactivity traps (the non-obvious ones)

- **`$effect` is an escape hatch, not a tool.** It's for syncing with *external* systems
  (DOM nodes, analytics, non-reactive libs). If you're computing a value, use `$derived` /
  `$derived.by`. Never assign `$state` inside an `$effect` that reads it.
- **Don't destructure reactive state or props** if you need it to stay reactive —
  `let { done } = todos[0]` is a one-time read. Read through the property (`todos[0].done`)
  or pass a getter.
- **You can't `export let x = $state(...)` and reassign it across modules.** Export an object
  or a class instance with `$state` fields, or accessor functions — reactivity must survive
  the import. Wrapping a class in `$state(new X())` makes the *reference* reactive, not its
  fields; declare `$state` on each field instead.
- **Serializing reactive state:** pass `$state.snapshot(value)` to `structuredClone`, JSON,
  or any non-Svelte lib — a raw proxy will throw or misbehave.
- **Keyed `{#each}`** on a stable unique id (`{#each items as item (item.id)}`), never the
  array index. Unkeyed/index-keyed lists corrupt state on reorder.

## SSR safety (one of these is a security bug)

- **Never put mutable per-user state at module scope on the server.** Module variables are
  shared across all requests on a long-lived server — one user's data leaks into another's.
  Use the context API (instantiated per-request in a layout) or `event.locals`. A
  module-level `*.svelte.ts` rune singleton is safe only for client/global-UI state.
- **`load` functions must be pure** — return data, never write to a store or shared `$state`.
- **Guard browser globals** (`window`, `document`, `localStorage`): use `$app/environment`'s
  `browser`, or run in `onMount`/`$effect` (which don't run on the server). Don't render
  non-deterministic values (`Date.now()`, `Math.random()`) during SSR — it causes hydration
  mismatches; generate them client-side.
- **Returned load data must be serializable** (devalue): no class instances, functions,
  Maps/Sets that aren't supported, etc.

## SvelteKit slips

- **`use:enhance` on forms** — the most-dropped item. A `<form method="POST">` with named
  inputs works without JS; `use:enhance` upgrades it to no-reload submission. Ship both.
  Validate server-side and return `fail(4xx, { ...submittedValues, error })` so the user's
  input survives the round-trip.
- **`+page.server.ts` for anything touching secrets, DB, or `event.locals`;** `+page.ts`
  only for browser-safe data or non-serializable returns.
- **Don't fetch your own `/api/...` route inside `load`** — call the source (or a
  `$lib/server` function) directly. `+server.ts` endpoints are for *external* consumers.
  Use the injected `fetch` (not the global) so cookies forward and responses inline.
- **`throw redirect(303, ...)` / `error(404, ...)`** — they throw; don't `return` them or
  swallow them in a `try/catch`.
- **Private env only in server-only modules**; client vars need the `PUBLIC_` prefix.

## Verification gate

- `npx svelte-check` — type + a11y + unused-CSS check; treat warnings as failures.
- `eslint` (eslint-plugin-svelte, flat config) + `prettier --check` (prettier-plugin-svelte).
- **Accessibility beyond the compiler:** Svelte warns at compile time on single components
  (missing `alt`, label/role misuse) but can't see contrast, focus management, heading order
  across components, or keyboard-only flows — check those manually or with the `a11y-audit`
  command.
- **Testing (current approach):** extract logic and unit-test it with Vitest; test components
  with `vitest-browser-svelte` (real Chromium via Playwright) over jsdom, which mishandles
  runes. Files using runes need `.svelte` in the filename; use `flushSync()` / `$effect.root`
  for synchronous assertions.

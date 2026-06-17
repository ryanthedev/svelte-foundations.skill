# Modern Svelte & SvelteKit — features newer than your training data

These features are recent enough that your built-in knowledge is likely stale, wrong, or
missing. **Confirm the exact API against the bundled docs before writing code** — the file
paths are listed per feature. Everything here is the *decision layer*: when to reach for the
feature and the traps. The bundled docs are the source of truth for syntax.

Where the model already writes solid code unaided (runes, `$derived` over `$effect`,
SSR-safe shared state via context, server-vs-universal load), don't over-explain it — apply
it. This file is for the genuinely newer surface.

---

## Remote functions (SvelteKit 2.27+, experimental)

Type-safe client↔server functions exported from a `*.remote.ts` / `*.remote.js` file. They
are *called* anywhere but always *run* on the server, so they can touch `$lib/server`
(secrets, DB) directly. The client gets a generated `fetch` wrapper.

**Experimental — gate before recommending for production.** Opt in via `svelte.config.js`:
`kit.experimental.remoteFunctions: true` and (for `await` in components)
`compilerOptions.experimental.async: true`. Not semver-stable; flag this to the user.

Full API: `sveltekit-docs/20-core-concepts/60-remote-functions.md`.

| Flavor | Purpose | Reach for it when |
|--------|---------|-------------------|
| `query` | Read dynamic server data | Data belongs *in a component*, not the page entry point. Cached on page (`getX() === getX()`), `.refresh()` to re-fetch. `query.batch` solves N+1. |
| `form` | Mutations with progressive enhancement | The modern mutation path: schema validation + works **without JS** + end-to-end types. Spread onto `<form {...createPost}>`; fields via `.fields.x.as('text')`. |
| `command` | Imperative mutation, no `<form>` | Button clicks, drag-drop. **Requires JS** — prefer `form` where graceful degradation matters. Cannot run during render. |
| `prerender` | Build-time static data | Identical-for-all-users data, served from CDN. |

**Decision rule:** `load` functions still own *initial page data*; remote functions own
*component-scoped reads and all mutations*. They complement load/actions, not replace them.

**Single-flight mutations** — the architectural win. Instead of mutate-then-refetch (two
round-trips), refresh the affected query inside the handler (`await getPosts().refresh()`)
or set it directly (`getPost(id).set(result)`); from the client,
`submit().updates(getPosts())` with `.withOverride(...)` for optimistic UI.

**Security & validation (non-negotiable):**
- Validate every argument with a Standard Schema (Zod/Valibot) — the function is an exposed
  HTTP endpoint. Use `invalid()` for rules a schema can't express ("username taken").
- Read auth/cookies via `getRequestEvent()` inside the handler. **Never** trust the
  query's `url`/`params`/`route` for authorization — they reflect the calling page, not the
  endpoint, and queries don't re-run on navigation.
- Prefix sensitive fields with `_` (e.g. `_password`) so they aren't sent back on a failed
  validation reload.

---

## Attachments — `{@attach}` (Svelte 5.29+)

An attachment is a function `(element) => cleanup?` that runs on mount and **re-runs
automatically when reactive values it reads change**. It is the successor to `use:` actions
for new code. Full API: `svelte-docs/03-template-syntax/09-@attach.md`.

Prefer `{@attach}` over actions because it can be used inline, applied conditionally
(`{@attach condition && myAttachment}`), spread via `{...props}`, and **works on components**,
not just DOM elements. Parameterize with a thunk: `{@attach tooltip({ text })}` where
`tooltip = (opts) => (node) => { ... }`. Convert a third-party action with `fromAction`
(from `svelte/attachments`).

Actions (`use:`) are not deprecated — but reach for attachments first in new code.

---

## Async Svelte — `await` in components (experimental)

With `compilerOptions.experimental.async: true`, `await` is allowed in the top-level
`<script>`, inside `$derived(...)`, and directly in markup. Full API:
`svelte-docs/03-template-syntax/19-await-expressions.md`. (Required to use remote-function
queries with the `await getPosts()` form.)

- Wrap async UI in `<svelte:boundary>` with a `pending` snippet for the loading state; the
  nearest boundary also catches errors.
- State changes don't surface until dependent async work resolves (no inconsistent
  intermediate UI). Independent awaits run in parallel; sequential dependent `$derived`
  awaits trigger an `await_waterfall` warning — fix the waterfall.
- `$effect.pending()` for subsequent loads; `settled()` in tests/effects.
- The experimental flag is removed in Svelte 6 (it becomes default). Gate production use.

---

## Newest runes

| Rune | Use for | Path |
|------|---------|------|
| `$state.raw(x)` | Large or replace-don't-mutate data (API payloads, big lists) — skips proxy overhead. Reassign the whole value, don't mutate. | `svelte-docs/02-runes/02-$state.md` |
| `$state.snapshot(x)` | Hand a plain (non-proxy) object to a non-Svelte lib or `structuredClone`. | same |
| `$state.eager(x)` | Force immediate render instead of waiting on async coordination (e.g. `aria-current` on nav). Use sparingly. | same |
| `$inspect(x).with(fn)` / `$inspect.trace()` | Dev-only reactive debugging — prefer over `console.log` in an effect for tracing why something re-runs. | `svelte-docs/02-runes/07-$inspect.md` |

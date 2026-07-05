---
description: "Use when writing or reviewing Svelte 5 or SvelteKit code — components, runes and reactivity ($state/$derived/$effect), pages, data loading, forms and progressive enhancement, remote functions, or migrating from Svelte 4. Not for: React/Next, Vue/Nuxt, Svelte 3/4-only syntax, or non-Svelte backend, CSS, or build-tooling tasks."
---

# Skill: coding

Write and review Svelte 5 + SvelteKit code, grounded in the bundled official docs. You
already write solid modern Svelte unaided — this skill adds the two things you don't have:
**features newer than your training data**, and a short list of items that **measurably get
dropped** even in otherwise-good code.

---

## 1. Before writing — check what you might be stale on

Skim `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/modern-svelte.md`. If the task touches
any of these, your built-in knowledge is likely stale — **grep the linked bundled doc for the
specific API you need** (don't read the whole file; the remote-functions doc alone is ~1200
lines), and don't guess:

- **Remote functions** (`query`/`form`/`command`/`prerender` in `*.remote.ts`) — component-
  level data and mutations; experimental.
- **Attachments** (`{@attach}`) — the successor to `use:` actions in new code.
- **Async Svelte** (`await` in components, `<svelte:boundary>`) — experimental.
- **Newest runes** — `$state.raw`, `$state.eager`, `$inspect.trace`.

For anything else, search the bundled docs when you need the precise API:

1. `Grep` `${CLAUDE_PLUGIN_ROOT}/refs/svelte-docs/` and `${CLAUDE_PLUGIN_ROOT}/refs/sveltekit-docs/` for the API.
2. Use the `MANIFEST.md` under each `skills/*-docs/` dir to locate files by title.
3. Read the most relevant files (cite the filename). The bundled docs are the source of truth.

For Svelte 4 → 5 migration tasks, read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/migration.md`.

## 2. While writing

Write idiomatic Svelte 5 (`$state`, `$derived`, `$props`, `onclick`, snippets, `{@render}`).
Reach for `$effect` only to sync with external systems — compute values with `$derived`.

## 3. Before declaring done — scan the slip list

Check the work against `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/pre-ship-checklist.md`.
The highest-frequency real slips: missing `use:enhance` on forms, unkeyed `{#each}`,
destructuring reactive state, and module-level mutable state on the server (a cross-request
data leak). Then run the verification gate (`npx svelte-check`, lint).

## 4. Verify

- `/svelte-foundations:browser` to screenshot and verify rendering
- `/svelte-foundations:a11y-audit` for accessibility (catches what the compiler can't)
- `/svelte-foundations:diagnose` if errors appear

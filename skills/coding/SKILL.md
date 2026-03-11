---
name: coding
description: Load Svelte 5 coding context — patterns, checklists, and doc search. Use
  when implementing features, writing components, migrating from Svelte 4, or reviewing
  SvelteKit code. Triggers on "how do I", "implement", "build a", "create a component",
  "SvelteKit pattern", "best practice", "Svelte 5 way", "runes", "before I code",
  "code review", "coding".
allowed-tools: Read, Grep, Glob
---

# Skill: coding

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `coding v{version}` before proceeding.

Load Svelte 5 patterns, workflow checklist, and relevant documentation into context before writing or reviewing SvelteKit code.

---

## Step 1 — Load References

Read these files in order:

```
Read: ${CLAUDE_SKILL_DIR}/../_shared/references/svelte5-patterns.md
Read: ${CLAUDE_SKILL_DIR}/../_shared/references/workflow-checklist.md
Read: ${CLAUDE_SKILL_DIR}/../_shared/references/sveltekit-checklist.md
```

For migration tasks, also read:
```
Read: ${CLAUDE_SKILL_DIR}/../_shared/references/migration-guide.md
```

---

## Step 2 — Search Docs for Task APIs

1. Read `${CLAUDE_SKILL_DIR}/../svelte-docs/MANIFEST.md` and `${CLAUDE_SKILL_DIR}/../sveltekit-docs/MANIFEST.md`
2. Identify files relevant to the task by title/section
3. Grep `${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/` and `${CLAUDE_SKILL_DIR}/../../refs/sveltekit-docs/` for specific API names
4. Read the most relevant matched files (up to 5)

---

## Step 3 — Provide Context

Summarize for the coding session:

- **APIs needed** with current Svelte 5 signatures
- **Patterns** from svelte5-patterns.md that apply
- **Gotchas** from workflow-checklist.md Common Gotchas section
- **SSR concerns** if browser APIs are involved

---

## Svelte 5 Rules (non-negotiable)

| Use This | Not This |
|----------|----------|
| `let x = $state(0)` | `let x = 0` |
| `let doubled = $derived(x * 2)` | `$: doubled = x * 2` |
| `$effect(() => { ... })` | `$: { ... }` |
| `let { prop } = $props()` | `export let prop` |
| `onclick={handler}` | `on:click={handler}` |
| `{@render children()}` | `<slot />` |
| `{#snippet name()}...{/snippet}` | named slots |

---

## SvelteKit Conventions

- File naming: `+page.svelte`, `+page.ts`, `+page.server.ts`, `+layout.svelte`, `+error.svelte`
- Guard browser APIs with `onMount`, `$effect`, or `import { browser } from '$app/environment'`
- Use `error()` and `fail()` helpers for error handling
- Use `use:enhance` for progressive enhancement on forms
- Load function data must be serializable (no class instances, functions, Dates)

---

## Anti-Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "I know Svelte, skip the doc check" | APIs change between versions. A 2-minute check prevents a 20-minute debug session. |
| "This is simple, no research needed" | Simple tasks have the most migration gotchas (events, slots, reactivity). |
| "I'll check docs after" | Checking after means rewriting. Checking before means writing once. |
| "The pattern looks right from memory" | Memory is Svelte 4. Reality is Svelte 5. Verify. |

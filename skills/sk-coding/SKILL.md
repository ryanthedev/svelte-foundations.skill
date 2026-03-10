---
name: sk-coding
description: SvelteKit coding guidance and best practices. Use when implementing
  features, writing components, or reviewing SvelteKit code. Triggers on "how do I",
  "implement", "build a", "create a component", "coding", "SvelteKit pattern",
  "best practice", "Svelte 5 way", "runes", "before I code", "code review".
allowed-tools: Read, Grep, Glob
---

# Skill: sk-coding

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `sk-coding v{version}` before proceeding.

Coding guidance for SvelteKit development. Provides pre-coding research, live coding patterns, and post-coding review suggestions.

---

## Shared References

| Resource | Path |
|----------|------|
| Svelte 5 patterns | `${CLAUDE_SKILL_DIR}/../_shared/references/svelte5-patterns.md` |
| SvelteKit checklist | `${CLAUDE_SKILL_DIR}/../_shared/references/sveltekit-checklist.md` |
| Workflow checklist | `${CLAUDE_SKILL_DIR}/references/workflow-checklist.md` |
| Migration guide | `${CLAUDE_SKILL_DIR}/references/migration-guide.md` |
| Svelte docs | `${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/` |
| SvelteKit docs | `${CLAUDE_SKILL_DIR}/../../refs/sveltekit-docs/` |

---

## Workflow

### BEFORE Coding

1. Identify which SvelteKit APIs and features the task involves
2. Grep `refs/svelte-docs/` and `refs/sveltekit-docs/` for those APIs
3. Read matched doc files for current API signatures and patterns
4. Read `svelte5-patterns.md` to check for migration gotchas
5. Read `sveltekit-checklist.md` for relevant checklist items
6. Summarize: "Here are the APIs you'll need, their current signatures, and pitfalls to watch for"

### WHILE Coding

Provide guidance inline:

- Use runes (`$state`, `$derived`, `$effect`) not Svelte 4 reactive syntax
- Follow SvelteKit file conventions (`+page.svelte`, `+page.ts`, `+page.server.ts`)
- Check SSR safety for any browser API usage
- Match the project's existing patterns (grep for similar components)
- Reference `workflow-checklist.md` items as relevant

### AFTER Coding

Suggest follow-up actions:

- "Run sk-a11y-audit to check accessibility"
- "Use browser skill to screenshot and verify"
- "Run sk-diagnose if you see errors"

---

## Anti-Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "I know Svelte, skip the doc check" | APIs change between versions. A 2-minute check prevents a 20-minute debug session. |
| "This is simple, no research needed" | Simple tasks have the most migration gotchas (events, slots, reactivity). |
| "I'll check docs after" | Checking after means rewriting. Checking before means writing once. |
| "The pattern looks right from memory" | Memory is Svelte 4. Reality is Svelte 5. Verify. |

## Tips

- For Svelte 4 to 5 migration, read `migration-guide.md` first (side-by-side examples)
- The `workflow-checklist.md` has a "Common Gotchas" section for non-obvious issues
- Grep docs with specific API names, not general concepts
- When in doubt, check the migration guide -- most coding errors come from Svelte 4 habits

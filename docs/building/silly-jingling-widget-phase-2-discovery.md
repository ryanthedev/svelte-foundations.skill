# Discovery: Phase 2 - New Skills (v0.3.0)

## Files Found

### Existing (pattern sources)
- `skills/svelte-docs/SKILL.md` — doc skill pattern (YAML frontmatter, workflow, search strategy, tips, context efficiency)
- `skills/sveltekit-docs/SKILL.md` — identical pattern to svelte-docs
- `skills/browser/SKILL.md` — agent-dispatch skill pattern (routing table, workflows with Agent dispatch, anti-rationalization table, context efficiency table)
- `.claude/settings.local.json` — current permissions (3 skills + Bash/Read/Grep/Glob + shared scripts)
- `.claude-plugin/plugin.json` — currently at v0.2.0
- `CLAUDE.md` — documents 3 skills, no mention of _shared or new skills

### Phase 1 outputs (dependencies for Phase 2)
- `skills/_shared/scripts/vite.sh` — health check script (sk-diagnose Step 0 depends on this)
- `skills/_shared/references/svelte5-patterns.md` — migration patterns (sk-coding references this)
- `skills/_shared/references/sveltekit-checklist.md` — best practices checklist (sk-coding references this)

### To create (Phase 2 deliverables)
- `skills/sk-diagnose/SKILL.md` — does not exist
- `skills/sk-diagnose/references/error-patterns.md` — does not exist
- `skills/sk-coding/SKILL.md` — does not exist
- `skills/sk-coding/references/workflow-checklist.md` — does not exist
- `skills/sk-coding/references/migration-guide.md` — does not exist
- `skills/sk-a11y-audit/SKILL.md` — does not exist
- `skills/sk-a11y-audit/references/a11y-checklist.md` — does not exist

## Current State

Phase 1 completed successfully. All shared infrastructure is in place. The three new skill directories do not exist yet -- all files are creates, not modifies (except settings, plugin.json, and CLAUDE.md which are modifies).

### SKILL.md patterns observed

Two distinct patterns in existing skills:

1. **Doc-only skills** (svelte-docs, sveltekit-docs): YAML frontmatter with `allowed-tools: Read, Grep, Glob`. Workflow is read manifest, grep docs, read files, cite. No agent dispatch.

2. **Agent-dispatch skills** (browser): YAML frontmatter with `allowed-tools: Bash, Read, Agent`. Has routing table, multiple workflows with Agent dispatch templates, anti-rationalization table, context efficiency table.

The new skills map to these patterns:
- sk-diagnose: hybrid -- needs Bash (vite.sh), Read/Grep/Glob (docs/config), Agent (browser error capture, doc search). Closest to browser pattern but with grep/glob added.
- sk-coding: doc-only -- `allowed-tools: Read, Grep, Glob`. Follows doc skill pattern.
- sk-a11y-audit: agent-dispatch -- needs Bash (cdp-browser.js), Read/Grep, Agent (AX tree capture). Closest to browser pattern.

### Common SKILL.md structure
- YAML frontmatter: name, description (with trigger words), allowed-tools
- "On load" instruction to read plugin.json and display version
- Main heading and description
- Workflow section (numbered steps)
- Tips section
- Context efficiency table (for agent-dispatch skills)

## Gaps

1. **No gaps in dependencies.** Phase 1 shared infrastructure is complete. vite.sh, svelte5-patterns.md, and sveltekit-checklist.md all exist.

2. **Settings permissions pattern.** The plan specifies adding `Bash(*/skills/_shared/scripts/*)` to settings, but this already exists (added in Phase 1, line 11). Only the three `Skill()` entries need to be added.

3. **Directory creation.** Three new directories need to be created: `skills/sk-diagnose/references/`, `skills/sk-coding/references/`, `skills/sk-a11y-audit/references/`.

## Prerequisites

- [x] Phase 1 complete (shared infrastructure exists)
- [x] Existing SKILL.md patterns available for reference
- [x] Settings file accessible for modification
- [x] Plugin.json accessible for version bump
- [x] CLAUDE.md accessible for update
- [x] Plan specifies detailed content for each file

## Recommendation

**BUILD** -- All prerequisites met. All files are new creates (7 files) plus 3 modifies. No blockers. The `Bash(*/skills/_shared/scripts/*)` permission already exists from Phase 1, so only 3 new Skill() permissions need adding.

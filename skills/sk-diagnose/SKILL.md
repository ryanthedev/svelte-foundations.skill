---
name: sk-diagnose
description: Diagnose SvelteKit errors and issues. Use when troubleshooting errors,
  debugging build failures, or investigating unexpected behavior. Triggers on "diagnose",
  "error", "why is", "what's wrong", "debug", "fix this error", "stack trace",
  "build error", "vite error", "hydration error".
allowed-tools: Bash, Read, Grep, Glob, Agent
---

# Skill: sk-diagnose

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `sk-diagnose v{version}` before proceeding.

Diagnose SvelteKit and Svelte errors using pattern matching, documentation search, and optional browser error capture.

```
IMPORTANT: Never load screenshots in main context. Use subagent for browser error capture.
```

---

## Dependencies

| Resource | Path |
|----------|------|
| Vite health check | `${CLAUDE_SKILL_DIR}/../_shared/scripts/vite.sh` |
| Browser scripts | `${CLAUDE_SKILL_DIR}/../browser/scripts/` |
| Svelte docs | `${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/` |
| SvelteKit docs | `${CLAUDE_SKILL_DIR}/../../refs/sveltekit-docs/` |
| Error patterns | `${CLAUDE_SKILL_DIR}/references/error-patterns.md` |

---

## Workflow

### Step 0 -- Health Check

Run `vite.sh status` to check if the dev server is running.

```bash
bash ${CLAUDE_SKILL_DIR}/../_shared/scripts/vite.sh status
```

If not running, note it. Some errors are simply "server not running."

### Step 1 -- Obtain Error

**If the user provided error text:** use it directly. Parse key substrings from the error message.

**If the user says "check the browser" or "there's an error on screen":**

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "sk-diagnose: capture browser errors"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/cdp-browser.js screenshot
       Read the output file path to see the image.
    3. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/cdp-browser.js evaluate "JSON.stringify(window.__svelteErrors || [])"
    4. Return:
       - Any visible error messages on screen
       - Console errors from evaluate
       - Brief description of page state
    Return text only. Be concise.
```

### Step 2 -- Pattern Match

1. Read `${CLAUDE_SKILL_DIR}/references/error-patterns.md`
2. Compare error substrings against the **Match** fields in each pattern
3. If a match is found, extract the **Cause** and **Fix**

### Step 3 -- Doc Search

**If the pattern match includes a Doc reference:** read that doc file directly.

**If no pattern matched:**

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "sk-diagnose: search docs for error"
  prompt: |
    Search for documentation related to this error.

    ERROR: [insert error text]

    1. Grep ${CLAUDE_SKILL_DIR}/../../refs/svelte-docs/ for key error terms
    2. Grep ${CLAUDE_SKILL_DIR}/../../refs/sveltekit-docs/ for key error terms
    3. Read the most relevant matched files (up to 3)
    4. Return: which files matched and the relevant sections

    Return text only. Be concise.
```

### Step 4 -- Config Check

Use Glob to check which project config files exist, then read the relevant ones:

- `svelte.config.js`
- `vite.config.ts` (or `vite.config.js`)
- `package.json`
- `tsconfig.json`

Look for known misconfigurations related to the error pattern from Step 2.

### Step 5 -- Present Diagnosis

Format the diagnosis as:

```
**Error:** [the error message or symptom]
**Root Cause:** [what is causing it]
**Fix:** [specific steps or code changes]
**Doc Reference:** [path to relevant documentation]
**Verify:** [command to run to confirm the fix worked]
```

---

## Anti-Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "I know this error, skip pattern DB" | Pattern DB catches edge cases you'd miss. Read it. |
| "Config check is overkill" | Misconfiguration is the root cause for ~40% of SvelteKit errors. |
| "I'll skip the doc reference" | Doc reference lets the user learn, not just fix. Always include it. |

## Context Efficiency

| Item | Size | In Main Context? |
|------|------|------------------|
| Vite health output | ~80 chars | YES |
| Error pattern DB | ~5 KB | YES (read once per diagnosis) |
| Screenshots | 50-300 KB | NEVER -- subagent only |
| Doc search results | 2-10 KB | Subagent |
| Config files | 1-3 KB each | YES |
| Final diagnosis | 200-500 chars | YES |

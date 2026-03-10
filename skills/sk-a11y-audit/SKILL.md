---
name: sk-a11y-audit
description: Audit web page accessibility using browser accessibility tree and ARIA
  best practices. Use when checking accessibility, screen reader compatibility, or
  WCAG compliance. Triggers on "accessibility", "a11y", "audit", "accessible", "ARIA",
  "screen reader", "keyboard navigation", "accessibility check", "wcag".
allowed-tools: Bash, Read, Grep, Agent
---

# Skill: sk-a11y-audit

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `sk-a11y-audit v{version}` before proceeding.

Audit page accessibility by capturing the browser's accessibility tree and checking against a11y best practices checklist.

```
IMPORTANT: Never load AX trees or DOM trees in main context. Always use subagent.
```

---

## Workflow

### Step 1 -- Capture AX Tree

Dispatch a subagent to capture and analyze the accessibility tree.

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "sk-a11y-audit: capture and analyze AX tree"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/cdp-browser.js accessibility
       This outputs JSON (or a file path if output exceeds 60KB).
    3. If a file path was returned, Read the file.
    4. Read: ${CLAUDE_SKILL_DIR}/references/a11y-checklist.md
    5. Check the AX tree against the checklist:
       - Interactive elements have accessible names
       - Images have alt text
       - Form inputs have labels
       - Landmark structure present (navigation, main, etc.)
       - Heading hierarchy is logical (no skipped levels)
       - Focus order matches visual order
    6. Return structured findings with severity:
       - Critical: prevents access (missing labels, no keyboard support, missing alt)
       - Warning: degraded experience (missing landmarks, heading gaps)
       - Info: best practice suggestions (ARIA enhancements, focus management)
       For each finding include: element description, issue, suggested fix.
    Return text only. Be concise.
```

### Step 2 -- DOM ARIA Check (optional)

If Step 1 found issues, dispatch a subagent to inspect specific ARIA attributes in the DOM.

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "sk-a11y-audit: inspect DOM ARIA attributes"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/../browser/scripts/cdp-browser.js dom
       This outputs HTML (or a file path if output exceeds 60KB).
    3. If a file path was returned, Read the file.
    4. Check specific ARIA attributes against the AX tree findings:
       - aria-label without visible text
       - role misuse (e.g., role="button" on a div without keyboard handling)
       - aria-hidden on focusable elements
       - Missing aria-required on required fields
       - Missing aria-invalid on error states
    5. Return additional findings with severity.
    Return text only. Be concise.

    AX TREE FINDINGS: [insert findings from Step 1]
```

### Step 3 -- Doc Search

Grep `refs/svelte-docs/` and `refs/sveltekit-docs/` for accessibility patterns. Look for:

- Svelte compiler a11y warnings
- Svelte-specific accessibility guidance
- `bind:` directives relevant to form accessibility
- Accessible component patterns in the docs

### Step 4 -- Present Report

Format findings by severity:

**Critical** -- prevents access:
- Missing labels, no keyboard support, missing alt text

**Warning** -- degraded experience:
- Poor contrast hints, missing landmarks, heading gaps

**Info** -- best practice suggestions:
- ARIA enhancements, focus management improvements

Each finding includes: element selector, issue, fix suggestion, relevant checklist item.

---

## Anti-Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "The page looks fine visually" | Visual appearance tells nothing about screen reader experience. |
| "It's just an internal tool" | Internal tools have users with disabilities too. Legal requirements apply. |
| "I'll add a11y later" | Retrofitting a11y is 5-10x more expensive than building it in. |
| "The framework handles a11y" | Svelte adds compile-time warnings but cannot enforce runtime a11y. |

## Context Efficiency

| Item | Size | In Main Context? |
|------|------|------------------|
| AX tree JSON | 10-200 KB | NEVER -- subagent only |
| DOM HTML | 5-500 KB | NEVER -- subagent only |
| Subagent findings | ~500-1500 chars | YES |
| Doc grep results | ~1-5 KB | YES |
| Final report | ~500-2000 chars | YES |

---
description: "SvelteKit coding agent — researches docs, writes Svelte 5 code, verifies in browser."
argument-hint: "[feature description or task]"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "Agent", "Skill"]
---

# /svelte-foundations:coding

**Dispatch the coding agent to research docs, write code, and verify.**

---

## Step 1: Gather Context

Collect information before dispatching:

1. **Task description** from the user's argument
2. **Target file paths** — search the codebase if not provided:

```
Grep for component names, route paths, or features mentioned by the user.
Note the top 3-5 relevant files.
```

---

## Step 2: Dispatch Coding Agent

```
Agent(
    subagent_type: "svelte-foundations:coding-agent"
    description: "coding: [short task description]"
    prompt: |
        TASK: [task description]
        TARGET FILES: [file paths found in Step 1, or "Not specified — search codebase"]
        PROJECT CONTEXT: [any relevant context about the project]

        Research docs, write the implementation, and verify if possible.
        Return your findings in the coding agent output format.
)
```

---

## Step 3: Review Results

When the agent returns:

| Status | Action |
|--------|--------|
| **DONE** | Show implementation summary, files changed, and follow-up suggestions |
| **NEEDS_INPUT** | Show what the agent found, relay the question to the user, re-dispatch with answer |

---

## Step 4: Suggest Follow-ups

Based on what was built:

- `/svelte-foundations:a11y-audit` — check accessibility
- `/svelte-foundations:diagnose` — if errors appeared
- `/svelte-foundations:browser` — inspect specific elements

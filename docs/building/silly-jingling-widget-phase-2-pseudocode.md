# Pseudocode: Phase 2 - New Skills (v0.3.0)

## Files to Create/Modify

### Create (7 files)
1. `skills/sk-diagnose/SKILL.md`
2. `skills/sk-diagnose/references/error-patterns.md`
3. `skills/sk-coding/SKILL.md`
4. `skills/sk-coding/references/workflow-checklist.md`
5. `skills/sk-coding/references/migration-guide.md`
6. `skills/sk-a11y-audit/SKILL.md`
7. `skills/sk-a11y-audit/references/a11y-checklist.md`

### Modify (3 files)
8. `.claude/settings.local.json`
9. `.claude-plugin/plugin.json`
10. `CLAUDE.md`

---

## Design: Skill Architecture

### Approaches Considered

1. **Flat skills** -- Each SKILL.md is self-contained with all instructions inline. No cross-references between skills.
2. **Cross-referencing skills** -- Skills reference each other and shared resources via relative paths. sk-diagnose dispatches to browser and doc skills. sk-coding reads shared references. sk-a11y-audit dispatches to browser.
3. **Monolithic skill** -- Single "sk-dev" skill that handles diagnosis, coding, and a11y in one file.

### Comparison

| Criterion | Flat | Cross-referencing | Monolithic |
|-----------|------|-------------------|------------|
| Interface simplicity | Good (isolated) | Good (clear boundaries) | Poor (one huge skill) |
| Information hiding | Poor (duplicates shared refs) | Good (shared refs centralized) | Poor (everything exposed) |
| Caller ease of use | Good (trigger words route) | Good (trigger words route) | Poor (ambiguous triggers) |
| Matches plan | No (plan specifies cross-refs) | Yes | No |
| Matches existing patterns | Partial | Full | No |

### Choice: Cross-referencing (Approach 2)

The plan explicitly specifies cross-skill dependencies (sk-diagnose uses browser and doc skills via subagent, sk-coding references shared patterns, sk-a11y-audit uses browser AX tree). This matches how the browser skill already dispatches subagents. The shared references from Phase 1 exist specifically for cross-referencing.

### Depth Check
- Each skill has one SKILL.md (interface) hiding multiple reference files (implementation details)
- Callers interact via trigger words only -- internal workflow is hidden
- Common case: user says trigger word, skill executes workflow, returns diagnosis/guidance/report

---

## Pseudocode

### 1. skills/sk-diagnose/SKILL.md

```
YAML frontmatter:
  name: sk-diagnose
  description: Diagnose SvelteKit errors and issues. [trigger words: "diagnose",
    "error", "why is", "what's wrong", "debug", "fix this error", "stack trace",
    "build error", "vite error", "hydration error"]
  allowed-tools: Bash, Read, Grep, Glob, Agent

On load: Read plugin.json, display "sk-diagnose v{version}"

Main description: Diagnose SvelteKit and Svelte errors using pattern matching,
  documentation search, and optional browser error capture.

Dependencies section:
  List paths to vite.sh, browser scripts, svelte-docs refs, sveltekit-docs refs

Workflow (5 steps):
  Step 0 - Health Check:
    Run vite.sh status to check if dev server is running
    If not running, note it (some errors are "server not running")

  Step 1 - Obtain Error:
    If user provided error text, use it directly
    If user says "check the browser" or "there's an error on screen":
      Dispatch Agent (haiku) to browser to capture screenshot + console errors
      via cdp-browser.js screenshot + evaluate "JSON.stringify(window.__svelteErrors || [])"
    Parse error text to extract key substrings

  Step 2 - Pattern Match:
    Read error-patterns.md from references directory
    Search for matching pattern by comparing error substrings against Match fields
    If match found, extract Cause and Fix

  Step 3 - Doc Search:
    If pattern match found a doc reference, read that doc file
    If no pattern match, dispatch Agent (haiku) to grep svelte-docs and sveltekit-docs
      for error-related terms
    Extract relevant documentation

  Step 4 - Config Check:
    Read project config files (svelte.config.js, vite.config.ts, package.json, tsconfig.json)
    Look for known misconfigurations related to the error pattern
    Only read files that exist (use Glob to check first)

  Step 5 - Present Diagnosis:
    Format: Error / Root Cause / Fix / Doc Reference / Verify
    "Verify" is a command the user can run to confirm the fix worked

Context Efficiency table:
  vite health output: ~80 chars, main context
  error pattern DB: ~5KB, main context (read once per diagnosis)
  screenshots: 50-300KB, NEVER main context
  doc search results: 2-10KB, subagent
  config files: 1-3KB each, main context
  final diagnosis: 200-500 chars, main context

Anti-rationalization table:
  "I know this error, skip pattern DB" -> Pattern DB catches edge cases you'd miss
  "Config check is overkill" -> Misconfig is root cause for ~40% of SvelteKit errors
  "I'll skip the doc reference" -> Doc reference lets user learn, not just fix
```

### 2. skills/sk-diagnose/references/error-patterns.md

```
Title: SvelteKit Error Patterns

22 patterns organized by category, each with:
  ### N. Name
  **Match:** [list of substrings that identify this error]
  **Cause:** [1-2 sentences explaining root cause]
  **Fix:** [code block showing the fix]
  **Doc:** [optional path to relevant doc file in refs/]

Categories and patterns:

Compiler Errors (1-4):
  1. Wrong $types import
     Match: "Cannot find module './$types'", "Cannot find './$types'"
     Cause: $types is auto-generated by SvelteKit for +page/+layout files only.
       Importing from wrong location or non-route file.
     Fix: Ensure file is in routes/ directory and uses +page.ts or +layout.ts naming.
     Doc: refs/sveltekit-docs/98-reference/30-types.md

  2. createEventDispatcher in Svelte 5
     Match: "createEventDispatcher", "is not exported", "deprecated"
     Cause: Svelte 5 replaced createEventDispatcher with callback props.
     Fix: Replace with callback prop pattern: let { onevent } = $props()
     Doc: refs/svelte-docs/07-misc/07-v5-migration-guide.md

  3. Mixed Svelte 4/5 syntax
     Match: "Unexpected token", "export let", "$:", "on:"
     Cause: File mixes Svelte 4 reactive declarations/event syntax with Svelte 5 runes.
     Fix: Use either all Svelte 4 or all Svelte 5 syntax per component. See migration guide.
     Doc: refs/svelte-docs/07-misc/07-v5-migration-guide.md

  4. Prerender failure
     Match: "Error prerendering", "failed to prerender", "prerender"
     Cause: Page uses dynamic data or browser APIs that aren't available at build time.
     Fix: Add `export const prerender = false` or guard with `browser` check.
     Doc: refs/sveltekit-docs/20-core-concepts/40-page-options.md

SSR/Hydration (5-7):
  5. SSR state leak
     Match: "module-level", "shared state", "state leak", "global variable"
     Cause: Module-level mutable state in server context is shared across all requests.
     Fix: Move state inside component or load function. Use context API for shared state.
     Doc: refs/sveltekit-docs/20-core-concepts/50-state-management.md

  6. Hydration mismatch
     Match: "hydration", "mismatch", "did not match", "server/client"
     Cause: Server-rendered HTML differs from client-side render (often browser-only values).
     Fix: Guard browser-dependent rendering with `browser` check from $app/environment.
     Doc: refs/sveltekit-docs/30-advanced/25-errors.md

  7. Store subscription leak
     Match: "subscribe", "unsubscribe", "memory leak", "store"
     Cause: Manual store.subscribe() without cleanup, or store used outside component lifecycle.
     Fix: Use $store auto-subscription syntax, or call unsubscribe in onDestroy. In Svelte 5,
       migrate to $state modules.
     Doc: refs/svelte-docs/07-misc/07-v5-migration-guide.md

Vite/Build (8-12):
  8. HMR disconnected
     Match: "HMR", "hmr", "hot module", "disconnected", "[vite] server connection lost"
     Cause: Dev server crashed or file change caused unrecoverable error.
     Fix: Check terminal for the underlying error. Restart dev server. Common trigger:
       syntax errors in config files.

  9. Circular dependency
     Match: "Circular dependency", "circular", "Maximum call stack"
     Cause: Module A imports B which imports A. Common with shared types or stores.
     Fix: Extract shared types/interfaces to a separate module. Break the cycle.

  10. CSS preprocessor missing
      Match: "Cannot find module 'sass'", "postcss", "less", "preprocessor"
      Cause: CSS preprocessor referenced in svelte.config.js but not installed.
      Fix: Install the preprocessor: npm install -D sass (or postcss, less, etc.)

  11. Missing dependency optimization
      Match: "Outdated optimize dep", "new dependencies found", "optimized dependencies changed"
      Cause: Vite's dependency pre-bundling is stale after adding new packages.
      Fix: Restart dev server. If persistent, delete node_modules/.vite and restart.

  12. TypeScript config error
      Match: "tsconfig", "moduleResolution", "verbatimModuleSyntax"
      Cause: TypeScript config incompatible with SvelteKit's requirements.
      Fix: Use SvelteKit's recommended tsconfig settings. Ensure "extends": "./.svelte-kit/tsconfig.json".
      Doc: refs/sveltekit-docs/98-reference/40-configuration.md

Routing/Adapter (13-17):
  13. Redirect without base path
      Match: "redirect", "base path", "404", "paths.base"
      Cause: Redirect URL doesn't include configured base path.
      Fix: Import { base } from '$app/paths' and prepend to redirect URL.
      Doc: refs/sveltekit-docs/98-reference/20-$app-paths.md

  14. Missing +error.svelte
      Match: "error page", "+error", "unhandled error", "500"
      Cause: No error page defined; SvelteKit shows default error page.
      Fix: Create src/routes/+error.svelte with user-friendly error display.
      Doc: refs/sveltekit-docs/30-advanced/25-errors.md

  15. Missing +layout
      Match: "+layout", "layout", "shared layout"
      Cause: Expected shared layout not rendering. May be in wrong directory level.
      Fix: Ensure +layout.svelte is at correct route group level. Check (group) directories.
      Doc: refs/sveltekit-docs/20-core-concepts/10-routing.md

  16. Adapter config error
      Match: "adapter", "Could not resolve", "@sveltejs/adapter"
      Cause: Adapter not installed or misconfigured in svelte.config.js.
      Fix: Install adapter package and configure in svelte.config.js.
      Doc: refs/sveltekit-docs/25-build-and-deploy/

  17. Stale adapter types
      Match: "RequestHandler", "PageLoad", "type", ".svelte-kit"
      Cause: Generated types are stale. .svelte-kit directory needs regeneration.
      Fix: Run `npx svelte-kit sync` or restart dev server.

Environment/Security (18-19):
  18. Environment variable exposure
      Match: "PUBLIC_", "env", "VITE_", "private", "secret", "exposed"
      Cause: Private env var used in client code, or missing PUBLIC_ prefix for client var.
      Fix: Use PUBLIC_ prefix for client-side vars. Move private vars to server-only files.
      Doc: refs/sveltekit-docs/98-reference/25-$env-static-private.md

  19. CORS/proxy error
      Match: "CORS", "cors", "Access-Control", "proxy", "blocked by CORS"
      Cause: Browser blocking cross-origin request. Dev server proxy not configured.
      Fix: Configure Vite proxy in vite.config.ts, or use server-side fetching in +page.server.ts.

Runtime (20-22):
  20. Effect/derived infinite loop
      Match: "infinite", "loop", "maximum update depth", "$effect", "$derived", "ERR_SVELTE_TOO_MANY_UPDATES"
      Cause: $effect writes to state that triggers itself. Or circular $derived chain.
      Fix: Break the cycle. Use $effect with explicit dependencies. Use untrack() if needed.
      Doc: refs/svelte-docs/02-runes/04-$effect.md

  21. Hook execution order
      Match: "hooks", "handle", "sequence", "hooks.server"
      Cause: Hooks running in wrong order or not composing correctly.
      Fix: Use sequence() helper to compose multiple handle functions.
      Doc: refs/sveltekit-docs/30-advanced/20-hooks.md

  22. Component not a constructor
      Match: "not a constructor", "mount", "new Component", "is not a function"
      Cause: Svelte 5 removed class-based component API. Cannot use `new Component()`.
      Fix: Use mount(Component, { target }) from 'svelte'. See migration guide.
      Doc: refs/svelte-docs/07-misc/07-v5-migration-guide.md
```

### 3. skills/sk-coding/SKILL.md

```
YAML frontmatter:
  name: sk-coding
  description: SvelteKit coding guidance and best practices. [trigger words:
    "how do I", "implement", "build a", "create a component", "coding",
    "SvelteKit pattern", "best practice", "Svelte 5 way", "runes",
    "before I code", "code review"]
  allowed-tools: Read, Grep, Glob

On load: Read plugin.json, display "sk-coding v{version}"

Main description: Coding guidance for SvelteKit development. Provides pre-coding
  research, live coding patterns, and post-coding review suggestions.

Shared references paths:
  svelte5-patterns: _shared/references/svelte5-patterns.md
  sveltekit-checklist: _shared/references/sveltekit-checklist.md
  workflow-checklist: references/workflow-checklist.md
  migration-guide: references/migration-guide.md
  svelte-docs: refs/svelte-docs/
  sveltekit-docs: refs/sveltekit-docs/

Workflow phases:

  BEFORE coding:
    1. Identify which APIs/features the task involves
    2. Grep svelte-docs and sveltekit-docs for those APIs
    3. Read matched doc files for current API signatures and patterns
    4. Read svelte5-patterns.md to check for migration gotchas
    5. Read sveltekit-checklist.md for relevant checklist items
    6. Summarize: "Here are the APIs you'll need, their current signatures,
       and pitfalls to watch for"

  WHILE coding:
    Provide guidance inline:
    - Use runes ($state, $derived, $effect) not Svelte 4 reactive syntax
    - Follow SvelteKit file conventions (+page.svelte, +page.ts, +page.server.ts)
    - Check SSR safety for any browser API usage
    - Match project's existing patterns (grep for similar components)
    - Reference workflow-checklist.md items as relevant

  AFTER coding:
    Suggest follow-up actions:
    - "Run sk-a11y-audit to check accessibility"
    - "Use browser skill to screenshot and verify"
    - "Run sk-diagnose if you see errors"

Anti-rationalization table:
  "I know Svelte, skip the doc check" -> APIs change between versions; 2 min check prevents 20 min debug
  "This is simple, no research needed" -> Simple tasks have the most migration gotchas (events, slots, reactivity)
  "I'll check docs after" -> Checking after means rewriting; checking before means writing once
  "The pattern looks right from memory" -> Memory is Svelte 4; reality is Svelte 5. Verify.

Tips:
  - For Svelte 4 -> 5 migration, read migration-guide.md first (side-by-side examples)
  - The workflow-checklist.md has "Common Gotchas" section for non-obvious issues
  - Grep docs with specific API names, not general concepts
  - When in doubt, check the migration guide -- most coding errors come from Svelte 4 habits
```

### 4. skills/sk-coding/references/workflow-checklist.md

```
Title: SvelteKit Coding Workflow Checklist

## Before You Code

- [ ] Identified which SvelteKit APIs the task uses (load, actions, hooks, etc.)
- [ ] Searched docs for current API signatures
- [ ] Checked svelte5-patterns.md for migration gotchas
- [ ] Verified file naming convention (+page.svelte, +page.ts, +page.server.ts, +layout, +error)
- [ ] Checked if similar component/pattern exists in project (grep)
- [ ] Identified SSR-sensitive code paths (browser APIs, window, document)
- [ ] Read relevant section of sveltekit-checklist.md

## While Coding

- [ ] Using $state() for reactive declarations (not `let x = 0`)
- [ ] Using $derived() for computed values (not `$:`)
- [ ] Using $effect() for side effects (not `$: { }`)
- [ ] Using $props() for component props (not `export let`)
- [ ] Using onclick={} for events (not on:click={})
- [ ] Using {@render children()} for content slots (not <slot />)
- [ ] Browser APIs guarded with onMount or $effect or `browser` check
- [ ] Form actions using use:enhance for progressive enhancement
- [ ] Error handling with SvelteKit error() and fail() helpers

## After Coding

- [ ] Component renders without JS disabled (SSR check)
- [ ] No TypeScript errors (npx svelte-check)
- [ ] Accessibility: labels on inputs, alt on images, semantic HTML
- [ ] Error states handled (loading, error, empty)
- [ ] Consider running sk-a11y-audit for accessibility review

## Common Gotchas

1. **$state proxy behavior**: $state(array) returns a proxy. Use $state.snapshot()
   to get a plain value for serialization or comparison.

2. **$effect timing**: $effect runs after DOM update. Use $effect.pre() for
   before-update logic. Do not set $state inside $effect that reads it (infinite loop).

3. **Form actions return**: Use fail(400, { errors }) for validation errors.
   throw error(500) is for unexpected errors. Return data for success.

4. **SSR boundaries**: Code in +page.svelte runs on server AND client. Code in
   +page.server.ts runs server only. Code in onMount/effect runs client only.

5. **$props destructuring**: let { prop } = $props() must be top-level in script.
   Cannot conditionally destructure or re-assign the props object.

6. **Snippet vs component**: Use {#snippet} for template reuse within a file.
   Use a .svelte component for reuse across files.

7. **$derived vs $derived.by**: Use $derived(expr) for simple expressions.
   Use $derived.by(() => { complex logic }) for multi-line computations.

8. **Load function data**: Data from load() must be serializable. No class instances,
   functions, Dates, Maps, or Sets. Use POJOs.

9. **Store migration**: $store auto-subscribe syntax still works, but prefer
   $state modules (.svelte.js) for new code. Don't mix both in same file.

10. **Event modifier removal**: on:click|preventDefault is gone. Wrap handler:
    onclick={(e) => { e.preventDefault(); handle(e) }}
```

### 5. skills/sk-coding/references/migration-guide.md

```
Title: Svelte 4 to Svelte 5 Migration Guide

Side-by-side code examples for each migration area.
Each section has: heading, Svelte 4 code block, Svelte 5 code block, brief notes.

Sections:

## Reactive Declarations to Runes

  Svelte 4:
    <script>
      let count = 0;
      $: doubled = count * 2;
      $: { console.log('count changed:', count) }
    </script>

  Svelte 5:
    <script>
      let count = $state(0);
      let doubled = $derived(count * 2);
      $effect(() => { console.log('count changed:', count) });
    </script>

  Notes: $state() wraps initial value. $derived() replaces $: for computed values.
    $effect() replaces $: {} blocks for side effects.

## Props

  Svelte 4:
    <script>
      export let name;
      export let count = 0;
    </script>

  Svelte 5:
    <script>
      let { name, count = 0 } = $props();
    </script>

  Notes: All props via single $props() call. Defaults via JS destructuring defaults.
    Rest props: let { name, ...rest } = $props().

## Events

  Svelte 4:
    <script>
      import { createEventDispatcher } from 'svelte';
      const dispatch = createEventDispatcher();
    </script>
    <button on:click={() => dispatch('submit', data)}>Submit</button>

  Svelte 5:
    <script>
      let { onsubmit } = $props();
    </script>
    <button onclick={() => onsubmit(data)}>Submit</button>

  Notes: Events are callback props. on:click becomes onclick.
    Event forwarding: pass callback through with {...props} or explicit prop.

## Slots to Snippets

  Svelte 4:
    <!-- Parent -->
    <Card>
      <h2 slot="header">Title</h2>
      <p>Content</p>
    </Card>

    <!-- Card.svelte -->
    <div class="card">
      <slot name="header" />
      <slot />
    </div>

  Svelte 5:
    <!-- Parent -->
    <Card>
      {#snippet header()}
        <h2>Title</h2>
      {/snippet}
      <p>Content</p>
    </Card>

    <!-- Card.svelte -->
    <script>
      let { header, children } = $props();
    </script>
    <div class="card">
      {@render header?.()}
      {@render children?.()}
    </div>

  Notes: Default slot content becomes children prop. Named slots become snippet props.
    Use optional chaining (?.) for optional snippets.

## Lifecycle

  Svelte 4:
    <script>
      import { afterUpdate, beforeUpdate } from 'svelte';
      afterUpdate(() => { scrollToBottom() });
      beforeUpdate(() => { saveScrollPos() });
    </script>

  Svelte 5:
    <script>
      $effect(() => { scrollToBottom() });
      $effect.pre(() => { saveScrollPos() });
    </script>

  Notes: onMount and onDestroy unchanged. afterUpdate -> $effect.
    beforeUpdate -> $effect.pre. tick() unchanged.

## Stores to $state Modules

  Svelte 4:
    // stores.js
    import { writable, derived } from 'svelte/store';
    export const count = writable(0);
    export const doubled = derived(count, $c => $c * 2);

    // Component.svelte
    <script>
      import { count, doubled } from './stores.js';
    </script>
    <p>{$count} x 2 = {$doubled}</p>

  Svelte 5:
    // state.svelte.js
    export let count = $state(0);
    export let doubled = $derived(count * 2);

    // Component.svelte
    <script>
      import { count, doubled } from './state.svelte.js';
    </script>
    <p>{count} x 2 = {doubled}</p>

  Notes: File extension must be .svelte.js (or .svelte.ts). No $ prefix in template.
    Import directly, no auto-subscribe needed.

## $app/stores to $app/state

  Svelte 4:
    <script>
      import { page } from '$app/stores';
    </script>
    <p>{$page.url.pathname}</p>

  Svelte 5:
    <script>
      import { page } from '$app/state';
    </script>
    <p>{page.url.pathname}</p>

  Notes: No $ prefix. page is reactive object, not a store. Also: navigating, updated.

## Class API to mount()

  Svelte 4:
    import App from './App.svelte';
    const app = new App({
      target: document.getElementById('app'),
      props: { name: 'world' }
    });
    app.$destroy();

  Svelte 5:
    import { mount, unmount } from 'svelte';
    import App from './App.svelte';
    const app = mount(App, {
      target: document.getElementById('app'),
      props: { name: 'world' }
    });
    unmount(app);

  Notes: mount() and unmount() imported from 'svelte'. No more $set, $on, $destroy methods.
```

### 6. skills/sk-a11y-audit/SKILL.md

```
YAML frontmatter:
  name: sk-a11y-audit
  description: Audit web page accessibility using browser accessibility tree
    and ARIA best practices. [trigger words: "accessibility", "a11y", "audit",
    "accessible", "ARIA", "screen reader", "keyboard navigation",
    "accessibility check", "wcag"]
  allowed-tools: Bash, Read, Grep, Agent

On load: Read plugin.json, display "sk-a11y-audit v{version}"

Main description: Audit page accessibility by capturing the browser's
  accessibility tree and checking against a11y best practices checklist.

IMPORTANT context rule (same as browser skill):
  Never load AX trees or DOM trees in main context. Always use subagent.

Workflow (4 steps):

  Step 1 - Capture AX Tree:
    Dispatch Agent (haiku) to:
      1. Run browser.sh ensure
      2. Run cdp-browser.js accessibility (outputs AX tree JSON or file path)
      3. If file path, read it
      4. Check AX tree against a11y-checklist.md:
         - Interactive elements have accessible names
         - Images have alt text
         - Form inputs have labels
         - Landmark structure present (navigation, main, etc.)
         - Heading hierarchy is logical (no skipped levels)
         - Focus order matches visual order
      5. Return structured findings with severity

  Step 2 - DOM ARIA Check (optional):
    If Step 1 found issues, dispatch Agent (haiku) to:
      1. Run cdp-browser.js dom
      2. Check specific ARIA attributes against AX tree findings
      3. Look for: aria-label without visible text, role misuse,
         aria-hidden on focusable elements
      4. Return additional findings

  Step 3 - Doc Search:
    Grep svelte-docs and sveltekit-docs for accessibility patterns
    Look for Svelte-specific a11y guidance (compiler warnings, bind directives)

  Step 4 - Present Report:
    Format findings by severity:
      Critical: prevents access (missing labels, no keyboard support, missing alt)
      Warning: degraded experience (poor contrast hints, missing landmarks, heading gaps)
      Info: best practice suggestions (ARIA enhancements, focus management)
    Include: element selector, issue, fix suggestion, relevant checklist item

Context Efficiency table:
  AX tree JSON: 10-200KB, NEVER main context (subagent)
  DOM HTML: 5-500KB, NEVER main context (subagent)
  Subagent findings: ~500-1500 chars, YES main context
  Doc grep results: ~1-5KB, main context
  Final report: ~500-2000 chars, main context

Anti-rationalization table:
  "The page looks fine visually" -> Visual appearance tells nothing about screen reader experience
  "It's just an internal tool" -> Internal tools have users with disabilities too. Legal requirements apply.
  "I'll add a11y later" -> Retrofitting a11y is 5-10x more expensive than building it in
  "The framework handles a11y" -> Svelte adds compile-time warnings but cannot enforce runtime a11y
```

### 7. skills/sk-a11y-audit/references/a11y-checklist.md

```
Title: Accessibility Audit Checklist

## Required Attributes by Element Type

### Button
- Must have accessible name (text content, aria-label, or aria-labelledby)
- If icon-only, must have aria-label
- Must be focusable (not tabindex="-1" unless intentionally removed from tab order)

### Link
- Must have accessible name (text content or aria-label)
- Must have valid href (not "#" or "javascript:void(0)")
- Must be distinguishable from surrounding text (not just color)

### Input
- Must have associated label (for/id match, aria-label, or aria-labelledby)
- Required fields must have aria-required="true" or required attribute
- Error states must have aria-invalid="true" and aria-describedby pointing to error message

### Image
- Must have alt attribute
- Decorative images: alt="" (empty, not missing)
- Informative images: alt describes the content/function
- Complex images: aria-describedby pointing to longer description

### Form
- Must have accessible name (aria-label, aria-labelledby, or <legend> in <fieldset>)
- Related fields should be grouped in <fieldset> with <legend>
- Submit button must have clear label

### Navigation
- Must have aria-label if multiple nav elements on page
- Current page link should have aria-current="page"

### Heading
- Must follow logical hierarchy (no skipping h1 to h3)
- Page should have exactly one h1
- Headings should describe the section content

## Minimum Touch Target Sizes

| Context | Minimum Size | Source |
|---------|-------------|--------|
| Mobile | 48x48 CSS pixels | WCAG 2.5.8 (AA) |
| Desktop | 44x44 CSS pixels | WCAG 2.5.5 (AAA) / recommended |
| Inline text links | Exempt | WCAG exception for inline links |

## Valid ARIA Role Values

### Landmark roles
main, navigation, banner, contentinfo, complementary, search, form, region

### Widget roles
button, checkbox, dialog, link, menuitem, option, radio, slider, switch, tab,
tabpanel, textbox, combobox, listbox, menu, menubar, tree, treeitem, grid,
gridcell, row, rowgroup, columnheader, rowheader

### Document structure roles
article, cell, definition, directory, document, feed, figure, group, heading,
img, list, listitem, math, note, presentation, separator, table, term, toolbar

## Common Anti-Patterns

### BAD: Click handler on div
  <div on:click={handler}>Click me</div>

### GOOD: Use semantic button
  <button onclick={handler}>Click me</button>

### BAD: Placeholder as label
  <input placeholder="Email" />

### GOOD: Visible label
  <label for="email">Email</label>
  <input id="email" type="email" />

### BAD: aria-hidden on focusable element
  <button aria-hidden="true">Hidden but focusable</button>

### GOOD: Remove from focus order too
  <button aria-hidden="true" tabindex="-1">Properly hidden</button>

### Svelte-specific: Component ARIA forwarding
  BAD: Component swallows ARIA attributes
    <CustomButton>Submit</CustomButton>
    (CustomButton does not spread rest props to native button)

  GOOD: Spread rest props to forward ARIA
    <script>
      let { children, ...rest } = $props();
    </script>
    <button {...rest}>{@render children()}</button>

### Svelte-specific: Focus management with use: action
  Action for focus trapping in modals:
    <div use:trapFocus>
      <!-- dialog content -->
    </div>

### Svelte-specific: Form label binding
  Use bind:this and for/id for dynamic label association:
    <script>
      let input = $state();
      let id = $props().id ?? 'field-' + Math.random().toString(36).slice(2);
    </script>
    <label for={id}>{label}</label>
    <input {id} bind:this={input} />
```

### 8. .claude/settings.local.json (MODIFY)

```
Add three entries to the permissions.allow array:
  "Skill(svelte-foundations:sk-diagnose)"
  "Skill(svelte-foundations:sk-coding)"
  "Skill(svelte-foundations:sk-a11y-audit)"

Note: "Bash(*/skills/_shared/scripts/*)" already exists from Phase 1.
No other permission changes needed.
```

### 9. .claude-plugin/plugin.json (MODIFY)

```
Change version from "0.2.0" to "0.3.0"
No other changes.
```

### 10. CLAUDE.md (MODIFY)

```
Update "What This Is" section:
  Add after the browser bullet:
  - **sk-diagnose** — diagnoses SvelteKit/Svelte errors using pattern matching and docs
  - **sk-coding** — provides coding guidance, migration patterns, and best practices
  - **sk-a11y-audit** — audits page accessibility via browser AX tree inspection

Update "Repository Structure" section:
  Add to skills/ tree:
    _shared/scripts/vite.sh        — Vite dev server health check and environment detection
    _shared/references/             — Shared reference files (svelte5-patterns.md, sveltekit-checklist.md)
    sk-diagnose/SKILL.md           — Error diagnosis skill
    sk-diagnose/references/        — Error pattern database
    sk-coding/SKILL.md             — Coding guidance skill
    sk-coding/references/          — Workflow checklist, migration guide
    sk-a11y-audit/SKILL.md         — Accessibility audit skill
    sk-a11y-audit/references/      — A11y checklist

Update "How the Skills Work" section:
  Add after existing paragraph:
  "New skills follow two additional patterns: sk-diagnose combines Bash (health check),
   Grep/Read (docs + config), and Agent (browser error capture) for error diagnosis.
   sk-coding uses Read/Grep/Glob to search docs and shared references before/during/after
   coding. sk-a11y-audit dispatches Agent subagents to capture accessibility trees and
   check against an a11y checklist."

No changes to Key Conventions or Updating Docs sections.
```

---

## Design Notes

1. **sk-diagnose as hybrid pattern.** This is the only skill that uses all five tool types (Bash, Read, Grep, Glob, Agent). The plan explicitly specifies this. The workflow is linear (health check, obtain error, pattern match, doc search, config check, present), which keeps it simple despite the tool breadth.

2. **Error patterns as substring match, not regex.** The plan explicitly states "substring matches, not regex" (Notes section). Each pattern's Match field is a list of substrings. The SKILL.md workflow says "compare error substrings against Match fields." This keeps pattern matching simple and fast.

3. **sk-coding has no Agent dispatch.** Unlike sk-diagnose and sk-a11y-audit, sk-coding uses only Read/Grep/Glob. It is a guidance skill, not an inspection skill. It reads docs and shared references, then provides inline coding advice. This matches the doc-only skill pattern.

4. **sk-a11y-audit always uses subagent for AX tree.** Following the browser skill's established pattern, AX trees never enter main context. The SKILL.md has the same "IMPORTANT: Never load... in main context" rule.

5. **Migration guide vs svelte5-patterns.md.** The migration guide (sk-coding/references/) has full code examples. The svelte5-patterns.md (_shared/references/) has quick-reference tables. They cover the same topic at different detail levels. sk-coding references both: patterns.md for quick lookup, migration-guide.md for detailed examples.

6. **Settings: no duplicate permission.** Discovery found that `Bash(*/skills/_shared/scripts/*)` already exists. Only 3 new Skill() entries needed.

## PRE-GATE Status
- [x] Discovery complete
- [x] Pseudocode complete
- [x] Design reviewed (cross-referencing approach chosen over flat or monolithic)
- [x] Ready for implementation

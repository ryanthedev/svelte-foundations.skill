# Pseudocode: Phase 1 - Browser Enhancements + Shared Infrastructure (v0.2.0)

## Files to Create/Modify

- MODIFY: `skills/browser/scripts/cdp-browser.js` (~550 -> ~900 lines)
- MODIFY: `skills/browser/SKILL.md`
- CREATE: `skills/_shared/scripts/vite.sh`
- CREATE: `skills/_shared/references/svelte5-patterns.md`
- CREATE: `skills/_shared/references/sveltekit-checklist.md`
- CREATE: `skills/browser/references/interaction-patterns.md`
- MODIFY: `.claude/settings.local.json`
- MODIFY: `.claude-plugin/plugin.json`

---

## Design: cdp-browser.js Helpers

### Approaches Considered

1. **Inline expansion** — Add shadow DOM, form, wait logic directly inside each mode function. No new helpers.
2. **Extract shared helpers** — Create `dispatchClick(client, x, y)` and `resolveElement(client, selector, options)` as standalone functions that all modes call. Mode functions stay thin orchestrators.
3. **Class-based refactor** — Wrap everything in a CDPBrowser class with methods for each primitive operation.

### Comparison

| Criterion | A (Inline) | B (Helpers) | C (Class) |
|-----------|-----------|-------------|-----------|
| Interface simplicity | N/A (no interface) | Two focused helpers | One class with many methods |
| Information hiding | Low — shadow DOM logic repeated | High — shadow piercing hidden behind resolveElement | High but over-engineered |
| Caller ease of use | Each mode reimplements | Modes call helpers | Modes call this.methods |
| Fit with existing pattern | Matches current style | Extends current style naturally | Rewrites current style |
| Change scope | Smallest diff | Moderate diff | Largest diff |

### Choice: B (Extract shared helpers)

Rationale: The existing codebase uses standalone functions (not classes). Two focused helpers (resolveElement, dispatchClick) hide the complexity of shadow DOM piercing and mouse event dispatch behind simple interfaces. Mode functions become orchestrators. This is the minimum change that avoids duplication while keeping the file's architectural style consistent.

### Depth Check
- New interface surface: 2 functions (resolveElement, dispatchClick)
- Hidden details: shadow DOM traversal JS injection, coordinate extraction from box model vs Runtime evaluation, 3-event mouse dispatch sequence
- Common case complexity: simple — callers pass selector and get back what they need

---

## Pseudocode

### cdp-browser.js — Constants (insert after `const fs = require("fs")`)

```
QUERY_SELECTOR_DEEP_JS = a JavaScript function string that:
  accepts (rootNode, selector) as parameters
  creates a recursive search function that:
    tries rootNode.querySelector(selector)
    if found, return it
    for each element in rootNode.querySelectorAll('*'):
      if element has a shadowRoot:
        recursively search element.shadowRoot
        if found, return it
    return null
  calls the recursive search starting at document
  returns the found element or null
```

### cdp-browser.js — `dispatchClick(client, x, y)` helper

```
dispatchClick(client, x, y):
  send Input.dispatchMouseEvent type=mouseMoved at (x, y)
  send Input.dispatchMouseEvent type=mousePressed at (x, y) button=left clickCount=1
  send Input.dispatchMouseEvent type=mouseReleased at (x, y) button=left clickCount=1
```

Purpose: Single place for the 3-event mouse click sequence. Extracted from modeClick lines 273-291.

### cdp-browser.js — `resolveElement(client, selector, options)` helper

```
resolveElement(client, selector, { pierce = false }):
  -- Try standard DOM query first (fast path)
  get document root via DOM.getDocument depth=0
  query = DOM.querySelector on root with selector

  if query found a node (nodeId != 0):
    get box model for the node
    calculate center coordinates from content quad
    return { nodeId, x, y, method: "dom" }

  -- If not found and pierce is true, try shadow DOM
  if pierce:
    evaluate QUERY_SELECTOR_DEEP_JS with the selector in page context
    -- This returns a JS object reference, not a nodeId

    if result is null or exception:
      return null (element not found anywhere)

    -- Get coordinates via JS since we have an objectId, not a nodeId
    call Runtime.callFunctionOn the returned objectId with a function that:
      gets element's bounding rect
      returns { x: rect.x + rect.width/2, y: rect.y + rect.height/2 }

    return { objectId, x, y, method: "shadow" }

  -- Not found, no pierce
  return null
```

Design note: Returns a result object with coordinates regardless of method. Callers use x,y for clicking and don't need to know whether the element was found via DOM or shadow piercing. The `method` field is informational (for logging).

### cdp-browser.js — Refactor `modeClick`

```
modeClick(client, args):
  if args.selector:
    result = resolveElement(client, args.selector, { pierce: args.pierce })
    if result is null:
      write error "No element matches: {selector}" to stderr
      exit 1
    x = result.x
    y = result.y
  else if args.x and args.y provided:
    x = args.x
    y = args.y
  else:
    write error "click requires --selector or --x and --y"
    exit 1

  dispatchClick(client, x, y)

  write "Clicked at (x, y) [selector info]" to stdout
  close client, exit 0
```

### cdp-browser.js — `modeForm(client, args)` (new mode)

```
modeForm(client, args):
  validate args.action exists (fill|select|submit|read)
  validate args.selector exists

  switch args.action:

    case "fill":
      result = resolveElement(client, args.selector, { pierce: true })
      if null: error "No element matches" and exit 1

      -- Click to focus the element
      dispatchClick(client, result.x, result.y)

      -- If --clear flag, select all and delete existing content
      if args.clear:
        send Input.dispatchKeyEvent type=keyDown key=a with metaKey (Cmd+A)
        send Input.dispatchKeyEvent type=keyUp key=a
        send Input.dispatchKeyEvent type=keyDown key=Backspace
        send Input.dispatchKeyEvent type=keyUp key=Backspace

      -- Type the text
      if args.text:
        send Input.insertText with args.text

      write "Filled {selector} with '{text}'" to stdout
      close client, exit 0

    case "select":
      -- Click the combobox/select to open it
      result = resolveElement(client, args.selector, { pierce: true })
      if null: error and exit 1
      dispatchClick(client, result.x, result.y)

      -- Type filter text if provided
      if args.text:
        send Input.insertText with args.text

      -- Wait for dropdown options to render (combobox delay)
      wait 500ms

      -- Find the option matching --option text
      if args.option:
        evaluate JS in page: use querySelectorDeep to find all [role=option] elements,
          filter to one whose textContent includes args.option
        if no matching option found:
          error "No option matching '{option}'" and exit 1

        get option coordinates via bounding rect
        dispatchClick(client, optionX, optionY)

      write "Selected '{option}' from {selector}" to stdout
      close client, exit 0

    case "submit":
      result = resolveElement(client, args.selector, { pierce: true })
      if null: error and exit 1
      dispatchClick(client, result.x, result.y)

      -- If --navigation flag, wait for navigation
      if args.navigation:
        (delegate to wait-navigation logic with args.timeout or default)

      write "Submitted {selector}" to stdout
      close client, exit 0

    case "read":
      result = resolveElement(client, args.selector, { pierce: true })
      if null: error and exit 1

      -- Read form element value via JS
      if result.method is "dom":
        call Runtime.callFunctionOn using DOM.resolveNode to get objectId first
        then call function that reads .value, .checked, .selectedOptions
      else (shadow method, already have objectId):
        call Runtime.callFunctionOn the objectId with function that reads
          .value, .checked, .selectedOptions (as array of text)

      write JSON of { value, checked, selectedOptions } to stdout
      close client, exit 0

    default:
      error "Unknown form action: {action}" and exit 1
```

Design note: Form mode always uses `pierce: true` because the primary use case (Auro web components) requires shadow DOM piercing. The standard DOM path is still tried first inside resolveElement, so there's no performance penalty for non-shadow elements.

### cdp-browser.js — `modeWait(client, args)` (new mode)

```
modeWait(client, args):
  timeout = args.timeout or 10000

  -- Determine which sub-mode
  if args.navigation:
    waitForNavigation(client, timeout)
  else if args.selector:
    waitForSelector(client, args.selector, timeout)
  else if args.idle:
    waitForIdle(client, timeout)
  else:
    error "wait requires --navigation, --selector, or --idle"
    exit 1

waitForNavigation(client, timeout):
  -- Inject JS that watches for URL change + DOM settle
  evaluate a Promise in page context that:
    records current location.href
    creates a MutationObserver on document.body (childList, subtree)
    on each mutation, checks if location.href changed
    if URL changed, waits 500ms for DOM to settle, then resolves with new URL
    setTimeout rejects after timeout ms

  if result is exception (timeout):
    write "Wait timed out after {timeout}ms" to stderr, exit 1

  write "Navigation detected: {newUrl}" to stdout
  close client, exit 0

waitForSelector(client, selector, timeout):
  -- Inject JS that watches for element appearance
  evaluate a Promise in page context that:
    first checks if element already exists (querySelector, then querySelectorDeep)
    if exists, resolves immediately
    otherwise creates MutationObserver on document.body (childList, subtree)
    on each mutation, checks querySelector then querySelectorDeep for the selector
    if found, disconnects observer and resolves
    setTimeout rejects after timeout ms

  if result is exception (timeout):
    write "Selector '{selector}' not found within {timeout}ms" to stderr, exit 1

  write "Element found: {selector}" to stdout
  close client, exit 0

waitForIdle(client, timeout):
  -- Inject JS that watches for network + DOM quiet period
  evaluate a Promise in page context that:
    patches window.fetch to track in-flight requests (increment on call, decrement on response/error)
    creates MutationObserver on document.body (childList, subtree)
    tracks lastActivityTimestamp (updated on fetch start/end and DOM mutation)
    polls every 100ms: if inFlightCount is 0 AND (now - lastActivity) > 500ms, resolve
    setTimeout rejects after timeout ms
    on resolve, restore original fetch and disconnect observer

  if result is exception (timeout):
    write "Idle timeout after {timeout}ms" to stderr, exit 1

  write "Page idle detected" to stdout
  close client, exit 0
```

Design note: All three wait sub-modes use `Runtime.evaluate` with `awaitPromise: true` to run async JS in the page context. This keeps the complexity inside injected JS rather than polling from Node. The timeout is enforced inside the Promise (via setTimeout reject) so the Node side just awaits the single evaluate call.

### cdp-browser.js — parseArgs updates

```
Add to args object defaults:
  action: null
  option: null
  clear: false
  navigation: false
  idle: false
  pierce: false
  timeout: null

Add to switch statement:
  case "--action": args.action = next arg
  case "--option": args.option = next arg
  case "--clear": args.clear = true (no next arg — boolean flag)
  case "--navigation": args.navigation = true (boolean flag)
  case "--idle": args.idle = true (boolean flag)
  case "--pierce": args.pierce = true (boolean flag)
  case "--timeout": args.timeout = parseInt(next arg)
```

### cdp-browser.js — printUsage updates

```
Add to Modes section:
  form                      Interact with form elements
  wait                      Wait for navigation, element, or idle

Add to Options section:
  --action <fill|select|submit|read>  Form action (form)
  --option <TEXT>                      Option text to select (form --action select)
  --clear                              Clear field before filling (form --action fill)
  --navigation                         Wait for URL change (wait)
  --idle                               Wait for network+DOM quiet (wait)
  --pierce                             Pierce shadow DOM (click)
  --timeout <MS>                       Timeout in ms (wait, default: 10000)
```

### cdp-browser.js — main() dispatch updates

```
Add to switch:
  case "form": await modeForm(client, args)
  case "wait": await modeWait(client, args)
```

---

### skills/browser/SKILL.md updates

```
Add to description/triggers:
  "form fill", "form select", "wait for element", "wait for navigation",
  "shadow DOM", "wait for idle"

Add to Direct Commands table:
  Fill form field      | cdp-browser.js form --action fill --selector SEL --text TEXT [--clear]
  Select from dropdown | cdp-browser.js form --action select --selector SEL --text FILTER --option TEXT
  Read form value      | cdp-browser.js form --action read --selector SEL
  Submit form          | cdp-browser.js form --action submit --selector SEL [--navigation]
  Wait for navigation  | cdp-browser.js wait --navigation [--timeout MS]
  Wait for element     | cdp-browser.js wait --selector SEL [--timeout MS]
  Wait for idle        | cdp-browser.js wait --idle [--timeout MS]

Update Interact workflow's "Available commands" list to include:
  - cdp-browser.js form --action fill|select|submit|read [flags]
  - cdp-browser.js wait --navigation|--selector SEL|--idle [--timeout MS]
  - cdp-browser.js click --selector SEL [--pierce]

Add to Tips section:
  - Use `form --action fill` instead of separate click + type for form fields
  - Use `wait --selector` after actions that trigger async rendering
  - Use `--pierce` flag when targeting elements inside web components (shadow DOM)
  - The `form --action select` command handles combobox interaction in one call (open, type, wait, click option)

Add reference to interaction-patterns.md:
  For CDP interaction recipes (combobox, date picker, dialog, tabs, accordion),
  see references/interaction-patterns.md
```

---

### skills/_shared/scripts/vite.sh

```
#!/bin/bash
set -euo pipefail

-- Port resolution: --port flag > VITE_PORT env > 5173
parse args: look for --port flag
if --port provided, use that
else if VITE_PORT env set, use that
else default to 5173

command = first positional arg

case command:
  "status":
    curl http://localhost:PORT/ with 2s timeout, follow redirects, silent, output /dev/null
    if curl succeeds (HTTP response):
      print "Vite running on port PORT"
      exit 0
    else:
      print "No server on port PORT" to stderr
      exit 1

  "env":
    -- Build JSON with project environment info
    vite_running = try curl as above, true/false
    port = resolved port

    -- Check if SvelteKit project
    if package.json exists in current directory:
      sveltekit = check if package.json contains "@sveltejs/kit" in dependencies or devDependencies
    else:
      sveltekit = false

    -- Check adapter
    if svelte.config.js exists:
      adapter = parse adapter name from svelte.config.js (grep for adapter- pattern)
    else:
      adapter = null

    print JSON: { "vite": vite_running, "port": PORT, "sveltekit": sveltekit, "adapter": adapter }
    exit 0

  default:
    print usage to stderr
    exit 1
```

---

### skills/_shared/references/svelte5-patterns.md

```
Reference document with quick-reference tables covering:

Section 1: Reactivity
  Table: Svelte 4 syntax | Svelte 5 syntax | Notes
  - let x = 0           | let x = $state(0)       | Mutable reactive state
  - $: doubled = x * 2  | let doubled = $derived(x * 2) | Derived values
  - $: { sideEffect() } | $effect(() => { sideEffect() }) | Side effects
  - export let prop      | let { prop } = $props()  | Component props

Section 2: Events
  Table: Svelte 4 | Svelte 5
  - on:click={handler}         | onclick={handler}
  - createEventDispatcher()    | Callback props (let { onsubmit } = $props())
  - on:click|preventDefault    | Use wrapper function or action

Section 3: Slots to Snippets
  Table: Svelte 4 | Svelte 5
  - <slot />                  | {@render children()}
  - <slot name="header" />    | {@render header()}
  - let:item                  | Snippet parameters

Section 4: Lifecycle
  Table: Svelte 4 | Svelte 5
  - onMount                   | onMount (unchanged)
  - afterUpdate               | $effect
  - beforeUpdate              | $effect.pre

Section 5: Stores to Runes
  Table: Svelte 4 | Svelte 5
  - writable(0)               | Use $state in .svelte.js modules
  - $store auto-subscribe     | Direct property access
  - $app/stores                | $app/state

Section 6: Class API
  - new Component({ target })  | mount(Component, { target })
  - component.$destroy()       | unmount(component)
```

---

### skills/_shared/references/sveltekit-checklist.md

```
Checklist document with checkbox sections:

Section: SSR Safety
  - [ ] No browser-only APIs (window, document, localStorage) outside onMount/$effect
  - [ ] No mutable module-level state (leaks between requests)
  - [ ] Components render correctly with SSR disabled (for debugging)
  - [ ] Dynamic imports for browser-only libraries

Section: Load Functions
  - [ ] +page.ts for universal load, +page.server.ts for server-only
  - [ ] Return serializable data from load
  - [ ] Use depends() for invalidation
  - [ ] Error handling with error() helper

Section: Form Actions
  - [ ] Default actions in +page.server.ts
  - [ ] Named actions with ?/actionName
  - [ ] Progressive enhancement with use:enhance
  - [ ] Validation on server side

Section: Environment Variables
  - [ ] Public vars use PUBLIC_ prefix
  - [ ] Private vars only in server files (+page.server.ts, +server.ts, hooks.server.ts)
  - [ ] $env/static vs $env/dynamic usage correct
  - [ ] No secrets in client bundles

Section: Routing
  - [ ] +layout.svelte for shared UI
  - [ ] +error.svelte for error pages (at least root level)
  - [ ] Route parameters validated
  - [ ] Redirect via redirect() helper, not window.location

Section: Adapter and Deployment
  - [ ] Correct adapter for target platform
  - [ ] Prerender configured for static pages
  - [ ] CSP headers configured if needed
  - [ ] Base path set if not serving from /
```

---

### skills/browser/references/interaction-patterns.md

```
Reference document with CDP interaction recipes:

Section: Combobox (autocomplete dropdown)
  Recipe:
    1. form --action fill --selector INPUT_SEL --text "search term" --clear
    2. wait --selector "[role=option]" --timeout 2000
    3. form --action select --selector INPUT_SEL --option "Option Text"
  Notes: Web components may need 300-500ms for dropdown render

Section: Date Picker
  Recipe:
    1. click --selector TRIGGER_SEL to open picker
    2. wait --selector ".date-picker-panel" (or similar)
    3. Navigate months if needed with click on nav arrows
    4. click --selector "[data-date='YYYY-MM-DD']" to select date
  Notes: Many date pickers use shadow DOM — use --pierce

Section: Dialog / Modal
  Recipe:
    1. click --selector TRIGGER_SEL to open dialog
    2. wait --selector "[role=dialog]" --timeout 3000
    3. Interact with dialog contents
    4. click --selector CLOSE_SEL or press Escape
  Notes: Focus trap — tab key cycles within dialog

Section: Tab Panel
  Recipe:
    1. click --selector "[role=tab][aria-controls='panel-id']"
    2. wait --selector "#panel-id:not([hidden])" --timeout 1000
  Notes: ARIA attributes identify which tab controls which panel

Section: Accordion
  Recipe:
    1. click --selector TRIGGER_SEL to expand section
    2. wait --selector CONTENT_SEL --timeout 1000
  Notes: Check aria-expanded attribute to verify state

Section: Shadow DOM Tips
  - Use --pierce flag on click and form commands when targeting web component internals
  - Shadow DOM elements are not visible to standard CSS selectors
  - The tool tries standard DOM first, then shadow piercing — no performance penalty
  - For deeply nested shadow DOMs (shadow root inside shadow root), the recursive query handles it
  - Coordinate-based clicks are used for shadow elements (nodeId not available)
```

---

### .claude/settings.local.json updates

```
Add to "allow" array:
  "Bash(*/skills/_shared/scripts/*)"
```

---

### .claude-plugin/plugin.json updates

```
Change "version" from "0.1.0" to "0.2.0"
```

---

## Design Notes

### resolveElement return contract
The `resolveElement` helper always returns an object with `{ x, y }` coordinates (or null if not found). This hides the difference between DOM-resolved elements (which have a nodeId and box model) and shadow-DOM-resolved elements (which have an objectId and bounding rect). Callers never need to know the resolution method to perform clicks. The `nodeId` or `objectId` is included for cases where callers need to call `Runtime.callFunctionOn` (e.g., form read), and `method` indicates which field is available.

### Wait mode: Promise-based vs polling
All wait sub-modes inject a single Promise into the page via `Runtime.evaluate({ awaitPromise: true })`. This is more efficient than polling from Node (which would require repeated CDP round-trips). Timeout is enforced inside the Promise via `setTimeout` + `reject`.

### Form mode: always pierce
Form mode uses `pierce: true` by default because its primary motivation is the Alaska Airlines Auro web component case. Standard DOM elements work fine with pierce (resolveElement tries DOM first). This avoids users needing to remember the flag for the most common case.

### modeForm cohesion
`modeForm` is a logical cohesion routine (switch on `args.action`). This is normally a red flag. However, the alternative (4 separate mode functions: modeFill, modeSelect, modeSubmit, modeRead) would quadruple the mode count from 7 to 11 and spread related form logic across the file. The sub-actions share the concept of "form element interaction" and all use `resolveElement` with pierce. Accepting logical cohesion here in exchange for keeping the CLI surface coherent (`form --action X` is easier to learn than 4 separate modes).

### Injected JS strings
`QUERY_SELECTOR_DEEP_JS` and the wait-mode Promises are JS code injected via `Runtime.evaluate`. These are string constants, not Node functions. They run in the browser page context. Keep them as template literals at the top of the file for readability.

## PRE-GATE Status

- [x] Discovery complete
- [x] Pseudocode complete
- [x] Design reviewed (resolveElement/dispatchClick deep module analysis, modeForm cohesion justified)
- [x] Ready for implementation

---
name: browser
description: Control a web browser via Chrome DevTools Protocol — take screenshots,
  inspect DOM and accessibility trees, click elements, type text, navigate pages,
  evaluate JavaScript, fill forms, and wait for page state changes. Use when interacting
  with a browser during Svelte or web development. Triggers on "browser", "browser
  screenshot", "click button", "navigate to", "what's on the page", "DOM tree",
  "accessibility tree", "open URL", "evaluate in browser", "Chrome", "page source",
  "inspect element", "type in browser", "fill form in browser", "what does the page
  look like", "form fill", "form select", "wait for element", "wait for navigation",
  "shadow DOM", "wait for idle", "scroll to", "dismiss dialog", "close modal",
  "extract data", "scrape page".
allowed-tools: Bash, Read, Agent
---

# Skill: browser

**On load:** Read `../../.claude-plugin/plugin.json` from this skill's base directory. Display `browser v{version}` before proceeding.

Control Chrome/Chromium through CDP shell scripts.

```
IMPORTANT: Never load screenshots, DOM trees, or accessibility trees in the main context.
Always dispatch a subagent for visual/inspection tasks.
```

---

## Prerequisites

- macOS with Google Chrome, Chrome Canary, or Chromium installed
- Node 22+ (for native WebSocket and fetch in cdp-browser.js)
- Run `browser.sh ensure` before any CDP operation

## Scripts

All scripts live at `${CLAUDE_SKILL_DIR}/scripts/`. Run them with Bash.

## Routing Table

| Intent                         | Workflow    | Why                              |
|-------------------------------|------------|----------------------------------|
| See what's on the page        | view       | Image stays in subagent          |
| Find DOM elements/structure   | inspect-dom| HTML stays in subagent           |
| Check accessibility           | inspect-ax | AX tree stays in subagent        |
| Multi-step browser interaction| interact   | Entire loop stays in subagent    |
| Simple one-shot command       | direct     | No image/tree involved           |

### Direct Commands (safe for main context)

| Intent                  | Script                                             |
|-------------------------|----------------------------------------------------|
| Ensure Chrome is running| browser.sh ensure [--port PORT]                    |
| Check Chrome status     | browser.sh status [--port PORT]                    |
| Navigate to URL         | cdp-browser.js navigate --url URL [--port PORT]    |
| Evaluate JS expression  | cdp-browser.js evaluate "expr" [--port PORT]       |
| Fill form field         | cdp-browser.js form --action fill --selector SEL --text TEXT [--clear] [--match-text T] [--visible] [--nth N] |
| Select from dropdown    | cdp-browser.js form --action select --selector SEL --text FILTER --option TEXT [--match-text T] [--visible] [--nth N] |
| Read form value         | cdp-browser.js form --action read --selector SEL [--match-text T] [--visible] [--nth N] |
| Submit form             | cdp-browser.js form --action submit --selector SEL [--navigation] [--match-text T] [--visible] [--nth N] |
| Wait for navigation     | cdp-browser.js wait --navigation [--timeout MS]    |
| Wait for element        | cdp-browser.js wait --selector SEL [--timeout MS]  |
| Wait for idle           | cdp-browser.js wait --idle [--timeout MS]          |
| Scroll to element       | cdp-browser.js scroll --to-selector SEL [--pierce] [--match-text T] [--visible] [--nth N] |
| Scroll by offset        | cdp-browser.js scroll --by N                       |
| Scroll to bottom/top    | cdp-browser.js scroll --to-bottom \| --to-top      |
| Dismiss dialog/overlay  | cdp-browser.js dismiss                              |
| Extract structured data | cdp-browser.js extract --selector SEL [--fields "name:.sel,..."] [--pierce] |
| Click all matching      | cdp-browser.js click --selector SEL --all [--aria-expanded true\|false] [--delay MS] [--pierce] [--match-text T] [--visible] |
| Collect expandable data | cdp-browser.js collect --selector SEL --read-selector SEL [--close] [--delay MS] [--pierce] [--match-text T] [--visible] [--aria-expanded VAL] |
| Evaluate from file      | cdp-browser.js evaluate --file PATH [--json]        |

---

## Workflows

### 1. View (screenshot analysis)

**When:** "What's on the page?", "How does it look?", "Is there a browser error?"

Main agent never loads the image. Haiku does the analysis.

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "browser: analyze screenshot"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/scripts/cdp-browser.js screenshot
       This outputs a file path to a compressed JPEG.
    3. Read that file path with the Read tool to see the image.
    4. Analyze and return:
       - Overview: What page/app is visible (1-2 sentences)
       - Key elements: Navigation, buttons, forms, content areas
       - State: Errors, loading indicators, form state, active tab
       - Viewport: Approximate page dimensions
    5. If the user asked something specific, answer that directly.
    Return text only. Be concise.

    USER QUESTION: [insert user's question here]
```

### 2. Inspect DOM

**When:** "What's the HTML structure?", "Find the form element", "What has class X?"

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "browser: inspect DOM"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/scripts/cdp-browser.js dom [--selector "CSS_SELECTOR" if user specified an element]
       This outputs HTML (or a file path if output exceeds 60KB).
    3. If a file path was returned, Read the file.
    4. Parse and return a structured summary:
       - Page title and structure overview
       - Key structural elements (forms, lists, tables, navigation)
       - If looking for a specific element: its tag, attributes, and children
    Return text only. Be concise.

    LOOKING FOR: [insert what the user needs]
```

### 3. Inspect Accessibility

**When:** "Accessibility tree?", "Is this accessible?", "ARIA structure?"

```
Dispatch Agent:
  subagent_type: general-purpose
  model: haiku
  description: "browser: inspect accessibility"
  prompt: |
    1. Run: ${CLAUDE_SKILL_DIR}/scripts/browser.sh ensure
    2. Run: ${CLAUDE_SKILL_DIR}/scripts/cdp-browser.js accessibility
       This outputs JSON (or a file path if output exceeds 60KB).
    3. If a file path was returned, Read the file.
    4. Parse and return:
       - Interactive elements: buttons, links, inputs with roles and names
       - Landmark structure (navigation, main, complementary)
       - Issues: missing labels, unnamed interactive elements, invalid roles
    Return text only. Be concise.

    LOOKING FOR: [insert what the user needs]
```

### 4. Interact (multi-step browser automation)

**When:** "Click the login button", "Fill in the form", "Navigate and check"

Combines view + inspect + actions in a subagent loop.

```
Dispatch Agent:
  subagent_type: general-purpose
  description: "browser: UI interaction"
  prompt: |
    You are automating a Chrome browser via CDP. Scripts are at:
    ${CLAUDE_SKILL_DIR}/scripts/

    Available commands:
    - browser.sh ensure              → ensure Chrome is running
    - cdp-browser.js screenshot      → compressed JPEG (read output path to see it)
    - cdp-browser.js dom             → full page HTML
    - cdp-browser.js dom --selector SEL → HTML of a specific element
    - cdp-browser.js accessibility   → full accessibility tree JSON
    - cdp-browser.js click --selector SEL [--pierce] [--match-text TEXT] [--visible] [--nth N] → click element by CSS selector
    - cdp-browser.js click --x X --y Y   → click at coordinates
    - cdp-browser.js type --text TXT → type text into focused element
    - cdp-browser.js navigate --url URL  → navigate to page
    - cdp-browser.js evaluate "expr" → evaluate JS in page context
    - cdp-browser.js evaluate --file PATH [--json] → evaluate JS from file
    - cdp-browser.js form --action fill|select|submit|read [flags] → form interaction
    - cdp-browser.js wait --navigation|--selector SEL|--idle [--timeout MS] → wait for state
    - cdp-browser.js scroll --to-selector SEL|--by N|--to-bottom|--to-top → scroll page
    - cdp-browser.js dismiss → dismiss topmost dialog/overlay
    - cdp-browser.js extract --selector SEL [--fields "name:.sel,..."] → extract data
    - cdp-browser.js click --selector SEL --all [--aria-expanded VAL] [--delay MS] → click all matching elements
    - cdp-browser.js collect --selector SEL --read-selector SEL [--close] [--delay MS] → click-read-close loop

    TASK: [insert what the user wants to do]

    WORKFLOW:
    1. Run browser.sh ensure first
    2. Take screenshot to see current state
    3. Use dom --selector or accessibility to find elements if needed
    4. Perform the requested actions
    5. Screenshot again to verify the result
    6. Return a text summary of what you did and the final state

    RULES:
    - Prefer CSS selectors (--selector) over coordinates (--x/--y)
    - Use DOM inspection to discover correct selectors
    - After each action, verify the result before proceeding
    - If something fails, use dom or accessibility to re-orient
    - Return text summary only — do not include raw HTML, DOM trees, or base64 data
```

---

## Anti-Rationalization Table

| Rationalization | Reality |
|-----------------|---------|
| "The DOM is small, I'll just read it inline" | Size is unpredictable. Always dispatch a subagent. |
| "I'll take a quick screenshot to check" | Screenshots always go to a subagent. No exceptions. |
| "I'll use evaluate to grab the HTML instead" | Evaluate returning large HTML is the same as DOM inspection — use subagent. |
| "The user only wants one element, I can read it directly" | Use cdp-browser.js dom --selector in a subagent. One element can still be large. |
| "The page is simple, the accessibility tree will be tiny" | AX trees are always larger than expected. Subagent. |

## Tips

- Run `browser.sh ensure` before any `cdp-browser.js` command — Chrome must be running with CDP enabled.
- All `cdp-browser.js` commands accept `--port` to override default 9222.
- Browser coordinates are CSS pixels — no scaling conversion needed (unlike iOS 3x).
- Large outputs (DOM, accessibility) automatically write to `/tmp` and print the path.
- For SPAs that don't fire page load events on route changes, use `wait --navigation` or `wait --selector` instead of relying on `navigate` alone.
- For the **interact** workflow, omit `model` to use the user's current model (better reasoning for complex multi-step tasks).
- Screenshots default to JPEG quality 80 for efficient subagent loading. Use `--format png` if you need full fidelity.
- Use `form --action fill` instead of separate click + type for form fields (handles focus, clear, and text input in one call).
- Use `wait --selector` after actions that trigger async rendering.
- Use `--pierce` flag when targeting elements inside web components (shadow DOM). Form mode uses pierce by default.
- Use `--match-text` to filter elements by visible text content when a CSS selector matches multiple elements.
- Use `--visible` to skip hidden/zero-size elements. Combine with `--nth` to pick a specific match (0-indexed).
- The `form --action select` command handles combobox interaction in one call (open, type, wait, click option).
- For CDP interaction recipes (combobox, date picker, dialog, tabs, accordion), see `references/interaction-patterns.md`.
- Use `scroll --to-selector` to bring off-screen elements into view before clicking or screenshotting. Supports `--pierce`, `--match-text`, `--visible`, `--nth`.
- Use `scroll --by 500` to scroll down 500px, or `--by -300` to scroll up. Use `--to-bottom` / `--to-top` for extremes.
- Use `dismiss` to close modal dialogs and overlays. It finds the topmost dialog (by z-index), looks for a close button, and falls back to Escape.
- Use `extract --selector ".card" --fields "name:.title,price:.price"` to scrape structured data from repeated elements. Output goes to `/tmp` if large.
- Use `evaluate --file script.js` to run a JS file in the page context. Add `--json` for pretty-printed JSON output.
- Evaluate mode auto-injects `querySelectorDeep` and `querySelectorAllDeep` helpers into the expression scope for shadow DOM queries.
- Use `click --all --selector "button.toggle"` to click every matching element. Add `--aria-expanded false` to only click collapsed toggles. Add `--delay 200` for a pause between clicks.
- Use `collect --selector "button.accordion" --read-selector ".panel-content" --close` to open each accordion, read its content, and close it again. Output is a JSON array of text strings.

## Context Efficiency

| Item                        | Size           | In Main Context? |
|-----------------------------|----------------|------------------|
| Screenshot JPEG             | ~50-300 KB     | NEVER — subagent only |
| DOM HTML                    | ~5-500 KB      | NEVER — subagent only |
| Accessibility tree JSON     | ~10-200 KB     | NEVER — subagent only |
| Subagent text summary       | ~200-800 chars | YES |
| Direct commands             | ~50-200 chars  | YES |

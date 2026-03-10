#!/usr/bin/env node

// cdp-browser.js -- Chrome DevTools Protocol client for browser automation
// Modes: screenshot, dom, accessibility, click, type, navigate, evaluate, form, wait, scroll, dismiss, extract, collect, diagnostics
// Requires Node 22+ (native WebSocket, native fetch)

"use strict";

const fs = require("fs");

// -- Shadow DOM piercing query --
// Injected into page context via Runtime.evaluate. Recursively walks shadow roots
// to find an element matching a CSS selector that standard querySelector misses.

const QUERY_SELECTOR_DEEP_JS = `(function(selector) {
    function search(root) {
        const found = root.querySelector(selector);
        if (found) return found;
        const all = root.querySelectorAll('*');
        for (const el of all) {
            if (el.shadowRoot) {
                const inner = search(el.shadowRoot);
                if (inner) return inner;
            }
        }
        return null;
    }
    return search(document);
})`;

// -- Shadow DOM piercing query (all matches) --
// Like QUERY_SELECTOR_DEEP_JS but returns ALL matching elements across shadow roots.
// Used by the filter path in resolveElement when matchText, visible, or nth is set.

const QUERY_SELECTOR_ALL_DEEP_JS = `(function(selector) {
    var results = [];
    function search(root) {
        var matches = root.querySelectorAll(selector);
        for (var i = 0; i < matches.length; i++) results.push(matches[i]);
        var all = root.querySelectorAll('*');
        for (var j = 0; j < all.length; j++) {
            if (all[j].shadowRoot) search(all[j].shadowRoot);
        }
    }
    search(document);
    return results;
})`;

// -- Shadow DOM piercing text extraction --
// Recursively walks shadow DOMs to collect all text content from an element.
// Standard .textContent misses text inside shadow roots; this traverses them.

const TEXT_CONTENT_DEEP_JS = `function deepText(el) {
    if (!el) return "";
    if (!el.shadowRoot) return el.textContent.trim();
    var text = "";
    function walk(node) {
        if (node.nodeType === 3) { text += node.textContent; return; }
        if (node.nodeType !== 1) return;
        if (node.shadowRoot) {
            node.shadowRoot.childNodes.forEach(walk);
        }
        node.childNodes.forEach(walk);
    }
    walk(el);
    return text.trim();
}`;

// -- Node version check --

const nodeMajor = parseInt(process.version.slice(1), 10);
if (nodeMajor < 22) {
    process.stderr.write(
        `cdp-browser.js requires Node 22+, found ${process.version}\n`
    );
    process.exit(1);
}

// -- Port resolution: --port flag > CDP_PORT env > 9222 --

function resolvePort(args) {
    if (args.port !== undefined) {
        return args.port;
    }
    if (process.env.CDP_PORT) {
        return parseInt(process.env.CDP_PORT, 10);
    }
    return 9222;
}

// -- Target discovery --
// Finds the best page target from Chrome's CDP endpoint.
// Prefers non-chrome:// pages over internal Chrome pages.

async function discoverPageTarget(port) {
    const url = `http://localhost:${port}/json/list`;
    const response = await fetch(url);
    const targets = await response.json();

    if (!Array.isArray(targets) || targets.length === 0) {
        throw new Error("No targets found from Chrome");
    }

    // Filter to page targets only
    const pages = targets.filter((t) => t.type === "page");
    if (pages.length === 0) {
        throw new Error("No page targets found — open a tab in Chrome first");
    }

    // Prefer a page whose URL is not an internal Chrome page
    const userPage = pages.find(
        (t) => !t.url.startsWith("chrome://") && !t.url.startsWith("devtools://")
    );
    const target = userPage || pages[0];

    const wsUrl = target.webSocketDebuggerUrl;
    if (!wsUrl) {
        throw new Error("Target missing webSocketDebuggerUrl");
    }
    return wsUrl;
}

// -- CDP client wrapper --
// Deep module: hides message ID tracking, request/response correlation,
// and JSON parse/stringify behind send(method, params) + on(event, cb).

function connectCDP(wsUrl) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);

        let nextId = 1;
        // Pending requests keyed by message ID, each holding {resolve, reject}
        const pending = new Map();
        // Event listeners keyed by CDP method name
        const listeners = new Map();

        ws.addEventListener("open", () => {
            resolve({
                // Send a CDP command, returns a Promise with the result
                send(method, params = {}) {
                    return new Promise((res, rej) => {
                        const id = nextId++;
                        pending.set(id, { resolve: res, reject: rej });
                        ws.send(JSON.stringify({ id, method, params }));
                    });
                },

                // Register a listener for CDP events
                on(method, callback) {
                    if (!listeners.has(method)) {
                        listeners.set(method, []);
                    }
                    listeners.get(method).push(callback);
                },

                // Close the WebSocket connection
                close() {
                    ws.close();
                },
            });
        });

        ws.addEventListener("message", (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }

            // Response to a send() call
            if (msg.id !== undefined && pending.has(msg.id)) {
                const handler = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.error) {
                    handler.reject(new Error(msg.error.message));
                } else {
                    handler.resolve(msg.result);
                }
                return;
            }

            // CDP event
            if (msg.method && listeners.has(msg.method)) {
                for (const cb of listeners.get(msg.method)) {
                    cb(msg.params);
                }
            }
        });

        ws.addEventListener("error", (err) => {
            for (const handler of pending.values()) {
                handler.reject(err);
            }
            pending.clear();
            reject(err);
        });

        ws.addEventListener("close", () => {
            for (const handler of pending.values()) {
                handler.reject(new Error("WebSocket closed"));
            }
            pending.clear();
        });
    });
}

// -- Adaptive output --
// Writes large output to /tmp and prints the path instead.
// Keeps stdout clean for the caller (skill subagent).

const SIZE_LIMIT_BYTES = 60 * 1024;

function emitOutput(output, prefix, extension) {
    const byteSize = Buffer.byteLength(output, "utf8");
    if (byteSize > SIZE_LIMIT_BYTES) {
        const tempPath = `/tmp/${prefix}-${Date.now()}${extension}`;
        fs.writeFileSync(tempPath, output, "utf8");
        process.stdout.write(tempPath + "\n");
    } else {
        process.stdout.write(output);
    }
}

// -- Mode: screenshot --
// Captures a JPEG screenshot (quality 80) and writes to disk.
// Default JPEG for context efficiency — matches ios-sim's compressed approach.

async function modeScreenshot(client, args) {
    const format = args.format || "jpeg";
    const quality = args.quality || 80;

    const result = await client.send("Page.captureScreenshot", {
        format,
        quality,
    });

    const buffer = Buffer.from(result.data, "base64");
    const ext = format === "png" ? ".png" : ".jpg";
    const outputPath = args.output || `/tmp/browser-screenshot-${Date.now()}${ext}`;
    fs.writeFileSync(outputPath, buffer);

    process.stdout.write(outputPath + "\n");
    client.close();
    process.exit(0);
}

// -- Mode: dom --
// Retrieves the full page HTML or a specific element's HTML by CSS selector.
// Large output (>60KB) is written to /tmp.

async function modeDom(client, args) {
    const doc = await client.send("DOM.getDocument", { depth: -1 });
    const rootNodeId = doc.root.nodeId;

    let outerHTML;
    if (args.selector) {
        const queryResult = await client.send("DOM.querySelector", {
            nodeId: rootNodeId,
            selector: args.selector,
        });
        if (queryResult.nodeId === 0) {
            process.stderr.write(`No element matches: ${args.selector}\n`);
            client.close();
            process.exit(1);
        }
        const htmlResult = await client.send("DOM.getOuterHTML", {
            nodeId: queryResult.nodeId,
        });
        outerHTML = htmlResult.outerHTML;
    } else {
        const htmlResult = await client.send("DOM.getOuterHTML", {
            nodeId: rootNodeId,
        });
        outerHTML = htmlResult.outerHTML;
    }

    emitOutput(outerHTML + "\n", "browser-dom", ".html");
    client.close();
    process.exit(0);
}

// -- Mode: accessibility --
// Retrieves the full accessibility tree as JSON.
// Large output (>60KB) is written to /tmp.

async function modeAccessibility(client, args) {
    const result = await client.send("Accessibility.getFullAXTree");
    const output = JSON.stringify(result.nodes, null, 2) + "\n";

    emitOutput(output, "browser-ax", ".json");
    client.close();
    process.exit(0);
}

// -- Helper: dispatchClick --
// Sends the 3-event mouse click sequence (move, press, release) at the given coordinates.
// Single place for click dispatch — used by modeClick, modeForm, and any future click needs.

async function dispatchClick(client, x, y) {
    await client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
    });
    await client.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
    });
    await client.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
    });
}

// -- Helper: resolveElement --
// Finds an element by CSS selector and returns its center coordinates.
// Supports two paths:
//   Fast path (no filters): DOM.querySelector, then optional shadow DOM pierce.
//   Filter path (matchText, visible, or nth): collects all matches in page context,
//     applies text/visibility/nth filters, returns center of chosen element.
// Returns { nodeId?, objectId?, x, y, method, matchCount? } or null if not found.

async function resolveElement(client, selector, {
    pierce = false,
    matchText = null,
    visible = false,
    nth = undefined,
} = {}) {
    const hasFilters = (matchText !== null) || visible || (nth !== undefined);

    // -- Filter path: collect all matches, apply filters in page context --
    if (hasFilters) {
        const collectExpr = pierce
            ? `${QUERY_SELECTOR_ALL_DEEP_JS}(${JSON.stringify(selector)})`
            : `Array.from(document.querySelectorAll(${JSON.stringify(selector)}))`;

        const filterFn = `(function() {
            var elements = ${collectExpr};
            var total = elements.length;
            var matchText = ${JSON.stringify(matchText)};
            var filterVisible = ${JSON.stringify(visible)};
            var nth = ${JSON.stringify(nth)};

            var filtered = elements;
            if (matchText !== null) {
                filtered = filtered.filter(function(el) {
                    return el.textContent.includes(matchText);
                });
            }
            if (filterVisible) {
                filtered = filtered.filter(function(el) {
                    var r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                });
            }
            var filteredCount = filtered.length;
            var pick = (nth !== null && nth !== undefined) ? nth : 0;
            if (pick < 0 || pick >= filteredCount) return null;

            var chosen = filtered[pick];
            var rect = chosen.getBoundingClientRect();
            return {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                total: total,
                filtered: filteredCount
            };
        })()`;

        const evalResult = await client.send("Runtime.evaluate", {
            expression: filterFn,
            returnByValue: true,
        });

        if (
            evalResult.exceptionDetails ||
            !evalResult.result ||
            evalResult.result.subtype === "null" ||
            evalResult.result.value === null
        ) {
            return null;
        }

        const val = evalResult.result.value;
        return {
            x: val.x,
            y: val.y,
            method: "filter",
            matchCount: val.filtered,
        };
    }

    // -- Fast path: standard DOM query (no filters) --
    const doc = await client.send("DOM.getDocument", { depth: 0 });
    const queryResult = await client.send("DOM.querySelector", {
        nodeId: doc.root.nodeId,
        selector,
    });

    if (queryResult.nodeId !== 0) {
        const box = await client.send("DOM.getBoxModel", {
            nodeId: queryResult.nodeId,
        });
        // content quad: x1,y1, x2,y2, x3,y3, x4,y4
        const quad = box.model.content;
        const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
        const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
        return { nodeId: queryResult.nodeId, x, y, method: "dom" };
    }

    // Shadow DOM fallback: inject recursive query into page context
    if (pierce) {
        const evalResult = await client.send("Runtime.evaluate", {
            expression: `${QUERY_SELECTOR_DEEP_JS}(${JSON.stringify(selector)})`,
            returnByValue: false,
        });

        if (
            evalResult.exceptionDetails ||
            !evalResult.result ||
            evalResult.result.subtype === "null"
        ) {
            return null;
        }

        const objectId = evalResult.result.objectId;

        // Get coordinates via JS bounding rect (no nodeId available for shadow elements)
        const coordResult = await client.send("Runtime.callFunctionOn", {
            objectId,
            functionDeclaration: `function() {
                const rect = this.getBoundingClientRect();
                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }`,
            returnByValue: true,
        });

        const coords = coordResult.result.value;
        return { objectId, x: coords.x, y: coords.y, method: "shadow" };
    }

    return null;
}

// -- Helper: collectAllElementCoords --
// Collects center coordinates for ALL elements matching a selector.
// Applies matchText, visible, pierce, and ariaExpanded filters in page context.
// Returns array of {x, y} objects.

async function collectAllElementCoords(client, args) {
    const collectExpr = args.pierce
        ? `${QUERY_SELECTOR_ALL_DEEP_JS}(${JSON.stringify(args.selector)})`
        : `Array.from(document.querySelectorAll(${JSON.stringify(args.selector)}))`;

    const filterFn = `(function() {
        var elements = ${collectExpr};
        var matchText = ${JSON.stringify(args.matchText || null)};
        var filterVisible = ${JSON.stringify(!!args.visible)};
        var ariaExpanded = ${JSON.stringify(args.ariaExpanded !== undefined ? args.ariaExpanded : null)};

        var filtered = elements;
        if (matchText !== null) {
            filtered = filtered.filter(function(el) {
                return el.textContent.includes(matchText);
            });
        }
        if (filterVisible) {
            filtered = filtered.filter(function(el) {
                var r = el.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
        }
        if (ariaExpanded !== null) {
            filtered = filtered.filter(function(el) {
                return el.getAttribute("aria-expanded") === ariaExpanded;
            });
        }

        var coords = [];
        for (var i = 0; i < filtered.length; i++) {
            var rect = filtered[i].getBoundingClientRect();
            coords.push({
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2
            });
        }
        return coords;
    })()`;

    const evalResult = await client.send("Runtime.evaluate", {
        expression: filterFn,
        returnByValue: true,
    });

    if (
        evalResult.exceptionDetails ||
        !evalResult.result ||
        !evalResult.result.value
    ) {
        return [];
    }

    return evalResult.result.value;
}

// -- Mode: click --
// Clicks an element by CSS selector or explicit coordinates.
// Sequence: mouseMoved -> mousePressed -> mouseReleased (matches real browser behavior).

async function modeClick(client, args) {
    // -- Batch path: click ALL matching elements --
    if (args.all) {
        if (!args.selector) {
            process.stderr.write("Error: click --all requires --selector\n");
            client.close();
            process.exit(1);
        }

        const coords = await collectAllElementCoords(client, args);

        if (coords.length === 0) {
            process.stderr.write(`No elements match: ${args.selector}\n`);
            client.close();
            process.exit(1);
        }

        for (let idx = 0; idx < coords.length; idx++) {
            await dispatchClick(client, coords[idx].x, coords[idx].y);
            if (args.delay > 0 && idx < coords.length - 1) {
                await new Promise((r) => setTimeout(r, args.delay));
            }
        }

        process.stdout.write(
            `Clicked ${coords.length} elements matching ${args.selector}\n`
        );
        client.close();
        process.exit(0);
    }

    // -- Single element path --
    let x, y;
    let matchCount = null;

    if (args.selector) {
        const resolved = await resolveElement(client, args.selector, {
            pierce: args.pierce,
            matchText: args.matchText,
            visible: args.visible,
            nth: args.nth,
        });
        if (!resolved) {
            const filters = [];
            if (args.matchText) filters.push(`matchText="${args.matchText}"`);
            if (args.visible) filters.push("visible");
            if (args.nth !== undefined) filters.push(`nth=${args.nth}`);
            const filterDesc = filters.length > 0 ? ` [filters: ${filters.join(", ")}]` : "";
            process.stderr.write(`No element matches: ${args.selector}${filterDesc}\n`);
            client.close();
            process.exit(1);
        }
        x = resolved.x;
        y = resolved.y;
        if (resolved.matchCount !== undefined) {
            matchCount = resolved.matchCount;
        }
    } else if (args.x !== undefined && args.y !== undefined) {
        x = args.x;
        y = args.y;
    } else {
        process.stderr.write("Error: click requires --selector or --x and --y\n");
        client.close();
        process.exit(1);
    }

    await dispatchClick(client, x, y);

    const target = args.selector ? ` (selector: ${args.selector})` : "";
    const matchInfo = matchCount !== null ? ` (${matchCount} matches)` : "";
    process.stdout.write(`Clicked at (${x}, ${y})${target}${matchInfo}\n`);
    client.close();
    process.exit(0);
}

// -- Mode: type --
// Types text into the currently focused element using Input.insertText.
// Handles all characters including Unicode in a single call (no per-char loop).

async function modeType(client, args) {
    if (!args.text) {
        process.stderr.write("Error: type requires --text\n");
        client.close();
        process.exit(1);
    }

    await client.send("Input.insertText", { text: args.text });

    process.stdout.write(`Typed: "${args.text}"\n`);
    client.close();
    process.exit(0);
}

// -- Mode: navigate --
// Navigates to a URL and waits for the page load event.
// Page.enable is called before listening for loadEventFired (required for event delivery).
// 30s timeout with warning (not failure) for SPAs that don't fire load events on route changes.

async function modeNavigate(client, args) {
    if (!args.url) {
        process.stderr.write("Error: navigate requires --url\n");
        client.close();
        process.exit(1);
    }

    // Enable Page domain before listening for events
    await client.send("Page.enable");

    const loadPromise = new Promise((resolve) => {
        let resolved = false;
        client.on("Page.loadEventFired", () => {
            if (!resolved) {
                resolved = true;
                resolve(true);
            }
        });
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(false);
            }
        }, 30000);
    });

    await client.send("Page.navigate", { url: args.url });
    const loaded = await loadPromise;

    if (!loaded) {
        process.stderr.write("Warning: Page load event timed out (SPA or slow page)\n");
    }

    process.stdout.write(`Navigated to ${args.url}\n`);
    client.close();
    process.exit(0);
}

// -- Mode: scroll --
// Scrolls the page by selector, pixel offset, or to top/bottom.
// --to-selector uses resolveElement (with pierce/matchText/visible/nth support)
// then scrolls that element into view at the center of the viewport.

async function modeScroll(client, args) {
    if (args.toSelector) {
        const resolved = await resolveElement(client, args.toSelector, {
            pierce: args.pierce,
            matchText: args.matchText,
            visible: args.visible,
            nth: args.nth,
        });
        if (!resolved) {
            process.stderr.write(`No element matches: ${args.toSelector}\n`);
            client.close();
            process.exit(1);
        }

        // Use Runtime.evaluate to scrollIntoView on the matched element
        const scrollExpr = args.pierce
            ? `${QUERY_SELECTOR_DEEP_JS}(${JSON.stringify(args.toSelector)})`
            : `document.querySelector(${JSON.stringify(args.toSelector)})`;

        await client.send("Runtime.evaluate", {
            expression: `(${scrollExpr}).scrollIntoView({block:'center', behavior:'instant'})`,
            awaitPromise: false,
            returnByValue: true,
        });

        process.stdout.write(`Scrolled to ${args.toSelector}\n`);
    } else if (args.scrollBy !== null) {
        await client.send("Runtime.evaluate", {
            expression: `window.scrollBy(0, ${args.scrollBy})`,
            returnByValue: true,
        });
        process.stdout.write(`Scrolled by ${args.scrollBy}px\n`);
    } else if (args.toBottom) {
        await client.send("Runtime.evaluate", {
            expression: `window.scrollTo(0, document.body.scrollHeight)`,
            returnByValue: true,
        });
        process.stdout.write("Scrolled to bottom\n");
    } else if (args.toTop) {
        await client.send("Runtime.evaluate", {
            expression: `window.scrollTo(0, 0)`,
            returnByValue: true,
        });
        process.stdout.write("Scrolled to top\n");
    } else {
        process.stderr.write(
            "Error: scroll requires --to-selector, --by, --to-bottom, or --to-top\n"
        );
        client.close();
        process.exit(1);
    }

    client.close();
    process.exit(0);
}

// -- Mode: dismiss --
// Finds and dismisses the topmost open dialog/overlay on the page.
// Walks shadow DOMs to find dialogs, sorts by z-index, and attempts
// to close via close button click or Escape key.

async function modeDismiss(client, args) {
    const findDialogExpr = `(function() {
        var dialogs = [];

        function collectDialogs(root) {
            // Standard open dialogs
            var openDialogs = root.querySelectorAll('dialog[open]');
            for (var i = 0; i < openDialogs.length; i++) dialogs.push(openDialogs[i]);

            // Helper: check if element is truly visible (rect + computed style + ancestor chain)
            function isElementVisible(el) {
                var r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return false;
                // Walk up to check for hidden ancestors (handles shadow DOM parents)
                var node = el;
                while (node && node !== document) {
                    if (node.nodeType === 1) {
                        var s = window.getComputedStyle(node);
                        if (s.display === 'none' || s.visibility === 'hidden') return false;
                        // Check for hidden utility classes (common in design systems)
                        var cls = (node.className || '').toString();
                        if (cls.indexOf('displayHidden') !== -1 || cls.indexOf('visually-hidden') !== -1) return false;
                    }
                    // Traverse up: shadow root → host element, otherwise → parentNode
                    if (node.nodeType === 11 && node.host) {
                        node = node.host;
                    } else {
                        node = node.parentNode;
                    }
                }
                return true;
            }

            // ARIA role dialogs that are visible
            var roleDialogs = root.querySelectorAll('[role="dialog"]');
            for (var j = 0; j < roleDialogs.length; j++) {
                if (isElementVisible(roleDialogs[j])) dialogs.push(roleDialogs[j]);
            }

            // Custom dialog elements — only if visible
            // Some custom dialogs portal their content elsewhere, leaving the host at 0x0
            var customDialogs = root.querySelectorAll('[is="dialog"], sl-dialog, md-dialog, ion-modal, vaadin-dialog-overlay');
            for (var k = 0; k < customDialogs.length; k++) {
                if (isElementVisible(customDialogs[k])) dialogs.push(customDialogs[k]);
            }

            // High z-index overlays (z-index > 999, visible, not tiny)
            var allEls = root.querySelectorAll('*');
            for (var m = 0; m < allEls.length; m++) {
                var style = window.getComputedStyle(allEls[m]);
                var z = parseInt(style.zIndex, 10);
                if (z > 999 && style.display !== 'none' && style.visibility !== 'hidden') {
                    var rect = allEls[m].getBoundingClientRect();
                    if (rect.width > 50 && rect.height > 50) {
                        dialogs.push(allEls[m]);
                    }
                }
            }

            // Recurse into shadow roots
            var shadowed = root.querySelectorAll('*');
            for (var s = 0; s < shadowed.length; s++) {
                if (shadowed[s].shadowRoot) collectDialogs(shadowed[s].shadowRoot);
            }
        }

        collectDialogs(document);

        // Deduplicate
        var unique = [];
        var seen = new Set();
        for (var u = 0; u < dialogs.length; u++) {
            if (!seen.has(dialogs[u])) {
                seen.add(dialogs[u]);
                unique.push(dialogs[u]);
            }
        }

        // Sort by z-index descending (topmost first)
        unique.sort(function(a, b) {
            var zA = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
            var zB = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
            return zB - zA;
        });

        if (unique.length === 0) return null;

        var topmost = unique[0];

        // Find close button in topmost dialog — recursively searches all shadow roots
        // Also searches for clickable custom elements that wrap native buttons
        function findCloseButton(el) {
            // Collect all interactive elements from light DOM and nested shadow roots
            var allCandidates = [];
            function collectCandidates(root) {
                // Native buttons
                var buttons = root.querySelectorAll('button');
                for (var b = 0; b < buttons.length; b++) allCandidates.push(buttons[b]);
                // Elements with close-related class names (custom element wrappers)
                var closeByClass = root.querySelectorAll('.close-button, .btn-close, .close, [class*="close-btn"], [class*="dialog-close"]');
                for (var c = 0; c < closeByClass.length; c++) allCandidates.push(closeByClass[c]);
                // Recurse into shadow roots
                var all = root.querySelectorAll('*');
                for (var a = 0; a < all.length; a++) {
                    if (all[a].shadowRoot) collectCandidates(all[a].shadowRoot);
                }
            }
            collectCandidates(el);
            if (el.shadowRoot) collectCandidates(el.shadowRoot);

            // Deduplicate
            var seen = new Set();
            var unique = [];
            for (var d = 0; d < allCandidates.length; d++) {
                if (!seen.has(allCandidates[d])) {
                    seen.add(allCandidates[d]);
                    unique.push(allCandidates[d]);
                }
            }

            // Score each candidate — higher score = better close-button match
            var best = null;
            var bestScore = 0;
            var dialogRect = el.getBoundingClientRect();
            for (var i = 0; i < unique.length; i++) {
                var btn = unique[i];
                var label = (btn.getAttribute('aria-label') || '').toLowerCase();
                var text = btn.textContent.trim().toLowerCase();
                var cls = (btn.className && typeof btn.className === 'string') ? btn.className.toLowerCase() : '';
                var rect = btn.getBoundingClientRect();
                // Skip invisible elements
                if (rect.width === 0 || rect.height === 0) continue;

                var score = 0;
                // Aria label matches
                if (label.indexOf('close') !== -1 || label.indexOf('dismiss') !== -1) score += 3;
                // Text content matches
                if (text === 'close' || text === 'dismiss') score += 3;
                if (text === 'x' || text === '\u00d7') score += 2;
                // Class name matches
                if (cls.indexOf('close') !== -1) score += 2;
                // Position bonus: top-right corner of dialog is canonical close-button location
                if (dialogRect.width > 0 && dialogRect.height > 0) {
                    if (rect.x > dialogRect.x + dialogRect.width * 0.6 &&
                        rect.y < dialogRect.y + dialogRect.height * 0.3) {
                        score += 1;
                    }
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = {
                        method: 'click',
                        element: btn.tagName + (cls ? '.' + cls.split(' ')[0] : ''),
                        coords: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
                    };
                }
            }
            return best;
        }

        var closeBtn = findCloseButton(topmost);

        // If no close button in the topmost element, search its parent chain
        // and siblings. Portaled dialogs often render the overlay and the dialog
        // content as siblings, or the close button lives in a parent's shadow root.
        if (!closeBtn) {
            // Walk up from topmost to find a close button in ancestors or their shadow hosts
            var ancestor = topmost.parentNode || (topmost.getRootNode && topmost.getRootNode().host);
            var searched = new Set();
            searched.add(topmost);
            while (!closeBtn && ancestor && ancestor !== document) {
                if (!searched.has(ancestor)) {
                    searched.add(ancestor);
                    closeBtn = findCloseButton(ancestor);
                }
                // Move up: if we're in a shadow root, go to the host element
                if (ancestor.nodeType === 11 && ancestor.host) {
                    ancestor = ancestor.host;
                } else {
                    ancestor = ancestor.parentNode;
                }
            }
        }

        // Last resort: search ALL visible dialog/overlay elements for a close button
        if (!closeBtn) {
            for (var f = 0; f < unique.length; f++) {
                if (unique[f] === topmost) continue;
                closeBtn = findCloseButton(unique[f]);
                if (closeBtn) break;
            }
        }

        if (closeBtn) {
            return { dismissed: true, method: closeBtn.method, element: closeBtn.element, coords: closeBtn.coords };
        }

        // Fallback: try Escape key
        return { dismissed: false, method: 'escape', element: topmost.tagName, coords: null };
    })()`;

    const evalResult = await client.send("Runtime.evaluate", {
        expression: findDialogExpr,
        returnByValue: true,
    });

    if (
        evalResult.exceptionDetails ||
        !evalResult.result ||
        evalResult.result.subtype === "null" ||
        evalResult.result.value === null
    ) {
        process.stdout.write("No open dialog or overlay found\n");
        client.close();
        process.exit(0);
    }

    const info = evalResult.result.value;

    if (info.method === "click" && info.coords) {
        await dispatchClick(client, info.coords.x, info.coords.y);
        process.stdout.write(
            `Dismissed dialog via click on ${info.element} at (${info.coords.x}, ${info.coords.y})\n`
        );
    } else if (info.method === "escape") {
        await client.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
        });
        await client.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
        });
        process.stdout.write(
            `Sent Escape key to dismiss ${info.element} (no close button found)\n`
        );
    }

    client.close();
    process.exit(0);
}

// -- Helper: parseFields --
// Parses a fields string like "name:.title,price:.price-tag" into
// an array of {name, selector} objects. Each entry is split by first colon.

function parseFields(fieldsStr) {
    return fieldsStr.split(",").map(function (entry) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) {
            return { name: entry.trim(), selector: entry.trim() };
        }
        return {
            name: entry.slice(0, colonIdx).trim(),
            selector: entry.slice(colonIdx + 1).trim(),
        };
    });
}

// -- Mode: extract --
// Extracts structured data from repeated container elements.
// --selector selects the container elements, --fields maps child selectors
// to named fields. Without --fields, extracts each container's textContent.

async function modeExtract(client, args) {
    if (!args.selector) {
        process.stderr.write("Error: extract requires --selector\n");
        client.close();
        process.exit(1);
    }

    const fields = args.fields ? parseFields(args.fields) : null;
    const queryFn = args.pierce
        ? `${QUERY_SELECTOR_ALL_DEEP_JS}(${JSON.stringify(args.selector)})`
        : `document.querySelectorAll(${JSON.stringify(args.selector)})`;

    let extractBody;
    if (fields) {
        // Build field extraction: for each container, querySelector each child selector
        const fieldEntries = fields
            .map(function (f) {
                return `{ name: ${JSON.stringify(f.name)}, selector: ${JSON.stringify(f.selector)} }`;
            })
            .join(", ");

        // Uses deepText for shadow DOM text extraction, and querySelectorScoped
        // to search within a container's shadow roots (not from document root).
        const pierceFlag = args.pierce ? "true" : "false";
        extractBody = `(function() {
            ${TEXT_CONTENT_DEEP_JS}
            function querySelectorScoped(root, selector) {
                var found = root.querySelector(selector);
                if (found) return found;
                var all = root.querySelectorAll('*');
                for (var k = 0; k < all.length; k++) {
                    if (all[k].shadowRoot) {
                        found = querySelectorScoped(all[k].shadowRoot, selector);
                        if (found) return found;
                    }
                }
                if (root.shadowRoot) {
                    found = querySelectorScoped(root.shadowRoot, selector);
                    if (found) return found;
                }
                return null;
            }
            var containers = ${queryFn};
            var fieldDefs = [${fieldEntries}];
            var usePierce = ${pierceFlag};
            var results = [];
            for (var i = 0; i < containers.length; i++) {
                var row = {};
                for (var j = 0; j < fieldDefs.length; j++) {
                    var child = containers[i].querySelector(fieldDefs[j].selector);
                    if (!child && usePierce) {
                        child = querySelectorScoped(containers[i], fieldDefs[j].selector);
                    }
                    row[fieldDefs[j].name] = child ? deepText(child) : null;
                }
                results.push(row);
            }
            return results;
        })()`;
    } else {
        extractBody = `(function() {
            ${TEXT_CONTENT_DEEP_JS}
            var containers = ${queryFn};
            var results = [];
            for (var i = 0; i < containers.length; i++) {
                results.push(deepText(containers[i]));
            }
            return results;
        })()`;
    }

    const evalResult = await client.send("Runtime.evaluate", {
        expression: extractBody,
        returnByValue: true,
    });

    if (evalResult.exceptionDetails) {
        const desc =
            evalResult.exceptionDetails.exception?.description ||
            evalResult.exceptionDetails.text ||
            "Extract evaluation failed";
        process.stderr.write(`Error: ${desc}\n`);
        client.close();
        process.exit(1);
    }

    const output = JSON.stringify(evalResult.result.value, null, 2) + "\n";
    emitOutput(output, "browser-extract", ".json");
    client.close();
    process.exit(0);
}

// -- Mode: collect --
// Click-read-close loop: clicks each toggle element, reads content from a
// read-selector after a delay, optionally closes, and returns all results as JSON.
// Useful for accordion/expandable patterns where content is only visible after click.

async function modeCollect(client, args) {
    if (!args.selector) {
        process.stderr.write("Error: collect requires --selector\n");
        client.close();
        process.exit(1);
    }
    if (!args.readSelector) {
        process.stderr.write("Error: collect requires --read-selector\n");
        client.close();
        process.exit(1);
    }

    const delay = args.delay !== undefined ? args.delay : 300;

    // Collect all toggle element coordinates
    const coords = await collectAllElementCoords(client, args);

    if (coords.length === 0) {
        process.stderr.write(`No elements match: ${args.selector}\n`);
        client.close();
        process.exit(1);
    }

    // Build the read expression that uses deepText for shadow DOM support
    const readExpr = args.pierce
        ? `(function() {
            ${TEXT_CONTENT_DEEP_JS}
            var el = ${QUERY_SELECTOR_DEEP_JS}(${JSON.stringify(args.readSelector)});
            return el ? deepText(el) : null;
        })()`
        : `(function() {
            ${TEXT_CONTENT_DEEP_JS}
            var el = document.querySelector(${JSON.stringify(args.readSelector)});
            return el ? deepText(el) : null;
        })()`;

    const results = [];
    for (let idx = 0; idx < coords.length; idx++) {
        // Capture body text before click for fallback diff
        const beforeResult = await client.send("Runtime.evaluate", {
            expression: "document.body.innerText",
            returnByValue: true,
        });
        const beforeText =
            !beforeResult.exceptionDetails && beforeResult.result
                ? beforeResult.result.value || ""
                : "";

        // Click to open
        await dispatchClick(client, coords[idx].x, coords[idx].y);
        await new Promise((r) => setTimeout(r, delay));

        // Read content from read-selector
        const evalResult = await client.send("Runtime.evaluate", {
            expression: readExpr,
            returnByValue: true,
        });

        let text = null;
        if (
            !evalResult.exceptionDetails &&
            evalResult.result &&
            evalResult.result.value !== null &&
            evalResult.result.value !== undefined
        ) {
            text = evalResult.result.value;
        }

        // Fallback: if read-selector matched nothing, diff body text to find new content
        if (text === null || (typeof text === "string" && text.trim() === "")) {
            const afterResult = await client.send("Runtime.evaluate", {
                expression: "document.body.innerText",
                returnByValue: true,
            });
            const afterText =
                !afterResult.exceptionDetails && afterResult.result
                    ? afterResult.result.value || ""
                    : "";
            if (afterText.length > beforeText.length) {
                // Extract the new content that appeared after the click
                // Find lines in afterText that weren't in beforeText
                const beforeLines = new Set(beforeText.split("\n"));
                const newLines = afterText
                    .split("\n")
                    .filter(function (line) {
                        return !beforeLines.has(line) && line.trim() !== "";
                    });
                if (newLines.length > 0) {
                    text = newLines.join("\n");
                }
            }
        }

        results.push(text);

        // Close if requested
        if (args.close) {
            await dispatchClick(client, coords[idx].x, coords[idx].y);
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    const output = JSON.stringify(results, null, 2) + "\n";
    emitOutput(output, "browser-collect", ".json");
    client.close();
    process.exit(0);
}

// -- Mode: evaluate --
// Evaluates a JavaScript expression in the page context.
// Supports async expressions via awaitPromise.

async function modeEvaluate(client, args) {
    // --file reads expression from a file; error if both --file and positional arg
    if (args.file && args.expression) {
        process.stderr.write(
            "Error: cannot use both --file and a positional expression\n"
        );
        client.close();
        process.exit(1);
    }

    if (args.file) {
        args.expression = fs.readFileSync(args.file, "utf8");
    }

    if (!args.expression) {
        process.stderr.write("Error: evaluate requires an expression argument\n");
        client.close();
        process.exit(1);
    }

    // Auto-IIFE wrapping: inject querySelectorDeep/querySelectorAllDeep helpers
    // and wrap expression for consistent execution context.
    // Skip if expression already starts with "(function".
    let expression = args.expression;
    if (!expression.trimStart().startsWith("(function")) {
        const helpers =
            `var querySelectorDeep = ${QUERY_SELECTOR_DEEP_JS}; ` +
            `var querySelectorAllDeep = ${QUERY_SELECTOR_ALL_DEEP_JS}; `;

        const isSingleExpression =
            expression.indexOf(";") === -1 && expression.indexOf("\n") === -1;

        if (isSingleExpression) {
            expression = `(function(){ ${helpers}return ${expression}; })()`;
        } else {
            expression = `(function(){ ${helpers}${expression} })()`;
        }
    }

    const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });

    if (result.exceptionDetails) {
        const desc =
            result.exceptionDetails.exception?.description ||
            result.exceptionDetails.text ||
            "Evaluation threw an exception";
        process.stderr.write(`Error: ${desc}\n`);
        client.close();
        process.exit(1);
    }

    let output;
    if (args.json) {
        output = JSON.stringify(result.result.value, null, 2);
    } else {
        output = JSON.stringify(result.result.value);
    }

    process.stdout.write(output + "\n");
    client.close();
    process.exit(0);
}

// -- Mode: form --
// Interacts with form elements: fill, select, submit, read.
// Always uses pierce:true because the primary use case is web components with shadow DOM.
// Standard DOM elements work fine with pierce (resolveElement tries DOM first).

async function modeForm(client, args) {
    if (!args.action) {
        process.stderr.write(
            "Error: form requires --action (fill|select|submit|read)\n"
        );
        client.close();
        process.exit(1);
    }
    if (!args.selector) {
        process.stderr.write("Error: form requires --selector\n");
        client.close();
        process.exit(1);
    }

    switch (args.action) {
        case "fill": {
            const resolved = await resolveElement(client, args.selector, {
                pierce: true,
                matchText: args.matchText,
                visible: args.visible,
                nth: args.nth,
            });
            if (!resolved) {
                process.stderr.write(
                    `No element matches: ${args.selector}\n`
                );
                client.close();
                process.exit(1);
            }

            // Click to focus the element
            await dispatchClick(client, resolved.x, resolved.y);

            // Clear existing content if requested (Cmd+A then Backspace)
            if (args.clear) {
                await client.send("Input.dispatchKeyEvent", {
                    type: "keyDown",
                    key: "a",
                    commands: ["selectAll"],
                });
                await client.send("Input.dispatchKeyEvent", {
                    type: "keyUp",
                    key: "a",
                });
                await client.send("Input.dispatchKeyEvent", {
                    type: "keyDown",
                    key: "Backspace",
                    code: "Backspace",
                });
                await client.send("Input.dispatchKeyEvent", {
                    type: "keyUp",
                    key: "Backspace",
                    code: "Backspace",
                });
            }

            // Type the text
            if (args.text) {
                await client.send("Input.insertText", { text: args.text });
            }

            process.stdout.write(
                `Filled ${args.selector} with '${args.text || ""}'\n`
            );
            client.close();
            process.exit(0);
        }

        case "select": {
            // Click the combobox/select to open it
            const resolved = await resolveElement(client, args.selector, {
                pierce: true,
                matchText: args.matchText,
                visible: args.visible,
                nth: args.nth,
            });
            if (!resolved) {
                process.stderr.write(
                    `No element matches: ${args.selector}\n`
                );
                client.close();
                process.exit(1);
            }
            await dispatchClick(client, resolved.x, resolved.y);

            // Type filter text if provided
            if (args.text) {
                await client.send("Input.insertText", { text: args.text });
            }

            // Wait for dropdown options to render (combobox delay)
            await new Promise((r) => setTimeout(r, 500));

            // Find and click the matching option
            if (args.option) {
                const optionResult = await client.send("Runtime.evaluate", {
                    expression: `(function() {
                        const opts = document.querySelectorAll('[role="option"]');
                        for (const opt of opts) {
                            if (opt.textContent.includes(${JSON.stringify(args.option)})) {
                                const rect = opt.getBoundingClientRect();
                                return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                            }
                        }
                        // Also search shadow DOMs for options
                        function searchShadow(root) {
                            const shadowed = root.querySelectorAll('*');
                            for (const el of shadowed) {
                                if (el.shadowRoot) {
                                    const inner = el.shadowRoot.querySelectorAll('[role="option"]');
                                    for (const opt of inner) {
                                        if (opt.textContent.includes(${JSON.stringify(args.option)})) {
                                            const rect = opt.getBoundingClientRect();
                                            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
                                        }
                                    }
                                    const deeper = searchShadow(el.shadowRoot);
                                    if (deeper) return deeper;
                                }
                            }
                            return null;
                        }
                        return searchShadow(document);
                    })()`,
                    returnByValue: true,
                });

                if (
                    optionResult.exceptionDetails ||
                    !optionResult.result.value
                ) {
                    process.stderr.write(
                        `No option matching '${args.option}'\n`
                    );
                    client.close();
                    process.exit(1);
                }

                const optCoords = optionResult.result.value;
                await dispatchClick(client, optCoords.x, optCoords.y);
            }

            process.stdout.write(
                `Selected '${args.option || ""}' from ${args.selector}\n`
            );
            client.close();
            process.exit(0);
        }

        case "submit": {
            const resolved = await resolveElement(client, args.selector, {
                pierce: true,
                matchText: args.matchText,
                visible: args.visible,
                nth: args.nth,
            });
            if (!resolved) {
                process.stderr.write(
                    `No element matches: ${args.selector}\n`
                );
                client.close();
                process.exit(1);
            }
            await dispatchClick(client, resolved.x, resolved.y);

            // Wait for navigation if requested
            if (args.navigation) {
                const timeout = args.timeout || 10000;
                await waitForNavigation(client, timeout);
            }

            process.stdout.write(`Submitted ${args.selector}\n`);
            client.close();
            process.exit(0);
        }

        case "read": {
            const resolved = await resolveElement(client, args.selector, {
                pierce: true,
                matchText: args.matchText,
                visible: args.visible,
                nth: args.nth,
            });
            if (!resolved) {
                process.stderr.write(
                    `No element matches: ${args.selector}\n`
                );
                client.close();
                process.exit(1);
            }

            // Read function extracts value, checked state, and selected options
            const readFn = `function() {
                const val = this.value !== undefined ? this.value : null;
                const checked = this.checked !== undefined ? this.checked : null;
                let selectedOpts = null;
                if (this.selectedOptions) {
                    selectedOpts = Array.from(this.selectedOptions).map(o => o.textContent.trim());
                }
                return { value: val, checked: checked, selectedOptions: selectedOpts };
            }`;

            let readResult;
            if (resolved.method === "dom") {
                // Get objectId from nodeId for Runtime.callFunctionOn
                const nodeObj = await client.send("DOM.resolveNode", {
                    nodeId: resolved.nodeId,
                });
                readResult = await client.send("Runtime.callFunctionOn", {
                    objectId: nodeObj.object.objectId,
                    functionDeclaration: readFn,
                    returnByValue: true,
                });
            } else {
                // Shadow method: already have objectId
                readResult = await client.send("Runtime.callFunctionOn", {
                    objectId: resolved.objectId,
                    functionDeclaration: readFn,
                    returnByValue: true,
                });
            }

            process.stdout.write(
                JSON.stringify(readResult.result.value) + "\n"
            );
            client.close();
            process.exit(0);
        }

        default:
            process.stderr.write(
                `Error: Unknown form action '${args.action}'\n`
            );
            client.close();
            process.exit(1);
    }
}

// -- Mode: wait --
// Waits for navigation, element appearance, or network+DOM idle.
// All sub-modes inject a Promise into the page via Runtime.evaluate with awaitPromise:true.
// Timeout is enforced inside the injected Promise (via setTimeout + reject).

async function modeWait(client, args) {
    const timeout = args.timeout || 10000;

    if (args.navigation) {
        await waitForNavigation(client, timeout);
        client.close();
        process.exit(0);
    } else if (args.selector) {
        await waitForSelector(client, args.selector, timeout);
        client.close();
        process.exit(0);
    } else if (args.idle) {
        await waitForIdle(client, timeout);
        client.close();
        process.exit(0);
    } else {
        process.stderr.write(
            "Error: wait requires --navigation, --selector, or --idle\n"
        );
        client.close();
        process.exit(1);
    }
}

// Watches for URL change via MutationObserver, then waits 500ms for DOM to settle.
async function waitForNavigation(client, timeout) {
    const result = await client.send("Runtime.evaluate", {
        expression: `new Promise((resolve, reject) => {
            const startUrl = location.href;
            const observer = new MutationObserver(() => {
                if (location.href !== startUrl) {
                    observer.disconnect();
                    setTimeout(() => resolve(location.href), 500);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Navigation timeout'));
            }, ${timeout});
        })`,
        awaitPromise: true,
        returnByValue: true,
    });

    if (result.exceptionDetails) {
        process.stderr.write(`Wait timed out after ${timeout}ms\n`);
        process.exit(1);
    }

    process.stdout.write(`Navigation detected: ${result.result.value}\n`);
}

// Watches for element appearance via MutationObserver with shadow DOM fallback.
async function waitForSelector(client, selector, timeout) {
    const result = await client.send("Runtime.evaluate", {
        expression: `new Promise((resolve, reject) => {
            const deepQuery = ${QUERY_SELECTOR_DEEP_JS};

            // Check if element already exists
            if (document.querySelector(${JSON.stringify(selector)}) || deepQuery(${JSON.stringify(selector)})) {
                return resolve(true);
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector(${JSON.stringify(selector)}) || deepQuery(${JSON.stringify(selector)})) {
                    observer.disconnect();
                    resolve(true);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error('Selector timeout'));
            }, ${timeout});
        })`,
        awaitPromise: true,
        returnByValue: true,
    });

    if (result.exceptionDetails) {
        process.stderr.write(
            `Selector '${selector}' not found within ${timeout}ms\n`
        );
        process.exit(1);
    }

    process.stdout.write(`Element found: ${selector}\n`);
}

// Watches for network (fetch) and DOM quiet period (500ms with no activity).
async function waitForIdle(client, timeout) {
    const result = await client.send("Runtime.evaluate", {
        expression: `new Promise((resolve, reject) => {
            let inFlight = 0;
            let lastActivity = Date.now();
            const originalFetch = window.fetch;

            window.fetch = function(...args) {
                inFlight++;
                lastActivity = Date.now();
                return originalFetch.apply(this, args).finally(() => {
                    inFlight--;
                    lastActivity = Date.now();
                });
            };

            const observer = new MutationObserver(() => {
                lastActivity = Date.now();
            });
            observer.observe(document.body, { childList: true, subtree: true });

            const poll = setInterval(() => {
                if (inFlight === 0 && (Date.now() - lastActivity) > 500) {
                    clearInterval(poll);
                    observer.disconnect();
                    window.fetch = originalFetch;
                    resolve(true);
                }
            }, 100);

            setTimeout(() => {
                clearInterval(poll);
                observer.disconnect();
                window.fetch = originalFetch;
                reject(new Error('Idle timeout'));
            }, ${timeout});
        })`,
        awaitPromise: true,
        returnByValue: true,
    });

    if (result.exceptionDetails) {
        process.stderr.write(`Idle timeout after ${timeout}ms\n`);
        process.exit(1);
    }

    process.stdout.write("Page idle detected\n");
}

// -- Argument parsing --

function parseArgs() {
    const argv = process.argv.slice(2);
    const args = {
        mode: null,
        port: undefined,
        output: null,
        selector: null,
        x: undefined,
        y: undefined,
        text: null,
        url: null,
        format: null,
        quality: null,
        expression: null,
        action: null,
        option: null,
        clear: false,
        navigation: false,
        idle: false,
        pierce: false,
        timeout: null,
        matchText: null,
        visible: false,
        nth: undefined,
        toSelector: null,
        scrollBy: null,
        toBottom: false,
        toTop: false,
        fields: null,
        file: null,
        json: false,
        all: false,
        ariaExpanded: undefined,
        delay: undefined,
        readSelector: null,
        close: false,
        live: false,
        stop: false,
        dump: false,
        snapshot: false,
        jsonl: false,
    };

    let i = 0;
    while (i < argv.length) {
        switch (argv[i]) {
            case "--port":
                args.port = parseInt(argv[++i], 10);
                break;
            case "--output":
                args.output = argv[++i];
                break;
            case "--selector":
                args.selector = argv[++i];
                break;
            case "--x":
                args.x = parseFloat(argv[++i]);
                break;
            case "--y":
                args.y = parseFloat(argv[++i]);
                break;
            case "--text":
                args.text = argv[++i];
                break;
            case "--url":
                args.url = argv[++i];
                break;
            case "--format":
                args.format = argv[++i];
                break;
            case "--quality":
                args.quality = parseInt(argv[++i], 10);
                break;
            case "--action":
                args.action = argv[++i];
                break;
            case "--option":
                args.option = argv[++i];
                break;
            case "--clear":
                args.clear = true;
                break;
            case "--navigation":
                args.navigation = true;
                break;
            case "--idle":
                args.idle = true;
                break;
            case "--pierce":
                args.pierce = true;
                break;
            case "--timeout":
                args.timeout = parseInt(argv[++i], 10);
                break;
            case "--match-text":
                args.matchText = argv[++i];
                break;
            case "--visible":
                args.visible = true;
                break;
            case "--nth":
                args.nth = parseInt(argv[++i], 10);
                break;
            case "--to-selector":
                args.toSelector = argv[++i];
                break;
            case "--by":
                args.scrollBy = parseInt(argv[++i], 10);
                break;
            case "--to-bottom":
                args.toBottom = true;
                break;
            case "--to-top":
                args.toTop = true;
                break;
            case "--fields":
                args.fields = argv[++i];
                break;
            case "--file":
                args.file = argv[++i];
                break;
            case "--json":
                args.json = true;
                break;
            case "--all":
                args.all = true;
                break;
            case "--aria-expanded":
                args.ariaExpanded = argv[++i];
                break;
            case "--delay":
                args.delay = parseInt(argv[++i], 10);
                break;
            case "--read-selector":
                args.readSelector = argv[++i];
                break;
            case "--close":
                args.close = true;
                break;
            case "--expression":
                args.expression = argv[++i];
                break;
            case "--live":
                args.live = true;
                break;
            case "--stop":
                args.stop = true;
                break;
            case "--dump":
                args.dump = true;
                break;
            case "--snapshot":
                args.snapshot = true;
                break;
            case "--jsonl":
                args.jsonl = true;
                break;
            default:
                if (argv[i].startsWith("-")) {
                    process.stderr.write(`Error: Unknown option '${argv[i]}'\n`);
                    process.exit(1);
                }
                // Positional: first is mode, second is expression (for evaluate)
                if (args.mode === null) {
                    args.mode = argv[i];
                } else if (args.mode === "evaluate" && args.expression === null) {
                    args.expression = argv[i];
                }
                break;
        }
        i++;
    }

    return args;
}

function printUsage() {
    process.stderr.write(
        "Usage: cdp-browser.js <mode> [options]\n" +
        "\n" +
        "Modes:\n" +
        "  screenshot                Capture page screenshot (JPEG)\n" +
        "  dom                       Get page HTML\n" +
        "  accessibility             Get accessibility tree (JSON)\n" +
        "  click                     Click element or coordinates\n" +
        "  type                      Type text into focused element\n" +
        "  navigate                  Navigate to URL\n" +
        '  evaluate "expression"     Evaluate JS in page context\n' +
        "  form                      Interact with form elements\n" +
        "  wait                      Wait for navigation, element, or idle\n" +
        "  scroll                    Scroll page by selector, offset, or position\n" +
        "  dismiss                   Dismiss topmost open dialog or overlay\n" +
        "  extract                   Extract structured data from repeated elements\n" +
        "  collect                   Click-read-close loop for expandable content\n" +
        "  diagnostics               Capture console logs and network requests\n" +
        "\n" +
        "Options:\n" +
        "  --port <PORT>             CDP port (default: $CDP_PORT or 9222)\n" +
        "  --output <PATH>           Output file path (screenshot)\n" +
        "  --selector <CSS>          CSS selector (dom, click, form, wait, extract)\n" +
        "  --x <N> --y <N>           Coordinates (click)\n" +
        "  --text <TEXT>             Text to type (type, form fill/select)\n" +
        "  --url <URL>               URL to navigate to (navigate)\n" +
        "  --format <jpeg|png>       Screenshot format (default: jpeg)\n" +
        "  --quality <1-100>         JPEG quality (default: 80)\n" +
        "  --action <ACTION>         Form action: fill|select|submit|read\n" +
        "  --option <TEXT>            Option text to select (form select)\n" +
        "  --clear                    Clear field before filling (form fill)\n" +
        "  --navigation               Wait for URL change (wait, form submit)\n" +
        "  --idle                     Wait for network+DOM quiet (wait)\n" +
        "  --pierce                   Pierce shadow DOM (click, scroll, extract)\n" +
        "  --timeout <MS>             Timeout in ms (wait, default: 10000)\n" +
        "  --match-text <TEXT>        Filter elements by visible text content\n" +
        "  --visible                  Skip hidden elements (zero bounding rect)\n" +
        "  --nth <N>                  Pick Nth match (0-indexed) after filtering\n" +
        "  --to-selector <CSS>        Scroll element into view (scroll)\n" +
        "  --by <N>                   Scroll by N pixels vertically (scroll)\n" +
        "  --to-bottom                Scroll to page bottom (scroll)\n" +
        "  --to-top                   Scroll to page top (scroll)\n" +
        "  --fields <SPEC>            Field extraction spec: name:.sel,... (extract)\n" +
        "  --file <PATH>              Read JS expression from file (evaluate)\n" +
        "  --json                     Pretty-print result as JSON (evaluate)\n" +
        "  --expression <EXPR>        JS expression (evaluate, alias for positional)\n" +
        "  --all                      Click all matching elements (click)\n" +
        "  --aria-expanded <VAL>      Filter by aria-expanded attribute (click --all, collect)\n" +
        "  --delay <MS>               Delay between actions in ms (click --all: 0, collect: 300)\n" +
        "  --read-selector <CSS>      Content selector to read after each click (collect)\n" +
        "  --close                    Click toggle again to close after reading (collect)\n" +
        "  --jsonl                    Output as JSONL instead of HAR (diagnostics)\n" +
        "  --live                     Stream diagnostics continuously to file\n" +
        "  --stop                     Stop a running live diagnostics session\n" +
        "  --dump                     Summarize a diagnostics log file\n"
    );
    process.exit(1);
}

// -- Diagnostics: record formatters --
// Pure transformers that normalize CDP event params into a uniform record shape.
// Console records have {kind, level, text, url?, source?, ts}.
// Network records have {kind, event, method/status/error, url, requestId, ts}.

const MAX_TEXT_LENGTH = 500;

function formatConsoleRecord(params, eventType) {
    let level, text, url, source, ts;

    if (eventType === "Runtime.consoleAPICalled") {
        level = params.type;
        text = params.args
            .map((arg) => arg.value !== undefined ? String(arg.value) : (arg.description || ""))
            .join(" ");
        ts = params.timestamp;
    } else if (eventType === "Runtime.exceptionThrown") {
        level = "exception";
        text = (params.exceptionDetails.exception && params.exceptionDetails.exception.description)
            || params.exceptionDetails.text
            || "unknown";
        ts = params.timestamp;
    } else if (eventType === "Log.entryAdded") {
        level = params.entry.level;
        text = params.entry.text;
        url = params.entry.url;
        source = params.entry.source;
        ts = params.entry.timestamp;
    }

    if (text && text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, MAX_TEXT_LENGTH);
    }

    const record = { kind: "console", level, text, ts };
    if (url) record.url = url;
    if (source) record.source = source;
    return record;
}

function formatNetworkRecord(params, eventType) {
    if (eventType === "Network.requestWillBeSent") {
        return {
            kind: "network",
            event: "request",
            method: params.request.method,
            url: params.request.url,
            requestId: params.requestId,
            ts: params.timestamp,
        };
    }
    if (eventType === "Network.responseReceived") {
        return {
            kind: "network",
            event: "response",
            status: params.response.status,
            url: params.response.url,
            mimeType: params.response.mimeType,
            requestId: params.requestId,
            ts: params.timestamp,
        };
    }
    if (eventType === "Network.loadingFailed") {
        return {
            kind: "network",
            event: "failed",
            error: params.errorText || "unknown",
            canceled: !!params.canceled,
            requestId: params.requestId,
            ts: params.timestamp,
        };
    }
}

// -- Diagnostics: HAR helpers --
// Pure transformers for building HAR 1.2 output from CDP network events.

// Converts a CDP header object ({name: value, ...}) to HAR header array [{name, value}, ...].
function convertHeaders(headerObj) {
    if (!headerObj) return [];
    return Object.entries(headerObj).map(([name, value]) => ({ name, value: String(value) }));
}

// Parses query string parameters from a URL into [{name, value}, ...].
// Returns [] for invalid URLs.
function parseQueryString(urlString) {
    try {
        const url = new URL(urlString);
        const params = [];
        for (const [name, value] of url.searchParams.entries()) {
            params.push({ name, value });
        }
        return params;
    } catch {
        return [];
    }
}

// -- Diagnostics: wireHarNetworkListeners --
// Adds a WebSocket message listener that populates requestMap with network request
// lifecycle data. Does NOT enable CDP domains -- wireEventListeners handles that.

function wireHarNetworkListeners(ws, requestMap) {
    ws.addEventListener("message", (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }

        const params = msg.params;
        if (!params) return;

        switch (msg.method) {
            case "Network.requestWillBeSent":
                requestMap.set(params.requestId, {
                    method: params.request.method,
                    url: params.request.url,
                    headers: convertHeaders(params.request.headers),
                    postData: params.request.postData,
                    ts: params.timestamp,
                    wallTime: params.wallTime,
                });
                break;
            case "Network.responseReceived": {
                const entry = requestMap.get(params.requestId);
                if (entry) {
                    entry.status = params.response.status;
                    entry.statusText = params.response.statusText;
                    entry.responseHeaders = convertHeaders(params.response.headers);
                    entry.mimeType = params.response.mimeType;
                    entry.timing = params.response.timing;
                }
                break;
            }
            case "Network.loadingFinished": {
                const entry = requestMap.get(params.requestId);
                if (entry) {
                    entry.encodedDataLength = params.encodedDataLength;
                    entry.completed = true;
                }
                break;
            }
            case "Network.loadingFailed": {
                const entry = requestMap.get(params.requestId);
                if (entry) {
                    entry.failed = true;
                    entry.errorText = params.errorText;
                }
                break;
            }
        }
    });
}

// -- Diagnostics: buildHarLog --
// Transforms a requestMap (populated by wireHarNetworkListeners) into a HAR 1.2 object.
// Gracefully handles missing fields at every level.

function buildHarLog(requestMap) {
    const harObj = {
        log: {
            version: "1.2",
            creator: { name: "cdp-browser", version: "0.3.0" },
            entries: [],
        },
    };

    for (const [, entry] of requestMap) {
        const startedDateTime = entry.wallTime
            ? new Date(entry.wallTime * 1000).toISOString()
            : new Date().toISOString();

        // Build request object
        const request = {
            method: entry.method,
            url: entry.url,
            httpVersion: "HTTP/1.1",
            headers: entry.headers || [],
            queryString: parseQueryString(entry.url),
            headersSize: -1,
            bodySize: entry.postData ? entry.postData.length : 0,
        };
        if (entry.postData) {
            request.postData = {
                mimeType: "application/x-www-form-urlencoded",
                text: entry.postData,
            };
        }

        // Build response object based on request state
        let response;
        if (entry.failed) {
            response = {
                status: 0,
                statusText: entry.errorText || "failed",
                httpVersion: "HTTP/1.1",
                headers: [],
                content: { size: -1, mimeType: "" },
                redirectURL: "",
                headersSize: -1,
                bodySize: -1,
            };
        } else if (entry.status !== undefined) {
            response = {
                status: entry.status,
                statusText: entry.statusText || "",
                httpVersion: "HTTP/1.1",
                headers: entry.responseHeaders || [],
                content: {
                    size: entry.encodedDataLength || -1,
                    mimeType: entry.mimeType || "",
                },
                redirectURL: "",
                headersSize: -1,
                bodySize: entry.encodedDataLength || -1,
            };
        } else {
            response = {
                status: 0,
                statusText: "(pending)",
                httpVersion: "HTTP/1.1",
                headers: [],
                content: { size: -1, mimeType: "" },
                redirectURL: "",
                headersSize: -1,
                bodySize: -1,
            };
        }

        // Build timings from CDP timing data
        let timings;
        if (entry.timing) {
            timings = {
                blocked: Math.max(entry.timing.dnsStart, 0),
                dns: Math.max(entry.timing.dnsEnd - entry.timing.dnsStart, -1),
                connect: Math.max(entry.timing.connectEnd - entry.timing.connectStart, -1),
                ssl: entry.timing.sslEnd > 0
                    ? Math.max(entry.timing.sslEnd - entry.timing.sslStart, -1)
                    : -1,
                send: Math.max(entry.timing.sendEnd - entry.timing.sendStart, -1),
                wait: Math.max(entry.timing.receiveHeadersEnd - entry.timing.sendEnd, -1),
                receive: 0,
            };
        } else {
            timings = { blocked: -1, dns: -1, connect: -1, ssl: -1, send: -1, wait: -1, receive: -1 };
        }

        const time = entry.timing ? Math.round(entry.timing.receiveHeadersEnd) : -1;

        harObj.log.entries.push({
            startedDateTime,
            time,
            request,
            response,
            cache: {},
            timings,
            pageref: "",
        });
    }

    return harObj;
}

// -- Diagnostics: wireEventListeners --
// Wires a single WebSocket message handler that dispatches to formatConsoleRecord
// or formatNetworkRecord, then enables the three CDP domains (Runtime, Log, Network).
// Listeners are wired BEFORE enabling domains so replayed events are caught.

function wireEventListeners(ws, onRecord) {
    let nextId = 1;

    function sendCmd(method, params) {
        ws.send(JSON.stringify({ id: nextId++, method, params: params || {} }));
    }

    ws.addEventListener("message", (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return;
        }

        switch (msg.method) {
            case "Runtime.consoleAPICalled":
            case "Runtime.exceptionThrown":
            case "Log.entryAdded":
                onRecord(formatConsoleRecord(msg.params, msg.method));
                break;
            case "Network.requestWillBeSent":
            case "Network.responseReceived":
            case "Network.loadingFailed":
                onRecord(formatNetworkRecord(msg.params, msg.method));
                break;
        }
    });

    sendCmd("Runtime.enable");
    sendCmd("Log.enable");
    sendCmd("Network.enable");
}

// -- Diagnostics: snapshot --
// Opens a raw WebSocket, captures console/network events for 1.5 seconds,
// then writes output. Default format is HAR 1.2 (.har) with a companion .jsonl
// for console events. Use --jsonl for the legacy JSONL-only format.

async function diagnosticsSnapshot(wsUrl, args) {
    const useJsonl = args.jsonl;

    if (useJsonl) {
        // Legacy JSONL path: all records in a single JSONL file
        const outputPath = args.output || `/tmp/browser-diagnostics-${Date.now()}.jsonl`;
        const records = [];
        const ws = new WebSocket(wsUrl);

        await new Promise((resolve, reject) => {
            ws.addEventListener("open", () => {
                wireEventListeners(ws, (record) => {
                    records.push(record);
                });

                setTimeout(() => {
                    const lines = records.map((r) => JSON.stringify(r)).join("\n");
                    fs.writeFileSync(outputPath, lines ? lines + "\n" : "", "utf8");
                    ws.close();
                    process.stdout.write(outputPath + "\n");
                    process.exit(0);
                }, 1500);

                resolve();
            });

            ws.addEventListener("error", (err) => {
                reject(new Error("WebSocket error: " + (err.message || "connection failed")));
            });
        });
        return;
    }

    // HAR default path: network in .har, console in companion .jsonl
    const timestamp = Date.now();
    const outputPath = args.output || `/tmp/browser-diagnostics-${timestamp}.har`;
    const consolePath = outputPath.replace(/\.har$/, ".jsonl");
    const requestMap = new Map();
    const consoleRecords = [];

    const ws = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
        ws.addEventListener("open", () => {
            wireEventListeners(ws, (record) => {
                consoleRecords.push(record);
            });
            wireHarNetworkListeners(ws, requestMap);

            setTimeout(() => {
                const harObj = buildHarLog(requestMap);
                fs.writeFileSync(outputPath, JSON.stringify(harObj, null, 2), "utf8");

                const consoleLines = consoleRecords.map((r) => JSON.stringify(r)).join("\n");
                fs.writeFileSync(consolePath, consoleLines ? consoleLines + "\n" : "", "utf8");

                process.stdout.write(outputPath + "\n");
                ws.close();
                process.exit(0);
            }, 1500);

            resolve();
        });

        ws.addEventListener("error", (err) => {
            reject(new Error("WebSocket error: " + (err.message || "connection failed")));
        });
    });
}

// -- Diagnostics: live --
// Opens a raw WebSocket and streams diagnostics to file(s).
// Default format is HAR: network data accumulates in memory and flushes to .har on
// cleanup, while console events stream to a companion .jsonl file.
// Use --jsonl for the legacy format (all records interleaved in one .jsonl file).
// Writes a PID file so diagnosticsStop() can find and kill this process.

async function diagnosticsLive(wsUrl, args) {
    const useJsonl = args.jsonl;
    const pidPath = "/tmp/browser-diagnostics.pid";

    if (useJsonl) {
        // Legacy JSONL path: stream all records to a single file
        const outputPath = args.output || `/tmp/browser-diagnostics-${Date.now()}.jsonl`;
        const writeStream = fs.createWriteStream(outputPath, { flags: "a" });
        const ws = new WebSocket(wsUrl);

        ws.addEventListener("open", () => {
            wireEventListeners(ws, (record) => {
                writeStream.write(JSON.stringify(record) + "\n");
            });

            fs.writeFileSync(pidPath, String(process.pid), "utf8");
            process.stdout.write(outputPath + "\n");
        });

        function cleanup() {
            try { fs.unlinkSync(pidPath); } catch {}
            writeStream.end();
        }

        ws.addEventListener("close", () => { cleanup(); process.exit(0); });
        ws.addEventListener("error", () => { cleanup(); process.exit(1); });
        process.on("SIGTERM", () => { cleanup(); ws.close(); process.exit(0); });
        process.on("SIGINT", () => { cleanup(); ws.close(); process.exit(0); });
        return;
    }

    // HAR default path: network accumulates in memory, console streams to .jsonl
    const timestamp = Date.now();
    const outputPath = args.output || `/tmp/browser-diagnostics-${timestamp}.har`;
    const consolePath = outputPath.replace(/\.har$/, ".jsonl");
    const requestMap = new Map();
    const consoleWriteStream = fs.createWriteStream(consolePath, { flags: "a" });

    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
        wireEventListeners(ws, (record) => {
            consoleWriteStream.write(JSON.stringify(record) + "\n");
        });
        wireHarNetworkListeners(ws, requestMap);

        fs.writeFileSync(pidPath, String(process.pid), "utf8");
        process.stdout.write(outputPath + "\n");
    });

    // Flush HAR data and clean up on exit
    function cleanup() {
        const harObj = buildHarLog(requestMap);
        fs.writeFileSync(outputPath, JSON.stringify(harObj, null, 2), "utf8");
        consoleWriteStream.end();
        try { fs.unlinkSync(pidPath); } catch {}
    }

    ws.addEventListener("close", () => { cleanup(); process.exit(0); });
    ws.addEventListener("error", () => { cleanup(); process.exit(1); });
    process.on("SIGTERM", () => { cleanup(); ws.close(); process.exit(0); });
    process.on("SIGINT", () => { cleanup(); ws.close(); process.exit(0); });
}

// -- Diagnostics: stop --
// Reads the PID file written by diagnosticsLive, kills the process, and cleans up.

function diagnosticsStop() {
    const pidPath = "/tmp/browser-diagnostics.pid";

    let pidStr;
    try {
        pidStr = fs.readFileSync(pidPath, "utf8");
    } catch {
        process.stderr.write("No live diagnostics session found\n");
        process.exit(1);
    }

    const pid = parseInt(pidStr, 10);

    try {
        process.kill(pid, "SIGTERM");
    } catch {
        process.stderr.write(`Warning: process ${pid} already exited\n`);
    }

    try { fs.unlinkSync(pidPath); } catch {}

    process.stdout.write(`Stopped diagnostics (PID ${pid})\n`);
    process.exit(0);
}

// -- Diagnostics: dump --
// Reads a diagnostics log file (.har or .jsonl), aggregates events,
// and prints a summary as formatted JSON. Finds most recent log if no path given.
// Auto-discovers both .har and .jsonl files and picks the most recent by mtime.

function diagnosticsDump(args) {
    let logPath = args.output;

    if (!logPath) {
        // Find most recent diagnostics log (.har or .jsonl) by mtime in /tmp
        const tmpFiles = fs.readdirSync("/tmp")
            .filter((f) => f.startsWith("browser-diagnostics-") && (f.endsWith(".jsonl") || f.endsWith(".har")))
            .map((f) => {
                const fullPath = "/tmp/" + f;
                return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
            })
            .sort((a, b) => b.mtime - a.mtime);

        if (tmpFiles.length === 0) {
            process.stderr.write("No diagnostics log found\n");
            process.exit(1);
        }
        logPath = tmpFiles[0].path;
    }

    let content;
    try {
        content = fs.readFileSync(logPath, "utf8");
    } catch {
        process.stderr.write(`Cannot read file: ${logPath}\n`);
        process.exit(1);
    }

    // HAR format summary
    if (logPath.endsWith(".har")) {
        let harObj;
        try {
            harObj = JSON.parse(content);
        } catch {
            process.stderr.write(`Cannot parse HAR file: ${logPath}\n`);
            process.exit(1);
        }

        const entries = harObj.log && harObj.log.entries ? harObj.log.entries : [];
        const byStatus = {};
        let failures = 0;
        const failedUrls = [];
        const waitTimes = [];

        for (const entry of entries) {
            const status = entry.response.status;
            byStatus[status] = (byStatus[status] || 0) + 1;
            if (status === 0) {
                failures++;
                if (failedUrls.length < 10) {
                    failedUrls.push(entry.request.url);
                }
            }
            if (entry.timings && entry.timings.wait > -1) {
                waitTimes.push(entry.timings.wait);
            }
        }

        const avgWait = waitTimes.length > 0
            ? Math.round(waitTimes.reduce((sum, t) => sum + t, 0) / waitTimes.length)
            : -1;
        const maxWait = waitTimes.length > 0
            ? Math.round(Math.max(...waitTimes))
            : -1;

        const summary = {
            file: logPath,
            format: "har",
            entries: entries.length,
            network: {
                requests: entries.length,
                byStatus,
                failures,
                failedUrls,
                timing: { avgWait, maxWait },
            },
        };

        process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
        process.exit(0);
    }

    // JSONL format summary (existing logic)
    const lines = content.trim().split("\n").filter(Boolean);

    const consoleCounts = { errors: 0, warnings: 0, exceptions: 0, info: 0, log: 0, debug: 0 };
    const networkCounts = { requests: 0, responses: 0, failures: 0 };
    const failedUrls = [];

    for (const line of lines) {
        let record;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }

        if (record.kind === "console") {
            switch (record.level) {
                case "error": consoleCounts.errors++; break;
                case "warning": consoleCounts.warnings++; break;
                case "exception": consoleCounts.exceptions++; break;
                case "info": consoleCounts.info++; break;
                case "log": consoleCounts.log++; break;
                case "debug": consoleCounts.debug++; break;
            }
        } else if (record.kind === "network") {
            switch (record.event) {
                case "request": networkCounts.requests++; break;
                case "response": networkCounts.responses++; break;
                case "failed":
                    networkCounts.failures++;
                    if (failedUrls.length < 10) {
                        failedUrls.push(record.url || record.error || "unknown");
                    }
                    break;
            }
        }
    }

    const summary = {
        file: logPath,
        entries: lines.length,
        console: consoleCounts,
        network: {
            requests: networkCounts.requests,
            responses: networkCounts.responses,
            failures: networkCounts.failures,
            failedUrls,
        },
    };

    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    process.exit(0);
}

// -- Mode: diagnostics --
// Dispatches to sub-mode helpers based on args flags.
// stop and dump do not need a WebSocket; snapshot and live open their own.

async function modeDiagnostics(args) {
    if (args.stop) {
        diagnosticsStop();
        return;
    }

    if (args.dump) {
        diagnosticsDump(args);
        return;
    }

    // Snapshot and live both need a CDP page target
    const port = resolvePort(args);
    let wsUrl;
    try {
        wsUrl = await discoverPageTarget(port);
    } catch (err) {
        process.stderr.write(`Cannot connect to Chrome on port ${port}\n`);
        process.stderr.write("Ensure Chrome is running: browser.sh ensure\n");
        process.exit(1);
    }

    if (args.live) {
        await diagnosticsLive(wsUrl, args);
        return;
    }

    // Default sub-mode: snapshot
    await diagnosticsSnapshot(wsUrl, args);
}

// -- Main --

async function main() {
    const args = parseArgs();

    if (!args.mode) {
        printUsage();
    }

    if (args.mode === "diagnostics") {
        await modeDiagnostics(args);
        return;
    }

    const port = resolvePort(args);
    let wsUrl;

    try {
        wsUrl = await discoverPageTarget(port);
    } catch (err) {
        process.stderr.write(`Cannot connect to Chrome on port ${port}\n`);
        process.stderr.write("Ensure Chrome is running: browser.sh ensure\n");
        process.exit(1);
    }

    let client;
    try {
        client = await connectCDP(wsUrl);
    } catch (err) {
        process.stderr.write(`WebSocket connection failed: ${err.message}\n`);
        process.exit(1);
    }

    switch (args.mode) {
        case "screenshot":
            await modeScreenshot(client, args);
            break;
        case "dom":
            await modeDom(client, args);
            break;
        case "accessibility":
            await modeAccessibility(client, args);
            break;
        case "click":
            await modeClick(client, args);
            break;
        case "type":
            await modeType(client, args);
            break;
        case "navigate":
            await modeNavigate(client, args);
            break;
        case "evaluate":
            await modeEvaluate(client, args);
            break;
        case "form":
            await modeForm(client, args);
            break;
        case "wait":
            await modeWait(client, args);
            break;
        case "scroll":
            await modeScroll(client, args);
            break;
        case "dismiss":
            await modeDismiss(client, args);
            break;
        case "extract":
            await modeExtract(client, args);
            break;
        case "collect":
            await modeCollect(client, args);
            break;
        default:
            process.stderr.write(`Error: Unknown mode '${args.mode}'\n`);
            printUsage();
    }
}

// Global unhandled rejection handler
process.on("unhandledRejection", (err) => {
    process.stderr.write(`Error: ${err.message || err}\n`);
    process.exit(1);
});

main().catch((err) => {
    process.stderr.write(`Error: ${err.message || err}\n`);
    process.exit(1);
});

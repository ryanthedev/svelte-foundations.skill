#!/usr/bin/env node

// cdp-browser.js -- Chrome DevTools Protocol client for browser automation
// Modes: screenshot, dom, accessibility, click, type, navigate, evaluate, form, wait
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
// Tries standard DOM.querySelector first (fast path). If not found and pierce=true,
// falls back to shadow DOM piercing via Runtime.evaluate.
// Returns { nodeId?, objectId?, x, y, method } or null if not found.

async function resolveElement(client, selector, { pierce = false } = {}) {
    // Fast path: standard DOM query
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

// -- Mode: click --
// Clicks an element by CSS selector or explicit coordinates.
// Sequence: mouseMoved -> mousePressed -> mouseReleased (matches real browser behavior).

async function modeClick(client, args) {
    let x, y;

    if (args.selector) {
        const resolved = await resolveElement(client, args.selector, {
            pierce: args.pierce,
        });
        if (!resolved) {
            process.stderr.write(`No element matches: ${args.selector}\n`);
            client.close();
            process.exit(1);
        }
        x = resolved.x;
        y = resolved.y;
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
    process.stdout.write(`Clicked at (${x}, ${y})${target}\n`);
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

// -- Mode: evaluate --
// Evaluates a JavaScript expression in the page context.
// Supports async expressions via awaitPromise.

async function modeEvaluate(client, args) {
    if (!args.expression) {
        process.stderr.write("Error: evaluate requires an expression argument\n");
        client.close();
        process.exit(1);
    }

    const result = await client.send("Runtime.evaluate", {
        expression: args.expression,
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

    process.stdout.write(JSON.stringify(result.result.value) + "\n");
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
                        ${QUERY_SELECTOR_DEEP_JS};
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
        "\n" +
        "Options:\n" +
        "  --port <PORT>             CDP port (default: $CDP_PORT or 9222)\n" +
        "  --output <PATH>           Output file path (screenshot)\n" +
        "  --selector <CSS>          CSS selector (dom, click, form, wait)\n" +
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
        "  --pierce                   Pierce shadow DOM (click)\n" +
        "  --timeout <MS>             Timeout in ms (wait, default: 10000)\n"
    );
    process.exit(1);
}

// -- Main --

async function main() {
    const args = parseArgs();

    if (!args.mode) {
        printUsage();
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

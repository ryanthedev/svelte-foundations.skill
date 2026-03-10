#!/bin/bash
set -euo pipefail

# vite.sh -- Vite dev server utility
# Commands: status, env
# Port resolution: --port flag > VITE_PORT env > 5173

PORT=""
COMMAND=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            PORT="$2"
            shift 2
            ;;
        status|env)
            COMMAND="$1"
            shift
            ;;
        *)
            COMMAND=""
            shift
            ;;
    esac
done

# Resolve port: --port flag > VITE_PORT env > 5173
if [[ -z "$PORT" ]]; then
    PORT="${VITE_PORT:-5173}"
fi

case "$COMMAND" in
    status)
        if curl -s -o /dev/null -w '' --max-time 2 -L "http://localhost:${PORT}/"; then
            echo "Vite running on port ${PORT}"
            exit 0
        else
            echo "No server on port ${PORT}" >&2
            exit 1
        fi
        ;;

    env)
        # Check if Vite is running
        if curl -s -o /dev/null -w '' --max-time 2 -L "http://localhost:${PORT}/" 2>/dev/null; then
            VITE_RUNNING="true"
        else
            VITE_RUNNING="false"
        fi

        # Check if SvelteKit project
        SVELTEKIT="false"
        if [[ -f "package.json" ]]; then
            if grep -q '@sveltejs/kit' package.json 2>/dev/null; then
                SVELTEKIT="true"
            fi
        fi

        # Check adapter
        ADAPTER="null"
        if [[ -f "svelte.config.js" ]]; then
            ADAPTER_MATCH=$(grep -oE 'adapter-[a-z]+' svelte.config.js 2>/dev/null | head -1 || true)
            if [[ -n "$ADAPTER_MATCH" ]]; then
                ADAPTER="\"${ADAPTER_MATCH}\""
            fi
        fi

        echo "{\"vite\":${VITE_RUNNING},\"port\":${PORT},\"sveltekit\":${SVELTEKIT},\"adapter\":${ADAPTER}}"
        exit 0
        ;;

    *)
        echo "Usage: vite.sh <command> [--port PORT]" >&2
        echo "" >&2
        echo "Commands:" >&2
        echo "  status    Check if Vite dev server is running" >&2
        echo "  env       JSON summary of project environment" >&2
        exit 1
        ;;
esac

#!/usr/bin/env node
/**
 * Claude Code PreToolUse Hook - Cross-platform Node.js version
 * Works on Windows, macOS, and Linux
 *
 * This script intercepts tool calls from Claude Code and forwards them
 * to the Claude Super Monitor web UI for user authorization.
 */

const API = 'http://localhost:5998/api/hook';
const TIMEOUT_MS = 65000; // Slightly longer than server's 60s timeout

/**
 * Read stdin data
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data.trim()); });
    process.stdin.on('error', () => { resolve(''); });
  });
}

/**
 * Escape special characters for JSON string
 */
function escapeJsonString(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/[\u0000-\u001f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

async function main() {
  const stdinData = await readStdin();

  // If no data, allow by default
  if (!stdinData) {
    process.exit(0);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: stdinData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const result = await response.json();

    if (result.decision === 'approve') {
      // Allow tool execution
      process.exit(0);
    } else if (result.decision === 'block' && result.reason) {
      // Block with reason (for AskUserQuestion responses)
      const escapedReason = escapeJsonString(result.reason);
      console.log(`{"decision":"block","reason":"${escapedReason}"}`);
      process.exit(2);
    } else {
      // Deny
      console.error('[Monitor] Tool blocked by user via Web UI');
      process.exit(2);
    }
  } catch (e) {
    // Server not running, timeout, or network error - allow by default
    // This ensures Claude Code continues to work even if monitor is not running
    process.exit(0);
  }
}

main();

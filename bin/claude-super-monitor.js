#!/usr/bin/env node
// CLI entry point – handles --update flag before loading server

const args = process.argv.slice(2);

// Handle --update / -u flag
if (args.includes('--update') || args.includes('-u')) {
  const { execSync } = require('child_process');
  console.log('\x1b[36m[claude-super-monitor] Checking for updates...\x1b[0m');
  try {
    execSync('npm update -g claude-super-monitor', { stdio: 'inherit' });
    console.log('\x1b[32m[claude-super-monitor] Update completed!\x1b[0m');
    process.exit(0);
  } catch (e) {
    console.error('\x1b[31m[claude-super-monitor] Update failed. Try running with administrator privileges.\x1b[0m');
    process.exit(1);
  }
}

// Handle --help / -h flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Claude Super Monitor - Real-time dashboard for Claude Code sessions

Usage:
  claude-super-monitor [options]

Options:
  -h, --help     Show this help message
  -u, --update   Update to the latest version from npm

Environment Variables:
  CLAUDE_SUPER_MONITOR_UI_PORT   HTTP server port (default: 3000)
  CLAUDE_SUPER_MONITOR_WS_PORT   WebSocket server port (default: 3001)

Examples:
  claude-super-monitor              Start the dashboard
  claude-super-monitor --update     Update to latest version
`);
  process.exit(0);
}

// Load server bundle
import(new URL('../dist-server/standalone.js', import.meta.url).href).catch((e) => {
  console.error(e);
  process.exit(1);
});

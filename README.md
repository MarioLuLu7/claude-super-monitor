# Claude Panel

[![npm version](https://img.shields.io/npm/v/claude-panel.svg)](https://www.npmjs.com/package/claude-panel)
[![GitHub stars](https://img.shields.io/github/stars/MarioLuLu7/claude-panel)](https://github.com/MarioLuLu7/claude-panel)

> 实时监控 Claude Code 会话的 Web 仪表盘 — 工具调用、Token 估算、授权确认，一屏掌握。

A real-time web dashboard for monitoring Claude Code sessions — track tool calls, estimate token usage, and authorize tools through a visual interface.

![Claude Panel Screenshot](https://raw.githubusercontent.com/MarioLuLu7/claude-panel/main/screenshot.png)

## Features

- 🔴 **Real-time Monitoring** - Live WebSocket updates show Claude's current actions as they happen
- 🛠️ **Tool Call Tracking** - See which tools Claude is using: Bash, Write, Edit, WebFetch, Search, and more
- 📊 **Token Estimation** - Rough token count estimation based on session file size
- 🔐 **Tool Authorization** - Grant or deny permission requests directly in the Web UI (optional hook)
- 🌐 **Multi-session View** - Monitor multiple Claude Code sessions side-by-side
- 📝 **Session Titles** - First user message automatically extracted as session title
- 🔔 **Notification Bar** - Completed sessions collapse into notifications; click to restore
- 🎨 **Bilingual UI** - Chinese and English interface support
- ⚙️ **Configurable** - Adjust auto-approval, collapse delay, language, and more

## Installation

```bash
npm install -g claude-panel
```

## Usage

### Quick Start

After installation, simply run:

```bash
claude-panel
```

The dashboard will:
1. Start on `http://localhost:3000`
2. WebSocket server on port 3001
3. Auto-open your browser

### Requirements

- **Claude Code** installed and running in VSCode
- **Windows, macOS, or Linux**
- **Node.js ≥ 18**

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_PANEL_UI_PORT` | `3000` | HTTP server port for the dashboard |
| `CLAUDE_PANEL_WS_PORT` | `3001` | WebSocket server port |

```bash
CLAUDE_PANEL_UI_PORT=8080 claude-panel
```

## How It Works

Claude Panel reads Claude Code's session files from `~/.claude/projects/` and watches for real-time updates. It automatically detects:

- Active VSCode windows (via lock files)
- Current Claude Code sessions
- Tool use events (Bash, Write, Edit, etc.)
- User authorization requirements

### Automatic Settings Injection

When you start `claude-panel`, it automatically:

1. Adds wildcard permissions to `~/.claude/settings.json` (skips VSCode popup confirmations)
2. Configures the PreToolUse hook for tool authorization (optional)

These changes are automatically reverted when you stop the server.

## Tool Authorization (Optional)

Claude Status can intercept tool calls and ask for your approval before Claude executes them:

1. Start `claude-panel`
2. The tool automatically configures the hook in Claude's settings
3. When Claude attempts to run a Bash command, write a file, or edit code:
   - A dialog appears in the Web UI
   - You click **Approve** or **Deny**
   - Claude continues or cancels accordingly

The hook script uses PowerShell on Windows and times out after 60 seconds (defaults to deny).

## Development

```bash
# Clone the repo
git clone https://github.com/MarioLuLu7/claude-panel.git
cd claude-panel

# Install dependencies
npm install

# Dev mode (hot reload)
npm run dev

# Build for production
npm run build

# Preview production build
npm start
```

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Claude Code   │ ──────▶ │   JSONL Files    │ ──────▶ │  File Watcher   │
│   (VSCode)      │         │  ~/.claude/...   │         │  (Node.js fs)   │
└─────────────────┘         └──────────────────┘         └────────┬────────┘
                                                                   │
                              ┌─────────────────┐                  │
                              │   WebSocket     │ ◀────────────────┘
                              │   Server (3001) │
                              │   /api/hook     │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   Vue 3 + Vite  │
                              │   Dashboard     │
                              │   localhost:3000│
                              └─────────────────┘
```

## Troubleshooting

### "dist/ not found" error

Run `npm run build` first to build the frontend.

### No sessions showing

- Make sure Claude Code is running in VSCode
- Check that `~/.claude/projects/` exists
- Verify VSCode window is active (check lock files in `~/.claude/ide/`)

### WebSocket connection issues

- Ensure port 3001 is not in use by another application
- Check browser console for connection errors
- Try refreshing the page

### Hook not triggering

- Verify PowerShell is available (Windows)
- Check `~/.claude/settings.json` for `PreToolUse` hook configuration
- Ensure the hook path points to the correct location in the npm package

## License

MIT © MarioLuLu7

## Contributing

Pull requests welcome! Please open an issue first to discuss major changes.

---

Made with ❤️ for the Claude Code community.

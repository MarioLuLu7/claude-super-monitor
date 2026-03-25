# Claude Super Monitor

[![npm version](https://img.shields.io/npm/v/claude-super-monitor.svg)](https://www.npmjs.com/package/claude-super-monitor)
[![GitHub stars](https://img.shields.io/github/stars/MarioLuLu7/claude-super-monitor)](https://github.com/MarioLuLu7/claude-super-monitor)
[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)](https://github.com/MarioLuLu7/claude-super-monitor)
[![IDE](https://img.shields.io/badge/IDE-VSCode-blue.svg)](https://github.com/MarioLuLu7/claude-super-monitor)

**[English](./README.md)** | 简体中文

> 实时监控 Claude Code 会话的 Web 仪表盘 — 工具调用、Token 估算、授权确认，一屏掌握。

![Claude Super Monitor Screenshot](https://raw.githubusercontent.com/MarioLuLu7/claude-super-monitor/main/screenshot.png)

![Claude Super Monitor Screenshot 2](https://raw.githubusercontent.com/MarioLuLu7/claude-super-monitor/main/screenshot2.png)

## ⚠️ 平台要求

**当前限制：**
- ✅ **Windows** - 完全支持
- ❌ **macOS** - 暂不支持
- ❌ **Linux** - 暂不支持
- ✅ **VSCode Claude 扩展** - 必需
- ❌ **Claude 终端版 (CLI)** - 暂不支持

> **注意**：此工具目前仅支持 Windows 上的 VSCode Claude Code 扩展。macOS、Linux 和终端版 Claude CLI 的支持正在计划中。

## 功能特性

- 🔴 **实时监控** - WebSocket 实时推送 Claude 的当前操作
- 🛠️ **工具调用追踪** - 查看 Claude 正在使用的工具：Bash、Write、Edit、WebFetch、Search 等
- 📊 **Token 估算** - 基于会话文件大小的粗略 Token 计数估算
- 🔐 **工具授权** - 在 Web UI 中直接批准或拒绝权限请求（可选钩子）
- ❓ **AskUserQuestion 支持** - 在仪表盘中交互式回答 Claude 的问题
- 🌐 **多会话视图** - 并排监控多个 Claude Code 会话
- 📝 **会话标题** - 自动提取第一条用户消息作为会话标题
- 🔔 **通知栏** - 已完成会话折叠为通知，点击可恢复
- 🎮 **游戏面板** - 带有 DOTOWN 像素艺术角色的交互式 Pixi.js 小游戏，会对 Claude 的工具调用做出反应
- 🎨 **双语界面** - 支持中英文界面
- ⚙️ **可配置** - 调整自动审批、折叠延迟、语言等设置
- 🔄 **自动更新** - 内置更新到最新版本的命令

## 安装

```bash
npm install -g claude-super-monitor
```

## 使用方法

### 快速开始

安装完成后，直接运行：

```bash
claude-super-monitor
# 或使用短别名
csm
```

仪表盘将会：
1. 在 `http://localhost:5999` 启动
2. WebSocket 服务器在端口 5998
3. 自动打开浏览器

### 更新到最新版本

```bash
claude-super-monitor --update
# 或
claude-super-monitor -u
```

### 系统要求

- **VSCode** 已安装并运行 Claude Code 扩展
- **Windows**（推荐 Windows 10/11）
- **Node.js ≥ 18**

### 环境变量

| 变量 | 默认值 | 描述 |
|------|--------|------|
| `CLAUDE_SUPER_MONITOR_UI_PORT` | `5999` | 仪表盘 HTTP 服务器端口 |
| `CLAUDE_SUPER_MONITOR_WS_PORT` | `5998` | WebSocket 服务器端口 |

```bash
# Windows PowerShell
$env:CLAUDE_SUPER_MONITOR_UI_PORT=8080; claude-super-monitor

# Windows CMD
set CLAUDE_SUPER_MONITOR_UI_PORT=8080 && claude-super-monitor
```

## 开发路线图

| 功能 | 状态 | 描述 |
|------|------|------|
| Windows 支持 | ✅ 已完成 | 完整支持 Windows 10/11 |
| macOS 支持 | 🚧 计划中 | macOS 兼容性 |
| Linux 支持 | 🚧 计划中 | Linux 兼容性 |
| VSCode 扩展 | ✅ 已完成 | 支持 VSCode Claude 扩展 |
| Claude 终端 CLI | 🚧 计划中 | 支持终端版 Claude Code |
| 自动更新 | ✅ 已完成 | 内置更新命令 |

## 工作原理

Claude Super Monitor 从 `~/.claude/projects/` 读取 Claude Code 的会话文件，并实时监控更新。它会自动检测：

- 活动的 VSCode 窗口（通过锁文件）
- 当前的 Claude Code 会话
- 工具使用事件（Bash、Write、Edit 等）
- 用户授权请求

### 自动设置注入

当你启动 `claude-super-monitor` 时，它会自动：

1. 向 `~/.claude/settings.json` 添加通配符权限（跳过 VSCode 弹窗确认）
2. 配置 PreToolUse 钩子用于工具授权（可选）

当你停止服务器时，这些更改会自动恢复。

## 工具授权（可选）

Claude Super Monitor 可以拦截工具调用，在 Claude 执行前请求你的批准：

1. 启动 `claude-super-monitor`
2. 工具会自动在 Claude 设置中配置钩子
3. 当 Claude 尝试运行 Bash 命令、写入文件或编辑代码时：
   - Web UI 中会出现一个对话框
   - 你点击 **批准** 或 **拒绝**
   - Claude 相应地继续或取消

钩子脚本在 Windows 上使用 PowerShell，60 秒后超时（默认拒绝）。

### AskUserQuestion 支持

当 Claude 使用 `AskUserQuestion` 向你提问时：

1. 问题会作为对话框出现在 Web UI 中
2. 选择一个或多个选项（或输入自定义答案）
3. 提交以继续对话
4. 答案会自动发送回 Claude

这让你可以直接在仪表盘中处理 Claude 的交互式提示，无需切换到 VSCode。

## 开发

```bash
# 克隆仓库
git clone https://github.com/MarioLuLu7/claude-super-monitor.git
cd claude-super-monitor

# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 预览生产构建
npm start
```

## 架构

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Claude Code   │ ──────▶ │   JSONL 文件     │ ──────▶ │   文件监视器     │
│   (VSCode)      │         │  ~/.claude/...   │         │   (Node.js fs)  │
└─────────────────┘         └──────────────────┘         └────────┬────────┘
                                                                   │
                              ┌─────────────────┐                  │
                              │   WebSocket     │ ◀────────────────┘
                              │   服务器 (5998) │
                              │   /api/hook     │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │   Vue 3 + Vite  │
                              │   仪表盘        │
                              │   localhost:5999│
                              └─────────────────┘
```

## 故障排除

### "dist/ not found" 错误

先运行 `npm run build` 构建前端。

### 没有显示会话

- 确保 Claude Code 扩展正在 VSCode 中运行
- 检查 `~/.claude/projects/` 是否存在
- 验证 VSCode 窗口是否活动（检查 `~/.claude/ide/` 中的锁文件）
- **注意**：此工具仅适用于 Windows 上的 VSCode Claude 扩展

### WebSocket 连接问题

- 确保端口 5998 没有被其他应用占用
- 检查浏览器控制台中的连接错误
- 尝试刷新页面

### 钩子未触发

- 验证 PowerShell 可用（Windows）
- 检查 `~/.claude/settings.json` 中的 `PreToolUse` 钩子配置
- 确保钩子路径指向 npm 包中的正确位置

## 许可证

MIT © MarioLuLu7

## 贡献

欢迎提交 PR！重大更改请先开 issue 讨论。

---

为 Claude Code 社区用 ❤️ 制作。

# Hook 配置说明

将以下内容添加到 `~/.claude/settings.json`（macOS/Linux）或 `%USERPROFILE%\.claude\settings.json`（Windows）的 `hooks` 字段，即可在 Web UI 中拦截所有工具调用，点击批准/拒绝后 Claude 才继续执行。

## 自动配置（推荐）

启动 `claude-super-monitor` 时会自动注入 Hook 配置，无需手动修改。

## 手动配置

### macOS / Linux

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$HOME/.nvm/versions/node/$(node -v)/lib/node_modules/claude-super-monitor/hooks/pre-tool-use.js\""
          }
        ]
      }
    ]
  }
}
```

或找到实际安装路径：

```bash
# 查找全局安装路径
npm root -g
# 例如输出: /usr/local/lib/node_modules
# Hook 路径: /usr/local/lib/node_modules/claude-super-monitor/hooks/pre-tool-use.js
```

### Windows

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\node_modules\\claude-super-monitor\\hooks\\pre-tool-use.js\""
          }
        ]
      }
    ]
  }
}
```

> **注意**：路径根据实际安装位置调整。

## 只拦截危险工具（推荐）

如果不想拦截所有工具，只拦截 `Bash` / `Write` / `Edit`：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/path/to/claude-super-monitor/hooks/pre-tool-use.js\""
          }
        ]
      }
    ]
  }
}
```

## 自定义端口

如果需要通过环境变量自定义端口（默认 5998）：

```bash
# 启动时指定端口
set CLAUDE_SUPER_MONITOR_WS_PORT=6000
claude-super-monitor
```

Hook 脚本会自动读取相同的环境变量来连接正确的端口。

## 工作流程

1. `npm run dev` 启动 Claude Monitor
2. Claude Code 运行时触发工具调用
3. Hook 脚本将请求发送到 `http://localhost:5998/api/hook`
4. Web UI 弹出授权对话框，显示工具名称和详情
5. 点击 **APPROVE** → Claude 继续；点击 **DENY** → Claude 取消该步骤
6. 60 秒无响应 → 自动拒绝（可在 `pre-tool-use.js` 中改为自动批准）

## 跨平台说明

Hook 脚本使用纯 Node.js 编写，兼容：
- ✅ Windows 10/11
- ✅ macOS
- ✅ Linux

Node.js 版本要求：≥ 18

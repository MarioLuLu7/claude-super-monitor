# Hook 配置说明

将以下内容添加到 `%USERPROFILE%\.claude\settings.json` 的 `hooks` 字段，
即可在 Web UI 中拦截所有工具调用，点击批准/拒绝后 Claude 才继续执行。

## settings.json 配置

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "powershell -ExecutionPolicy Bypass -File \"D:\\code\\Script\\web\\hooks\\pre-tool-use.ps1\""
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
            "command": "powershell -ExecutionPolicy Bypass -File \"D:\\code\\Script\\web\\hooks\\pre-tool-use.ps1\""
          }
        ]
      }
    ]
  }
}
```

## 工作流程

1. `npm run dev` 启动 Claude Monitor
2. Claude Code 运行时触发工具调用
3. Hook 脚本将请求发送到 `http://localhost:3001/api/hook`
4. Web UI 弹出授权对话框，显示工具名称和详情
5. 点击 **APPROVE** → Claude 继续；点击 **DENY** → Claude 取消该步骤
6. 60 秒无响应 → 自动拒绝（可在 `pre-tool-use.ps1` 中改为自动批准）

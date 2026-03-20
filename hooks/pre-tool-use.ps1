# Claude Code PreToolUse Hook
# 将工具授权请求转发给 Claude Monitor Web UI
# 配置方法见 hooks/README.md

param()

$API = "http://localhost:3001/api/hook"
$TIMEOUT_SEC = 65   # 略大于服务端 60s 超时

# 设置 UTF-8 编码，确保中文不乱码
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 从 stdin 读取 Claude Code 传入的 JSON
$stdinData = [Console]::In.ReadToEnd().Trim()

# 如果没有数据，直接放行
if (-not $stdinData) { exit 0 }

try {
    $response = Invoke-RestMethod `
        -Uri $API `
        -Method POST `
        -Body $stdinData `
        -ContentType "application/json; charset=utf-8" `
        -TimeoutSec $TIMEOUT_SEC `
        -ErrorAction Stop

    if ($response.decision -eq "approve") {
        exit 0
    } else {
        # 写入 stderr，Claude 会显示给用户
        [Console]::Error.WriteLine("[Monitor] Tool blocked by user via Web UI")
        exit 2
    }
} catch {
    # 服务未启动或超时 → 默认放行，不影响正常使用
    exit 0
}

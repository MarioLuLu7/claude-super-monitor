# Claude Code PreToolUse Hook
# 将工具授权请求转发给 Claude Monitor Web UI
# 配置方法见 hooks/README.md

param()

$API = "http://localhost:5998/api/hook"
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
        # 放行
        exit 0
    } elseif ($response.decision -eq "block" -and $response.reason) {
        # AskUserQuestion 答案：decision 明确为 "block" 且有 reason
        # 将非 ASCII 字符转为 \uXXXX 转义，输出纯 ASCII JSON 给 Claude Code
        $reason = [string]$response.reason
        $sb = New-Object System.Text.StringBuilder
        $null = $sb.Append('"')
        foreach ($c in $reason.ToCharArray()) {
            $code = [int]$c
            if    ($c -eq '"')      { $null = $sb.Append('\"') }
            elseif ($c -eq '\')    { $null = $sb.Append('\\') }
            elseif ($code -eq 10)  { $null = $sb.Append('\n') }
            elseif ($code -eq 13)  { $null = $sb.Append('\r') }
            elseif ($code -gt 127) { $null = $sb.Append(('\u{0:x4}' -f $code)) }
            else                   { $null = $sb.Append($c) }
        }
        $null = $sb.Append('"')
        $output = '{"decision":"block","reason":' + $sb.ToString() + '}'
        [Console]::Out.WriteLine($output)
        exit 2
    } else {
        # 普通拒绝（deny）或超时 deny → 写 stderr，退出 2
        [Console]::Error.WriteLine("[Monitor] Tool blocked by user via Web UI")
        exit 2
    }
} catch {
    # 服务未启动或超时 → 默认放行，不影响正常使用
    exit 0
}

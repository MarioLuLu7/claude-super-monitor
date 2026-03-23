export const zh = {
  // ── 工具状态（服务端 key） ──
  tool_bash:        '执行脚本',
  tool_write:       '写入文件',
  tool_read:        '读取文件',
  tool_edit:        '更新文件',
  tool_multiedit:   '多处编辑',
  tool_glob:        '搜索文件',
  tool_grep:        '搜索内容',
  tool_todo:        '更新任务列表',
  tool_agent:       '启动子代理',
  tool_webfetch:    '请求网页',
  tool_websearch:   '搜索网络',
  tool_exit_plan:   '生成计划',
  tool_enter_plan:  '进入规划模式',
  tool_ask_user:    '等待用户选择',
  tool_notebook:    '编辑 Notebook',
  tool_call:        '调用工具',
  status_thinking:  '思考中',
  status_done:      '已完成回复',
  status_user_input:'用户输入',
  status_auth_req:  '需要用户确认',
  status_auth_deny: '需要用户授权',
  status_interrupted: '已中断',

  // ── UI ──
  timeline_title:   '执行历史',
  timeline_empty:   '暂无记录',
  status_idle:      '等待中',
  collapse_tip:     '折叠到通知栏',
  empty_no_session: '没有活跃的 VSCode 会话',
  empty_hint:       '打开 VSCode + Claude Code 后自动显示',
  empty_all_done:   '所有会话已完成',
  empty_restore:    '点击顶部通知栏可重新打开',

  // ── 设置面板 ──
  settings_auto_approve_desc:   '收到工具调用请求时自动批准，不显示弹框',
  settings_language_desc:       '界面语言',
  settings_show_thinking_desc:  '思考中状态是否在历史记录里展示思考内容',
  settings_collapse_delay_desc: '会话完成后多久自动折叠（0 = 不自动关闭）',
  settings_save:                '保存并关闭',

  // ── 游戏模式 ──
  switch_to_game:      '🎮 游戏模式',
  switch_to_normal:    '📊 普通模式',
  loading_game:        '加载游戏',
  game_room:           '游戏房间',
  game:                '游戏',
  normal:              '普通',
} as const;

export type I18nKey = keyof typeof zh;

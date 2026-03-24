import type { I18nKey } from './zh';

export const en: Record<I18nKey, string> = {
  // ── Tool status ──
  tool_bash:        'Run Shell',
  tool_write:       'Write File',
  tool_read:        'Read File',
  tool_edit:        'Edit File',
  tool_multiedit:   'Multi Edit',
  tool_glob:        'Glob Search',
  tool_grep:        'Grep Search',
  tool_todo:        'Update Todos',
  tool_agent:       'Spawn Agent',
  tool_webfetch:    'Fetch URL',
  tool_websearch:   'Web Search',
  tool_exit_plan:   'Generate Plan',
  tool_enter_plan:  'Enter Plan Mode',
  tool_ask_user:    'Waiting for Input',
  tool_notebook:    'Edit Notebook',
  tool_call:        'Call Tool',
  status_thinking:  'Thinking',
  status_done:      'Reply Done',
  status_user_input:'User Input',
  status_auth_req:  'Needs Approval',
  status_auth_deny: 'Auth Denied',
  status_interrupted: 'Interrupted',

  // ── UI ──
  timeline_title:   'History',
  timeline_empty:   'No records',
  status_idle:      'Idle',
  collapse_tip:     'Collapse',
  empty_no_session: 'No active VSCode sessions',
  empty_hint:       'Open VSCode + Claude Code to start',
  empty_all_done:   'All sessions completed',
  empty_restore:    'Click notification bar to restore',

  // ── Settings panel ──
  settings_auto_approve_desc:   'Auto-approve tool calls without confirmation dialog',
  settings_language_desc:       'Interface language',
  settings_show_thinking_desc:  'Show thinking content in history when in thinking state',
  settings_collapse_delay_desc: 'Seconds before auto-collapsing completed sessions (0 = never)',
  settings_save:                'Save & Close',

  // ── Game mode ──
  switch_to_game:      "Claude's Adventure",
  switch_to_normal:    'Text Mode',
  loading_game:        'Loading Game',
  game_room:           'Game Room',
  game:                "Claude's Adventure",
  normal:              'Text Mode',
};

import fs from 'fs';
import path from 'path';

const SETTINGS_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude',
  'settings.json',
);

// 我们注入的标记，用于识别/清理
const HOOK_MARKER = '__claude-monitor-hook__';
const HOOK_MATCHER = 'Bash|Write|Edit|MultiEdit|AskUserQuestion';

const WILDCARD_PERMISSIONS = [
  'Bash(*)',
  'Write(*)',
  'Edit(*)',
  'MultiEdit(*)',
];

function getHookCommand(pkgRoot: string): string {
  // 统一使用 Node.js 版本（跨平台）
  const scriptPath = path.join(pkgRoot, 'hooks', 'pre-tool-use.js');
  return `node "${scriptPath}"`;
}

function loadSettings(): Record<string, unknown> {
  if (!fs.existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8')); }
  catch { return {}; }
}

function saveSettings(data: Record<string, unknown>) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export function injectSettings(pkgRoot = process.cwd()) {
  const settings = loadSettings();

  // ── 1. 写入通配符白名单（跳过 VSCode 弹窗）───────────────────────────────
  const perms = (settings.permissions ?? {}) as Record<string, unknown>;
  const allow = Array.isArray(perms.allow) ? (perms.allow as string[]) : [];

  let allowChanged = false;
  for (const p of WILDCARD_PERMISSIONS) {
    if (!allow.includes(p)) { allow.unshift(p); allowChanged = true; }
  }
  if (allowChanged) {
    perms.allow = allow;
    settings.permissions = perms;
  }

  // ── 2. 写入 PreToolUse Hook ───────────────────────────────────────────────
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const preToolUse = Array.isArray(hooks.PreToolUse)
    ? (hooks.PreToolUse as Array<Record<string, unknown>>)
    : [];

  const existingIdx = preToolUse.findIndex(
    (h) => JSON.stringify(h).includes(HOOK_MARKER),
  );

  let hookChanged = false;
  if (existingIdx === -1) {
    // 首次注入
    preToolUse.unshift({
      _comment: HOOK_MARKER,
      matcher: HOOK_MATCHER,
      hooks: [{ type: 'command', command: getHookCommand(pkgRoot) }],
    });
    hooks.PreToolUse = preToolUse;
    settings.hooks = hooks;
    hookChanged = true;
  } else if (preToolUse[existingIdx].matcher !== HOOK_MATCHER) {
    // matcher 过期，更新
    preToolUse[existingIdx] = {
      ...preToolUse[existingIdx],
      matcher: HOOK_MATCHER,
      hooks: [{ type: 'command', command: getHookCommand(pkgRoot) }],
    };
    hooks.PreToolUse = preToolUse;
    settings.hooks = hooks;
    hookChanged = true;
  }

  if (allowChanged || hookChanged) {
    saveSettings(settings);
    console.log('\x1b[32m[Claude Monitor] settings.json 已注入白名单 & Hook\x1b[0m');
  }
}

export function restoreSettings() {
  try {
    const settings = loadSettings();

    // 移除通配符白名单
    const perms = (settings.permissions ?? {}) as Record<string, unknown>;
    let permsChanged = false;
    if (Array.isArray(perms.allow)) {
      const filtered = (perms.allow as string[]).filter(
        (p) => !WILDCARD_PERMISSIONS.includes(p),
      );
      if (filtered.length !== (perms.allow as string[]).length) {
        perms.allow = filtered;
        settings.permissions = perms;
        permsChanged = true;
      }
    }

    // 移除我们注入的 Hook
    const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
    let hooksChanged = false;
    if (Array.isArray(hooks.PreToolUse)) {
      const originalLength = (hooks.PreToolUse as Array<Record<string, unknown>>).length;
      hooks.PreToolUse = (hooks.PreToolUse as Array<Record<string, unknown>>).filter(
        (h) => !JSON.stringify(h).includes(HOOK_MARKER),
      );
      if ((hooks.PreToolUse as Array<Record<string, unknown>>).length !== originalLength) {
        hooksChanged = true;
        if ((hooks.PreToolUse as unknown[]).length === 0) delete hooks.PreToolUse;
        if (Object.keys(hooks).length === 0) delete settings.hooks;
        else settings.hooks = hooks;
      }
    }

    if (permsChanged || hooksChanged) {
      saveSettings(settings);
    }
  } catch (e) {
    console.error('[Claude Monitor] 还原 settings.json 失败:', e);
  }
}

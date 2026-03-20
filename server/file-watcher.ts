import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createReadStream } from 'fs';
import { getActiveProjectNames } from './ide-detector';

const BASE_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.claude',
  'projects'
);

export interface Project {
  name: string;
  originalPath: string;
  latestMtime: Date;
  sessions: Session[];
  activeInIde: boolean;   // 当前是否在 VSCode 中打开
}

export interface Session {
  id: string;
  mtime: Date;
  size: number;
}

export type StatusLevel = 'thinking' | 'working' | 'done' | 'auth' | 'error' | 'idle';

export interface StatusItem {
  id: string;
  timestamp: string;
  level: StatusLevel;
  key: string;    // i18n translation key
  detail?: string;
}

// ─── 工具名 → 状态映射 ────────────────────────────────────────────────────────
const TOOL_MAP: Record<string, (input: Record<string, unknown>) => { key: string; detail?: string; level: StatusLevel }> = {
  Bash: (i) => {
    const desc = String(i.description ?? '').trim();
    const cmd  = String(i.command ?? '').split('\n')[0].slice(0, 80);
    const detail = desc ? `${desc} · ${cmd}` : cmd;
    return { level: 'working', key: 'tool_bash', detail };
  },
  Write:     (i) => ({ level: 'working', key: 'tool_write',      detail: shortPath(String(i.file_path ?? '')) }),
  Read:      (i) => ({ level: 'working', key: 'tool_read',       detail: shortPath(String(i.file_path ?? '')) }),
  Edit:      (i) => ({ level: 'working', key: 'tool_edit',       detail: shortPath(String(i.file_path ?? '')) }),
  MultiEdit: (i) => ({ level: 'working', key: 'tool_multiedit',  detail: shortPath(String(i.file_path ?? '')) }),
  Glob:      (i) => ({ level: 'working', key: 'tool_glob',       detail: String(i.pattern ?? '') }),
  Grep:      (i) => ({ level: 'working', key: 'tool_grep',       detail: String(i.pattern ?? '') }),
  TodoWrite: ()  => ({ level: 'working', key: 'tool_todo' }),
  Agent:     (i) => ({ level: 'working', key: 'tool_agent',      detail: String(i.description ?? '') }),
  WebFetch:  (i) => ({ level: 'working', key: 'tool_webfetch',   detail: String(i.url ?? '').slice(0, 60) }),
  WebSearch: (i) => ({ level: 'working', key: 'tool_websearch',  detail: String(i.query ?? '') }),
  ExitPlanMode:    () => ({ level: 'working', key: 'tool_exit_plan' }),
  EnterPlanMode:   () => ({ level: 'working', key: 'tool_enter_plan' }),
  AskUserQuestion: (i) => {
    const question = String(i.question ?? '').trim();
    const options = Array.isArray(i.options)
      ? (i.options as string[]).join(' / ')
      : '';
    const detail = options ? `${question}  [${options}]` : question;
    return { level: 'auth', key: 'tool_ask_user', detail: detail.slice(0, 120) || undefined };
  },
  NotebookEdit: (i) => ({ level: 'working', key: 'tool_notebook', detail: shortPath(String(i.notebook_path ?? '')) }),
};

function shortPath(p: string) {
  return p.replace(/\\/g, '/').split('/').slice(-2).join('/');
}

/**
 * 剥除 Claude Code 注入到 user 消息里的系统标签内容，
 * 例如 <ide_opened_file>…</ide_opened_file>、<system-reminder>…</system-reminder>
 * 只保留用户实际输入的纯文本。
 */
function stripInjections(text: string): string {
  return text
    .replace(/<[a-z_][a-z0-9_-]*(?:\s[^>]*)?>[\s\S]*?<\/[a-z_][a-z0-9_-]*>/gi, '')
    .trim();
}

// ─── 解析单行 JSONL → StatusItem[] ───────────────────────────────────────────
export function parseStatusItems(line: string): StatusItem[] {
  try {
    const msg = JSON.parse(line) as Record<string, unknown>;
    const ts = String(msg.timestamp ?? new Date().toISOString());

    if (msg.type === 'assistant') {
      const msgObj = msg.message as Record<string, unknown> | undefined;
      const content = msgObj?.content;
      const items: StatusItem[] = [];

      if (Array.isArray(content)) {
        let hasThinking = false;
        let hasToolUse = false;
        let hasText = false;
        let thinkingText = '';

        for (const c of content as Array<Record<string, unknown>>) {
          if (c.type === 'thinking') {
            hasThinking = true;
            thinkingText += String(c.thinking ?? '');
          } else if (c.type === 'tool_use') {
            hasToolUse = true;
            const toolName = String(c.name ?? '');
            const input = (c.input ?? {}) as Record<string, unknown>;
            const mapper = TOOL_MAP[toolName];
            const mapped = mapper
              ? mapper(input)
              : { level: 'working' as StatusLevel, key: 'tool_call', detail: toolName };
            items.push({
              id: String(c.id ?? `${ts}-${toolName}`),
              timestamp: ts,
              ...mapped,
            });
          } else if (c.type === 'text' && String(c.text ?? '').trim()) {
            hasText = true;
          }
        }

        // 有思考但无工具无文本 → 思考中
        if (hasThinking && !hasToolUse && !hasText) {
          const detail = thinkingText.trim().replace(/\n+/g, ' ').slice(0, 200) || undefined;
          items.push({ id: `${ts}-thinking`, timestamp: ts, level: 'thinking', key: 'status_thinking', detail });
        }
        // 有文本内容 → 已完成回复（带内容摘要）
        if (hasText) {
          let replyText = '';
          for (const c of content as Array<Record<string, unknown>>) {
            if (c.type === 'text') replyText += String(c.text ?? '');
          }
          const detail = replyText.trim().replace(/\n+/g, ' ').slice(0, 200) || undefined;
          items.push({ id: `${ts}-done`, timestamp: ts, level: 'done', key: 'status_done', detail });
        }
      } else if (typeof content === 'string' && content.trim()) {
        // content 为字符串 → 已完成回复
        const detail = content.trim().replace(/\n+/g, ' ').slice(0, 200) || undefined;
        items.push({ id: `${ts}-done`, timestamp: ts, level: 'done', key: 'status_done', detail });
      }
      return items;
    }

    // user 消息：文本输入 + tool_result 授权拒绝
    if (msg.type === 'user') {
      const msgObj = msg.message as Record<string, unknown> | undefined;
      const content = msgObj?.content;
      if (Array.isArray(content)) {
        for (const c of content as Array<Record<string, unknown>>) {
          // 用户输入文本
          if (c.type === 'text') {
            const text = stripInjections(String(c.text ?? ''));
            if (text) {
              const lower = text.toLowerCase();
              if (lower.includes('request interrupted') || lower.includes('interrupted by user')) {
                return [{ id: `${ts}-interrupted`, timestamp: ts, level: 'done', key: 'status_interrupted', detail: text.slice(0, 80) }];
              }
              const detail = text.replace(/\n+/g, ' ').slice(0, 200) || undefined;
              return [{ id: `${ts}-user`, timestamp: ts, level: 'idle', key: 'status_user_input', detail }];
            }
          }
          // tool_result 授权拒绝
          if (c.type === 'tool_result') {
            const resultContent = c.content;
            const text = Array.isArray(resultContent)
              ? (resultContent as Array<Record<string, unknown>>).map(x => String(x.text ?? '')).join('')
              : String(resultContent ?? '');
            if (text.toLowerCase().includes('permission') || text.includes('denied') || text.includes('授权')) {
              return [{ id: `${ts}-auth`, timestamp: ts, level: 'auth', key: 'status_auth_deny', detail: text.slice(0, 80) }];
            }
          }
        }
      } else if (typeof content === 'string') {
        const text = stripInjections(content);
        if (text) {
          const lower = text.toLowerCase();
          if (lower.includes('request interrupted') || lower.includes('interrupted by user')) {
            return [{ id: `${ts}-interrupted`, timestamp: ts, level: 'done', key: 'status_interrupted', detail: text.slice(0, 80) }];
          }
          const detail = text.replace(/\n+/g, ' ').slice(0, 200) || undefined;
          return [{ id: `${ts}-user`, timestamp: ts, level: 'idle', key: 'status_user_input', detail }];
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}

// ─── FileWatcher 类 ───────────────────────────────────────────────────────────
export class FileWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private filePositions = new Map<string, number>();

  getProjects(): Project[] {
    if (!fs.existsSync(BASE_DIR)) return [];
    const activeNames = getActiveProjectNames();
    return fs
      .readdirSync(BASE_DIR)
      .filter((n) => fs.statSync(path.join(BASE_DIR, n)).isDirectory())
      .map((n) => {
        const sessions = this.getSessionsInDir(path.join(BASE_DIR, n));
        const latestMtime = sessions[0]?.mtime ?? new Date(0);
        const originalPath = n.replace(/^([A-Za-z])--/, '$1:\\').replace(/--/g, '\\');
        const activeInIde = activeNames.has(n);
        return { name: n, originalPath, latestMtime, sessions, activeInIde };
      })
      .sort((a, b) => {
        // 活跃的优先，其次按最新修改时间
        if (a.activeInIde !== b.activeInIde) return a.activeInIde ? -1 : 1;
        return b.latestMtime.getTime() - a.latestMtime.getTime();
      });
  }

  private getSessionsInDir(dir: string): Session[] {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl') && !f.includes('subagent'))
      .map((f) => {
        const stat = fs.statSync(path.join(dir, f));
        return { id: f.replace('.jsonl', ''), mtime: stat.mtime, size: stat.size };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  /** 从 JSONL 头部读取第一条真实用户输入，作为会话标题 */
  getSessionTitle(projectName: string, sessionId: string): string {
    const filePath = path.join(BASE_DIR, projectName, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return '';
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as Record<string, unknown>;
        if (msg.type !== 'user') continue;
        const content = (msg.message as Record<string, unknown>)?.content;
        if (Array.isArray(content)) {
          for (const c of content as Array<Record<string, unknown>>) {
            if (c.type === 'text') {
              const text = stripInjections(String(c.text ?? ''));
              if (text) return text.replace(/\n+/g, ' ').slice(0, 80);
            }
          }
        } else if (typeof content === 'string') {
          const text = stripInjections(content);
          if (text) return text.replace(/\n+/g, ' ').slice(0, 80);
        }
      } catch { /* skip */ }
    }
    return '';
  }

  /** 估算会话 token 数（用文件字节数 / 4 粗估，含 JSON 结构开销） */
  getSessionTokens(projectName: string, sessionId: string): number {
    const filePath = path.join(BASE_DIR, projectName, `${sessionId}.jsonl`);
    try { return Math.round(fs.statSync(filePath).size / 4); }
    catch { return 0; }
  }

  getStatusHistory(projectName: string, sessionId: string): StatusItem[] {
    const filePath = path.join(BASE_DIR, projectName, `${sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((l) => l.trim());
    const all: StatusItem[] = [];
    for (const l of lines) {
      for (const s of parseStatusItems(l)) all.push(s);
    }
    return all;
  }

  watch(projectName: string, sessionId: string, onStatus: (item: StatusItem) => void) {
    const filePath = path.join(BASE_DIR, projectName, `${sessionId}.jsonl`);
    const key = `${projectName}/${sessionId}`;
    if (this.watchers.has(key) || !fs.existsSync(filePath)) return;

    this.filePositions.set(filePath, fs.statSync(filePath).size);

    const watcher = fs.watch(filePath, (evt) => {
      if (evt !== 'change') return;
      const currentSize = fs.statSync(filePath).size;
      const lastPos = this.filePositions.get(filePath) ?? 0;
      if (currentSize <= lastPos) { this.filePositions.set(filePath, currentSize); return; }

      const rl = readline.createInterface({
        input: createReadStream(filePath, { start: lastPos }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        for (const item of parseStatusItems(line)) onStatus(item);
      });
      this.filePositions.set(filePath, currentSize);
    });

    this.watchers.set(key, watcher);
  }

  unwatch(projectName: string, sessionId: string) {
    const key = `${projectName}/${sessionId}`;
    this.watchers.get(key)?.close();
    this.watchers.delete(key);
  }

  stopAll() {
    this.watchers.forEach((w) => w.close());
    this.watchers.clear();
  }
}

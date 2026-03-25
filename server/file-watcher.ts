import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { createReadStream } from 'fs';
import { getActiveProjectNames, getCliActiveSessions } from './ide-detector';

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
  activeInCli: boolean;   // 当前是否有 CLI 活跃会话
}

export interface Session {
  id: string;
  mtime: Date;
  size: number;
}

export type StatusLevel = 'thinking' | 'working' | 'responding' | 'done' | 'auth' | 'error' | 'idle';

export interface QuestionOption { label: string; description?: string }
export interface AskQuestion { question: string; header: string; options: QuestionOption[]; multiSelect?: boolean }

export interface StatusItem {
  id: string;
  timestamp: string;
  level: StatusLevel;
  key: string;    // i18n translation key
  detail?: string;
  questionData?: { toolUseId: string; questions: AskQuestion[] };
}

// ─── 工具名 → 状态映射 ────────────────────────────────────────────────────────
const TOOL_MAP: Record<string, (input: Record<string, unknown>) => { key: string; detail?: string; level: StatusLevel; questionData?: StatusItem['questionData'] }> = {
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
    const questions = Array.isArray(i.questions) ? (i.questions as Array<Record<string, unknown>>) : [];
    const first = questions[0];
    const question = first ? String(first.question ?? '').trim() : '';
    const opts = Array.isArray(first?.options) ? (first.options as Array<Record<string, unknown>>).map(o => String(o.label ?? '')).join(' / ') : '';
    const detail = (opts ? `${question}  [${opts}]` : question).slice(0, 120) || undefined;
    return { level: 'auth', key: 'tool_ask_user', detail };
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
            const toolUseId = String(c.id ?? `${ts}-${toolName}`);
            const mapper = TOOL_MAP[toolName];
            const mapped = mapper
              ? mapper(input)
              : { level: 'working' as StatusLevel, key: 'tool_call', detail: toolName };
            // For AskUserQuestion, attach full question data
            let questionData: StatusItem['questionData'] = mapped.questionData;
            if (toolName === 'AskUserQuestion' && Array.isArray(input.questions)) {
              questionData = {
                toolUseId,
                questions: (input.questions as Array<Record<string, unknown>>).map(q => ({
                  question: String(q.question ?? ''),
                  header: String(q.header ?? ''),
                  multiSelect: Boolean(q.multiSelect ?? false),
                  options: Array.isArray(q.options)
                    ? (q.options as Array<Record<string, unknown>>).map(o => ({
                        label: String(o.label ?? ''),
                        description: o.description !== undefined ? String(o.description) : undefined,
                      }))
                    : [],
                })),
              };
            }
            items.push({
              id: toolUseId,
              timestamp: ts,
              ...mapped,
              ...(questionData ? { questionData } : {}),
            });
          } else if (c.type === 'text' && String(c.text ?? '').trim()) {
            hasText = true;
          }
        }

        // 有思考 → 暂存思考内容（不单独发送，后面和文本合并）
        let thinkingDetail: string | undefined;
        if (hasThinking) {
          thinkingDetail = thinkingText.trim().replace(/\n+/g, ' ').slice(0, 100) || undefined;
        }
        // 有文本内容 → 回复中（带内容摘要，如果有思考则合并）
        if (hasText) {
          let replyText = '';
          for (const c of content as Array<Record<string, unknown>>) {
            if (c.type === 'text') replyText += String(c.text ?? '');
          }
          let detail = replyText.trim().replace(/\n+/g, ' ').slice(0, 200) || undefined;
          // 如果有思考内容，合并到 detail 中显示
          if (thinkingDetail && detail) {
            detail = `[思考] ${thinkingDetail} | ${detail}`;
          } else if (thinkingDetail) {
            detail = `[思考] ${thinkingDetail}`;
          }
          items.push({ id: `${ts}-responding`, timestamp: ts, level: 'responding', key: 'status_responding', detail });
        } else if (hasThinking) {
          // 只有思考没有文本 → 发送思考状态（会在下一条消息时转为 done）
          items.push({ id: `${ts}-thinking`, timestamp: ts, level: 'thinking', key: 'status_thinking', detail: thinkingDetail });
        }
        // 有工具调用但没有文本回复 → 继续等待
        if (hasToolUse && !hasText) {
          // 不发送 done，继续等待后续文本回复
        }
      } else if (typeof content === 'string' && content.trim()) {
        // content 为字符串 → 回复中（会在收到下一条消息时自动转为 done）
        const detail = content.trim().replace(/\n+/g, ' ').slice(0, 200) || undefined;
        items.push({ id: `${ts}-responding`, timestamp: ts, level: 'responding', key: 'status_responding', detail });
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
  // 追踪每个会话的最后一条 responding 状态
  private pendingResponding = new Map<string, StatusItem>();
  // 静默检测定时器
  private silenceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // 静默检测超时（毫秒）：10秒
  private static readonly SILENCE_TIMEOUT = 10000;

  getProjects(): Project[] {
    if (!fs.existsSync(BASE_DIR)) return [];
    const activeNames = getActiveProjectNames();
    const cliSessions = getCliActiveSessions();
    const cliProjectNames = new Set(cliSessions.map(s => s.projectName));

    return fs
      .readdirSync(BASE_DIR)
      .filter((n) => fs.statSync(path.join(BASE_DIR, n)).isDirectory())
      .map((n) => {
        const sessions = this.getSessionsInDir(path.join(BASE_DIR, n));
        const latestMtime = sessions[0]?.mtime ?? new Date(0);
        const isWin = process.platform === 'win32';
        const originalPath = isWin
          ? n.replace(/^([A-Za-z])--/, '$1:\\').replace(/--/g, '\\')
          : '/' + n.replace(/--/g, '/');
        const activeInIde = activeNames.has(n);
        const activeInCli = cliProjectNames.has(n);
        return { name: n, originalPath, latestMtime, sessions, activeInIde, activeInCli };
      })
      .sort((a, b) => {
        // 活跃的优先（IDE 或 CLI），其次按最新修改时间
        const aActive = a.activeInIde || a.activeInCli;
        const bActive = b.activeInIde || b.activeInCli;
        if (aActive !== bActive) return aActive ? -1 : 1;
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
    // 历史记录中，最后一条如果是 responding 或 thinking，转为 done（会话已结束）
    const last = all[all.length - 1];
    if (last && (last.level === 'responding' || last.level === 'thinking')) {
      all[all.length - 1] = { ...last, level: 'done', key: 'status_done' };
    }
    return all;
  }

  watch(projectName: string, sessionId: string, onStatus: (item: StatusItem) => void) {
    const filePath = path.join(BASE_DIR, projectName, `${sessionId}.jsonl`);
    const key = `${projectName}/${sessionId}`;
    if (this.watchers.has(key) || !fs.existsSync(filePath)) return;

    this.filePositions.set(filePath, fs.statSync(filePath).size);

    // 辅助函数：将 pending responding 转为 done 并发送
    const flushPendingResponding = () => {
      const pending = this.pendingResponding.get(key);
      if (pending) {
        const doneItem: StatusItem = { ...pending, level: 'done', key: 'status_done' };
        onStatus(doneItem);
        this.pendingResponding.delete(key);
      }
    };

    // 辅助函数：取消静默检测定时器
    const cancelSilenceTimer = () => {
      const timer = this.silenceTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.silenceTimers.delete(key);
      }
    };

    // 辅助函数：启动静默检测定时器（10秒）
    const startSilenceTimer = () => {
      cancelSilenceTimer();
      const timer = setTimeout(() => {
        flushPendingResponding();
        this.silenceTimers.delete(key);
      }, FileWatcher.SILENCE_TIMEOUT);
      this.silenceTimers.set(key, timer);
    };

    const watcher = fs.watch(filePath, (evt) => {
      if (evt !== 'change') return;
      const currentSize = fs.statSync(filePath).size;
      const lastPos = this.filePositions.get(filePath) ?? 0;
      if (currentSize <= lastPos) { this.filePositions.set(filePath, currentSize); return; }

      // File changed

      const rl = readline.createInterface({
        input: createReadStream(filePath, { start: lastPos }),
        crlfDelay: Infinity,
      });
      rl.on('line', (line) => {
        if (!line.trim()) return;
        // Parsing line

        // 先解析消息类型
        let msgType: string | undefined;
        try {
          const msg = JSON.parse(line) as Record<string, unknown>;
          msgType = String(msg.type ?? '');
        } catch { /* ignore */ }

        // 如果是 user 或 assistant 消息，先把之前的 responding 标记为 done
        if (msgType === 'user' || msgType === 'assistant') {
          cancelSilenceTimer();
          flushPendingResponding();
        }

        for (const item of parseStatusItems(line)) {
          // Status item processed

          // 如果是 responding 或 thinking 状态，保存并启动静默检测
          if (item.level === 'responding' || item.level === 'thinking') {
            this.pendingResponding.set(key, item);
            onStatus(item);
            startSilenceTimer();
          } else {
            onStatus(item);
          }
        }
      });
      this.filePositions.set(filePath, currentSize);
    });

    this.watchers.set(key, watcher);
  }

  unwatch(projectName: string, sessionId: string) {
    const key = `${projectName}/${sessionId}`;
    // 取消静默检测定时器
    const timer = this.silenceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.silenceTimers.delete(key);
    }
    // 清理 pending 状态
    this.pendingResponding.delete(key);
    this.watchers.get(key)?.close();
    this.watchers.delete(key);
  }

  stopAll() {
    // 清理所有定时器
    this.silenceTimers.forEach((timer) => clearTimeout(timer));
    this.silenceTimers.clear();
    this.watchers.forEach((w) => w.close());
    this.watchers.clear();
    this.pendingResponding.clear();
  }
}

import http from 'http';
import { WebSocketServer as WSS, WebSocket } from 'ws';
import { FileWatcher } from './file-watcher';
import { watchIdeDir, watchFileHistoryDir, watchProjectDir, getOpenSessionIds, getCliOpenSessionIds, getSessionSource, type SessionSource } from './ide-detector';

/** 将对象序列化为纯 ASCII JSON（非 ASCII 字符转为 \uXXXX），避免 PowerShell 5.1 编码问题 */
function asciiJson(obj: unknown): string {
  return JSON.stringify(obj).replace(/[^\x00-\x7F]/g, c =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

// ── 消息类型 ──────────────────────────────────────────────────────────────────
interface IncomingMsg {
  type: 'authorizeResponse' | 'questionAnswer';
  requestId?: string;
  approved?: boolean;
  answers?: Record<string, string[]>;  // header → 已选 label 数组
}

interface PendingQuestion {
  resolve: (answers: Record<string, string[]>) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingAuth {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

// 服务端维护的活跃会话信息
interface ActiveSession {
  key: string;          // "projectName/sessionId"
  projectName: string;
  sessionId: string;
  displayName: string;  // 简短可读名，如 "Script"
  originalPath: string;
  source: SessionSource; // 会话来源：vscode 或 cli
}

export class WebSocketServer {
  private port: number;
  private httpServer!: http.Server;
  private wss!: WSS;
  private fw = new FileWatcher();
  private clients = new Set<WebSocket>();
  private pendingAuths = new Map<string, PendingAuth>();
  private pendingQuestions = new Map<string, PendingQuestion>();

  // 服务端统一管理活跃会话的 watcher
  private activeSessions = new Map<string, ActiveSession>(); // key → session
  // 监听活跃项目目录，检测新建 JSONL（新建会话）
  private projectWatchers = new Map<string, import('fs').FSWatcher>(); // projectName → watcher

  constructor(port: number) { this.port = port; }

  start() {
    this.httpServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (req.method === 'POST' && req.url === '/api/hook') {
        this.handleHook(req, res);
      } else {
        res.writeHead(404); res.end();
      }
    });

    this.wss = new WSS({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      // 推送当前所有活跃会话的历史
      this.sendAllSessions(ws);

      ws.on('message', (raw) => {
        try { this.handle(ws, JSON.parse(raw.toString()) as IncomingMsg); }
        catch { /* ignore */ }
      });
      ws.on('close', () => this.clients.delete(ws));
    });

    // 启动时扫描活跃会话
    this.refreshActiveSessions();

    // ide 目录变化 → 重新扫描（VSCode 窗口开关）
    watchIdeDir(() => this.refreshActiveSessions());
    // file-history 目录变化 → 重新扫描（VSCode 内新建/切换会话）
    watchFileHistoryDir(() => this.refreshActiveSessions());
    // 定时轮询，处理会话关闭（关闭不产生文件事件）
    setInterval(() => this.refreshActiveSessions(), 30_000);

    this.httpServer.listen(this.port, () => {
      console.log(`\x1b[32m[Claude Monitor] Server on http/ws://localhost:${this.port}\x1b[0m`);
      console.log(`\x1b[33m[Claude Monitor] Hook endpoint: POST http://localhost:${this.port}/api/hook\x1b[0m`);
    });

    this.httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\x1b[31m[Claude Monitor] Port ${this.port} is already in use. Please wait a moment and try again, or kill the process using that port.\x1b[0m`);
        // 尝试优雅关闭
        this.stop();
      } else {
        console.error(`\x1b[31m[Claude Monitor] Server error:`, err.message, '\x1b[0m');
      }
    });
  }

  // ── 活跃会话管理 ────────────────────────────────────────────────────────────
  private refreshActiveSessions() {
    const projects = this.fw.getProjects();
    const newKeys = new Set<string>();

    for (const proj of projects) {
      // 跳过非活跃项目
      if (!proj.activeInIde && !proj.activeInCli) continue;
      const appName = proj.originalPath.replace(/\\/g, '/').split('/').pop() ?? proj.name;

      // 合并 VSCode 和 CLI 会话
      const vscodeIds = proj.activeInIde ? getOpenSessionIds(proj.name) : [];
      const cliIds = proj.activeInCli ? getCliOpenSessionIds(proj.name) : [];
      const allIds = [...new Set([...vscodeIds, ...cliIds])];

      if (!allIds.length) continue;

      for (let idx = 0; idx < allIds.length; idx++) {
        const sessionId = allIds[idx];
        const key = `${proj.name}/${sessionId}`;
        newKeys.add(key);

        if (!this.activeSessions.has(key)) {
          const source = getSessionSource(sessionId);
          const suffix = source === 'cli' ? ' (CLI)' : '';
          const displayName = allIds.length > 1 ? `${appName} #${idx + 1}${suffix}` : appName + suffix;
          // New session detected
          const info: ActiveSession = {
            key, projectName: proj.name, sessionId,
            displayName, originalPath: proj.originalPath, source,
          };
          this.activeSessions.set(key, info);

          this.fw.watch(proj.name, sessionId, (item) => {
            const tokens = this.fw.getSessionTokens(proj.name, sessionId);
            this.broadcast({ type: 'sessionUpdate', key, item, tokens });
            // 有问题数据 → 额外广播 userQuestionRequired
            if (item.questionData) {
              this.broadcast({
                type: 'userQuestionRequired',
                userQuestion: {
                  sessionKey: key,
                  toolUseId: item.questionData.toolUseId,
                  questions: item.questionData.questions,
                },
              });
            }
          });
        }
      }
    }

    // 移除已关闭的会话
    for (const [key, info] of this.activeSessions) {
      if (!newKeys.has(key)) {
        this.fw.unwatch(info.projectName, info.sessionId);
        this.activeSessions.delete(key);
      }
    }

    // 同步项目目录 watcher：新增活跃项目 → 开始监听；项目不再活跃 → 停止监听
    const activeProjects = new Set(Array.from(this.activeSessions.values()).map(s => s.projectName));
    for (const projName of activeProjects) {
      if (!this.projectWatchers.has(projName)) {
        const w = watchProjectDir(projName, () => this.refreshActiveSessions());
        if (w) this.projectWatchers.set(projName, w);
      }
    }
    for (const [projName, w] of this.projectWatchers) {
      if (!activeProjects.has(projName)) {
        w.close();
        this.projectWatchers.delete(projName);
      }
    }

    // 通知所有客户端会话列表已变更
    this.broadcast({ type: 'sessionsChanged', sessions: this.getSessionsMeta() });
  }

  private getSessionsMeta() {
    return Array.from(this.activeSessions.values()).map(({ key, displayName, originalPath, projectName, sessionId }) => ({
      key, displayName, originalPath,
      sessionTitle: this.fw.getSessionTitle(projectName, sessionId),
      tokens: this.fw.getSessionTokens(projectName, sessionId),
    }));
  }

  private sendAllSessions(ws: WebSocket) {
    const sessions = Array.from(this.activeSessions.values()).map((s) => ({
      key: s.key,
      displayName: s.displayName,
      originalPath: s.originalPath,
      sessionTitle: this.fw.getSessionTitle(s.projectName, s.sessionId),
      items: this.fw.getStatusHistory(s.projectName, s.sessionId),
      tokens: this.fw.getSessionTokens(s.projectName, s.sessionId),
    }));
    this.send(ws, { type: 'allSessions', sessions });
  }

  // ── WS 消息处理 ────────────────────────────────────────────────────────────
  private handle(_ws: WebSocket, msg: IncomingMsg) {
    if (msg.type === 'authorizeResponse' && msg.requestId !== undefined) {
      const pending = this.pendingAuths.get(msg.requestId);
      if (pending) {
        pending.resolve(msg.approved === true);
        this.broadcast({ type: 'authorizationHandled', requestId: msg.requestId, approved: msg.approved });
      }
    }
    if (msg.type === 'questionAnswer' && msg.requestId !== undefined) {
      const pending = this.pendingQuestions.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingQuestions.delete(msg.requestId);
        pending.resolve(msg.answers ?? {});
      }
    }
  }

  // ── Hook API ───────────────────────────────────────────────────────────────
  private handleHook(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString(); });
    req.on('end', () => {
      let toolName = 'Unknown';
      let toolInput: Record<string, unknown> = {};
      try {
        const data = JSON.parse(body) as Record<string, unknown>;
        toolName = String(data.tool_name ?? data.toolName ?? 'Unknown');
        toolInput = (data.tool_input ?? data.input ?? {}) as Record<string, unknown>;
      } catch { /* bad JSON */ }

      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // AskUserQuestion 走专门分支
      if (toolName === 'AskUserQuestion') {
        const rawQuestions = Array.isArray(toolInput.questions)
          ? (toolInput.questions as Array<Record<string, unknown>>)
          : [];
        const questions = rawQuestions.map(q => ({
          question: String(q.question ?? ''),
          header: String(q.header ?? ''),
          multiSelect: Boolean(q.multiSelect ?? false),
          options: Array.isArray(q.options)
            ? (q.options as Array<Record<string, unknown>>).map(o => ({
                label: String(o.label ?? ''),
                description: o.description !== undefined ? String(o.description) : undefined,
              }))
            : [],
        }));

        this.broadcast({
          type: 'userQuestionRequired',
          userQuestion: { requestId, sessionKey: '', toolUseId: requestId, questions },
        });

        const timer = setTimeout(() => {
          if (!this.pendingQuestions.has(requestId)) return;
          this.pendingQuestions.delete(requestId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ decision: 'block', reason: 'No answer received (timeout)' }));
        }, 120_000);  // 2 分钟超时

        this.pendingQuestions.set(requestId, {
          timer,
          resolve: (answers) => {
            // 将选择结果格式化为带 header 的清晰文本，让 Claude 明确匹配问题与答案
            const lines = Object.entries(answers).map(([header, labels]) => {
              const value = labels.length === 1 ? labels[0] : labels.join(', ');
              return `[${header}] ${value}`;
            });
            const reason = lines.join('\n') || 'Other';
            // 用纯 ASCII JSON（\uXXXX 转义非 ASCII），避免 PowerShell 5.1 编码问题
            const body = asciiJson({ decision: 'block', reason });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(body);
          },
        });
        return;  // 不走下面的 authorizationRequired 流程
      }

      this.broadcast({
        type: 'authorizationRequired', requestId, toolName, toolInput,
        summary: this.summarize(toolName, toolInput),
      });

      const timer = setTimeout(() => {
        if (!this.pendingAuths.has(requestId)) return;
        this.pendingAuths.delete(requestId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ decision: 'deny', reason: 'timeout' }));
      }, 60_000);

      this.pendingAuths.set(requestId, {
        timer,
        resolve: (approved) => {
          clearTimeout(timer);
          this.pendingAuths.delete(requestId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ decision: approved ? 'approve' : 'deny' }));
        },
      });
    });
  }

  private summarize(tool: string, input: Record<string, unknown>): string {
    const s = (k: string) => String(input[k] ?? '');
    switch (tool) {
      case 'Bash': return s('command').split('\n')[0].slice(0, 120);
      case 'Write': case 'Read': case 'Edit': return s('file_path');
      case 'Glob': return s('pattern');
      case 'Grep': return `${s('pattern')} in ${s('path') || '*'}`;
      case 'WebFetch': return s('url').slice(0, 100);
      case 'WebSearch': return s('query');
      default: return JSON.stringify(input).slice(0, 100);
    }
  }

  private broadcast(data: unknown) {
    const msg = JSON.stringify(data);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }

  private send(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  }

  stop() {
    // 关闭所有客户端连接
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    this.clients.clear();

    // 关闭 WebSocket 服务器
    this.wss?.close();

    // 关闭 HTTP 服务器
    this.httpServer?.close();

    // 停止所有文件监听
    this.fw.stopAll();

    // 清除所有 pending 的定时器
    for (const [, pending] of this.pendingAuths) {
      clearTimeout(pending.timer);
    }
    this.pendingAuths.clear();

    for (const [, pending] of this.pendingQuestions) {
      clearTimeout(pending.timer);
    }
    this.pendingQuestions.clear();

    // 关闭项目监听器
    for (const [, watcher] of this.projectWatchers) {
      watcher.close();
    }
    this.projectWatchers.clear();

    // 清空活跃会话
    this.activeSessions.clear();
  }
}

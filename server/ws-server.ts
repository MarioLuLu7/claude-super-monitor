import http from 'http';
import { WebSocketServer as WSS, WebSocket } from 'ws';
import { FileWatcher } from './file-watcher';
import { watchIdeDir, watchFileHistoryDir, watchProjectDir, getOpenSessionIds } from './ide-detector';

// ── 消息类型 ──────────────────────────────────────────────────────────────────
interface IncomingMsg {
  type: 'authorizeResponse';
  requestId?: string;
  approved?: boolean;
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
}

export class WebSocketServer {
  private port: number;
  private httpServer!: http.Server;
  private wss!: WSS;
  private fw = new FileWatcher();
  private clients = new Set<WebSocket>();
  private pendingAuths = new Map<string, PendingAuth>();

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
  }

  // ── 活跃会话管理 ────────────────────────────────────────────────────────────
  private refreshActiveSessions() {
    const projects = this.fw.getProjects();
    const newKeys = new Set<string>();

    for (const proj of projects) {
      if (!proj.activeInIde) continue;
      const appName = proj.originalPath.replace(/\\/g, '/').split('/').pop() ?? proj.name;

      // 只取"在 VSCode 中打开的会话"（file-history 有记录 + 24h 内活跃）
      const openIds = getOpenSessionIds(proj.name);
      if (!openIds.length) continue;

      for (let idx = 0; idx < openIds.length; idx++) {
        const sessionId = openIds[idx];
        const key = `${proj.name}/${sessionId}`;
        newKeys.add(key);

        if (!this.activeSessions.has(key)) {
          const displayName = openIds.length > 1 ? `${appName} #${idx + 1}` : appName;
          const info: ActiveSession = {
            key, projectName: proj.name, sessionId,
            displayName, originalPath: proj.originalPath,
          };
          this.activeSessions.set(key, info);

          this.fw.watch(proj.name, sessionId, (item) => {
            const tokens = this.fw.getSessionTokens(proj.name, sessionId);
            this.broadcast({ type: 'sessionUpdate', key, item, tokens });
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

  stop() { this.fw.stopAll(); this.wss?.close(); this.httpServer?.close(); }
}

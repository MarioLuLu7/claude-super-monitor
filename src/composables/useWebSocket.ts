import { ref, onMounted, onUnmounted } from 'vue';
import type { SessionPane, AuthRequest, WSOutgoing, Notification, UserQuestionRequest } from '../types';
import { useSettings } from './useSettings';

// 有执行动作的 level（立即显示面板）
const ACTIVE_LEVELS = new Set(['thinking', 'working', 'auth', 'error']);

export function useWebSocket() {
  const { settings } = useSettings();
  const connected      = ref(false);
  const panes          = ref<SessionPane[]>([]);
  const pendingAuth    = ref<AuthRequest | null>(null);
  const pendingQuestion = ref<UserQuestionRequest | null>(null);
  const visibleKeys    = ref<Set<string>>(new Set());
  const notifications  = ref<Notification[]>([]);

  const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ── 内部辅助 ──────────────────────────────────────────────────────────────

  function showPanel(key: string) {
    visibleKeys.value = new Set([...visibleKeys.value, key]);
  }

  function collapsePanel(key: string) {
    const next = new Set(visibleKeys.value);
    next.delete(key);
    visibleKeys.value = next;
  }

  function cancelTimer(key: string) {
    const t = idleTimers.get(key);
    if (t !== undefined) { clearTimeout(t); idleTimers.delete(key); }
  }

  function startCollapseTimer(key: string) {
    cancelTimer(key);
    const delayMs = settings.value.collapseDelay * 1000;
    if (delayMs <= 0) return; // 0 = 不自动关闭
    const t = setTimeout(() => {
      idleTimers.delete(key);
      collapsePanel(key);
    }, delayMs);
    idleTimers.set(key, t);
  }

  function upsertNotification(key: string, displayName: string, text: string, detail: string | undefined, timestamp: string) {
    const idx = notifications.value.findIndex(n => n.key === key);
    const entry: Notification = { key, displayName, text, detail, timestamp };
    if (idx >= 0) {
      notifications.value = [
        ...notifications.value.slice(0, idx),
        entry,
        ...notifications.value.slice(idx + 1),
      ];
    } else {
      notifications.value = [...notifications.value, entry];
    }
  }

  function removeNotification(key: string) {
    notifications.value = notifications.value.filter(n => n.key !== key);
  }

  // ── 公开：点击通知栏恢复面板 ─────────────────────────────────────────────
  function restoreSession(key: string) {
    cancelTimer(key);
    removeNotification(key);
    showPanel(key);
  }

  // ── 公开：主动折叠面板到通知栏 ──────────────────────────────────────────
  function collapseSession(key: string) {
    const pane = panes.value.find(p => p.key === key);
    if (!pane) return;
    const last = pane.items[pane.items.length - 1];
    if (last) upsertNotification(key, pane.displayName, last.key, last.detail, last.timestamp);
    cancelTimer(key);
    collapsePanel(key);
  }

  // ── WebSocket 连接 ────────────────────────────────────────────────────────
  function connect() {
    const socket = new WebSocket('ws://localhost:5998');

    socket.onopen = () => { connected.value = true; };

    socket.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as WSOutgoing;

      switch (data.type) {

        // 初始全量：替换所有面板
        case 'allSessions': {
          const now = Date.now();
          panes.value = (data.sessions ?? []).map((s) => ({
            key: s.key,
            displayName: s.displayName,
            originalPath: s.originalPath,
            sessionTitle: s.sessionTitle ?? '',
            items: s.items ?? [],
            tokens: s.tokens ?? 0,
          }));
          const initVisible = new Set<string>();
          for (const pane of panes.value) {
            const last = pane.items[pane.items.length - 1];
            const collapseMs = settings.value.collapseDelay * 1000;
            const isOld = collapseMs > 0 && last && now - new Date(last.timestamp).getTime() > collapseMs;
            if (last?.level === 'done' && isOld) {
              // 最后一条是"已完成"且超过折叠延迟 → 直接折叠到通知栏
              upsertNotification(pane.key, pane.displayName, last.key, last.detail, last.timestamp);
            } else if (last?.level === 'idle' && isOld) {
              // 最后一条是"等待中"且超过折叠延迟 → 也折叠（避免初始化时展示大量旧的等待会话）
              upsertNotification(pane.key, pane.displayName, last.key, last.detail, last.timestamp);
            } else {
              initVisible.add(pane.key);
            }
          }
          visibleKeys.value = initVisible;
          break;
        }

        // 会话列表变更
        case 'sessionsChanged': {
          const next = data.sessions ?? [];
          const updated: SessionPane[] = next.map((s) => {
            const existing = panes.value.find((p) => p.key === s.key);
            return existing ?? { key: s.key, displayName: s.displayName, originalPath: s.originalPath, sessionTitle: s.sessionTitle ?? '', items: [], tokens: s.tokens ?? 0 };
          });

          // 新加入的会话默认可见
          const newVisible = new Set(visibleKeys.value);
          for (const s of next) {
            if (!panes.value.find(p => p.key === s.key)) newVisible.add(s.key);
          }

          // 移除已关闭的会话的定时器和通知
          for (const p of panes.value) {
            if (!next.find(s => s.key === p.key)) {
              cancelTimer(p.key);
              removeNotification(p.key);
              newVisible.delete(p.key);
            }
          }

          panes.value = updated;
          visibleKeys.value = newVisible;
          break;
        }

        // 增量更新某个会话
        case 'sessionUpdate': {
          const { key, item } = data;
          if (!key || !item) break;

          const pane = panes.value.find((p) => p.key === key);
          if (pane) {
            pane.items.push(item);
            if (data.tokens !== undefined) pane.tokens = data.tokens;
          }

          const displayName = pane?.displayName ?? key;

          if (ACTIVE_LEVELS.has(item.level) || item.level === 'idle') {
            // 有执行动作 或 用户输入 → 立即显示面板，取消折叠计时
            cancelTimer(key);
            removeNotification(key);
            showPanel(key);
          } else if (item.level === 'done') {
            // 完成回复 → 更新通知栏，启动 30s 折叠计时
            upsertNotification(key, displayName, item.key, item.detail, item.timestamp);
            startCollapseTimer(key);
          } else {
            // idle / 其他 → 取消计时（不强制隐藏）
            cancelTimer(key);
          }
          break;
        }

        case 'authorizationRequired':
          pendingAuth.value = {
            requestId: data.requestId!,
            toolName:  data.toolName!,
            toolInput: data.toolInput ?? {},
            summary:   data.summary ?? '',
          };
          break;

        case 'authorizationHandled':
          if (pendingAuth.value?.requestId === data.requestId) pendingAuth.value = null;
          break;

        case 'userQuestionRequired':
          if (data.userQuestion) pendingQuestion.value = data.userQuestion;
          break;
      }
    };

    socket.onclose = () => {
      connected.value = false;
      reconnectTimer = setTimeout(connect, 3000);
    };
    socket.onerror = () => { connected.value = false; };
    ws = socket;
  }

  function authorizeRespond(requestId: string, approved: boolean) {
    pendingAuth.value = null;
    ws?.send(JSON.stringify({ type: 'authorizeResponse', requestId, approved }));
  }

  function dismissQuestion() {
    pendingQuestion.value = null;
  }

  function answerQuestion(requestId: string, answers: Record<string, string[]>) {
    pendingQuestion.value = null;
    ws?.send(JSON.stringify({ type: 'questionAnswer', requestId, answers }));
  }

  onMounted(connect);
  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    idleTimers.forEach(clearTimeout);
    ws?.close();
  });

  return { connected, panes, visibleKeys, notifications, pendingAuth, pendingQuestion, authorizeRespond, dismissQuestion, answerQuestion, restoreSession, collapseSession };
}

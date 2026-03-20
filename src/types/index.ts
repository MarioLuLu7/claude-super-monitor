export interface Project {
  name: string;
  originalPath: string;
  latestMtime: Date;
  sessions: Session[];
  activeInIde: boolean;
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

export interface AuthRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  summary: string;
}

// 多会话面板数据
export interface SessionPane {
  key: string;
  displayName: string;
  originalPath: string;
  items: StatusItem[];
  sessionTitle: string;   // JSONL 头部第一条真实用户输入
  tokens: number;         // 估算 token 数
}

// 顶部通知栏中一条已折叠的会话通知
export interface Notification {
  key: string;
  displayName: string;
  text: string;       // 最后一条状态文本
  detail?: string;    // 最后一条详情
  timestamp: string;
}

export interface WSOutgoing {
  type:
    | 'allSessions'
    | 'sessionsChanged'
    | 'sessionUpdate'
    | 'authorizationRequired'
    | 'authorizationHandled'
    | 'error';
  // 全量会话列表
  sessions?: Array<{ key: string; displayName: string; originalPath: string; items?: StatusItem[]; sessionTitle?: string; tokens?: number }>;
  // 单条更新
  key?: string;
  item?: StatusItem;
  tokens?: number;
  // 授权
  requestId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  summary?: string;
  approved?: boolean;
  error?: string;
}

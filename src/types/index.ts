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

export type StatusLevel = 'thinking' | 'working' | 'responding' | 'done' | 'auth' | 'error' | 'idle' | 'reading' | 'writing' | 'searching' | 'planning' | 'agent' | 'web' | 'ask' | 'notebook' | 'bash';

export interface StatusItem {
  id: string;
  timestamp: string;
  level: StatusLevel;
  key: string;    // i18n translation key
  detail?: string;
  questionData?: { toolUseId: string; questions: AskQuestion[] };
}

export interface AuthRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  summary: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export interface UserQuestionRequest {
  requestId?: string;   // hook 流程中有值
  sessionKey: string;
  toolUseId: string;
  questions: AskQuestion[];
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
    | 'userQuestionRequired'
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
  // 用户问题
  userQuestion?: UserQuestionRequest;
}

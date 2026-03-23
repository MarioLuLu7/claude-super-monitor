import type { StatusLevel } from './index';

// 角色状态
export type CharacterState = 'idle' | 'walking' | 'working' | 'thinking' | 'sitting' | 'error' | 'auth' | 'reading' | 'writing';

// 表情图标类型
export type EmoteType = 'thinking' | 'working' | 'done' | 'auth' | 'error' | 'idle' | 'reading' | 'writing' | null;

// 位置坐标
export interface Position {
  x: number;
  y: number;
}

// 游戏房间配置
export interface GameRoomConfig {
  projectName: string;
  tokens: number;
  statusLevel: StatusLevel;
  statusKey: string;
  statusDetail?: string;
}

// 动画配置
export interface AnimationConfig {
  frames: number[];
  speed: number;
  loop: boolean;
}

// 家具配置
export interface FurnitureConfig {
  id: string;
  name: string;
  position: Position;
  width: number;
  height: number;
  interactive?: boolean;
}

// 角色配置
export interface CharacterConfig {
  startPosition: Position;
  speed: number;
  scale: number;
}

// 游戏场景对象引用
export interface GameSceneObjects {
  character: import('pixi.js').AnimatedSprite | null;
  emote: import('pixi.js').Text | null;
  powerMeter: {
    bg: import('pixi.js').Graphics;
    fill: import('pixi.js').Graphics;
    text: import('pixi.js').Text;
  } | null;
  doorSign: import('pixi.js').Text | null;
  furniture: Map<string, import('pixi.js').Sprite>;
}

// 状态到动作的映射
export interface StateActionMapping {
  state: CharacterState;
  targetPosition?: Position;
  emote: EmoteType;
  animation: string;
}

// 视口配置
export interface ViewportConfig {
  width: number;
  height: number;
  backgroundColor: number;
}

// 游戏事件类型
export type GameEventType = 'stateChange' | 'tokenUpdate' | 'projectNameUpdate';

export interface GameEvent {
  type: GameEventType;
  payload: unknown;
}

// 资源加载配置
export interface AssetManifest {
  spritesheets: Array<{
    name: string;
    url: string;
    jsonUrl: string;
  }>;
  images: Array<{
    name: string;
    url: string;
  }>;
}

// 房间布局配置
export const ROOM_LAYOUT = {
  width: 320,
  height: 240,
  colors: {
    floor: 0x2a2a3a,
    wall: 0x1a1a2a,
    wallTop: 0x252535,
  },
  furniture: {
    sofa: { x: 50, y: 120, width: 60, height: 40 },
    machine: { x: 220, y: 100, width: 70, height: 60 },
    bookshelf: { x: 30, y: 180, width: 50, height: 50 },
    desk: { x: 120, y: 180, width: 60, height: 40 },
    door: { x: 280, y: 50, width: 30, height: 60 },
    powerMeter: { x: 240, y: 190, width: 60, height: 40 },
  },
  character: {
    startX: 160,
    startY: 150,
    speed: 1.5,
  },
} as const;

// 表情图标配置
export const EMOTE_CONFIG: Record<NonNullable<EmoteType>, { emoji: string; color: number }> = {
  thinking: { emoji: '💭', color: 0xffaa00 },
  working: { emoji: '🔧', color: 0x00aaff },
  done: { emoji: '✓', color: 0x00ff65 },
  auth: { emoji: '?', color: 0xff66aa },
  error: { emoji: '✗', color: 0xff2244 },
  idle: { emoji: '💤', color: 0x888888 },
  reading: { emoji: '📚', color: 0xaa66ff },
  writing: { emoji: '✎', color: 0x66ffaa },
};

// 状态到动作的默认映射
export function getStateActionMapping(
  level: StatusLevel,
  key: string,
  detail?: string
): StateActionMapping {
  // 根据状态详情判断特殊动作
  const lowerKey = key.toLowerCase();
  const lowerDetail = detail?.toLowerCase() ?? '';

  // 读取文件 -> 去书架
  if (lowerKey.includes('read') || lowerDetail.includes('read') || lowerDetail.includes('file')) {
    return {
      state: 'reading',
      targetPosition: { x: ROOM_LAYOUT.furniture.bookshelf.x + 25, y: ROOM_LAYOUT.furniture.bookshelf.y + 25 },
      emote: 'reading',
      animation: 'reading',
    };
  }

  // 写入/编辑文件 -> 去写字台
  if (lowerKey.includes('write') || lowerKey.includes('edit') || lowerDetail.includes('write')) {
    return {
      state: 'writing',
      targetPosition: { x: ROOM_LAYOUT.furniture.desk.x + 30, y: ROOM_LAYOUT.furniture.desk.y + 20 },
      emote: 'writing',
      animation: 'writing',
    };
  }

  // 基础状态映射
  switch (level) {
    case 'thinking':
      return {
        state: 'thinking',
        emote: 'thinking',
        animation: 'thinking',
      };
    case 'working':
      return {
        state: 'working',
        targetPosition: { x: ROOM_LAYOUT.furniture.machine.x + 35, y: ROOM_LAYOUT.furniture.machine.y + 50 },
        emote: 'working',
        animation: 'working',
      };
    case 'done':
      return {
        state: 'sitting',
        targetPosition: { x: ROOM_LAYOUT.furniture.sofa.x + 30, y: ROOM_LAYOUT.furniture.sofa.y + 20 },
        emote: 'done',
        animation: 'sitting',
      };
    case 'auth':
      return {
        state: 'auth',
        targetPosition: { x: ROOM_LAYOUT.furniture.door.x + 15, y: ROOM_LAYOUT.furniture.door.y + 50 },
        emote: 'auth',
        animation: 'knocking',
      };
    case 'error':
      return {
        state: 'error',
        emote: 'error',
        animation: 'error',
      };
    case 'idle':
    default:
      return {
        state: 'idle',
        emote: 'idle',
        animation: 'idle',
      };
  }
}

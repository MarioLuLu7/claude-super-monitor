<template>
  <div class="game-panel">
    <!-- 游戏头部 -->
    <div class="game-header">
      <span class="game-title">◈ {{ sessionTitle || displayName }}</span>
      <button
        v-if="isDev"
        class="test-mode-toggle"
        :class="{ active: isTestMode }"
        @click="toggleTestMode"
        title="切换测试模式"
      >
        🧪 {{ isTestMode ? '退出测试' : '测试模式' }}
      </button>
      <span class="session-name">{{ displayName }}</span>
    </div>

    <!-- PixiJS 画布容器 -->
    <div ref="containerRef" class="game-canvas-container">
      <canvas ref="canvasRef" class="game-canvas"></canvas>
      <div v-if="!isReady" class="game-loading">
        <div class="loading-text">{{ t('loading_game') }}...</div>
        <div class="loading-spinner"></div>
      </div>
    </div>

    <!-- 测试模式面板 -->
    <div v-if="isTestMode" class="test-panel">
      <div class="test-panel-header">
        <span class="test-title">🎮 状态测试面板</span>
        <button class="test-close" @click="toggleTestMode">✕</button>
      </div>
      <div class="test-buttons">
        <button
          v-for="state in testStates"
          :key="state.key"
          class="test-btn"
          :class="{ active: currentTestKey === state.key }"
          :style="{ borderColor: state.color, color: state.color }"
          @click="triggerTestState(state)"
        >
          <span class="test-btn-icon">{{ state.icon }}</span>
          <span class="test-btn-text">{{ state.label }}</span>
        </button>
      </div>
      <div class="test-info">
        <span>当前: {{ currentTestKey || 'auto' }}</span>
        <button class="test-reset" @click="resetToAuto">恢复自动</button>
      </div>
    </div>

    <!-- 状态覆盖层 -->
    <div class="game-status-overlay">
      <div class="status-badge" :class="`badge-${currentLevel}`">
        <span class="badge-icon">{{ levelIcon }}</span>
        <span class="badge-text">{{ t(currentKey) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useDotownGame } from '../composables/useDotownGame';
import { useI18n } from '../composables/useI18n';
import type { I18nKey } from '../i18n/zh';
import type { StatusItem, StatusLevel } from '../types';

const props = defineProps<{
  items: StatusItem[];
  displayName: string;
  originalPath: string;
  sessionTitle?: string;
  tokens?: number;
}>();

const { t: tComputed } = useI18n();
const t = (key: string) => tComputed.value(key as I18nKey);

// 是否开发环境
const isDev = import.meta.env.DEV;

// 测试模式状态
const isTestMode = ref(false);
const currentTestKey = ref<string>('');
const isManualOverride = ref(false);

// 测试状态列表
const testStates = [
  { key: 'status_idle', level: 'idle' as StatusLevel, label: '闲置', icon: '💤', color: '#a29bfe' },
  { key: 'status_thinking', level: 'thinking' as StatusLevel, label: '思考', icon: '💭', color: '#ffd93d' },
  { key: 'tool_read', level: 'reading' as StatusLevel, label: '读取', icon: '📖', color: '#aa66ff' },
  { key: 'tool_write', level: 'writing' as StatusLevel, label: '写入', icon: '✎', color: '#66ffaa' },
  { key: 'tool_multiedit', level: 'writing' as StatusLevel, label: '多处编辑', icon: '✎✎', color: '#66ffaa' },
  { key: 'tool_glob', level: 'searching' as StatusLevel, label: '搜索文件', icon: '🔍', color: '#00ccff' },
  { key: 'tool_grep', level: 'searching' as StatusLevel, label: '搜索内容', icon: '🔎', color: '#00ccff' },
  { key: 'tool_exit_plan', level: 'planning' as StatusLevel, label: '规划', icon: '📋', color: '#ffaa00' },
  { key: 'tool_agent', level: 'agent' as StatusLevel, label: '子代理', icon: '👥', color: '#ff66dd' },
  { key: 'tool_webfetch', level: 'web' as StatusLevel, label: '网页请求', icon: '🌐', color: '#6699ff' },
  { key: 'tool_ask_user', level: 'ask' as StatusLevel, label: '询问用户', icon: '❓', color: '#ff9966' },
  { key: 'tool_notebook', level: 'notebook' as StatusLevel, label: '笔记', icon: '📓', color: '#99ff66' },
  { key: 'tool_bash', level: 'bash' as StatusLevel, label: '执行命令', icon: '⚡', color: '#66ffff' },
  { key: 'status_done', level: 'done' as StatusLevel, label: '完成', icon: '✓', color: '#6bcb77' },
  { key: 'status_auth_req', level: 'auth' as StatusLevel, label: '需要授权', icon: '🔐', color: '#ff6b6b' },
  { key: 'status_error', level: 'error' as StatusLevel, label: '错误', icon: '✗', color: '#ff4757' },
];

// 切换测试模式
function toggleTestMode() {
  isTestMode.value = !isTestMode.value;
  if (!isTestMode.value) {
    resetToAuto();
  }
}

// 触发测试状态
function triggerTestState(state: typeof testStates[0]) {
  currentTestKey.value = state.key;
  isManualOverride.value = true;
  if (isReady.value) {
    updateState(state.level, state.key);
  }
}

// 恢复自动模式
function resetToAuto() {
  currentTestKey.value = '';
  isManualOverride.value = false;
  // 恢复到当前实际状态
  if (currentItem.value && isReady.value) {
    const classifiedLevel = classifyStatusKey(currentItem.value.key);
    updateState(classifiedLevel, currentItem.value.key);
  }
}

// 画布和容器引用
const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const containerSize = ref({ width: 320, height: 240 });

// 监听容器大小变化
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        containerSize.value = { width, height };
      }
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});

// 获取当前状态
const currentItem = computed(() => props.items[props.items.length - 1]);
const currentLevel = computed<StatusLevel>(() => currentItem.value?.level ?? 'idle');
const currentKey = computed(() => currentItem.value?.key ?? 'status_idle');

// 状态图标
const ICONS: Record<StatusLevel, string> = {
  thinking: '💭',
  working: '🔧',
  responding: '💬',
  done: '✓',
  auth: '?',
  error: '✗',
  idle: '💤',
  reading: '📖',
  writing: '✎',
  searching: '🔍',
  planning: '📋',
  agent: '👥',
  web: '🌐',
  ask: '❓',
  notebook: '📓',
  bash: '⚡',
};
const levelIcon = computed(() => ICONS[currentLevel.value] ?? '...');

// 初始化 Pixi 游戏
const { isReady, updateState, updateTokens, updateProjectName } = useDotownGame(
  canvasRef,
  containerSize,
  {
    projectName: props.displayName,
    tokens: props.tokens ?? 0,
    statusLevel: currentLevel.value,
    statusKey: currentKey.value,
    statusDetail: currentItem.value?.detail,
  }
);

// 工具状态分类映射（与 useDotownGame.ts 中的 classifyStatusKey 保持一致）
function classifyStatusKey(key: string): import('../types').StatusLevel {
  const k = key.toLowerCase();
  if (k.includes('read')) return 'reading';
  if (k.includes('write') || k.includes('edit') || k.includes('multiedit')) return 'writing';
  if (k.includes('glob') || k.includes('grep') || k.includes('search')) return 'searching';
  if (k.includes('plan') || k.includes('exit_plan') || k.includes('enter_plan')) return 'planning';
  if (k.includes('agent')) return 'agent';
  if (k.includes('web') || k.includes('fetch')) return 'web';
  if (k.includes('ask') || k.includes('ask_user')) return 'ask';
  if (k.includes('notebook')) return 'notebook';
  if (k.includes('bash')) return 'bash';
  if (k.includes('thinking')) return 'thinking';
  if (k.includes('done')) return 'done';
  if (k.includes('auth_req') || k.includes('auth_deny')) return 'auth';
  if (k.includes('error') || k.includes('interrupted')) return 'error';
  if (k.includes('idle') || k.includes('user_input')) return 'idle';
  // 默认返回 working，与 useDotownGame.ts 保持一致
  return 'working';
}

// 监听状态变化
watch(
  () => currentItem.value,
  (newItem) => {
    if (newItem && isReady.value && !isManualOverride.value) {
      const classifiedLevel = classifyStatusKey(newItem.key);
      updateState(classifiedLevel, newItem.key);
    }
  },
  { immediate: true }
);

// 监听 token 变化
watch(
  () => props.tokens,
  (newTokens) => {
    if (newTokens !== undefined && isReady.value) {
      updateTokens(newTokens);
    }
  },
  { immediate: true }
);

// 监听项目名称变化
watch(
  () => props.displayName,
  (newName) => {
    if (newName && isReady.value) {
      updateProjectName(newName);
    }
  }
);
</script>

<style scoped>
.game-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--px-bg1);
  border: 3px solid var(--px-dim);
  overflow: hidden;
  position: relative;
}

/* 游戏头部 */
.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--px-bg2);
  border-bottom: 2px solid var(--px-dim);
  flex-shrink: 0;
}

.game-title {
  font-family: var(--px-font);
  font-size: 9px;
  color: var(--px-green);
  text-shadow: var(--px-glow-green);
  letter-spacing: 1px;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--px-bg3);
  border: 2px solid var(--px-cyan);
  color: var(--px-cyan);
  padding: 4px 10px;
  cursor: pointer;
  font-family: var(--px-font);
  font-size: 8px;
  transition: all 0.1s steps(1);
}

.session-name {
  font-family: var(--px-font);
  font-size: 8px;
  color: var(--px-cyan);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* 画布容器 */
.game-canvas-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--px-bg0);
  overflow: hidden;
  min-height: 0;
}

.game-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  box-shadow: 0 0 20px rgba(0, 255, 100, 0.1);
}

/* 加载状态 */
.game-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: var(--px-bg0);
}

.loading-text {
  font-family: var(--px-font);
  font-size: 10px;
  color: var(--px-cyan);
  animation: blink 1s step-end infinite;
}

.loading-spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--px-dim);
  border-top-color: var(--px-green);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 状态覆盖层 */
.game-status-overlay {
  position: absolute;
  bottom: 10px;
  right: 10px;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--px-bg2);
  border: 2px solid var(--px-dim);
  font-family: var(--px-font);
  font-size: 9px;
}

.status-badge.badge-thinking { border-color: var(--px-yellow); color: var(--px-yellow); }
.status-badge.badge-working { border-color: var(--px-cyan); color: var(--px-cyan); }
.status-badge.badge-done { border-color: var(--px-green); color: var(--px-green); }
.status-badge.badge-auth { border-color: var(--px-pink); color: var(--px-pink); }
.status-badge.badge-error { border-color: var(--px-red); color: var(--px-red); }
.status-badge.badge-idle { border-color: var(--px-cyan); color: var(--px-cyan); }

.badge-icon {
  font-size: 12px;
}

/* 测试模式切换按钮 */
.test-mode-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--px-bg3);
  border: 2px solid var(--px-dim);
  color: var(--px-text);
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--px-font);
  font-size: 8px;
  transition: all 0.1s steps(1);
}

.test-mode-toggle:hover {
  border-color: var(--px-cyan);
  color: var(--px-cyan);
}

.test-mode-toggle.active {
  border-color: var(--px-pink);
  color: var(--px-pink);
  background: rgba(255, 107, 107, 0.1);
}

/* 测试面板 */
.test-panel {
  position: absolute;
  bottom: 40px;
  left: 10px;
  right: 10px;
  background: var(--px-bg1);
  border: 2px solid var(--px-cyan);
  padding: 10px;
  z-index: 100;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.test-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--px-dim);
}

.test-title {
  font-family: var(--px-font);
  font-size: 10px;
  color: var(--px-cyan);
}

.test-close {
  background: none;
  border: none;
  color: var(--px-red);
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
}

.test-buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.test-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--px-bg2);
  border: 2px solid var(--px-dim);
  cursor: pointer;
  transition: all 0.1s steps(1);
  font-family: var(--px-font);
}

.test-btn:hover {
  background: var(--px-bg3);
  transform: translateY(-2px);
}

.test-btn.active {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
}

.test-btn-icon {
  font-size: 16px;
}

.test-btn-text {
  font-size: 8px;
  color: var(--px-text);
}

.test-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--px-dim);
  font-family: var(--px-font);
  font-size: 8px;
  color: var(--px-dim);
}

.test-reset {
  background: var(--px-bg3);
  border: 1px solid var(--px-dim);
  color: var(--px-text);
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--px-font);
  font-size: 8px;
}

.test-reset:hover {
  border-color: var(--px-green);
  color: var(--px-green);
}
</style>

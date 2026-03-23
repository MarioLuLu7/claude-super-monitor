<template>
  <div class="game-panel">
    <!-- 游戏头部 -->
    <div class="game-header">
      <span class="game-title">◈ GAME MODE</span>
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
import { usePixiGame } from '../composables/usePixiGame';
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
  done: '✓',
  auth: '?',
  error: '✗',
  idle: '💤',
};
const levelIcon = computed(() => ICONS[currentLevel.value] ?? '...');

// 初始化 Pixi 游戏
const { isReady, updateState, updateTokens, updateProjectName } = usePixiGame(
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

// 监听状态变化
watch(
  () => currentItem.value,
  (newItem) => {
    if (newItem && isReady.value) {
      updateState(newItem.level, newItem.key, newItem.detail);
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
  color: var(--px-gray);
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
  left: 10px;
  right: 10px;
  display: flex;
  justify-content: center;
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
.status-badge.badge-idle { border-color: var(--px-gray); color: var(--px-gray); }

.badge-icon {
  font-size: 12px;
}
</style>

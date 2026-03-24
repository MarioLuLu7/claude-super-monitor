<template>
  <div class="app grid-bg scanline-overlay">

    <!-- ══ HUD 顶部栏 ════════════════════════════════ -->
    <header class="hud-bar">
      <span class="hud-logo">◈ CLAUDE SUPER MONITOR</span>

      <div class="hud-sessions" v-if="panes.length">
        <span class="hud-blink">▶</span>
        <span class="hud-count">{{ visiblePanes.length }}/{{ panes.length }}</span>
        <span class="hud-label">SESSION{{ panes.length > 1 ? 'S' : '' }}</span>
      </div>

      <div class="hud-right">
        <span :class="['led', connected ? 'online' : 'connecting']"></span>
        <span :class="connected ? 'hud-live' : 'hud-off'">{{ connected ? 'LIVE' : 'OFF' }}</span>
        <span class="hud-clock">{{ clock }}</span>
        <!-- 游戏模式切换按钮 -->
        <button
          class="hud-mode"
          :class="{ 'game-active': isGameMode }"
          @click="toggleGameMode"
          :title="isGameMode ? t('switch_to_normal') : t('switch_to_game')"
        >
          <span class="mode-icon">{{ isGameMode ? '📊' : '⭐' }}</span>
          <span class="mode-text">{{ isGameMode ? t('normal') : t('game') }}</span>
        </button>
        <button class="hud-cfg" @click="showSettings = true" title="Settings">⚙</button>
      </div>
    </header>

    <!-- ══ 通知栏 ══════════════════════════════════ -->
    <NotificationBar :notifications="notifications" @restore="restoreSession" />

    <!-- ══ 空状态：等待连接 ════════════════════════ -->
    <div v-if="!panes.length" class="empty-screen">
      <div class="empty-frame">
        <div class="empty-corner tl">◆</div>
        <div class="empty-corner tr">◆</div>
        <div class="empty-corner bl">◆</div>
        <div class="empty-corner br">◆</div>
        <div class="empty-inner">
          <div class="empty-icon">[ ]</div>
          <div class="empty-msg">{{ t('empty_no_session') }}</div>
          <div class="empty-hint">{{ t('empty_hint') }}</div>
          <div class="empty-press">▶ WAITING ◀</div>
        </div>
      </div>
    </div>

    <!-- ══ 分屏网格 ════════════════════════════════ -->
    <div v-else-if="visiblePanes.length" class="session-grid" :style="gridStyle">
      <!-- 全局游戏模式：所有会话显示为游戏模式 -->
      <GamePanel
        v-if="isGameMode"
        v-for="pane in visiblePanes"
        :key="pane.key"
        :items="pane.items"
        :display-name="pane.displayName"
        :original-path="pane.originalPath"
        :session-title="pane.sessionTitle"
        :tokens="pane.tokens"
      />
      <!-- 普通模式 -->
      <StatusPanel
        v-else
        v-for="pane in visiblePanes"
        :key="pane.key"
        :items="pane.items"
        :display-name="pane.displayName"
        :original-path="pane.originalPath"
        :session-title="pane.sessionTitle"
        :tokens="pane.tokens"
        @collapse="collapseSession(pane.key)"
      />
    </div>

    <!-- ══ 全部折叠 ════════════════════════════════ -->
    <div v-else class="empty-screen">
      <div class="empty-frame">
        <div class="empty-corner tl">◆</div>
        <div class="empty-corner tr">◆</div>
        <div class="empty-corner bl">◆</div>
        <div class="empty-corner br">◆</div>
        <div class="empty-inner">
          <div class="empty-icon done-icon">★</div>
          <div class="empty-msg">{{ t('empty_all_done') }}</div>
          <div class="empty-hint">{{ t('empty_restore') }}</div>
        </div>
      </div>
    </div>

    <AuthDialog :request="pendingAuth" :auto-approve="settings.autoApprove" @respond="authorizeRespond" />
    <UserQuestionDialog
      :request="pendingQuestion"
      @answer="(rid, ans) => answerQuestion(rid, ans)"
      @dismiss="dismissQuestion"
    />
    <SettingsDialog v-model:show="showSettings" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket';
import { useSettings } from './composables/useSettings';
import { useI18n } from './composables/useI18n';
import type { I18nKey } from './i18n/zh';
import StatusPanel from './components/StatusPanel.vue';
import GamePanel from './components/GamePanel.vue';
import AuthDialog from './components/AuthDialog.vue';
import UserQuestionDialog from './components/UserQuestionDialog.vue';
import NotificationBar from './components/NotificationBar.vue';
import SettingsDialog from './components/SettingsDialog.vue';

const { connected, panes, visibleKeys, notifications, pendingAuth, pendingQuestion, authorizeRespond, dismissQuestion, answerQuestion, restoreSession, collapseSession } = useWebSocket();
const { settings } = useSettings();
const { t: tComputed } = useI18n();
const t = (key: I18nKey) => tComputed.value(key);
const showSettings = ref(false);

// 全局游戏模式状态
const isGameMode = ref(false);

// 切换游戏模式
function toggleGameMode() {
  isGameMode.value = !isGameMode.value;
}

const visiblePanes = computed(() => panes.value.filter(p => visibleKeys.value.has(p.key)));

const gridStyle = computed(() => {
  const n = visiblePanes.value.length;
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n));
  return { 'grid-template-columns': `repeat(${cols}, 1fr)` };
});

const clock = ref('');
let timer: ReturnType<typeof setInterval>;
function tick() {
  const n = new Date();
  clock.value = [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}
onMounted(() => { tick(); timer = setInterval(tick, 1000); });
onUnmounted(() => clearInterval(timer));
</script>

<style>
html, body, #app { height: 100%; margin: 0; padding: 0; }

.app {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ══ HUD BAR ══════════════════════════════════════════ */
.hud-bar {
  height: 38px;
  background: var(--px-bg1);
  border-bottom: 3px solid var(--px-green);
  /* Pixel drop shadow below bar */
  box-shadow: 0 3px 0 var(--px-bg0), 0 6px 0 rgba(0,255,65,0.06);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 14px;
  flex-shrink: 0;
  font-family: var(--px-font);
  /* Subtle scanline */
  background-image: repeating-linear-gradient(
    0deg,
    transparent, transparent 1px,
    rgba(255,255,255,0.015) 1px, rgba(255,255,255,0.015) 2px
  );
}

.hud-logo {
  font-size: 9px;
  color: var(--px-green);
  text-shadow: var(--px-glow-green);
  letter-spacing: 1px;
  white-space: nowrap;
  flex-shrink: 0;
}

.hud-sessions {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 7px;
  color: var(--px-cyan);
  flex: 1;
}
.hud-blink { animation: blink 1s step-end infinite; font-size: 8px; }
.hud-count { font-size: 9px; letter-spacing: 1px; }
.hud-label { color: var(--px-cyan); letter-spacing: 2px; }

.hud-right {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 7px;
  flex-shrink: 0;
}
.hud-live { color: var(--px-green); text-shadow: var(--px-glow-green); letter-spacing: 1px; }
.hud-off  { color: var(--px-yellow); letter-spacing: 1px; }
.hud-clock {
  color: var(--px-gray);
  letter-spacing: 1px;
  min-width: 54px;
  text-align: right;
  font-size: 8px;
}

/* Settings button — pixel press style */
.hud-cfg {
  background: var(--px-bg2);
  border: 2px solid var(--px-cyan);
  color: var(--px-cyan);
  font-size: 11px;
  width: 22px;
  height: 22px;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 2px 0 #004477;
  transition: transform 0.05s steps(1), box-shadow 0.05s steps(1);
}
.hud-cfg:hover  { background: var(--px-cyan); color: var(--px-bg0); }
.hud-cfg:active { transform: translate(2px, 2px); box-shadow: none; }

/* ══ Game Mode Toggle Button ═══════════════════════════ */
.hud-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--px-bg2);
  border: 2px solid var(--px-pink);
  color: var(--px-pink);
  font-family: var(--px-font);
  font-size: 8px;
  padding: 4px 10px;
  cursor: pointer;
  height: 24px;
  box-shadow: 2px 2px 0 #660044;
  transition: all 0.1s steps(1);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hud-mode:hover {
  background: var(--px-pink);
  color: var(--px-bg0);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 #660044;
}

.hud-mode:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}

.hud-mode.game-active {
  border-color: var(--px-green);
  color: var(--px-green);
  box-shadow: 2px 2px 0 #004400;
}

.hud-mode.game-active:hover {
  background: var(--px-green);
  color: var(--px-bg0);
  box-shadow: 3px 3px 0 #004400;
}

.mode-icon {
  font-size: 12px;
}

.mode-text {
  white-space: nowrap;
}

/* ══ EMPTY / GAME START SCREEN ════════════════════════ */
.empty-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--px-font);
}

/* Classic RPG dialog box framing */
.empty-frame {
  position: relative;
  border: 3px solid var(--px-dim);
  box-shadow: inset 0 0 0 1px var(--px-bg3), 6px 6px 0 rgba(0,0,0,0.4);
  background: var(--px-bg1);
  padding: 32px 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 280px;
}

/* Corner decorations */
.empty-corner {
  position: absolute;
  font-size: 9px;
  color: var(--px-green);
  text-shadow: var(--px-glow-green);
  font-family: var(--px-font);
  animation: blink 2s step-end infinite;
}
.tl { top: -7px;  left: -7px; }
.tr { top: -7px;  right: -7px; }
.bl { bottom: -7px; left: -7px; }
.br { bottom: -7px; right: -7px; }

.empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
}

.empty-icon {
  font-size: 20px;
  color: var(--px-dim);
  animation: blink 1.6s step-end infinite;
  letter-spacing: 4px;
}
.done-icon {
  font-size: 22px;
  color: var(--px-green);
  text-shadow: var(--px-glow-green);
  animation: blink 1s step-end infinite;
}

.empty-msg  { font-size: 11px; font-family: var(--px-font-cn); color: var(--px-gray); letter-spacing: 2px; }
.empty-hint { font-size: 11px; font-family: var(--px-font-cn); color: var(--px-dim); }

/* Blinking "press start" style prompt */
.empty-press {
  font-size: 8px;
  color: var(--px-cyan);
  letter-spacing: 3px;
  animation: blink 1.2s step-end infinite;
  margin-top: 6px;
}

/* ══ SESSION GRID ══════════════════════════════════════ */
.session-grid {
  flex: 1;
  display: grid;
  overflow: hidden;
  gap: 3px;
  background: #010108;  /* dungeon wall — slightly blue-black */
}
</style>

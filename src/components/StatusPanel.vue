<template>
  <!-- 根元素挂载状态类，驱动整个面板配色 -->
  <div class="status-panel" :class="`state-${current?.level ?? 'idle'}`">

    <!-- ══ 窗口标题栏 ══════════════════════════════ -->
    <div class="win-title" v-if="displayName">
      <span class="win-dot">◈</span>
      <span class="win-name">{{ displayName }}</span>
      <span class="win-session" v-if="sessionTitle" :title="sessionTitle">[{{ sessionTitle }}]</span>
      <span class="win-path">{{ shortPath }}</span>
      <span class="win-tok" v-if="tokens">{{ fmtTokens(tokens) }} EXP</span>
      <button
        v-if="current?.level === 'done'"
        class="win-close"
        :title="t('collapse_tip')"
        @click="$emit('collapse')"
      >×</button>
    </div>

    <!-- ══ EXP 进度条（token 用量） ══════════════════ -->
    <div class="exp-track" v-if="tokens">
      <div class="exp-bar" :style="{ width: Math.min(100, (tokens / 200000) * 100) + '%' }"></div>
    </div>

    <!-- ══ 当前状态卡 ══════════════════════════════ -->
    <div class="stat-card">
      <div class="stat-accent"></div>
      <div class="stat-icon">{{ levelIcon(current?.level ?? 'idle') }}</div>
      <div class="stat-body">
        <div class="stat-input" v-if="latestUserInput">
          <span class="input-caret">›</span>
          <span class="input-text">{{ latestUserInput }}</span>
        </div>
        <div class="stat-label" :class="{ 'stat-label-sub': latestUserInput }">
          {{ t(current?.key ?? 'status_idle') }}
        </div>
        <div class="stat-detail" v-if="current?.detail && (current.level !== 'thinking' || settings.showThinkingDetail)">{{ current.detail }}</div>
      </div>
      <div class="stat-ts" v-if="current">{{ fmtTime(current.timestamp) }}</div>
    </div>

    <!-- ══ 事件日志 ════════════════════════════════ -->
    <div class="log-panel">
      <div class="log-hdr">◈ {{ t('timeline_title') }}</div>
      <div class="log-scroll">
        <div
          v-for="item in reversed"
          :key="item.id"
          class="log-row"
          :class="`row-${item.level}`"
        >
          <span class="row-sym">{{ levelChar(item.level) }}</span>
          <span class="row-ts">{{ fmtTime(item.timestamp) }}</span>
          <span class="row-lbl">{{ t(item.key) }}</span>
          <span class="row-det" v-if="item.detail && (item.level !== 'thinking' || settings.showThinkingDetail)">{{ item.detail }}</span>
        </div>
        <div v-if="!items.length" class="log-empty">{{ t('timeline_empty') }}</div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { StatusItem, StatusLevel } from '../types';
import { useI18n } from '../composables/useI18n';
import type { I18nKey } from '../i18n/zh';
import { useSettings } from '../composables/useSettings';

const { settings } = useSettings();

const props = defineProps<{
  items: StatusItem[];
  displayName?: string;
  originalPath?: string;
  sessionTitle?: string;
  tokens?: number;
}>();
defineEmits<{ collapse: [] }>();

const { t: tComputed } = useI18n();
const t = (key: string) => tComputed.value(key as I18nKey);

const shortPath = computed(() =>
  (props.originalPath ?? '').replace(/\\/g, '/').split('/').slice(-2).join('/'),
);

function fmtTokens(n: number | undefined): string {
  if (!n) return '';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

const current = computed<StatusItem | undefined>(() => props.items[props.items.length - 1]);
const reversed = computed(() => [...props.items].reverse());

const latestUserInput = computed(() => {
  for (let i = props.items.length - 1; i >= 0; i--) {
    if (props.items[i].level === 'idle' && props.items[i].detail) {
      return props.items[i].detail!.slice(0, 120);
    }
  }
  return '';
});

const ICONS: Record<StatusLevel, string> = {
  thinking: '???',
  working:  '>>>',
  responding: '...',
  done:     'OK!',
  auth:     '!?!',
  error:    'ERR',
  idle:     '...',
  reading:  'RD',
  writing:  'WR',
  searching: 'SR',
  planning: 'PL',
  agent:    'AG',
  web:      'WB',
  ask:      'ASK',
  notebook: 'NB',
  bash:     'SH',
};

const CHARS: Record<StatusLevel, string> = {
  thinking: '~',
  working:  '▶',
  responding: '…',
  done:     '★',
  auth:     '!',
  error:    '✗',
  idle:     '·',
  reading:  'R',
  writing:  'W',
  searching: 'S',
  planning: 'P',
  agent:    'A',
  web:      'W',
  ask:      '?',
  notebook: 'N',
  bash:     '$',
};

const levelIcon = (l: StatusLevel) => ICONS[l] ?? '...';
const levelChar = (l: StatusLevel) => CHARS[l] ?? '·';

function fmtTime(ts: string) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}
</script>

<style scoped>
/* ══════════════════════════════════════════════════
   STATUS PANEL — RPG Game Window
   ══════════════════════════════════════════════════ */

.status-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  background: var(--px-bg1);
  /* Double-border game window effect */
  border: 3px solid var(--px-dim);
  box-shadow: inset 0 0 0 1px var(--px-bg3);
}

/* State-based panel border color — whole panel reacts */
.state-thinking { border-color: var(--px-yellow); }
.state-working  { border-color: var(--px-cyan);   }
.state-done     { border-color: var(--px-green);  }
.state-auth     { border-color: var(--px-pink);   }
.state-error    { border-color: var(--px-red);    }

/* ── Window Title Bar ─────────────────────────────── */
.win-title {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: var(--px-bg2);
  border-bottom: 2px solid var(--px-dim);
  flex-shrink: 0;
  background-image: repeating-linear-gradient(
    0deg,
    transparent, transparent 1px,
    rgba(255,255,255,0.018) 1px, rgba(255,255,255,0.018) 2px
  );
}
.state-thinking .win-title { border-bottom-color: var(--px-yellow); }
.state-working  .win-title { border-bottom-color: var(--px-cyan);   }
.state-done     .win-title { border-bottom-color: var(--px-green);  }
.state-auth     .win-title { border-bottom-color: var(--px-pink);   }
.state-error    .win-title { border-bottom-color: var(--px-red);    }

.win-dot { font-size: 9px; flex-shrink: 0; color: var(--px-dim); }
.state-thinking .win-dot { color: var(--px-yellow); animation: blink 0.8s step-end infinite; }
.state-working  .win-dot { color: var(--px-cyan);   }
.state-done     .win-dot { color: var(--px-green);  }
.state-auth     .win-dot { color: var(--px-pink);   animation: blink 0.5s step-end infinite; }
.state-error    .win-dot { color: var(--px-red);    }

.win-name {
  font-size: 8px;
  color: var(--px-white);
  letter-spacing: 1px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  text-transform: uppercase;
}
.win-session {
  font-size: 11px;
  font-family: var(--px-font-cn);
  color: var(--px-cyan);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.win-path {
  font-size: 7px;
  font-family: var(--px-font-mono);
  color: var(--px-dim);
  white-space: nowrap;
  flex-shrink: 0;
}
.win-tok {
  font-size: 7px;
  color: var(--px-yellow);
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 1px;
  background: rgba(255, 230, 0, 0.07);
  padding: 1px 5px;
  border: 1px solid rgba(255, 230, 0, 0.2);
}
.win-close {
  margin-left: 4px;
  background: var(--px-bg0);
  border: 2px solid var(--px-red);
  color: var(--px-red);
  font-family: var(--px-font);
  font-size: 10px;
  width: 20px; height: 20px;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 2px 0 #660022;
  transition: transform 0.05s steps(1), box-shadow 0.05s steps(1);
}
.win-close:hover  { background: var(--px-red); color: var(--px-bg0); }
.win-close:active { transform: translate(2px, 2px); box-shadow: none; }

/* ── EXP Bar ──────────────────────────────────────── */
.exp-track {
  height: 4px;
  background: var(--px-bg0);
  border-bottom: 1px solid var(--px-border);
  flex-shrink: 0;
}
.exp-bar {
  height: 100%;
  max-width: 100%;
  background: var(--px-green);
  transition: width 0.8s steps(20);
}
.state-thinking .exp-bar { background: var(--px-yellow); }
.state-working  .exp-bar { background: var(--px-cyan);   }
.state-auth     .exp-bar { background: var(--px-pink);   }
.state-error    .exp-bar { background: var(--px-red);    }

/* ── Stat Card ────────────────────────────────────── */
.stat-card {
  display: flex;
  align-items: stretch;
  background: var(--px-bg2);
  border-bottom: 2px solid var(--px-border);
  flex-shrink: 0;
  min-height: 56px;
}

/* Left-edge color bar — core RPG UI accent */
.stat-accent { width: 4px; flex-shrink: 0; background: var(--px-dim); }
.state-thinking .stat-accent { background: var(--px-yellow); }
.state-working  .stat-accent { background: var(--px-cyan);   }
.state-done     .stat-accent { background: var(--px-green);  }
.state-auth     .stat-accent { background: var(--px-pink);   }
.state-error    .stat-accent { background: var(--px-red);    }

.stat-icon {
  font-family: var(--px-font);
  font-size: 8px;
  min-width: 40px;
  padding: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 1px;
  color: var(--px-dim);
  border-right: 1px solid var(--px-border);
  flex-shrink: 0;
}
.state-thinking .stat-icon { color: var(--px-yellow); animation: blink 0.8s step-end infinite; }
.state-working  .stat-icon { color: var(--px-cyan);   }
.state-done     .stat-icon { color: var(--px-green);  }
.state-auth     .stat-icon { color: var(--px-pink);   animation: blink 0.5s step-end infinite; }
.state-error    .stat-icon { color: var(--px-red);    }

.stat-body {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.stat-input { display: flex; align-items: baseline; gap: 5px; }
.input-caret { font-size: 9px; color: var(--px-cyan); flex-shrink: 0; font-family: var(--px-font); }
.input-text {
  font-size: 13px;
  font-family: var(--px-font-cn);
  color: var(--px-white);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.stat-label { font-size: 12px; font-family: var(--px-font-cn); color: var(--px-white); line-height: 1.4; }
.stat-label-sub { font-size: 11px; color: var(--px-gray); }
.stat-detail {
  font-family: var(--px-font-mono);
  font-size: 14px;
  color: var(--px-gray);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  background: var(--px-bg0);
  padding: 1px 6px;
  border-left: 2px solid var(--px-dim);
}
.state-done .stat-detail {
  color: var(--px-green);
  border-left-color: var(--px-green);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 52px;
  overflow-y: auto;
}

.stat-ts {
  font-family: var(--px-font);
  font-size: 7px;
  color: var(--px-gray);
  padding: 6px 8px;
  align-self: flex-start;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

/* ── Event Log ─────────────────────────────────────── */
.log-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.log-hdr {
  padding: 4px 10px;
  font-size: 7px;
  color: var(--px-gray);
  background: var(--px-bg0);
  border-bottom: 2px solid var(--px-border);
  letter-spacing: 3px;
  flex-shrink: 0;
}
.log-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Grid-aligned game event log rows */
.log-row {
  display: grid;
  grid-template-columns: 14px 64px minmax(60px, max-content) 1fr;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.025);
  font-family: var(--px-font-mono);
  font-size: 14px;
  line-height: 1.3;
}
.log-row:hover { background: rgba(255,255,255,0.03); }

.row-sym { font-family: var(--px-font); font-size: 8px; text-align: center; color: var(--px-gray); }
.row-ts  { font-family: var(--px-font); font-size: 7px; color: var(--px-gray); letter-spacing: 0.5px; white-space: nowrap; }
.row-lbl { color: var(--px-white); font-size: 13px; white-space: nowrap; }
.row-det { color: var(--px-gray); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }

/* Row symbol state colors */
.row-thinking .row-sym { color: var(--px-yellow); }
.row-working  .row-sym { color: var(--px-cyan);   }
.row-done     .row-sym { color: var(--px-green);  }
.row-auth     .row-sym { color: var(--px-pink);   }
.row-error    .row-sym { color: var(--px-red);    }

/* Subtle row background for done/error */
.row-done  { background: rgba(0, 255, 65, 0.025); }
.row-error { background: rgba(255, 34, 68, 0.03); }

.log-empty {
  padding: 20px;
  text-align: center;
  color: var(--px-dim);
  font-size: 13px;
  font-family: var(--px-font-cn);
}
</style>

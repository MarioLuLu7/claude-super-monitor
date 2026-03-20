<template>
  <header class="status-bar">
    <span class="logo">◈ CLAUDE STATUS</span>

    <div class="project-area">
      <span class="label">PRJ</span>
      <select class="px-select" :value="currentProjectIdx" @change="onSelectProject">
        <option v-if="!projects.length" value="-1">-- 无项目 --</option>
        <option v-for="(p, i) in projects" :key="p.name" :value="i">
          {{ p.activeInIde ? '● ' : '○ ' }}{{ shortName(p.originalPath) }}
        </option>
      </select>

      <span class="label">SES</span>
      <select class="px-select" :value="currentSessionId" @change="onSelectSession">
        <option v-if="!sessions.length" value="">-- 无会话 --</option>
        <option v-for="s in sessions" :key="s.id" :value="s.id">
          {{ s.id.slice(0, 14) }}...  {{ fmtSize(s.size) }}
        </option>
      </select>
    </div>

    <div class="right">
      <span class="ide-count" v-if="activeIdeCount > 0">
        ● {{ activeIdeCount }} IDE
      </span>
      <span :class="['led', connected ? 'online' : 'connecting']"></span>
      <span :class="['conn', connected ? 'green' : 'yellow']">
        {{ connected ? 'LIVE' : 'OFF' }}
      </span>
      <span class="clock">{{ clock }}</span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Project, Session } from '../types';

const props = defineProps<{
  connected: boolean;
  projects: Project[];
  currentProjectName: string;
  currentSessionId: string;
  sessions: Session[];
}>();

const emit = defineEmits<{
  selectProject: [p: Project];
  selectSession: [s: Session];
}>();

const clock = ref('');
let timer: ReturnType<typeof setInterval>;

const activeIdeCount = computed(() => props.projects.filter(p => p.activeInIde).length);

// 根据 currentProjectName 反算当前选中的索引
const currentProjectIdx = computed(() => {
  const idx = props.projects.findIndex(p => p.name === props.currentProjectName);
  return idx >= 0 ? idx : 0;
});

function shortName(p: string) {
  return p.replace(/\\/g, '/').split('/').pop() ?? p;
}

function fmtSize(b: number) {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)}KB`;
  return `${(b / 1_048_576).toFixed(1)}MB`;
}

function onSelectProject(e: Event) {
  const i = Number((e.target as HTMLSelectElement).value);
  const proj = props.projects[i];
  if (proj) emit('selectProject', proj);
}

function onSelectSession(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  const sess = props.sessions.find(s => s.id === id);
  if (sess) emit('selectSession', sess);
}

function tick() {
  const n = new Date();
  clock.value = [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}

onMounted(() => { tick(); timer = setInterval(tick, 1000); });
onUnmounted(() => clearInterval(timer));

// 防止 TS unused-var 警告
</script>

<style scoped>
.status-bar {
  height: 48px;
  background: var(--px-bg1);
  border-bottom: 3px solid var(--px-green);
  box-shadow: 0 4px 0 rgba(0,255,65,0.15);
  display: flex;
  align-items: center;
  padding: 0 14px;
  gap: 14px;
  flex-shrink: 0;
}

.logo {
  font-size: 9px;
  color: var(--px-green);
  text-shadow: 0 0 10px var(--px-green);
  flex-shrink: 0;
}

.project-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.label { color: var(--px-dim); font-size: 7px; flex-shrink: 0; }

.right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.ide-count {
  font-size: 8px;
  color: var(--px-green);
  letter-spacing: 1px;
  text-shadow: 0 0 6px var(--px-green);
}
.conn  { font-size: 8px; }
.green { color: var(--px-green); }
.yellow { color: var(--px-yellow); }

.clock {
  font-size: 9px;
  color: var(--px-dim);
  min-width: 65px;
  text-align: right;
  letter-spacing: 1px;
}
</style>

<template>
  <Teleport to="body">
    <div v-if="request" class="auth-overlay" @click.self="() => {}">
      <div class="auth-box">

        <!-- 标题栏 -->
        <div class="auth-titlebar">
          <span class="blink">▶</span>
          <span class="auth-title">AUTHORIZATION REQUIRED</span>
          <span class="blink">◀</span>
        </div>

        <!-- 工具名 + 倒计时 -->
        <div class="tool-row">
          <span class="tool-icon">{{ toolIcon }}</span>
          <div class="tool-info">
            <span class="tool-name">{{ request.toolName }}</span>
            <span class="tool-sub">{{ toolDesc }}</span>
          </div>
          <div class="timer-block">
            <div :class="['timer-num', countdown <= 10 ? 'red-blink' : '']">{{ countdown }}</div>
            <div class="timer-bar">
              <div class="timer-fill" :style="{ height: progressPct + '%' }"></div>
            </div>
          </div>
        </div>

        <!-- 参数详情（可滚动） -->
        <div class="fields-scroll">
          <div v-for="field in fields" :key="field.label" class="field-row">
            <div class="field-label">{{ field.label }}</div>
            <div :class="['field-val', field.code ? 'code' : '']">{{ field.value }}</div>
          </div>
        </div>

        <!-- 按钮 -->
        <div class="btn-row">
          <button class="px-btn deny"    @click="respond(false)">✗  DENY</button>
          <button class="px-btn approve" @click="respond(true)">✓  APPROVE</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import type { AuthRequest } from '../types';

const props = defineProps<{ request: AuthRequest | null; autoApprove?: boolean }>();
const emit = defineEmits<{ respond: [requestId: string, approved: boolean] }>();

const TIMEOUT = 60;
const countdown = ref(TIMEOUT);
let timer: ReturnType<typeof setInterval> | null = null;
const progressPct = computed(() => (countdown.value / TIMEOUT) * 100);

// ── 工具元信息 ────────────────────────────────────────────────────────────────
const TOOL_META: Record<string, { icon: string; desc: string }> = {
  Bash:      { icon: '▶', desc: '执行 Shell 命令' },
  Write:     { icon: '✎', desc: '写入文件（新建/覆盖）' },
  Edit:      { icon: '✐', desc: '替换文件片段' },
  MultiEdit: { icon: '✐', desc: '多处替换文件' },
  Read:      { icon: '◉', desc: '读取文件' },
  Glob:      { icon: '⌕', desc: '按模式搜索文件' },
  Grep:      { icon: '⌕', desc: '搜索文件内容' },
  WebFetch:  { icon: '◈', desc: '请求网页' },
  WebSearch: { icon: '◈', desc: '搜索网络' },
  Agent:     { icon: '◆', desc: '启动子代理' },
  TodoWrite: { icon: '☑', desc: '更新任务列表' },
};

const toolIcon = computed(() => TOOL_META[props.request?.toolName ?? '']?.icon ?? '?');
const toolDesc = computed(() => TOOL_META[props.request?.toolName ?? '']?.desc ?? '调用工具');

// ── 按工具类型生成字段列表 ─────────────────────────────────────────────────────
interface Field { label: string; value: string; code?: boolean }

function buildFields(toolName: string, input: Record<string, unknown>): Field[] {
  const s = (k: string, max = 2000) => String(input[k] ?? '').slice(0, max);
  const exist = (k: string) => input[k] !== undefined && input[k] !== '';

  switch (toolName) {
    case 'Bash':
      return [
        { label: 'COMMAND', value: s('command', 2000), code: true },
        ...(exist('description') ? [{ label: 'DESCRIPTION', value: s('description') }] : []),
      ];

    case 'Write':
      return [
        { label: 'FILE PATH', value: s('file_path') },
        { label: 'CONTENT（前 40 行）', value: s('content').split('\n').slice(0, 40).join('\n'), code: true },
      ];

    case 'Edit':
      return [
        { label: 'FILE PATH',  value: s('file_path') },
        { label: 'REPLACE',    value: s('old_string', 600), code: true },
        { label: 'WITH',       value: s('new_string', 600), code: true },
      ];

    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits as Array<Record<string,unknown>> : [];
      return [
        { label: 'FILE PATH', value: s('file_path') },
        ...edits.flatMap((e, i): Field[] => [
          { label: `EDIT ${i + 1} REPLACE`, value: String(e.old_string ?? '').slice(0, 300), code: true },
          { label: `EDIT ${i + 1} WITH`,    value: String(e.new_string ?? '').slice(0, 300), code: true },
        ]),
      ];
    }

    case 'Glob':
      return [
        { label: 'PATTERN', value: s('pattern') },
        ...(exist('path') ? [{ label: 'PATH', value: s('path') }] : []),
      ];

    case 'Grep':
      return [
        { label: 'PATTERN',  value: s('pattern') },
        ...(exist('path')  ? [{ label: 'PATH',  value: s('path') }]  : []),
        ...(exist('glob')  ? [{ label: 'GLOB',  value: s('glob') }]  : []),
        ...(exist('type')  ? [{ label: 'TYPE',  value: s('type') }]  : []),
      ];

    case 'WebFetch':
      return [
        { label: 'URL',    value: s('url') },
        { label: 'PROMPT', value: s('prompt', 400) },
      ];

    case 'WebSearch':
      return [{ label: 'QUERY', value: s('query') }];

    case 'Agent':
      return [
        { label: 'DESCRIPTION', value: s('description') },
        { label: 'PROMPT',      value: s('prompt', 600) },
      ];

    default:
      return Object.entries(input)
        .slice(0, 8)
        .map(([k, v]) => ({ label: k.toUpperCase(), value: String(v).slice(0, 400) }));
  }
}

const fields = computed<Field[]>(() =>
  props.request ? buildFields(props.request.toolName, props.request.toolInput) : [],
);

// ── 倒计时 ────────────────────────────────────────────────────────────────────
function startTimer() {
  stopTimer();
  countdown.value = TIMEOUT;
  timer = setInterval(() => { countdown.value--; if (countdown.value <= 0) respond(false); }, 1000);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function respond(approved: boolean) {
  stopTimer();
  if (props.request) emit('respond', props.request.requestId, approved);
}

watch(() => props.request, (r) => {
  if (!r) { stopTimer(); return; }
  if (props.autoApprove) { respond(true); return; }
  startTimer();
}, { immediate: true });
onUnmounted(stopTimer);
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.auth-box {
  width: 600px;
  max-height: 82vh;
  background: var(--px-bg1);
  border: 3px solid var(--px-yellow);
  /* Classic pixel double-border window shadow */
  box-shadow: 4px 4px 0 var(--px-bg0), 6px 6px 0 var(--px-yellow);
  font-family: var(--px-font);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 标题栏 */
.auth-titlebar {
  background: var(--px-yellow);
  color: #000;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  font-size: 9px;
  letter-spacing: 2px;
  flex-shrink: 0;
}
.auth-title { letter-spacing: 3px; font-size: 8px; }

/* 工具行 */
.tool-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px 10px;
  flex-shrink: 0;
  border-bottom: 2px solid var(--px-border);
}
.tool-icon { font-size: 22px; color: var(--px-yellow); width: 32px; text-align: center; flex-shrink: 0; }
.tool-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.tool-name {
  font-size: 13px;
  color: var(--px-yellow);
  letter-spacing: 2px;
  text-shadow: var(--px-glow-yellow);
}
.tool-sub { font-size: 8px; color: var(--px-gray); letter-spacing: 1px; }

/* 倒计时竖条 */
.timer-block { display: flex; flex-direction: column; align-items: center; gap: 4px; flex-shrink: 0; }
.timer-num {
  font-size: 11px;
  color: var(--px-yellow);
  min-width: 24px;
  text-align: center;
}
.timer-num.red-blink { color: var(--px-red); animation: blink 0.5s step-end infinite; }
.timer-bar {
  width: 8px;
  height: 44px;
  background: var(--px-bg0);
  border: 2px solid var(--px-dim);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.timer-fill {
  width: 100%;
  background: var(--px-yellow);
  transition: height 1s steps(10);
}

/* 字段区（可滚动） */
.fields-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 10px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.fields-scroll::-webkit-scrollbar { width: 6px; }
.fields-scroll::-webkit-scrollbar-track { background: var(--px-bg0); }
.fields-scroll::-webkit-scrollbar-thumb { background: var(--px-dim); }

.field-row { display: flex; flex-direction: column; gap: 3px; }
.field-label {
  font-size: 7px;
  color: var(--px-gray);
  letter-spacing: 2px;
}
.field-val {
  font-family: var(--px-font-mono);
  font-size: 15px;
  color: var(--px-green);
  word-break: break-all;
  line-height: 1.4;
  white-space: pre-wrap;
  background: var(--px-bg0);
  padding: 6px 10px;
  border-left: 2px solid var(--px-dim);
  max-height: 160px;
  overflow-y: auto;
}
.field-val.code {
  color: var(--px-cyan);
  border-left-color: var(--px-cyan);
}
.field-val::-webkit-scrollbar { width: 4px; }
.field-val::-webkit-scrollbar-thumb { background: var(--px-dim); }

/* 按钮行 */
.btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 2px solid var(--px-border);
  flex-shrink: 0;
}
.px-btn {
  padding: 12px;
  font-family: var(--px-font);
  font-size: 10px;
  letter-spacing: 3px;
  border: none;
  cursor: pointer;
  transition: filter 0.05s steps(1);
}
.px-btn:active { filter: brightness(1.6); }
.deny {
  background: var(--px-bg2);
  color: var(--px-red);
  border-right: 2px solid var(--px-border);
}
.approve {
  background: var(--px-bg2);
  color: var(--px-green);
}
.deny:hover    { background: rgba(255, 34, 68, 0.15); }
.approve:hover { background: rgba(0, 255, 65, 0.12); }

@keyframes blink { 50% { opacity: 0; } }
</style>

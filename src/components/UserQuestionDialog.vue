<template>
  <Teleport to="body">
    <div v-if="request" class="uq-overlay">
      <div class="uq-box">

        <!-- 标题栏 -->
        <div class="uq-titlebar">
          <span class="blink">▶</span>
          <span class="uq-title">CLAUDE IS ASKING</span>
          <span class="blink">◀</span>
        </div>

        <!-- 会话来源 -->
        <div class="uq-session">
          <span class="uq-session-icon">◈</span>
          <span class="uq-session-key">{{ request.sessionKey ? request.sessionKey.split('/').pop() : 'HOOK REQUEST' }}</span>
          <span v-if="isInteractive" class="uq-badge-interactive">INTERACTIVE</span>
          <span v-else class="uq-badge">WAITING FOR YOUR INPUT</span>
        </div>

        <!-- 问题列表 -->
        <div class="uq-questions">
          <div v-for="(q, qi) in request.questions" :key="qi" class="uq-question-block">

            <!-- 问题头部标签 -->
            <div class="uq-q-header">
              <span class="uq-q-tag">{{ q.header }}</span>
              <span v-if="q.multiSelect" class="uq-multi-tag">MULTI</span>
            </div>

            <!-- 问题文本 -->
            <div class="uq-q-text">{{ q.question }}</div>

            <!-- 选项列表 -->
            <div class="uq-options">

              <!-- 预设选项 -->
              <div
                v-for="(opt, oi) in q.options"
                :key="oi"
                class="uq-option"
                :class="{
                  'uq-option--selected': isSelected(q.header, opt.label),
                  'uq-option--interactive': isInteractive
                }"
                @click="isInteractive ? toggleOption(q.header, opt.label, q.multiSelect ?? false) : null"
              >
                <span class="uq-opt-idx">{{ oi + 1 }}</span>
                <div class="uq-opt-body">
                  <div class="uq-opt-label">{{ opt.label }}</div>
                  <div v-if="opt.description" class="uq-opt-desc">{{ opt.description }}</div>
                </div>
                <span v-if="isSelected(q.header, opt.label)" class="uq-opt-check">✓</span>
              </div>

              <!-- Other 自定义输入项（仅交互式） -->
              <div
                v-if="isInteractive"
                class="uq-option uq-option--interactive"
                :class="{ 'uq-option--selected': isOtherSelected(q.header) }"
                @click="toggleOther(q.header, q.multiSelect ?? false)"
              >
                <span class="uq-opt-idx uq-opt-idx--other">✎</span>
                <div class="uq-opt-body">
                  <div class="uq-opt-label uq-opt-label--other">Other</div>
                  <input
                    v-if="isOtherSelected(q.header)"
                    v-model="customInputs[q.header]"
                    class="uq-other-input"
                    placeholder="输入自定义答案…"
                    @click.stop
                    @keydown.enter.stop="canSubmit && submit()"
                  />
                </div>
                <span v-if="isOtherSelected(q.header)" class="uq-opt-check">✓</span>
              </div>

            </div>

          </div>
        </div>

        <!-- 底部按钮 -->
        <div class="uq-footer">
          <span v-if="!isInteractive" class="uq-hint">↩ 请在终端/IDE 中作答</span>
          <span v-else-if="!canSubmit" class="uq-hint">请选择所有问题的答案</span>
          <span v-else class="uq-hint uq-hint--ready">↩ 点击 SUBMIT 或按 Enter 提交</span>

          <div class="uq-actions">
            <button v-if="isInteractive" class="px-btn submit-btn" :disabled="!canSubmit" @click="submit">SUBMIT</button>
            <button class="px-btn close-btn" @click="$emit('dismiss')">{{ isInteractive ? 'CANCEL' : '✓ GOT IT' }}</button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { UserQuestionRequest } from '../types';

const props = defineProps<{ request: UserQuestionRequest | null }>();
const emit = defineEmits<{
  answer: [requestId: string, answers: Record<string, string[]>];
  dismiss: [];
}>();

const OTHER_SENTINEL = '__other__';

const isInteractive = computed(() => !!props.request?.requestId);

const selectedAnswers = ref<Record<string, string[]>>({});
const customInputs    = ref<Record<string, string>>({});

watch(() => props.request, (newReq) => {
  selectedAnswers.value = {};
  customInputs.value    = {};
  if (newReq?.questions) {
    for (const q of newReq.questions) {
      selectedAnswers.value[q.header] = [];
      customInputs.value[q.header]    = '';
    }
  }
}, { immediate: true });

function isSelected(header: string, label: string): boolean {
  return selectedAnswers.value[header]?.includes(label) ?? false;
}
function isOtherSelected(header: string): boolean {
  return isSelected(header, OTHER_SENTINEL);
}

function toggleOption(header: string, label: string, multiSelect: boolean) {
  const current = selectedAnswers.value[header] ?? [];
  if (multiSelect) {
    selectedAnswers.value[header] = current.includes(label)
      ? current.filter(l => l !== label)
      : [...current, label];
  } else {
    selectedAnswers.value[header] = [label];
  }
}
function toggleOther(header: string, multiSelect: boolean) {
  toggleOption(header, OTHER_SENTINEL, multiSelect);
}

const canSubmit = computed(() => {
  if (!props.request?.questions.length) return false;
  return props.request.questions.every(q => {
    const selected = selectedAnswers.value[q.header] ?? [];
    if (selected.length === 0) return false;
    // Other 选中时必须有自定义文本
    if (selected.includes(OTHER_SENTINEL) && !customInputs.value[q.header]?.trim()) return false;
    return true;
  });
});

function submit() {
  if (!props.request?.requestId || !canSubmit.value) return;
  const finalAnswers: Record<string, string[]> = {};
  for (const q of props.request.questions) {
    finalAnswers[q.header] = (selectedAnswers.value[q.header] ?? []).map(label =>
      label === OTHER_SENTINEL ? (customInputs.value[q.header]?.trim() || 'Other') : label
    );
  }
  emit('answer', props.request.requestId, finalAnswers);
}
</script>

<style scoped>
.uq-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.80);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.uq-box {
  width: 560px;
  max-height: 85vh;
  background: var(--px-bg1);
  border: 3px solid var(--px-cyan);
  box-shadow: 4px 4px 0 var(--px-bg0), 6px 6px 0 var(--px-cyan);
  font-family: var(--px-font);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.uq-titlebar {
  background: var(--px-cyan);
  color: #000;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  font-size: 9px;
  letter-spacing: 2px;
  flex-shrink: 0;
}
.uq-title { letter-spacing: 3px; font-size: 8px; }

.uq-session {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px 8px;
  border-bottom: 2px solid var(--px-border);
  flex-shrink: 0;
}
.uq-session-icon { color: var(--px-cyan); font-size: 14px; }
.uq-session-key  { color: var(--px-cyan); font-size: 10px; letter-spacing: 1px; flex: 1; }
.uq-badge {
  font-size: 7px;
  color: var(--px-yellow);
  border: 1px solid var(--px-yellow);
  padding: 2px 5px;
  letter-spacing: 1px;
  animation: blink 1.2s step-end infinite;
}
.uq-badge-interactive {
  font-size: 7px;
  color: var(--px-green);
  border: 1px solid var(--px-green);
  padding: 2px 5px;
  letter-spacing: 1px;
  animation: blink 1.2s step-end infinite;
}

.uq-questions {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.uq-questions::-webkit-scrollbar { width: 6px; }
.uq-questions::-webkit-scrollbar-track { background: var(--px-bg0); }
.uq-questions::-webkit-scrollbar-thumb { background: var(--px-dim); }

.uq-question-block { display: flex; flex-direction: column; gap: 8px; }

.uq-q-header { display: flex; align-items: center; gap: 6px; }
.uq-q-tag {
  font-size: 7px;
  color: var(--px-bg1);
  background: var(--px-cyan);
  padding: 2px 6px;
  letter-spacing: 1px;
}
.uq-multi-tag {
  font-size: 7px;
  color: var(--px-yellow);
  border: 1px solid var(--px-yellow);
  padding: 1px 4px;
  letter-spacing: 1px;
}

.uq-q-text {
  font-family: var(--px-font-cn);
  font-size: 12px;
  color: var(--px-gray);
  line-height: 1.5;
  white-space: pre-wrap;
}

.uq-options { display: flex; flex-direction: column; gap: 4px; padding-left: 4px; }

.uq-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 10px;
  background: var(--px-bg0);
  border-left: 2px solid var(--px-dim);
  transition: background 0.05s steps(1);
}
.uq-option--interactive:hover { background: var(--px-bg2); cursor: pointer; }
.uq-option--selected {
  background: rgba(0, 255, 180, 0.12);
  border-left: 2px solid var(--px-cyan);
}
.uq-option--selected .uq-opt-label { color: var(--px-cyan); }

.uq-opt-idx {
  font-size: 9px;
  color: var(--px-cyan);
  min-width: 14px;
  text-align: center;
  flex-shrink: 0;
  margin-top: 1px;
}
.uq-opt-idx--other { color: #a0a0d0; }
.uq-option--selected .uq-opt-idx--other { color: var(--px-cyan); }

.uq-opt-body  { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.uq-opt-label { font-size: 11px; color: var(--px-green); letter-spacing: 0.5px; font-family: var(--px-font-cn); }
.uq-opt-label--other { color: #a0a0d0; font-style: italic; }
.uq-option--selected .uq-opt-label--other { color: var(--px-cyan); font-style: normal; }
.uq-opt-desc  { font-size: 11px; color: #9090c0; line-height: 1.5; font-family: var(--px-font-cn); }
.uq-opt-check { font-size: 10px; color: var(--px-cyan); margin-left: 4px; flex-shrink: 0; margin-top: 1px; }

/* Other 输入框 */
.uq-other-input {
  width: 100%;
  background: var(--px-bg1);
  border: 1px solid var(--px-cyan);
  color: var(--px-green);
  font-family: var(--px-font-cn);
  font-size: 11px;
  padding: 4px 8px;
  outline: none;
  box-sizing: border-box;
  caret-color: var(--px-cyan);
}
.uq-other-input::placeholder { color: var(--px-dim); }
.uq-other-input:focus { border-color: var(--px-green); box-shadow: 0 0 0 1px var(--px-green); }

.uq-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 2px solid var(--px-border);
  flex-shrink: 0;
}
.uq-hint        { font-size: 8px; color: var(--px-dim); letter-spacing: 1px; }
.uq-hint--ready { color: var(--px-green); }
.uq-actions     { display: flex; gap: 8px; }

.px-btn {
  padding: 8px 18px;
  font-family: var(--px-font);
  font-size: 9px;
  letter-spacing: 3px;
  border: 2px solid;
  cursor: pointer;
  box-shadow: 2px 2px 0 #003355;
  transition: transform 0.05s steps(1), box-shadow 0.05s steps(1);
}
.submit-btn { border-color: var(--px-green); background: var(--px-bg2); color: var(--px-green); }
.submit-btn:hover:not(:disabled) { background: var(--px-green); color: var(--px-bg0); }
.submit-btn:active:not(:disabled) { transform: translate(2px, 2px); box-shadow: none; }
.submit-btn:disabled { border-color: var(--px-dim); background: var(--px-bg0); color: var(--px-dim); cursor: not-allowed; box-shadow: none; }
.close-btn { border-color: var(--px-cyan); background: var(--px-bg2); color: var(--px-cyan); }
.close-btn:hover { background: var(--px-cyan); color: var(--px-bg0); }
.close-btn:active { transform: translate(2px, 2px); box-shadow: none; }

@keyframes blink { 50% { opacity: 0; } }
</style>

<template>
  <Teleport to="body">
    <div v-if="show" class="settings-overlay" @click.self="close">
      <div class="settings-box">

        <!-- 标题栏 -->
        <div class="settings-titlebar">
          <span class="blink">⚙</span>
          <span class="settings-title">SETTINGS</span>
          <span class="blink">⚙</span>
        </div>

        <!-- 配置项列表 -->
        <div class="settings-body">

          <!-- 自动授权 -->
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">AUTO APPROVE</div>
              <div class="setting-desc">{{ t('settings_auto_approve_desc') }}</div>
            </div>
            <button
              :class="['toggle-btn', draft.autoApprove ? 'toggle-on' : 'toggle-off']"
              @click="draft.autoApprove = !draft.autoApprove"
            >
              {{ draft.autoApprove ? 'ON' : 'OFF' }}
            </button>
          </div>

          <div class="setting-divider"></div>

          <!-- 语言 -->
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">LANGUAGE</div>
              <div class="setting-desc">{{ t('settings_language_desc') }}</div>
            </div>
            <div class="lang-toggle">
              <button
                :class="['lang-btn', draft.language === 'zh' ? 'lang-active' : '']"
                @click="draft.language = 'zh'"
              >中文</button>
              <button
                :class="['lang-btn', draft.language === 'en' ? 'lang-active' : '']"
                @click="draft.language = 'en'"
              >EN</button>
            </div>
          </div>

          <div class="setting-divider"></div>

          <!-- 显示思考内容 -->
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">SHOW THINKING</div>
              <div class="setting-desc">{{ t('settings_show_thinking_desc') }}</div>
            </div>
            <button
              :class="['toggle-btn', draft.showThinkingDetail ? 'toggle-on' : 'toggle-off']"
              @click="draft.showThinkingDetail = !draft.showThinkingDetail"
            >
              {{ draft.showThinkingDetail ? 'ON' : 'OFF' }}
            </button>
          </div>

          <div class="setting-divider"></div>

          <!-- 自动关闭延迟 -->
          <div class="setting-row">
            <div class="setting-info">
              <div class="setting-label">AUTO CLOSE DELAY</div>
              <div class="setting-desc">{{ t('settings_collapse_delay_desc') }}</div>
            </div>
            <div class="delay-input-wrap">
              <input
                class="delay-input"
                type="number"
                min="0"
                max="300"
                v-model.number="draft.collapseDelay"
              />
              <span class="delay-unit">S</span>
            </div>
          </div>

        </div>

        <!-- 保存按钮 -->
        <div class="settings-footer">
          <button class="save-btn" @click="save">✓  {{ t('settings_save') }}</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSettings, type Settings } from '../composables/useSettings';
import { useI18n } from '../composables/useI18n';
import type { I18nKey } from '../i18n/zh';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [value: boolean] }>();

const { settings } = useSettings();
const { t: tComputed } = useI18n();
const t = (key: I18nKey) => tComputed.value(key);

// 编辑草稿，保存时才写入
const draft = ref<Settings>({ ...settings.value });

watch(() => props.show, (v) => {
  if (v) draft.value = { ...settings.value };
});

function save() {
  // 校验
  if (isNaN(draft.value.collapseDelay) || draft.value.collapseDelay < 0) {
    draft.value.collapseDelay = 0;
  }
  if (draft.value.collapseDelay > 300) {
    draft.value.collapseDelay = 300;
  }
  settings.value = { ...draft.value };
  emit('update:show', false);
}

function close() {
  emit('update:show', false);
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-box {
  width: 460px;
  background: var(--px-bg1);
  border: 3px solid var(--px-cyan);
  box-shadow: 4px 4px 0 var(--px-bg0), 6px 6px 0 var(--px-cyan);
  font-family: var(--px-font);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-titlebar {
  background: var(--px-cyan);
  color: #000;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 12px;
  font-size: 9px;
  letter-spacing: 3px;
  flex-shrink: 0;
}
.settings-title { letter-spacing: 4px; font-size: 8px; }

.settings-body {
  padding: 16px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
}

.setting-divider {
  height: 2px;
  background: var(--px-border);
}

.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 9px;
  color: var(--px-cyan);
  letter-spacing: 2px;
}

.setting-desc {
  font-size: 13px;
  color: var(--px-gray);
  letter-spacing: 0.5px;
  font-family: var(--px-font-cn);
  line-height: 1.4;
}

/* 开关按钮 */
.toggle-btn {
  font-family: var(--px-font);
  font-size: 8px;
  letter-spacing: 2px;
  padding: 5px 12px;
  border: 2px solid;
  cursor: pointer;
  min-width: 48px;
  text-align: center;
  flex-shrink: 0;
  transition: transform 0.05s steps(1), box-shadow 0.05s steps(1);
}
.toggle-on {
  background: rgba(0,255,65,0.1);
  color: var(--px-green);
  border-color: var(--px-green);
  box-shadow: 2px 2px 0 #006018;
}
.toggle-off {
  background: var(--px-bg2);
  color: var(--px-dim);
  border-color: var(--px-border);
  box-shadow: 2px 2px 0 var(--px-bg0);
}
.toggle-btn:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
.toggle-on:hover  { background: var(--px-green); color: var(--px-bg0); }
.toggle-off:hover { border-color: var(--px-dim); color: var(--px-gray); }

/* 延迟输入 */
.delay-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.delay-input {
  width: 52px;
  background: var(--px-bg0);
  border: 2px solid var(--px-dim);
  color: var(--px-green);
  font-family: var(--px-font);
  font-size: 12px;
  padding: 4px 6px;
  text-align: center;
  outline: none;
}
.delay-input:focus { border-color: var(--px-cyan); }
.delay-unit {
  font-size: 7px;
  color: var(--px-gray);
  letter-spacing: 1px;
}

/* 语言切换 */
.lang-toggle {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
}
.lang-btn {
  font-family: var(--px-font);
  font-size: 8px;
  letter-spacing: 1px;
  padding: 5px 10px;
  border: 2px solid var(--px-border);
  background: var(--px-bg2);
  color: var(--px-dim);
  cursor: pointer;
  transition: transform 0.05s steps(1);
  box-shadow: 2px 2px 0 var(--px-bg0);
}
.lang-btn:active { transform: translate(2px, 2px); box-shadow: none; }
.lang-active {
  border-color: var(--px-green);
  color: var(--px-green);
  background: rgba(0,255,65,0.08);
  box-shadow: 2px 2px 0 #006018;
}

/* 底部保存 */
.settings-footer {
  border-top: 2px solid var(--px-border);
  flex-shrink: 0;
}
.save-btn {
  width: 100%;
  padding: 12px;
  background: var(--px-bg2);
  color: var(--px-cyan);
  font-family: var(--px-font);
  font-size: 9px;
  letter-spacing: 3px;
  border: none;
  cursor: pointer;
  transition: filter 0.05s steps(1), background 0.05s steps(1);
  box-shadow: inset 0 -3px 0 var(--px-border);
}
.save-btn:hover  { background: rgba(0,229,255,0.12); color: var(--px-white); }
.save-btn:active { filter: brightness(1.6); }

@keyframes blink { 50% { opacity: 0; } }
.blink { animation: blink 1.2s step-end infinite; }
</style>

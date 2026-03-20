import { ref, watch } from 'vue';

export interface Settings {
  autoApprove: boolean;
  collapseDelay: number; // 秒，0 = 不自动关闭
  language: 'zh' | 'en';
  showThinkingDetail: boolean; // 是否在思考中状态显示思考内容
}

const STORAGE_KEY = 'claude-monitor-settings';

const defaults: Settings = {
  autoApprove: false,
  collapseDelay: 30,
  language: 'zh',
  showThinkingDetail: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

const settings = ref<Settings>(load());

watch(settings, (val) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
}, { deep: true });

export function useSettings() {
  return { settings };
}

import { computed } from 'vue';
import { useSettings } from './useSettings';
import { zh, type I18nKey } from '../i18n/zh';
import { en } from '../i18n/en';

const dicts = { zh, en } as const;

export function useI18n() {
  const { settings } = useSettings();

  const t = computed(() => (key: I18nKey): string => {
    const lang = settings.value.language;
    return dicts[lang]?.[key] ?? zh[key] ?? key;
  });

  return { t };
}

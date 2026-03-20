<template>
  <div v-if="notifications.length" class="notif-bar">
    <span class="notif-label">◈ DONE</span>
    <div class="notif-list" ref="listEl" @wheel.prevent="onWheel">
      <button
        v-for="n in notifications"
        :key="n.key"
        class="notif-chip"
        @click="$emit('restore', n.key)"
        :title="`${n.text}${n.detail ? ' · ' + n.detail : ''}`"
      >
        {{ n.displayName }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Notification } from '../types';

defineProps<{ notifications: Notification[] }>();
defineEmits<{ restore: [key: string] }>();

const listEl = ref<HTMLElement | null>(null);
function onWheel(e: WheelEvent) {
  if (listEl.value) listEl.value.scrollLeft += e.deltaY || e.deltaX;
}
</script>

<style scoped>
.notif-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  height: 28px;
  background: var(--px-bg2);
  border-bottom: 2px solid var(--px-green);
  flex-shrink: 0;
  overflow: hidden;
  font-family: var(--px-font);
}

.notif-label {
  font-size: 7px;
  color: var(--px-green);
  letter-spacing: 2px;
  flex-shrink: 0;
  opacity: 0.8;
}

.notif-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
  flex: 1;
}
.notif-list::-webkit-scrollbar { display: none; }

.notif-chip {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  border: 1px solid var(--px-green);
  background: transparent;
  color: var(--px-green);
  font-family: var(--px-font);
  font-size: 7px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  letter-spacing: 0.5px;
  box-shadow: 2px 2px 0 #006018;
  transition: transform 0.05s steps(1), box-shadow 0.05s steps(1);
}
.notif-chip:hover {
  background: var(--px-green);
  color: var(--px-bg0);
}
.notif-chip:active {
  transform: translate(2px, 2px);
  box-shadow: none;
}
</style>

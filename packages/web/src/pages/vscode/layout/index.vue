<template>
  <div class="h-full w-full flex flex-col text-[--foreground]">
    <div class="flex-1 overflow-auto">
      <RouterView v-slot="{ Component, route: routev }">
        <KeepAlive :max="5">
          <component :is="Component" v-if="routev.meta.keepAlive" :key="routev.fullPath" />
        </KeepAlive>
        <component :is="Component" v-if="!routev.meta.keepAlive" :key="routev.fullPath" />
      </RouterView>
    </div>
    <div v-if="!hideBtmBar" class="flex items-center gap-4 px-8 py-4">
      <template v-if="isReading">
        <div class="codicon codicon-list-unordered vsc-toolbar-btn" title="目录" @click="openChapters"></div>
        <div class="codicon codicon-search vsc-toolbar-btn" title="在正文中查找 (Ctrl+F)" @click="openFind"></div>
      </template>
      <div class="flex-1"></div>
      <div class="codicon codicon-library vsc-toolbar-btn" title="书架" @click="router.push('/home')"></div>
      <div
        class="codicon codicon-settings-gear vsc-toolbar-btn"
        :class="{ 'vsc-toolbar-btn--on': route.path === '/settings' }"
        :title="route.path === '/settings' ? '返回阅读' : '设置'"
        @click="toggleSettings"
      ></div>
    </div>
  </div>
</template>

<script setup>
// import '@/assets/vscode.css';
import '@/plugins/vsc-ui';
import { useBus, EVENT_CHAPTERS_BOX, EVENT_FIND_BOX } from '@/utils/bus';

const route = useRoute();
const router = useRouter();

const hideBtmBar = computed(() => route.meta?.hideBtmBar);
const isReading = computed(() => route.path === '/content');

const chaptersBus = useBus(EVENT_CHAPTERS_BOX);
const findBus = useBus(EVENT_FIND_BOX);

function openChapters() {
  chaptersBus.emit(EVENT_CHAPTERS_BOX);
}

function openFind() {
  findBus.emit(EVENT_FIND_BOX);
}

// 设置按钮是开关：在设置页再点一次就回到点它之前的位置
const settingsReturn = ref('/home');
watch(
  () => route.fullPath,
  (now, prev) => {
    if (now.startsWith('/settings') && prev && !prev.startsWith('/settings')) settingsReturn.value = prev;
  }
);

function toggleSettings() {
  router.push(route.path === '/settings' ? settingsReturn.value : '/settings');
}
</script>

<style scoped>
.vsc-toolbar-btn--on {
  color: var(--vscode-textLink-foreground, #3794ff);
}
</style>

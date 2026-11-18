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
        <div
          class="codicon codicon-list-unordered vsc-toolbar-btn"
          :class="{ 'vsc-toolbar-btn--on': ui.chaptersOpen }"
          :title="ui.chaptersOpen ? '关闭目录' : '目录'"
          @click="ui.toggleChapters()"
        ></div>
        <div
          class="codicon codicon-search vsc-toolbar-btn"
          :class="{ 'vsc-toolbar-btn--on': ui.findOpen }"
          :title="ui.findOpen ? '关闭查找 (Esc)' : '在正文中查找 (Ctrl+F)'"
          @click="ui.toggleFind()"
        ></div>
      </template>
      <div class="flex-1"></div>
      <div
        class="codicon codicon-library vsc-toolbar-btn"
        :class="{ 'vsc-toolbar-btn--on': onShelf }"
        :title="onShelf ? '回到阅读' : '书架'"
        @click="toggleShelf"
      ></div>
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
import { useUiStore } from '@/stores/ui';

const route = useRoute();
const router = useRouter();
const ui = useUiStore();

const hideBtmBar = computed(() => route.meta?.hideBtmBar);
const isReading = computed(() => route.path === '/content');
const onShelf = computed(() => route.path === '/home');

// 离开正文页时收起正文内的面板，回来不会莫名其妙弹出
watch(
  () => route.path,
  (path) => {
    if (path !== '/content') ui.closePanels();
  }
);

// 书架按钮是开关：再点一次回到上次读的那本书（不带 chapterPath，走续读定位）
const lastReadQuery = ref({});
watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/content') return;
    const { chapterPath: _c, percentage: _p, anchor: _a, ...rest } = route.query;
    lastReadQuery.value = rest;
  },
  { immediate: true }
);

function toggleShelf() {
  if (onShelf.value) {
    if (lastReadQuery.value.filePath || lastReadQuery.value.ruleId) {
      router.push({ path: '/content', query: lastReadQuery.value });
    }
    return;
  }
  router.push('/home');
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

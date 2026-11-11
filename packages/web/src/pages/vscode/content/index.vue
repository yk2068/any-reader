<template>
  <div class="relative h-full w-full flex flex-col overflow-hidden">
    <div v-if="loading" class="flex flex-1 items-center justify-center">
      <vscode-progress-ring></vscode-progress-ring>
    </div>
    <div
      id="text-container"
      ref="contentRef"
      v-focus
      tabindex="0"
      class="flex-1 overflow-y-auto whitespace-pre-wrap break-words p-10 indent-2em lh-1.5em outline-none"
      :style="{
        fontSize: settingStore.data.readStyle.fontSize + 'px',
        letterSpacing: settingStore.data.readStyle.letterSpacing + 'px'
      }"
      @click="onContentClick"
    >
      <template v-if="contentType === ContentType.MANGA">
        <img v-for="(row, idx) in content" :key="idx" class="center-row" :data-idx="idx" :src="row" />
      </template>
      <template v-else>
        <div v-for="(row, idx) in content" :key="idx" class="center-row" :data-idx="idx" v-html="row"></div>
      </template>
    </div>

    <!-- 正文查找 -->
    <div v-if="findVisible" class="find-bar">
      <input
        ref="findInputRef"
        v-model="findText"
        class="find-bar__input"
        type="text"
        :placeholder="findPlaceholder"
        spellcheck="false"
        @keydown.enter.exact.prevent="findNext"
        @keydown.enter.shift.exact.prevent="findPrev"
        @keydown.esc.prevent="closeFind"
      />
      <button class="find-bar__scope" :class="{ 'find-bar__scope--book': scope === 'book' }" title="搜索范围：本章 / 全书" @click="toggleScope">
        {{ scope === 'book' ? '全书' : '本章' }}
      </button>
      <button
        class="find-bar__count"
        :class="{ 'find-bar__count--link': scope === 'book' }"
        :title="scope === 'book' ? '查看结果列表' : ''"
        @click="scope === 'book' && openBookPanel()"
      >
        {{ findCount }}
      </button>
      <button class="find-bar__btn" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
      <button class="find-bar__btn" title="下一个 (Enter)" @click="findNext">↓</button>
      <button class="find-bar__btn" title="关闭 (Esc)" @click="closeFind">✕</button>
    </div>

    <!-- 全书查找结果 -->
    <div v-if="findVisible && scope === 'book' && bookPanelOpen" class="find-results">
      <div class="find-results__head">
        <span>{{ bookSearching ? `搜索中 ${bookDone}/${bookTotal}` : `全书 ${bookHits.length} 处` }}</span>
        <button class="find-results__close" title="收起" @click="bookPanelOpen = false">✕</button>
      </div>
      <div class="find-results__list">
        <div
          v-for="(hit, i) in bookHits"
          :key="`${hit.chapterPath}#${i}`"
          class="find-hit"
          :class="{ 'find-hit--active': i === activeHit }"
          @click="gotoBookHit(i)"
        >
          <div class="find-hit__chapter">{{ hit.chapterName }}</div>
          <div class="find-hit__text">{{ hit.before }}<mark>{{ hit.match }}</mark>{{ hit.after }}</div>
        </div>
        <div v-if="!bookHits.length && !bookSearching" class="find-hit--empty">无匹配</div>
      </div>
    </div>

    <!-- 目录 -->
    <div v-if="chaptersVisible" class="toc-mask" @click.self="chaptersVisible = false">
      <div ref="tocRef" class="toc-panel">
        <div class="toc-head" :title="readStore.title">{{ readStore.title || '目录' }}</div>
        <div class="toc-filter-wrap">
          <input v-model="chapterFilter" class="toc-filter" type="text" placeholder="筛选章节" spellcheck="false" />
        </div>
        <div class="toc-list">
          <div
            v-for="chapter in filteredChapters"
            :key="chapter.chapterPath"
            :title="chapter.name"
            :class="['toc-item', readStore.path === chapter.chapterPath ? 'toc-item--active' : '']"
            @click="gotoChapter(chapter.chapterPath)"
          >
            {{ chapter.name }}
          </div>
        </div>
      </div>
    </div>

    <!-- 跳转后返回 -->
    <div v-if="jumpBack" class="jump-back">
      <button class="jump-back__main" title="返回跳转前的位置" @click="returnFromJump">返回</button>
      <button class="jump-back__cancel" title="取消返回" @click="jumpBack = null">✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { message } from 'ant-design-vue';
import { ContentType } from '@any-reader/rule-utils';
import { useContent, useTheme } from '@/pages/common/content';
import { useChaptersStore } from '@/stores/chapters';
import { useReadStore } from '@/stores/read';
import { useBus, EVENT_CHAPTERS_BOX } from '@/utils/bus';
import { useFind } from '@/pages/common/find';

const contentRef = ref();

const readStore = useReadStore();
const chaptersStore = useChaptersStore();
const route = useRoute();
const router = useRouter();

const { content, contentType, settingStore, toChapter, loading } = useContent(contentRef);

useTheme(contentRef);

/* ---------------- 目录 ---------------- */

const chaptersVisible = ref(false);
const chapterFilter = ref('');
const tocRef = ref<HTMLElement>();

const filteredChapters = computed(() => {
  const kw = chapterFilter.value.trim().toLowerCase();
  if (!kw) return chaptersStore.chapters;
  return chaptersStore.chapters.filter((e: any) => (e.name || '').toLowerCase().includes(kw));
});

function scrollTocToCurrent() {
  const el = tocRef.value?.querySelector('.toc-item--active') as HTMLElement | null;
  el?.scrollIntoView({ block: 'center' });
}

function openChapters() {
  chapterFilter.value = '';
  chaptersVisible.value = true;
  nextTick(scrollTocToCurrent);
}

function gotoChapter(chapterPath: string) {
  chaptersVisible.value = false;
  toChapter(chapterPath);
}

/* ---------------- 正文查找 ---------------- */

const {
  findVisible,
  findText,
  findInputRef,
  scope,
  bookHits,
  bookPanelOpen,
  bookSearching,
  bookDone,
  bookTotal,
  activeHit,
  findCount,
  findPlaceholder,
  closeFind,
  findNext,
  findPrev,
  toggleScope,
  gotoBookHit,
  openBookPanel,
  clearFindMarks
} = useFind({ contentRef, content, contentType, toChapter });

// 底栏按钮通过事件总线唤起目录
const offChaptersBus = useBus(EVENT_CHAPTERS_BOX).on(openChapters);
onScopeDispose(() => offChaptersBus?.());

/* ---------------- EPUB 注释 / 锚点跳转 ---------------- */

function queryString(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

const jumpBack = ref<null | { top: number }>(null);

function baseName(filePath: string) {
  return (filePath || '').split('#')[0].split(/[\\/]/).pop() || '';
}

/** 当前章节在书内的文件路径（EPUB） */
function currentChapterHref() {
  const chapterPath = queryString(route.query.chapterPath);
  return chaptersStore.chapters.find((c: any) => c.chapterPath === chapterPath)?.chapterHref || '';
}

function scrollToAnchor(anchor: string, remember = true) {
  const root = contentRef.value as HTMLElement | undefined;
  if (!root || !anchor) return false;

  const id = decodeURIComponent(anchor);
  let el: HTMLElement | null = null;
  try {
    el = root.querySelector(`#${CSS.escape(id)}`);
  } catch (e) {
    el = null;
  }
  if (!el) {
    const byId = document.getElementById(id);
    if (byId && root.contains(byId)) el = byId;
  }
  if (!el) el = root.querySelector(`[name="${anchor}"]`);
  if (!el) return false;

  if (remember) jumpBack.value = { top: root.scrollTop };
  el.scrollIntoView({ block: 'center', behavior: 'auto' });
  el.classList.add('ar-anchor-flash');
  setTimeout(() => el?.classList.remove('ar-anchor-flash'), 1600);
  return true;
}

function returnFromJump() {
  if (!jumpBack.value) return;
  const top = jumpBack.value.top;
  jumpBack.value = null;
  (contentRef.value as HTMLElement | undefined)?.scrollTo({ top, behavior: 'auto' });
}

/**
 * 解析注释链接指向的章节。EPUB 解析器产出的 href 有两种形态：
 * - `<manifestId>/<path>/x.xhtml#note`（能找到 manifest 时）
 * - `x.xhtml#note` / `../Text/x.xhtml#note`（找不到时保留原样）
 * 两种情况都用文件名兜底匹配。
 */
function chapterByHref(filePart: string) {
  const name = decodeURIComponent(baseName(filePart));
  if (!name) return null;
  const idPart = filePart.split('/')[0];
  return (
    chaptersStore.chapters.find((c: any) => c.chapterPath === idPart) ||
    chaptersStore.chapters.find((c: any) => baseName(c.chapterHref || '') === name) ||
    null
  );
}

/**
 * 拦截正文内的链接：
 * - `#note1`            同章锚点，直接滚动
 * - `x.xhtml#note1`     同章或跨章注释，跨章时切章后定位
 * 外链一律拦截，避免 webview 被导航走。
 */
function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  const link = target?.closest?.('a') as HTMLAnchorElement | null;
  if (!link || !contentRef.value?.contains(link)) return;

  const href = link.getAttribute('href') || '';
  e.preventDefault();
  e.stopPropagation();
  if (!href || /^https?:/i.test(href) || href.startsWith('mailto:')) return;

  const [filePart, anchor] = href.split('#');
  if (!anchor) return;

  if (!filePart || baseName(filePart) === baseName(currentChapterHref())) {
    if (!scrollToAnchor(anchor)) jumpBack.value = null;
    return;
  }

  const chapter = chapterByHref(filePart);
  if (!chapter) return;

  // 同章（链接写全了文件名）直接滚，不走路由
  if (chapter.chapterPath === queryString(route.query.chapterPath)) {
    if (!scrollToAnchor(anchor)) jumpBack.value = null;
    return;
  }

  jumpBack.value = null;
  findVisible.value = false;
  clearFindMarks();
  router.replace({
    query: {
      ...route.query,
      chapterPath: chapter.chapterPath,
      percentage: 0,
      anchor
    }
  });
}

// 切章后定位锚点：内容一渲染就定位，最多等 2s
let anchorTimer = 0;

watch(
  () => [route.query.chapterPath, route.query.anchor, content.value.length],
  () => {
    const anchor = queryString(route.query.anchor);
    window.clearInterval(anchorTimer);
    if (!anchor) return;

    const deadline = Date.now() + 2000;
    const finish = () => {
      const { anchor: _anchor, ...rest } = route.query;
      router.replace({ query: rest });
    };
    const tryScroll = () => {
      if (scrollToAnchor(anchor, false)) {
        window.clearInterval(anchorTimer);
        finish();
        return;
      }
      if (Date.now() > deadline) {
        window.clearInterval(anchorTimer);
        finish();
      }
    };

    nextTick(() => {
      anchorTimer = window.setInterval(tryScroll, 40);
      tryScroll();
    });
  },
  { flush: 'post' }
);

watch(
  () => route.query.chapterPath,
  () => {
    jumpBack.value = null;
    chaptersVisible.value = false;
  }
);

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown, true);
  window.clearInterval(anchorTimer);
  clearFindMarks();
});

</script>

<style scoped>
:deep(p) {
  margin: 0;
  padding: 0;
}
:deep(img) {
  max-width: 100%;
  margin: 0 auto;
  display: block;
}

#text-container {
  /* font-family: var(--font); */
  background-color: var(--background-color);
  color: var(--text-color);
  line-height: var(--line-height);
}

.center-row {
  margin-bottom: calc(var(--section-spacing) * 1px);
  font-weight: var(--font-weight);
  opacity: var(--text-opacity);
}

/* 正文查找 */
.find-bar {
  position: absolute;
  top: 8px;
  right: 8px;
  left: 8px;
  z-index: 40;
  display: flex;
  gap: 6px;
  align-items: center;
  width: auto;
  max-width: 480px;
  margin-left: auto;
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 6px;
  background: var(--vscode-editorWidget-background, #252526);
  box-shadow: 0 4px 16px rgb(0 0 0 / 28%);
  padding: 4px 6px;
}

.find-bar__input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 4px;
  outline: none;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #cccccc);
  font-family: inherit;
  font-size: 12px;
  padding: 3px 6px;
}

.find-bar__input:focus {
  border-color: var(--vscode-focusBorder);
}

.find-bar__scope {
  flex: none;
  border: 1px solid var(--vscode-input-border, #454545);
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-descriptionForeground, #9d9d9d);
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  white-space: nowrap;
  padding: 2px 6px;
}

.find-bar__scope:hover {
  color: var(--vscode-foreground, #cccccc);
}

.find-bar__scope--book {
  border-color: transparent;
  background: var(--vscode-button-background, #0e639c);
  color: var(--vscode-button-foreground, #ffffff);
}

.find-bar__count {
  flex: none;
  min-width: 48px;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground, #9d9d9d);
  cursor: default;
  font-family: inherit;
  font-size: 11px;
  text-align: center;
  white-space: nowrap;
}

.find-bar__count--link {
  cursor: pointer;
  text-decoration: underline dotted;
}

.find-results {
  position: absolute;
  top: 44px;
  right: 8px;
  left: 8px;
  z-index: 39;
  display: flex;
  flex-direction: column;
  width: auto;
  max-width: 480px;
  max-height: 60%;
  margin-left: auto;
  overflow: hidden;
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 6px;
  background: var(--vscode-editorWidget-background, #252526);
  box-shadow: 0 8px 24px rgb(0 0 0 / 34%);
}

.find-results__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
  color: var(--vscode-descriptionForeground, #9d9d9d);
  font-size: 11px;
  padding: 5px 8px;
}

.find-results__close {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 10px;
}

.find-results__close:hover {
  background: var(--vscode-toolbar-hoverBackground, #5a5d5e);
  color: var(--vscode-foreground, #cccccc);
}

.find-results__list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 6px;
}

.find-hit {
  border-left: 2px solid transparent;
  cursor: pointer;
  padding: 5px 8px;
}

.find-hit:hover {
  background: var(--vscode-list-hoverBackground, #2a2d2e);
}

.find-hit--active {
  border-left-color: var(--vscode-focusBorder, #007fd4);
  background: var(--vscode-list-hoverBackground, #2a2d2e);
}

.find-hit__chapter {
  overflow: hidden;
  color: var(--vscode-descriptionForeground, #9d9d9d);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.find-hit__text {
  color: var(--vscode-foreground, #cccccc);
  font-size: 12px;
  line-height: 1.5;
  text-indent: 0;
  word-break: break-word;
}

.find-hit__text mark {
  border-radius: 2px;
  background: #ffd54f;
  color: #1a1a1a;
}

.find-hit--empty {
  color: var(--vscode-descriptionForeground, #9d9d9d);
  font-size: 12px;
  padding: 12px;
  text-align: center;
}

.find-bar__btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground, #cccccc);
  cursor: pointer;
  font-size: 12px;
}

.find-bar__btn:hover {
  background: var(--vscode-toolbar-hoverBackground, #5a5d5e);
}

:deep(mark.ar-find) {
  border-radius: 2px;
  background: #ffd54f;
  color: #1a1a1a;
  padding: 0 1px;
}

:deep(mark.ar-find--active) {
  background: #ff8f00;
  color: #fff;
}

:deep(.ar-anchor-flash) {
  border-radius: 4px;
  background: rgb(0 174 236 / 25%);
  transition: background 0.8s ease;
}

/* 目录 */
.toc-mask {
  position: absolute;
  inset: 0;
  z-index: 35;
  background: rgb(0 0 0 / 30%);
}

.toc-panel {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  display: flex;
  width: min(300px, 80%);
  flex-direction: column;
  border-right: 1px solid var(--vscode-editorWidget-border, #454545);
  background: var(--vscode-editorWidget-background, #252526);
  box-shadow: 2px 0 14px rgb(0 0 0 / 28%);
  color: var(--vscode-editorWidget-foreground, #cccccc);
}

.toc-head {
  overflow: hidden;
  border-bottom: 1px solid var(--vscode-editorWidget-border, #454545);
  color: var(--vscode-descriptionForeground, #9d9d9d);
  font-size: 12px;
  padding: 10px 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toc-filter-wrap {
  padding: 8px 12px;
}

.toc-filter {
  width: 100%;
  border: 1px solid var(--vscode-input-border, transparent);
  border-radius: 4px;
  outline: none;
  background: var(--vscode-input-background, #3c3c3c);
  color: var(--vscode-input-foreground, #cccccc);
  font-family: inherit;
  font-size: 12px;
  padding: 3px 6px;
}

.toc-filter:focus {
  border-color: var(--vscode-focusBorder);
}

.toc-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 12px;
}

.toc-item {
  overflow: hidden;
  padding: 4px 12px;
  font-size: 12px;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.toc-item:hover {
  background: var(--vscode-list-hoverBackground, #2a2d2e);
}

.toc-item--active {
  background: var(--vscode-list-activeSelectionBackground, #04395e);
  color: var(--vscode-list-activeSelectionForeground, #ffffff);
}

.jump-back {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--vscode-editorWidget-border, #454545);
  border-radius: 16px;
  background: var(--vscode-editorWidget-background, #252526);
  box-shadow: 0 4px 16px rgb(0 0 0 / 28%);
  color: var(--vscode-foreground, #cccccc);
  padding: 2px 6px 2px 10px;
}

.jump-back__main {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  padding: 4px;
}

.jump-back__main:hover {
  color: var(--vscode-textLink-foreground);
}

.jump-back__cancel {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--vscode-descriptionForeground, #9d9d9d);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.jump-back__cancel:hover {
  background: var(--vscode-toolbar-hoverBackground, #5a5d5e);
  color: var(--vscode-foreground, #cccccc);
}
</style>

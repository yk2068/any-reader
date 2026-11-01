/**
 * 正文查找：支持在当前章节内查找，也可切换为全书查找
 */
import type { Ref } from 'vue';
import PQueue from 'p-queue';
import { message } from 'ant-design-vue';
import { ContentType } from '@any-reader/rule-utils';
import { getContent } from '@/api';
import { useChaptersStore } from '@/stores/chapters';
import { useBus, EVENT_FIND_BOX } from '@/utils/bus';

export type FindScope = 'chapter' | 'book';

export interface BookFindHit {
  chapterPath: string;
  chapterName: string;
  /** 该命中在本章中的序号 */
  indexInChapter: number;
  before: string;
  match: string;
  after: string;
}

interface FindOptions {
  contentRef: Ref<any>;
  content: Ref<string[]>;
  contentType: Ref<ContentType | undefined>;
  toChapter: (chapterPath: string) => void;
}

/** 单章最多命中的标记数量，避免整页高亮过多卡顿 */
const MAX_MARKS = 500;
/** 单章最多展示的结果数 */
const MAX_HITS_PER_CHAPTER = 30;
/** 全书最多展示的结果数 */
const MAX_HITS = 300;

export function useFind(options: FindOptions) {
  const { contentRef, content, contentType, toChapter } = options;
  const chaptersStore = useChaptersStore();
  const route = useRoute();

  const findVisible = ref(false);
  const findText = ref('');
  const scope = ref<FindScope>('chapter');
  const findIndex = ref(0);
  const findTotal = ref(0);
  const findInputRef = ref<HTMLInputElement>();

  /** 全书查找结果 */
  const bookHits = ref<BookFindHit[]>([]);
  const bookPanelOpen = ref(false);
  const bookSearching = ref(false);
  const bookDone = ref(0);
  const bookTotal = ref(0);
  const activeHit = ref(-1);

  let findMarks: HTMLElement[] = [];
  let searchToken = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchQueue: PQueue | null = null;
  let pendingLocate: { chapterPath: string; occurrence: number } | null = null;

  function currentChapterPath(): string {
    const value = route.query.chapterPath;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  /* ---------------- 本章高亮 ---------------- */

  function clearFindMarks() {
    const root = contentRef.value as HTMLElement | undefined;
    if (root) {
      root.querySelectorAll('mark.ar-find').forEach((mark) => {
        const parent = mark.parentNode;
        if (!parent) return;
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
        parent.normalize();
      });
    }
    findMarks = [];
    findTotal.value = 0;
    findIndex.value = 0;
  }

  function buildFindMarks(keyword: string) {
    clearFindMarks();
    const root = contentRef.value as HTMLElement | undefined;
    if (!root || !keyword) return;

    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const el = (node as Text).parentElement;
      if ((node as Text).nodeValue?.trim() && el && !el.closest('button')) nodes.push(node as Text);
      node = walker.nextNode();
    }

    const lower = keyword.toLowerCase();
    for (const textNode of nodes) {
      if (findMarks.length >= MAX_MARKS) break;
      const text = textNode.nodeValue || '';
      const lowerText = text.toLowerCase();
      let from = 0;
      let hit = lowerText.indexOf(lower, from);
      if (hit === -1) continue;

      const frag = document.createDocumentFragment();
      while (hit !== -1) {
        if (hit > from) frag.appendChild(document.createTextNode(text.slice(from, hit)));
        const mark = document.createElement('mark');
        mark.className = 'ar-find';
        mark.textContent = text.slice(hit, hit + keyword.length);
        frag.appendChild(mark);
        findMarks.push(mark);
        from = hit + keyword.length;
        if (findMarks.length >= MAX_MARKS) break;
        hit = lowerText.indexOf(lower, from);
      }
      if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    findTotal.value = findMarks.length;
    findIndex.value = 0;
    if (findMarks.length) setActiveMark(0, false);
  }

  function setActiveMark(idx: number, scroll = true) {
    findMarks.forEach((mark) => mark.classList.remove('ar-find--active'));
    const mark = findMarks[idx];
    if (!mark) return;
    mark.classList.add('ar-find--active');
    if (scroll) mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function jumpToMark(idx: number) {
    if (!findMarks.length) return;
    findIndex.value = Math.max(0, Math.min(idx, findMarks.length - 1));
    setActiveMark(findIndex.value);
  }

  /* ---------------- 全书查找 ---------------- */

  function htmlToText(html: string) {
    const spaced = html.replace(/<br\s*\/?>/gi, ' ').replace(/<\/[^>]+>/g, ' ');
    const div = document.createElement('div');
    div.innerHTML = spaced;
    return (div.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function collectHits(text: string, keyword: string) {
    const result: { indexInChapter: number; before: string; match: string; after: string }[] = [];
    if (!text || !keyword) return result;
    const lowerText = text.toLowerCase();
    const lower = keyword.toLowerCase();
    let from = 0;
    let pos = lowerText.indexOf(lower, from);
    while (pos !== -1 && result.length < MAX_HITS_PER_CHAPTER) {
      result.push({
        indexInChapter: result.length,
        before: (pos > 28 ? '…' : '') + text.slice(Math.max(0, pos - 28), pos),
        match: text.slice(pos, pos + keyword.length),
        after: text.slice(pos + keyword.length, pos + keyword.length + 42) + (pos + keyword.length + 42 < text.length ? '…' : '')
      });
      from = pos + keyword.length;
      pos = lowerText.indexOf(lower, from);
    }
    return result;
  }

  function cancelBookSearch() {
    searchToken++;
    searchQueue?.clear();
    searchQueue = null;
    bookSearching.value = false;
    bookDone.value = 0;
    bookTotal.value = 0;
  }

  async function runBookSearch(keyword: string) {
    cancelBookSearch();
    const token = searchToken;
    bookHits.value = [];
    activeHit.value = -1;
    if (!keyword) return;

    const chapters = chaptersStore.chapters || [];
    if (!chapters.length) return;

    bookSearching.value = true;
    bookPanelOpen.value = true;
    bookTotal.value = chapters.length;
    bookDone.value = 0;

    const queue = new PQueue({ concurrency: 4 });
    searchQueue = queue;
    const collected: (BookFindHit & { order: number })[] = [];

    chapters.forEach((chapter, order) => {
      queue.add(async () => {
        if (token !== searchToken) return;
        const res = await getContent({ ...route.query, chapterPath: chapter.chapterPath }).catch(() => null);
        if (token !== searchToken) return;
        if (res?.code === 0 && collected.length < MAX_HITS) {
          const text = htmlToText(Array.isArray(res.data.content) ? res.data.content.join('\n') : String(res.data.content || ''));
          collectHits(text, keyword).forEach((hit) => {
            if (collected.length >= MAX_HITS) return;
            collected.push({
              order,
              chapterPath: chapter.chapterPath,
              chapterName: chapter.name,
              ...hit
            });
          });
          bookHits.value = [...collected].sort((a, b) => a.order - b.order || a.indexInChapter - b.indexInChapter);
        }
        bookDone.value++;
      });
    });

    await queue.onIdle();
    if (token !== searchToken) return;
    bookSearching.value = false;
    searchQueue = null;
  }

  function scheduleBookSearch(keyword: string) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runBookSearch(keyword), 400);
  }

  /* ---------------- 交互 ---------------- */

  /** 结果计数文案 */
  const findCount = computed(() => {
    if (scope.value === 'book') {
      if (bookSearching.value) return `${bookDone.value}/${bookTotal.value}`;
      if (!bookHits.value.length) return '无匹配';
      return `${activeHit.value >= 0 ? activeHit.value + 1 : '-'}/${bookHits.value.length}`;
    }
    return findTotal.value ? `${findIndex.value + 1}/${findTotal.value}` : '无匹配';
  });

  const findPlaceholder = computed(() => (scope.value === 'book' ? '全书查找' : '查找正文'));

  function findNext() {
    if (scope.value === 'book') {
      if (!bookHits.value.length) return;
      gotoBookHit((activeHit.value + 1) % bookHits.value.length);
      return;
    }
    if (!findMarks.length) return;
    findIndex.value = (findIndex.value + 1) % findMarks.length;
    setActiveMark(findIndex.value);
  }

  function findPrev() {
    if (scope.value === 'book') {
      if (!bookHits.value.length) return;
      gotoBookHit((activeHit.value - 1 + bookHits.value.length) % bookHits.value.length);
      return;
    }
    if (!findMarks.length) return;
    findIndex.value = (findIndex.value - 1 + findMarks.length) % findMarks.length;
    setActiveMark(findIndex.value);
  }

  /** 跳到某条全书结果：同章直接定位，跨章先切章再定位 */
  function gotoBookHit(index: number) {
    const hit = bookHits.value[index];
    if (!hit) return;
    activeHit.value = index;
    bookPanelOpen.value = false;

    if (hit.chapterPath === currentChapterPath()) {
      pendingLocate = null;
      if (!findMarks.length) buildFindMarks(findText.value.trim());
      jumpToMark(hit.indexInChapter);
      return;
    }

    pendingLocate = { chapterPath: hit.chapterPath, occurrence: hit.indexInChapter };
    toChapter(hit.chapterPath);
  }

  function toggleScope() {
    scope.value = scope.value === 'book' ? 'chapter' : 'book';
    clearTimeout(searchTimer);
    if (scope.value === 'book') {
      bookPanelOpen.value = true;
      buildFindMarks(findText.value.trim());
      if (findText.value.trim()) runBookSearch(findText.value.trim());
      return;
    }
    cancelBookSearch();
    bookPanelOpen.value = false;
    bookHits.value = [];
    activeHit.value = -1;
    buildFindMarks(findText.value.trim());
  }

  function openFind() {
    if (contentType.value === ContentType.MANGA) {
      message.info('漫画不支持文本查找');
      return;
    }
    findVisible.value = true;
    nextTick(() => {
      findInputRef.value?.focus();
      findInputRef.value?.select();
      const keyword = findText.value.trim();
      if (!keyword) return;
      if (scope.value === 'book') runBookSearch(keyword);
      else buildFindMarks(keyword);
    });
  }

  function closeFind() {
    findVisible.value = false;
    findText.value = '';
    bookPanelOpen.value = false;
    bookHits.value = [];
    activeHit.value = -1;
    pendingLocate = null;
    clearTimeout(searchTimer);
    cancelBookSearch();
    clearFindMarks();
    contentRef.value?.focus?.();
  }

  function openBookPanel() {
    bookPanelOpen.value = true;
  }

  watch(findText, (text) => {
    const keyword = text.trim();
    buildFindMarks(keyword);
    if (scope.value === 'book') scheduleBookSearch(keyword);
  });

  // 切章、重载后重建高亮（注解渲染会重排文本节点，稍后重建一次）
  watch(content, () => {
    if (!findVisible.value || !findText.value.trim()) return;
    const keyword = findText.value.trim();
    nextTick(() => {
      setTimeout(() => {
        if (!findVisible.value || findText.value.trim() !== keyword) return;
        buildFindMarks(keyword);
        if (pendingLocate && pendingLocate.chapterPath === currentChapterPath()) {
          jumpToMark(pendingLocate.occurrence);
          pendingLocate = null;
        }
      }, 120);
    });
  });

  const offFindBus = useBus(EVENT_FIND_BOX).on(openFind);

  function onGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openFind();
    }
  }

  onMounted(() => window.addEventListener('keydown', onGlobalKeydown, true));
  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown, true);
    offFindBus?.();
    clearTimeout(searchTimer);
    cancelBookSearch();
    clearFindMarks();
  });

  return {
    findVisible,
    findText,
    findIndex,
    findTotal,
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
    openFind,
    closeFind,
    findNext,
    findPrev,
    toggleScope,
    gotoBookHit,
    openBookPanel,
    clearFindMarks
  };
}

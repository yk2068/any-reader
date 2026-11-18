/**
 * 阅读界面的面板开合状态：底栏按钮都是开关，状态放这里让底栏与正文页共享
 */
export const useUiStore = defineStore('ui', () => {
  /** 目录抽屉 */
  const chaptersOpen = ref(false);
  /** 正文查找栏 */
  const findOpen = ref(false);

  function toggleChapters() {
    chaptersOpen.value = !chaptersOpen.value;
  }

  function toggleFind() {
    findOpen.value = !findOpen.value;
  }

  function closePanels() {
    chaptersOpen.value = false;
    findOpen.value = false;
  }

  return { chaptersOpen, findOpen, toggleChapters, toggleFind, closePanels };
});

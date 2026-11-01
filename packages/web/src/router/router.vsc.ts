import { createRouter, createWebHashHistory } from 'vue-router';
import { getChapter } from '@/api';
import { getChapterHistorys } from '@/api/modules/chapter-history';
import { pickOpenChapter } from '@/utils/book';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/home',
      component: () => import('@/pages/vscode/layout/index.vue'),
      children: [
        {
          path: '/home',
          component: () => import('@/pages/vscode/home/index.vue')
        },
        {
          path: '/content',
          name: 'content',
          component: () => import('@/pages/vscode/content/index.vue')
        },
        {
          path: '/settings',
          component: () => import('@/pages/vscode/settings/index.vue')
        }
      ]
    }
  ]
});

/**
 * 打开文件时只带 filePath，进入正文前先定位章节：
 * 有阅读历史就续读，否则跳过封面/版权等前置页。
 */
router.beforeEach(async (to) => {
  if (to.path !== '/content' || to.query.chapterPath) return true;

  const filePath = (to.query.filePath as string) || '';
  const ruleId = (to.query.ruleId as string) || '';
  if (!filePath && !ruleId) return true;

  const [chapterRes, historyRes] = await Promise.all([
    getChapter(filePath, ruleId).catch(() => null),
    getChapterHistorys({ filePath, ruleId }).catch(() => null)
  ]);

  const chapters = chapterRes?.code === 0 ? chapterRes.data || [] : [];
  const history = historyRes?.data?.[0];
  const target: any = pickOpenChapter(chapters as any[], history?.chapterPath);
  if (!target) return true;

  return {
    path: to.path,
    query: {
      ...to.query,
      chapterPath: target.chapterPath,
      percentage: (history && history.chapterPath === target.chapterPath && history.percentage) || 0
    },
    replace: true
  };
});

export default router;

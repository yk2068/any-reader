/**
 * 书籍/章节的通用判断
 */

/** EPUB 前置页：封面、扉页、版权、目录等，打开时应当跳过 */
const FRONT_MATTER = /cover|titlepage|copyright|colophon|toc|nav|contents|封面|扉页|版权|书名页|目录/i;

export function isFrontMatterChapter(chapter: any) {
  if (!chapter) return false;
  return FRONT_MATTER.test(`${chapter.name || ''} ${chapter.chapterPath || ''} ${chapter.chapterHref || ''}`);
}

/** 第一段正文（找不到就退回第一条） */
export function pickFirstChapter<T = any>(chapters: T[]): T | null {
  if (!Array.isArray(chapters) || !chapters.length) return null;
  return chapters.find((e: any) => !isFrontMatterChapter(e)) || chapters[0];
}

/**
 * 打开书籍时进入的章节：
 * 1. 有阅读历史且上次不是前置页 → 续读
 * 2. 否则第一段正文
 */
export function pickOpenChapter<T = any>(chapters: T[], lastReadChapterPath?: string): T | null {
  if (!Array.isArray(chapters) || !chapters.length) return null;
  const last = lastReadChapterPath ? chapters.find((e: any) => e.chapterPath === lastReadChapterPath) : null;
  if (last && !isFrontMatterChapter(last)) return last;
  return pickFirstChapter(chapters);
}

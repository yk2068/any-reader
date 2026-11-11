const QUOTE_PAIRS: Array<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’'],
  ['「', '」']
];

/**
 * 去掉目录两端可能被一起粘进来的引号与空白。
 * 用户常从资源管理器「复制路径」或聊天窗口里拿到 "C:\Books" 这种带引号的路径。
 */
export function normalizeDir(input: unknown): string {
  let dir = typeof input === 'string' ? input.trim() : '';

  let stripped = true;
  while (stripped && dir.length >= 2) {
    stripped = false;
    for (const [open, close] of QUOTE_PAIRS) {
      if (dir.startsWith(open) && dir.endsWith(close)) {
        dir = dir.slice(open.length, dir.length - close.length).trim();
        stripped = true;
      }
    }
  }

  return dir;
}

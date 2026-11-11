import * as path from 'node:path';
import * as fs from 'node:fs';
import { LOCAL_BOOK_DIR } from '../constants';
import { createBookParser } from './BookParser';
import { normalizeDir } from './normalize-dir';

export * from './BookParser';

export async function getBookList(dir: string) {
  // 允许粘贴 "C:\Books" 这种带引号的路径
  const booksDir = normalizeDir(dir) || LOCAL_BOOK_DIR;
  if (!fs.existsSync(booksDir) || !fs.lstatSync(booksDir).isDirectory()) fs.mkdirSync(booksDir, { recursive: true });

  return fs
    .readdirSync(booksDir)
    .filter((filePath) => ['.txt', '.epub'].includes(path.extname(filePath)))
    .map((filePath) => {
      return createBookParser(path.join(booksDir, filePath));
    });
}

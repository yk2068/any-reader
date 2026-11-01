import * as os from 'os';
import * as path from 'path';

export enum COMMANDS {
  home = 'any-reader.home',
  openFile = 'any-reader.openFile',
  setTitle = 'any-reader.setTitle'
}

export const ROOT_PATH = path.join(os.homedir(), '.any-reader');
export const CONFIG_PATH = path.join(ROOT_PATH, 'config.vscode.json');

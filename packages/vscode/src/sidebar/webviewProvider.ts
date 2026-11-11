import * as path from 'path';
import * as vscode from 'vscode';
import { getWebViewContent } from '../utils/webview';
import { useWebviewEvent, WebviewEvent } from '../webview/WebviewEvent';

export class WebviewProvider implements vscode.WebviewViewProvider {
  private _webviewView!: vscode.WebviewView;
  private _extensionPath!: string;
  private _event!: WebviewEvent;

  setExtensionPath(extensionPath: string) {
    this._extensionPath = extensionPath;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._webviewView = webviewView;
    this.webview.options = {
      enableScripts: true
    };

    useWebviewEvent(this.webview, this._extensionPath).then((e) => {
      this._event = e;
      this.webview.html = getWebViewContent(path.join('template-dist', 'index.html'), this._extensionPath, this.webview);
    });
  }

  get webviewView() {
    return this._webviewView;
  }

  get webview() {
    return this.webviewView.webview;
  }

  async navigateTo(routePath = '') {
    if (!this.webviewView) {
      // 侧栏没打开时只提示，不跳外部文档
      vscode.window.showWarningMessage('阅读侧栏没有激活，请先点击活动栏的 any-reader 图标。');
      return;
    }
    this.webviewView.show(true); // 聚焦
    this._event.pm.emit('router.push', routePath, this.webview);
  }
}

export const webviewProvider = new WebviewProvider();

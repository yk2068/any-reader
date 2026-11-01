import * as vscode from 'vscode';
import { stringify } from 'qs';
import { COMMANDS } from './constants';
import { webviewProvider } from './sidebar/webviewProvider';
import { WebView } from './webview';
import { CustomEditorProvider } from './editorProvider/CustomEditorProvider';

class App {
  private webView!: WebView;

  async activate(context: vscode.ExtensionContext) {
    this.webView = new WebView(context);

    // 注册命令
    const registerCommand = vscode.commands.registerCommand;
    [
      registerCommand(COMMANDS.home, this.home, this),
      registerCommand(COMMANDS.openFile, this.openFile, this),
      registerCommand(COMMANDS.setTitle, this.setTitle, this)
    ].forEach((command) => context.subscriptions.push(command));

    // 侧边栏 - webview
    webviewProvider.setExtensionPath(context.extensionPath);
    vscode.window.registerCustomEditorProvider('any-reader.customEditor.epub', new CustomEditorProvider(context));
    vscode.window.registerWebviewViewProvider('any-reader-webview', webviewProvider, {
      webviewOptions: {
        // 设置当 Webview 隐藏时保留上下文
        retainContextWhenHidden: true
      }
    });
  }

  // 书架
  home() {
    this.webView.navigateTo('/home');
  }

  // 设置标题
  setTitle(title: string) {
    this.webView.setTitle(title);
  }

  // 打开文件：直接进正文
  openFile(fileEvent: { fsPath: string }) {
    if (!fileEvent) return;
    this.webView.navigateTo(
      '/content?' +
        stringify({
          filePath: fileEvent.fsPath
        })
    );
  }
}

export const app = new App();

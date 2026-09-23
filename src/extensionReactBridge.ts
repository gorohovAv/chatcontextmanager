import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function registerReactBridge(context: vscode.ExtensionContext) {
    const provider = new ReactViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('reactMainView', provider)
    );
}

class ReactViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')]
        };

        const distRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
        const htmlPath = path.join(distRoot.fsPath, 'index.html');
        
        let html = '';
        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch (e) {
            webviewView.webview.html = `<p>Ошибка загрузки UI. Выполните 'npm run build:spa' или 'npm run compile'.</p>`;
            return;
        }

        // Имена файлов строго как в логе сборки Vite
        const scriptUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, 'assets', 'index.js')
        );
        const styleUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, 'assets', 'index.css')
        );
        const nonce = getNonce();

        // 1. Внедряем CSP и стили перед закрывающим </head>
        html = html.replace(
            '</head>',
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webviewView.webview.cspSource}; img-src ${webviewView.webview.cspSource} data:;">
             <link href="${styleUri}" rel="stylesheet"></head>`
        );

        // 2. Заменяем скрипт, сгенерированный Vite, на наш с nonce
        // Vite генерирует: <script type="module" crossorigin src="/assets/index.js"></script>
        html = html.replace(
            /<script\s+type="module"(?:\s+crossorigin)?\s+src="\/assets\/index\.js"><\/script>/,
            `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`
        );

        webviewView.webview.html = html;

        webviewView.webview.onDidReceiveMessage((message) => {
            console.log('Message from React SPA:', message);
        });
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
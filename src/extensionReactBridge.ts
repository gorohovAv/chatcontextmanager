import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Импорт существующих бэкенд-сервисов (используйте те же функции, что и раньше)
import * as sysPrompt from './sysPrompt';
import * as payload from './payload';
import * as tree from './tree';
import * as dbTools from './dbTools';
import * as history from './history';
import * as plTools from './plTools';

export function registerReactBridge(context: vscode.ExtensionContext) {
    const provider = new ReactViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('reactMainView', provider)
    );
}

class ReactViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly context: vscode.ExtensionContext) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')]
        };

        const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
        const htmlPath = path.join(distRoot.fsPath, 'index.html');
        
        let html = '';
        try {
            html = fs.readFileSync(htmlPath, 'utf8');
        } catch (e) {
            webviewView.webview.html = `<p>Ошибка загрузки UI. Выполните 'npm run build:spa' или 'npm run compile'.</p>`;
            return;
        }

        const scriptUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, 'assets', 'index.js')
        );
        const styleUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, 'assets', 'index.css')
        );
        const nonce = getNonce();

        // 1. Внедряем CSP
        html = html.replace(
            '</head>',
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webviewView.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webviewView.webview.cspSource}; img-src ${webviewView.webview.cspSource} data:;"></head>`
        );

        // 2. Заменяем CSS, сгенерированный Vite
        html = html.replace(
            /<link[^>]*href="[^"]*assets\/index\.css"[^>]*>/,
            `<link href="${styleUri}" rel="stylesheet">`
        );

        // 3. Заменяем JS, сгенерированный Vite
        html = html.replace(
            /<script\s+type="module"(?:\s+crossorigin)?\s+src="[^"]*assets\/index\.js"[^>]*><\/script>/,
            `<script type="module" nonce="${nonce}" src="${scriptUri}"></script>`
        );

        webviewView.webview.html = html;

        // 4. Обработчик сообщений от React SPA
        webviewView.webview.onDidReceiveMessage(async (message) => {
            try {
                await this.handleMessage(webviewView, message);
            } catch (error: any) {
                console.error('Webview message error:', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        });
    }

    private async handleMessage(webviewView: vscode.WebviewView, message: any) {
        const { globalState, workspaceState } = this.context;

        switch (message.type) {
            // --- Инициализация ---
            case 'requestInit': {
                webviewView.webview.postMessage({
                    type: 'initState',
                    userText: globalState.get('userText', ''),
                    currentMode: globalState.get('currentMode', 'edit'),
                    treeSettings: {
                        includeTree: globalState.get('includeTree', false),
                        useGitignore: globalState.get('useGitignore', true),
                        customIgnore: globalState.get('customIgnore', '')
                    }
                });
                break;
            }
            case 'requestInitPrompts': {
                webviewView.webview.postMessage({
                    type: 'initPrompts',
                    systemPrompt: globalState.get('systemPrompt', ''),
                    askPrompt: globalState.get('askPrompt', ''),
                    customPrompt: globalState.get('customPrompt', ''),
                    projectPrompt: workspaceState.get('projectPrompt', '')
                });
                break;
            }

            // --- Сохранение промптов ---
            case 'saveSystemPrompt':
                await globalState.update('systemPrompt', message.prompt);
                break;
            case 'saveAskPrompt':
                await globalState.update('askPrompt', message.prompt);
                break;
            case 'saveCustomPrompt':
                await globalState.update('customPrompt', message.prompt);
                break;
            case 'saveProjectPrompt':
                await workspaceState.update('projectPrompt', message.prompt);
                break;

            // --- Сохранение состояния ---
            case 'saveUserText':
                await globalState.update('userText', message.text);
                break;
            case 'setMode':
                await globalState.update('currentMode', message.mode);
                break;
            case 'saveTreeSettings':
                await globalState.update('includeTree', message.includeTree);
                await globalState.update('useGitignore', message.useGitignore);
                await globalState.update('customIgnore', message.customIgnore);
                break;
            case 'clearForm':
                await globalState.update('userText', '');
                await globalState.update('files', []);
                webviewView.webview.postMessage({ type: 'updateFiles', files: [] });
                break;

            // --- Подсчет и компиляция ---
            case 'requestCharCount': {
                const count = await this.calculateCharCount(message);
                webviewView.webview.postMessage({ type: 'updateCharCount', charCount: count });
                break;
            }
            case 'compileAndCopy': {
                const finalText = await this.buildPayload(message);
                await vscode.env.clipboard.writeText(finalText);
                vscode.window.showInformationMessage('Prompt copied to clipboard!');
                break;
            }

            // --- Работа с файлами и символами ---
            case 'addFile': {
                const uris = await vscode.window.showOpenDialog({
                    canSelectMany: true,
                    openLabel: 'Select Files',
                    filters: { 'All Files': ['*'] }
                });
                if (uris) {
                    const files = globalState.get<any[]>('files', []);
                    for (const uri of uris) {
                        if (!files.find(f => f.uri === uri.fsPath)) {
                            // Здесь можно вызвать plTools.parseFile(uri) для получения символов
                            files.push({ 
                                uri: uri.fsPath, 
                                name: path.basename(uri.fsPath), 
                                symbols: [], 
                                states: {},
                                charCount: 0
                            });
                        }
                    }
                    await globalState.update('files', files);
                    webviewView.webview.postMessage({ type: 'updateFiles', files });
                }
                break;
            }
            case 'addFolder': {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select Folder'
                });
                if (uris && uris[0]) {
                    // Делегируем добавление файлов из папки в plTools
                    // const newFiles = await plTools.addFolder(uris[0].fsPath, message.useGitignore, message.customIgnore);
                    vscode.window.showInformationMessage(`Folder selected: ${path.basename(uris[0].fsPath)}. (Раскомментируйте вызов plTools.addFolder)`);
                }
                break;
            }
            case 'removeFile': {
                const files = globalState.get<any[]>('files', []).filter(f => f.uri !== message.uri);
                await globalState.update('files', files);
                webviewView.webview.postMessage({ type: 'updateFiles', files });
                break;
            }
            case 'toggleSymbol': {
                const files = globalState.get<any[]>('files', []);
                const file = files.find(f => f.uri === message.uri);
                if (file) {
                    file.states = file.states || {};
                    file.states[message.symbolId] = !(file.states[message.symbolId] === false);
                    await globalState.update('files', files);
                }
                break;
            }
            case 'setAllSymbols': {
                const files = globalState.get<any[]>('files', []);
                const file = files.find(f => f.uri === message.uri);
                if (file) {
                    file.states = file.states || {};
                    const setAll = (syms: any[]) => {
                        syms.forEach(s => {
                            file.states[s.id] = message.checkAll;
                            if (s.children) setAll(s.children);
                        });
                    };
                    setAll(file.symbols || []);
                    await globalState.update('files', files);
                }
                break;
            }

            // --- База данных ---
            case 'getDbAliases': {
                // Замените на реальный вызов: const aliases = await dbTools.getAliases();
                const aliases = globalState.get<string[]>('dbAliases', []);
                webviewView.webview.postMessage({ type: 'dbAliases', aliases });
                break;
            }
            case 'fetchDbStructure': {
                webviewView.webview.postMessage({ type: 'dbStatus', text: 'Fetching...' });
                try {
                    // await dbTools.fetchStructure(message.aliases);
                    // Имитация задержки для демонстрации UI (замените на реальный вызов)
                    await new Promise(r => setTimeout(r, 800));
                    webviewView.webview.postMessage({ type: 'dbStructureReady' });
                } catch (e: any) {
                    webviewView.webview.postMessage({ type: 'dbStatus', text: `Error: ${e.message}` });
                }
                break;
            }

            // --- Git история ---
            case 'fetchGitHistory': {
                webviewView.webview.postMessage({ type: 'gitStatus', text: 'Fetching...' });
                try {
                    // const commits = await history.fetchHistory(message.commitCount);
                    await new Promise(r => setTimeout(r, 800)); // Имитация
                    webviewView.webview.postMessage({ type: 'gitHistoryReady', commitCount: message.commitCount });
                } catch (e: any) {
                    webviewView.webview.postMessage({ type: 'gitError', error: e.message });
                }
                break;
            }
        }
    }

    private async calculateCharCount(message: any): Promise<number> {
        let count = message.userText ? message.userText.length : 0;
        
        if (message.includeSystemPrompts) {
            count += (this.context.globalState.get('systemPrompt', '') || '').length;
            count += (this.context.workspaceState.get('projectPrompt', '') || '').length;
        }

        const files = this.context.globalState.get<any[]>('files', []);
        files.forEach(f => {
            // Упрощенный подсчет: если символы не отключены явно, считаем весь файл
            // В реальной реализации используйте payload.calculateFileContribution(f, message)
            count += f.charCount || 500; 
        });

        if (message.includeTree) {
            // count += await tree.calculateTreeLength(message.useGitignore, message.customIgnore);
            count += 300; // Заглушка
        }

        return count;
    }

    private async buildPayload(message: any): Promise<string> {
        let result = '';
        
        if (message.includeSystemPrompts) {
            const sys = this.context.globalState.get('systemPrompt', '');
            const proj = this.context.workspaceState.get('projectPrompt', '');
            if (sys) result += `# System Prompt\n${sys}\n\n`;
            if (proj) result += `# Project Prompt\n${proj}\n\n`;
        }

        const modeLabel = (message.mode || 'edit').charAt(0).toUpperCase() + (message.mode || 'edit').slice(1);
        result += `# User Request (${modeLabel})\n${message.text || ''}\n\n`;

        // Здесь делегируйте сборку финального пейлоада в src/payload.ts
        // result += await payload.appendFiles(message, this.context.globalState.get('files', []));
        // if (message.includeTree) result += await payload.appendTree(message);
        // if (message.includeDb) result += await payload.appendDb(message);
        // if (message.includeGitHistory) result += await payload.appendGit(message);

        return result;
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
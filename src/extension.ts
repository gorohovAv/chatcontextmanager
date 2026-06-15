import * as vscode from 'vscode';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager } from './tree';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 [МОЕ РАСШИРЕНИЕ] Функция activate() вызвана!');

    const provider = new PromptBuilderViewProvider(context);
    
    const disposable = vscode.window.registerWebviewViewProvider(
        PromptBuilderViewProvider.viewType, 
        provider
    );
    
    context.subscriptions.push(disposable);
    console.log('✅ [МОЕ РАСШИРЕНИЕ] Провайдер успешно зарегистрирован! viewType:', PromptBuilderViewProvider.viewType);
}

class PromptBuilderViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptBuilderView';
    private _view?: vscode.WebviewView;
    private selectedFiles: { name: string, uri: string }[] = [];
    private sysPromptManager: SystemPromptManager;
    private treeManager: TreeManager;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.sysPromptManager = new SystemPromptManager(context);
        this.treeManager = new TreeManager(context);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Отправляем сохраненные промпты в webview при загрузке
        webviewView.webview.postMessage({
            type: 'loadPrompts',
            systemPrompt: this.sysPromptManager.getSystemPrompt(),
            projectPrompt: this.sysPromptManager.getProjectPrompt()
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addFile':
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: true,
                        openLabel: 'Добавить файлы',
                        canSelectFiles: true,
                        canSelectFolders: false
                    });
                    if (uris) {
                        this.selectedFiles = uris.map(uri => ({
                            name: uri.fsPath.split(/[/\\]/).pop() || uri.fsPath,
                            uri: uri.toString()
                        }));
                        this._updateFileList();
                    }
                    break;
                case 'removeFile':
                    this.selectedFiles = this.selectedFiles.filter(f => f.uri !== data.uri);
                    this._updateFileList();
                    break;
                case 'compileAndCopy':
                    await this._compileAndCopy(data.text, data.includeTree);
                    break;
                case 'saveSystemPrompt':
                    await this.sysPromptManager.setSystemPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Системный промпт сохранен!');
                    break;
                case 'saveProjectPrompt':
                    await this.sysPromptManager.setProjectPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Промпт проекта сохранен!');
                    break;
            }
        });
    }

    private _updateFileList() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'updateFiles', files: this.selectedFiles });
        }
    }

    private async _compileAndCopy(userText: string, includeTree: boolean) {
        let finalPrompt = '';
        
        // 1. Системный промпт
        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        if (systemPrompt.trim()) {
            finalPrompt += `# Системный промпт\n${systemPrompt.trim()}\n\n`;
        }

        // 2. Промпт проекта
        const projectPrompt = this.sysPromptManager.getProjectPrompt();
        if (projectPrompt.trim()) {
            finalPrompt += `# Промпт проекта\n${projectPrompt.trim()}\n\n`;
        }

        // 3. Дерево файлов (если чекбокс отмечен)
        if (includeTree) {
            const tree = await this.treeManager.getProjectTree();
            if (tree.trim()) {
                finalPrompt += `# Структура проекта\n\`\`\`\n${tree}\`\`\`\n\n`;
            }
        }

        // 4. Основной текст пользователя
        if (userText.trim()) {
            finalPrompt += `# Задача\n${userText.trim()}\n\n`;
        }
        
        // 5. Прикрепленные файлы
        for (const file of this.selectedFiles) {
            try {
                const uri = vscode.Uri.parse(file.uri);
                const uint8Array = await vscode.workspace.fs.readFile(uri);
                const content = new TextDecoder().decode(uint8Array);
                finalPrompt += `--- Файл: ${file.name} ---\n\`\`\`\n${content}\n\`\`\`\n\n`;
            } catch (e) {
                finalPrompt += `--- Файл: ${file.name} ---\n[Ошибка чтения файла: ${e}]\n\n`;
            }
        }

        await vscode.env.clipboard.writeText(finalPrompt.trim());
        vscode.window.showInformationMessage('✅ Промпт успешно скопирован в буфер обмена!');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prompt Builder</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                textarea { 
                    width: 100%; height: 150px; box-sizing: border-box; 
                    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border); border-radius: 4px; padding: 8px; margin-bottom: 10px;
                    resize: vertical;
                }
                textarea.small { height: 80px; }
                button { 
                    width: 100%; padding: 8px; margin-bottom: 10px; cursor: pointer;
                    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
                    border: none; border-radius: 4px; font-weight: bold;
                }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                .file-item { 
                    display: flex; justify-content: space-between; align-items: center;
                    background: var(--vscode-list-hoverBackground); padding: 6px; border-radius: 4px; margin-bottom: 5px; font-size: 0.9em;
                }
                .remove-btn { background: transparent; color: var(--vscode-errorForeground); width: auto; padding: 2px 6px; margin: 0; }
                .remove-btn:hover { background: var(--vscode-list-activeSelectionBackground); }
                #fileList { margin-bottom: 15px; max-height: 200px; overflow-y: auto; }
                details { margin-bottom: 15px; }
                summary { 
                    cursor: pointer; padding: 8px; 
                    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
                    border-radius: 4px; font-weight: bold;
                }
                summary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                .checkbox-container {
                    display: flex; align-items: center; margin-bottom: 10px;
                    background: var(--vscode-list-hoverBackground); padding: 8px; border-radius: 4px;
                }
                .checkbox-container input[type="checkbox"] { margin-right: 8px; }
                label { cursor: pointer; }
            </style>
        </head>
        <body>
            <!-- Раскрывающийся блок с настройками промптов (скрыт по умолчанию) -->
            <details>
                <summary>⚙️ Настройки промптов</summary>
                <div style="margin-top: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Системный промпт:</label>
                    <textarea id="systemPrompt" class="small" placeholder="Глобальный системный промпт..."></textarea>
                    <button id="saveSystemPromptBtn" class="secondary">💾 Сохранить системный промпт</button>
                    
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Промпт проекта:</label>
                    <textarea id="projectPrompt" class="small" placeholder="Промпт для текущего проекта..."></textarea>
                    <button id="saveProjectPromptBtn" class="secondary">💾 Сохранить промпт проекта</button>
                </div>
            </details>

            <textarea id="userText" placeholder="Введите основной текст промпта здесь..."></textarea>
            
            <button id="addFileBtn" class="secondary">📎 Добавить файлы из проекта</button>
            <div id="fileList"></div>
            
            <!-- Чекбокс для включения дерева файлов -->
            <div class="checkbox-container">
                <input type="checkbox" id="includeTree">
                <label for="includeTree">🌳 Дерево (добавить структуру файлов)</label>
            </div>
            
            <button id="copyBtn">📋 В буфер обмена</button>

            <script>
                const vscode = acquireVsCodeApi();
                let files = [];

                document.getElementById('addFileBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'addFile' });
                });

                document.getElementById('copyBtn').addEventListener('click', () => {
                    const text = document.getElementById('userText').value;
                    const includeTree = document.getElementById('includeTree').checked;
                    vscode.postMessage({ type: 'compileAndCopy', text: text, includeTree: includeTree });
                });

                document.getElementById('saveSystemPromptBtn').addEventListener('click', () => {
                    const prompt = document.getElementById('systemPrompt').value;
                    vscode.postMessage({ type: 'saveSystemPrompt', prompt: prompt });
                });

                document.getElementById('saveProjectPromptBtn').addEventListener('click', () => {
                    const prompt = document.getElementById('projectPrompt').value;
                    vscode.postMessage({ type: 'saveProjectPrompt', prompt: prompt });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateFiles') {
                        files = message.files;
                        renderFiles();
                    } else if (message.type === 'loadPrompts') {
                        document.getElementById('systemPrompt').value = message.systemPrompt || '';
                        document.getElementById('projectPrompt').value = message.projectPrompt || '';
                    }
                });

                function renderFiles() {
                    const list = document.getElementById('fileList');
                    list.innerHTML = '';
                    files.forEach(file => {
                        const div = document.createElement('div');
                        div.className = 'file-item';
                        div.innerHTML = \`<span>📄 \${file.name}</span>\`;
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-btn';
                        removeBtn.innerText = '✕';
                        removeBtn.onclick = () => {
                            vscode.postMessage({ type: 'removeFile', uri: file.uri });
                        };
                        
                        div.appendChild(removeBtn);
                        list.appendChild(div);
                    });
                }
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
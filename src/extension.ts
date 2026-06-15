import * as vscode from 'vscode';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager, TreeOptions } from './tree';

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

        // Читаем актуальные значения промптов и сразу встраиваем их в HTML
        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        const projectPrompt = this.sysPromptManager.getProjectPrompt();

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview,
            systemPrompt,
            projectPrompt
        );

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
                    await this._compileAndCopy(data.text, {
                        includeTree: data.includeTree,
                        useGitignore: data.useGitignore,
                        customIgnore: data.customIgnore
                    });
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

    private async _compileAndCopy(userText: string, options: {
        includeTree?: boolean;
        useGitignore?: boolean;
        customIgnore?: string;
    }) {
        let finalPrompt = '';
        
        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        if (systemPrompt.trim()) {
            finalPrompt += `# Системный промпт\n${systemPrompt.trim()}\n\n`;
        }

        const projectPrompt = this.sysPromptManager.getProjectPrompt();
        if (projectPrompt.trim()) {
            finalPrompt += `# Промпт проекта\n${projectPrompt.trim()}\n\n`;
        }

        if (options.includeTree) {
            const treeOptions: TreeOptions = {
                useGitignore: options.useGitignore,
                customIgnore: options.customIgnore
            };
            const tree = await this.treeManager.getProjectTree(treeOptions);
            if (tree.trim()) {
                finalPrompt += `# Структура проекта\n\`\`\`\n${tree}\`\`\`\n\n`;
            }
        }

        if (userText.trim()) {
            finalPrompt += `# Задача\n${userText.trim()}\n\n`;
        }
        
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

    private _getHtmlForWebview(
        webview: vscode.Webview,
        systemPrompt: string,
        projectPrompt: string
    ) {
        // JSON.stringify безопасно экранирует все спецсимволы (\n, ", <, > и т.д.)
        const safeSystemPrompt = JSON.stringify(systemPrompt);
        const safeProjectPrompt = JSON.stringify(projectPrompt);

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
                textarea.ignore { height: 100px; font-family: monospace; font-size: 0.85em; }
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
                .tree-settings {
                    margin-top: 10px; padding: 10px;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                }
                .tree-settings.hidden { display: none; }
                .hint { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin: 5px 0 8px 0; }
                .disabled { opacity: 0.5; pointer-events: none; }
            </style>
        </head>
        <body>
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
            
            <div class="checkbox-container">
                <input type="checkbox" id="includeTree">
                <label for="includeTree">🌳 Дерево (добавить структуру файлов)</label>
            </div>

            <div id="treeSettings" class="tree-settings hidden">
                <div class="checkbox-container" style="margin-bottom: 8px;">
                    <input type="checkbox" id="useGitignore">
                    <label for="useGitignore">📜 Использовать .gitignore</label>
                </div>

                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Альтернативный ignore-файл:</label>
                <div class="hint">Формат как у .gitignore. Не сохраняется — только для этого промпта.</div>
                <textarea id="customIgnore" class="ignore" placeholder="node_modules&#10;dist&#10;*.log&#10;.env"></textarea>
            </div>
            
            <button id="copyBtn">📋 В буфер обмена</button>

            <script>
                const vscode = acquireVsCodeApi();
                let files = [];

                // Инициализируем поля сохранёнными промптами сразу при загрузке
                document.getElementById('systemPrompt').value = ${safeSystemPrompt};
                document.getElementById('projectPrompt').value = ${safeProjectPrompt};

                const includeTreeEl = document.getElementById('includeTree');
                const useGitignoreEl = document.getElementById('useGitignore');
                const customIgnoreEl = document.getElementById('customIgnore');
                const treeSettingsEl = document.getElementById('treeSettings');

                function updateTreeSettingsVisibility() {
                    if (includeTreeEl.checked) {
                        treeSettingsEl.classList.remove('hidden');
                    } else {
                        treeSettingsEl.classList.add('hidden');
                    }
                }

                function updateCustomIgnoreState() {
                    if (useGitignoreEl.checked) {
                        customIgnoreEl.classList.add('disabled');
                        customIgnoreEl.setAttribute('disabled', 'disabled');
                    } else {
                        customIgnoreEl.classList.remove('disabled');
                        customIgnoreEl.removeAttribute('disabled');
                    }
                }

                includeTreeEl.addEventListener('change', updateTreeSettingsVisibility);
                useGitignoreEl.addEventListener('change', updateCustomIgnoreState);
                updateCustomIgnoreState();

                document.getElementById('addFileBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'addFile' });
                });

                document.getElementById('copyBtn').addEventListener('click', () => {
                    const text = document.getElementById('userText').value;
                    const includeTree = includeTreeEl.checked;
                    const useGitignore = useGitignoreEl.checked;
                    const customIgnore = customIgnoreEl.value;
                    vscode.postMessage({ 
                        type: 'compileAndCopy', 
                        text: text, 
                        includeTree: includeTree,
                        useGitignore: useGitignore,
                        customIgnore: customIgnore
                    });
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
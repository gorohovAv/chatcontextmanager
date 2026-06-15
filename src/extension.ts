import * as vscode from 'vscode';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager, TreeOptions } from './tree';
import { PayloadManager } from './payload';

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
    private sysPromptManager: SystemPromptManager;
    private treeManager: TreeManager;
    private payloadManager: PayloadManager;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.sysPromptManager = new SystemPromptManager(context);
        this.treeManager = new TreeManager(context);
        this.payloadManager = new PayloadManager();
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
                        await this.payloadManager.addFiles(uris);
                        this._updateFileList();
                    }
                    break;
                case 'removeFile':
                    await this.payloadManager.removeFile(vscode.Uri.parse(data.uri));
                    this._updateFileList();
                    break;
                case 'toggleSymbol':
                    await this.payloadManager.toggleSymbol(vscode.Uri.parse(data.uri), data.symbolId);
                    this._updateFileList();
                    break;
                case 'compileAndCopy':
                    const finalPrompt = await this.payloadManager.compileFullPrompt(
                        this.sysPromptManager.getSystemPrompt(),
                        this.sysPromptManager.getProjectPrompt(),
                        data.text,
                        {
                            includeTree: data.includeTree,
                            useGitignore: data.useGitignore,
                            customIgnore: data.customIgnore,
                            getProjectTree: (opts) => this.treeManager.getProjectTree(opts)
                        }
                    );
                    await vscode.env.clipboard.writeText(finalPrompt.trim());
                    vscode.window.showInformationMessage('✅ Промпт успешно скопирован в буфер обмена!');
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

        // Initial update
        this._updateFileList();
    }

    private async _updateFileList() {
        if (this._view) {
            const filesInfo = await this.payloadManager.getFilesInfo();
            const charCount = await this.payloadManager.getCompiledPromptLength(
                this.sysPromptManager.getSystemPrompt(),
                this.sysPromptManager.getProjectPrompt(),
                '',
                {
                    includeTree: false,
                    useGitignore: false,
                    customIgnore: '',
                    getProjectTree: async () => ''
                }
            );
            this._view.webview.postMessage({ 
                type: 'updateFiles', 
                files: filesInfo,
                charCount: charCount
            });
        }
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
                    position: relative;
                }
                .char-count-badge {
                    position: absolute;
                    top: -8px;
                    right: 8px;
                    background: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 10px;
                    padding: 0 6px;
                    font-size: 0.75em;
                    min-width: 30px;
                    text-align: center;
                }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                .file-item { 
                    display: flex; justify-content: space-between; align-items: center;
                    background: var(--vscode-list-hoverBackground); padding: 6px; border-radius: 4px; margin-bottom: 5px; font-size: 0.9em;
                }
                .file-item.expanded {
                    flex-direction: column;
                    align-items: stretch;
                }
                .file-header {
                    display: flex;
                    justify-content: space-between;
                    width: 100%;
                    margin-bottom: 5px;
                }
                .symbol-item {
                    display: flex;
                    align-items: center;
                    margin-left: 20px;
                    padding: 4px 0;
                    font-size: 0.85em;
                }
                .symbol-item input[type="checkbox"] {
                    margin-right: 8px;
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
            
            <button id="copyBtn">📋 В буфер обмена<span id="charCountBadge" class="char-count-badge">0</span></button>

            <script>
                const vscode = acquireVsCodeApi();
                let files = [];
                let currentCharCount = 0;

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
                        currentCharCount = message.charCount || 0;
                        renderFiles();
                        document.getElementById('charCountBadge').textContent = currentCharCount.toLocaleString();
                    }
                });

                function toggleFile(fileDiv, file) {
                    const isExpanded = fileDiv.classList.contains('expanded');
                    if (isExpanded) {
                        fileDiv.classList.remove('expanded');
                        fileDiv.querySelector('.symbols-container').innerHTML = '';
                    } else {
                        fileDiv.classList.add('expanded');
                        const symbolsContainer = fileDiv.querySelector('.symbols-container');
                        renderSymbols(symbolsContainer, file.symbols, file.uri);
                    }
                }

                function renderSymbols(container, symbols, fileUri, depth = 0) {
                    container.innerHTML = '';
                    const list = document.createElement('div');
                    list.style.paddingLeft = (depth * 15) + 'px';
                    symbols.forEach(symbol => {
                        const symbolDiv = document.createElement('div');
                        symbolDiv.className = 'symbol-item';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = 'sym-' + symbol.id;
                        checkbox.checked = symbol.enabled;
                        checkbox.onchange = () => {
                            vscode.postMessage({ 
                                type: 'toggleSymbol', 
                                uri: fileUri, 
                                symbolId: symbol.id 
                            });
                        };
                        
                        const label = document.createElement('label');
                        label.htmlFor = 'sym-' + symbol.id;
                        label.textContent = symbol.name + (symbol.detail ? ' : ' + symbol.detail : '');
                        
                        symbolDiv.appendChild(checkbox);
                        symbolDiv.appendChild(label);
                        list.appendChild(symbolDiv);
                        
                        if (symbol.children && symbol.children.length > 0) {
                            const childContainer = document.createElement('div');
                            renderSymbols(childContainer, symbol.children, fileUri, depth + 1);
                            list.appendChild(childContainer);
                        }
                    });
                    container.appendChild(list);
                }

                function renderFiles() {
                    const list = document.getElementById('fileList');
                    list.innerHTML = '';
                    files.forEach(file => {
                        const div = document.createElement('div');
                        div.className = 'file-item';
                        
                        const header = document.createElement('div');
                        header.className = 'file-header';
                        header.innerHTML = \`<span>📄 \${file.name}</span>\`;
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-btn';
                        removeBtn.innerText = '✕';
                        removeBtn.onclick = () => {
                            vscode.postMessage({ type: 'removeFile', uri: file.uri });
                        };
                        
                        header.appendChild(removeBtn);
                        div.appendChild(header);
                        
                        const symbolsContainer = document.createElement('div');
                        symbolsContainer.className = 'symbols-container';
                        div.appendChild(symbolsContainer);
                        
                        div.onclick = (e) => {
                            if (!e.target.closest('.remove-btn') && !e.target.closest('input[type="checkbox"]')) {
                                toggleFile(div, file);
                            }
                        };
                        
                        list.appendChild(div);
                    });
                }
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
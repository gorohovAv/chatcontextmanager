import * as vscode from 'vscode';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager, TreeOptions } from './tree';
import { PayloadManager, FileInfo } from './payload';
import { LogInterceptorViewProvider } from './logInterceptor';

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 [МОЕ РАСШИРЕНИЕ] Функция activate() вызвана!');

    // --- Регистрация основной плашки Prompt Builder ---
    const provider = new PromptBuilderViewProvider(context);
    
    const disposable = vscode.window.registerWebviewViewProvider(
        PromptBuilderViewProvider.viewType, 
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    
    context.subscriptions.push(disposable);
    console.log('✅ [МОЕ РАСШИРЕНИЕ] Провайдер успешно зарегистрирован! viewType:', PromptBuilderViewProvider.viewType);

    // --- Регистрация новой плашки Log Interceptor ---
    const logProvider = new LogInterceptorViewProvider(context);
    const logDisposable = vscode.window.registerWebviewViewProvider(
        LogInterceptorViewProvider.viewType,
        logProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    context.subscriptions.push(logDisposable);
    console.log('✅ [МОЕ РАСШИРЕНИЕ] Провайдер логов успешно зарегистрирован! viewType:', LogInterceptorViewProvider.viewType);
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
        this.payloadManager = new PayloadManager(context);
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        // Восстанавливаем персистентное состояние
        await this.payloadManager.loadState();
        const savedUserText = await this.payloadManager.getUserText();
        const savedTreeSettings = await this.payloadManager.getTreeSettings();
        const filesInfo = await this.payloadManager.getFilesInfo();

        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        const projectPrompt = this.sysPromptManager.getProjectPrompt();

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview,
            systemPrompt,
            projectPrompt,
            savedUserText,
            filesInfo,
            savedTreeSettings
        );

        // Принудительное сохранение при уничтожении webview (закрытие вкладки/VS Code)
        webviewView.onDidDispose(() => {
            this.payloadManager.flushSave().catch(e => 
                console.error('[PromptBuilder] Ошибка сохранения при закрытии:', e)
            );
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
                    vscode.window.showInformationMessage('✅ Prompt is in clipboard!');
                    break;
                case 'saveSystemPrompt':
                    await this.sysPromptManager.setSystemPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Global prompt is saved!');
                    break;
                case 'saveProjectPrompt':
                    await this.sysPromptManager.setProjectPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Project prompt is saved!');
                    break;
                case 'saveUserText':
                    await this.payloadManager.saveUserText(data.text);
                    break;
                case 'saveTreeSettings':
                    await this.payloadManager.saveTreeSettings({
                        includeTree: !!data.includeTree,
                        useGitignore: !!data.useGitignore,
                        customIgnore: data.customIgnore || ''
                    });
                    break;
                case 'requestCharCount':
                    const length = await this.payloadManager.getCompiledPromptLength(
                        this.sysPromptManager.getSystemPrompt(),
                        this.sysPromptManager.getProjectPrompt(),
                        data.userText || '',
                        {
                            includeTree: !!data.includeTree,
                            useGitignore: !!data.useGitignore,
                            customIgnore: data.customIgnore || '',
                            getProjectTree: (opts) => this.treeManager.getProjectTree(opts)
                        }
                    );
                    this._view?.webview.postMessage({ type: 'updateCharCount', charCount: length });
                    break;
            }
        });

        this._updateFileList();
    }

    private async _updateFileList() {
        if (this._view) {
            const filesInfo = await this.payloadManager.getFilesInfo();
            this._view.webview.postMessage({ 
                type: 'updateFiles', 
                files: filesInfo
            });
        }
    }

    private _getHtmlForWebview(
        webview: vscode.Webview,
        systemPrompt: string,
        projectPrompt: string,
        userText: string,
        filesInfo: FileInfo[],
        treeSettings: { includeTree: boolean; useGitignore: boolean; customIgnore: string }
    ) {
        const safeSystemPrompt = JSON.stringify(systemPrompt);
        const safeProjectPrompt = JSON.stringify(projectPrompt);
        const safeUserText = JSON.stringify(userText);
        const safeFilesInfo = JSON.stringify(filesInfo);
        const safeTreeSettings = JSON.stringify(treeSettings);

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
                    cursor: pointer;
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
                    flex-shrink: 0;
                }
                .symbol-item label {
                    display: flex;
                    align-items: center;
                    cursor: pointer;
                    flex: 1;
                    min-width: 0;
                }
                .symbol-item .sym-name {
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .symbol-item .sym-detail {
                    color: var(--vscode-descriptionForeground);
                    margin-left: 4px;
                    font-style: italic;
                }

                /* Бейджи типов символов */
                .sym-badge {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 3px;
                    font-size: 10px;
                    font-weight: bold;
                    margin-right: 6px;
                    font-family: var(--vscode-editor-font-family, monospace);
                    flex-shrink: 0;
                    line-height: 1;
                    box-sizing: border-box;
                }
                /* Классы / интерфейсы / структуры / конструкторы — бирюзовый */
                .sym-kind-class,
                .sym-kind-interface,
                .sym-kind-struct,
                .sym-kind-constructor,
                .sym-kind-type-parameter {
                    background: rgba(78, 201, 176, 0.15);
                    color: #4ec9b0;
                    border: 1px solid rgba(78, 201, 176, 0.6);
                }
                /* Методы / функции — жёлтый */
                .sym-kind-method,
                .sym-kind-function {
                    background: rgba(220, 220, 170, 0.15);
                    color: #dcdcaa;
                    border: 1px solid rgba(220, 220, 170, 0.6);
                }
                /* Свойства / поля — голубой */
                .sym-kind-property,
                .sym-kind-field {
                    background: rgba(156, 220, 254, 0.15);
                    color: #9cdcfe;
                    border: 1px solid rgba(156, 220, 254, 0.6);
                }
                /* Перечисления / элементы enum / события — оранжевый */
                .sym-kind-enum,
                .sym-kind-enum-member,
                .sym-kind-event {
                    background: rgba(206, 145, 120, 0.15);
                    color: #ce9178;
                    border: 1px solid rgba(206, 145, 120, 0.6);
                }
                /* Модули / namespace / пакеты — фиолетовый */
                .sym-kind-module,
                .sym-kind-namespace,
                .sym-kind-package {
                    background: rgba(197, 134, 192, 0.15);
                    color: #c586c0;
                    border: 1px solid rgba(197, 134, 192, 0.6);
                }
                /* Константы — светло-голубой */
                .sym-kind-constant {
                    background: rgba(79, 193, 255, 0.15);
                    color: #4fc1ff;
                    border: 1px solid rgba(79, 193, 255, 0.6);
                }
                /* Файл — серый */
                .sym-kind-file {
                    background: rgba(200, 200, 200, 0.15);
                    color: #c8c8c8;
                    border: 1px solid rgba(200, 200, 200, 0.6);
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
                <summary>Prompt settings</summary>
                <div style="margin-top: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Global prompt:</label>
                    <textarea id="systemPrompt" class="small" placeholder="Global prompt..."></textarea>
                    <button id="saveSystemPromptBtn" class="secondary">💾 Save global prompt</button>
                    
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Промпт проекта:</label>
                    <textarea id="projectPrompt" class="small" placeholder="Промпт для текущего проекта..."></textarea>
                    <button id="saveProjectPromptBtn" class="secondary">💾 Save project prompt</button>
                </div>
            </details>

            <textarea id="userText" placeholder="Enter your actual promt here..."></textarea>
            
            <button id="addFileBtn" class="secondary">Inject files</button>
            <div id="fileList"></div>
            
            <div class="checkbox-container">
                <input type="checkbox" id="includeTree">
                <label for="includeTree">Tree (project structure)</label>
            </div>

            <div id="treeSettings" class="tree-settings hidden">
                <div class="checkbox-container" style="margin-bottom: 8px;">
                    <input type="checkbox" id="useGitignore">
                    <label for="useGitignore">Use .gitignore</label>
                </div>

                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Alternative ignore-file:</label>
                <div class="hint">.gitignore-like text. Not persisted.</div>
                <textarea id="customIgnore" class="ignore" placeholder="node_modules&#10;dist&#10;*.log&#10;.env"></textarea>
            </div>
            
            <button id="copyBtn">Clipboard (<span id="charCountBadge">0</span> chars)</button>

            <script>
                const vscode = acquireVsCodeApi();
                
                // Начальное состояние из extension (восстановлено из workspaceState)
                const initialFiles = ${safeFilesInfo};
                const initialTreeSettings = ${safeTreeSettings};
                let files = initialFiles || [];
                const expandedFiles = new Set();

                document.getElementById('systemPrompt').value = ${safeSystemPrompt};
                document.getElementById('projectPrompt').value = ${safeProjectPrompt};
                document.getElementById('userText').value = ${safeUserText};

                const includeTreeEl = document.getElementById('includeTree');
                const useGitignoreEl = document.getElementById('useGitignore');
                const customIgnoreEl = document.getElementById('customIgnore');
                const treeSettingsEl = document.getElementById('treeSettings');
                const charCountBadge = document.getElementById('charCountBadge');

                // Восстанавливаем настройки дерева из сохранённого состояния
                includeTreeEl.checked = !!initialTreeSettings.includeTree;
                useGitignoreEl.checked = !!initialTreeSettings.useGitignore;
                customIgnoreEl.value = initialTreeSettings.customIgnore || '';

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

                // Применяем начальную видимость и состояние ignore
                updateTreeSettingsVisibility();
                updateCustomIgnoreState();

                // Debounce для сохранения настроек дерева
                let treeSettingsTimer = null;
                function saveTreeSettingsDebounced() {
                    if (treeSettingsTimer) clearTimeout(treeSettingsTimer);
                    treeSettingsTimer = setTimeout(() => {
                        vscode.postMessage({
                            type: 'saveTreeSettings',
                            includeTree: includeTreeEl.checked,
                            useGitignore: useGitignoreEl.checked,
                            customIgnore: customIgnoreEl.value
                        });
                    }, 400);
                }

                includeTreeEl.addEventListener('change', () => {
                    updateTreeSettingsVisibility();
                    saveTreeSettingsDebounced();
                    requestCharCount();
                });
                useGitignoreEl.addEventListener('change', () => {
                    updateCustomIgnoreState();
                    saveTreeSettingsDebounced();
                    requestCharCount();
                });
                customIgnoreEl.addEventListener('input', () => {
                    saveTreeSettingsDebounced();
                    requestCharCountDebounced();
                });

                // Debounce для текстовых полей
                let charCountTimer = null;
                function requestCharCountDebounced() {
                    if (charCountTimer) clearTimeout(charCountTimer);
                    charCountTimer = setTimeout(requestCharCount, 250);
                }

                function requestCharCount() {
                    vscode.postMessage({
                        type: 'requestCharCount',
                        userText: document.getElementById('userText').value,
                        includeTree: includeTreeEl.checked,
                        useGitignore: useGitignoreEl.checked,
                        customIgnore: customIgnoreEl.value
                    });
                }

                // Слушатели изменений для обновления счётчика и сохранения userText
                document.getElementById('userText').addEventListener('input', () => {
                    requestCharCountDebounced();
                    vscode.postMessage({ 
                        type: 'saveUserText', 
                        text: document.getElementById('userText').value 
                    });
                });

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
                    requestCharCount();
                });

                document.getElementById('saveProjectPromptBtn').addEventListener('click', () => {
                    const prompt = document.getElementById('projectPrompt').value;
                    vscode.postMessage({ type: 'saveProjectPrompt', prompt: prompt });
                    requestCharCount();
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateFiles') {
                        files = message.files;
                        renderFiles();
                        requestCharCount();
                    } else if (message.type === 'updateCharCount') {
                        charCountBadge.textContent = (message.charCount || 0).toLocaleString();
                    }
                });

                function toggleFile(fileDiv, file) {
                    const isExpanded = fileDiv.classList.contains('expanded');
                    if (isExpanded) {
                        fileDiv.classList.remove('expanded');
                        fileDiv.querySelector('.symbols-container').innerHTML = '';
                        expandedFiles.delete(file.uri);
                    } else {
                        fileDiv.classList.add('expanded');
                        const symbolsContainer = fileDiv.querySelector('.symbols-container');
                        renderSymbols(symbolsContainer, file.symbols, file.uri, file.states);
                        expandedFiles.add(file.uri);
                    }
                }

                function getSymbolLetter(kindName) {
                    const map = {
                        'Класс': 'C', 'Интерфейс': 'I', 'Метод': 'M', 'Функция': 'F',
                        'Свойство': 'P', 'Поле': 'F', 'Конструктор': 'C', 'Перечисление': 'E',
                        'Элемент перечисления': 'e', 'Модуль': 'M', 'Пространство имен': 'N',
                        'Пакет': 'P', 'Константа': 'K', 'Структура': 'S', 'Событие': 'E',
                        'Параметр типа': 'T', 'Файл': 'F', 'Оператор': 'O'
                    };
                    return map[kindName] || '?';
                }

                function getSymbolKindClass(kindName) {
                    const map = {
                        'Класс': 'class', 'Интерфейс': 'interface', 'Метод': 'method',
                        'Функция': 'function', 'Свойство': 'property', 'Поле': 'field',
                        'Конструктор': 'constructor', 'Перечисление': 'enum',
                        'Элемент перечисления': 'enum-member', 'Модуль': 'module',
                        'Пространство имен': 'namespace', 'Пакет': 'package',
                        'Константа': 'constant', 'Структура': 'struct', 'Событие': 'event',
                        'Параметр типа': 'type-parameter', 'Файл': 'file', 'Оператор': 'operator'
                    };
                    return map[kindName] || 'unknown';
                }

                function escapeHtml(text) {
                    const div = document.createElement('div');
                    div.textContent = text;
                    return div.innerHTML;
                }

                function renderSymbols(container, symbols, fileUri, states, depth = 0) {
                    container.innerHTML = '';
                    const list = document.createElement('div');
                    list.style.paddingLeft = (depth * 15) + 'px';
                    symbols.forEach(symbol => {
                        const symbolDiv = document.createElement('div');
                        symbolDiv.className = 'symbol-item';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = 'sym-' + symbol.id;
                        checkbox.checked = states[symbol.id] !== false;
                        checkbox.onchange = () => {
                            vscode.postMessage({ 
                                type: 'toggleSymbol', 
                                uri: fileUri, 
                                symbolId: symbol.id 
                            });
                        };
                        
                        const label = document.createElement('label');
                        label.htmlFor = 'sym-' + symbol.id;

                        const letter = getSymbolLetter(symbol.kindName);
                        const kindClass = getSymbolKindClass(symbol.kindName);
                        const badge = '<span class="sym-badge sym-kind-' + kindClass + '">' + letter + '</span>';

                        label.innerHTML = badge
                            + '<span class="sym-name">' + escapeHtml(symbol.name) + '</span>'
                            + (symbol.detail ? '<span class="sym-detail">: ' + escapeHtml(symbol.detail) + '</span>' : '');
                        
                        symbolDiv.appendChild(checkbox);
                        symbolDiv.appendChild(label);
                        list.appendChild(symbolDiv);
                        
                        if (symbol.children && symbol.children.length > 0) {
                            const childContainer = document.createElement('div');
                            renderSymbols(childContainer, symbol.children, fileUri, states, depth + 1);
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
                        header.innerHTML = '<span>📄 ' + escapeHtml(file.name) + '</span>';
                        
                        const removeBtn = document.createElement('button');
                        removeBtn.className = 'remove-btn';
                        removeBtn.innerText = '✕';
                        removeBtn.onclick = (e) => {
                            e.stopPropagation();
                            expandedFiles.delete(file.uri);
                            vscode.postMessage({ type: 'removeFile', uri: file.uri });
                        };
                        
                        header.appendChild(removeBtn);
                        div.appendChild(header);
                        
                        const symbolsContainer = document.createElement('div');
                        symbolsContainer.className = 'symbols-container';
                        div.appendChild(symbolsContainer);
                        
                        if (expandedFiles.has(file.uri)) {
                            div.classList.add('expanded');
                            renderSymbols(symbolsContainer, file.symbols, file.uri, file.states);
                        }
                        
                        div.onclick = (e) => {
                            if (!e.target.closest('.remove-btn') && !e.target.closest('.symbols-container')) {
                                toggleFile(div, file);
                            }
                        };
                        
                        list.appendChild(div);
                    });
                }

                // Первичный рендер файлов из начального состояния
                renderFiles();
                // Первичный запрос счётчика
                requestCharCount();
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {}
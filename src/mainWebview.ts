export function getMainWebview(safeSystemPrompt: string, safeProjectPrompt: string, safeUserText: string, safeFilesInfo: string, safeTreeSettings: string, safeAskPrompt: string, safeCustomPrompt: string, safeCurrentMode: string): string {

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
                .file-item.expanded { flex-direction: column; align-items: stretch; }
                .file-header { display: flex; justify-content: space-between; width: 100%; margin-bottom: 5px; }
                .symbol-item { display: flex; align-items: center; margin-left: 20px; padding: 4px 0; font-size: 0.85em; }
                .symbol-item input[type="checkbox"] { margin-right: 8px; flex-shrink: 0; }
                .symbol-item label { display: flex; align-items: center; cursor: pointer; flex: 1; min-width: 0; }
                .symbol-item .sym-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .symbol-item .sym-detail { color: var(--vscode-descriptionForeground); margin-left: 4px; font-style: italic; }
                .sym-badge {
                    display: inline-flex; align-items: center; justify-content: center;
                    width: 18px; height: 18px; border-radius: 3px; font-size: 10px; font-weight: bold;
                    margin-right: 6px; font-family: var(--vscode-editor-font-family, monospace);
                    flex-shrink: 0; line-height: 1; box-sizing: border-box;
                }
                .sym-kind-class, .sym-kind-interface, .sym-kind-struct, .sym-kind-constructor, .sym-kind-type-parameter { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; border: 1px solid rgba(78, 201, 176, 0.6); }
                .sym-kind-method, .sym-kind-function { background: rgba(220, 220, 170, 0.15); color: #dcdcaa; border: 1px solid rgba(220, 220, 170, 0.6); }
                .sym-kind-property, .sym-kind-field { background: rgba(156, 220, 254, 0.15); color: #9cdcfe; border: 1px solid rgba(156, 220, 254, 0.6); }
                .sym-kind-enum, .sym-kind-enum-member, .sym-kind-event { background: rgba(206, 145, 120, 0.15); color: #ce9178; border: 1px solid rgba(206, 145, 120, 0.6); }
                .sym-kind-module, .sym-kind-namespace, .sym-kind-package { background: rgba(197, 134, 192, 0.15); color: #c586c0; border: 1px solid rgba(197, 134, 192, 0.6); }
                .sym-kind-constant { background: rgba(79, 193, 255, 0.15); color: #4fc1ff; border: 1px solid rgba(79, 193, 255, 0.6); }
                .sym-kind-file { background: rgba(200, 200, 200, 0.15); color: #c8c8c8; border: 1px solid rgba(200, 200, 200, 0.6); }
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
                
                .mode-switcher {
                    display: flex;
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    padding: 3px;
                    margin-bottom: 10px;
                }
                .mode-btn {
                    flex: 1;
                    padding: 6px 10px;
                    background: transparent;
                    color: var(--vscode-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: normal;
                    transition: background 0.2s, color 0.2s;
                    margin: 0;
                    font-size: 0.9em;
                }
                .mode-btn.active {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    font-weight: bold;
                }
                .mode-btn:hover:not(.active) {
                    background: var(--vscode-list-hoverBackground);
                }
            </style>
        </head>
        <body>
            <details>
                <summary>Prompt settings</summary>
                <div style="margin-top: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Global prompt (Edit):</label>
                    <textarea id="systemPrompt" class="small" placeholder="Global prompt..."></textarea>
                    <button id="saveSystemPromptBtn" class="secondary">💾 Save global prompt</button>
                    
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; margin-top: 15px;">Global prompt (Ask):</label>
                    <textarea id="askPrompt" class="small" placeholder="Global prompt for Ask mode..."></textarea>
                    <button id="saveAskPromptBtn" class="secondary">💾 Save ask prompt</button>

                    <label style="display: block; margin-bottom: 5px; font-weight: bold; margin-top: 15px;">Global prompt (Custom):</label>
                    <textarea id="customPrompt" class="small" placeholder="Global prompt for Custom mode..."></textarea>
                    <button id="saveCustomPromptBtn" class="secondary">💾 Save custom prompt</button>

                    <label style="display: block; margin-bottom: 5px; font-weight: bold; margin-top: 15px;">Project prompt:</label>
                    <textarea id="projectPrompt" class="small" placeholder="Local prompt for this particular project..."></textarea>
                    <button id="saveProjectPromptBtn" class="secondary">💾 Save project prompt</button>
                </div>
            </details>

            <div class="mode-switcher">
                <button class="mode-btn" data-mode="edit">Edit</button>
                <button class="mode-btn" data-mode="ask">Ask</button>
                <button class="mode-btn" data-mode="custom">Custom</button>
            </div>

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

            <div class="checkbox-container">
                <input type="checkbox" id="includeDb">
                <label for="includeDb">DB structure</label>
            </div>

            <div id="dbSettings" class="tree-settings hidden">
                <div id="dbConnList" style="margin-bottom: 10px; max-height: 150px; overflow-y: auto;"></div>
                <button id="getDbStructureBtn" class="secondary">Get db structure</button>
                <div id="dbStructureStatus" class="hint" style="margin-top: 8px;"></div>
            </div>

            <div class="checkbox-container">
                <input type="checkbox" id="includeGitHistory">
                <label for="includeGitHistory">Git history</label>
            </div>

            <div id="gitHistorySettings" class="tree-settings hidden">
                <label style="display: block; margin-bottom: 5px; font-weight: bold;">Number of last commits:</label>
                <input type="text" id="gitCommitCount" value="5" style="width: 100%; padding: 4px; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; margin-bottom: 10px;">
                <button id="getGitHistoryBtn" class="secondary">Get git history</button>
                <div id="gitHistoryStatus" class="hint" style="margin-top: 8px;"></div>
            </div>
            
            <button id="copyBtn">Clipboard (<span id="charCountBadge">0</span> chars)</button>

            <script>
                const vscode = acquireVsCodeApi();
                const initialFiles = ${safeFilesInfo};
                const initialTreeSettings = ${safeTreeSettings};
                const initialMode = ${safeCurrentMode};
                let files = initialFiles || [];
                const expandedFiles = new Set();
                let selectedDbAliases = new Set();
                let gitHistoryLoaded = false;

                document.getElementById('systemPrompt').value = ${safeSystemPrompt};
                document.getElementById('projectPrompt').value = ${safeProjectPrompt};
                document.getElementById('userText').value = ${safeUserText};
                document.getElementById('askPrompt').value = ${safeAskPrompt};
                document.getElementById('customPrompt').value = ${safeCustomPrompt};

                // Mode switcher logic
                const modeButtons = document.querySelectorAll('.mode-btn');
                modeButtons.forEach(btn => {
                    if (btn.dataset.mode === initialMode) {
                        btn.classList.add('active');
                    }
                    btn.addEventListener('click', () => {
                        modeButtons.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        vscode.postMessage({ type: 'setMode', mode: btn.dataset.mode });
                        requestCharCount();
                    });
                });

                const includeTreeEl = document.getElementById('includeTree');
                const useGitignoreEl = document.getElementById('useGitignore');
                const customIgnoreEl = document.getElementById('customIgnore');
                const treeSettingsEl = document.getElementById('treeSettings');
                const charCountBadge = document.getElementById('charCountBadge');
                
                const includeDbEl = document.getElementById('includeDb');
                const dbSettingsEl = document.getElementById('dbSettings');
                const dbConnListEl = document.getElementById('dbConnList');
                const getDbStructureBtn = document.getElementById('getDbStructureBtn');
                const dbStructureStatusEl = document.getElementById('dbStructureStatus');

                const includeGitHistoryEl = document.getElementById('includeGitHistory');
                const gitHistorySettingsEl = document.getElementById('gitHistorySettings');
                const gitCommitCountEl = document.getElementById('gitCommitCount');
                const getGitHistoryBtn = document.getElementById('getGitHistoryBtn');
                const gitHistoryStatusEl = document.getElementById('gitHistoryStatus');

                includeTreeEl.checked = !!initialTreeSettings.includeTree;
                useGitignoreEl.checked = !!initialTreeSettings.useGitignore;
                customIgnoreEl.value = initialTreeSettings.customIgnore || '';

                function updateTreeSettingsVisibility() {
                    treeSettingsEl.classList.toggle('hidden', !includeTreeEl.checked);
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

                updateTreeSettingsVisibility();
                updateCustomIgnoreState();

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

                includeTreeEl.addEventListener('change', () => { updateTreeSettingsVisibility(); saveTreeSettingsDebounced(); requestCharCount(); });
                useGitignoreEl.addEventListener('change', () => { updateCustomIgnoreState(); saveTreeSettingsDebounced(); requestCharCount(); });
                customIgnoreEl.addEventListener('input', () => { saveTreeSettingsDebounced(); requestCharCountDebounced(); });

                includeDbEl.addEventListener('change', () => {
                    dbSettingsEl.classList.toggle('hidden', !includeDbEl.checked);
                    if (includeDbEl.checked) {
                        vscode.postMessage({ type: 'getDbAliases' });
                    }
                    requestCharCount();
                });

                includeGitHistoryEl.addEventListener('change', () => {
                    gitHistorySettingsEl.classList.toggle('hidden', !includeGitHistoryEl.checked);
                    requestCharCount();
                });

                gitCommitCountEl.addEventListener('input', (e) => {
                    // Разрешаем ввод только цифр
                    e.target.value = e.target.value.replace(/\\D/g, '');
                    gitHistoryLoaded = false;
                    gitHistoryStatusEl.textContent = '';
                });

                getGitHistoryBtn.addEventListener('click', () => {
                    const commitCount = parseInt(gitCommitCountEl.value) || 5;
                    if (commitCount <= 0) {
                        gitHistoryStatusEl.textContent = 'Please enter a valid number of commits.';
                        return;
                    }
                    gitHistoryStatusEl.textContent = 'Fetching...';
                    getGitHistoryBtn.disabled = true;
                    vscode.postMessage({ type: 'fetchGitHistory', commitCount: commitCount.toString() });
                });

                getDbStructureBtn.addEventListener('click', () => {
                    const selected = Array.from(selectedDbAliases);
                    if (selected.length === 0) {
                        dbStructureStatusEl.textContent = 'Please select at least one connection.';
                        return;
                    }
                    dbStructureStatusEl.textContent = 'Fetching...';
                    getDbStructureBtn.disabled = true;
                    vscode.postMessage({ type: 'fetchDbStructure', aliases: selected });
                });

                function renderDbAliases(aliases) {
                    dbConnListEl.innerHTML = '';
                    if (aliases.length === 0) {
                        dbConnListEl.innerHTML = '<div class="hint">No connections saved. Add them in Settings view.</div>';
                        return;
                    }
                    aliases.forEach(alias => {
                        const div = document.createElement('div');
                        div.className = 'checkbox-container';
                        div.style.marginBottom = '4px';
                        div.style.padding = '4px';
                        
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.id = 'db-' + alias;
                        checkbox.checked = selectedDbAliases.has(alias);
                        checkbox.onchange = () => {
                            if (checkbox.checked) selectedDbAliases.add(alias);
                            else selectedDbAliases.delete(alias);
                        };
                        
                        const label = document.createElement('label');
                        label.htmlFor = 'db-' + alias;
                        label.textContent = alias;
                        
                        div.appendChild(checkbox);
                        div.appendChild(label);
                        dbConnListEl.appendChild(div);
                    });
                }

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
                        customIgnore: customIgnoreEl.value,
                        includeDb: includeDbEl.checked,
                        includeGitHistory: includeGitHistoryEl.checked && gitHistoryLoaded,
                        gitCommitCount: gitCommitCountEl.value
                    });
                }

                document.getElementById('userText').addEventListener('input', () => {
                    requestCharCountDebounced();
                    vscode.postMessage({ type: 'saveUserText', text: document.getElementById('userText').value });
                });

                document.getElementById('addFileBtn').addEventListener('click', () => vscode.postMessage({ type: 'addFile' }));

                document.getElementById('copyBtn').addEventListener('click', () => {
                    vscode.postMessage({ 
                        type: 'compileAndCopy', 
                        text: document.getElementById('userText').value, 
                        includeTree: includeTreeEl.checked,
                        useGitignore: useGitignoreEl.checked,
                        customIgnore: customIgnoreEl.value,
                        includeDb: includeDbEl.checked,
                        includeGitHistory: includeGitHistoryEl.checked && gitHistoryLoaded,
                        gitCommitCount: gitCommitCountEl.value
                    });
                });

                document.getElementById('saveSystemPromptBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'saveSystemPrompt', prompt: document.getElementById('systemPrompt').value });
                    requestCharCount();
                });

                document.getElementById('saveAskPromptBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'saveAskPrompt', prompt: document.getElementById('askPrompt').value });
                    requestCharCount();
                });

                document.getElementById('saveCustomPromptBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'saveCustomPrompt', prompt: document.getElementById('customPrompt').value });
                    requestCharCount();
                });

                document.getElementById('saveProjectPromptBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'saveProjectPrompt', prompt: document.getElementById('projectPrompt').value });
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
                    } else if (message.type === 'dbAliases') {
                        renderDbAliases(message.aliases || []);
                    } else if (message.type === 'dbStatus') {
                        dbStructureStatusEl.textContent = message.text;
                    } else if (message.type === 'dbStructureReady') {
                        dbStructureStatusEl.textContent = '✅ DB structure fetched!';
                        getDbStructureBtn.disabled = false;
                        requestCharCount();
                    } else if (message.type === 'gitStatus') {
                        gitHistoryStatusEl.textContent = message.text;
                    } else if (message.type === 'gitHistoryReady') {
                        gitHistoryStatusEl.textContent = '✅ Git history fetched! (' + message.commitCount + ' commits)';
                        getGitHistoryBtn.disabled = false;
                        gitHistoryLoaded = true;
                        requestCharCount();
                    } else if (message.type === 'gitError') {
                        gitHistoryStatusEl.textContent = '❌ Error: ' + message.error;
                        getGitHistoryBtn.disabled = false;
                        gitHistoryLoaded = false;
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
                    const map = { 'Класс': 'C', 'Интерфейс': 'I', 'Метод': 'M', 'Функция': 'F', 'Свойство': 'P', 'Поле': 'F', 'Конструктор': 'C', 'Перечисление': 'E', 'Элемент перечисления': 'e', 'Модуль': 'M', 'Пространство имен': 'N', 'Пакет': 'P', 'Константа': 'K', 'Структура': 'S', 'Событие': 'E', 'Параметр типа': 'T', 'Файл': 'F', 'Оператор': 'O' };
                    return map[kindName] || '?';
                }

                function getSymbolKindClass(kindName) {
                    const map = { 'Класс': 'class', 'Интерфейс': 'interface', 'Метод': 'method', 'Функция': 'function', 'Свойство': 'property', 'Поле': 'field', 'Конструктор': 'constructor', 'Перечисление': 'enum', 'Элемент перечисления': 'enum-member', 'Модуль': 'module', 'Пространство имен': 'namespace', 'Пакет': 'package', 'Константа': 'constant', 'Структура': 'struct', 'Событие': 'event', 'Параметр типа': 'type-parameter', 'Файл': 'file', 'Оператор': 'operator' };
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
                        checkbox.onchange = () => vscode.postMessage({ type: 'toggleSymbol', uri: fileUri, symbolId: symbol.id });
                        const label = document.createElement('label');
                        label.htmlFor = 'sym-' + symbol.id;
                        const letter = getSymbolLetter(symbol.kindName);
                        const kindClass = getSymbolKindClass(symbol.kindName);
                        const badge = '<span class="sym-badge sym-kind-' + kindClass + '">' + letter + '</span>';
                        label.innerHTML = badge + '<span class="sym-name">' + escapeHtml(symbol.name) + '</span>' + (symbol.detail ? '<span class="sym-detail">: ' + escapeHtml(symbol.detail) + '</span>' : '');
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

                renderFiles();
                requestCharCount();
            </script>
        </body>
        </html>`;
}
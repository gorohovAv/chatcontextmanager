import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager, TreeOptions } from './tree';
import { PayloadManager, FileInfo } from './payload';
import { LogInterceptorViewProvider } from './logInterceptor';
import { SettingsViewProvider } from './settingsView';
import { getGitHistory } from './history';

const execAsync = promisify(exec);

function findCliTool(toolName: string): string {
    if (os.platform() === 'win32') {
        if (toolName === 'psql') {
            const pgDir = 'C:\\Program Files\\PostgreSQL';
            if (fs.existsSync(pgDir)) {
                const versions = fs.readdirSync(pgDir).filter(v => v.match(/^\d+$/)).sort((a, b) => parseInt(b) - parseInt(a));
                for (const v of versions) {
                    const toolPath = path.join(pgDir, v, 'bin', 'psql.exe');
                    if (fs.existsSync(toolPath)) {
                        return `"${toolPath}"`;
                    }
                }
            }
        } else if (toolName === 'mysql') {
            const myDir = 'C:\\Program Files\\MySQL';
            if (fs.existsSync(myDir)) {
                const versions = fs.readdirSync(myDir).filter(v => v.startsWith('MySQL Server')).sort().reverse();
                for (const v of versions) {
                    const toolPath = path.join(myDir, v, 'bin', 'mysql.exe');
                    if (fs.existsSync(toolPath)) {
                        return `"${toolPath}"`;
                    }
                }
            }
        }
    }
    return toolName;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 [МОЕ РАСШИРЕНИЕ] Функция activate() вызвана!');

    const provider = new PromptBuilderViewProvider(context);
    const disposable = vscode.window.registerWebviewViewProvider(
        PromptBuilderViewProvider.viewType, 
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    context.subscriptions.push(disposable);

    const settingsProvider = new SettingsViewProvider(context);
    const settingsDisposable = vscode.window.registerWebviewViewProvider(
        SettingsViewProvider.viewType,
        settingsProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    context.subscriptions.push(settingsDisposable);

    const logProvider = new LogInterceptorViewProvider(context);
    const logDisposable = vscode.window.registerWebviewViewProvider(
        LogInterceptorViewProvider.viewType,
        logProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    context.subscriptions.push(logDisposable);
}

class PromptBuilderViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'promptBuilderView';
    private _view?: vscode.WebviewView;
    private sysPromptManager: SystemPromptManager;
    private treeManager: TreeManager;
    private payloadManager: PayloadManager;
    private _dbStructure: string = '';
    private _gitHistory: string = '';

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

        await this.payloadManager.loadState();
        const savedUserText = await this.payloadManager.getUserText();
        const savedTreeSettings = await this.payloadManager.getTreeSettings();
        const filesInfo = await this.payloadManager.getFilesInfo();

        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        const projectPrompt = this.sysPromptManager.getProjectPrompt();

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview, systemPrompt, projectPrompt,
            savedUserText, filesInfo, savedTreeSettings
        );

        webviewView.onDidDispose(() => {
            this.payloadManager.flushSave().catch(e => 
                console.error('[PromptBuilder] Ошибка сохранения при закрытии:', e)
            );
        });

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'addFile':
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: true, openLabel: 'Добавить файлы',
                        canSelectFiles: true, canSelectFolders: false
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
                case 'fetchGitHistory':
                    this._view?.webview.postMessage({ type: 'gitStatus', text: 'Fetching git history...' });
                    this._gitHistory = '';
                    
                    try {
                        const commitCount = parseInt(data.commitCount) || 5;
                        const history = await getGitHistory(commitCount);
                        this._gitHistory = history.trim();
                        this._view?.webview.postMessage({ type: 'gitHistoryReady', commitCount });
                    } catch (e: any) {
                        this._view?.webview.postMessage({ type: 'gitError', error: e.message });
                    }
                    break;
                case 'compileAndCopy':
                    let finalPrompt = await this.payloadManager.compileFullPrompt(
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
                    
                    if (data.includeGitHistory && this._gitHistory) {
                        const commitCount = parseInt(data.gitCommitCount) || 5;
                        finalPrompt += `\n\n# Git History (last ${commitCount} commits)\n${this._gitHistory}`;
                    }
                    
                    if (data.includeDb && this._dbStructure) {
                        finalPrompt += `\n\n${this._dbStructure}`;
                    }
                    
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
                    let length = await this.payloadManager.getCompiledPromptLength(
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
                    
                    if (data.includeGitHistory && this._gitHistory) {
                        const commitCount = parseInt(data.gitCommitCount) || 5;
                        length += `\n\n# Git History (last ${commitCount} commits)\n${this._gitHistory}`.length;
                    }

                    if (data.includeDb && this._dbStructure) {
                        length += `\n\n${this._dbStructure}`.length;
                    }
                    this._view?.webview.postMessage({ type: 'updateCharCount', charCount: length });
                    break;
                case 'getDbAliases':
                    const aliases = this.context.globalState.get<string[]>('dbConnectionAliases', []);
                    this._view?.webview.postMessage({ type: 'dbAliases', aliases });
                    break;
                case 'fetchDbStructure':
                    const selectedAliases: string[] = data.aliases;
                    this._view?.webview.postMessage({ type: 'dbStatus', text: 'Fetching DB structure...' });
                    this._dbStructure = '';
                    
                    let fullStructure = '';
                    for (const alias of selectedAliases) {
                        const connStr = await this.context.secrets.get(`dbConn_${alias}`);
                        if (!connStr) {
                            fullStructure += `${alias}\n     (Connection string not found)\n\n`;
                            continue;
                        }
                        
                        const dbType = connStr.split('://')[0];
                        const toolName = dbType === 'postgres' || dbType === 'postgresql' ? 'psql' : dbType === 'mysql' ? 'mysql' : 'sqlite3';
                        
                        try {
                            const schema = await this._fetchSchema(connStr);
                            fullStructure += `${alias}\n${schema}\n\n`;
                        } catch (err: any) {
                            let errMsg = err.message || 'Unknown error';
                            errMsg = errMsg.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
                            if (errMsg.toLowerCase().includes('not recognized') || errMsg.toLowerCase().includes('not found') || errMsg.length < 10) {
                                errMsg = `Command '${toolName}' not found. Please ensure the CLI tool is installed and added to system PATH, or installed in the default directory.`;
                            }
                            fullStructure += `${alias}\n     (Error: ${errMsg})\n\n`;
                        }
                    }
                    
                    this._dbStructure = fullStructure.trim();
                    this._view?.webview.postMessage({ type: 'dbStructureReady' });
                    break;
            }
        });

        this._updateFileList();
    }

    private async _fetchSchema(connStr: string): Promise<string> {
        let cmd = '';
        let dbType = '';
        let toolName = '';
        
        if (connStr.startsWith('postgres://') || connStr.startsWith('postgresql://')) {
            dbType = 'postgres';
            toolName = 'psql';
            
            let cleanUri = connStr;
            let schema = 'current_schema()';

            // Extract schema from URI parameters to avoid psql errors and use it in query
            const schemaMatch = connStr.match(/[?&](schema|search_path|currentSchema)=([^&]+)/);
            if (schemaMatch) {
                schema = `'${decodeURIComponent(schemaMatch[2]).replace(/'/g, "''")}'`;
                cleanUri = connStr.replace(new RegExp(`[?&]${schemaMatch[1]}=[^&]+`), '');
                cleanUri = cleanUri.replace(/\?&/, '?').replace(/\?$/, '');
            } else {
                const optionsMatch = connStr.match(/[?&]options=([^&]+)/);
                if (optionsMatch) {
                    const options = decodeURIComponent(optionsMatch[1]);
                    const searchPathMatch = options.match(/search_path[=\s]+(\w+)/);
                    if (searchPathMatch) {
                        schema = `'${searchPathMatch[1].replace(/'/g, "''")}'`;
                    }
                    cleanUri = connStr.replace(new RegExp(`[?&]options=[^&]+`), '');
                    cleanUri = cleanUri.replace(/\?&/, '?').replace(/\?$/, '');
                }
            }

            const query = `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema=${schema} ORDER BY table_name, ordinal_position;`;
            cmd = `${findCliTool(toolName)} "${cleanUri}" -t -A -F"|" -c "${query}"`;
        } else if (connStr.startsWith('mysql://')) {
            dbType = 'mysql';
            toolName = 'mysql';
            const query = "SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY table_name, ordinal_position;";
            cmd = `${findCliTool(toolName)} "${connStr}" -N -B -e "${query}"`;
        } else if (connStr.startsWith('sqlite://')) {
            dbType = 'sqlite';
            toolName = 'sqlite3';
            let filePath = connStr.replace(/^sqlite:\/\//, '');
            if (filePath.match(/^\/[A-Za-z]:\//)) {
                filePath = filePath.substring(1);
            }
            const query = "SELECT m.name, p.name, p.type FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%' ORDER BY m.name, p.cid;";
            cmd = `${findCliTool(toolName)} "${filePath}" "${query}"`;
        } else {
            throw new Error('Unsupported DB type. Use postgres://, mysql://, or sqlite://');
        }

        const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10, windowsHide: true });
        
        if (stderr && dbType !== 'sqlite') {
            const cleanStderr = stderr.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
            if (cleanStderr.toLowerCase().includes('error') || cleanStderr.toLowerCase().includes('not recognized') || cleanStderr.toLowerCase().includes('not found')) {
                throw new Error(cleanStderr || 'Command failed');
            }
        }

        return this._parseSchemaOutput(stdout, dbType);
    }

    private _parseSchemaOutput(output: string, dbType: string): string {
        const tables: { [key: string]: string[] } = {};
        const lines = output.split('\n').filter(line => line.trim().length > 0);
        
        for (const line of lines) {
            let parts: string[] = [];
            if (dbType === 'postgres' || dbType === 'sqlite') {
                parts = line.split('|');
            } else if (dbType === 'mysql') {
                parts = line.split('\t');
            }
            
            if (parts.length >= 3) {
                const tableName = parts[0].trim();
                const colName = parts[1].trim();
                const colType = parts[2].trim();
                
                if (!tables[tableName]) {
                    tables[tableName] = [];
                }
                tables[tableName].push(`${colName}: ${colType}`);
            }
        }
        
        let result = '';
        for (const table in tables) {
            result += `     ${table}(${tables[table].join(', ')})\n`;
        }
        
        return result;
    }

    private async _updateFileList() {
        if (this._view) {
            const filesInfo = await this.payloadManager.getFilesInfo();
            this._view.webview.postMessage({ type: 'updateFiles', files: filesInfo });
        }
    }

    private _getHtmlForWebview(
        webview: vscode.Webview, systemPrompt: string, projectPrompt: string,
        userText: string, filesInfo: FileInfo[],
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
            </style>
        </head>
        <body>
            <details>
                <summary>Prompt settings</summary>
                <div style="margin-top: 10px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Global prompt:</label>
                    <textarea id="systemPrompt" class="small" placeholder="Global prompt..."></textarea>
                    <button id="saveSystemPromptBtn" class="secondary">💾 Save global prompt</button>
                    
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Project prompt:</label>
                    <textarea id="projectPrompt" class="small" placeholder="Local prompt for this particular project..."></textarea>
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
                let files = initialFiles || [];
                const expandedFiles = new Set();
                let selectedDbAliases = new Set();
                let gitHistoryLoaded = false;

                document.getElementById('systemPrompt').value = ${safeSystemPrompt};
                document.getElementById('projectPrompt').value = ${safeProjectPrompt};
                document.getElementById('userText').value = ${safeUserText};

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
}

export function deactivate() {}
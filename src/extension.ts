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
import { getMainWebview } from './mainWebview';

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
        const askPrompt = this.sysPromptManager.getAskPrompt();
        const customPrompt = this.sysPromptManager.getCustomPrompt();
        const currentMode = this.sysPromptManager.getCurrentMode();

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview, systemPrompt, projectPrompt,
            savedUserText, filesInfo, savedTreeSettings,
            currentMode, askPrompt, customPrompt
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
                        this.sysPromptManager.getActiveSystemPrompt(),
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
                case 'saveAskPrompt':
                    await this.sysPromptManager.setAskPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Ask prompt is saved!');
                    break;
                case 'saveCustomPrompt':
                    await this.sysPromptManager.setCustomPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Custom prompt is saved!');
                    break;
                case 'setMode':
                    await this.sysPromptManager.setCurrentMode(data.mode);
                    break;
                case 'saveProjectPrompt':
                    await this.sysPromptManager.setProjectPrompt(data.prompt);
                    vscode.window.showInformationMessage('✅ Project prompt is saved!');
                    break;
                case 'clearForm': {
                    const currentFiles = await this.payloadManager.getFilesInfo();
                    for (const file of currentFiles) {
                        await this.payloadManager.removeFile(vscode.Uri.parse(file.uri));
                    }
                    this._updateFileList();
                    this._dbStructure = '';
                    this._gitHistory = '';
                    break;
                }
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
                        this.sysPromptManager.getActiveSystemPrompt(),
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
        treeSettings: { includeTree: boolean; useGitignore: boolean; customIgnore: string },
        currentMode: string, askPrompt: string, customPrompt: string
    ) {
        const safeSystemPrompt = JSON.stringify(systemPrompt);
        const safeProjectPrompt = JSON.stringify(projectPrompt);
        const safeUserText = JSON.stringify(userText);
        const safeFilesInfo = JSON.stringify(filesInfo);
        const safeTreeSettings = JSON.stringify(treeSettings);
        const safeAskPrompt = JSON.stringify(askPrompt);
        const safeCustomPrompt = JSON.stringify(customPrompt);
        const safeCurrentMode = JSON.stringify(currentMode);

        return getMainWebview(safeSystemPrompt, safeProjectPrompt, safeUserText, safeFilesInfo, safeTreeSettings, safeAskPrompt, safeCustomPrompt, safeCurrentMode);
    }
}

export function deactivate() {}
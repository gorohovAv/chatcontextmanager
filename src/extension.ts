import * as vscode from 'vscode';
import { SystemPromptManager } from './sysPrompt';
import { TreeManager, TreeOptions } from './tree';
import { PayloadManager, FileInfo } from './payload';
import { LogInterceptorViewProvider } from './logInterceptor';
import { SettingsViewProvider } from './settingsView';
import { FigmaViewProvider } from './figmaView';
import { AcceptViewProvider } from './acceptView';
import { getGitHistory } from './history';
import { getMainWebview } from './mainWebview';
import { fetchDbSchema } from './dbTools';
import { registerReactBridge } from './extensionReactBridge'; // <-- ДОБАВЛЕНО

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

    const figmaProvider = new FigmaViewProvider(context);
    const figmaDisposable = vscode.window.registerWebviewViewProvider(
        FigmaViewProvider.viewType,
        figmaProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    context.subscriptions.push(figmaDisposable);

    const acceptProvider = new AcceptViewProvider(context);
    const acceptDisposable = vscode.window.registerWebviewViewProvider(
        AcceptViewProvider.viewType,
        acceptProvider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );
    context.subscriptions.push(acceptDisposable);

    // <-- ДОБАВЛЕНО: Регистрация нового React-вебвью
    registerReactBridge(context);
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
        const enrichedFiles = await this._enrichFilesWithCharCounts(filesInfo);

        const systemPrompt = this.sysPromptManager.getSystemPrompt();
        const projectPrompt = this.sysPromptManager.getProjectPrompt();
        const askPrompt = this.sysPromptManager.getAskPrompt();
        const customPrompt = this.sysPromptManager.getCustomPrompt();
        const currentMode = this.sysPromptManager.getCurrentMode();

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview, systemPrompt, projectPrompt,
            savedUserText, enrichedFiles as FileInfo[], savedTreeSettings,
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
                    const fileUris = await vscode.window.showOpenDialog({
                        canSelectMany: true, openLabel: 'Add files',
                        canSelectFiles: true, canSelectFolders: false
                    });
                    if (fileUris) {
                        await this.payloadManager.addFiles(fileUris);
                        this._updateFileList();
                    }
                    break;
                case 'addFolder':
                    const folderUris = await vscode.window.showOpenDialog({
                        canSelectMany: true, openLabel: 'Add folder',
                        canSelectFiles: false, canSelectFolders: true
                    });
                    if (folderUris) {
                        const allFiles: vscode.Uri[] = [];
                        for (const folderUri of folderUris) {
                            const files = await this._getFilesInFolder(folderUri);
                            allFiles.push(...files);
                        }
                        if (allFiles.length > 0) {
                            await this.payloadManager.addFiles(allFiles);
                            this._updateFileList();
                        } else {
                            vscode.window.showInformationMessage('No files found in the selected folder(s).');
                        }
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
                case 'setAllSymbols':
                    console.log('[setAllSymbols] Получено сообщение:', JSON.stringify(data, null, 2));
                    
                    const targetUri = vscode.Uri.parse(data.uri);
                    const shouldCheck = data.checkAll;
                    console.log('[setAllSymbols] URI:', data.uri);
                    console.log('[setAllSymbols] Должен установить все галочки:', shouldCheck);
                    
                    const currentFiles = await this.payloadManager.getFilesInfo();
                    console.log('[setAllSymbols] Найдено файлов:', currentFiles.length);
                    console.log('[setAllSymbols] URI файлов:', currentFiles.map(f => f.uri));
                    
                    const targetFile = currentFiles.find(f => f.uri === data.uri);
                    console.log('[setAllSymbols] Целевой файл найден:', !!targetFile);
                    
                    if (targetFile) {
                        console.log('[setAllSymbols] Символов в файле:', targetFile.symbols?.length || 0);
                        console.log('[setAllSymbols] Текущие состояния:', targetFile.states);
                        
                        const idsToToggle: string[] = [];
                        
                        const traverse = (symbols: any[]) => {
                            for (const sym of symbols) {
                                const isChecked = targetFile.states[sym.id] !== false;
                                console.log(`[setAllSymbols] Символ ${sym.id} (${sym.name}): isChecked=${isChecked}`);
                                
                                if (shouldCheck && !isChecked) {
                                    idsToToggle.push(sym.id);
                                    console.log(`[setAllSymbols] Добавлен в список для включения: ${sym.id}`);
                                } else if (!shouldCheck && isChecked) {
                                    idsToToggle.push(sym.id);
                                    console.log(`[setAllSymbols] Добавлен в список для выключения: ${sym.id}`);
                                }
                                
                                if (sym.children && sym.children.length > 0) {
                                    traverse(sym.children);
                                }
                            }
                        };
                        
                        traverse(targetFile.symbols || []);
                        
                        console.log('[setAllSymbols] ID для переключения:', idsToToggle);
                        console.log('[setAllSymbols] Количество ID:', idsToToggle.length);
                        
                        for (const id of idsToToggle) {
                            console.log(`[setAllSymbols] Переключаю символ: ${id}`);
                            await this.payloadManager.toggleSymbol(targetUri, id);
                        }
                        
                        console.log('[setAllSymbols] Все переключения завершены, обновляю список файлов');
                        this._updateFileList();
                    } else {
                        console.error('[setAllSymbols] Целевой файл не найден!');
                    }
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
                    const includeSysPromptsCompile = data.includeSystemPrompts === true;
                    const sysPromptCompile = includeSysPromptsCompile ? this.sysPromptManager.getActiveSystemPrompt() : '';
                    const projPromptCompile = includeSysPromptsCompile ? this.sysPromptManager.getProjectPrompt() : '';
                    
                    let finalPrompt = await this.payloadManager.compileFullPrompt(
                        sysPromptCompile,
                        projPromptCompile,
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
                    const currentFilesClear = await this.payloadManager.getFilesInfo();
                    for (const file of currentFilesClear) {
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
                    const includeSysPromptsCount = data.includeSystemPrompts === true;
                    const sysPromptCount = includeSysPromptsCount ? this.sysPromptManager.getActiveSystemPrompt() : '';
                    const projPromptCount = includeSysPromptsCount ? this.sysPromptManager.getProjectPrompt() : '';
                    
                    let length = await this.payloadManager.getCompiledPromptLength(
                        sysPromptCount,
                        projPromptCount,
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
                        
                        try {
                            const schema = await fetchDbSchema(connStr);
                            fullStructure += `${alias}\n${schema}\n\n`;
                        } catch (err: any) {
                            let errMsg = err.message || 'Unknown error';
                            errMsg = errMsg.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
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

    private async _getFilesInFolder(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
        const files: vscode.Uri[] = [];
        try {
            const entries = await vscode.workspace.fs.readDirectory(folderUri);
            for (const [name, type] of entries) {
                const entryUri = vscode.Uri.joinPath(folderUri, name);
                if (type === vscode.FileType.File) {
                    files.push(entryUri);
                } else if (type === vscode.FileType.Directory) {
                    const subFiles = await this._getFilesInFolder(entryUri);
                    files.push(...subFiles);
                }
            }
        } catch (e) {
            console.warn(`[PromptBuilder] Could not read directory ${folderUri.fsPath}:`, e);
        }
        return files;
    }

    private async _enrichFilesWithCharCounts(files: FileInfo[]): Promise<any[]> {
        const enriched = [];
        for (const file of files) {
            let fileCharCount = 0;
            let enrichedSymbols = file.symbols || [];
            try {
                const uri = vscode.Uri.parse(file.uri);
                const doc = await vscode.workspace.openTextDocument(uri);
                const text = doc.getText();
                fileCharCount = text.length;
                
                const enrich = (symbols: any[]): any[] => {
                    return symbols.map(sym => {
                        let symCharCount = 0;
                        if (sym.range && sym.range.start && sym.range.end) {
                            try {
                                const startPos = new vscode.Position(sym.range.start.line, sym.range.start.character);
                                const endPos = new vscode.Position(sym.range.end.line, sym.range.end.character);
                                const startOffset = doc.offsetAt(startPos);
                                const endOffset = doc.offsetAt(endPos);
                                symCharCount = Math.max(0, endOffset - startOffset);
                            } catch (e) {
                                symCharCount = 0;
                            }
                        } else if (typeof sym.charCount === 'number') {
                            symCharCount = sym.charCount;
                        }
                        
                        return {
                            ...sym,
                            charCount: symCharCount,
                            children: sym.children ? enrich(sym.children) : []
                        };
                    });
                };
                
                enrichedSymbols = enrich(file.symbols || []);
            } catch (e) {
                fileCharCount = (file as any).charCount || 0;
            }
            
            enriched.push({
                ...file,
                charCount: fileCharCount,
                symbols: enrichedSymbols
            });
        }
        return enriched;
    }

    private async _updateFileList() {
        if (this._view) {
            const filesInfo = await this.payloadManager.getFilesInfo();
            const enrichedFiles = await this._enrichFilesWithCharCounts(filesInfo);
            this._view.webview.postMessage({ type: 'updateFiles', files: enrichedFiles });
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
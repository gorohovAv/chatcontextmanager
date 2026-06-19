import * as vscode from 'vscode';
import * as fs from 'fs';

export class LogInterceptorManager {
    private isActive: boolean = false;
    private logFilePath: string | undefined;
    private linesWritten: number = 0;
    private disposable: vscode.Disposable | undefined;
    private writeStream: fs.WriteStream | undefined;

    private onDataWrittenEmitter = new vscode.EventEmitter<void>();
    public readonly onDataWritten = this.onDataWrittenEmitter.event;

    private onStateChangedEmitter = new vscode.EventEmitter<void>();
    public readonly onStateChanged = this.onStateChangedEmitter.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        // Восстанавливаем путь к файлу из workspaceState
        this.logFilePath = this.context.workspaceState.get<string>('logInterceptor.filePath');
    }

    public getState() {
        return {
            isActive: this.isActive,
            logFilePath: this.logFilePath,
            linesWritten: this.linesWritten
        };
    }

    public async selectFile() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Выбрать файл лога',
            canSelectFiles: true,
            canSelectFolders: false,
            filters: { 'Text files': ['txt', 'log'] }
        });
        if (uris && uris.length > 0) {
            this.logFilePath = uris[0].fsPath;
            // Персистентное хранение на уровне workspace
            await this.context.workspaceState.update('logInterceptor.filePath', this.logFilePath);
            this.onStateChangedEmitter.fire();
            return this.logFilePath;
        }
        return null;
    }

    public async start() {
        if (this.isActive) return;
        if (!this.logFilePath) {
            vscode.window.showErrorMessage('Choose file for your logs first!');
            return;
        }

        try {
            this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
            
            // onDidWriteTerminalData - это proposed API, поэтому используем any
            const windowAny = vscode.window as any;
            if (typeof windowAny.onDidWriteTerminalData !== 'function') {
                vscode.window.showErrorMessage('API onDidWriteTerminalData is not accesible. Make sure that plugin is started with proposed API (terminalDataWriteEvent).');
                this.writeStream.end();
                this.writeStream = undefined;
                return;
            }

            this.disposable = windowAny.onDidWriteTerminalData((e: any) => {
                if (this.writeStream && e.data) {
                    // Считаем количество переводов строк
                    const newLines = (e.data.match(/\n/g) || []).length;
                    this.linesWritten += newLines;
                    
                    // Пишем сырые данные в файл
                    this.writeStream.write(e.data);
                    this.onDataWrittenEmitter.fire();
                }
            });

            this.isActive = true;
            this.onStateChangedEmitter.fire();
            vscode.window.showInformationMessage('✅ Intercepting worker is running.');
        } catch (err) {
            vscode.window.showErrorMessage(`Worker error: ${err}`);
        }
    }

    public stop() {
        if (!this.isActive) return;
        
        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
        if (this.writeStream) {
            this.writeStream.end();
            this.writeStream = undefined;
        }
        
        this.isActive = false;
        this.onStateChangedEmitter.fire();
        vscode.window.showInformationMessage('⏹ worker stopped.');
    }

    public dispose() {
        this.stop();
        this.onDataWrittenEmitter.dispose();
        this.onStateChangedEmitter.dispose();
    }
}

export class LogInterceptorViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'logInterceptorView';
    private _view?: vscode.WebviewView;
    private logManager: LogInterceptorManager;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.logManager = new LogInterceptorManager(context);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.html = this._getHtmlForWebview();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'selectFile':
                    await this.logManager.selectFile();
                    break;
                case 'toggleWorker':
                    if (this.logManager.getState().isActive) {
                        this.logManager.stop();
                    } else {
                        await this.logManager.start();
                    }
                    break;
            }
        });

        // Throttle для обновления счетчика строк, чтобы не лагал UI при быстром выводе
        let updateTimer: NodeJS.Timeout | undefined;
        const scheduleUpdate = () => {
            if (updateTimer) return;
            updateTimer = setTimeout(() => {
                this._updateState();
                updateTimer = undefined;
            }, 200); 
        };

        // Изменения состояния (файл, старт/стоп) обновляем мгновенно
        this.logManager.onStateChanged(() => this._updateState());
        // Новые данные обновляем с задержкой
        this.logManager.onDataWritten(() => scheduleUpdate());

        this._updateState();
    }

    private _updateState() {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'updateState', 
                state: this.logManager.getState() 
            });
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Log Interceptor</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                .file-path {
                    padding: 6px; margin-bottom: 10px; background: var(--vscode-input-background);
                    color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
                    border-radius: 4px; font-size: 0.9em; word-break: break-all; min-height: 20px;
                }
                button { 
                    width: 100%; padding: 8px; margin-bottom: 10px; cursor: pointer;
                    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
                    border: none; border-radius: 4px; font-weight: bold;
                }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                button.stop { background: #c72e2e; color: white; }
                button.stop:hover { background: #a82525; }
                .stats {
                    padding: 8px; background: var(--vscode-list-hoverBackground);
                    border-radius: 4px; text-align: center; font-size: 0.9em;
                }
            </style>
        </head>
        <body>
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Log file:</label>
            <div id="filePath" class="file-path">Not choosen</div>
            <button id="selectFileBtn" class="secondary">📁 Pick file</button>
            
            <button id="toggleWorkerBtn">▶ Run worker</button>
            
            <div class="stats">
                Записано строк: <strong id="linesCount">0</strong>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const filePathEl = document.getElementById('filePath');
                const toggleWorkerBtn = document.getElementById('toggleWorkerBtn');
                const linesCountEl = document.getElementById('linesCount');

                document.getElementById('selectFileBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'selectFile' });
                });

                toggleWorkerBtn.addEventListener('click', () => {
                    vscode.postMessage({ type: 'toggleWorker' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateState') {
                        const state = message.state;
                        filePathEl.textContent = state.logFilePath || 'Not choosen';
                        linesCountEl.textContent = state.linesWritten.toLocaleString();
                        
                        if (state.isActive) {
                            toggleWorkerBtn.textContent = '⏹ Stop worker';
                            toggleWorkerBtn.classList.add('stop');
                        } else {
                            toggleWorkerBtn.textContent = '▶ Run worker';
                            toggleWorkerBtn.classList.remove('stop');
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
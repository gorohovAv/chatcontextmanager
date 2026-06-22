import * as vscode from 'vscode';

export class SettingsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'settingsView';
    private _view?: vscode.WebviewView;

    constructor(private readonly context: vscode.ExtensionContext) {}

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
                case 'addConnection':
                    await this._addConnection();
                    break;
                case 'editConnection':
                    await this._editConnection(data.alias);
                    break;
                case 'deleteConnection':
                    await this._deleteConnection(data.alias);
                    break;
                case 'requestList':
                    await this._updateList();
                    break;
            }
        });
    }

    private async _getAliases(): Promise<string[]> {
        return this.context.globalState.get<string[]>('dbConnectionAliases', []);
    }

    private async _saveAliases(aliases: string[]) {
        await this.context.globalState.update('dbConnectionAliases', aliases);
    }

    private async _addConnection() {
        const alias = await vscode.window.showInputBox({ prompt: 'Enter connection alias', ignoreFocusOut: true });
        if (!alias) return;
        
        const connStr = await vscode.window.showInputBox({ prompt: 'Enter connection string', password: true, ignoreFocusOut: true });
        if (!connStr) return;

        const aliases = await this._getAliases();
        if (aliases.includes(alias)) {
            vscode.window.showErrorMessage('Alias already exists!');
            return;
        }

        aliases.push(alias);
        await this._saveAliases(aliases);
        await this.context.secrets.store(`dbConn_${alias}`, connStr);
        vscode.window.showInformationMessage('Connection added!');
        
        // FIX: Update the list in the webview after adding
        await this._updateList();
    }

    private async _editConnection(alias: string) {
        const currentStr = await this.context.secrets.get(`dbConn_${alias}`) || '';
        const connStr = await vscode.window.showInputBox({ 
            prompt: `Edit connection string for ${alias}`, 
            password: true, 
            ignoreFocusOut: true,
            value: currentStr
        });
        if (connStr !== undefined) {
            await this.context.secrets.store(`dbConn_${alias}`, connStr);
            vscode.window.showInformationMessage('Connection updated!');
        }
    }

    private async _deleteConnection(alias: string) {
        const confirm = await vscode.window.showWarningMessage(`Delete connection "${alias}"?`, 'Yes', 'No');
        if (confirm === 'Yes') {
            let aliases = await this._getAliases();
            aliases = aliases.filter(a => a !== alias);
            await this._saveAliases(aliases);
            await this.context.secrets.delete(`dbConn_${alias}`);
            vscode.window.showInformationMessage('Connection deleted!');
            
            // FIX: Update the list in the webview after deleting
            await this._updateList();
        }
    }

    private async _updateList() {
        if (this._view) {
            const aliases = await this._getAliases();
            this._view.webview.postMessage({ type: 'updateList', aliases });
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Settings</title>
            <style>
                body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
                button { 
                    padding: 6px 12px; margin: 4px 4px 4px 0; cursor: pointer;
                    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
                    border: none; border-radius: 4px;
                }
                button:hover { background: var(--vscode-button-hoverBackground); }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
                button.danger { background: var(--vscode-errorBackground, #d32f2f); color: var(--vscode-errorForeground, #fff); }
                .conn-item {
                    display: flex; justify-content: space-between; align-items: center;
                    background: var(--vscode-list-hoverBackground); padding: 8px; border-radius: 4px; margin-bottom: 6px;
                }
                .conn-actions button { margin-left: 5px; padding: 4px 8px; font-size: 0.9em; }
                .examples {
                    margin-top: 20px; padding: 10px;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    font-family: monospace;
                    font-size: 0.85em;
                    white-space: pre-wrap;
                }
                h3 { margin-top: 15px; margin-bottom: 10px; }
            </style>
        </head>
        <body>
            <h3>Database Connections</h3>
            <button id="addBtn">➕ Add Connection</button>
            <div id="connList" style="margin-top: 10px;"></div>

            <h3>Connection String Examples</h3>
            <div class="examples">
<b>PostgreSQL:</b>
postgres://user:password@localhost:5432/mydb

<b>MySQL:</b>
mysql://user:password@localhost:3306/mydb

<b>SQLite:</b>
sqlite:///C:/path/to/database.db
or
sqlite:///home/user/project/database.sqlite
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const connList = document.getElementById('connList');

                document.getElementById('addBtn').addEventListener('click', () => {
                    vscode.postMessage({ type: 'addConnection' });
                });

                function renderList(aliases) {
                    connList.innerHTML = '';
                    if (aliases.length === 0) {
                        connList.innerHTML = '<p style="color: var(--vscode-descriptionForeground);">No connections saved.</p>';
                        return;
                    }
                    aliases.forEach(alias => {
                        const div = document.createElement('div');
                        div.className = 'conn-item';
                        
                        const nameSpan = document.createElement('span');
                        nameSpan.textContent = '🔌 ' + alias;
                        
                        const actionsDiv = document.createElement('div');
                        actionsDiv.className = 'conn-actions';
                        
                        const editBtn = document.createElement('button');
                        editBtn.className = 'secondary';
                        editBtn.textContent = 'Edit';
                        editBtn.onclick = () => vscode.postMessage({ type: 'editConnection', alias });
                        
                        const delBtn = document.createElement('button');
                        delBtn.className = 'danger';
                        delBtn.textContent = 'Delete';
                        delBtn.onclick = () => vscode.postMessage({ type: 'deleteConnection', alias });
                        
                        actionsDiv.appendChild(editBtn);
                        actionsDiv.appendChild(delBtn);
                        
                        div.appendChild(nameSpan);
                        div.appendChild(actionsDiv);
                        connList.appendChild(div);
                    });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    if (message.type === 'updateList') {
                        renderList(message.aliases || []);
                    }
                });

                // Initial request
                vscode.postMessage({ type: 'requestList' });
            </script>
        </body>
        </html>`;
    }
}
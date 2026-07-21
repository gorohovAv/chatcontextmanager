import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseHuntPlan, executeHuntPlan, parsePatch, applyPatch } from './fullTextOpsFuncs';

export class FullTextOpsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'fullTextOpsView';
    private _view?: vscode.WebviewView;
    private _searchResults: string = '';

    constructor(private readonly context: vscode.ExtensionContext) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'loadFile':
                    const uris = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: 'Select XML File',
                        canSelectFiles: true,
                        canSelectFolders: false,
                        filters: { 'XML Files': ['xml'] }
                    });
                    if (uris && uris[0]) {
                        const content = fs.readFileSync(uris[0].fsPath, 'utf-8');
                        this._view?.webview.postMessage({ type: 'fileLoaded', content, fileType: data.fileType });
                    }
                    break;
                    
                case 'executeSearch':
                    this._view?.webview.postMessage({ type: 'status', target: 'search', text: 'Executing search...' });
                    try {
                        const plan = parseHuntPlan(data.xmlContent);
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) {
                            throw new Error('No workspace folder open');
                        }
                        const workspaceRoot = workspaceFolders[0].uri.fsPath;
                        this._searchResults = await executeHuntPlan(plan, workspaceRoot);
                        this._view?.webview.postMessage({ type: 'searchComplete', results: this._searchResults });
                    } catch (e: any) {
                        this._view?.webview.postMessage({ type: 'error', target: 'search', error: e.message });
                    }
                    break;
                    
                case 'copyToClipboard':
                    if (this._searchResults) {
                        await vscode.env.clipboard.writeText(this._searchResults);
                        vscode.window.showInformationMessage('✅ Search results copied to clipboard!');
                    }
                    break;
                    
                case 'applyPatch':
                    this._view?.webview.postMessage({ type: 'status', target: 'patch', text: 'Applying patch...' });
                    try {
                        const operations = parsePatch(data.xmlContent);
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (!workspaceFolders) {
                            throw new Error('No workspace folder open');
                        }
                        const workspaceRoot = workspaceFolders[0].uri.fsPath;
                        const patchResults = await applyPatch(operations, workspaceRoot);
                        this._view?.webview.postMessage({ type: 'patchComplete', results: patchResults });
                    } catch (e: any) {
                        this._view?.webview.postMessage({ type: 'error', target: 'patch', error: e.message });
                    }
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Full Text Ops</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
        h3 { margin-top: 20px; margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
        textarea { 
            width: 100%; 
            height: 150px; 
            background-color: var(--vscode-input-background); 
            color: var(--vscode-input-foreground); 
            border: 1px solid var(--vscode-input-border); 
            padding: 8px; 
            box-sizing: border-box; 
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            margin-bottom: 10px;
            resize: vertical;
        }
        button { 
            background-color: var(--vscode-button-background); 
            color: var(--vscode-button-foreground); 
            border: none; 
            padding: 8px 16px; 
            cursor: pointer; 
            margin-right: 8px;
            margin-bottom: 10px;
            border-radius: 2px;
        }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .status { margin: 10px 0; font-style: italic; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
        .results { 
            white-space: pre-wrap; 
            background-color: var(--vscode-textBlockQuote-background); 
            padding: 10px; 
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            max-height: 300px;
            overflow-y: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            margin-top: 10px;
        }
        .file-input-wrapper { margin-bottom: 10px; display: flex; align-items: center; }
        .file-name { margin-left: 10px; font-size: 0.9em; color: var(--vscode-charts-green); }
    </style>
</head>
<body>
    <h3>🔍 Hunt Plan (Search)</h3>
    <div class="file-input-wrapper">
        <button id="loadHuntPlanBtn">Load Hunt Plan XML</button>
        <span id="huntPlanFileName" class="file-name"></span>
    </div>
    <textarea id="huntPlanXml" placeholder="Or paste Hunt Plan XML here..."></textarea>
    <br>
    <button id="searchBtn">Search</button>
    <button id="copyBtn" disabled>Copy to Clipboard</button>
    <div id="searchStatus" class="status"></div>
    <div id="searchResults" class="results" style="display: none;"></div>

    <h3>🛠️ Patch Application</h3>
    <div class="file-input-wrapper">
        <button id="loadPatchBtn">Load Patch XML</button>
        <span id="patchFileName" class="file-name"></span>
    </div>
    <textarea id="patchXml" placeholder="Or paste Patch XML here..."></textarea>
    <br>
    <button id="applyPatchBtn">Apply Patch</button>
    <div id="patchStatus" class="status"></div>
    <div id="patchResults" class="results" style="display: none;"></div>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('loadHuntPlanBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'loadFile', fileType: 'huntPlan' });
        });

        document.getElementById('loadPatchBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'loadFile', fileType: 'patch' });
        });

        document.getElementById('searchBtn').addEventListener('click', () => {
            const xml = document.getElementById('huntPlanXml').value;
            if (!xml.trim()) {
                alert('Please provide Hunt Plan XML');
                return;
            }
            document.getElementById('searchStatus').innerText = 'Executing search...';
            document.getElementById('searchResults').style.display = 'none';
            document.getElementById('copyBtn').disabled = true;
            vscode.postMessage({ type: 'executeSearch', xmlContent: xml });
        });

        document.getElementById('copyBtn').addEventListener('click', () => {
            vscode.postMessage({ type: 'copyToClipboard' });
        });

        document.getElementById('applyPatchBtn').addEventListener('click', () => {
            const xml = document.getElementById('patchXml').value;
            if (!xml.trim()) {
                alert('Please provide Patch XML');
                return;
            }
            document.getElementById('patchStatus').innerText = 'Applying patch...';
            document.getElementById('patchResults').style.display = 'none';
            vscode.postMessage({ type: 'applyPatch', xmlContent: xml });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'fileLoaded':
                    if (message.fileType === 'huntPlan') {
                        document.getElementById('huntPlanXml').value = message.content;
                        document.getElementById('huntPlanFileName').innerText = 'Loaded';
                    } else if (message.fileType === 'patch') {
                        document.getElementById('patchXml').value = message.content;
                        document.getElementById('patchFileName').innerText = 'Loaded';
                    }
                    break;
                case 'status':
                    document.getElementById(message.target + 'Status').innerText = message.text;
                    break;
                case 'searchComplete':
                    document.getElementById('searchStatus').innerText = 'Search complete!';
                    document.getElementById('searchResults').innerText = message.results;
                    document.getElementById('searchResults').style.display = 'block';
                    document.getElementById('copyBtn').disabled = false;
                    break;
                case 'patchComplete':
                    document.getElementById('patchStatus').innerText = 'Patch application complete!';
                    document.getElementById('patchResults').innerText = message.results;
                    document.getElementById('patchResults').style.display = 'block';
                    break;
                case 'error':
                    document.getElementById(message.target + 'Status').innerText = '❌ Error: ' + message.error;
                    break;
            }
        });
    </script>
</body>
</html>`;
    }
}
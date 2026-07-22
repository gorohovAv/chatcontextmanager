import * as vscode from 'vscode';
import * as path from 'path';

export class AcceptViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'acceptView';
    private _view?: vscode.WebviewView;

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
            if (data.type === 'acceptXml') {
                await this._processXml(data.content, webviewView.webview);
            }
        });
    }

    private async _processXml(content: string, webview: vscode.Webview) {
        try {
            const fileMatches = content.match(/<file>([\s\S]*?)<\/file>/g);
            if (!fileMatches) {
                throw new Error('No <file> tags found in the XML.');
            }

            let updatedCount = 0;
            for (const fileMatch of fileMatches) {
                const pathMatch = fileMatch.match(/<path>([\s\S]*?)<\/path>/);
                // Жадное сопоставление ([\s\S]*) гарантирует, что мы захватим текст до ПОСЛЕДНЕГО </text>,
                // что корректно обрабатывает неэкранированные "</text>" внутри самого кода.
                const textMatch = fileMatch.match(/<text>([\s\S]*)<\/text>/);
                
                if (pathMatch && textMatch) {
                    const filePath = pathMatch[1].trim();
                    const fileText = textMatch[1];
                    
                    let uri: vscode.Uri;
                    if (path.isAbsolute(filePath)) {
                        uri = vscode.Uri.file(filePath);
                    } else {
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (!workspaceFolder) {
                            throw new Error('No workspace folder open. Cannot resolve relative path: ' + filePath);
                        }
                        const normalizedPath = filePath.replace(/^\.?\//, '');
                        uri = vscode.Uri.joinPath(workspaceFolder.uri, normalizedPath);
                    }

                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(uri, encoder.encode(fileText));
                    updatedCount++;
                }
            }
            
            webview.postMessage({ type: 'acceptSuccess', count: updatedCount });
            vscode.window.showInformationMessage(`✅ Successfully updated ${updatedCount} file(s)!`);
        } catch (error: any) {
            webview.postMessage({ type: 'acceptError', error: error.message });
            vscode.window.showErrorMessage('❌ Error processing XML: ' + error.message);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accept View</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
        textarea { width: 100%; height: 200px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; box-sizing: border-box; resize: vertical; }
        textarea:disabled { opacity: 0.5; cursor: not-allowed; }
        .file-input-wrapper { margin: 10px 0; }
        input[type="file"] { color: var(--vscode-foreground); }
        input[type="file"]:disabled { opacity: 0.5; cursor: not-allowed; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 12px; cursor: pointer; margin-top: 10px; width: 100%; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .status { margin-top: 10px; color: var(--vscode-descriptionForeground); font-size: 0.9em; word-wrap: break-word; }
    </style>
</head>
<body>
    <h3>Accept XML</h3>
    <textarea id="xmlText" placeholder="Paste XML here..."></textarea>
    <div class="file-input-wrapper">
        <label for="xmlFile">Or select an XML file: </label>
        <input type="file" id="xmlFile" accept=".xml,.txt">
    </div>
    <button id="acceptBtn">Accept</button>
    <div id="status" class="status"></div>

    <script>
        const vscode = acquireVsCodeApi();
        const xmlText = document.getElementById('xmlText');
        const xmlFile = document.getElementById('xmlFile');
        const acceptBtn = document.getElementById('acceptBtn');
        const status = document.getElementById('status');
        let fileContent = '';

        xmlText.addEventListener('input', () => {
            if (xmlText.value.trim().length > 0) {
                xmlFile.disabled = true;
            } else {
                xmlFile.disabled = false;
            }
        });

        xmlFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                xmlText.disabled = true;
                const reader = new FileReader();
                reader.onload = (event) => {
                    fileContent = event.target.result;
                    status.textContent = 'File "' + file.name + '" loaded. Ready to accept.';
                };
                reader.onerror = () => {
                    status.textContent = 'Error reading file.';
                    xmlText.disabled = false;
                    xmlFile.value = '';
                };
                reader.readAsText(file);
            } else {
                xmlText.disabled = false;
                fileContent = '';
                status.textContent = '';
            }
        });

        acceptBtn.addEventListener('click', () => {
            let contentToSend = '';
            if (!xmlText.disabled && xmlText.value.trim().length > 0) {
                contentToSend = xmlText.value.trim();
            } else if (!xmlFile.disabled && fileContent) {
                contentToSend = fileContent;
            }

            if (!contentToSend) {
                status.textContent = 'Please provide XML text or select a file.';
                return;
            }

            status.textContent = 'Processing...';
            acceptBtn.disabled = true;
            vscode.postMessage({ type: 'acceptXml', content: contentToSend });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            acceptBtn.disabled = false;
            if (message.type === 'acceptSuccess') {
                status.textContent = 'Files updated successfully! (' + (message.count || 0) + ' files)';
                xmlText.value = '';
                xmlText.disabled = false;
                xmlFile.disabled = false;
                xmlFile.value = '';
                fileContent = '';
            } else if (message.type === 'acceptError') {
                status.textContent = 'Error: ' + message.error;
            }
        });
    </script>
</body>
</html>`;
    }
}
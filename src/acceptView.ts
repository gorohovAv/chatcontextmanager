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

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '(no workspace open)';

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, workspaceRoot);

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

    private _getHtmlForWebview(webview: vscode.Webview, workspaceRoot: string) {
        const systemPromptExample = `You are a coding assistant. When asked to modify or create files, you MUST output ONLY a valid XML block with the following structure. Do not wrap the XML in markdown code blocks.

Structure:
<root>
  <file>
    <path>relative/path/to/file.ext</path>
    <text>
      Full file content goes here.
    </text>
  </file>
</root>

Rules:
1. <path> must be relative to the project root (e.g., "src/main.ts") or an absolute path.
2. <text> must contain the COMPLETE, updated content of the file, not just a diff or snippet.
3. If the file is new, provide the full content.
4. Ensure the XML is well-formed.`;

        const safeWorkspaceRoot = workspaceRoot.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safePrompt = systemPromptExample.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accept View</title>
    <style>
        body { font-family: var(--vscode-font-family); padding: 10px; color: var(--vscode-foreground); }
        .base-path { font-size: 0.85em; color: var(--vscode-descriptionForeground); margin-bottom: 10px; padding: 6px 8px; background: var(--vscode-textBlockQuote-background); border-left: 3px solid var(--vscode-textBlockQuote-border); word-break: break-all; }
        .base-path strong { color: var(--vscode-foreground); }
        textarea { width: 100%; height: 200px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; box-sizing: border-box; resize: vertical; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        textarea:disabled { opacity: 0.5; cursor: not-allowed; }
        .file-input-wrapper { margin: 10px 0; }
        input[type="file"] { color: var(--vscode-foreground); }
        input[type="file"]:disabled { opacity: 0.5; cursor: not-allowed; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 12px; cursor: pointer; margin-top: 10px; width: 100%; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .status { margin-top: 10px; color: var(--vscode-descriptionForeground); font-size: 0.9em; word-wrap: break-word; }
        hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 20px 0; }
        pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.82em; white-space: pre-wrap; word-wrap: break-word; }
        code { font-family: var(--vscode-editor-font-family); color: var(--vscode-foreground); }
    </style>
</head>
<body>
    <h3>Accept XML</h3>
    
    <div class="base-path">
        <strong>Base path:</strong> ${safeWorkspaceRoot}
    </div>

    <textarea id="xmlText" placeholder="Paste XML here..."></textarea>
    
    <div class="file-input-wrapper">
        <label for="xmlFile">Or select an XML file: </label>
        <input type="file" id="xmlFile" accept=".xml,.txt">
    </div>
    
    <button id="acceptBtn">Accept & Apply Files</button>
    <div id="status" class="status"></div>

    <hr>
    
    <h4>AI System Prompt Example</h4>
    <p style="font-size: 0.85em; color: var(--vscode-descriptionForeground);">Use this prompt to instruct the AI to generate the correct XML format:</p>
    <pre><code>${safePrompt}</code></pre>

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
            vscode.postMessage({ 
                type: 'acceptXml', 
                content: contentToSend
            });
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'acceptSuccess') {
                acceptBtn.disabled = false;
                status.textContent = 'Files updated successfully! (' + (message.count || 0) + ' files)';
                xmlText.value = '';
                xmlText.disabled = false;
                xmlFile.disabled = false;
                xmlFile.value = '';
                fileContent = '';
            } else if (message.type === 'acceptError') {
                acceptBtn.disabled = false;
                status.textContent = 'Error: ' + message.error;
            }
        });
    </script>
</body>
</html>`;
    }
}
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

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, workspaceRoot);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'acceptFiles') {
                await this._applyFiles(data.files, webviewView.webview);
            }
        });
    }

    private async _applyFiles(files: Array<{ path: string; text: string }>, webview: vscode.Webview) {
        try {
            if (!files || files.length === 0) {
                throw new Error('No files to apply.');
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder is open. Cannot apply files.');
            }
            const workspaceRoot = workspaceFolder.uri.fsPath;

            let updatedCount = 0;
            for (const file of files) {
                const filePath = (file.path || '').trim();
                const fileText = file.text || '';

                if (!filePath) {
                    continue;
                }

                let absolutePath: string;

                // Если путь выглядит как абсолютный Windows-путь (C:\... или C:/...) — используем его как есть
                if (/^[a-zA-Z]:[\\\/]/.test(filePath)) {
                    absolutePath = filePath;
                } else {
                    // Иначе считаем путь относительным от workspace root.
                    // Убираем ведущий '/', './', '.\' — это всё обозначает "от корня workspace".
                    const normalized = filePath.replace(/^[\/\\]+/, '').replace(/^\.[\/\\]/, '');
                    absolutePath = path.resolve(workspaceRoot, normalized);
                }

                const uri = vscode.Uri.file(absolutePath);
                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(uri, encoder.encode(fileText));
                updatedCount++;
            }

            webview.postMessage({ type: 'acceptSuccess', count: updatedCount });
            vscode.window.showInformationMessage(`✅ Successfully updated ${updatedCount} file(s)!`);
        } catch (error: any) {
            webview.postMessage({ type: 'acceptError', error: error.message });
            vscode.window.showErrorMessage('❌ Error applying files: ' + error.message);
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
1. <path> MUST be relative to the project root. Examples: "src/main.ts", "/src/main.ts", "./src/main.ts" — all are interpreted as relative to workspace root.
2. Do NOT use absolute filesystem paths (like "C:\\..." or "/home/...") unless explicitly asked.
3. <text> must contain the COMPLETE, updated content of the file, not just a diff or snippet.
4. If the file is new, provide the full content.
5. Ensure the XML is well-formed.`;

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
        textarea { width: 100%; height: 180px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; box-sizing: border-box; resize: vertical; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        textarea:disabled { opacity: 0.5; cursor: not-allowed; }
        .file-input-wrapper { margin: 10px 0; }
        input[type="file"] { color: var(--vscode-foreground); }
        input[type="file"]:disabled { opacity: 0.5; cursor: not-allowed; }
        button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px 12px; cursor: pointer; margin-top: 10px; width: 100%; }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .status { margin-top: 10px; color: var(--vscode-descriptionForeground); font-size: 0.9em; word-wrap: break-word; }
        .file-list { margin-top: 15px; }
        .file-list h4 { margin: 0 0 8px 0; font-size: 0.95em; }
        .file-item { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .file-item input[type="text"] { flex: 1; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px 7px; box-sizing: border-box; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        .remove-btn { background: transparent; color: var(--vscode-errorForeground); border: 1px solid var(--vscode-errorForeground); padding: 3px 8px; width: auto; margin: 0; font-size: 0.85em; }
        .remove-btn:hover { background: var(--vscode-errorForeground); color: var(--vscode-button-foreground); }
        hr { border: none; border-top: 1px solid var(--vscode-panel-border); margin: 20px 0; }
        pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.82em; white-space: pre-wrap; word-wrap: break-word; }
        code { font-family: var(--vscode-editor-font-family); color: var(--vscode-foreground); }
        .hidden { display: none; }
    </style>
</head>
<body>
    <h3>Accept XML</h3>

    <div class="base-path">
        <strong>Workspace root:</strong> ${safeWorkspaceRoot || '(no workspace open)'}
    </div>

    <textarea id="xmlText" placeholder="Paste XML here..."></textarea>

    <div class="file-input-wrapper">
        <label for="xmlFile">Or select an XML file: </label>
        <input type="file" id="xmlFile" accept=".xml,.txt">
    </div>

    <button id="parseBtn">Parse XML</button>

    <div id="fileListSection" class="file-list hidden">
        <h4>Files to apply (<span id="fileCount">0</span>):</h4>
        <div id="fileList"></div>
        <button id="acceptBtn">Accept & Apply Files</button>
    </div>

    <div id="status" class="status"></div>

    <hr>

    <h4>AI System Prompt Example</h4>
    <p style="font-size: 0.85em; color: var(--vscode-descriptionForeground);">Use this prompt to instruct the AI to generate the correct XML format:</p>
    <pre><code>${safePrompt}</code></pre>

    <script>
        const vscode = acquireVsCodeApi();
        const xmlText = document.getElementById('xmlText');
        const xmlFile = document.getElementById('xmlFile');
        const parseBtn = document.getElementById('parseBtn');
        const acceptBtn = document.getElementById('acceptBtn');
        const fileListSection = document.getElementById('fileListSection');
        const fileList = document.getElementById('fileList');
        const fileCount = document.getElementById('fileCount');
        const status = document.getElementById('status');

        const WORKSPACE_ROOT = ${JSON.stringify(workspaceRoot)};

        // Хранилище распарсенных файлов: [{path, text}, ...]
        // path здесь — исходный путь из XML (относительный workspace).
        let parsedFiles = [];

        // Взаимная блокировка textarea и file input
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
                    xmlText.value = event.target.result;
                    status.textContent = 'File "' + file.name + '" loaded. Click "Parse XML" to preview.';
                };
                reader.onerror = () => {
                    status.textContent = 'Error reading file.';
                    xmlText.disabled = false;
                    xmlFile.value = '';
                };
                reader.readAsText(file);
            } else {
                xmlText.disabled = false;
                status.textContent = '';
            }
        });

        // Парсинг XML и отображение списка файлов
        parseBtn.addEventListener('click', () => {
            const content = xmlText.value.trim();
            if (!content) {
                status.textContent = 'Please provide XML text or select a file first.';
                return;
            }

            try {
                parsedFiles = parseXml(content);
                if (parsedFiles.length === 0) {
                    status.textContent = 'No <file> entries found in the XML.';
                    fileListSection.classList.add('hidden');
                    return;
                }
                renderFileList();
                fileListSection.classList.remove('hidden');
                status.textContent = 'Parsed ' + parsedFiles.length + ' file(s). Review absolute paths and click "Accept & Apply Files".';
            } catch (err) {
                status.textContent = 'Parse error: ' + err.message;
                fileListSection.classList.add('hidden');
                parsedFiles = [];
            }
        });

        // Применение файлов с учётом отредактированных путей
        acceptBtn.addEventListener('click', () => {
            if (parsedFiles.length === 0) {
                status.textContent = 'Nothing to apply.';
                return;
            }

            // Собираем актуальные пути из input'ов.
            // Пользователь видит и редактирует АБСОЛЮТНЫЕ пути — их и отправляем.
            const filesToSend = [];
            const inputs = fileList.querySelectorAll('input[data-index]');
            inputs.forEach((input, idx) => {
                const newPath = input.value.trim();
                if (newPath && parsedFiles[idx]) {
                    filesToSend.push({
                        path: newPath,
                        text: parsedFiles[idx].text
                    });
                }
            });

            if (filesToSend.length === 0) {
                status.textContent = 'All paths are empty. Nothing to apply.';
                return;
            }

            status.textContent = 'Applying ' + filesToSend.length + ' file(s)...';
            acceptBtn.disabled = true;
            parseBtn.disabled = true;
            vscode.postMessage({ type: 'acceptFiles', files: filesToSend });
        });

        function parseXml(content) {
            const result = [];
            const fileMatches = content.match(/<file>([\\s\\S]*?)<\\/file>/g);
            if (!fileMatches) {
                return result;
            }
            for (const fileMatch of fileMatches) {
                const pathMatch = fileMatch.match(/<path>([\\s\\S]*?)<\\/path>/);
                const textMatch = fileMatch.match(/<text>([\\s\\S]*)<\\/text>/);
                if (pathMatch && textMatch) {
                    result.push({
                        path: pathMatch[1].trim(),
                        text: textMatch[1]
                    });
                }
            }
            return result;
        }

        // Преобразует путь из XML (относительный workspace) в абсолютный путь от корня ФС.
        // Это ТОЛЬКО для отображения пользователю. Реальный резолв происходит на TS-стороне.
        function resolveToAbsolute(xmlPath) {
            if (!WORKSPACE_ROOT) {
                return xmlPath;
            }

            // Если путь уже абсолютный Windows-путь (C:\\... или C:/...) — возвращаем как есть
            if (/^[a-zA-Z]:[\\\\\\/]/.test(xmlPath)) {
                return xmlPath;
            }

            // Убираем ведущие '/', './', '.\\' — всё это означает "от корня workspace"
            const normalized = xmlPath.replace(/^[\\\\\\/]+/, '').replace(/^\\.[\\\\\\/]/, '');

            // Склеиваем workspace root и нормализованный путь, используя '/' для отображения
            const cleanRoot = WORKSPACE_ROOT.replace(/[\\\\\\/]+$/, '');
            return cleanRoot + '/' + normalized;
        }

        function renderFileList() {
            fileList.innerHTML = '';
            fileCount.textContent = parsedFiles.length;

            parsedFiles.forEach((file, idx) => {
                const item = document.createElement('div');
                item.className = 'file-item';

                const input = document.createElement('input');
                input.type = 'text';
                input.dataset.index = idx;
                // Показываем АБСОЛЮТНЫЙ путь от корня ФС, чтобы пользователь мог провалидировать
                input.value = resolveToAbsolute(file.path);
                input.title = 'Absolute filesystem path (editable). Will be used as-is when applying.';

                const removeBtn = document.createElement('button');
                removeBtn.className = 'remove-btn';
                removeBtn.textContent = '✕';
                removeBtn.title = 'Remove this file from apply list';
                removeBtn.addEventListener('click', () => {
                    parsedFiles.splice(idx, 1);
                    renderFileList();
                });

                item.appendChild(input);
                item.appendChild(removeBtn);
                fileList.appendChild(item);
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'acceptSuccess') {
                acceptBtn.disabled = false;
                parseBtn.disabled = false;
                status.textContent = 'Files updated successfully! (' + (message.count || 0) + ' files)';
                xmlText.value = '';
                xmlText.disabled = false;
                xmlFile.disabled = false;
                xmlFile.value = '';
                parsedFiles = [];
                fileListSection.classList.add('hidden');
                fileList.innerHTML = '';
            } else if (message.type === 'acceptError') {
                acceptBtn.disabled = false;
                parseBtn.disabled = false;
                status.textContent = 'Error: ' + message.error;
            }
        });
    </script>
</body>
</html>`;
    }
}
import * as vscode from 'vscode';
import * as path from 'path';
import { getFigmaFileJson, getFigmaImages } from './figmaGetLib';
import { optimizeFigmaJsonToJsonPath } from './figmaOptimization';

interface FigmaLink {
    id: string;
    url: string;
    name: string;
    createdAt: number;
}

export class FigmaViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'figmaView';
    private _view?: vscode.WebviewView;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'savePat':
                    await this.context.secrets.store('figmaPat', data.pat);
                    vscode.window.showInformationMessage('✅ Figma PAT saved!');
                    this._view?.webview.postMessage({ type: 'patSaved' });
                    break;

                case 'getPat':
                    const pat = await this.context.secrets.get('figmaPat');
                    this._view?.webview.postMessage({ type: 'patLoaded', pat: pat || '', hasPat: !!pat });
                    break;

                case 'addLink':
                    const links = await this._getLinks();
                    const newLink: FigmaLink = {
                        id: Date.now().toString(),
                        url: data.url,
                        name: data.name || `Figma Layout ${links.length + 1}`,
                        createdAt: Date.now()
                    };
                    links.push(newLink);
                    await this.context.globalState.update('figmaLinks', links);
                    this._updateLinks();
                    break;

                case 'removeLink':
                    const currentLinks = await this._getLinks();
                    const filteredLinks = currentLinks.filter(l => l.id !== data.id);
                    await this.context.globalState.update('figmaLinks', filteredLinks);
                    const selectedId = this.context.globalState.get<string>('selectedFigmaLink');
                    if (selectedId === data.id) {
                        await this.context.globalState.update('selectedFigmaLink', undefined);
                    }
                    this._updateLinks();
                    break;

                case 'selectLink':
                    await this.context.globalState.update('selectedFigmaLink', data.id);
                    this._updateLinks();
                    break;

                case 'getLinks':
                    this._updateLinks();
                    break;

                case 'selectFolder':
                    const folderUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: 'Select Folder',
                        canSelectFiles: false,
                        canSelectFolders: true
                    });
                    if (folderUri && folderUri.length > 0) {
                        this._view?.webview.postMessage({ 
                            type: 'folderSelected', 
                            folder: folderUri[0].fsPath 
                        });
                    }
                    break;

                case 'download':
                    await this._downloadLayout(data.folder);
                    break;

                case 'optimizeLayout':
                    await this._optimizeLayout(data.folder);
                    break;
            }
        });

        // Send initial data
        this._updateLinks();
    }

    private async _getLinks(): Promise<FigmaLink[]> {
        return this.context.globalState.get<FigmaLink[]>('figmaLinks', []);
    }

    private async _updateLinks() {
        if (this._view) {
            const links = await this._getLinks();
            const selectedId = this.context.globalState.get<string>('selectedFigmaLink');
            this._view.webview.postMessage({ 
                type: 'updateLinks', 
                links, 
                selectedId 
            });
        }
    }

    private async _downloadLayout(folderPath: string) {
        const pat = await this.context.secrets.get('figmaPat');
        const selectedId = this.context.globalState.get<string>('selectedFigmaLink');
        const links = await this._getLinks();
        const selectedLink = links.find(l => l.id === selectedId);

        if (!pat) {
            vscode.window.showErrorMessage('❌ Figma PAT is not set!');
            return;
        }

        if (!selectedLink) {
            vscode.window.showErrorMessage('❌ No Figma link selected!');
            return;
        }

        if (!folderPath) {
            vscode.window.showErrorMessage('❌ No folder selected!');
            return;
        }

        try {
            this._view?.webview.postMessage({ type: 'downloadStatus', text: 'Starting download...' });

            // Extract file key from URL
            const fileKey = this._extractFileKey(selectedLink.url);
            if (!fileKey) {
                throw new Error('Invalid Figma URL');
            }

            // Step 1: Download full JSON
            this._view?.webview.postMessage({ type: 'downloadStatus', text: 'Downloading layout JSON...' });
            const jsonPath = path.join(folderPath, 'figma_layout.json');
            await getFigmaFileJson(fileKey, pat, jsonPath, { geometry: true, pluginData: true });
            this._view?.webview.postMessage({ type: 'downloadStatus', text: '✓ Layout JSON downloaded' });

            // Step 2: Extract node IDs from JSON for images
            this._view?.webview.postMessage({ type: 'downloadStatus', text: 'Extracting image nodes...' });
            const fs = await import('fs/promises');
            const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
            const nodeIds = this._extractImageNodes(jsonData);
            
            if (nodeIds.length === 0) {
                this._view?.webview.postMessage({ type: 'downloadStatus', text: '⚠ No image nodes found' });
            } else {
                this._view?.webview.postMessage({ 
                    type: 'downloadStatus', 
                    text: `Found ${nodeIds.length} image nodes` 
                });

                // Step 3: Download images with progress tracking
                this._view?.webview.postMessage({ type: 'downloadStatus', text: 'Downloading images...' });
                const imagesDir = path.join(folderPath, 'images');
                const savedImages = await getFigmaImages(
                    fileKey, 
                    pat, 
                    nodeIds, 
                    imagesDir,
                    { format: 'png', scale: 2 },
                    (batchIndex, totalBatches, downloadedCount, totalCount) => {
                        this._view?.webview.postMessage({ 
                            type: 'downloadProgress', 
                            batchIndex, 
                            totalBatches, 
                            downloadedCount, 
                            totalCount 
                        });
                    }
                );
                this._view?.webview.postMessage({ 
                    type: 'downloadStatus', 
                    text: `✓ Downloaded ${savedImages.length} images` 
                });
            }

            this._view?.webview.postMessage({ type: 'downloadComplete' });
            vscode.window.showInformationMessage('✅ Figma layout downloaded successfully!');

        } catch (error: any) {
            const errorMessage = error.message || 'Unknown error';
            this._view?.webview.postMessage({ type: 'downloadError', error: errorMessage });
            vscode.window.showErrorMessage(`❌ Download failed: ${errorMessage}`);
        }
    }

    private async _optimizeLayout(folderPath: string) {
        if (!folderPath) {
            vscode.window.showErrorMessage('❌ No folder selected!');
            return;
        }

        const fs = await import('fs/promises');
        const jsonPath = path.join(folderPath, 'figma_layout.json');
        const outputPath = path.join(folderPath, 'figma_layout.md');

        try {
            // Check if JSON file exists
            try {
                await fs.access(jsonPath);
            } catch {
                vscode.window.showErrorMessage('❌ figma_layout.json not found in selected folder!');
                return;
            }

            this._view?.webview.postMessage({ type: 'optimizeStatus', text: '🔧 Starting optimization...' });

            const result = await optimizeFigmaJsonToJsonPath(jsonPath, outputPath);

            if (result.success) {
                this._view?.webview.postMessage({ 
                    type: 'optimizeStatus', 
                    text: `✓ Optimization complete!` 
                });
                if (result.stats) {
                    this._view?.webview.postMessage({ 
                        type: 'optimizeStatus', 
                        text: `  Original: ${result.stats.originalSize}` 
                    });
                    this._view?.webview.postMessage({ 
                        type: 'optimizeStatus', 
                        text: `  Optimized: ${result.stats.optimizedSize}` 
                    });
                    this._view?.webview.postMessage({ 
                        type: 'optimizeStatus', 
                        text: `  Compression: ${result.stats.compressionRatio}` 
                    });
                }
                this._view?.webview.postMessage({ type: 'optimizeComplete' });
                vscode.window.showInformationMessage('✅ Layout optimized successfully!');
            } else {
                this._view?.webview.postMessage({ 
                    type: 'optimizeStatus', 
                    text: `❌ ${result.message}` 
                });
                vscode.window.showErrorMessage(`❌ Optimization failed: ${result.message}`);
            }

        } catch (error: any) {
            const errorMessage = error.message || 'Unknown error';
            this._view?.webview.postMessage({ type: 'optimizeError', error: errorMessage });
            vscode.window.showErrorMessage(`❌ Optimization failed: ${errorMessage}`);
        }
    }

    private _extractFileKey(url: string): string | null {
        const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    private _extractImageNodes(data: any): string[] {
        const nodeIds: string[] = [];
        
        const traverse = (node: any) => {
            if (!node) return;
            
            // Check if node has image fills
            if (node.fills) {
                for (const fill of node.fills) {
                    if (fill.type === 'IMAGE' && fill.imageRef) {
                        nodeIds.push(node.id);
                    }
                }
            }
            
            // Check if node is a vector or has specific properties for export
            if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') {
                nodeIds.push(node.id);
            }
            
            // Recursively traverse children
            if (node.children) {
                for (const child of node.children) {
                    traverse(child);
                }
            }
        };

        if (data.document) {
            traverse(data.document);
        }

        return [...new Set(nodeIds)]; // Remove duplicates
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Figma Layout Downloader</title>
    <style>

        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        
        .section {
            margin-bottom: 24px;
            padding: 16px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
        }
        
        h3 {
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 500;
        }
        
        .div-hint {
            font-size: 0.75em;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
        }
        
        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 8px;
            margin-bottom: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            box-sizing: border-box;
        }
        
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 8px;
            margin-bottom: 8px;
        }
        
        button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }
        
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        
        .links-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 12px;
        }
        
        .link-card {
            padding: 12px;
            background: var(--vscode-editor-background);
            border: 2px solid transparent;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
            width: 90%;
        }
        
        .link-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .link-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-button-background)20;
        }
        
        .link-card-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .link-info {
            flex: 1;
            overflow: hidden;
            margin-right: 8px;
        }
        
        .link-name {
            font-weight: 600;
            margin-bottom: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .link-url {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .link-actions {
            display: flex;
            gap: 4px;
        }
        
        .link-actions button {
            padding: 4px 8px;
            font-size: 0.85em;
            margin: 0;
        }
        
        .status {
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            margin-top: 12px;
            font-family: monospace;
            white-space: pre-wrap;
            max-height: 200px;
            overflow-y: auto;
        }
        
        .folder-display {
            padding: 8px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            margin-top: 8px;
            word-break: break-all;
            font-size: 0.9em;
        }
        
        .progress-bar {
            width: 100%;
            height: 20px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            overflow: hidden;
            margin-top: 8px;
        }
        
        .progress-fill {
            height: 100%;
            background: var(--vscode-button-background);
            transition: width 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-button-foreground);
            font-size: 0.85em;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="section">
        <h3>🔑 Figma Personal Access Token</h3>
        <label for="patInput">Enter your Figma PAT(Help and account -> Account settings -> Security):</label>
        <input type="password" id="patInput" placeholder="figd_...">
        <button id="savePatBtn" onclick="savePat()">Save Token</button>
    </div>

    <div class="section">
        <h3>🔗 Figma Layout Links</h3>
        <label for="linkUrlInput">Add new link:</label>
        <input type="text" id="linkUrlInput" placeholder="https://www.figma.com/file/...">
        <input type="text" id="linkNameInput" placeholder="Link name (optional)">
        <button onclick="addLink()">Add Link</button>
        
        <div class="links-container" id="linksContainer"></div>
        <div class="div-hint">Using small buffers for screens is strongly recomended. Figma jsons are large</div>
    </div>

    <div class="section">
        <h3>📁 Download Location</h3>
        <label>Select folder to save layout:</label>
        <button onclick="selectFolder()">Choose Folder</button>
        <div class="folder-display" id="folderDisplay">No folder selected</div>
    </div>

    <div class="section">
        <h3>Download</h3>
        <button id="downloadBtn" onclick="download()" disabled>Download Layout</button>
        <button id="optimizeBtn" onclick="optimizeLayout()" class="secondary" disabled>Optimize Layout</button>
        <div class="status" id="statusDisplay"></div>
        <div class="progress-bar" id="progressBar" style="display: none;">
            <div class="progress-fill" id="progressFill" style="width: 0%;">0%</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentLinks = [];
        let selectedId = null;
        let selectedFolder = '';
        let patSaved = false;

        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'patLoaded':
                    document.getElementById('patInput').value = message.pat;
                    patSaved = message.hasPat;
                    updatePatButton();
                    updateDownloadButtonState();
                    break;
                    
                case 'patSaved':
                    patSaved = true;
                    updatePatButton();
                    updateDownloadButtonState();
                    break;
                    
                case 'updateLinks':
                    currentLinks = message.links;
                    selectedId = message.selectedId;
                    renderLinks();
                    updateDownloadButtonState();
                    break;
                    
                case 'folderSelected':
                    selectedFolder = message.folder;
                    document.getElementById('folderDisplay').textContent = selectedFolder;
                    updateDownloadButtonState();
                    break;
                    
                case 'downloadStatus':
                    const statusDiv = document.getElementById('statusDisplay');
                    statusDiv.textContent += message.text + '\\n';
                    statusDiv.scrollTop = statusDiv.scrollHeight;
                    break;
                    
                case 'downloadProgress':
                    const progressBar = document.getElementById('progressBar');
                    const progressFill = document.getElementById('progressFill');
                    progressBar.style.display = 'block';
                    
                    const percentage = Math.round((message.batchIndex / message.totalBatches) * 100);
                    progressFill.style.width = percentage + '%';
                    progressFill.textContent = \`\${message.batchIndex}/\${message.totalBatches} batches (\${message.downloadedCount}/\${message.totalCount} images)\`;
                    break;
                    
                case 'downloadComplete':
                    document.getElementById('statusDisplay').textContent += '\\n✅ Download complete!';
                    document.getElementById('progressBar').style.display = 'none';
                    break;
                    
                case 'downloadError':
                    document.getElementById('statusDisplay').textContent += '\\n❌ Error: ' + message.error;
                    document.getElementById('progressBar').style.display = 'none';
                    break;

                case 'optimizeStatus':
                    const optStatusDiv = document.getElementById('statusDisplay');
                    optStatusDiv.textContent += message.text + '\\n';
                    optStatusDiv.scrollTop = optStatusDiv.scrollHeight;
                    break;

                case 'optimizeComplete':
                    document.getElementById('statusDisplay').textContent += '\\n✅ Optimization complete!';
                    break;

                case 'optimizeError':
                    document.getElementById('statusDisplay').textContent += '\\n❌ Optimization Error: ' + message.error;
                    break;
            }
        });

        function updatePatButton() {
            const btn = document.getElementById('savePatBtn');
            btn.textContent = patSaved ? 'Change Token' : 'Save Token';
        }

        function updateDownloadButtonState() {
            const downloadBtn = document.getElementById('downloadBtn');
            const optimizeBtn = document.getElementById('optimizeBtn');
            const canDownload = patSaved && selectedId && selectedFolder;
            const canOptimize = !!selectedFolder;
            downloadBtn.disabled = !canDownload;
            optimizeBtn.disabled = !canOptimize;
        }

        function savePat() {
            const pat = document.getElementById('patInput').value;
            vscode.postMessage({ type: 'savePat', pat });
        }

        function addLink() {
            const url = document.getElementById('linkUrlInput').value;
            const name = document.getElementById('linkNameInput').value;
            
            if (!url) {
                alert('Please enter a Figma URL');
                return;
            }
            
            vscode.postMessage({ type: 'addLink', url, name });
            document.getElementById('linkUrlInput').value = '';
            document.getElementById('linkNameInput').value = '';
        }

        function removeLink(id, event) {
            event.stopPropagation();
            if (confirm('Are you sure you want to remove this link?')) {
                vscode.postMessage({ type: 'removeLink', id });
            }
        }

        function selectLink(id) {
            vscode.postMessage({ type: 'selectLink', id });
        }

        function selectFolder() {
            vscode.postMessage({ type: 'selectFolder' });
        }

        function download() {
            if (!selectedFolder) {
                alert('Please select a folder first');
                return;
            }
            
            if (!selectedId) {
                alert('Please select a Figma link first');
                return;
            }
            
            document.getElementById('statusDisplay').textContent = '';
            document.getElementById('progressBar').style.display = 'none';
            vscode.postMessage({ type: 'download', folder: selectedFolder });
        }

        function optimizeLayout() {
            if (!selectedFolder) {
                alert('Please select a folder first');
                return;
            }
            
            document.getElementById('statusDisplay').textContent = '';
            vscode.postMessage({ type: 'optimizeLayout', folder: selectedFolder });
        }

        function renderLinks() {
            const container = document.getElementById('linksContainer');
            container.innerHTML = '';
            
            currentLinks.forEach(link => {
                const card = document.createElement('div');
                card.className = 'link-card';
                if (link.id === selectedId) {
                    card.classList.add('selected');
                }
                
                card.innerHTML = \`
                    <div class="link-card-content">
                        <div class="link-info">
                            <div class="link-name">\${escapeHtml(link.name)}</div>
                            <div class="link-url">\${escapeHtml(link.url)}</div>
                        </div>
                        <div class="link-actions">
                            <button onclick="removeLink('\${link.id}', event)">Remove</button>
                        </div>
                    </div>
                \`;
                
                card.onclick = () => {
                    selectLink(link.id);
                };
                
                container.appendChild(card);
            });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Request initial data
        vscode.postMessage({ type: 'getPat' });
        vscode.postMessage({ type: 'getLinks' });
    </script>
</body>
</html>`;
    }
}
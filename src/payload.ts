import * as vscode from 'vscode';
import { parseWithRegex } from './plTools';

interface SymbolNode {
    id: string;
    name: string;
    detail?: string;
    kind: vscode.SymbolKind;
    kindName: string;
    range: vscode.Range;
    selectionRange: vscode.Range;
    children: SymbolNode[];
}

export interface FileInfo {
    name: string;
    uri: string;
    symbols: SymbolNode[];
    states: Record<string, boolean>;
}

export interface TreeSettings {
    includeTree: boolean;
    useGitignore: boolean;
    customIgnore: string;
}

export interface CompileOptions {
    includeTree?: boolean;
    useGitignore?: boolean;
    customIgnore?: string;
    getProjectTree: (options: { useGitignore?: boolean; customIgnore?: string }) => Promise<string>;
}

interface PersistedPayloadState {
    userText?: string;
    files?: string[];
    symbolStates?: Record<string, Record<string, boolean>>;
    treeSettings?: TreeSettings;
}

function rangeToId(range: vscode.Range): string {
    return `${range.start.line}-${range.start.character}-${range.end.line}-${range.end.character}`;
}

function getSymbolKindName(kind: vscode.SymbolKind): string {
    switch (kind) {
        case vscode.SymbolKind.File: return 'Файл';
        case vscode.SymbolKind.Module: return 'Модуль';
        case vscode.SymbolKind.Namespace: return 'Пространство имен';
        case vscode.SymbolKind.Package: return 'Пакет';
        case vscode.SymbolKind.Class: return 'Класс';
        case vscode.SymbolKind.Method: return 'Метод';
        case vscode.SymbolKind.Property: return 'Свойство';
        case vscode.SymbolKind.Field: return 'Поле';
        case vscode.SymbolKind.Constructor: return 'Конструктор';
        case vscode.SymbolKind.Enum: return 'Перечисление';
        case vscode.SymbolKind.Interface: return 'Интерфейс';
        case vscode.SymbolKind.Function: return 'Функция';
        case vscode.SymbolKind.Variable: return 'Переменная';
        case vscode.SymbolKind.Constant: return 'Константа';
        case vscode.SymbolKind.String: return 'Строка';
        case vscode.SymbolKind.Number: return 'Число';
        case vscode.SymbolKind.Boolean: return 'Булево';
        case vscode.SymbolKind.Array: return 'Массив';
        case vscode.SymbolKind.Object: return 'Объект';
        case vscode.SymbolKind.Key: return 'Ключ';
        case vscode.SymbolKind.Null: return 'Null';
        case vscode.SymbolKind.EnumMember: return 'Элемент перечисления';
        case vscode.SymbolKind.Struct: return 'Структура';
        case vscode.SymbolKind.Event: return 'Событие';
        case vscode.SymbolKind.Operator: return 'Оператор';
        case vscode.SymbolKind.TypeParameter: return 'Параметр типа';
        default: return 'Элемент';
    }
}

function convertDocumentSymbol(symbol: vscode.DocumentSymbol): SymbolNode {
    return {
        id: rangeToId(symbol.range),
        name: symbol.name,
        detail: symbol.detail,
        kind: symbol.kind,
        kindName: getSymbolKindName(symbol.kind),
        range: symbol.range,
        selectionRange: symbol.selectionRange,
        children: symbol.children.map(convertDocumentSymbol)
    };
}

function convertSymbolInformation(symbol: vscode.SymbolInformation): SymbolNode {
    return {
        id: rangeToId(symbol.location.range),
        name: symbol.name,
        detail: symbol.containerName,
        kind: symbol.kind,
        kindName: getSymbolKindName(symbol.kind),
        range: symbol.location.range,
        selectionRange: symbol.location.range,
        children: []
    };
}

function filterSymbols(symbols: SymbolNode[]): SymbolNode[] {
    return symbols
        .filter(s => s.kind !== vscode.SymbolKind.Variable)
        .map(s => ({
            ...s,
            children: filterSymbols(s.children)
        }));
}

/**
 * Конвертирует folding ranges в иерархию SymbolNode.
 * Folding ranges обычно соответствуют блокам кода (функции, классы, etc.)
 */
function buildSymbolsFromFoldingRanges(
    ranges: vscode.FoldingRange[],
    doc: vscode.TextDocument
): SymbolNode[] {
    if (!ranges || ranges.length === 0) return [];

    // Сортируем по началу, затем по длине (длинные первыми — это родители)
    const sorted = [...ranges].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return (b.end - b.start) - (a.end - a.start);
    });

    interface FlatNode {
        node: SymbolNode;
        start: number;
        end: number;
    }

    const flatNodes: FlatNode[] = sorted.map(r => {
        const startLine = r.start;
        const endLine = r.end;
        const firstLineText = doc.lineAt(startLine).text;
        const trimmed = firstLineText.trim();
        const name = trimmed.length > 60 ? trimmed.substring(0, 60) + '…' : (trimmed || `Блок ${startLine + 1}`);
        const endLineText = doc.lineAt(endLine).text;
        const fullRange = new vscode.Range(startLine, 0, endLine, endLineText.length);
        const selectionRange = new vscode.Range(startLine, 0, startLine, firstLineText.length);

        return {
            node: {
                id: rangeToId(fullRange),
                name,
                kind: vscode.SymbolKind.Namespace,
                kindName: 'Блок',
                range: fullRange,
                selectionRange,
                children: []
            },
            start: startLine,
            end: endLine
        };
    });

    // Строим иерархию: если range полностью внутри другого — становится ребёнком
    const roots: SymbolNode[] = [];
    const stack: FlatNode[] = [];

    for (const current of flatNodes) {
        // Выталкиваем из стека все узлы, которые не являются родителями текущего
        while (stack.length > 0) {
            const top = stack[stack.length - 1];
            if (top.start <= current.start && top.end >= current.end && !(top.start === current.start && top.end === current.end)) {
                break;
            }
            stack.pop();
        }

        if (stack.length === 0) {
            roots.push(current.node);
        } else {
            stack[stack.length - 1].node.children.push(current.node);
        }
        stack.push(current);
    }

    return roots;
}

export class PayloadManager {
    private static readonly PAYLOAD_KEY = 'promptBuilder.payload';

    private selectedFiles: Map<string, vscode.Uri> = new Map();
    private symbolTree: Map<string, SymbolNode[]> = new Map();
    private symbolStates: Map<string, Map<string, boolean>> = new Map();

    private saveFilesTimeout: ReturnType<typeof setTimeout> | null = null;
    private saveUserTextTimeout: ReturnType<typeof setTimeout> | null = null;
    private saveTreeSettingsTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(private context: vscode.ExtensionContext) {}

    async loadState(): Promise<void> {
        const state = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY);
        if (!state) return;

        if (state.files && state.files.length > 0) {
            for (const uriStr of state.files) {
                try {
                    const uri = vscode.Uri.parse(uriStr);
                    this.selectedFiles.set(uriStr, uri);
                    await this._loadSymbolsForFile(uri);
                } catch (e) {
                    console.error(`[PayloadManager] Не удалось загрузить файл ${uriStr}:`, e);
                }
            }
        }

        if (state.symbolStates) {
            for (const [uriStr, savedStates] of Object.entries(state.symbolStates)) {
                const currentStates = this.symbolStates.get(uriStr);
                if (!currentStates) continue;
                for (const [symbolId, enabled] of Object.entries(savedStates)) {
                    currentStates.set(symbolId, enabled);
                }
            }
        }
    }

    async getUserText(): Promise<string> {
        const state = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY);
        return state?.userText || '';
    }

    async getTreeSettings(): Promise<TreeSettings> {
        const state = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY);
        return state?.treeSettings || { includeTree: false, useGitignore: false, customIgnore: '' };
    }

    async saveUserText(text: string): Promise<void> {
        if (this.saveUserTextTimeout) {
            clearTimeout(this.saveUserTextTimeout);
        }

        this.saveUserTextTimeout = setTimeout(async () => {
            try {
                const current = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY) || {};
                await this.context.workspaceState.update(PayloadManager.PAYLOAD_KEY, {
                    ...current,
                    userText: text
                });
            } catch (e) {
                console.error('[PayloadManager] Ошибка сохранения userText:', e);
            }
        }, 400);
    }

    async saveTreeSettings(settings: TreeSettings): Promise<void> {
        if (this.saveTreeSettingsTimeout) {
            clearTimeout(this.saveTreeSettingsTimeout);
        }

        this.saveTreeSettingsTimeout = setTimeout(async () => {
            try {
                const current = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY) || {};
                await this.context.workspaceState.update(PayloadManager.PAYLOAD_KEY, {
                    ...current,
                    treeSettings: settings
                });
            } catch (e) {
                console.error('[PayloadManager] Ошибка сохранения treeSettings:', e);
            }
        }, 400);
    }

    /**
     * Принудительное сохранение всех данных без debounce.
     * Вызывается при уничтожении webview (закрытие вкладки/VS Code).
     */
    async flushSave(): Promise<void> {
        if (this.saveFilesTimeout) {
            clearTimeout(this.saveFilesTimeout);
            this.saveFilesTimeout = null;
        }
        if (this.saveUserTextTimeout) {
            clearTimeout(this.saveUserTextTimeout);
            this.saveUserTextTimeout = null;
        }
        if (this.saveTreeSettingsTimeout) {
            clearTimeout(this.saveTreeSettingsTimeout);
            this.saveTreeSettingsTimeout = null;
        }

        try {
            const files = Array.from(this.selectedFiles.keys());
            const symbolStates: Record<string, Record<string, boolean>> = {};

            for (const [uriStr, states] of this.symbolStates) {
                const obj: Record<string, boolean> = {};
                states.forEach((val, key) => obj[key] = val);
                symbolStates[uriStr] = obj;
            }

            const current = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY) || {};
            await this.context.workspaceState.update(PayloadManager.PAYLOAD_KEY, {
                ...current,
                files,
                symbolStates
            });
        } catch (e) {
            console.error('[PayloadManager] Ошибка flushSave:', e);
        }
    }

    private _scheduleFilesSave(): void {
        if (this.saveFilesTimeout) {
            clearTimeout(this.saveFilesTimeout);
        }

        this.saveFilesTimeout = setTimeout(async () => {
            try {
                const files = Array.from(this.selectedFiles.keys());
                const symbolStates: Record<string, Record<string, boolean>> = {};

                for (const [uriStr, states] of this.symbolStates) {
                    const obj: Record<string, boolean> = {};
                    states.forEach((val, key) => obj[key] = val);
                    symbolStates[uriStr] = obj;
                }

                const current = this.context.workspaceState.get<PersistedPayloadState>(PayloadManager.PAYLOAD_KEY) || {};
                await this.context.workspaceState.update(PayloadManager.PAYLOAD_KEY, {
                    ...current,
                    files,
                    symbolStates
                });
            } catch (e) {
                console.error('[PayloadManager] Ошибка сохранения состояния файлов:', e);
            }
        }, 400);
    }

    async addFiles(uris: vscode.Uri[]): Promise<void> {
        for (const uri of uris) {
            const uriStr = uri.toString();
            this.selectedFiles.set(uriStr, uri);
            this.symbolTree.delete(uriStr);
            this.symbolStates.delete(uriStr);
            await this._loadSymbolsForFile(uri);
        }
        this._scheduleFilesSave();
    }

    async removeFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        this.selectedFiles.delete(uriStr);
        this.symbolTree.delete(uriStr);
        this.symbolStates.delete(uriStr);
        this._scheduleFilesSave();
    }

    async toggleSymbol(uri: vscode.Uri, symbolId: string): Promise<void> {
        const uriStr = uri.toString();
        const states = this.symbolStates.get(uriStr);
        const tree = this.symbolTree.get(uriStr);
        if (!states || !tree) return;

        const currentState = states.get(symbolId);
        if (currentState === undefined) return;

        const newState = !currentState;
        states.set(symbolId, newState);

        const updateChildren = (nodes: SymbolNode[], parentId: string, enabled: boolean): boolean => {
            for (const node of nodes) {
                if (node.id === parentId) {
                    const setChildren = (children: SymbolNode[]) => {
                        for (const child of children) {
                            states.set(child.id, enabled);
                            setChildren(child.children);
                        }
                    };
                    setChildren(node.children);
                    return true;
                }
                if (updateChildren(node.children, parentId, enabled)) return true;
            }
            return false;
        };

        const updateParents = (nodes: SymbolNode[], childId: string, enabled: boolean, parents: string[] = []): boolean => {
            for (const node of nodes) {
                if (node.id === childId) {
                    if (enabled) {
                        for (const pid of parents) {
                            states.set(pid, true);
                        }
                    }
                    return true;
                }
                if (updateParents(node.children, childId, enabled, [...parents, node.id])) return true;
            }
            return false;
        };

        if (newState === false) {
            updateChildren(tree, symbolId, false);
        } else {
            updateParents(tree, symbolId, true);
        }

        this._scheduleFilesSave();
    }

    async getFilesInfo(): Promise<FileInfo[]> {
        const result: FileInfo[] = [];
        for (const [uriStr, uri] of this.selectedFiles) {
            const name = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
            const symbols = this.symbolTree.get(uriStr) || [];
            const states = this.symbolStates.get(uriStr) || new Map();
            
            const statesObj: Record<string, boolean> = {};
            states.forEach((val, key) => statesObj[key] = val);

            result.push({ name, uri: uriStr, symbols, states: statesObj });
        }
        return result;
    }

    /**
     * Загружает символы файла с трёхуровневым fallback:
     * 1. Document Symbol Provider (LSP) с retry
     * 2. Folding Range Provider (работает почти для всех языков)
     * 3. Regex-парсинг для основных языков
     * 4. "Entire File" как последний fallback
     */
    private async _loadSymbolsForFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        let convertedSymbols: SymbolNode[] = [];

        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length)
            );

            // === Уровень 1: Document Symbol Provider (LSP) ===
            let documentSymbols = await vscode.commands.executeCommand<
                (vscode.DocumentSymbol | vscode.SymbolInformation)[]
            >('vscode.executeDocumentSymbolProvider', uri);

            // Retry: LSP мог не успеть инициализироваться
            if (!documentSymbols || documentSymbols.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                documentSymbols = await vscode.commands.executeCommand<
                    (vscode.DocumentSymbol | vscode.SymbolInformation)[]
                >('vscode.executeDocumentSymbolProvider', uri);
            }

            if (documentSymbols && documentSymbols.length > 0) {
                for (const sym of documentSymbols) {
                    if ((sym as vscode.DocumentSymbol).children !== undefined) {
                        convertedSymbols.push(convertDocumentSymbol(sym as vscode.DocumentSymbol));
                    } else {
                        convertedSymbols.push(convertSymbolInformation(sym as vscode.SymbolInformation));
                    }
                }
                console.log(`[PayloadManager] LSP symbols loaded for ${uriStr}: ${convertedSymbols.length} top-level`);
            }

            // === Уровень 2: Folding Range Provider ===
            /* работает плохо хрен с ним
            if (convertedSymbols.length === 0) {
                try {
                    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
                        'vscode.executeFoldingRangeProvider',
                        uri
                    );
                    if (foldingRanges && foldingRanges.length > 0) {
                        convertedSymbols = buildSymbolsFromFoldingRanges(foldingRanges, doc);
                        console.log(`[PayloadManager] Folding ranges used for ${uriStr}: ${convertedSymbols.length} top-level`);
                    }
                } catch (e) {
                    console.warn(`[PayloadManager] Folding ranges failed for ${uriStr}:`, e);
                }
            }*/

            // === Уровень 3: Regex-парсинг ===
            if (convertedSymbols.length === 0) {
                const regexResults = parseWithRegex(doc.getText(), doc.languageId);
                if (regexResults.length > 0) {
                    convertedSymbols = regexResults.map(r => ({
                        id: rangeToId(r.range),
                        name: r.name,
                        kind: r.kind,
                        kindName: getSymbolKindName(r.kind),
                        range: r.range,
                        selectionRange: r.range,
                        children: []
                    }));
                    console.log(`[PayloadManager] Regex parsing used for ${uriStr} (${doc.languageId}): ${convertedSymbols.length} symbols`);
                }
            }

            // === Уровень 4: Entire File ===
            if (convertedSymbols.length === 0) {
                convertedSymbols = [{
                    id: rangeToId(fullRange),
                    name: "Entire File",
                    kind: vscode.SymbolKind.File,
                    kindName: getSymbolKindName(vscode.SymbolKind.File),
                    range: fullRange,
                    selectionRange: fullRange,
                    children: []
                }];
                console.log(`[PayloadManager] Fallback to "Entire File" for ${uriStr}`);
            }

            convertedSymbols = filterSymbols(convertedSymbols);
            this.symbolTree.set(uriStr, convertedSymbols);
            
            const states = new Map<string, boolean>();
            const initStates = (nodes: SymbolNode[]) => {
                for (const node of nodes) {
                    states.set(node.id, true);
                    initStates(node.children);
                }
            };
            initStates(convertedSymbols);
            this.symbolStates.set(uriStr, states);

        } catch (error) {
            console.error(`[PayloadManager] Failed to load symbols for ${uriStr}:`, error);
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length)
                );
                const rootSymbol: SymbolNode = {
                    id: rangeToId(fullRange),
                    name: "Entire File",
                    kind: vscode.SymbolKind.File,
                    kindName: getSymbolKindName(vscode.SymbolKind.File),
                    range: fullRange,
                    selectionRange: fullRange,
                    children: []
                };
                this.symbolTree.set(uriStr, [rootSymbol]);
                const states = new Map<string, boolean>();
                states.set(rootSymbol.id, true);
                this.symbolStates.set(uriStr, states);
            } catch (e) {
                console.error(`[PayloadManager] Critical error for ${uriStr}:`, e);
            }
        }
    }

    async compileFullPrompt(
        systemPrompt: string,
        projectPrompt: string,
        userText: string,
        options: CompileOptions
    ): Promise<string> {
        let finalPrompt = '';

        if (systemPrompt.trim()) finalPrompt += `# System prompt\n${systemPrompt.trim()}\n\n`;
        if (projectPrompt.trim()) finalPrompt += `# Project prompt\n${projectPrompt.trim()}\n\n`;

        if (options.includeTree) {
            const tree = await options.getProjectTree({
                useGitignore: options.useGitignore,
                customIgnore: options.customIgnore
            });
            if (tree.trim()) finalPrompt += `# Project structure\n\`\`\`\n${tree}\`\`\`\n\n`;
        }

        if (userText.trim()) finalPrompt += `# Task\n${userText.trim()}\n\n`;

        for (const [uriStr, uri] of this.selectedFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullContent = doc.getText();
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                const symbols = this.symbolTree.get(uriStr) || [];
                const states = this.symbolStates.get(uriStr) || new Map();

                const collectExclusionRanges = (nodes: SymbolNode[]): {start: number, end: number}[] => {
                    const ranges: {start: number, end: number}[] = [];
                    for (const node of nodes) {
                        const isEnabled = states.get(node.id) ?? true;
                        if (!isEnabled) {
                            ranges.push({
                                start: doc.offsetAt(node.range.start),
                                end: doc.offsetAt(node.range.end)
                            });
                        } else {
                            ranges.push(...collectExclusionRanges(node.children));
                        }
                    }
                    return ranges;
                };

                const exclusionRanges = collectExclusionRanges(symbols);
                exclusionRanges.sort((a, b) => a.start - b.start);

                let fileContent = '';
                let lastIndex = 0;
                for (const range of exclusionRanges) {
                    fileContent += fullContent.substring(lastIndex, range.start);
                    fileContent += '...';
                    lastIndex = range.end;
                }
                fileContent += fullContent.substring(lastIndex);
                if(exclusionRanges.length > 0) {
                    finalPrompt += `--- File(Part): ${fileName} ---\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
                } else {
                    finalPrompt += `--- File: ${fileName} ---\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
                }
            } catch (e) {
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                finalPrompt += `--- File: ${fileName} ---\n[Reading error: ${e}]\n\n`;
            }
        }

        return finalPrompt;
    }

    async getCompiledPromptLength(
        systemPrompt: string,
        projectPrompt: string,
        userText: string,
        options: CompileOptions
    ): Promise<number> {
        const prompt = await this.compileFullPrompt(systemPrompt, projectPrompt, userText, options);
        return prompt.length;
    }
}
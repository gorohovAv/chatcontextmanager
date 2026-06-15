import * as vscode from 'vscode';

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

export interface CompileOptions {
    includeTree?: boolean;
    useGitignore?: boolean;
    customIgnore?: string;
    getProjectTree: (options: { useGitignore?: boolean; customIgnore?: string }) => Promise<string>;
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

export class PayloadManager {
    private selectedFiles: Map<string, vscode.Uri> = new Map();
    private symbolTree: Map<string, SymbolNode[]> = new Map();
    private symbolStates: Map<string, Map<string, boolean>> = new Map();

    async addFiles(uris: vscode.Uri[]): Promise<void> {
        for (const uri of uris) {
            const uriStr = uri.toString();
            this.selectedFiles.set(uriStr, uri);
            this.symbolTree.delete(uriStr);
            this.symbolStates.delete(uriStr);
            await this._loadSymbolsForFile(uri);
        }
    }

    async removeFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        this.selectedFiles.delete(uriStr);
        this.symbolTree.delete(uriStr);
        this.symbolStates.delete(uriStr);
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

        // Рекурсивно обновляем детей, если галочку сняли
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

        // Рекурсивно обновляем родителей, если галочку поставили
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
    }

    async getFilesInfo(): Promise<FileInfo[]> {
        const result: FileInfo[] = [];
        for (const [uriStr, uri] of this.selectedFiles) {
            const name = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
            const symbols = this.symbolTree.get(uriStr) || [];
            const states = this.symbolStates.get(uriStr) || new Map();
            
            // Конвертируем Map в обычный объект для передачи в Webview
            const statesObj: Record<string, boolean> = {};
            states.forEach((val, key) => statesObj[key] = val);

            result.push({ name, uri: uriStr, symbols, states: statesObj });
        }
        return result;
    }

    private async _loadSymbolsForFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        try {
            const documentSymbols = await vscode.commands.executeCommand<
                (vscode.DocumentSymbol | vscode.SymbolInformation)[]
            >('vscode.executeDocumentSymbolProvider', uri);

            let convertedSymbols: SymbolNode[] = [];

            if (!documentSymbols || documentSymbols.length === 0) {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length)
                );
                convertedSymbols = [{
                    id: rangeToId(fullRange),
                    name: "Entire File",
                    kind: vscode.SymbolKind.File,
                    kindName: getSymbolKindName(vscode.SymbolKind.File),
                    range: fullRange,
                    selectionRange: fullRange,
                    children: []
                }];
            } else {
                for (const sym of documentSymbols) {
                    if ((sym as vscode.DocumentSymbol).children !== undefined) {
                        convertedSymbols.push(convertDocumentSymbol(sym as vscode.DocumentSymbol));
                    } else {
                        convertedSymbols.push(convertSymbolInformation(sym as vscode.SymbolInformation));
                    }
                }
            }

            this.symbolTree.set(uriStr, convertedSymbols);
            
            // Инициализируем все состояния как true (включено)
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
            console.error(`Failed to load symbols for ${uriStr}:`, error);
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
        }
    }

    async compileFullPrompt(
        systemPrompt: string,
        projectPrompt: string,
        userText: string,
        options: CompileOptions
    ): Promise<string> {
        let finalPrompt = '';

        if (systemPrompt.trim()) finalPrompt += `# Системный промпт\n${systemPrompt.trim()}\n\n`;
        if (projectPrompt.trim()) finalPrompt += `# Промпт проекта\n${projectPrompt.trim()}\n\n`;

        if (options.includeTree) {
            const tree = await options.getProjectTree({
                useGitignore: options.useGitignore,
                customIgnore: options.customIgnore
            });
            if (tree.trim()) finalPrompt += `# Структура проекта\n\`\`\`\n${tree}\`\`\`\n\n`;
        }

        if (userText.trim()) finalPrompt += `# Задача\n${userText.trim()}\n\n`;

        for (const [uriStr, uri] of this.selectedFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullContent = doc.getText();
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                const symbols = this.symbolTree.get(uriStr) || [];
                const states = this.symbolStates.get(uriStr) || new Map();

                // Собираем диапазоны, которые нужно исключить (заменить на пробелы)
                const collectExclusionRanges = (nodes: SymbolNode[]): {start: number, end: number}[] => {
                    const ranges: {start: number, end: number}[] = [];
                    for (const node of nodes) {
                        const isEnabled = states.get(node.id) ?? true;
                        if (!isEnabled) {
                            // Если узел выключен, исключаем весь его диапазон (включая детей)
                            ranges.push({
                                start: doc.offsetAt(node.range.start),
                                end: doc.offsetAt(node.range.end)
                            });
                        } else {
                            // Если узел включен, проверяем его детей
                            ranges.push(...collectExclusionRanges(node.children));
                        }
                    }
                    return ranges;
                };

                const exclusionRanges = collectExclusionRanges(symbols);
                exclusionRanges.sort((a, b) => a.start - b.start);

                // Строим итоговый контент, заменяя исключенные диапазоны на пробелы
                let fileContent = '';
                let lastIndex = 0;
                for (const range of exclusionRanges) {
                    fileContent += fullContent.substring(lastIndex, range.start);
                    const length = range.end - range.start;
                    fileContent += ' '.repeat(length); // Сохраняем длину и структуру строк
                    lastIndex = range.end;
                }
                fileContent += fullContent.substring(lastIndex);

                finalPrompt += `--- Файл: ${fileName} ---\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
            } catch (e) {
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                finalPrompt += `--- Файл: ${fileName} ---\n[Ошибка чтения файла: ${e}]\n\n`;
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
import * as vscode from 'vscode';

// Интерфейс для узла символа, полученного из LSP
interface SymbolNode {
    id: string;
    name: string;
    detail?: string;
    kind: vscode.SymbolKind;
    range: vscode.Range;
    selectionRange: vscode.Range;
    children: SymbolNode[];
    enabled: boolean; // Флаг для включения/исключения из финального промпта
}

// Информация о файле для передачи во вью
export interface FileInfo {
    name: string;
    uri: string;
    symbols: SymbolNode[];
}

// Опции для компиляции промпта
export interface CompileOptions {
    includeTree?: boolean;
    useGitignore?: boolean;
    customIgnore?: string;
    getProjectTree: (options: { useGitignore?: boolean; customIgnore?: string }) => Promise<string>;
}

// Утилита для генерации уникального ID на основе диапазона
function rangeToId(range: vscode.Range): string {
    return `${range.start.line}-${range.start.character}-${range.end.line}-${range.end.character}`;
}

// Рекурсивное преобразование DocumentSymbol в наш SymbolNode
function convertDocumentSymbol(symbol: vscode.DocumentSymbol, enabled: boolean = true): SymbolNode {
    return {
        id: rangeToId(symbol.range),
        name: symbol.name,
        detail: symbol.detail,
        kind: symbol.kind,
        range: symbol.range,
        selectionRange: symbol.selectionRange,
        enabled: enabled,
        children: symbol.children.map(child => convertDocumentSymbol(child, enabled))
    };
}

// Преобразование SymbolInformation в SymbolNode (без детей)
function convertSymbolInformation(symbol: vscode.SymbolInformation, enabled: boolean = true): SymbolNode {
    return {
        id: rangeToId(symbol.location.range),
        name: symbol.name,
        detail: symbol.containerName,
        kind: symbol.kind,
        range: symbol.location.range,
        selectionRange: symbol.location.range,
        enabled: enabled,
        children: []
    };
}

export class PayloadManager {
    private selectedFiles: Map<string, vscode.Uri> = new Map(); // uri.toString() -> Uri
    private fileSymbolCache: Map<string, SymbolNode[]> = new Map(); // uri.toString() -> SymbolNode[]
    private enabledSymbolsCache: Map<string, Set<string>> = new Map(); // uri.toString() -> Set<symbolId>

    // Добавление файлов
    async addFiles(uris: vscode.Uri[]): Promise<void> {
        for (const uri of uris) {
            const uriStr = uri.toString();
            this.selectedFiles.set(uriStr, uri);
            // Сбросим кэш для этого файла, чтобы перечитать символы
            this.fileSymbolCache.delete(uriStr);
            this.enabledSymbolsCache.delete(uriStr);
            // Загрузим символы
            await this._loadSymbolsForFile(uri);
        }
    }

    // Удаление файла
    async removeFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        this.selectedFiles.delete(uriStr);
        this.fileSymbolCache.delete(uriStr);
        this.enabledSymbolsCache.delete(uriStr);
    }

    // Переключение состояния символа
    async toggleSymbol(uri: vscode.Uri, symbolId: string): Promise<void> {
        const uriStr = uri.toString();
        if (!this.enabledSymbolsCache.has(uriStr)) {
            this.enabledSymbolsCache.set(uriStr, new Set());
        }
        const enabledSet = this.enabledSymbolsCache.get(uriStr)!;
        if (enabledSet.has(symbolId)) {
            enabledSet.delete(symbolId);
        } else {
            enabledSet.add(symbolId);
        }
    }

    // Получение информации о файлах для рендера во вью
    async getFilesInfo(): Promise<FileInfo[]> {
        const result: FileInfo[] = [];
        for (const [uriStr, uri] of this.selectedFiles) {
            const name = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
            const symbols = await this._getSymbolsForFile(uri);
            result.push({ name, uri: uriStr, symbols });
        }
        return result;
    }

    // Внутренний метод для загрузки и кэширования символов файла
    private async _loadSymbolsForFile(uri: vscode.Uri): Promise<void> {
        const uriStr = uri.toString();
        try {
            const documentSymbols = await vscode.commands.executeCommand<
                (vscode.DocumentSymbol | vscode.SymbolInformation)[]
            >('vscode.executeDocumentSymbolProvider', uri);

            if (!documentSymbols || documentSymbols.length === 0) {
                // Если LSP не предоставил символы, создадим один корневой символ для всего файла
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullRange = new vscode.Range(
                    doc.positionAt(0),
                    doc.positionAt(doc.getText().length)
                );
                const rootSymbol: SymbolNode = {
                    id: rangeToId(fullRange),
                    name: "Entire File",
                    kind: vscode.SymbolKind.File,
                    range: fullRange,
                    selectionRange: fullRange,
                    enabled: true,
                    children: []
                };
                this.fileSymbolCache.set(uriStr, [rootSymbol]);
                this.enabledSymbolsCache.set(uriStr, new Set([rootSymbol.id]));
                return;
            }

            // Преобразуем результат в единый формат SymbolNode[]
            const convertedSymbols: SymbolNode[] = [];
            for (const sym of documentSymbols) {
                if ((sym as vscode.DocumentSymbol).children !== undefined) {
                    convertedSymbols.push(convertDocumentSymbol(sym as vscode.DocumentSymbol, true));
                } else {
                    convertedSymbols.push(convertSymbolInformation(sym as vscode.SymbolInformation, true));
                }
            }

            this.fileSymbolCache.set(uriStr, convertedSymbols);
            // По умолчанию все символы включены
            const allIds = new Set<string>();
            const collectIds = (nodes: SymbolNode[]) => {
                for (const node of nodes) {
                    allIds.add(node.id);
                    collectIds(node.children);
                }
            };
            collectIds(convertedSymbols);
            this.enabledSymbolsCache.set(uriStr, allIds);

        } catch (error) {
            console.error(`Failed to load symbols for ${uriStr}:`, error);
            // В случае ошибки также создаем корневой символ
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length)
            );
            const rootSymbol: SymbolNode = {
                id: rangeToId(fullRange),
                name: "Entire File",
                kind: vscode.SymbolKind.File,
                range: fullRange,
                selectionRange: fullRange,
                enabled: true,
                children: []
            };
            this.fileSymbolCache.set(uriStr, [rootSymbol]);
            this.enabledSymbolsCache.set(uriStr, new Set([rootSymbol.id]));
        }
    }

    // Получение символов файла с актуальным статусом enabled
    private async _getSymbolsForFile(uri: vscode.Uri): Promise<SymbolNode[]> {
        const uriStr = uri.toString();
        const symbols = this.fileSymbolCache.get(uriStr) || [];
        const enabledSet = this.enabledSymbolsCache.get(uriStr) || new Set();

        const applyEnabledStatus = (nodes: SymbolNode[]): SymbolNode[] => {
            return nodes.map(node => {
                const isEnabled = enabledSet.has(node.id);
                return {
                    ...node,
                    enabled: isEnabled,
                    children: applyEnabledStatus(node.children)
                };
            });
        };

        return applyEnabledStatus(symbols);
    }

    // Компиляция полного промпта
    async compileFullPrompt(
        systemPrompt: string,
        projectPrompt: string,
        userText: string,
        options: CompileOptions
    ): Promise<string> {
        let finalPrompt = '';

        if (systemPrompt.trim()) {
            finalPrompt += `# Системный промпт\n${systemPrompt.trim()}\n\n`;
        }

        if (projectPrompt.trim()) {
            finalPrompt += `# Промпт проекта\n${projectPrompt.trim()}\n\n`;
        }

        if (options.includeTree) {
            const tree = await options.getProjectTree({
                useGitignore: options.useGitignore,
                customIgnore: options.customIgnore
            });
            if (tree.trim()) {
                finalPrompt += `# Структура проекта\n\`\`\`\n${tree}\`\`\`\n\n`;
            }
        }

        if (userText.trim()) {
            finalPrompt += `# Задача\n${userText.trim()}\n\n`;
        }

        // Обработка каждого выбранного файла
        for (const [uriStr, uri] of this.selectedFiles) {
            try {
                const doc = await vscode.workspace.openTextDocument(uri);
                const fullContent = doc.getText();
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                const enabledSet = this.enabledSymbolsCache.get(uriStr) || new Set();
                const symbols = this.fileSymbolCache.get(uriStr) || [];

                // Если нет символов или включен весь файл, добавляем его целиком
                if (symbols.length === 0 || (symbols.length === 1 && symbols[0].kind === vscode.SymbolKind.File && enabledSet.has(symbols[0].id))) {
                    finalPrompt += `--- Файл: ${fileName} ---\n\`\`\`\n${fullContent}\n\`\`\`\n\n`;
                } else {
                    // Создаем массив для частей контента
                    const parts: { start: number; end: number; include: boolean }[] = [];

                    // Рекурсивно собираем диапазоны включенных символов
                    const collectRanges = (nodes: SymbolNode[]) => {
                        for (const node of nodes) {
                            if (enabledSet.has(node.id)) {
                                const start = doc.offsetAt(node.range.start);
                                const end = doc.offsetAt(node.range.end);
                                parts.push({ start, end, include: true });
                            } else {
                                // Если символ выключен, мы просто не добавляем его диапазон.
                                // Пустые места будут заполнены пробелами позже.
                            }
                            collectRanges(node.children);
                        }
                    };
                    collectRanges(symbols);

                    // Сортируем части по началу диапазона
                    parts.sort((a, b) => a.start - b.start);

                    // Строим итоговый контент файла
                    let fileContent = '';
                    let lastEnd = 0;

                    for (const part of parts) {
                        if (part.include) {
                            // Добавляем пробелы от lastEnd до начала текущей части
                            fileContent += ' '.repeat(part.start - lastEnd);
                            // Добавляем саму часть контента
                            fileContent += fullContent.substring(part.start, part.end);
                            lastEnd = part.end;
                        }
                    }
                    // Добавляем пробелы до конца файла, если нужно
                    fileContent += ' '.repeat(fullContent.length - lastEnd);

                    finalPrompt += `--- Файл: ${fileName} ---\n\`\`\`\n${fileContent}\n\`\`\`\n\n`;
                }
            } catch (e) {
                const fileName = uri.fsPath.split(/[/\\]/).pop() || uri.fsPath;
                finalPrompt += `--- Файл: ${fileName} ---\n[Ошибка чтения файла: ${e}]\n\n`;
            }
        }

        return finalPrompt;
    }

    // Подсчет количества символов в скомпилированном промпте
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
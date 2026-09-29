import * as vscode from 'vscode';

export interface RegexSymbol {
    name: string;
    kind: vscode.SymbolKind;
    range: vscode.Range;
}

interface PatternDef {
    pattern: RegExp;
    kind: vscode.SymbolKind;
    nameGroup: number;
}

/**
 * Языки, где блоки определяются индентацией.
 * Для них конец блока = следующая строка с меньшей или равной индентацией.
 */
const INDENT_BASED_LANGUAGES = new Set(['python', 'ruby', 'coffeescript', 'yaml', 'pug', 'jade']);

/**
 * Языки, где блоки определяются фигурными скобками.
 */
const BRACE_BASED_LANGUAGES = new Set([
    'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
    'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'swift', 'kotlin',
    'scala', 'dart', 'lua'
]);

/**
 * Паттерны для поиска объявлений в разных языках.
 * Все regex должны иметь флаг 'gm' (global + multiline).
 */
const LANGUAGE_PATTERNS: Record<string, PatternDef[]> = {
    python: [
        { pattern: /^[ \t]*async[ \t]+def[ \t]+(\w+)\s*\(/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
        { pattern: /^[ \t]*def[ \t]+(\w+)\s*\(/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
        { pattern: /^[ \t]*class[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 1 },
    ],
    ruby: [
        { pattern: /^[ \t]*def[ \t]+(self\.)?(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
        { pattern: /^[ \t]*class[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 1 },
        { pattern: /^[ \t]*module[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Module, nameGroup: 1 },
    ],
    rust: [
        { pattern: /^[ \t]*(pub[ \t]+)?(async[ \t]+)?unsafe[ \t]+fn[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(pub[ \t]+)?(async[ \t]+)?fn[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(pub[ \t]+)?struct[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Struct, nameGroup: 2 },
        { pattern: /^[ \t]*(pub[ \t]+)?enum[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Enum, nameGroup: 2 },
        { pattern: /^[ \t]*(pub[ \t]+)?trait[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
        { pattern: /^[ \t]*(pub[ \t]+)?impl[ \t]+(?:<[^>]*>[ \t]+)?(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 2 },
        { pattern: /^[ \t]*(pub[ \t]+)?mod[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Module, nameGroup: 2 },
        { pattern: /^[ \t]*(pub[ \t]+)?type[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
        // REMOVED: const pattern to exclude constants from structure
    ],
    javascript: [
        { pattern: /^[ \t]*(export[ \t]+)?(async[ \t]+)?function\*?[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(export[ \t]+)?class[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 2 },
        { pattern: /^[ \t]*(export[ \t]+)?(const|let|var)[ \t]+(\w+)[ \t]*=[ \t]*(async[ \t]+)?\(/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(export[ \t]+)?(const|let|var)[ \t]+(\w+)[ \t]*=[ \t]*(async[ \t]+)?function/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        // ADDED: Support for arrow functions (React components, helpers)
        { pattern: /^[ \t]*(export[ \t]+)?(const|let|var)[ \t]+(\w+)[ \t]*=[ \t]*(async[ \t]+)?\([^)]*\)[ \t]*=>/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(async[ \t]+)?(\w+)[ \t]*\([^)]*\)[ \t]*\{/gm, kind: vscode.SymbolKind.Method, nameGroup: 2 },
    ],
    javascriptreact: [], // будет заполнено ниже
    typescript: [],
    typescriptreact: [],
    java: [
        { pattern: /^[ \t]*(public|private|protected|static|final|abstract|synchronized|native|[ \t])*[ \t]*class[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 2 },
        { pattern: /^[ \t]*(public|private|protected|static|final|abstract|synchronized|native|[ \t])*[ \t]*interface[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
        { pattern: /^[ \t]*(public|private|protected|static|final|abstract|synchronized|native|[ \t])*[ \t]*enum[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Enum, nameGroup: 2 },
        { pattern: /^[ \t]*(public|private|protected|static|final|abstract|synchronized|native|[ \t])*[ \t]*\w+(?:<[^>]*>)?(?:\[\])*[ \t]+(\w+)[ \t]*\([^)]*\)[ \t]*(?:throws[ \t][\w,\s]+)?[ \t]*\{/gm, kind: vscode.SymbolKind.Method, nameGroup: 2 },
    ],
    c: [
        { pattern: /^[ \t]*(static|inline|extern|const|[ \t])*\w+(?:\s*\*+|\s+)\**(\w+)[ \t]*\([^)]*\)[ \t]*\{/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
        { pattern: /^[ \t]*(typedef[ \t]+)?struct[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Struct, nameGroup: 2 },
        { pattern: /^[ \t]*(typedef[ \t]+)?enum[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Enum, nameGroup: 2 },
        { pattern: /^[ \t]*(typedef[ \t]+)?union[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Struct, nameGroup: 2 },
    ],
    cpp: [], // наследует от c
    csharp: [
        { pattern: /^[ \t]*(public|private|protected|internal|static|abstract|sealed|partial|virtual|override|[ \t])*(class|record|struct)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 3 },
        { pattern: /^[ \t]*(public|private|protected|internal|static|abstract|sealed|partial|virtual|override|[ \t])*interface[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
        { pattern: /^[ \t]*(public|private|protected|internal|static|abstract|sealed|partial|virtual|override|[ \t])*enum[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Enum, nameGroup: 2 },
        { pattern: /^[ \t]*(public|private|protected|internal|static|abstract|sealed|partial|virtual|override|async|[ \t])*[\w<>\[\]?]+[ \t]+(\w+)[ \t]*\([^)]*\)[ \t]*(?:where[ \t][^{]+)?\{/gm, kind: vscode.SymbolKind.Method, nameGroup: 2 },
    ],
    go: [
        { pattern: /^[ \t]*func[ \t]+(?:\([^)]*\)[ \t]+)?(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
        { pattern: /^[ \t]*type[ \t]+(\w+)[ \t]+struct/gm, kind: vscode.SymbolKind.Struct, nameGroup: 1 },
        { pattern: /^[ \t]*type[ \t]+(\w+)[ \t]+interface/gm, kind: vscode.SymbolKind.Interface, nameGroup: 1 },
    ],
    php: [
        { pattern: /^[ \t]*(public|private|protected|static|abstract|final|[ \t])*function[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
        { pattern: /^[ \t]*class[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 1 },
        { pattern: /^[ \t]*interface[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 1 },
        { pattern: /^[ \t]*trait[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 1 },
        { pattern: /^[ \t]*namespace[ \t]+([\w\\]+)/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 1 },
    ],
    swift: [
        { pattern: /^[ \t]*(open|public|internal|fileprivate|private|static|class|final|override|mutating|[ \t])*(func)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(open|public|internal|fileprivate|private|static|class|final|override|[ \t])*(class|struct|enum|protocol|extension|actor)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 3 },
    ],
    kotlin: [
        { pattern: /^[ \t]*(public|private|protected|internal|open|abstract|final|override|suspend|inline|infix|[ \t])*(fun)[ \t]+(?:<[^>]*>[ \t]+)?(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 3 },
        { pattern: /^[ \t]*(public|private|protected|internal|open|abstract|final|data|sealed|inner|enum|annotation|[ \t])*(class|interface|object)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 3 },
    ],
    dart: [
        { pattern: /^[ \t]*(static|async|Future<[^>]*>|[\w<>\?]+)[ \t]+(\w+)[ \t]*\([^)]*\)[ \t]*(?:async[ \t]*)?\{/gm, kind: vscode.SymbolKind.Method, nameGroup: 2 },
        { pattern: /^[ \t]*(abstract|class|mixin|enum|extension)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 2 },
    ],
    lua: [
        { pattern: /^[ \t]*function[ \t]+(\w+(?:\.\w+)*(?::\w+)?)/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
        { pattern: /^[ \t]*(local[ \t]+)?(\w+)[ \t]*=[ \t]*function/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
    ],
    shellscript: [
        { pattern: /^[ \t]*(function[ \t]+)?(\w+)[ \t]*\(\)/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
        { pattern: /^[ \t]*function[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
    ],
    powershell: [
        { pattern: /^[ \t]*function[ \t]+(\w+(?:-\w+)?)/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
    ],
    scala: [
        { pattern: /^[ \t]*(def)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
        { pattern: /^[ \t]*(class|object|trait|case class|case object|enum)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Class, nameGroup: 2 },
    ],
    haskell: [
        { pattern: /^[ \t]*(data|newtype|type)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Struct, nameGroup: 2 },
        { pattern: /^[ \t]*(module)[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Module, nameGroup: 2 },
        { pattern: /^(\w+)[ \t]*::/gm, kind: vscode.SymbolKind.Function, nameGroup: 1 },
    ],
    elixir: [
        { pattern: /^[ \t]*def(module)?[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Module, nameGroup: 2 },
        { pattern: /^[ \t]*def(p)?[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Function, nameGroup: 2 },
    ],
    html: [
        { pattern: /<script[^>]*>/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 0 },
        { pattern: /<style[^>]*>/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 0 },
        { pattern: /<template[^>]*>/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 0 },
    ],
    css: [
        { pattern: /^[ \t]*(@[\w-]+)[ \t]+([^{\s]+)[ \t]*\{/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 1 },
        { pattern: /^[ \t]*([\w.#:\[\]=~^$*|-]+(?:\s*,\s*[\w.#:\[\]=~^$*|-]+)*)[ \t]*\{/gm, kind: vscode.SymbolKind.Namespace, nameGroup: 1 },
    ],
    scss: [],
    less: [],
    yaml: [
        { pattern: /^(\w[\w-]*):/gm, kind: vscode.SymbolKind.Key, nameGroup: 1 },
    ],
    markdown: [
        { pattern: /^(#{1,6})[ \t]+(.+)$/gm, kind: vscode.SymbolKind.String, nameGroup: 2 },
    ],
};

// Алиасы: копируем паттерны для связанных языков
LANGUAGE_PATTERNS.javascriptreact = [...LANGUAGE_PATTERNS.javascript];
LANGUAGE_PATTERNS.typescript = [
    ...LANGUAGE_PATTERNS.javascript,
    // ADDED: TypeScript-specific declarations
    { pattern: /^[ \t]*(export[ \t]+)?interface[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
    { pattern: /^[ \t]*(export[ \t]+)?type[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Interface, nameGroup: 2 },
    { pattern: /^[ \t]*(export[ \t]+)?enum[ \t]+(\w+)/gm, kind: vscode.SymbolKind.Enum, nameGroup: 2 },
];
LANGUAGE_PATTERNS.typescriptreact = [...LANGUAGE_PATTERNS.typescript];
LANGUAGE_PATTERNS.cpp = [...LANGUAGE_PATTERNS.c];
LANGUAGE_PATTERNS.scss = [...LANGUAGE_PATTERNS.css];
LANGUAGE_PATTERNS.less = [...LANGUAGE_PATTERNS.css];
LANGUAGE_PATTERNS.bash = [...LANGUAGE_PATTERNS.shellscript];
LANGUAGE_PATTERNS.sh = [...LANGUAGE_PATTERNS.shellscript];
LANGUAGE_PATTERNS.zsh = [...LANGUAGE_PATTERNS.shellscript];

/**
 * Преобразует offset в Position (строка, колонка).
 */
function offsetToPosition(content: string, offset: number): vscode.Position {
    const clampedOffset = Math.max(0, Math.min(offset, content.length));
    const before = content.substring(0, clampedOffset);
    const lines = before.split('\n');
    return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
}

/**
 * Находит конец блока для indent-based языков (Python, Ruby, etc.)
 * Конец = последняя строка, у которой индентация больше базовой,
 * либо следующая непустая строка с меньшей/равной индентацией.
 */
function findIndentBlockEnd(content: string, startOffset: number, baseIndent: number): number {
    const lines = content.split('\n');
    const startPos = offsetToPosition(content, startOffset);
    let lastContentLine = startPos.line;

    for (let i = startPos.line + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) continue;

        const indent = line.match(/^[ \t]*/)?.[0].length ?? 0;
        if (indent <= baseIndent) {
            break;
        }
        lastContentLine = i;
    }

    const endOffset = lines.slice(0, lastContentLine + 1).join('\n').length;
    return Math.min(endOffset, content.length);
}

/**
 * Находит конец блока для brace-based языков (JS, TS, Rust, Go, etc.)
 * Считает фигурные скобки от startOffset.
 */
function findBraceBlockEnd(content: string, startOffset: number): number {
    let depth = 0;
    let foundOpen = false;
    let inString: string | null = null;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = startOffset; i < content.length; i++) {
        const ch = content[i];
        const next = content[i + 1];

        // Обработка комментариев и строк
        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                inBlockComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (ch === '\\') {
                i++; // пропускаем экранированный символ
                continue;
            }
            if (ch === inString) {
                inString = null;
            }
            continue;
        }

        if (ch === '/' && next === '/') {
            inLineComment = true;
            i++;
            continue;
        }
        if (ch === '/' && next === '*') {
            inBlockComment = true;
            i++;
            continue;
        }
        if (ch === '"' || ch === '\'' || ch === '`') {
            inString = ch;
            continue;
        }

        if (ch === '{') {
            depth++;
            foundOpen = true;
        } else if (ch === '}') {
            depth--;
            if (foundOpen && depth === 0) {
                return i + 1;
            }
        }
    }

    // Если не нашли закрывающую скобку — возвращаем конец строки объявления
    const newlineIdx = content.indexOf('\n', startOffset);
    return newlineIdx === -1 ? content.length : newlineIdx;
}

/**
 * Находит конец блока в зависимости от языка.
 */
function findBlockEnd(content: string, startOffset: number, languageId: string): number {
    if (INDENT_BASED_LANGUAGES.has(languageId)) {
        // Определяем базовую индентацию строки объявления
        const lineStart = content.lastIndexOf('\n', startOffset - 1) + 1;
        const lineText = content.substring(lineStart, startOffset);
        const baseIndent = lineText.match(/^[ \t]*/)?.[0].length ?? 0;
        return findIndentBlockEnd(content, startOffset, baseIndent);
    }

    if (BRACE_BASED_LANGUAGES.has(languageId)) {
        return findBraceBlockEnd(content, startOffset);
    }

    // По умолчанию — конец строки объявления
    const newlineIdx = content.indexOf('\n', startOffset);
    return newlineIdx === -1 ? content.length : newlineIdx;
}

/**
 * Парсит содержимое файла с помощью regex для получения базовой структуры.
 * Используется как fallback, когда LSP и folding ranges недоступны.
 */
export function parseWithRegex(content: string, languageId: string): RegexSymbol[] {
    const patterns = LANGUAGE_PATTERNS[languageId];
    if (!patterns || patterns.length === 0) {
        return [];
    }

    const results: RegexSymbol[] = [];
    const seen = new Set<string>(); // для дедупликации по позиции

    for (const { pattern, kind, nameGroup } of patterns) {
        // Создаём новую копию regex для каждого прохода ( lastIndex сбрасывается )
        const regex = new RegExp(pattern.source, pattern.flags);
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
            const matchStart = match.index;
            const name = nameGroup === 0 ? match[0] : (match[nameGroup] || match[0]);

            if (!name || name.trim().length === 0) continue;

            // Дедупликация: если на этой позиции уже есть символ — пропускаем
            if (seen.has(String(matchStart))) continue;
            seen.add(String(matchStart));

            const endOffset = findBlockEnd(content, matchStart, languageId);
            const startPos = offsetToPosition(content, matchStart);
            const endPos = offsetToPosition(content, endOffset);

            results.push({
                name: name.trim(),
                kind,
                range: new vscode.Range(startPos, endPos)
            });
        }
    }

    // Сортируем по позиции в файле
    results.sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
            return a.range.start.line - b.range.start.line;
        }
        return a.range.start.character - b.range.start.character;
    });

    return results;
}

/**
 * Возвращает список поддерживаемых языков.
 */
export function getSupportedLanguages(): string[] {
    return Object.keys(LANGUAGE_PATTERNS);
}

/**
 * Проверяет, поддерживается ли язык regex-парсингом.
 */
export function isLanguageSupported(languageId: string): boolean {
    const patterns = LANGUAGE_PATTERNS[languageId];
    return !!patterns && patterns.length > 0;
}
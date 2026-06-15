import * as vscode from 'vscode';

export interface TreeOptions {
    useGitignore?: boolean;
    customIgnore?: string;
}

export class TreeManager {
    constructor(private context: vscode.ExtensionContext) {}

    public async getProjectTree(options: TreeOptions = {}): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '';
        }

        const rootFolder = workspaceFolders[0].uri;

        // Собираем паттерны игнорирования
        const ignorePatterns: string[] = [];

        // 1. Всегда игнорируем стандартные папки
        ignorePatterns.push('node_modules', '.git', 'dist', 'build', 'target', '.DS_Store', 'out', '.vscode-test');

        // 2. Если включён gitignore — читаем .gitignore
        if (options.useGitignore) {
            const gitignoreContent = await this.readGitignore(rootFolder);
            if (gitignoreContent) {
                ignorePatterns.push(...this.parseIgnorePatterns(gitignoreContent));
            }
        } 
        // 3. Иначе используем кастомный ignore (если есть)
        else if (options.customIgnore && options.customIgnore.trim()) {
            ignorePatterns.push(...this.parseIgnorePatterns(options.customIgnore));
        }

        const tree = await this.buildTree(rootFolder, '', 0, ignorePatterns, rootFolder);
        return tree;
    }

    private async readGitignore(rootUri: vscode.Uri): Promise<string | null> {
        try {
            const gitignoreUri = vscode.Uri.joinPath(rootUri, '.gitignore');
            const uint8Array = await vscode.workspace.fs.readFile(gitignoreUri);
            return new TextDecoder().decode(uint8Array);
        } catch {
            return null;
        }
    }

    private parseIgnorePatterns(content: string): string[] {
        return content
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'));
    }

    /**
     * Проверяет, попадает ли путь под паттерн в стиле gitignore.
     * Поддерживает: *, **, ?, отрицание (!), паттерны с / и без.
     */
    private matchesPattern(relativePath: string, name: string, isDirectory: boolean, pattern: string): boolean {
        let p = pattern;

        // Отрицание обрабатывается на уровне списка (не тут)
        if (p.startsWith('!')) return false;

        // Паттерн, заканчивающийся на /, — только для директорий
        const dirOnly = p.endsWith('/');
        if (dirOnly) {
            p = p.slice(0, -1);
            if (!isDirectory) return false;
        }

        // Убираем ведущий /
        if (p.startsWith('/')) p = p.slice(1);

        // Если в паттерне нет /, он применяется только к имени (basename)
        const matchAgainstName = !p.includes('/');
        const target = matchAgainstName ? name : relativePath;

        // Преобразуем gitignore-паттерн в RegExp
        const regexStr = this.patternToRegex(p);
        try {
            const regex = new RegExp(`^${regexStr}$`);
            if (regex.test(target)) return true;
            // Для паттернов без / — также проверяем совпадение с любой частью пути
            if (matchAgainstName) {
                const parts = relativePath.split('/');
                return parts.some(part => regex.test(part));
            }
            return false;
        } catch {
            return false;
        }
    }

    private patternToRegex(pattern: string): string {
        let result = '';
        let i = 0;
        while (i < pattern.length) {
            const c = pattern[i];
            if (c === '*') {
                if (pattern[i + 1] === '*') {
                    // ** — совпадает с любым количеством любых символов (включая /)
                    result += '.*';
                    i += 2;
                    // Пропускаем возможный / после **
                    if (pattern[i] === '/') i++;
                } else {
                    // * — совпадает с любым количеством символов, кроме /
                    result += '[^/]*';
                    i++;
                }
            } else if (c === '?') {
                result += '[^/]';
                i++;
            } else if ('.+^${}()|[]\\'.includes(c)) {
                result += '\\' + c;
                i++;
            } else {
                result += c;
                i++;
            }
        }
        return result;
    }

    private isIgnored(relativePath: string, name: string, isDirectory: boolean, patterns: string[]): boolean {
        let ignored = false;
        for (const pattern of patterns) {
            if (pattern.startsWith('!')) {
                // Отрицание: если совпало — снимаем игнор
                if (this.matchesPattern(relativePath, name, isDirectory, pattern.slice(1))) {
                    ignored = false;
                }
            } else {
                if (this.matchesPattern(relativePath, name, isDirectory, pattern)) {
                    ignored = true;
                }
            }
        }
        return ignored;
    }

    private async buildTree(
        uri: vscode.Uri,
        prefix: string,
        depth: number,
        ignorePatterns: string[],
        rootUri: vscode.Uri
    ): Promise<string> {
        if (depth > 6) {
            return '';
        }

        let result = '';
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(uri);
        } catch {
            return '';
        }

        // Фильтруем по ignore-паттернам
        const filteredEntries: [string, vscode.FileType][] = [];
        for (const [name, type] of entries) {
            const isDir = type === vscode.FileType.Directory;
            const relPath = this.getRelativePath(rootUri, uri, name);
            if (!this.isIgnored(relPath, name, isDir, ignorePatterns)) {
                filteredEntries.push([name, type]);
            }
        }

        // Сортировка: папки сначала, затем файлы
        const sortedEntries = filteredEntries.sort((a, b) => {
            const aIsDir = a[1] === vscode.FileType.Directory;
            const bIsDir = b[1] === vscode.FileType.Directory;
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return a[0].localeCompare(b[0]);
        });

        for (let i = 0; i < sortedEntries.length; i++) {
            const [name, type] = sortedEntries[i];
            const isLast = i === sortedEntries.length - 1;
            const connector = isLast ? '└── ' : '├── ';
            const childPrefix = isLast ? '    ' : '│   ';

            result += prefix + connector + name + '\n';

            if (type === vscode.FileType.Directory) {
                const childUri = vscode.Uri.joinPath(uri, name);
                result += await this.buildTree(childUri, prefix + childPrefix, depth + 1, ignorePatterns, rootUri);
            }
        }

        return result;
    }

    private getRelativePath(rootUri: vscode.Uri, parentUri: vscode.Uri, name: string): string {
        const parentPath = rootUri.path;
        const currentPath = parentUri.path;
        const relative = currentPath.startsWith(parentPath)
            ? currentPath.slice(parentPath.length).replace(/^\//, '')
            : '';
        return relative ? `${relative}/${name}` : name;
    }
}
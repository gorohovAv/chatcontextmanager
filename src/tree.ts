import * as vscode from 'vscode';

export class TreeManager {
    constructor(private context: vscode.ExtensionContext) {}

    public async getProjectTree(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '';
        }

        const rootFolder = workspaceFolders[0].uri;
        const tree = await this.buildTree(rootFolder, '', 0);
        return tree;
    }

    private async buildTree(uri: vscode.Uri, prefix: string, depth: number): Promise<string> {
        if (depth > 5) { // Ограничение глубины вложенности
            return '';
        }

        let result = '';
        const entries = await vscode.workspace.fs.readDirectory(uri);
        
        // Сортировка: папки сначала, затем файлы
        const sortedEntries = entries.sort((a, b) => {
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
            
            // Пропускаем скрытые папки и стандартные директории сборки
            if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'build' || name === 'target') {
                continue;
            }

            result += prefix + connector + name + '\n';

            if (type === vscode.FileType.Directory) {
                const childUri = vscode.Uri.joinPath(uri, name);
                result += await this.buildTree(childUri, prefix + childPrefix, depth + 1);
            }
        }

        return result;
    }
}
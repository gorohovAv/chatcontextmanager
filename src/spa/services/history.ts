import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

function findGitRepository(startPath: string): string | null {
    const ignoredDirs = new Set([
        'node_modules', '.git', 'dist', 'build', 'target', '.vscode',
        '.idea', 'out', 'bin', 'obj', '.next', 'coverage', '__pycache__',
        '.venv', 'venv', '.gradle', '.m2', '.cache', '.npm', '.yarn',
        '.DS_Store', 'vendor', 'packages', '.turbo'
    ]);

    // 1. Проверяем сам startPath
    if (fs.existsSync(path.join(startPath, '.git'))) {
        return startPath;
    }

    // 2. Ищем вверх по родительским директориям
    let currentPath = startPath;
    while (true) {
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) break; // достигли корня ФС
        currentPath = parentPath;
        if (fs.existsSync(path.join(currentPath, '.git'))) {
            return currentPath;
        }
    }

    // 3. Ищем вниз по поддиректориям (BFS, чтобы найти ближайший по глубине)
    const maxDepth = 3;
    const queue: Array<{ path: string; depth: number }> = [{ path: startPath, depth: 0 }];

    while (queue.length > 0) {
        const item = queue.shift()!;
        if (item.depth >= maxDepth) continue;

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(item.path, { withFileTypes: true });
        } catch {
            continue; // нет прав доступа или директория недоступна
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (ignoredDirs.has(entry.name)) continue;
            if (entry.name.startsWith('.') && entry.name !== '.git') continue;

            const fullPath = path.join(item.path, entry.name);
            if (fs.existsSync(path.join(fullPath, '.git'))) {
                return fullPath;
            }
            queue.push({ path: fullPath, depth: item.depth + 1 });
        }
    }

    return null;
}

export async function getGitHistory(commitCount: number): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }
    
    const startPath = workspaceFolders[0].uri.fsPath;
    const gitRepoPath = findGitRepository(startPath);
    
    if (!gitRepoPath) {
        throw new Error('Git repository not found. Make sure you are in a git repository.');
    }
    
    // Используем --stat для вывода списка измененных файлов в каждом коммите
    const command = `git log -n ${commitCount} --stat`;
    
    try {
        const { stdout } = await execAsync(command, { 
            cwd: gitRepoPath, 
            maxBuffer: 1024 * 1024 * 10, 
            windowsHide: true 
        });
        return stdout;
    } catch (error: any) {
        throw new Error(`Git command failed: ${error.message}`);
    }
}
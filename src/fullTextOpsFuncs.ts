import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface HuntBlock {
    type: 'single' | 'range';
    file_types: string[];
    exclude: string[];
    pattern?: string;
    start?: string;
    end?: string;
    before: number;
    after: number;
    max_results: number;
}

export interface HuntPlan {
    id: string;
    root: string;
    blocks: HuntBlock[];
}

export interface PatchFile {
    path: string;
    content: string;
    type: 'full';
}

export interface PatchReplace {
    path: string;
    from: string;
    to: string;
    type: 'replace';
}

export type PatchOperation = PatchFile | PatchReplace;

export function parseHuntPlan(xml: string): HuntPlan {
    const idMatch = xml.match(/<id>([\s\S]*?)<\/id>/);
    const rootMatch = xml.match(/<root>([\s\S]*?)<\/root>/);
    
    const blocks: HuntBlock[] = [];
    const blockRegex = /<block type="(single|range)">([\s\S]*?)<\/block>/g;
    let match;
    
    while ((match = blockRegex.exec(xml)) !== null) {
        const type = match[1] as 'single' | 'range';
        const content = match[2];
        
        const fileTypesMatch = content.match(/<file_types>([\s\S]*?)<\/file_types>/);
        const excludeMatch = content.match(/<exclude>([\s\S]*?)<\/exclude>/);
        const patternMatch = content.match(/<pattern>([\s\S]*?)<\/pattern>/);
        const startMatch = content.match(/<start>([\s\S]*?)<\/start>/);
        const endMatch = content.match(/<end>([\s\S]*?)<\/end>/);
        const beforeMatch = content.match(/<before>([\s\S]*?)<\/before>/);
        const afterMatch = content.match(/<after>([\s\S]*?)<\/after>/);
        const maxResultsMatch = content.match(/<max_results>([\s\S]*?)<\/max_results>/);
        
        blocks.push({
            type,
            file_types: fileTypesMatch ? fileTypesMatch[1].trim().split(/\s+/).filter(Boolean) : [],
            exclude: excludeMatch ? excludeMatch[1].trim().split(/\s+/).filter(Boolean) : [],
            pattern: patternMatch ? patternMatch[1].trim() : undefined,
            start: startMatch ? startMatch[1].trim() : undefined,
            end: endMatch ? endMatch[1].trim() : undefined,
            before: beforeMatch ? parseInt(beforeMatch[1].trim(), 10) : 0,
            after: afterMatch ? parseInt(afterMatch[1].trim(), 10) : 0,
            max_results: maxResultsMatch ? parseInt(maxResultsMatch[1].trim(), 10) : 10
        });
    }
    
    return {
        id: idMatch ? idMatch[1].trim() : 'unknown',
        root: rootMatch ? rootMatch[1].trim() : '.',
        blocks
    };
}

export function parsePatch(xml: string): PatchOperation[] {
    const operations: PatchOperation[] = [];
    
    const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let fileMatch;
    while ((fileMatch = fileRegex.exec(xml)) !== null) {
        const filePath = fileMatch[1];
        const contentMatch = fileMatch[2].match(/<!\[CDATA\[\s*([\s\S]*?)\s*\]\]>/);
        operations.push({
            path: filePath,
            content: contentMatch ? contentMatch[1] : fileMatch[2].trim(),
            type: 'full'
        });
    }
    
    const replaceRegex = /<replace path="([^"]+)">([\s\S]*?)<\/replace>/g;
    let replaceMatch;
    while ((replaceMatch = replaceRegex.exec(xml)) !== null) {
        const filePath = replaceMatch[1];
        const content = replaceMatch[2];
        const fromMatch = content.match(/<from>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/from>/);
        const toMatch = content.match(/<to>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/to>/);
        
        if (fromMatch && toMatch) {
            operations.push({
                path: filePath,
                from: fromMatch[1],
                to: toMatch[1],
                type: 'replace'
            });
        }
    }
    
    return operations;
}

export async function executeHuntPlan(plan: HuntPlan, workspaceRoot: string): Promise<string> {
    let results = `# Hunt Plan Results: ${plan.id}\n\n`;
    const rootPath = path.isAbsolute(plan.root) ? plan.root : path.join(workspaceRoot, plan.root);

    for (const block of plan.blocks) {
        results += `## Block: ${block.type}\n`;
        if (block.type === 'single') {
            results += await executeSingleSearch(block, rootPath);
        } else if (block.type === 'range') {
            results += await executeRangeSearch(block, rootPath);
        }
        results += '\n---\n\n';
    }

    return results.trim();
}

async function executeSingleSearch(block: HuntBlock, rootPath: string): Promise<string> {
    if (!block.pattern) return 'No pattern provided.\n';
    
    const includePattern = block.file_types.length > 0 
        ? `{${block.file_types.map(t => `**/*${t}`).join(',')}}` 
        : '**/*';
        
    const excludePattern = block.exclude.length > 0 
        ? `{${block.exclude.join(',')}}` 
        : '';

    try {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootPath, includePattern),
            excludePattern ? new vscode.RelativePattern(rootPath, excludePattern) : null,
            block.max_results
        );

        let blockResults = '';
        let count = 0;

        for (const file of files) {
            if (count >= block.max_results) break;
            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();
            const lines = text.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(block.pattern!)) {
                    const start = Math.max(0, i - block.before);
                    const end = Math.min(lines.length, i + block.after + 1);
                    const context = lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join('\n');
                    blockResults += `\n### ${vscode.workspace.asRelativePath(file)} (Line ${i + 1})\n\`\`\`\n${context}\n\`\`\`\n`;
                    count++;
                    if (count >= block.max_results) break;
                }
            }
        }
        
        return blockResults || 'No results found.\n';
    } catch (e: any) {
        return `Error during search: ${e.message}\n`;
    }
}

async function executeRangeSearch(block: HuntBlock, rootPath: string): Promise<string> {
    if (!block.start || !block.end) return 'Start and end patterns required for range search.\n';
    
    const includePattern = block.file_types.length > 0 
        ? `{${block.file_types.map(t => `**/*${t}`).join(',')}}` 
        : '**/*';
    const excludePattern = block.exclude.length > 0 
        ? `{${block.exclude.join(',')}}` 
        : '';

    try {
        const files = await vscode.workspace.findFiles(
            new vscode.RelativePattern(rootPath, includePattern),
            excludePattern ? new vscode.RelativePattern(rootPath, excludePattern) : null,
            block.max_results
        );

        let blockResults = '';
        let count = 0;
        const startRegex = new RegExp(block.start, 'm');
        const endRegex = new RegExp(block.end, 'm');

        for (const file of files) {
            if (count >= block.max_results) break;
            const doc = await vscode.workspace.openTextDocument(file);
            const text = doc.getText();
            const lines = text.split('\n');
            
            let inRange = false;
            let rangeStart = -1;

            for (let i = 0; i < lines.length; i++) {
                if (!inRange && startRegex.test(lines[i])) {
                    inRange = true;
                    rangeStart = i;
                } else if (inRange && endRegex.test(lines[i])) {
                    const rangeEnd = i;
                    inRange = false;
                    
                    const start = Math.max(0, rangeStart - block.before);
                    const end = Math.min(lines.length, rangeEnd + block.after + 1);
                    const context = lines.slice(start, end).map((l, idx) => `${start + idx + 1}: ${l}`).join('\n');
                    blockResults += `\n### ${vscode.workspace.asRelativePath(file)} (Lines ${rangeStart + 1}-${rangeEnd + 1})\n\`\`\`\n${context}\n\`\`\`\n`;
                    count++;
                    if (count >= block.max_results) break;
                }
            }
        }
        
        return blockResults || 'No results found.\n';
    } catch (e: any) {
        return `Error during search: ${e.message}\n`;
    }
}

export async function applyPatch(operations: PatchOperation[], workspaceRoot: string): Promise<string> {
    let results = '# Patch Application Results\n\n';
    
    for (const op of operations) {
        const fullPath = path.isAbsolute(op.path) ? op.path : path.join(workspaceRoot, op.path);
        const relativePath = vscode.workspace.asRelativePath(fullPath);
        
        try {
            if (op.type === 'full') {
                const dir = path.dirname(fullPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(fullPath, op.content, 'utf-8');
                results += `✅ Full replacement: \`${relativePath}\`\n`;
            } else if (op.type === 'replace') {
                if (!fs.existsSync(fullPath)) {
                    results += `❌ File not found: \`${relativePath}\`\n`;
                    continue;
                }
                let content = fs.readFileSync(fullPath, 'utf-8');
                if (!content.includes(op.from)) {
                    results += `⚠️ Pattern not found in: \`${relativePath}\`\n`;
                    continue;
                }
                const newContent = content.replace(op.from, op.to);
                fs.writeFileSync(fullPath, newContent, 'utf-8');
                results += `✅ Partial replacement: \`${relativePath}\`\n`;
            }
        } catch (e: any) {
            results += `❌ Error applying to \`${relativePath}\`: ${e.message}\n`;
        }
    }
    
    return results.trim();
}
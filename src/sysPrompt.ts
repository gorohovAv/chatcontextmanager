import * as vscode from 'vscode';

export class SystemPromptManager {
    private static readonly SYSTEM_PROMPT_KEY = 'promptBuilder.systemPrompt';
    private static readonly PROJECT_PROMPT_KEY = 'promptBuilder.projectPrompt';

    constructor(private context: vscode.ExtensionContext) {}

    // Системный промпт (globalState - персистентный, глобальный для всех проектов)
    public getSystemPrompt(): string {
        return this.context.globalState.get<string>(SystemPromptManager.SYSTEM_PROMPT_KEY, '');
    }

    public async setSystemPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(SystemPromptManager.SYSTEM_PROMPT_KEY, prompt);
    }

    // Промпт проекта (workspaceState - персистентный, только для текущего проекта)
    public getProjectPrompt(): string {
        return this.context.workspaceState.get<string>(SystemPromptManager.PROJECT_PROMPT_KEY, '');
    }

    public async setProjectPrompt(prompt: string): Promise<void> {
        await this.context.workspaceState.update(SystemPromptManager.PROJECT_PROMPT_KEY, prompt);
    }
}
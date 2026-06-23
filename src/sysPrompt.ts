import * as vscode from 'vscode';

export class SystemPromptManager {
    private static readonly SYSTEM_PROMPT_KEY = 'promptBuilder.systemPrompt';
    private static readonly PROJECT_PROMPT_KEY = 'promptBuilder.projectPrompt';
    private static readonly ASK_PROMPT_KEY = 'promptBuilder.askPrompt';
    private static readonly CUSTOM_PROMPT_KEY = 'promptBuilder.customPrompt';
    private static readonly CURRENT_MODE_KEY = 'promptBuilder.currentMode';

    constructor(private context: vscode.ExtensionContext) {}

    // Системный промпт (globalState - персистентный, глобальный для всех проектов)
    public getSystemPrompt(): string {
        return this.context.globalState.get<string>(SystemPromptManager.SYSTEM_PROMPT_KEY, '');
    }

    public async setSystemPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(SystemPromptManager.SYSTEM_PROMPT_KEY, prompt);
    }

    public getAskPrompt(): string {
        return this.context.globalState.get<string>(SystemPromptManager.ASK_PROMPT_KEY, '');
    }

    public async setAskPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(SystemPromptManager.ASK_PROMPT_KEY, prompt);
    }

    public getCustomPrompt(): string {
        return this.context.globalState.get<string>(SystemPromptManager.CUSTOM_PROMPT_KEY, '');
    }

    public async setCustomPrompt(prompt: string): Promise<void> {
        await this.context.globalState.update(SystemPromptManager.CUSTOM_PROMPT_KEY, prompt);
    }

    public getCurrentMode(): 'edit' | 'ask' | 'custom' {
        return this.context.globalState.get<'edit' | 'ask' | 'custom'>(SystemPromptManager.CURRENT_MODE_KEY, 'edit');
    }

    public async setCurrentMode(mode: 'edit' | 'ask' | 'custom'): Promise<void> {
        await this.context.globalState.update(SystemPromptManager.CURRENT_MODE_KEY, mode);
    }

    public getActiveSystemPrompt(): string {
        const mode = this.getCurrentMode();
        if (mode === 'ask') return this.getAskPrompt();
        if (mode === 'custom') return this.getCustomPrompt();
        return this.getSystemPrompt();
    }

    // Промпт проекта (workspaceState - персистентный, только для текущего проекта)
    public getProjectPrompt(): string {
        return this.context.workspaceState.get<string>(SystemPromptManager.PROJECT_PROMPT_KEY, '');
    }

    public async setProjectPrompt(prompt: string): Promise<void> {
        await this.context.workspaceState.update(SystemPromptManager.PROJECT_PROMPT_KEY, prompt);
    }
}
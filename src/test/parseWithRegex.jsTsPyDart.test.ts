import * as assert from 'assert';
import { parseWithRegex } from '../plTools';
import * as vscode from 'vscode';

suite('parseWithRegex - JS, TS, Python, Dart', () => {
    test('JavaScript parsing', () => {
        const content = `
export async function fetchUserData() {
    return await fetch('/api/user');
}

class UserManager {
    constructor() {}
}

export const processQueue = async (items) => {
    // processing
};

const myCallback = function() {
    // callback
};
        `.trim();
        
        const symbols = parseWithRegex(content, 'javascript');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, 'fetchUserData');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'UserManager');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[2].name, 'constructor');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[3].name, 'processQueue');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[4].name, 'myCallback');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Function);
    });

    test('TypeScript parsing', () => {
        const content = `
export interface UserData {
    id: number;
    name: string;
}

export class UserService {
    async getUser(): Promise<UserData> {
        return {} as UserData;
    }
}

export const formatUser = (user: UserData): string => {
    return user.name;
};
        `.trim();
        
        const symbols = parseWithRegex(content, 'typescript');
        assert.strictEqual(symbols.length, 3);
        assert.strictEqual(symbols[0].name, 'UserService');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[1].name, 'getUser');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[2].name, 'formatUser');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Function);
    });

    test('Python parsing', () => {
        const content = `
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return {"status": "ok"}

def process_data(data):
    return data.get("status")

class DataProcessor:
    def __init__(self):
        self.data = None

    def run(self):
        pass
        `.trim();
        
        const symbols = parseWithRegex(content, 'python');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, 'fetch_data');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'process_data');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[2].name, 'DataProcessor');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[3].name, '__init__');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[4].name, 'run');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Function);
    });

    test('Dart parsing', () => {
        const content = `
abstract class Repository {
  Future<void> save();
}

mixin Logger {
  void log(String message) {
    print(message);
  }
}

class UserService extends Repository with Logger {
  Future<void> save() async {
    log("Saving...");
  }
  
  void process() {
    // processing
  }
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'dart');
        assert.strictEqual(symbols.length, 6);
        assert.strictEqual(symbols[0].name, 'Repository');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[1].name, 'Logger');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[2].name, 'log');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[3].name, 'UserService');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[4].name, 'save');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[5].name, 'process');
        assert.strictEqual(symbols[5].kind, vscode.SymbolKind.Method);
    });
});
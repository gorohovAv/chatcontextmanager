import * as assert from 'assert';
import { parseWithRegex } from '../plTools';
import * as vscode from 'vscode';

suite('parseWithRegex - Java, Kotlin, Swift', () => {
    test('Java parsing', () => {
        const content = `
package com.example;

public class UserService {
    private final UserRepository repo;

    public UserService(UserRepository repo) {
        this.repo = repo;
    }

    public User getUser(int id) throws Exception {
        return repo.findById(id);
    }
}

interface UserRepository {
    User findById(int id);
}

enum Status {
    ACTIVE, INACTIVE
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'java');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, 'UserService');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[1].name, 'UserService'); // constructor
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[2].name, 'getUser');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Method);
        assert.strictEqual(symbols[3].name, 'UserRepository');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Interface);
        assert.strictEqual(symbols[4].name, 'Status');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Enum);
    });

    test('Kotlin parsing', () => {
        const content = `
package com.example

fun topLevelFunction() {
    println("Hello")
}

suspend fun fetchData(): String {
    return "data"
}

class UserService {
    fun process() {}
}

data class User(val name: String)

sealed class Result {
    object Success : Result()
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'kotlin');
        assert.strictEqual(symbols.length, 7);
        assert.strictEqual(symbols[0].name, 'topLevelFunction');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'fetchData');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[2].name, 'UserService');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[3].name, 'process');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[4].name, 'User');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[5].name, 'Result');
        assert.strictEqual(symbols[5].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[6].name, 'Success');
        assert.strictEqual(symbols[6].kind, vscode.SymbolKind.Class);
    });

    test('Swift parsing', () => {
        const content = `
import Foundation

func globalFunction() {
    print("Global")
}

public class NetworkManager {
    static let shared = NetworkManager()
    
    public func fetchData() async throws -> Data {
        return Data()
    }
}

struct User {
    let id: Int
    let name: String
}

enum NetworkError: Error {
    case invalidURL
    case noData
}

protocol Repository {
    func save()
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'swift');
        assert.strictEqual(symbols.length, 6);
        assert.strictEqual(symbols[0].name, 'globalFunction');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'NetworkManager');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[2].name, 'fetchData');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[3].name, 'User');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[4].name, 'NetworkError');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Class);
        assert.strictEqual(symbols[5].name, 'Repository');
        assert.strictEqual(symbols[5].kind, vscode.SymbolKind.Class);
    });
});
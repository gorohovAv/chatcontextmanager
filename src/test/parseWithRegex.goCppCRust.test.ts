import * as assert from 'assert';
import { parseWithRegex } from '../plTools';
import * as vscode from 'vscode';

suite('parseWithRegex - Go, C++, C, Rust', () => {
    test('Go parsing', () => {
        const content = `
package main

import "fmt"

func main() {
    fmt.Println("Hello")
}

func (s *Server) Start() error {
    return nil
}

type Server struct {
    Port int
}

type Repository interface {
    Save(data string) error
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'go');
        assert.strictEqual(symbols.length, 4);
        assert.strictEqual(symbols[0].name, 'main');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'Start');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[2].name, 'Server');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Struct);
        assert.strictEqual(symbols[3].name, 'Repository');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Interface);
    });

    test('C parsing', () => {
        const content = `
#include <stdio.h>

void printMessage() {
    printf("Hello\\n");
}

static int add(int a, int b) {
    return a + b;
}

struct Point {
    int x;
    int y;
};

enum Color {
    RED,
    GREEN,
    BLUE
};

union Data {
    int i;
    float f;
};
        `.trim();
        
        const symbols = parseWithRegex(content, 'c');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, 'printMessage');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'add');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[2].name, 'Point');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Struct);
        assert.strictEqual(symbols[3].name, 'Color');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Enum);
        assert.strictEqual(symbols[4].name, 'Data');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Struct); // union парсится как Struct
    });

    test('C++ parsing', () => {
        const content = `
#include <iostream>

class MyClass {
public:
    void doSomething() {
        std::cout << "Doing something";
    }
};

struct MyStruct {
    int value;
};

void globalFunction() {
    // implementation
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'cpp');
        // cpp наследует паттерны от c, где нет определения class
        assert.strictEqual(symbols.length, 3);
        assert.strictEqual(symbols[0].name, 'doSomething');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'MyStruct');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Struct);
        assert.strictEqual(symbols[2].name, 'globalFunction');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Function);
    });

    test('Rust parsing', () => {
        const content = `
pub async fn fetch_data() -> Result<(), Error> {
    Ok(())
}

fn process_data() {
    // processing
}

pub struct User {
    pub id: u32,
    pub name: String,
}

pub enum Status {
    Active,
    Inactive,
}

pub trait Repository {
    fn save(&self);
}

impl User {
    pub fn new(id: u32, name: String) -> Self {
        Self { id, name }
    }
}

pub mod utils {
    pub fn helper() {}
}

pub type UserId = u32;

pub const MAX_USERS: usize = 100;
        `.trim();
        
        const symbols = parseWithRegex(content, 'rust');
        assert.strictEqual(symbols.length, 12);
        assert.strictEqual(symbols[0].name, 'fetch_data');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[1].name, 'process_data');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[2].name, 'User');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Struct);
        assert.strictEqual(symbols[3].name, 'Status');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Enum);
        assert.strictEqual(symbols[4].name, 'Repository');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Interface);
        assert.strictEqual(symbols[5].name, 'save');
        assert.strictEqual(symbols[5].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[6].name, 'User');
        assert.strictEqual(symbols[6].kind, vscode.SymbolKind.Class); // impl парсится как Class
        assert.strictEqual(symbols[7].name, 'new');
        assert.strictEqual(symbols[7].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[8].name, 'utils');
        assert.strictEqual(symbols[8].kind, vscode.SymbolKind.Module);
        assert.strictEqual(symbols[9].name, 'helper');
        assert.strictEqual(symbols[9].kind, vscode.SymbolKind.Function);
        assert.strictEqual(symbols[10].name, 'UserId');
        assert.strictEqual(symbols[10].kind, vscode.SymbolKind.Interface); // type парсится как Interface
        assert.strictEqual(symbols[11].name, 'MAX_USERS');
        assert.strictEqual(symbols[11].kind, vscode.SymbolKind.Constant);
    });
});
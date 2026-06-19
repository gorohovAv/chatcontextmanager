import * as assert from 'assert';
import { parseWithRegex } from '../plTools';
import * as vscode from 'vscode';

suite('parseWithRegex - Markup Languages', () => {
    test('HTML parsing', () => {
        const content = `
<!DOCTYPE html>
<html>
<head>
    <script type="text/javascript">
        console.log("hello");
    </script>
    <style>
        body { margin: 0; }
    </style>
</head>
<body>
    <template id="my-template">
        <div></div>
    </template>
</body>
</html>
        `.trim();
        
        const symbols = parseWithRegex(content, 'html');
        assert.strictEqual(symbols.length, 3);
        assert.strictEqual(symbols[0].name, '<script type="text/javascript">');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[1].name, '<style>');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[2].name, '<template id="my-template">');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Namespace);
    });

    test('CSS parsing', () => {
        const content = `
@media screen and (max-width: 600px) {
    body { font-size: 14px; }
}
.class-name {
    color: red;
}
#id-name {
    color: blue;
}
div:hover {
    background: black;
}
        `.trim();
        
        const symbols = parseWithRegex(content, 'css');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, '@media');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[1].name, 'body');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[2].name, '.class-name');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[3].name, '#id-name');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Namespace);
        assert.strictEqual(symbols[4].name, 'div:hover');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Namespace);
    });

    test('YAML parsing', () => {
        const content = `
version: 1.0.0
name: my-app
dependencies:
  lodash: ^4.17.21
  express: ^4.18.0
        `.trim();
        
        const symbols = parseWithRegex(content, 'yaml');
        assert.strictEqual(symbols.length, 5);
        assert.strictEqual(symbols[0].name, 'version');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.Key);
        assert.strictEqual(symbols[1].name, 'name');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.Key);
        assert.strictEqual(symbols[2].name, 'dependencies');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.Key);
        assert.strictEqual(symbols[3].name, 'lodash');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.Key);
        assert.strictEqual(symbols[4].name, 'express');
        assert.strictEqual(symbols[4].kind, vscode.SymbolKind.Key);
    });

    test('Markdown parsing', () => {
        const content = `
# Main Title
Some text here.
## Subtitle 1
More text.
### Subtitle 1.1
#### Subtitle 1.1.1
        `.trim();
        
        const symbols = parseWithRegex(content, 'markdown');
        assert.strictEqual(symbols.length, 4);
        assert.strictEqual(symbols[0].name, 'Main Title');
        assert.strictEqual(symbols[0].kind, vscode.SymbolKind.String);
        assert.strictEqual(symbols[1].name, 'Subtitle 1');
        assert.strictEqual(symbols[1].kind, vscode.SymbolKind.String);
        assert.strictEqual(symbols[2].name, 'Subtitle 1.1');
        assert.strictEqual(symbols[2].kind, vscode.SymbolKind.String);
        assert.strictEqual(symbols[3].name, 'Subtitle 1.1.1');
        assert.strictEqual(symbols[3].kind, vscode.SymbolKind.String);
    });
});
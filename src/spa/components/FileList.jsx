import React, { useState, useCallback } from 'react';
import { sendMessage } from '../services/vscodeBridge';

function getSymbolLetter(kindName) {
  const map = {
    'Class': 'C', 'Interface': 'I', 'Method': 'M', 'Function': 'F',
    'Property': 'P', 'Field': 'F', 'Constructor': 'C', 'Enum': 'E',
    'Enum Member': 'e', 'Module': 'M', 'Namespace': 'N', 'Package': 'P',
    'Constant': 'K', 'Struct': 'S', 'Event': 'E', 'Type Parameter': 'T',
    'File': 'F', 'Operator': 'O',
    'Класс': 'C', 'Интерфейс': 'I', 'Метод': 'M', 'Функция': 'F',
    'Свойство': 'P', 'Поле': 'F', 'Конструктор': 'C', 'Перечисление': 'E',
    'Элемент перечисления': 'e', 'Модуль': 'M', 'Пространство имен': 'N',
    'Пакет': 'P', 'Константа': 'K', 'Структура': 'S', 'Событие': 'E',
    'Параметр типа': 'T', 'Оператор': 'O'
  };
  return map[kindName] || '?';
}

function getSymbolKindClass(kindName) {
  const map = {
    'Class': 'class', 'Interface': 'interface', 'Method': 'method', 'Function': 'function',
    'Property': 'property', 'Field': 'field', 'Constructor': 'constructor', 'Enum': 'enum',
    'Enum Member': 'enum-member', 'Module': 'module', 'Namespace': 'namespace', 'Package': 'package',
    'Constant': 'constant', 'Struct': 'struct', 'Event': 'event', 'Type Parameter': 'type-parameter',
    'File': 'file', 'Operator': 'operator',
    'Класс': 'class', 'Интерфейс': 'interface', 'Метод': 'method', 'Функция': 'function',
    'Свойство': 'property', 'Поле': 'field', 'Конструктор': 'constructor', 'Перечисление': 'enum',
    'Элемент перечисления': 'enum-member', 'Модуль': 'module', 'Пространство имен': 'namespace',
    'Пакет': 'package', 'Константа': 'constant', 'Структура': 'struct', 'Событие': 'event',
    'Параметр типа': 'type-parameter', 'Оператор': 'operator'
  };
  return map[kindName] || 'unknown';
}

function getGradientColor(percent) {
  percent = Math.max(0, Math.min(100, percent));
  const hue = 120 - (percent * 1.2);
  const sat = 40 + (percent * 0.6);
  const light = 80 - (percent * 0.3);
  return `hsl(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%)`;
}

function SymbolItem({ symbol, fileUri, states, fileCharCount, depth = 0 }) {
  const checked = states[symbol.id] !== false;
  const letter = getSymbolLetter(symbol.kindName);
  const kindClass = getSymbolKindClass(symbol.kindName);

  let percentHtml = null;
  if (fileCharCount > 0 && typeof symbol.charCount === 'number') {
    const percent = (symbol.charCount / fileCharCount) * 100;
    const color = getGradientColor(percent);
    percentHtml = (
      <span style={{ marginLeft: 'auto', paddingRight: '8px', fontWeight: 'bold', fontSize: '0.85em', color, flexShrink: 0 }}>
        {percent.toFixed(0)}%
      </span>
    );
  }

  return (
    <>
      <div className="symbol-item" style={{ paddingLeft: `${depth * 15}px` }}>
        <input
          type="checkbox"
          id={`sym-${symbol.id}`}
          checked={checked}
          onChange={() => sendMessage('toggleSymbol', { uri: fileUri, symbolId: symbol.id })}
        />
        <label htmlFor={`sym-${symbol.id}`}>
          <span className={`sym-badge sym-kind-${kindClass}`}>{letter}</span>
          <span className="sym-name">{symbol.name}</span>
          {symbol.detail && <span className="sym-detail">: {symbol.detail}</span>}
          {percentHtml}
        </label>
      </div>
      {symbol.children && symbol.children.length > 0 && (
        <div>
          {symbol.children.map(child => (
            <SymbolItem
              key={child.id}
              symbol={child}
              fileUri={fileUri}
              states={states}
              fileCharCount={fileCharCount}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function FileList({ files }) {
  const [expandedFiles, setExpandedFiles] = useState(new Set());

  const toggleFile = useCallback((uri) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(uri)) next.delete(uri);
      else next.add(uri);
      return next;
    });
  }, []);

  const removeFile = useCallback((uri) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.delete(uri);
      return next;
    });
    sendMessage('removeFile', { uri });
  }, []);

  const toggleAllSymbols = useCallback((file) => {
    let allUnchecked = true;
    const checkAllUnchecked = (symbols) => {
      for (const sym of symbols) {
        if (file.states[sym.id] !== false) {
          allUnchecked = false;
          return;
        }
        if (sym.children && sym.children.length > 0) {
          checkAllUnchecked(sym.children);
          if (!allUnchecked) return;
        }
      }
    };
    checkAllUnchecked(file.symbols || []);
    sendMessage('setAllSymbols', { uri: file.uri, checkAll: allUnchecked });
  }, []);

  if (!files || files.length === 0) {
    return <div className="file-list-empty">No files added yet</div>;
  }

  return (
    <div className="file-list">
      {files.map(file => {
        const isExpanded = expandedFiles.has(file.uri);
        return (
          <div key={file.uri} className={`file-item ${isExpanded ? 'expanded' : ''}`}>
            <div className="file-header" onClick={() => toggleFile(file.uri)}>
              <span className="file-name">📄 {file.name}</span>
              <div className="file-actions">
                <button
                  className="action-btn"
                  title="Toggle all symbols"
                  onClick={(e) => { e.stopPropagation(); toggleAllSymbols(file); }}
                >
                  ✔
                </button>
                <button
                  className="action-btn remove-btn"
                  onClick={(e) => { e.stopPropagation(); removeFile(file.uri); }}
                >
                  ✕
                </button>
              </div>
            </div>
            {isExpanded && (
              <div className="symbols-container">
                {file.symbols && file.symbols.map(symbol => (
                  <SymbolItem
                    key={symbol.id}
                    symbol={symbol}
                    fileUri={file.uri}
                    states={file.states || {}}
                    fileCharCount={file.charCount || 0}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
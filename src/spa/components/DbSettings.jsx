import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';

export function DbSettings() {
  const [aliases, setAliases] = useState([]);
  const [checkResult, setCheckResult] = useState(null);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'updateList') {
        setAliases(msg.aliases || []);
      } else if (msg.type === 'checkResult') {
        setCheckResult({ alias: msg.alias, success: msg.success, text: msg.text });
      }
    });

    sendMessage('requestList');

    return unsub;
  }, []);

  const handleAdd = () => sendMessage('addConnection');
  const handleEdit = (alias) => {
    setCheckResult(null);
    sendMessage('editConnection', { alias });
  };
  const handleDelete = (alias) => {
    setCheckResult(null);
    if (window.confirm(`Delete connection "${alias}"?`)) {
      sendMessage('deleteConnection', { alias });
    }
  };
  const handleCheck = (alias) => {
    setCheckResult({ alias, success: null, text: `Checking connection and fetching schema for [${alias}]...` });
    sendMessage('checkConnection', { alias });
  };

  return (
    <div className="module-container">
      <h3 className="module-title">Database Connections</h3>
      <p className="module-desc">Manage your database connection strings securely.</p>

      <div className="settings-section">
        <button className="vscode-button" onClick={handleAdd}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
          Add Connection
        </button>

        <div className="connections-list">
          {aliases.length === 0 ? (
            <p className="empty-state">No connections saved.</p>
          ) : (
            aliases.map(alias => (
              <div key={alias} className="conn-item">
                <div className="conn-item-name">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z"/></svg>
                  <span>{alias}</span>
                </div>
                <div className="conn-actions">
                  <button className="vscode-button secondary small" onClick={() => handleCheck(alias)}>Check</button>
                  <button className="vscode-button secondary small" onClick={() => handleEdit(alias)}>Edit</button>
                  <button className="vscode-button danger small" onClick={() => handleDelete(alias)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>

        {checkResult && (
          <div className={`check-result ${checkResult.success === true ? 'success' : checkResult.success === false ? 'error' : 'pending'}`}>
            <strong>[{checkResult.alias}]</strong>
            <pre>{checkResult.text}</pre>
          </div>
        )}
      </div>

      <div className="settings-section">
        <h4 className="section-title">Connection String Examples</h4>
        <div className="examples-block">
          <div><strong>PostgreSQL:</strong><br/>postgres://user:password@localhost:5432/mydb<br/>postgres://user:password@localhost:5432/mydb?schema=myschema</div>
          <div><strong>MySQL:</strong><br/>mysql://user:password@localhost:3306/mydb</div>
          <div><strong>SQLite:</strong><br/>sqlite:///C:/path/to/database.db<br/>or<br/>sqlite:///home/user/project/database.sqlite</div>
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';

export function DbSettings({ includeDb, aliases, selectedAliases, onChange }) {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (includeDb) {
      sendMessage('getDbAliases');
    }
  }, [includeDb]);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'dbStatus') setStatus(msg.text);
      if (msg.type === 'dbStructureReady') {
        setStatus('✅ DB structure fetched!');
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const toggleAlias = (alias) => {
    const next = new Set(selectedAliases);
    if (next.has(alias)) next.delete(alias);
    else next.add(alias);
    onChange('selectedAliases', next);
  };

  const fetchStructure = () => {
    if (selectedAliases.size === 0) {
      setStatus('Please select at least one connection.');
      return;
    }
    setStatus('Fetching...');
    setLoading(true);
    sendMessage('fetchDbStructure', { aliases: Array.from(selectedAliases) });
  };

  return (
    <div className={`tree-settings ${includeDb ? '' : 'hidden'}`}>
      <div className="db-conn-list">
        {!aliases || aliases.length === 0 ? (
          <div className="hint">No connections saved. Add them in Settings view.</div>
        ) : (
          aliases.map(alias => (
            <div key={alias} className="checkbox-container db-checkbox-item">
              <input
                type="checkbox"
                id={`db-${alias}`}
                checked={selectedAliases.has(alias)}
                onChange={() => toggleAlias(alias)}
              />
              <label htmlFor={`db-${alias}`}>{alias}</label>
            </div>
          ))
        )}
      </div>
      <button className="secondary-btn" onClick={fetchStructure} disabled={loading}>
        Get db structure
      </button>
      {status && <div className="hint status-msg">{status}</div>}
    </div>
  );
}
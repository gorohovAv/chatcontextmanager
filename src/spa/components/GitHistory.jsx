import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';

export function GitHistorySettings({ includeGitHistory, commitCount, loaded, onChange }) {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'gitStatus') setStatus(msg.text);
      if (msg.type === 'gitHistoryReady') {
        setStatus(`✅ Git history fetched! (${msg.commitCount} commits)`);
        setLoading(false);
        onChange('gitHistoryLoaded', true);
      }
      if (msg.type === 'gitError') {
        setStatus(`❌ Error: ${msg.error}`);
        setLoading(false);
        onChange('gitHistoryLoaded', false);
      }
    });
    return unsub;
  }, [onChange]);

  const handleCountChange = (e) => {
    const val = e.target.value.replace(/\D/g, '');
    onChange('commitCount', val);
    onChange('gitHistoryLoaded', false);
    setStatus('');
  };

  const fetchHistory = () => {
    const count = parseInt(commitCount) || 5;
    if (count <= 0) {
      setStatus('Please enter a valid number of commits.');
      return;
    }
    setStatus('Fetching...');
    setLoading(true);
    sendMessage('fetchGitHistory', { commitCount: String(count) });
  };

  return (
    <div className={`tree-settings ${includeGitHistory ? '' : 'hidden'}`}>
      <label className="field-label">Number of last commits:</label>
      <input
        type="text"
        value={commitCount}
        onChange={handleCountChange}
        className="num-input"
      />
      <button className="secondary-btn" onClick={fetchHistory} disabled={loading}>
        Get git history
      </button>
      {status && <div className="hint status-msg">{status}</div>}
    </div>
  );
}
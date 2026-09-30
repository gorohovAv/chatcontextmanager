import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';

export function FigmaSettings() {
  const [pat, setPat] = useState('');
  const [hasPat, setHasPat] = useState(false);
  const [links, setLinks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'patLoaded') {
        setPat(msg.pat || '');
        setHasPat(msg.hasPat);
      } else if (msg.type === 'patSaved') {
        setHasPat(true);
      } else if (msg.type === 'updateLinks') {
        setLinks(msg.links || []);
        setSelectedId(msg.selectedId || null);
      }
    });

    sendMessage('getPat');
    sendMessage('getLinks');

    return unsub;
  }, []);

  const handleSavePat = () => {
    sendMessage('savePat', { pat });
  };

  const handleAddLink = () => {
    if (!newUrl.trim()) return;
    sendMessage('addLink', { url: newUrl.trim(), name: newName.trim() });
    setNewUrl('');
    setNewName('');
  };

  const handleRemoveLink = (id, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to remove this link?')) {
      sendMessage('removeLink', { id });
    }
  };

  const handleSelectLink = (id) => {
    sendMessage('selectLink', { id });
  };

  return (
    <div className="module-container">
      <h3 className="module-title">Figma Integration</h3>
      <p className="module-desc">Manage your Personal Access Token and saved layout links.</p>

      <div className="settings-section">
        <h4 className="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          Personal Access Token (PAT)
        </h4>
        <p className="section-hint">Help and account -&gt; Account settings -&gt; Security</p>
        <div className="input-group">
          <input 
            type="password" 
            className="vscode-input" 
            value={pat} 
            onChange={(e) => setPat(e.target.value)} 
            placeholder="figd_..." 
          />
          <button className="vscode-button" onClick={handleSavePat}>
            {hasPat ? 'Update Token' : 'Save Token'}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h4 className="section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          Layout Links
        </h4>
        <div className="input-group">
          <input 
            type="text" 
            className="vscode-input" 
            value={newUrl} 
            onChange={(e) => setNewUrl(e.target.value)} 
            placeholder="https://www.figma.com/file/..." 
          />
          <input 
            type="text" 
            className="vscode-input" 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)} 
            placeholder="Link name (optional)" 
          />
          <button className="vscode-button" onClick={handleAddLink} disabled={!newUrl.trim()}>
            Add Link
          </button>
        </div>

        <div className="links-list">
          {links.length === 0 ? (
            <p className="empty-state">No links added yet.</p>
          ) : (
            links.map(link => (
              <div 
                key={link.id} 
                className={`link-card ${selectedId === link.id ? 'selected' : ''}`}
                onClick={() => handleSelectLink(link.id)}
              >
                <div className="link-info">
                  <div className="link-name">{link.name || 'Unnamed Link'}</div>
                  <div className="link-url">{link.url}</div>
                </div>
                <button 
                  className="vscode-button danger small" 
                  onClick={(e) => handleRemoveLink(link.id, e)}
                  title="Remove link"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            ))
          )}
        </div>
        <p className="section-hint warning">Note: Downloading and optimizing layouts is handled in the dedicated Figma view panel.</p>
      </div>
    </div>
  );
}
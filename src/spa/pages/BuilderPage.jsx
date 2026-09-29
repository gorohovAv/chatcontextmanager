import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { FileList } from '../components/FileList';
import { TreeSettings } from '../components/TreeSettings';
import { DbSettings } from '../components/DbSettings';
import { GitHistorySettings } from '../components/GitHistorySettings';
import { CheckboxToggle } from '../components/CheckboxToggle';
import '../assets/builder.css';

export function BuilderPage() {
  // Core state
  const [userText, setUserText] = useState('');
  const [currentMode, setCurrentMode] = useState('edit');
  const [files, setFiles] = useState([]);
  const [charCount, setCharCount] = useState(0);

  // Include toggles
  const [includeSystemPrompts, setIncludeSystemPrompts] = useState(true);
  const [includeTree, setIncludeTree] = useState(false);
  const [useGitignore, setUseGitignore] = useState(false);
  const [customIgnore, setCustomIgnore] = useState('');
  const [includeDb, setIncludeDb] = useState(false);
  const [dbAliases, setDbAliases] = useState([]);
  const [selectedDbAliases, setSelectedDbAliases] = useState(new Set());
  const [includeGitHistory, setIncludeGitHistory] = useState(false);
  const [gitCommitCount, setGitCommitCount] = useState('5');
  const [gitHistoryLoaded, setGitHistoryLoaded] = useState(false);

  const debounceTimer = useRef(null);

  // Debounced char count request
  const requestCharCount = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      sendMessage('requestCharCount', {
        userText,
        includeTree,
        useGitignore,
        customIgnore,
        includeDb,
        includeGitHistory: includeGitHistory && gitHistoryLoaded,
        gitCommitCount,
        includeSystemPrompts
      });
    }, 250);
  }, [userText, includeTree, useGitignore, customIgnore, includeDb, includeGitHistory, gitHistoryLoaded, gitCommitCount, includeSystemPrompts]);

  // Immediate char count for non-debounced triggers
  const requestCharCountNow = useCallback(() => {
    sendMessage('requestCharCount', {
      userText,
      includeTree,
      useGitignore,
      customIgnore,
      includeDb,
      includeGitHistory: includeGitHistory && gitHistoryLoaded,
      gitCommitCount,
      includeSystemPrompts
    });
  }, [userText, includeTree, useGitignore, customIgnore, includeDb, includeGitHistory, gitHistoryLoaded, gitCommitCount, includeSystemPrompts]);

  // Listen for messages from extension
  useEffect(() => {
    const unsub = onMessage((msg) => {
      switch (msg.type) {
        case 'updateFiles':
          setFiles(msg.files || []);
          requestCharCount();
          break;
        case 'updateCharCount':
          setCharCount(msg.charCount || 0);
          break;
        case 'dbAliases':
          setDbAliases(msg.aliases || []);
          break;
        case 'initState':
          if (msg.userText !== undefined) setUserText(msg.userText);
          if (msg.currentMode) setCurrentMode(msg.currentMode);
          if (msg.treeSettings) {
            setIncludeTree(!!msg.treeSettings.includeTree);
            setUseGitignore(!!msg.treeSettings.useGitignore);
            setCustomIgnore(msg.treeSettings.customIgnore || '');
          }
          break;
      }
    });
    return unsub;
  }, [requestCharCount]);

  // Initial load
  useEffect(() => {
    sendMessage('requestInit');
    requestCharCountNow();
  }, []);

  // Save tree settings debounced
  const saveTreeSettingsDebounced = useCallback(() => {
    sendMessage('saveTreeSettings', {
      includeTree,
      useGitignore,
      customIgnore
    });
  }, [includeTree, useGitignore, customIgnore]);

  useEffect(() => {
    saveTreeSettingsDebounced();
  }, [includeTree, useGitignore, customIgnore, saveTreeSettingsDebounced]);

  // Handlers
  const handleModeChange = (mode) => {
    setCurrentMode(mode);
    sendMessage('setMode', { mode });
    requestCharCountNow();
  };

  const handleUserTextInput = (e) => {
    setUserText(e.target.value);
    requestCharCount();
    sendMessage('saveUserText', { text: e.target.value });
  };

  const handleTreeChange = (field, value) => {
    if (field === 'useGitignore') setUseGitignore(value);
    else if (field === 'customIgnore') setCustomIgnore(value);
    requestCharCount();
  };

  const handleDbChange = (field, value) => {
    if (field === 'selectedAliases') setSelectedDbAliases(value);
  };

  const handleGitChange = (field, value) => {
    if (field === 'commitCount') setGitCommitCount(value);
    if (field === 'gitHistoryLoaded') setGitHistoryLoaded(value);
  };

  const handleClearForm = () => {
    setUserText('');
    setIncludeSystemPrompts(true);
    setIncludeTree(false);
    setUseGitignore(false);
    setCustomIgnore('');
    setIncludeDb(false);
    setSelectedDbAliases(new Set());
    setIncludeGitHistory(false);
    setGitCommitCount('5');
    setGitHistoryLoaded(false);
    sendMessage('clearForm');
    sendMessage('saveUserText', { text: '' });
    requestCharCountNow();
  };

  const handleCopy = () => {
    sendMessage('compileAndCopy', {
      text: userText,
      includeTree,
      useGitignore,
      customIgnore,
      includeDb,
      includeGitHistory: includeGitHistory && gitHistoryLoaded,
      gitCommitCount,
      includeSystemPrompts
    });
  };

  return (
    <div className="page builder-page">
      {/* Clear button */}
      <button className="secondary-btn clear-btn" onClick={handleClearForm}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
          <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
        </svg>
        Clear form
      </button>

      {/* Include system prompts toggle */}
      <CheckboxToggle
        id="includeSystemPrompts"
        label="Include System & Project Prompts"
        checked={includeSystemPrompts}
        onChange={(val) => { setIncludeSystemPrompts(val); requestCharCountNow(); }}
      />

      {/* Mode switcher */}
      <ModeSwitcher currentMode={currentMode} onChange={handleModeChange} />

      {/* User text area */}
      <textarea
        id="userText"
        className="main-textarea"
        placeholder="Enter your actual prompt here..."
        value={userText}
        onChange={handleUserTextInput}
      />

      {/* File injection buttons */}
      <div className="inject-buttons-row">
        <button className="secondary-btn inject-btn" onClick={() => sendMessage('addFile')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.5 2.5a.5.5 0 0 0-1 0v2h-2a.5.5 0 0 0 0 1h2v2a.5.5 0 0 0 1 0v-2h2a.5.5 0 0 0 0-1h-2v-2z"/>
            <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm10-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1z"/>
          </svg>
          Inject files
        </button>
        <button className="secondary-btn inject-btn" onClick={() => sendMessage('addFolder')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.81 4H2.19zm4.69-1.707A1 1 0 0 0 6.172 2H2.5a1 1 0 0 0-1 .981l.006.139C1.72 3.042 1.95 3 2.19 3h5.396l-.707-.707z"/>
          </svg>
          Inject folder
        </button>
      </div>

      {/* File list */}
      <FileList files={files} />

      {/* Tree section */}
      <CheckboxToggle
        id="includeTree"
        label="Tree (project structure)"
        checked={includeTree}
        onChange={(val) => { setIncludeTree(val); requestCharCountNow(); }}
      />
      <TreeSettings
        includeTree={includeTree}
        useGitignore={useGitignore}
        customIgnore={customIgnore}
        onChange={handleTreeChange}
      />

      {/* DB section */}
      <CheckboxToggle
        id="includeDb"
        label="DB structure"
        checked={includeDb}
        onChange={(val) => { setIncludeDb(val); requestCharCountNow(); }}
      />
      <DbSettings
        includeDb={includeDb}
        aliases={dbAliases}
        selectedAliases={selectedDbAliases}
        onChange={handleDbChange}
      />

      {/* Git history section */}
      <CheckboxToggle
        id="includeGitHistory"
        label="Git history"
        checked={includeGitHistory}
        onChange={(val) => { setIncludeGitHistory(val); requestCharCountNow(); }}
      />
      <GitHistorySettings
        includeGitHistory={includeGitHistory}
        commitCount={gitCommitCount}
        loaded={gitHistoryLoaded}
        onChange={handleGitChange}
      />

      {/* Copy button */}
      <button className="primary-btn copy-btn" onClick={handleCopy}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
          <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h5zM11 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/>
        </svg>
        Clipboard ({charCount.toLocaleString()} chars)
      </button>
    </div>
  );
}
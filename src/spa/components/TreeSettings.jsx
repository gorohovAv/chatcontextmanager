import React from 'react';

export function TreeSettings({ includeTree, useGitignore, customIgnore, onChange }) {
  return (
    <div className={`tree-settings ${includeTree ? '' : 'hidden'}`}>
      <div className="checkbox-container">
        <input
          type="checkbox"
          id="useGitignore"
          checked={useGitignore}
          onChange={(e) => onChange('useGitignore', e.target.checked)}
        />
        <label htmlFor="useGitignore">Use .gitignore</label>
      </div>
      <label className="field-label">Alternative ignore-file:</label>
      <div className="hint">.gitignore-like text. Not persisted.</div>
      <textarea
        id="customIgnore"
        className={`ignore-textarea ${useGitignore ? 'disabled' : ''}`}
        placeholder={"node_modules\ndist\n*.log\n.env"}
        value={customIgnore}
        disabled={useGitignore}
        onChange={(e) => onChange('customIgnore', e.target.value)}
      />
    </div>
  );
}
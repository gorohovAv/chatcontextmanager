import React from 'react';

export function ModeSwitcher({ currentMode, onChange }) {
  const modes = ['edit', 'ask', 'custom'];

  return (
    <div className="mode-switcher">
      {modes.map((mode) => (
        <button
          key={mode}
          className={`mode-btn ${currentMode === mode ? 'active' : ''}`}
          onClick={() => onChange(mode)}
        >
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );
}
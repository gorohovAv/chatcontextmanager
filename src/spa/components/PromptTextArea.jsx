import React, { useState } from 'react';
import { sendMessage } from '../services/vscodeBridge';

export function PromptTextArea({ label, id, value, placeholder, saveMessageType, onSave }) {
  const [localValue, setLocalValue] = useState(value || '');
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => {
    setLocalValue(e.target.value);
  };

  const handleSave = () => {
    sendMessage(saveMessageType, { prompt: localValue });
    if (onSave) onSave(localValue);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="prompt-field">
      <label className="field-label">{label}</label>
      <textarea
        id={id}
        className="small-textarea"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
      />
      <button className="secondary-btn save-prompt-btn" onClick={handleSave}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 2H9v3h2z"/>
          <path d="M1.5 0h11.586a1.5 1.5 0 0 1 1.06.44l1.415 1.414A1.5 1.5 0 0 1 16 2.914V14.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 14.5v-13A1.5 1.5 0 0 1 1.5 0M1 1.5v13a.5.5 0 0 0 .5.5H2v-4.5A1.5 1.5 0 0 1 3.5 9h9a1.5 1.5 0 0 1 1.5 1.5V15h.5a.5.5 0 0 0 .5-.5V2.914a.5.5 0 0 0-.146-.353l-1.415-1.415A.5.5 0 0 0 13.086 1H13v4.5A1.5 1.5 0 0 1 11.5 7h-7A1.5 1.5 0 0 1 3 5.5V1H1.5a.5.5 0 0 0-.5.5M3 2v3.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V2H3z"/>
        </svg>
        {saved ? 'Saved!' : `Save ${label.toLowerCase().replace('(edit)', '').replace('(ask)', '').replace('(custom)', '').trim() || 'prompt'}`}
      </button>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';
import { PromptTextArea } from './PromptTextArea';

export function PromptSettings() {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [askPrompt, setAskPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [projectPrompt, setProjectPrompt] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'initPrompts' || msg.type === 'updatePrompts') {
        setSystemPrompt(msg.systemPrompt ?? '');
        setAskPrompt(msg.askPrompt ?? '');
        setCustomPrompt(msg.customPrompt ?? '');
        setProjectPrompt(msg.projectPrompt ?? '');
        setIsLoaded(true);
      }
    });
    
    // Request initial prompts
    sendMessage('requestInitPrompts');
    
    return unsub;
  }, []);

  const handleSave = (field, value) => {
    switch (field) {
      case 'system':
        setSystemPrompt(value);
        break;
      case 'ask':
        setAskPrompt(value);
        break;
      case 'custom':
        setCustomPrompt(value);
        break;
      case 'project':
        setProjectPrompt(value);
        break;
    }
  };

  if (!isLoaded) {
    return <div className="loading-state">Loading prompt settings...</div>;
  }

  return (
    <div className="module-container">
      <h3 className="module-title">Prompt Configuration</h3>
      <p className="module-desc">
        Configure global and project-level prompts that are prepended to your generated output.
      </p>

      <div className="prompts-grid">
        <PromptTextArea
          label="Global prompt (Edit)"
          id="systemPrompt"
          value={systemPrompt}
          placeholder="Global prompt for Edit mode..."
          saveMessageType="saveSystemPrompt"
          onSave={(val) => handleSave('system', val)}
        />

        <PromptTextArea
          label="Global prompt (Ask)"
          id="askPrompt"
          value={askPrompt}
          placeholder="Global prompt for Ask mode..."
          saveMessageType="saveAskPrompt"
          onSave={(val) => handleSave('ask', val)}
        />

        <PromptTextArea
          label="Global prompt (Custom)"
          id="customPrompt"
          value={customPrompt}
          placeholder="Global prompt for Custom mode..."
          saveMessageType="saveCustomPrompt"
          onSave={(val) => handleSave('custom', val)}
        />

        <PromptTextArea
          label="Project prompt"
          id="projectPrompt"
          value={projectPrompt}
          placeholder="Local prompt for this particular project..."
          saveMessageType="saveProjectPrompt"
          onSave={(val) => handleSave('project', val)}
        />
      </div>
    </div>
  );
}
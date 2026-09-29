import React, { useState, useEffect } from 'react';
import { sendMessage, onMessage } from '../services/vscodeBridge';
import { PromptTextArea } from '../components/PromptTextArea';
import '../assets/settings.css';

export function SettingsPage() {
  const [systemPrompt, setSystemPrompt] = useState('');
  const [askPrompt, setAskPrompt] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [projectPrompt, setProjectPrompt] = useState('');

  // Load initial values from extension
  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'initPrompts') {
        setSystemPrompt(msg.systemPrompt || '');
        setAskPrompt(msg.askPrompt || '');
        setCustomPrompt(msg.customPrompt || '');
        setProjectPrompt(msg.projectPrompt || '');
      }
    });
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

  return (
    <div className="page settings-page">
      <h2 className="settings-title">Prompt Settings</h2>
      <p className="settings-desc">
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
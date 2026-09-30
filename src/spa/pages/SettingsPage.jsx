import React, { useState } from 'react';
import { PromptSettings } from '../components/PromptSettings';
import { FigmaSettings } from '../components/FigmaSettings';
import { DbSettings } from '../components/DbSettings';
import '../assets/settings.css';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('prompts');

  return (
    <div className="page settings-page">
      <div className="settings-header">
        <h2 className="settings-main-title">Extension Settings</h2>
        <p className="settings-main-desc">Configure your environment, integrations, and prompt behaviors.</p>
      </div>

      <div className="settings-nav">
        <button 
          className={`nav-card ${activeTab === 'prompts' ? 'active' : ''}`} 
          onClick={() => setActiveTab('prompts')}
        >
          <div className="nav-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <span className="nav-title">Prompt Settings</span>
          <span className="nav-desc">Configure global and project-level prompts</span>
        </button>

        <button 
          className={`nav-card ${activeTab === 'figma' ? 'active' : ''}`} 
          onClick={() => setActiveTab('figma')}
        >
          <div className="nav-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"/></svg>
          </div>
          <span className="nav-title">Figma Settings</span>
          <span className="nav-desc">Manage PAT and layout links</span>
        </button>

        <button 
          className={`nav-card ${activeTab === 'db' ? 'active' : ''}`} 
          onClick={() => setActiveTab('db')}
        >
          <div className="nav-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
          </div>
          <span className="nav-title">DB Connections</span>
          <span className="nav-desc">Configure database connection strings</span>
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'prompts' && <PromptSettings />}
        {activeTab === 'figma' && <FigmaSettings />}
        {activeTab === 'db' && <DbSettings />}
      </div>
    </div>
  );
}
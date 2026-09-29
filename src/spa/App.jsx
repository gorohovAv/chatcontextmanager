import React, { useState } from 'react';
import { BuilderPage } from './pages/BuilderPage';
import { SettingsPage } from './pages/SettingsPage';
import { TabBar } from './components/TabBar';

export function App() {
  const [page, setPage] = useState('builder');

  return (
    <div className="app">
      <TabBar activePage={page} onNavigate={setPage} />
      <main className="app-content">
        {page === 'builder' && <BuilderPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
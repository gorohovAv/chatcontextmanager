import React, { useState } from 'react';
import { BuilderPage } from './pages/BuilderPage';


export function App() {
  const [page, setPage] = useState('builder');

  return (
    <div className="app">
      <nav className="tab-bar">
        <button onClick={() => setPage('builder')} className={page === 'builder' ? 'active' : ''}>Builder</button>
      </nav>
      <main>
        {page === 'builder' && <BuilderPage />}
      </main>
    </div>
  );
}
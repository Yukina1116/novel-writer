import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <AppErrorBoundary>
            <App />
        </AppErrorBoundary>,
    );
}

/** @type {import('tailwindcss').Config} */
export default {
    content: [
        './index.html',
        './*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './hooks/**/*.{ts,tsx}',
        './store/**/*.{ts,tsx}',
        './utils/**/*.{ts,tsx}',
        './shared/**/*.{ts,tsx}',
        './db/**/*.{ts,tsx}',
        './firebase/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                'app-bg': 'var(--color-bg-app)',
                'panel-bg': 'var(--color-bg-panel)',
                'text-main': 'var(--color-text-main)',
                'text-muted': 'var(--color-text-muted)',
                'accent': 'var(--color-accent)',
                'border': 'var(--color-border)',
                'success': 'var(--color-success)',
                'warning': 'var(--color-warning)',
            },
        },
    },
    plugins: [],
};

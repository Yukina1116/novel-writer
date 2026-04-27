import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
    readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        }
    },
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
});

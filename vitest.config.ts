import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        include: ['**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**', 'dist-server/**', 'scripts/**'],
        // Firebase Admin SDK は単一プロセス内で複数 initializeApp が干渉するため、
        // テストごとに別 worker (forks) で隔離する。
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: false },
        },
    },
});

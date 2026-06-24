import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        globals: true,
        exclude: ['node_modules', 'dist', 'tests/**/*.integration.test.ts', '**/.claude/**'],
        env: {
            SESSION_SECRET: 'test-secret',
        },
    },
    resolve: {
        alias: {
            '@database': path.resolve(__dirname, './database'),
            '@shared': path.resolve(__dirname, './shared'),
            server: path.resolve(__dirname, './server'),
        },
    },
});

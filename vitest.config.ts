import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = {
    '@': path.resolve(__dirname, './client/src'),
    '@database': path.resolve(__dirname, './database'),
    '@shared': path.resolve(__dirname, './shared'),
    server: path.resolve(__dirname, './server'),
};

// Two unit projects (TST.CLIENT-ENV): server/pure-logic units stay in node so they run
// fast; component/hook tests run in jsdom. Integration tests keep their own config
// (vitest.integration.config.ts).
export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: 'node',
                    environment: 'node',
                    globals: true,
                    exclude: [
                        'node_modules',
                        'dist',
                        'tests/**/*.integration.test.ts',
                        '**/.claude/**',
                        'tests/client/components/**',
                        'tests/client/hooks/**',
                    ],
                    env: {
                        SESSION_SECRET: 'test-secret',
                    },
                },
                resolve: { alias },
            },
            {
                // Vitest's bundled rolldown-vite honors tsconfig's `jsx: "preserve"`, so the
                // automatic runtime must be set here for TSX test files to compile.
                oxc: { jsx: { runtime: 'automatic' } },
                test: {
                    name: 'jsdom',
                    environment: 'jsdom',
                    globals: true,
                    include: [
                        'tests/client/components/**/*.test.{ts,tsx}',
                        'tests/client/hooks/**/*.test.{ts,tsx}',
                    ],
                    setupFiles: ['tests/client/setup.ts'],
                },
                resolve: { alias },
            },
        ],
    },
});

import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

// Read .env.test at config evaluation time so Vitest can inject DATABASE_URL
// into every worker before any module (including server/storage.ts) is loaded.
// Falls back to process.env so CI (GitHub Actions) works without a .env.test file.
const env = config({ path: ".env.test", quiet: true });
const testDbUrl = env.parsed?.TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "";
const sessionSecret = env.parsed?.SESSION_SECRET ?? process.env.SESSION_SECRET ?? "test-secret";

if (!testDbUrl) {
    console.warn("[integration] WARNING: TEST_DATABASE_URL is not set — integration tests will fail.");
}

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["tests/**/*.integration.test.ts"],
        env: {
            DATABASE_URL: testDbUrl,
            TEST_DATABASE_URL: testDbUrl,
            SESSION_SECRET: sessionSecret,
        },
    },
    resolve: {
        alias: {
            "@database": path.resolve(__dirname, "./database"),
            "@shared": path.resolve(__dirname, "./shared"),
            server: path.resolve(__dirname, "./server"),
        },
    },
});

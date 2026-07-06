import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Auto-cleanup between tests (RTL also self-registers under globals; explicit keeps it visible).
afterEach(() => {
    cleanup();
});

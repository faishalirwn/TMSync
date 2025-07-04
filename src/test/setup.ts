import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import { chromeMock } from './mocks/chrome';

// Mock Chrome Extension APIs
Object.defineProperty(global, 'chrome', {
    value: chromeMock,
    writable: true
});

// Mock window.location
Object.defineProperty(window, 'location', {
    value: {
        href: 'https://example.com',
        pathname: '/test',
        search: '',
        hash: ''
    },
    writable: true
});

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn()
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn()
}));

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn(
    (cb) => setTimeout(cb, 0) as unknown as number
);
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));

// Mock fetch
global.fetch = vi.fn();

// Clear all mocks before each test
beforeEach(() => {
    vi.clearAllMocks();
});

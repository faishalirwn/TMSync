import { vi } from 'vitest';

// Mock Chrome Extension APIs
export const chromeMock = {
    runtime: {
        onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        },
        sendMessage: vi.fn().mockImplementation((message, callback) => {
            // Default mock response
            const response = { success: true, data: {} };
            if (callback) callback(response);
            return Promise.resolve(response);
        }),
        getURL: vi
            .fn()
            .mockImplementation((path) => `chrome-extension://test/${path}`),
        id: 'test-extension-id',
        lastError: null
    },
    tabs: {
        onRemoved: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        },
        onUpdated: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        },
        query: vi.fn().mockResolvedValue([
            {
                id: 1,
                url: 'https://example.com',
                title: 'Test Page',
                active: true
            }
        ]),
        create: vi.fn().mockResolvedValue({
            id: 2,
            url: 'https://example.com',
            title: 'New Tab'
        }),
        remove: vi.fn().mockResolvedValue(undefined)
    },
    storage: {
        local: {
            get: vi.fn().mockImplementation((keys) => {
                const result = Array.isArray(keys)
                    ? keys.reduce((acc, key) => ({ ...acc, [key]: null }), {})
                    : typeof keys === 'string'
                      ? { [keys]: null }
                      : {};
                return Promise.resolve(result);
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined)
        },
        sync: {
            get: vi.fn().mockImplementation((keys) => {
                const result = Array.isArray(keys)
                    ? keys.reduce((acc, key) => ({ ...acc, [key]: null }), {})
                    : typeof keys === 'string'
                      ? { [keys]: null }
                      : {};
                return Promise.resolve(result);
            }),
            set: vi.fn().mockResolvedValue(undefined),
            remove: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn().mockResolvedValue(undefined)
        }
    },
    action: {
        onClicked: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn(),
        setIcon: vi.fn(),
        setTitle: vi.fn()
    },
    alarms: {
        create: vi.fn(),
        clear: vi.fn(),
        clearAll: vi.fn(),
        get: vi.fn(),
        getAll: vi.fn(),
        onAlarm: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    },
    permissions: {
        request: vi.fn().mockResolvedValue(true),
        remove: vi.fn().mockResolvedValue(true),
        contains: vi.fn().mockResolvedValue(true)
    },
    webNavigation: {
        onCompleted: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        },
        onHistoryStateUpdated: {
            addListener: vi.fn(),
            removeListener: vi.fn()
        }
    },
    scripting: {
        executeScript: vi.fn().mockResolvedValue([{ result: {} }]),
        insertCSS: vi.fn().mockResolvedValue(undefined),
        removeCSS: vi.fn().mockResolvedValue(undefined)
    }
};

// Helper function to create mock message sender
export const createMockSender = (
    tabId: number = 1,
    url: string = 'https://example.com'
) => ({
    tab: {
        id: tabId,
        url,
        title: 'Test Page',
        active: true
    },
    frameId: 0,
    id: 'test-extension-id',
    url: 'chrome-extension://test/background.html'
});

// Helper function to mock sendMessage responses
export const mockSendMessageResponse = (action: string, response: any) => {
    chromeMock.runtime.sendMessage.mockImplementation((message, callback) => {
        if (message.action === action) {
            if (callback) callback(response);
            return Promise.resolve(response);
        }
        // Default response for other actions
        const defaultResponse = { success: true, data: {} };
        if (callback) callback(defaultResponse);
        return Promise.resolve(defaultResponse);
    });
};

// Helper function to simulate tab events
export const simulateTabEvent = (
    event: 'removed' | 'updated',
    tabId: number,
    changeInfo?: any
) => {
    const listeners =
        event === 'removed'
            ? chromeMock.tabs.onRemoved.addListener.mock.calls.flat()
            : chromeMock.tabs.onUpdated.addListener.mock.calls.flat();

    listeners.forEach((listener) => {
        if (typeof listener === 'function') {
            if (event === 'removed') {
                listener(tabId);
            } else {
                listener(tabId, changeInfo || {}, {
                    id: tabId,
                    url: 'https://example.com'
                });
            }
        }
    });
};

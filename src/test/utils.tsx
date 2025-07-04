import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { vi } from 'vitest';
import { chromeMock } from './mocks/chrome';

// Custom render function that includes providers
const customRender = (ui: React.ReactElement, options?: RenderOptions) => {
    return render(ui, {
        ...options
    });
};

// Mock site configuration factory
export const createMockSiteConfig = (overrides: any = {}) => ({
    name: 'Test Site',
    selectorType: 'css' as const,
    usesTmdbId: false,
    urlPatterns: {
        movie: /\/movie\/\d+/,
        show: /\/show\/\d+/
    },
    selectors: {
        movie: { title: '.movie-title', year: '.movie-year' },
        show: { title: '.show-title', year: '.show-year' }
    },
    isWatchPage: vi.fn().mockReturnValue(true),
    getMediaType: vi.fn().mockReturnValue('movie'),
    getTitle: vi.fn().mockResolvedValue('Test Movie'),
    getYear: vi.fn().mockResolvedValue('2023'),
    getTmdbId: vi.fn().mockReturnValue(null),
    getSeasonEpisodeObj: vi.fn().mockReturnValue(null),
    ...overrides
});

// Mock media info factory
export const createMockMediaInfo = (type: 'movie' | 'show' = 'movie') => {
    if (type === 'movie') {
        return {
            type: 'movie' as const,
            score: 85,
            movie: {
                title: 'Test Movie',
                year: 2023,
                ids: {
                    trakt: 123,
                    slug: 'test-movie',
                    imdb: 'tt1234567',
                    tmdb: 456
                }
            }
        };
    } else {
        return {
            type: 'show' as const,
            score: 90,
            show: {
                title: 'Test Show',
                year: 2023,
                ids: {
                    trakt: 789,
                    slug: 'test-show',
                    tvdb: 111,
                    imdb: 'tt7890123',
                    tmdb: 12
                }
            }
        };
    }
};

// Mock episode info factory
export const createMockEpisodeInfo = (
    season: number = 1,
    episode: number = 1
) => ({
    season,
    number: episode,
    title: `Episode ${episode}`,
    ids: {
        trakt: 999,
        imdb: 'tt9999999',
        tmdb: 888
    }
});

// Mock ratings factory
export const createMockRatings = () => ({
    show: {
        userRating: 8,
        ratedAt: '2023-01-01T00:00:00Z'
    },
    episode: {
        userRating: 7,
        ratedAt: '2023-01-01T00:00:00Z'
    }
});

// Mock Trakt comments factory
export const createMockComments = (count: number = 2) => {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        comment: `Test comment ${i + 1}`,
        spoiler: false,
        review: false,
        parent_id: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        replies: 0,
        likes: 0,
        user_stats: {
            rating: 8,
            plays: 1,
            watched: true
        },
        user: {
            username: 'testuser',
            private: false,
            name: 'Test User',
            vip: false,
            vip_ep: false,
            ids: {
                slug: 'testuser'
            }
        }
    }));
};

// Helper to wait for async operations
export const waitForAsync = () =>
    new Promise((resolve) => setTimeout(resolve, 0));

// Helper to create mock video element
export const createMockVideoElement = (overrides: any = {}) => {
    const mockVideo = {
        currentTime: 0,
        duration: 100,
        paused: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        play: vi.fn(),
        pause: vi.fn(),
        ...overrides
    };

    // Mock querySelector to return our mock video
    const originalQuerySelector = document.querySelector;
    document.querySelector = vi.fn().mockImplementation((selector) => {
        if (selector === 'video') {
            return mockVideo;
        }
        return originalQuerySelector.call(document, selector);
    });

    return mockVideo;
};

// Helper to simulate media lifecycle states
export const simulateMediaLifecycleState = (state: string, data?: any) => {
    const mockResponse = {
        success: true,
        data: {
            mediaInfo: createMockMediaInfo(),
            confidence: 'high',
            originalQuery: {
                type: 'movie',
                query: 'Test Movie',
                years: '2023'
            },
            watchStatus: { isInHistory: false },
            ratingInfo: null,
            progressInfo: null,
            ...data
        }
    };

    chromeMock.runtime.sendMessage.mockResolvedValue(mockResponse);
    return mockResponse;
};

export * from '@testing-library/react';
export { customRender as render };

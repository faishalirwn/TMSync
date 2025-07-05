import { ServiceType } from '../types/serviceTypes';

export interface ServicePreferences {
    [key: string]: boolean; // ServiceType -> enabled state
}

const STORAGE_KEY = 'servicePreferences';

/**
 * Get user preferences for service enablement
 * Default: all services enabled
 */
export async function getServicePreferences(): Promise<ServicePreferences> {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    return result[STORAGE_KEY] || {};
}

/**
 * Update preference for a specific service
 */
export async function setServiceEnabled(
    serviceType: ServiceType,
    enabled: boolean
): Promise<void> {
    const preferences = await getServicePreferences();
    preferences[serviceType] = enabled;
    await chrome.storage.sync.set({ [STORAGE_KEY]: preferences });
}

/**
 * Check if a service is enabled by user preference
 * Default: enabled if not explicitly disabled
 */
export async function isServiceEnabled(
    serviceType: ServiceType
): Promise<boolean> {
    const preferences = await getServicePreferences();
    return preferences[serviceType] !== false; // Default to enabled
}

/**
 * Check if user has disabled all services
 * Used to determine if content script should show minimal functionality
 */
export async function areAllServicesDisabled(
    availableServices: ServiceType[]
): Promise<boolean> {
    const preferences = await getServicePreferences();
    return availableServices.every(
        (serviceType) => preferences[serviceType] === false
    );
}

/**
 * Reset all service preferences to default (enabled)
 */
export async function resetServicePreferences(): Promise<void> {
    await chrome.storage.sync.remove(STORAGE_KEY);
}

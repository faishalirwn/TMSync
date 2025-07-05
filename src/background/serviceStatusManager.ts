/**
 * Service Status Manager - Background Script
 *
 * Manages real-time service status and broadcasts updates to content scripts
 */

import { ServiceType } from '../types/serviceTypes';
import {
    ServiceStatus,
    ServiceActivityState,
    MultiServiceStatus
} from '../types/serviceStatus';
import { serviceRegistry } from '../services/ServiceRegistry';

class ServiceStatusManager {
    private serviceStatuses: Map<ServiceType, ServiceStatus> = new Map();
    private listeners: Set<number> = new Set(); // Tab IDs listening for updates

    constructor() {
        // Don't initialize immediately - wait for services to be registered
        // We'll call this manually after services are initialized
    }

    /**
     * Initialize service statuses based on registered services
     */
    async initializeServiceStatuses(): Promise<void> {
        const services = serviceRegistry.getAllServices();

        for (const service of services) {
            const serviceType = service.getCapabilities().serviceType;
            const isAuthenticated = await service
                .isAuthenticated()
                .catch(() => false);

            this.serviceStatuses.set(serviceType, {
                serviceType,
                isAuthenticated,
                activityState: 'idle',
                isEnabled: true, // Default enabled, will be contextual later
                lastActivity: new Date().toISOString()
            });
        }

        this.broadcastStatusUpdate();
    }

    /**
     * Update service activity state
     */
    updateServiceActivity(
        serviceType: ServiceType,
        activityState: ServiceActivityState,
        errorMessage?: string
    ): void {
        const currentStatus = this.serviceStatuses.get(serviceType);
        if (!currentStatus) return;

        const updatedStatus: ServiceStatus = {
            ...currentStatus,
            activityState,
            errorMessage: activityState === 'error' ? errorMessage : undefined,
            lastActivity: new Date().toISOString()
        };

        this.serviceStatuses.set(serviceType, updatedStatus);
        this.broadcastStatusUpdate();
    }

    /**
     * Update service authentication status
     */
    async updateServiceAuthentication(serviceType: ServiceType): Promise<void> {
        const currentStatus = this.serviceStatuses.get(serviceType);
        if (!currentStatus) return;

        const service = serviceRegistry.getServiceByType(serviceType);
        if (!service) return;

        const isAuthenticated = await service
            .isAuthenticated()
            .catch(() => false);

        const updatedStatus: ServiceStatus = {
            ...currentStatus,
            isAuthenticated,
            lastActivity: new Date().toISOString()
        };

        this.serviceStatuses.set(serviceType, updatedStatus);
        this.broadcastStatusUpdate();
    }

    /**
     * Enable/disable service for current context
     */
    setServiceEnabled(serviceType: ServiceType, enabled: boolean): void {
        const currentStatus = this.serviceStatuses.get(serviceType);
        if (!currentStatus) return;

        const updatedStatus: ServiceStatus = {
            ...currentStatus,
            isEnabled: enabled,
            activityState: enabled ? 'idle' : 'disabled',
            lastActivity: new Date().toISOString()
        };

        this.serviceStatuses.set(serviceType, updatedStatus);
        this.broadcastStatusUpdate();
    }

    /**
     * Get current status for all services
     */
    getAllServiceStatuses(): ServiceStatus[] {
        return Array.from(this.serviceStatuses.values());
    }

    /**
     * Register a tab to receive status updates
     */
    addStatusListener(tabId: number): void {
        this.listeners.add(tabId);
    }

    /**
     * Unregister a tab from status updates
     */
    removeStatusListener(tabId: number): void {
        this.listeners.delete(tabId);
    }

    /**
     * Broadcast current status to all listening tabs
     */
    private broadcastStatusUpdate(): void {
        const statusUpdate: MultiServiceStatus = {
            services: this.getAllServiceStatuses(),
            timestamp: new Date().toISOString()
        };

        for (const tabId of this.listeners) {
            chrome.tabs
                .sendMessage(tabId, {
                    action: 'serviceStatusUpdate',
                    data: statusUpdate
                })
                .catch(() => {
                    // Tab probably closed, remove from listeners
                    this.listeners.delete(tabId);
                });
        }
    }

    /**
     * Refresh all service authentication statuses
     */
    async refreshAllServiceStatuses(): Promise<void> {
        const services = serviceRegistry.getAllServices();

        for (const service of services) {
            const serviceType = service.getCapabilities().serviceType;
            await this.updateServiceAuthentication(serviceType);
        }
    }
}

// Export singleton instance
export const serviceStatusManager = new ServiceStatusManager();

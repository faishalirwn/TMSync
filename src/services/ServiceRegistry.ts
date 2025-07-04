import {
    TrackerService,
    ServiceRegistry,
    ServiceConfig
} from '../types/services';
import { ServiceType, ServiceCapabilities } from '../types/serviceTypes';

/**
 * Implementation of ServiceRegistry that manages all tracking services
 */
export class DefaultServiceRegistry implements ServiceRegistry {
    private services = new Map<ServiceType, TrackerService>();
    private configs = new Map<ServiceType, ServiceConfig>();

    /**
     * Get all registered services
     */
    getAllServices(): TrackerService[] {
        return Array.from(this.services.values());
    }

    /**
     * Get all enabled services ordered by priority
     */
    getEnabledServices(): TrackerService[] {
        const enabledConfigs = Array.from(this.configs.entries())
            .filter(([, config]) => config.enabled)
            .sort(([, a], [, b]) => a.priority - b.priority);

        return enabledConfigs
            .map(([serviceType]) => this.services.get(serviceType))
            .filter(
                (service): service is TrackerService => service !== undefined
            );
    }

    /**
     * Get a specific service by type
     */
    getService(serviceType: ServiceType): TrackerService | null {
        return this.services.get(serviceType) || null;
    }

    /**
     * Register a new service
     */
    registerService(service: TrackerService, config: ServiceConfig): void {
        const serviceType = service.getCapabilities().serviceType;
        this.services.set(serviceType, service);
        this.configs.set(serviceType, config);
    }

    /**
     * Update service configuration
     */
    updateServiceConfig(
        serviceType: ServiceType,
        config: Partial<ServiceConfig>
    ): void {
        const existingConfig = this.configs.get(serviceType);
        if (existingConfig) {
            this.configs.set(serviceType, { ...existingConfig, ...config });
        }
    }

    /**
     * Get service configuration
     */
    getServiceConfig(serviceType: ServiceType): ServiceConfig | null {
        return this.configs.get(serviceType) || null;
    }

    /**
     * Check if a service is enabled
     */
    isServiceEnabled(serviceType: ServiceType): boolean {
        const config = this.configs.get(serviceType);
        return config?.enabled ?? false;
    }

    /**
     * Get the primary (highest priority) service
     */
    getPrimaryService(): TrackerService | null {
        const enabledServices = this.getEnabledServices();
        return enabledServices.length > 0 ? enabledServices[0] : null;
    }

    /**
     * Get services that support a specific capability
     */
    getServicesWithCapability(
        capability: keyof ServiceCapabilities
    ): TrackerService[] {
        return this.getEnabledServices().filter((service) => {
            const capabilities = service.getCapabilities();
            return capabilities[capability];
        });
    }
}

// Export singleton instance
export const serviceRegistry = new DefaultServiceRegistry();

import { serviceRegistry } from '../../services/ServiceRegistry';
import { filterEnabledAuthenticatedServices } from '../../utils/serviceFiltering';
import { TrackerService } from '../../types/services';
import { ServiceCapabilities } from '../../types/serviceTypes';

interface ServiceOperationResult {
    serviceType: string;
    success: boolean;
    error?: any;
}

/**
 * Generic helper to execute operations on multiple services in parallel
 * Eliminates duplication across rating, comment, and other multi-service handlers
 */
export async function executeOnServices<TParams>(
    capability: keyof Pick<
        ServiceCapabilities,
        | 'supportsRatings'
        | 'supportsComments'
        | 'supportsRealTimeScrobbling'
        | 'supportsProgressTracking'
    >,
    operation: (service: TrackerService, params: TParams) => Promise<void>,
    params: TParams,
    operationName: string
): Promise<ServiceOperationResult[]> {
    // Get and filter services with the required capability
    const allServices = serviceRegistry.getServicesWithCapability(capability);
    const enabledServices =
        await filterEnabledAuthenticatedServices(allServices);

    // Execute operation on all services in parallel
    const operationPromises = enabledServices.map(async (service) => {
        const serviceType = service.getCapabilities().serviceType;
        try {
            await operation(service, params);
            console.log(`✅ Successfully ${operationName} on ${serviceType}`);
            return { serviceType, success: true };
        } catch (error) {
            console.error(
                `❌ Failed to ${operationName} on ${serviceType}:`,
                error
            );
            return { serviceType, success: false, error };
        }
    });

    const results = await Promise.allSettled(operationPromises);
    return results.map((result) =>
        result.status === 'fulfilled'
            ? result.value
            : {
                  serviceType: 'unknown',
                  success: false,
                  error: result.reason
              }
    );
}

/**
 * Convenience wrapper specifically for rating operations
 */
export async function executeRatingOperation<TParams>(
    operation: (service: TrackerService, params: TParams) => Promise<void>,
    params: TParams,
    operationName: string
): Promise<ServiceOperationResult[]> {
    return executeOnServices(
        'supportsRatings',
        operation,
        params,
        operationName
    );
}

/**
 * Convenience wrapper specifically for comment operations
 */
export async function executeCommentOperation<TParams>(
    operation: (service: TrackerService, params: TParams) => Promise<void>,
    params: TParams,
    operationName: string
): Promise<ServiceOperationResult[]> {
    return executeOnServices(
        'supportsComments',
        operation,
        params,
        operationName
    );
}

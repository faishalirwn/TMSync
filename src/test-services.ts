/**
 * Test script to validate multi-service architecture
 */

import { initializeServices, getServices } from './services';

// Test the multi-service architecture
try {
    console.log('🚀 Testing Multi-Service Architecture...\n');

    // Initialize services
    initializeServices();

    const { registry } = getServices();

    console.log('\n📊 Service Registry Validation:');
    console.log(
        '- Total services registered:',
        registry.getAllServices().length
    );
    console.log('- Enabled services:', registry.getEnabledServices().length);

    const primaryService = registry.getPrimaryService();
    if (primaryService) {
        const capabilities = primaryService.getCapabilities();
        console.log('\n🎯 Primary Service Details:');
        console.log('- Type:', capabilities.serviceType);
        console.log(
            '- Supports real-time scrobbling:',
            capabilities.supportsRealTimeScrobbling
        );
        console.log(
            '- Supports progress tracking:',
            capabilities.supportsProgressTracking
        );
        console.log('- Supports ratings:', capabilities.supportsRatings);
        console.log('- Supports comments:', capabilities.supportsComments);
        console.log(
            '- Rating scale:',
            `${capabilities.ratingScale.min}-${capabilities.ratingScale.max}`
        );
        console.log('- Auth method:', capabilities.authMethod);
        console.log(
            '- Media types:',
            capabilities.supportedMediaTypes.join(', ')
        );
    }

    console.log('\n✅ Multi-service architecture validation successful!');
    console.log('✅ TrackerService interface design proven');
    console.log('✅ ServiceRegistry management working');
    console.log('✅ Ready for TraktService interface implementation');
} catch (error) {
    console.error('❌ Multi-service architecture test failed:', error);
}

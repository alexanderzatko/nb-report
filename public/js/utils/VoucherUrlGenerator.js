// utils/VoucherUrlGenerator.js

import StateManager from '../state/StateManager.js';
import StorageManager from '../storage/StorageManager.js';
import Logger from './Logger.js';

/**
 * Generates a dynamic voucher URL based on region ID and ski center ID
 * @returns {string} The generated voucher URL or fallback URL
 */
export function generateDefaultVoucherUrl() {
    const logger = Logger.getInstance();
    const stateManager = StateManager.getInstance();
    const currentUser = stateManager.getState('auth.user');
    const storageData = stateManager.getState('storage.userData');
    
    // Get ski center ID from current user
    const skiCenterId = currentUser?.ski_center_id;
    
    // Try to get region ID from various possible locations
    let regionId = null;
    
    // Check if region_id is in the current user data
    if (currentUser?.region_id) {
        regionId = currentUser.region_id;
    }
    // Check if region_id is in the selected ski center data
    else if (storageData?.ski_centers_data?.length > 0) {
        const selectedCenterId = skiCenterId || StorageManager.getInstance().getSelectedSkiCenter();
        const selectedCenter = storageData.ski_centers_data.find(center => 
            center[0][0] === String(selectedCenterId)
        );
        
        // Check if region_id is in the center data (could be center[3] or center[3][0] or a property)
        if (selectedCenter) {
            // Try different possible structures
            if (selectedCenter[3] !== undefined) {
                regionId = Array.isArray(selectedCenter[3]) ? selectedCenter[3][0] : selectedCenter[3];
            } else if (selectedCenter.region_id !== undefined) {
                regionId = selectedCenter.region_id;
            }
        }
    }
    
    // If we have both IDs, generate the dynamic URL
    if (regionId && skiCenterId) {
        return `https://mapa.nabezky.sk/sk?regionid=${regionId}&skicenterid=${skiCenterId}`;
    }
    
    // Fallback to base URL if region_id is missing
    if (!regionId && skiCenterId) {
        logger.warn('Region ID not available, using fallback URL. Please add region_id to the login payload.');
        return 'https://mapa.nabezky.sk';
    }
    
    // Final fallback
    return 'https://mapa.nabezky.sk';
}

/**
 * Gets the voucher URL from storage or generates a default one
 * @returns {string} The voucher URL to use
 */
export function getVoucherUrl() {
    const storageManager = StorageManager.getInstance();
    const savedUrl = storageManager.getLocalStorage('voucherUrl');
    return savedUrl || generateDefaultVoucherUrl();
}

/**
 * Appends a voucher number to a URL, properly handling existing query parameters
 * @param {string} baseUrl - The base URL (may already contain query parameters)
 * @param {string} voucherNumber - The voucher number to append
 * @returns {string} The complete URL with voucher parameter
 */
export function appendVoucherToUrl(baseUrl, voucherNumber) {
    if (!baseUrl || !voucherNumber) {
        return baseUrl || '';
    }
    
    // Check if URL already contains query parameters
    const hasQueryParams = baseUrl.includes('?');
    const separator = hasQueryParams ? '&' : '?';
    
    return `${baseUrl}${separator}voucher=${voucherNumber}`;
}


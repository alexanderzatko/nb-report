// managers/SettingsManager.js

import Logger from '../utils/Logger.js';
import AuthManager from '../auth/AuthManager.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import StateManager from '../state/StateManager.js';
import StorageManager from '../storage/StorageManager.js';
    
class SettingsManager {
    static instance = null;

    constructor() {
        if (SettingsManager.instance) {
            return SettingsManager.instance;
        }
        
        this.logger = Logger.getInstance();
        this.i18next = i18next;
        this.initialized = false;
        
        // Set up event listener for settings navigation
        window.addEventListener('showSettings', () => this.show());
        
        SettingsManager.instance = this;
    }

    static getInstance() {
        if (!SettingsManager.instance) {
            SettingsManager.instance = new SettingsManager();
        }
        return SettingsManager.instance;
    }

    async initialize() {
        if (this.initialized) {
            this.logger.debug('Settings already initialized');
            return;
        }
        
        this.logger.debug('Settings just initializing');

        try {
            // Wait for i18next to be ready if it's not already
            if (!this.i18next.isInitialized) {
                await new Promise(resolve => {
                    this.i18next.on('initialized', resolve);
                });
            }

            const settingsContainer = document.getElementById('settings-container');
            if (!settingsContainer) {
                throw new Error('Settings container not found');
            }

            // Add event listeners for settings controls
            this.setupEventListeners();
            await this.updateSkiCentersSection();
            
            this.initialized = true;
            this.logger.debug('Settings manager initialized');

        } catch (error) {
            this.logger.error('Failed to initialize settings manager:', error);
            throw error;
        }
    }

    async updateSkiCentersSection() {
        this.logger.debug('updateSkiCentersSection called');

        const settingsContainer = document.getElementById('settings-container');
        if (!settingsContainer) {
            this.logger.error('Settings container not found');
            return;
        }

        const stateManager = StateManager.getInstance();
        const storageData = stateManager.getState('storage.userData');
        const currentUser = stateManager.getState('auth.user');
        const storageManager = StorageManager.getInstance();

        if (storageData?.ski_centers_data?.length > 0) {
            const savedCenterId = storageManager.getSelectedSkiCenter();
            if (!savedCenterId) {
                const firstCenter = storageData.ski_centers_data[0];
                await stateManager.switchSkiCenter(firstCenter[0]);
            } else {
                await stateManager.switchSkiCenter(savedCenterId);
            }
        }

        this.logger.debug('Settings data check:', {
            storageData,
            currentUser,
            isAdmin: currentUser?.ski_center_admin === "1",
            hasCenters: storageData?.ski_centers_data?.length > 1,
            settingsContentExists: !!settingsContainer.querySelector('.settings-content')
        });

        // Remove existing ski centers section if it exists
        const existingSection = settingsContainer.querySelector('.ski-centers-section');
        if (existingSection) {
            this.logger.debug('Removing existing ski centers section');
            existingSection.remove();
        }

        // Check if user is admin and has multiple ski centers
        if (currentUser?.ski_center_admin === "1" && storageData?.ski_centers_data?.length > 1) {
            this.logger.debug('Creating ski centers section with centers:', storageData.ski_centers_data);

            const settingsContent = settingsContainer.querySelector('.settings-content');
            if (!settingsContent) {
                this.logger.error('Settings content container not found');
                return;
            }

            const skiCenterSection = document.createElement('div');
            skiCenterSection.className = 'settings-section ski-centers-section';
            
            const title = document.createElement('h3');
            title.textContent = this.i18next.t('settings.skiCenters.title');
            skiCenterSection.appendChild(title);

            const centersList = document.createElement('div');
            centersList.className = 'ski-centers-list';

            // Current ski center ID from the simplified user data
            const currentSkiCenterId = currentUser.ski_center_id;
            this.logger.debug('Current ski center ID:', currentSkiCenterId);

            storageData.ski_centers_data.forEach(center => {
                const centerId = center[0][0];      // Extract ID from nested array
                const centerName = center[1][0];    // Extract name from nested array
                
                const centerItem = document.createElement('div');
                centerItem.className = 'ski-center-item';
                if (centerId === currentSkiCenterId) {
                    centerItem.classList.add('active');
                }

                const radioInput = document.createElement('input');
                radioInput.type = 'radio';
                radioInput.name = 'ski-center';
                radioInput.value = centerId;
                radioInput.id = `ski-center-${centerId}`;
                radioInput.checked = centerId === currentSkiCenterId;

                const label = document.createElement('label');
                label.htmlFor = `ski-center-${centerId}`;
                label.textContent = centerName;

                centerItem.appendChild(radioInput);
                centerItem.appendChild(label);

                centerItem.addEventListener('click', async () => {
                    if (centerId !== currentSkiCenterId) {
                        const success = await stateManager.switchSkiCenter(centerId);
                        if (success) {
                            document.querySelectorAll('.ski-center-item').forEach(item => {
                                item.classList.remove('active');
                            });
                            centerItem.classList.add('active');
                        }
                    }
                });

                centersList.appendChild(centerItem);
            });

            skiCenterSection.appendChild(centersList);
            settingsContent.insertBefore(skiCenterSection, settingsContent.firstChild);
            this.logger.debug('Ski centers section created and inserted');
        } else {
            this.logger.debug('Not creating ski centers section - user is not admin or has 1 or fewer centers');
        }
    }

    setupEventListeners() {
        // Attach logout button handler
        const logoutButton = document.getElementById('logout-button');
        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                try {
                    const authManager = AuthManager.getInstance();
                    await authManager.logout();
                } catch (error) {
                    this.logger.error('Logout failed:', error);
                }
            });
        }

        // Attach dashboard return button handler
        const dashboardButton = document.getElementById('dashboard-button');
        if (dashboardButton) {
            dashboardButton.addEventListener('click', () => {
                window.dispatchEvent(new Event('showDashboard'));
            });
        }
    }

    show() {
        this.logger.debug('Showing settings view');
        
        // Hide other containers
        const containers = ['dashboard-container', 'snow-report-form'];
        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) container.style.display = 'none';
        });

        // Show settings container
        const settingsContainer = document.getElementById('settings-container');
        if (settingsContainer) {
            settingsContainer.style.display = 'block';
        }
    }

    reset() {
        this.logger.debug('Resetting settings manager');
        
        const settingsContainer = document.getElementById('settings-container');
        if (settingsContainer) {
            settingsContainer.style.display = 'none';
        }
    }
}

export default SettingsManager;

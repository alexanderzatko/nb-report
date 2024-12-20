// managers/SettingsManager.js

import Logger from '../utils/Logger.js';
import AuthManager from '../auth/AuthManager.js';

class SettingsManager {
  static instance = null;

  constructor() {
    if (SettingsManager.instance) {
      return SettingsManager.instance;
    }
    
    this.logger = Logger.getInstance();
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
    if (this.initialized) return;
    
    try {
          const settingsContainer = document.getElementById('settings-container');
          if (!settingsContainer) {
              this.logger.error('Settings container not found');
              return;
          }

          // Add event listeners for settings controls
          this.setupEventListeners();
          
          // Subscribe to userData changes
          const stateManager = StateManager.getInstance();
          stateManager.subscribe('auth.user', (userData) => {
              this.logger.debug('User data updated in Settings:', userData);
              this.updateSkiCentersSection(userData);
          });

          // Initial setup with current data
          const currentUser = stateManager.getState('auth.user');
          if (currentUser) {
              this.updateSkiCentersSection(currentUser);
          }
          
          this.initialized = true;
          this.logger.debug('Settings manager initialized');

        } catch (error) {
      this.logger.error('Failed to initialize settings manager:', error);
      throw error;
    }
  }

  async updateSkiCentersSection(userData) {

      this.logger.debug('updateSkiCentersSection called with userData:', userData);
    
      const settingsContainer = document.getElementById('settings-container');
      if (!settingsContainer) return;

      const stateManager = StateManager.getInstance();
      const storageData = stateManager.getState('storage.userData');
      
      this.logger.debug('Settings data check:', {
          userData,
          storageData,
          isAdmin: userData?.ski_center_admin === "1",
          hasCenters: userData?.ski_centers_data?.length > 1,
          settingsContentExists: !!settingsContainer.querySelector('.settings-content')
      });

      // Remove existing ski centers section if it exists
      const existingSection = settingsContainer.querySelector('.ski-centers-section');
      if (existingSection) {
          this.logger.debug('Removing existing ski centers section');
          existingSection.remove();
      }

      // Check if user is admin and has multiple ski centers
      if (userData?.ski_center_admin === "1" && storageData?.ski_centers_data?.length > 1) {
          this.logger.debug('Creating ski centers section');

          const settingsContent = settingsContainer.querySelector('.settings-content');
          if (!settingsContent) return;
          this.logger.error('Settings content container not found');

          const skiCenterSection = document.createElement('div');
          skiCenterSection.className = 'settings-section ski-centers-section';
          
          const title = document.createElement('h3');
          title.textContent = this.i18next.t('settings.skiCenters.title', 'Manage Ski Centers');
          skiCenterSection.appendChild(title);

          const centersList = document.createElement('div');
          centersList.className = 'ski-centers-list';

          const currentSkiCenterId = userData.ski_center_id;

          storageData.ski_centers_data.forEach(([centerId, centerName]) => {
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

  async initializeSkiCentersSection() {
      const stateManager = StateManager.getInstance();
      const userData = stateManager.getState('storage.userData');

      this.logger.debug('user data is: ',userData);

      if (userData?.ski_center_admin === "1" && userData.ski_centers_data?.length > 1) {
          const container = document.createElement('div');
          container.className = 'settings-section';
          
          const title = document.createElement('h3');
          title.textContent = this.i18next.t('settings.skiCenters.title');
          container.appendChild(title);
  
          const skiCentersList = document.createElement('div');
          skiCentersList.className = 'ski-centers-list';
          
          userData.ski_centers_data.forEach(center => {
              const centerItem = this.createSkiCenterItem(center);
              skiCentersList.appendChild(centerItem);
          });
          
          container.appendChild(skiCentersList);
          document.querySelector('.settings-content').appendChild(container);
      }
  }
}

export default SettingsManager;

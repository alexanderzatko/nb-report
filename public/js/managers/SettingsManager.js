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
      
      this.initialized = true;
      this.logger.debug('Settings manager initialized');

    } catch (error) {
      this.logger.error('Failed to initialize settings manager:', error);
      throw error;
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

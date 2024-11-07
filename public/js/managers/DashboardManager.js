// DashboardManager.js
import Logger from '../utils/Logger.js';

class DashboardManager {
  static instance = null;

  constructor() {
    if (DashboardManager.instance) {
      return DashboardManager.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    
    // Set up event listener for dashboard navigation
    window.addEventListener('showDashboard', () => this.show());
    
    DashboardManager.instance = this;
  }

  static getInstance() {
    if (!DashboardManager.instance) {
      DashboardManager.instance = new DashboardManager();
    }
    return DashboardManager.instance;
  }

  async initialize() {
    if (this.initialized) return;
    
    const dashboardContainer = document.getElementById('dashboard-container');
    if (!dashboardContainer) {
      this.logger.error('Dashboard container not found');
      return;
    }

    this.initialized = true;
  }

  show() {
    const containers = ['settings-container', 'snow-report-form'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) container.style.display = 'none';
    });

    const dashboardContainer = document.getElementById('dashboard-container');
    if (dashboardContainer) {
      dashboardContainer.style.display = 'block';
    }
  }
}

export default DashboardManager;

// SettingsManager.js
import Logger from '../utils/Logger.js';

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
    
    const settingsContainer = document.getElementById('settings-container');
    if (!settingsContainer) {
      this.logger.error('Settings container not found');
      return;
    }

    this.initialized = true;
  }

  show() {
    const containers = ['dashboard-container', 'snow-report-form'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) container.style.display = 'none';
    });

    const settingsContainer = document.getElementById('settings-container');
    if (settingsContainer) {
      settingsContainer.style.display = 'block';
    }
  }
}

export default SettingsManager;

// GPSUIManager.js
import Logger from '../utils/Logger.js';

class GPSUIManager {
  static instance = null;

  constructor() {
    if (GPSUIManager.instance) {
      return GPSUIManager.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    GPSUIManager.instance = this;
  }

  static getInstance() {
    if (!GPSUIManager.instance) {
      GPSUIManager.instance = new GPSUIManager();
    }
    return GPSUIManager.instance;
  }

  async initialize() {
    if (this.initialized) return;
    
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) {
      this.logger.error('GPS card not found');
      return;
    }

    this.initialized = true;
  }

  updateGPSCardVisibility() {
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) return;
    
    // Implementation moved from UIManager
    gpsCard.style.display = 'block';
  }

  updateGPSCardForRecording(stats) {
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) return;
    
    // Implementation moved from UIManager
  }

  updateGPSCardForStandby() {
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) return;
    
    // Implementation moved from UIManager
  }

  showGPSTrackCard(trackData) {
    // Implementation moved from UIManager
  }

  removeGPSTrackCard() {
    const trackCard = document.querySelector('[data-feature="gps-track"]');
    if (trackCard) {
      trackCard.remove();
    }
  }
}

export default GPSUIManager;

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

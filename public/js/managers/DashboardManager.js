// DashboardManager.js
import Logger from '../utils/Logger.js';
import DatabaseManager from '../managers/DatabaseManager.js';

class DashboardManager {
  static instance = null;

  constructor() {
    if (DashboardManager.instance) {
      return DashboardManager.instance;
    }
    
    this.logger = Logger.getInstance();
    this.dbManager = DatabaseManager.getInstance();
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

    await this.updateDashboardCards();
    this.initialized = true;
  }

  async updateDashboardCards() {
    const dashboardGrid = document.querySelector('.dashboard-grid');
    console.log('Looking for dashboard grid:', !!dashboardGrid);
    if (!dashboardGrid) {
      console.error('Dashboard grid not found');
      this.logger.error('Dashboard grid not found');
      return;
    }

    try {
      // Check for draft form
      const db = await this.dbManager.getDatabase();
      const forms = await new Promise((resolve, reject) => {
        const transaction = db.transaction(['formData'], 'readonly');
        const store = transaction.objectStore('formData');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const draftForm = forms.find(form => !form.submitted);
      console.log('Draft form found:', draftForm); // Add this

      this.logger.debug('draft exists? ',draftForm);

      // Get or create cards
      let continueCard = document.getElementById('snow-report-link');
      let newReportCard = document.getElementById('new-report-link');

      if (draftForm) {
          // Show both cards when there's a draft
          if (newReportCard) {
              newReportCard.style.display = 'block';
          }
          if (continueCard) {
              continueCard.style.display = 'block';
          }
      } else {
          // Only show one card when no draft
          if (newReportCard) {
              newReportCard.style.display = 'none';
          }
          if (continueCard) {
              continueCard.style.display = 'block';
          }
      }

      // Update translations
      if (window.i18next?.isInitialized) {
        document.querySelectorAll('[data-i18n]').forEach(element => {
          const key = element.getAttribute('data-i18n');
          element.textContent = window.i18next.t(key);
        });
      }
    } catch (error) {
      this.logger.error('Error updating dashboard cards:', error);
    }
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

    // Update cards when showing dashboard
    this.updateDashboardCards();
  }
}

export default DashboardManager;

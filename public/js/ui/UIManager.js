// ui/UIManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import FormManager from '../form/FormManager.js';
import GPSManager from '../managers/GPSManager.js';
import SelectManager from '../managers/SelectManager.js';
import Logger from '../utils/Logger.js';

class UIManager {
  static instance = null;

  constructor() {
    if (UIManager.instance) {
      return UIManager.instance;
    }
    this.i18next = i18next;
    this.logger = Logger.getInstance();
    this.formManager = null;
    this.selectManager = null;
    
    UIManager.instance = this;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Wait for i18next to be ready
      if (!this.i18next.isInitialized) {
        this.logger.debug('Waiting for i18next to initialize...');
        await new Promise((resolve) => {
          this.i18next.on('initialized', resolve);
        });
      }

      // Initialize form managers first
      await this.initializeFormManagers();
      
      // Then set up event listeners and update page content
      this.setupEventListeners();
      this.updatePageContent();
      
      this.initialized = true;
    } catch (error) {
      this.logger.error('Error initializing UIManager:', error);
      throw error;
    }
  }
  
  async initializeFormManagers() {
    this.logger.debug('Initializing form managers...');
    try {
      this.selectManager = SelectManager.getInstance();
      this.formManager = FormManager.getInstance();
      
      // Initialize both managers
      await Promise.all([
        this.selectManager.initialize(),
        this.formManager.initialize()
      ]);
      
      this.logger.debug('Form managers initialized successfully');
    } catch (error) {
      this.logger.error('Error initializing form managers:', error);
      throw error;
    }
  }
    
  static getInstance() {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  setupEventListeners() {
      // Remove any existing listeners first
      this.removeExistingListeners();
  
      // Add login container click handler
      const loginContainer = document.getElementById('login-container');
      if (loginContainer) {
          loginContainer.addEventListener('click', (e) => {
              e.preventDefault();
              this.handleLoginClick(e);
          });
      }
  
      const snowReportLink = document.getElementById('snow-report-link');
      if (snowReportLink) {
          snowReportLink.addEventListener('click', (e) => {
              e.preventDefault();
              this.showSnowReportForm();
          });
      }
  
      // Add settings link handler
      const settingsLink = document.getElementById('settings-link');
      if (settingsLink) {
          settingsLink.addEventListener('click', (e) => {
              e.preventDefault();
              this.showSettings();
          });
      }
  
      // Add dashboard button handler
      const dashboardButton = document.getElementById('dashboard-button');
      if (dashboardButton) {
          dashboardButton.addEventListener('click', () => {
              this.showDashboard();
          });
      }
  
      const logoutButton = document.getElementById('logout-button');
      if (logoutButton) {
          logoutButton.addEventListener('click', this.handleLogoutClick.bind(this));
      }

      const gpsCard = document.querySelector('[data-feature="gps-recording"]');
      if (gpsCard) {
          gpsCard.addEventListener('click', async (e) => {
              e.preventDefault();
              const gpsManager = GPSManager.getInstance();
              
              if (gpsManager.isRecording) {
                  try {
                      const track = await gpsManager.stopRecording();
                      if (track) {
                          await new Promise(resolve => setTimeout(resolve, 100));
                          this.showGPSTrackCard();
                          this.updateGPSCardForStandby(gpsCard);
                      }
                  } catch (error) {
                      this.logger.error('Error stopping GPS recording:', error);
                      this.updateGPSCardForStandby(gpsCard);
                  }
              } else {
                  if (gpsManager.hasExistingTrack()) {
                      const confirm = window.confirm(
                          this.i18next.t('dashboard.confirmOverwriteTrack')
                      );
                      if (!confirm) return;
                      gpsManager.clearTrack();
                      this.removeGPSTrackCard();
                  }
                  
                  const started = await gpsManager.startRecording();
                  if (started) {
                      this.updateGPSCardForRecording(gpsCard);
                  }
              }
          });
      }

      // Listen for GPS updates
      window.addEventListener('gps-update', () => {
        const gpsCard = document.querySelector('[data-feature="gps-recording"]');
        if (gpsCard) {
          this.updateGPSCardForRecording(gpsCard);
        }
      });

      window.addEventListener('languageChanged', () => this.updatePageContent());
  }

  removeExistingListeners() {
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      const newContainer = loginContainer.cloneNode(true);
      loginContainer.parentNode.replaceChild(newContainer, loginContainer);
    }

    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      const newButton = logoutButton.cloneNode(true);
      logoutButton.parentNode.replaceChild(newButton, logoutButton);
    }
  }

  async handleLoginClick(event) {
      event.preventDefault();
      
      // Prevent multiple rapid clicks
      if (this.loginInProgress) {
          console.log('Login already in progress');
          return;
      }
  
      // Clear any existing timeout
      if (this.loginClickTimeout) {
          clearTimeout(this.loginClickTimeout);
      }
  
      this.loginInProgress = true;
  
      try {
          console.log('Login container clicked');
          const authManager = AuthManager.getInstance();
          console.log('Initiating OAuth...');
          
          const initiated = await authManager.initiateOAuth();
          
          if (!initiated) {
              console.error('Failed to initiate OAuth');
              this.showError(this.i18next.t('auth.loginError', {
                  defaultValue: 'Unable to connect to login service. Please try again later.'
              }));
          }
      } catch (error) {
          // Handle only unexpected errors
          if (!(error instanceof TypeError) || !error.message.includes('NetworkError')) {
              console.error('Failed to initiate login:', error);
              this.showError(this.i18next.t('auth.loginError', {
                  defaultValue: 'Unable to connect to login service. Please try again later.'
              }));
          }
      } finally {
          // Reset login state after a delay
          this.loginClickTimeout = setTimeout(() => {
              this.loginInProgress = false;
          }, 2000); // 2 second cooldown
      }
  }

  async handleLogoutClick() {
    try {
      const authManager = AuthManager.getInstance();
      const success = await authManager.logout();
      if (success) {
        // Clear any stored session data
        localStorage.removeItem('sessionId');
        // Update UI to show login screen
        this.updateUIBasedOnAuthState(false);
        // Reset login progress state
        this.loginInProgress = false;
        if (this.loginClickTimeout) {
          clearTimeout(this.loginClickTimeout);
        }
      } else {
        console.error('Logout failed');
        this.showError(this.i18next.t('auth.logoutError', {
          defaultValue: 'Unable to log out. Please try again.'
        }));
      }
    } catch (error) {
      console.error('Error during logout:', error);
      this.showError(this.i18next.t('auth.logoutError', {
        defaultValue: 'Unable to log out. Please try again.'
      }));
    }
  }
  
  updateUIBasedOnAuthState(isAuthenticated) {
    this.logger.debug('Updating UI based on auth state:', isAuthenticated);
    
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const settingsContainer = document.getElementById('settings-container');
    const snowReportForm = document.getElementById('snow-report-form');

    if (isAuthenticated) {
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';

      // Ensure SelectManager is initialized after authentication
      if (this.selectManager) {
        this.selectManager.refreshAllDropdowns().catch(error => {
          this.logger.error('Error refreshing dropdowns:', error);
        });
      }
    } else {
      if (loginContainer) {
        loginContainer.style.display = 'flex';
        this.updateLoginText();
      }
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
    }
  }

  updateElementTranslation(element, translation) {
    if (typeof translation === 'object') {
      if (element.tagName.toLowerCase() === 'select') {
        element.innerHTML = '';
        Object.entries(translation).forEach(([value, text]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          element.appendChild(option);
        });
      }
    } else {
      if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
        element.value = translation;
      } else {
        element.innerHTML = translation;
      }
    }
  }

  updateLoginText() {
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.innerHTML = this.i18next.t('auth.loginText', { 
        interpolation: { escapeValue: false } 
      });
    }
  }

  showLoginPrompt() {
    // Hide other containers
    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');
    if (dashboardContainer) {
      dashboardContainer.style.display = 'none';
    }
    if (snowReportForm) {
      snowReportForm.style.display = 'none';
    }

    // Show login container
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      loginContainer.classList.add('visible');
      loginContainer.style.display = 'flex';
    }

    // Optionally show a message to the user
    const loginText = document.getElementById('login-text');
    if (loginText) {
      loginText.innerHTML = this.i18next.t('auth.loginRequired', {
        defaultValue: 'Please log in to continue',
        interpolation: { escapeValue: false }
      });
    }
  }
  
  async showSnowReportForm() {
    if (!this.formManager) {
      this.logger.error('FormManager not initialized');
      return;
    }
  
    try {
      const dashboardContainer = document.getElementById('dashboard-container');
      const snowReportForm = document.getElementById('snow-report-form');
      
      if (!dashboardContainer || !snowReportForm) {
        this.logger.error('Required DOM elements not found');
        return;
      }
  
      // Ensure SelectManager is ready before proceeding
      if (!this.selectManager) {
        this.selectManager = SelectManager.getInstance();
        await this.selectManager.initialize();
      }
  
      // Show the form container first
      dashboardContainer.style.display = 'none';
      snowReportForm.style.display = 'block';
  
      // Fetch fresh user data and initialize form
      const response = await fetch('/api/user-data', {
        credentials: 'include'
      });
  
      // Handle unauthorized state
      if (response.status === 401) {
        this.logger.debug('Session expired, redirecting to login');
        await AuthManager.getInstance().logout();
        this.showLoginPrompt();
        return;
      }
  
      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }
  
      const userData = await response.json();
      this.logger.debug('Fetched user data for form:', userData);
  
      // First initialize form with user data
      this.formManager.initializeForm(userData);
  
      // Then ensure select fields are populated with proper state
      await this.selectManager.refreshAllDropdowns();
      
      // Start tracking form time only after everything is initialized
      this.formManager.startTrackingFormTime();
  
    } catch (error) {
      this.logger.error('Error showing snow report form:', error);
      this.showError(this.i18next.t('form.error.loading', 'Error loading form'));
      // Revert to dashboard on error
      this.showDashboard();
    }
  }

  showDashboard() {
      const dashboardContainer = document.getElementById('dashboard-container');
      const settingsContainer = document.getElementById('settings-container');
      const snowReportForm = document.getElementById('snow-report-form');
      
      // Only toggle the main containers, don't touch form sections
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
  }

  showSettings() {
      const dashboardContainer = document.getElementById('dashboard-container');
      const settingsContainer = document.getElementById('settings-container');
      const snowReportForm = document.getElementById('snow-report-form');
      
      // Only toggle the main containers, don't touch form sections
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (settingsContainer) settingsContainer.style.display = 'block';
      if (snowReportForm) snowReportForm.style.display = 'none';
  }

  async updateUIWithUserData(userData) {
    this.logger.debug('Updating UI with user data:', userData);
    
    if (userData.language) {
      try {
        if (!this.i18next.isInitialized) {
          await new Promise(resolve => {
            this.i18next.on('initialized', resolve);
          });
        }
        await this.i18next.changeLanguage(userData.language);
      } catch (error) {
        this.logger.error('Error changing language:', error);
      }
    }
    
    // Initialize form if it's currently visible
    const snowReportForm = document.getElementById('snow-report-form');
    if (snowReportForm && snowReportForm.style.display === 'block') {
      this.formManager.initializeForm(userData);
    }
    
    this.updateRewardsSection(userData);
    
    if (this.i18next.isInitialized) {
      this.updatePageContent();
    }
  }

  updatePageContent() {
    if (!this.i18next.isInitialized) {
      this.logger.warn('Attempted to update page content before i18next initialization');
      return;
    }

    this.logger.debug('Updating page content with translations');
    try {
      document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        try {
          const translation = this.i18next.t(key, { 
            returnObjects: true, 
            interpolation: { escapeValue: false } 
          });
          this.updateElementTranslation(element, translation);
        } catch (error) {
          this.logger.error(`Error translating key "${key}":`, error);
        }
      });
      
      this.updateLoginText();
    } catch (error) {
      this.logger.error('Error updating page content:', error);
    }
  }
  
  updateRewardsSection(userData) {
    const rewardsSection = document.getElementById('rewards-section');
    if (rewardsSection) {
      if (userData.rovas_uid && !isNaN(userData.rovas_uid)) {
        rewardsSection.style.display = 'block';
      } else {
        rewardsSection.style.display = 'none';
      }
    }
  }

  updateGPSCardVisibility() {
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) return;
  
    const gpsManager = GPSManager.getInstance();
    const capability = gpsManager.checkGPSCapability();
  
    if (capability.supported) {
      gpsCard.classList.remove('disabled');
      if (gpsManager.isRecording) {
        this.updateGPSCardForRecording(gpsCard);
      } else {
        this.updateGPSCardForStandby(gpsCard);
      }
    } else {
      gpsCard.classList.add('disabled');
      gpsCard.querySelector('p').textContent = capability.reason;
    }
  }
  
  updateGPSCardForRecording(card) {
    const stats = GPSManager.getInstance().getCurrentStats();
    card.querySelector('h3').textContent = this.i18next.t('dashboard.stopGpsRecording');
    card.querySelector('p').textContent = this.i18next.t('dashboard.recordingStats', {
      distance: stats.distance,
      elevation: stats.elevation ? Math.round(stats.elevation) : '–'
    });
  }
  
  updateGPSCardForStandby(card) {
    card.querySelector('h3').textContent = this.i18next.t('dashboard.recordGps');
    card.querySelector('p').textContent = this.i18next.t('dashboard.recordGpsDesc');
  }
  
  showGPSTrackCard() {
    const gpsManager = GPSManager.getInstance();
    const stats = gpsManager.getTrackStats();
    if (!stats) {
      this.logger.debug('No track stats available');
      return;
    }

    this.logger.debug('Showing GPS track card with stats:', stats);

    const container = document.querySelector('.dashboard-grid');
    if (!container) {
      this.logger.warn('Dashboard grid container not found');
      return;
    }

    // Remove existing track card if present
    this.removeGPSTrackCard();

    const trackCard = document.createElement('div');
    trackCard.className = 'dashboard-card';
    trackCard.dataset.feature = 'gps-track';
    
    trackCard.innerHTML = `
      <div class="card-icon"></div>
      <h3>${this.i18next.t('dashboard.gpsTrack')}</h3>
      <p>${this.i18next.t('dashboard.trackStats', {
        distance: stats.distance,
        hours: stats.duration.hours,
        minutes: stats.duration.minutes
      })}</p>
      <a href="#" class="gpx-download">${this.i18next.t('dashboard.downloadGpx')}</a>
    `;

    // Add click handler for the download link
    trackCard.querySelector('.gpx-download').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleGPXDownload();
    });

    container.appendChild(trackCard);
    this.logger.debug('GPS track card added to dashboard');
  }

  async handleGPXDownload() {
    try {
      const gpsManager = GPSManager.getInstance();
      const gpxContent = gpsManager.exportGPX();
      
      if (!gpxContent) {
        this.logger.error('No GPX content available for download');
        return;
      }
  
      // Create a date string for the filename
      const stats = gpsManager.getTrackStats();
      const dateStr = stats.startTime.toISOString().split('T')[0];
      
      // Create blob and download link
      const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
      const url = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = url;
      tempLink.download = `track_${dateStr}.gpx`;
  
      // Append to document, click, and remove
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      this.logger.error('Error downloading GPX:', error);
      alert(this.i18next.t('dashboard.gpxDownloadError'));
    }
  }
  
  removeGPSTrackCard() {
    const trackCard = document.querySelector('[data-feature="gps-track"]');
    if (trackCard) {
      trackCard.remove();
    }
  }
  
  showError(message) {
    // Add a small delay to ensure error is shown after any redirects
    setTimeout(() => {
      alert(message);
    }, 100);
  }

  showSuccess(message) {
    alert(message);
  }

  showErrorMessage(message, error = null) {
    this.logger.error(message, error);
    this.showError(message);
  }
}

export default UIManager;

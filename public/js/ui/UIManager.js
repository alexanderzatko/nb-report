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
      this.formManager = FormManager.getInstance();
      this.selectManager = SelectManager.getInstance();
      
      // Initialize both managers
      await Promise.all([
        this.formManager.initialize(),
        this.selectManager.initialize()
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
            const track = gpsManager.stopRecording();
            this.updateGPSCardForStandby(gpsCard);
            if (track) {
              this.showGPSTrackCard();
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
            
            try {
              await gpsManager.startRecording();
              this.updateGPSCardForRecording(gpsCard);
            } catch (error) {
              alert(error.message);
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
      console.log('Updating UI based on auth state:', isAuthenticated);
      const loginContainer = document.getElementById('login-container');
      const dashboardContainer = document.getElementById('dashboard-container');
      const settingsContainer = document.getElementById('settings-container');
      const snowReportForm = document.getElementById('snow-report-form');
      const regularUserSection = document.getElementById('regular-user-section');
      const adminSection = document.getElementById('admin-section');
      const trailsSection = document.getElementById('trails-section');
      const rewardsSection = document.getElementById('rewards-section');
  
      if (isAuthenticated) {
          if (loginContainer) loginContainer.style.display = 'none';
          if (dashboardContainer) dashboardContainer.style.display = 'block';
          if (settingsContainer) settingsContainer.style.display = 'none';
          if (snowReportForm) snowReportForm.style.display = 'none';
          if (regularUserSection) regularUserSection.style.display = 'none';
          if (adminSection) adminSection.style.display = 'none';
          if (trailsSection) trailsSection.style.display = 'none';
          if (rewardsSection) rewardsSection.style.display = 'none';
      } else {
          if (loginContainer) {
              loginContainer.style.display = 'flex';
              this.updateLoginText();
          }
          if (dashboardContainer) dashboardContainer.style.display = 'none';
          if (settingsContainer) settingsContainer.style.display = 'none';
          if (snowReportForm) snowReportForm.style.display = 'none';
          if (regularUserSection) regularUserSection.style.display = 'none';
          if (adminSection) adminSection.style.display = 'none';
          if (trailsSection) trailsSection.style.display = 'none';
          if (rewardsSection) rewardsSection.style.display = 'none';
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
  
  showSnowReportForm() {
    if (!this.formManager) {
      this.logger.error('FormManager not initialized');
      return;
    }

    const dashboardContainer = document.getElementById('dashboard-container');
    const snowReportForm = document.getElementById('snow-report-form');
    
    if (dashboardContainer && snowReportForm) {
      dashboardContainer.style.display = 'none';
      snowReportForm.style.display = 'block';
      this.formManager.startTrackingFormTime();
    } else {
      this.logger.error('Required DOM elements not found');
    }
  }

  showDashboard() {
      const dashboardContainer = document.getElementById('dashboard-container');
      const settingsContainer = document.getElementById('settings-container');
      const snowReportForm = document.getElementById('snow-report-form');
      const regularUserSection = document.getElementById('regular-user-section');
      const adminSection = document.getElementById('admin-section');
      const trailsSection = document.getElementById('trails-section');
      const rewardsSection = document.getElementById('rewards-section');
      
      if (dashboardContainer) dashboardContainer.style.display = 'block';
      if (settingsContainer) settingsContainer.style.display = 'none';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (regularUserSection) regularUserSection.style.display = 'none';
      if (adminSection) adminSection.style.display = 'none';
      if (trailsSection) trailsSection.style.display = 'none';
      if (rewardsSection) rewardsSection.style.display = 'none';
  }

  showSettings() {
      const dashboardContainer = document.getElementById('dashboard-container');
      const settingsContainer = document.getElementById('settings-container');
      const snowReportForm = document.getElementById('snow-report-form');
      const regularUserSection = document.getElementById('regular-user-section');
      const adminSection = document.getElementById('admin-section');
      const trailsSection = document.getElementById('trails-section');
      const rewardsSection = document.getElementById('rewards-section');
      
      if (dashboardContainer) dashboardContainer.style.display = 'none';
      if (settingsContainer) settingsContainer.style.display = 'block';
      if (snowReportForm) snowReportForm.style.display = 'none';
      if (regularUserSection) regularUserSection.style.display = 'none';
      if (adminSection) adminSection.style.display = 'none';
      if (trailsSection) trailsSection.style.display = 'none';
      if (rewardsSection) rewardsSection.style.display = 'none';
  }

  async updateUIWithUserData(userData) {
    this.logger.debug('Updating UI with user data:', userData);
    
    if (userData.language) {
      try {
        // Ensure i18next is initialized before changing language
        if (!this.i18next.isInitialized) {
          this.logger.debug('Waiting for i18next initialization before language change...');
          await new Promise((resolve) => {
            this.i18next.on('initialized', resolve);
          });
        }

        await this.i18next.changeLanguage(userData.language);
        this.logger.debug('Language changed successfully to:', userData.language);
      } catch (error) {
        this.logger.error('Error changing language:', error);
        // Continue with other updates even if language change fails
      }
    }
    
    // Update UI components that don't depend on translations
    this.updateRewardsSection(userData);
    
    // Update translated content if i18next is ready
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
    const stats = GPSManager.getInstance().getTrackStats();
    if (!stats) return;
  
    const container = document.querySelector('.dashboard-grid');
    if (!container) return;
  
    // Remove existing track card if present
    this.removeGPSTrackCard();
  
    const trackCard = document.createElement('div');
    trackCard.className = 'dashboard-card';
    trackCard.dataset.feature = 'gps-track';
    
    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.className = 'gpx-download';
    downloadLink.href = '#';
    downloadLink.textContent = this.i18next.t('dashboard.downloadGpx');
    
    trackCard.innerHTML = `
      <div class="card-icon"></div>
      <h3>${this.i18next.t('dashboard.gpsTrack')}</h3>
      <p>${this.i18next.t('dashboard.trackStats', {
        distance: stats.distance,
        hours: stats.duration.hours,
        minutes: stats.duration.minutes
      })}</p>
    `;
    
    // Add the download link after the paragraph
    trackCard.appendChild(downloadLink);
  
    // Add click handler for the download link
    downloadLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleGPXDownload();
    });
  
    container.appendChild(trackCard);
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

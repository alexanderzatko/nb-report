import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import Logger from '../utils/Logger.js';
import SelectManager from '../managers/SelectManager.js';
import FormManager from '../form/FormManager.js';
import StateManager from '../state/StateManager.js';
import GPSManager from '../managers/GPSManager.js';

class UIManager {
  static instance = null;

  constructor() {
    if (UIManager.instance) {
      return UIManager.instance;
    }
    
    this.i18next = i18next;
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.loginInProgress = false;
    this.loginClickTimeout = null;
    
    UIManager.instance = this;
  }

  static getInstance() {
    if (!UIManager.instance) {
      UIManager.instance = new UIManager();
    }
    return UIManager.instance;
  }

  async initializeLoginUI() {
    try {
      // Wait for i18next to be ready (only core translations at this point)
      if (!this.i18next.isInitialized) {
        this.logger.debug('Waiting for i18next to initialize...');
        await new Promise((resolve) => {
          this.i18next.on('initialized', resolve);
        });
      }

      this.logger.debug('Initializing login UI');
      this.setupLoginEventListeners();

      const loginContainer = document.getElementById('login-container');
      if (loginContainer) {
        loginContainer.classList.add('visible');
      }

      this.updateCorePageContent();
      
      this.logger.debug('Login UI initialized');

    } catch (error) {
      this.logger.error('Error initializing login UI:', error);
      throw error;
    }
  }

  async initializeAuthenticatedUI() {
    this.logger.debug('Starting initializeAuthenticatedUI');
    console.log('Initializing authenticated UI');

    try {
        const loginContainer = document.getElementById('login-container');
        const dashboardContainer = document.getElementById('dashboard-container');
        
        if (loginContainer) loginContainer.style.display = 'none';
        if (dashboardContainer) {
            dashboardContainer.style.display = 'block';
            console.log('Dashboard container is now visible');
        }

        // Initialize GPS functionality
        const gpsManager = GPSManager.getInstance();
        if (gpsManager.isSupported()) {
            await this.updateGPSCardVisibility();
            const hasActiveRecording = await gpsManager.checkForActiveRecording();
            if (hasActiveRecording) {
                await this.updateGPSCardVisibility();
            } else {
                const latestTrack = await gpsManager.loadLatestTrack();
                if (latestTrack) {
                    await this.showGPSTrackCard();
                }
            }
        }
      
        // Initialize select manager before setting up other UI elements
        const selectManager = SelectManager.getInstance();
        await selectManager.initialize();

        // Set up all interactive elements
        await this.setupDashboardCards();
        await this.setupSettingsButtons();
        await this.setupFormButtons();
        
        this.updateFullPageContent();
        
        this.logger.debug('Authenticated UI initialization complete');
    } catch (error) {
        console.error('Error initializing authenticated UI:', error);
        this.logger.error('Error initializing authenticated UI:', error);
        throw error;
    }
  }

  async updateGPSCardVisibility() {
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
  
  async setupDashboardCards() {
    console.log('Setting up dashboard cards');
    
    // Snow Report Card
    const snowReportLink = document.getElementById('snow-report-link');
    if (snowReportLink) {
        console.log('Found snow report link');
        // Remove existing href to prevent default behavior
        snowReportLink.removeAttribute('href');
        
        snowReportLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Snow report card clicked');
            this.showSnowReportForm();
        });
    } else {
        console.log('Snow report link not found');
    }

    // Settings Card
    const settingsLink = document.getElementById('settings-link');
    if (settingsLink) {
        console.log('Found settings link');
        // Remove existing href to prevent default behavior
        settingsLink.removeAttribute('href');
        
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Settings card clicked');
            this.showSettings();
        });
    } else {
        console.log('Settings link not found');
    }

    // GPS Recording Card
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (gpsCard) {
        gpsCard.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
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

    // Make cards visually clickable
    [snowReportLink, settingsLink].forEach(card => {
        if (card) {
            card.style.cursor = 'pointer';
            // Add hover effect
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-3px)';
                card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'none';
                card.style.boxShadow = 'none';
            });
        }
    });
  }

  async setupSettingsButtons() {
    console.log('Setting up settings buttons');

    // Dashboard Return Button
    const dashboardButton = document.getElementById('dashboard-button');
    if (dashboardButton) {
        console.log('Found dashboard button');
        dashboardButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Dashboard button clicked');
            this.showDashboard();
        });

        // Add visual feedback
        dashboardButton.style.cursor = 'pointer';
        this.addButtonHoverEffects(dashboardButton);
    }

    // Logout Button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        console.log('Found logout button');
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Logout button clicked');
            this.handleLogoutClick();
        });

        // Add visual feedback
        logoutButton.style.cursor = 'pointer';
        this.addButtonHoverEffects(logoutButton);
    }
  }

  async setupFormButtons() {
    console.log('Setting up form buttons');

    // Cancel Button
    const cancelButton = document.getElementById('cancel-button');
    if (cancelButton) {
        console.log('Found cancel button');
        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Cancel button clicked');
            this.formManager?.resetForm(); // Optional form reset if formManager exists
            this.showDashboard();
        });

        // Add visual feedback
        cancelButton.style.cursor = 'pointer';
        this.addButtonHoverEffects(cancelButton);
    }
  }

  addButtonHoverEffects(button) {
    button.addEventListener('mouseenter', () => {
        button.style.opacity = '0.8';
        button.style.transform = 'translateY(-1px)';
    });
    button.addEventListener('mouseleave', () => {
        button.style.opacity = '1';
        button.style.transform = 'none';
    });
  }

  setupLoginEventListeners() {
    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      const newContainer = loginContainer.cloneNode(true);
      loginContainer.parentNode.replaceChild(newContainer, loginContainer);
      
      newContainer.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLoginClick(e);
      });
    }
  }

  showDashboard() {
    console.log('Showing dashboard');
    this.logger.debug('Showing dashboard');
    
    const containers = ['settings-container', 'snow-report-form'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
          console.log(`Hidden container: ${id}`);
      }
    });

    const dashboardContainer = document.getElementById('dashboard-container');
    if (dashboardContainer) {
      dashboardContainer.style.display = 'block';
      console.log('Dashboard container is now visible');
    }
  }

  showSettings() {
    console.log('Showing settings');
    this.logger.debug('Showing settings');
    
    const containers = ['dashboard-container', 'snow-report-form'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
          console.log(`Hidden container: ${id}`);
      }
    });

    const settingsContainer = document.getElementById('settings-container');
    if (settingsContainer) {
      settingsContainer.style.display = 'block';
      console.log('Settings container is now visible');
    }
  }

  async showSnowReportForm() {
      this.logger.debug('Showing snow report form');
      
      try {
          // Initialize form if it hasn't been initialized
          if (!this.formManager) {
              this.formManager = FormManager.getInstance();
              await this.formManager.initialize();
          }
  
          // Use existing form data stored in state
          const stateManager = StateManager.getInstance();
          const userData = stateManager.getState('auth.user');

          this.logger.debug('Showing user data',userData);

          if (!userData) {
              this.logger.error('No user data available');
              await AuthManager.getInstance().logout();
              this.showLoginPrompt();
              return;
          }
  
          this.logger.debug('Initializing form with user data:', userData);
  
          // Initialize form with user data
          await this.formManager.initializeForm(userData);
  
          // Show the form container
          const dashboardContainer = document.getElementById('dashboard-container');
          const settingsContainer = document.getElementById('settings-container');
          const snowReportForm = document.getElementById('snow-report-form');
          
          if (dashboardContainer) dashboardContainer.style.display = 'none';
          if (settingsContainer) settingsContainer.style.display = 'none';
          if (snowReportForm) snowReportForm.style.display = 'block';

          this.formManager.startTrackingFormTime();

      } catch (error) {
          this.logger.error('Error showing snow report form:', error);
          this.showError(this.i18next.t('errors.form.loading'));
          this.showDashboard();
      }
  }

  updateCorePageContent() {
    this.logger.debug('Updating core translations...');
    document.querySelectorAll('[data-i18n].core').forEach(element => {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key);
      this.logger.debug(`Translating ${key} to: ${translation}`);
      this.updateElementTranslation(element, translation);
    });
    
    this.updateLoginText();
  }

  updateFullPageContent() {
      this.logger.debug('Starting full page content update...');
      document.querySelectorAll('[data-i18n]').forEach(element => {
          const key = element.getAttribute('data-i18n');
          this.updateElementTranslation(element);
      });
  }

  async updateUIBasedOnAuthState(isAuthenticated, userData = null) {
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
  
      if (userData) {
        this.updateUserSpecificElements(userData);
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

  updateElementTranslation(element) {
      const key = element.getAttribute('data-i18n');
      const translation = this.i18next.t(key, { returnObjects: true });
      this.logger.debug(`Translating ${key} to:`, translation);
      
      if (typeof translation === 'object') {
          if (element.tagName.toLowerCase() === 'select') {
              // Store current value to restore after populating options
              const currentValue = element.value;
              element.innerHTML = '';
              
              // Add translated options
              Object.entries(translation).forEach(([value, text]) => {
                  const option = document.createElement('option');
                  option.value = value;
                  option.textContent = text;
                  element.appendChild(option);
              });
              
              // Restore previously selected value if it exists
              if (currentValue && element.querySelector(`option[value="${currentValue}"]`)) {
                  element.value = currentValue;
              }
          } else {
              // For non-select elements that received an object, log a warning
              this.logger.warn(`Received object translation for non-select element with key: ${key}`);
              element.textContent = key;
          }
      } else {
          // Handle non-object translations
          if (element.tagName.toLowerCase() === 'input' && element.type === 'submit') {
              element.value = translation;
          } else {
              element.textContent = translation;
          }
      }
  }
  
  updateUserSpecificElements(userData) {
    if (userData.name) {
      const welcomeElement = document.querySelector('[data-i18n="welcome"]');
      if (welcomeElement) {
        welcomeElement.textContent = this.i18next.t('welcome', {
          name: userData.name,
          role: userData.ski_center_admin === "1" ? "Admin" : "User"
        });
      }
    }
  }
  
  updateLoginText() {
      const loginText = document.getElementById('login-text');
      if (loginText) {
          const translationKey = 'auth.loginText';
          const translation = this.i18next.t(translationKey);
          this.logger.debug(`Setting login text translation (${translationKey}): ${translation}`);
          loginText.textContent = translation;
      }
  }

  async handleLoginClick(event) {
    event.preventDefault();
      
    if (this.loginInProgress) {
      this.logger.debug('Login already in progress');
      return;
    }

    if (this.loginClickTimeout) {
      clearTimeout(this.loginClickTimeout);
    }

    this.loginInProgress = true;

    try {
      const authManager = AuthManager.getInstance();
      const initiated = await authManager.initiateOAuth();
      
      if (!initiated) {
        this.showError(this.i18next.t('auth.loginError'));
      }
    } catch (error) {
      if (!(error instanceof TypeError) || !error.message.includes('NetworkError')) {
        this.logger.error('Failed to initiate login:', error);
        this.showError(this.i18next.t('auth.loginError'));
      }
    } finally {
      this.loginClickTimeout = setTimeout(() => {
        this.loginInProgress = false;
      }, 2000);
    }
  }

  async handleLogoutClick() {
    try {
      const authManager = AuthManager.getInstance();
      const success = await authManager.logout();
      
      if (success) {
        localStorage.removeItem('sessionId');
        await this.resetToLoginState();
      } else {
        this.showError(this.i18next.t('auth.logoutError'));
      }
    } catch (error) {
      this.logger.error('Error during logout:', error);
      this.showError(this.i18next.t('auth.logoutError'));
    }
  }

  async resetToLoginState() {
    this.logger.debug('Resetting UI to login state');

    const containers = [
      'dashboard-container',
      'settings-container',
      'snow-report-form'
    ];

    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.style.display = 'none';
      }
    });

    const loginContainer = document.getElementById('login-container');
    if (loginContainer) {
      loginContainer.style.display = 'flex';
      this.updateLoginText();

      // Re-initialize login container with fresh event listeners
      const newContainer = loginContainer.cloneNode(true);
      loginContainer.parentNode.replaceChild(newContainer, loginContainer);
  
      newContainer.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLoginClick(e);
      });
    }

    this.loginInProgress = false;
    if (this.loginClickTimeout) {
      clearTimeout(this.loginClickTimeout);
    }

    this.clearActiveUIElements();
  }

  clearActiveUIElements() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });

    document.querySelectorAll('.update-notification').forEach(notification => {
      notification.remove();
    });
  }

  showError(message) {
    setTimeout(() => {
      alert(message);
    }, 100);
  }

  showSuccess(message) {
    alert(message);
  }
}

export default UIManager;

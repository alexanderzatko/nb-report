import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import Logger from '../utils/Logger.js';
import SelectManager from '../managers/SelectManager.js';
import FormManager from '../form/FormManager.js';
import StateManager from '../state/StateManager.js';
import GPSManager from '../managers/GPSManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';

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

  updateBackground(page) {
      const backgroundContainer = document.getElementById('background-container');
      if (!backgroundContainer) return;

      backgroundContainer.className = 'page-background';

      switch (page) {
          case 'login':
              backgroundContainer.classList.add('login-background');
              break;
          case 'dashboard':
              backgroundContainer.classList.add('dashboard-background');
              break;
          case 'settings':
              backgroundContainer.classList.add('settings-background');
              break;
          case 'form':
              backgroundContainer.classList.add('form-background');
              break;
      }
  }

  async initializeLoginUI() {
    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'none';
    }
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
    this.updateBackground('login');
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
/*
      const gpsManager = GPSManager.getInstance();
      if (gpsManager.isSupported()) {
          await this.updateGPSCardVisibility();

          // State subscription for GPS recording updates
          const stateManager = StateManager.getInstance();
          stateManager.subscribe('gps.recording', () => {
              const gpsCard = document.querySelector('[data-feature="gps-recording"]');
              if (gpsCard) {
                  this.updateGPSCardForRecording(gpsCard);
              }
          });

          window.addEventListener('gps-update', () => {
              const gpsCard = document.querySelector('[data-feature="gps-recording"]');
              if (gpsCard) {
                  this.updateGPSCardForRecording(gpsCard);
              }
          });

          const hasActiveRecording = await gpsManager.checkForActiveRecording();
          if (hasActiveRecording) {
              await this.updateGPSCardVisibility();
          } else {
              const latestTrack = await gpsManager.loadLatestTrack();
              if (latestTrack) {
                this.logger.debug('Latest track loaded:', latestTrack);
                await this.showGPSTrackCard(latestTrack);
              }
          }
      }
*/      
      // Initialize select manager before setting up other UI elements
      const selectManager = SelectManager.getInstance();
      await selectManager.refreshAllDropdowns();

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
    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'flex';
    }
  }
  
async setupDashboardCards() {
    console.log('Setting up dashboard cards');
    
    const setupCard = (cardElement, handler) => {
        if (cardElement) {
            console.log(`Found card: ${cardElement.id}`);
            cardElement.removeAttribute('href');
            
            cardElement.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log(`Card clicked: ${cardElement.id}`);
                await handler();
            });

            // Add hover effect
            cardElement.style.cursor = 'pointer';
            cardElement.addEventListener('mouseenter', () => {
                cardElement.style.transform = 'translateY(-3px)';
                cardElement.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
            });
            cardElement.addEventListener('mouseleave', () => {
                cardElement.style.transform = 'none';
                cardElement.style.boxShadow = 'none';
            });
        }
    };

    // Continue Report Card
    const continueReportLink = document.getElementById('snow-report-link');
    setupCard(continueReportLink, () => this.showSnowReportForm());

    // New Report Card
    const newReportLink = document.getElementById('new-report-link');
    setupCard(newReportLink, async () => {
        // Clear any existing draft before showing new form
        const dbManager = DatabaseManager.getInstance();
        const db = await dbManager.getDatabase();
        const forms = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['formData'], 'readonly');
            const store = transaction.objectStore('formData');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const draftForm = forms.find(form => !form.submitted);
        if (draftForm) {
            await dbManager.clearForm(draftForm.id);
        }

        this.showSnowReportForm();
    });
    
    if (!continueReportLink && !newReportLink) {
        console.log('No report cards found');
        return;
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
            
            // Check if GPS is supported
            const capability = gpsManager.checkGPSCapability();
            if (!capability.supported) {
                this.showModalDialog({
                    message: this.i18next.t('errors.gps.androidOnly'),
                    showCancel: false,
                    confirmText: 'OK'
                });
                return;
            }
            
            if (gpsManager.isRecording) {
                try {
                    const track = await gpsManager.stopRecording();
                    if (track) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        await this.showGPSTrackCard(track);
                        this.updateGPSCardForStandby(gpsCard);
                    }
                } catch (error) {
                    this.logger.error('Error stopping GPS recording:', error);
                    this.updateGPSCardForStandby(gpsCard);
                }
            } else {
                if (await gpsManager.hasExistingTrack()) {
                    const confirmed = await this.showModalDialog({
                        message: this.i18next.t('dashboard.confirmOverwriteTrack'),
                        confirmText: this.i18next.t('form.gpx.replace'),
                        cancelText: this.i18next.t('form.gpx.cancel'),
                        showCancel: true
                    });
                    
                    if (!confirmed) return;
                    await gpsManager.clearTrack();
                    this.removeGPSTrackCard();
                }
                
                const started = await gpsManager.startRecording();
                if (started) {
                    this.updateGPSCardForRecording(gpsCard);
                }
            }
        });
    }
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
    
    const stateManager = StateManager.getInstance();
    const userData = stateManager.getState('auth.user');

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
      // Update user elements when showing dashboard
      if (userData) {
          this.updateUserSpecificElements(userData);
      }
    }
    this.updateBackground('dashboard');

    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'flex';
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
    const settingsIcon = document.querySelector('.settings-icon-container');

    if (settingsContainer) {
      settingsContainer.style.display = 'block';
      if (settingsIcon) {
          settingsIcon.style.display = 'none';
      }
    }
    this.updateBackground('settings');
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
      this.updateBackground('form');
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
          // Skip the welcome message translation during full page updates
          if (key === 'welcome' && element.textContent) {
              this.logger.debug('Skipping already translated welcome message');
              return;
          }
          this.updateElementTranslation(element);
      });
  }

  async updateUIBasedOnAuthState(isAuthenticated, userData = null) {
    this.logger.debug('Updating UI based on auth state:', isAuthenticated);

    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = isAuthenticated ? 'flex' : 'none';
    }
    
    const loginContainer = document.getElementById('login-container');
    const dashboardContainer = document.getElementById('dashboard-container');
    const settingsContainer = document.getElementById('settings-container');
    const snowReportForm = document.getElementById('snow-report-form');

    document.body.classList.remove('admin-user', 'regular-user');

    if (isAuthenticated) {
      if (userData) {
        const userTypeClass = userData.ski_center_admin === "1" ? 'admin-user' : 'regular-user';
        document.body.classList.add(userTypeClass);
      }
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

  updateGPSCardForRecording(card) {
      const stateManager = StateManager.getInstance();
      const recordingState = stateManager.getState('gps.recording');
      
      // Add debug logging
      this.logger.debug('GPS recording state:', recordingState);
      
      // Format numbers properly
      const distance = recordingState ? Number(recordingState.distance).toFixed(2) : '0.00';
      const elevation = recordingState && recordingState.elevation ? Math.round(recordingState.elevation) : '–';
      
      // Log formatted values
      this.logger.debug('Formatted values:', { distance, elevation });
      
      card.querySelector('h3').textContent = this.i18next.t('dashboard.stopGpsRecording');
      card.querySelector('p').textContent = this.i18next.t('dashboard.recordingStatsDist', {
          distance: distance
      });
      card.querySelector('p').textContent = this.i18next.t('dashboard.recordingStatsEle', {
          elevation: elevation
      });
  
      // Ensure recording class is present
      card.classList.add('recording');
  }
  
  updateGPSCardForStandby(card) {
    card.querySelector('h3').textContent = this.i18next.t('dashboard.recordGps');
    card.querySelector('p').textContent = this.i18next.t('dashboard.recordGpsDesc');
    // Remove recording class
    card.classList.remove('recording');
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
        gpsCard.classList.add('recording'); // Add recording class when active
      } else {
        this.updateGPSCardForStandby(gpsCard);
        gpsCard.classList.remove('recording'); // Remove recording class when inactive
      }
    } else {
      gpsCard.classList.add('disabled');
      gpsCard.classList.remove('recording');
      gpsCard.querySelector('p').textContent = capability.reason;
    }
  }
  
  showGPSTrackCard(track) {
      if (!track) {
          this.logger.debug('No track stats available');
          return;
      }
  
      const container = document.querySelector('.dashboard-grid');
      if (!container) {
          this.logger.warn('Dashboard grid container not found');
          return;
      }

      this.logger.debug('Showing track card with data:', track);

      // Remove existing track card if present
      this.removeGPSTrackCard();
  
      const trackCard = document.createElement('div');
      trackCard.className = 'dashboard-card';
      trackCard.dataset.feature = 'gps-track';
      
      // Calculate duration from start and end times
      const gpsManager = GPSManager.getInstance();
      const duration = gpsManager.calculateDuration(track.startTime, track.endTime);
      
      trackCard.innerHTML = `
          <div class="card-icon"></div>
          <h3>${this.i18next.t('dashboard.gpsTrack')}</h3>
          <p>${this.i18next.t('dashboard.trackStatsDist', {
              distance: Math.round(track.totalDistance)
          })}</p>
          <p>${this.i18next.t('dashboard.trackStatsTime', {
              hours: duration.hours,
              minutes: duration.minutes
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
  
  removeGPSTrackCard() {
      const trackCard = document.querySelector('[data-feature="gps-track"]');
      if (trackCard) {
          trackCard.remove();
      }
  }
  
  async handleGPXDownload() {
      try {
          const gpsManager = GPSManager.getInstance();
          const gpxContent = gpsManager.exportGPX();
          
          if (!gpxContent) {
              this.logger.error('No GPX content available for download');
              return;
          }
  
          // Get current date if no track date available
          const dateStr = new Date().toISOString().split('T')[0];
    
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
  
  updateElementTranslation(element, translationData = null) {
      const key = element.getAttribute('data-i18n');
      const translation = translationData ? 
          this.i18next.t(key, translationData) : 
          this.i18next.t(key, { returnObjects: true });
      
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
              // If we provided translation data, mark the element as handled
              if (translationData) {
                  element.setAttribute('data-translation-handled', 'true');
              }
          }
      }
  }
  
  updateUserSpecificElements(userData) {
      this.logger.debug('Updating user elements with data:', userData);
      if (userData?.user_name) {
          const welcomeElement = document.getElementById('welcome-head');
          if (welcomeElement) {
              this.updateElementTranslation(welcomeElement, {
                  name: userData.user_name
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

    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'none';
    }
    
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

  async showModalDialog({ title = '', message, confirmText = 'OK', cancelText = null, showCancel = true }) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const content = document.createElement('div');
        content.className = 'modal-content';
        
        if (title) {
            const titleElement = document.createElement('h3');
            titleElement.textContent = title;
            content.appendChild(titleElement);
        }
        
        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        content.appendChild(messageElement);
        
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'modal-buttons';
        
        if (showCancel) {
            const cancelButton = document.createElement('button');
            cancelButton.className = 'cancel-button';
            cancelButton.textContent = cancelText || this.i18next.t('dialog.cancel');
            cancelButton.onclick = () => {
                modal.remove();
                resolve(false);
            };
            buttonContainer.appendChild(cancelButton);
        }
        
        const confirmButton = document.createElement('button');
        confirmButton.className = 'photo-button';
        confirmButton.textContent = confirmText;
        confirmButton.onclick = () => {
            modal.remove();
            resolve(true);
        };
        buttonContainer.appendChild(confirmButton);
        
        content.appendChild(buttonContainer);
        modal.appendChild(content);
        document.body.appendChild(modal);
    });
  }
}

export default UIManager;

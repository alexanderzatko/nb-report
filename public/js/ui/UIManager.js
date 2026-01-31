import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';
import Logger from '../utils/Logger.js';
import SelectManager from '../managers/SelectManager.js';
import FormManager from '../form/FormManager.js';
import StateManager from '../state/StateManager.js';
import GPSManager from '../managers/GPSManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';
import VoucherManager from '../managers/VoucherManager.js';
import NetworkManager from '../network/NetworkManager.js';
import ConfigManager from '../config/ConfigManager.js';

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
    this.dbManager = DatabaseManager.getInstance(); // Add this line

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
    this.logger.debug('Initializing authenticated UI');

    try {
      const db = await this.dbManager.getDatabase();
      const forms = await new Promise((resolve, reject) => {
          const transaction = db.transaction(['formData'], 'readonly');
          const store = transaction.objectStore('formData');
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });

      const draftForm = forms.find(form => !form.submitted);
      const newReportCard = document.getElementById('continue-draft-link');
      if (newReportCard) {
          if (draftForm) {
              newReportCard.style.display = 'block';
          } else {
              newReportCard.style.display = 'none';
          }
      }

      const loginContainer = document.getElementById('login-container');
      const dashboardContainer = document.getElementById('dashboard-container');
      
      if (loginContainer) loginContainer.style.display = 'none';
      if (dashboardContainer) {
          dashboardContainer.style.display = 'block';
          this.logger.debug('Dashboard container is now visible');
          
          // Update voucher card visibility based on admin status
          const stateManager = StateManager.getInstance();
          const userData = stateManager.getState('auth.user');
          if (userData) {
              const voucherCard = document.getElementById('generate-voucher-link');
              if (voucherCard) {
                  voucherCard.style.display = userData.ski_center_admin === "1" ? 'block' : 'none';
                  this.logger.debug('Voucher card visibility updated:', userData.ski_center_admin === "1" ? 'visible' : 'hidden');
              }
              const moneyCard = document.getElementById('money-link');
              if (moneyCard) {
                  moneyCard.style.display = userData.ski_center_admin === "1" ? 'block' : 'none';
              }
          }
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
      await this.setupVoucherButtons();
      await this.setupMoneyButtons();
      
      this.updateFullPageContent();
      this.logger.debug('Authenticated UI initialization complete');
    } catch (error) {
        this.logger.error('Error initializing authenticated UI:', error);
        throw error;
    }
    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'flex';
    }
  }
  
async setupDashboardCards() {
    this.logger.debug('Setting up dashboard cards');
     
    const setupCard = (cardElement, handler) => {
        if (cardElement) {
            this.logger.debug(`Found card: ${cardElement.id}`);
            cardElement.removeAttribute('href');
            
            cardElement.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.logger.debug(`Card clicked: ${cardElement.id}`);
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


    const db = await this.dbManager.getDatabase();
    const forms = await new Promise((resolve, reject) => {
        const transaction = db.transaction(['formData'], 'readonly');
        const store = transaction.objectStore('formData');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const draftForm = forms.find(form => !form.submitted);
    const newReportCard = document.getElementById('continue-draft-link');
    if (newReportCard) {
        if (draftForm) {
            newReportCard.style.removeProperty('display');
        } else {
            newReportCard.style.display = 'none';
        }
    }

    // Continue Report Card
    const continueReportLink = document.getElementById('continue-draft-link');
    setupCard(continueReportLink, () => this.showSnowReportForm());

    // New Report Card
    const newReportLink = document.getElementById('create-report-link');
    setupCard(newReportLink, async () => {
        const dbManager = DatabaseManager.getInstance();
        const db = await dbManager.getDatabase();
        const forms = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['formData'], 'readonly');
            const store = transaction.objectStore('formData');
            const request = store.getAll();
            request.onsuccess = () => {
                this.logger.debug('Retrieved forms:', request.result);
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
        });

        const draftForm = forms.find(form => !form.submitted);
        if (draftForm) {
            await dbManager.clearForm(draftForm.id);
        }

        this.showSnowReportForm();
    });

    // Generate Voucher Card
    const generateVoucherLink = document.getElementById('generate-voucher-link');
    setupCard(generateVoucherLink, () => this.showVoucherForm());

    // Money Card (Admin Only)
    const moneyLink = document.getElementById('money-link');
    setupCard(moneyLink, () => this.showMoneyPage());
    
    if (!continueReportLink && !newReportLink) {
        this.logger.debug('No report cards found');
        return;
    }

    // Settings Card
    const settingsLink = document.getElementById('settings-link');
    if (settingsLink) {
        this.logger.debug('Found settings link');
        // Remove existing href to prevent default behavior
        settingsLink.removeAttribute('href');
        
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.logger.debug('Settings card clicked');
            this.showSettings();
        });
    } else {
        this.logger.debug('Settings link not found');
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
    this.logger.debug('Setting up settings buttons');

    // Dashboard Return Button
    const dashboardButton = document.getElementById('dashboard-button');
    if (dashboardButton) {
        this.logger.debug('Found dashboard button');
        dashboardButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.logger.debug('Dashboard button clicked');
            await this.showDashboard();
        });

        // Add visual feedback
        dashboardButton.style.cursor = 'pointer';
        this.addButtonHoverEffects(dashboardButton);
    }

    // Logout Button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        this.logger.debug('Found logout button');
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.logger.debug('Logout button clicked');
            this.handleLogoutClick();
        });

        // Add visual feedback
        logoutButton.style.cursor = 'pointer';
        this.addButtonHoverEffects(logoutButton);
    }
  }

  async setupFormButtons() {
    this.logger.debug('Setting up form buttons');
    // Note: Cancel button handler is set up by FormManager.setupEventListeners()
    // to ensure proper form state management and clearing
  }

  async setupVoucherButtons() {
    this.logger.debug('Setting up voucher buttons');
    
    const wholeSeasonButton = document.getElementById('voucher-whole-season');
    const threeDaysButton = document.getElementById('voucher-three-days');
    const backButton = document.getElementById('voucher-back-button');
    const cancelButton = document.getElementById('voucher-cancel-button');
    
    if (wholeSeasonButton) {
      wholeSeasonButton.addEventListener('click', async () => {
        await this.handleVoucherGeneration(0);
      });
    }
    
    if (threeDaysButton) {
      threeDaysButton.addEventListener('click', async () => {
        await this.handleVoucherGeneration(3);
      });
    }
    
    if (backButton) {
      backButton.addEventListener('click', async () => {
        await this.showDashboard();
      });
    }
    
    if (cancelButton) {
      cancelButton.addEventListener('click', async () => {
        // Reset test voucher checkbox when canceling
        this.resetTestVoucherCheckbox();
        await this.showDashboard();
      });
      cancelButton.style.cursor = 'pointer';
      this.addButtonHoverEffects(cancelButton);
    }
  }

  async handleVoucherGeneration(duration) {
    this.logger.debug('Handling voucher generation', { duration });
    
    const stateManager = StateManager.getInstance();
    const userData = stateManager.getState('auth.user');
    
    const errorElement = document.getElementById('voucher-error');
    if (errorElement) {
      errorElement.style.display = 'none';
      errorElement.textContent = '';
    }
    
    // Check if test voucher checkbox is checked
    const testVoucherCheckbox = document.getElementById('test-voucher-checkbox');
    const isTestVoucher = testVoucherCheckbox && testVoucherCheckbox.checked;
    
    if (isTestVoucher) {
      // Use test voucher number without calling backend
      const testVoucherNumber = '999123456789';
      const { getVoucherUrl, appendVoucherToUrl } = await import('../utils/VoucherUrlGenerator.js');
      const voucherUrl = getVoucherUrl();
      const qrCodeUrl = appendVoucherToUrl(voucherUrl, testVoucherNumber);
      
      this.logger.debug('Using test voucher number', { testVoucherNumber });
      this.showVoucherDisplay(testVoucherNumber, qrCodeUrl);
      // Reset checkbox after showing test voucher
      this.resetTestVoucherCheckbox();
      return;
    }
    
    // Normal voucher generation flow
    if (!userData || !userData.ski_center_id) {
      this.logger.error('No ski center ID available');
      this.showError(this.i18next.t('voucher.error'));
      return;
    }
    
    try {
      const voucherManager = VoucherManager.getInstance();
      const voucherData = await voucherManager.createVoucher({
        duration: duration,
        count: 1,
        ski_center_ID: userData.ski_center_id
      });
      
      if (voucherData && voucherData.voucher_number) {
        const { getVoucherUrl, appendVoucherToUrl } = await import('../utils/VoucherUrlGenerator.js');
        const voucherUrl = getVoucherUrl();
        const qrCodeUrl = appendVoucherToUrl(voucherUrl, voucherData.voucher_number);
        
        this.showVoucherDisplay(voucherData.voucher_number, qrCodeUrl);
        // Reset checkbox after successful voucher generation
        this.resetTestVoucherCheckbox();
      } else {
        throw new Error('Invalid voucher response');
      }
    } catch (error) {
      this.logger.error('Error generating voucher:', error);
      if (errorElement) {
        errorElement.textContent = this.i18next.t('voucher.error');
        errorElement.style.display = 'block';
      }
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

  async showDashboard() {
    this.logger.debug('Showing dashboard');
    
    const stateManager = StateManager.getInstance();
    const userData = stateManager.getState('auth.user');

    const containers = ['settings-container', 'snow-report-form', 'voucher-form-container', 'voucher-display-container', 'money-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
          this.logger.debug(`Hidden container: ${id}`);
      }
    });

    // Check for draft forms
    try {
        const db = await this.dbManager.getDatabase();
        const forms = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['formData'], 'readonly');
            const store = transaction.objectStore('formData');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const draftForm = forms.find(form => !form.submitted);
        const continueReportCard = document.getElementById('continue-draft-link');
        if (continueReportCard) {
            if (draftForm) {
                continueReportCard.style.display = 'block';
            } else {
                continueReportCard.style.display = 'none';
            }
        }
    } catch (error) {
        this.logger.error('Error checking for draft forms:', error);
        // On error, hide the card to be safe
        const continueReportCard = document.getElementById('continue-draft-link');
        if (continueReportCard) {
            continueReportCard.style.display = 'none';
        }
    }
    
    const dashboardContainer = document.getElementById('dashboard-container');
    if (dashboardContainer) {
      dashboardContainer.style.display = 'block';
      this.logger.debug('Dashboard container is now visible');
      // Update user elements when showing dashboard
      if (userData) {
          this.updateUserSpecificElements(userData);
          // Show/hide voucher and money cards based on admin status
          const voucherCard = document.getElementById('generate-voucher-link');
          if (voucherCard) {
              voucherCard.style.display = userData.ski_center_admin === "1" ? 'block' : 'none';
          }
          const moneyCard = document.getElementById('money-link');
          if (moneyCard) {
              moneyCard.style.display = userData.ski_center_admin === "1" ? 'block' : 'none';
          }
      }
    }
    this.updateBackground('dashboard');

    const settingsIcon = document.querySelector('.settings-icon-container');
    if (settingsIcon) {
        settingsIcon.style.display = 'flex';
    }
  }

  showSettings() {
    this.logger.debug('Showing settings');
    
    const containers = ['dashboard-container', 'snow-report-form', 'voucher-form-container', 'voucher-display-container', 'money-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
          this.logger.debug(`Hidden container: ${id}`);
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

  resetTestVoucherCheckbox() {
    const testVoucherCheckbox = document.getElementById('test-voucher-checkbox');
    if (testVoucherCheckbox) {
      testVoucherCheckbox.checked = false;
      this.logger.debug('Test voucher checkbox reset');
    }
  }

  showVoucherForm() {
    this.logger.debug('Showing voucher form');
    
    const containers = ['dashboard-container', 'snow-report-form', 'settings-container', 'voucher-display-container', 'money-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
      }
    });

    const voucherFormContainer = document.getElementById('voucher-form-container');
    if (voucherFormContainer) {
      voucherFormContainer.style.display = 'block';
    }
    
    // Reset test voucher checkbox when showing the form
    this.resetTestVoucherCheckbox();
    
    this.updateBackground('form');
  }

  showVoucherDisplay(voucherNumber, qrCodeUrl) {
    this.logger.debug('Showing voucher display', { voucherNumber, qrCodeUrl });
    
    const containers = ['dashboard-container', 'snow-report-form', 'settings-container', 'voucher-form-container', 'money-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
          container.style.display = 'none';
      }
    });

    const voucherDisplayContainer = document.getElementById('voucher-display-container');
    const voucherNumberElement = document.getElementById('voucher-number');
    const qrCodeElement = document.getElementById('voucher-qr-code');
    
    if (voucherDisplayContainer) {
      voucherDisplayContainer.style.display = 'block';
    }
    
    if (voucherNumberElement) {
      voucherNumberElement.textContent = voucherNumber;
    }
    
    if (qrCodeElement && qrCodeUrl) {
      qrCodeElement.innerHTML = '';
      // QRCode is loaded from vendor, available globally
      if (typeof QRCode !== 'undefined') {
        try {
          // qrcodejs library API
          const qr = new QRCode(qrCodeElement, {
            text: qrCodeUrl,
            width: 300,
            height: 300,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
          });
        } catch (error) {
          this.logger.error('Error generating QR code:', error);
        }
      } else {
        this.logger.error('QRCode library not loaded');
      }
    }
    
    this.updateBackground('form');
  }

  showMoneyPage() {
    this.logger.debug('Showing money page');
    const containers = ['dashboard-container', 'snow-report-form', 'settings-container', 'voucher-form-container', 'voucher-display-container'];
    containers.forEach(id => {
      const container = document.getElementById(id);
      if (container) container.style.display = 'none';
    });
    const moneyContainer = document.getElementById('money-container');
    if (moneyContainer) {
      moneyContainer.style.display = 'block';
      this.renderMoneyBalances();
    }
    this.updateBackground('form');
  }

  renderMoneyBalances() {
    const listEl = document.getElementById('money-balance-list');
    const errorEl = document.getElementById('money-error');
    const successEl = document.getElementById('money-success');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    if (successEl) successEl.style.display = 'none';
    if (!listEl) return;
    const stateManager = StateManager.getInstance();
    const storage = stateManager.getState('storage.userData');
    const centers = storage?.ski_centers_data || [];
    if (centers.length === 0) {
      listEl.innerHTML = `<p class="money-empty">${this.i18next.t('money.noCenters')}</p>`;
      return;
    }
    listEl.innerHTML = centers.map((center) => {
      const id = center[0]?.[0] ?? '';
      const name = center[1]?.[0] ?? '';
      const balanceRaw = center[2]?.[0];
      const balance = balanceRaw !== undefined && balanceRaw !== null && balanceRaw !== '' ? Number(balanceRaw) : 0;
      const formatted = Number.isNaN(balance) ? String(balanceRaw) : `${balance.toFixed(2)} €`;
      return `
        <div class="money-balance-row" data-center-id="${id}">
          <span class="money-center-name">${this.escapeHtml(name)}</span>
          <span class="money-balance">${this.escapeHtml(formatted)}</span>
          <button type="button" class="settings-button money-transfer-btn" data-center-id="${id}" data-i18n="money.requestTransfer">Request transfer</button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.money-transfer-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const centerId = e.currentTarget.getAttribute('data-center-id');
        if (centerId) this.handleMoneyTransferRequest(centerId);
      });
      this.addButtonHoverEffects(btn);
    });
    this.updateFullPageContent();
  }

  escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async handleMoneyTransferRequest(scenterNid) {
    const errorEl = document.getElementById('money-error');
    const successEl = document.getElementById('money-success');
    const authManager = AuthManager.getInstance();
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
    if (successEl) successEl.style.display = 'none';
    try {
      // Refresh token before request so expired token doesn't cause 401
      await authManager.checkAndRefreshToken();

      const configManager = ConfigManager.getInstance();
      const endpoint = configManager.getEndpoint('money.requestTransfer');
      await NetworkManager.getInstance().post(endpoint, { scenter_nid: scenterNid });
      if (successEl) {
        successEl.textContent = this.i18next.t('money.transferRequested');
        successEl.style.display = 'block';
      }
    } catch (err) {
      this.logger.error('Money transfer request failed:', err);
      const responseData = err.response?.data;
      if (err.response?.status === 401 && responseData) {
        this.logger.warn('Balance transfer 401 – server says:', {
          code: responseData.code,
          error: responseData.error,
          detail: responseData.detail
        });
      }
      if (errorEl) {
        const is401 = err.response?.status === 401;
        errorEl.textContent = is401
          ? this.i18next.t('money.transferUnauthorized')
          : this.i18next.t('money.transferError');
        errorEl.style.display = 'block';
      }
      // If 401, re-check auth so user may be prompted to log in again
      if (err.response?.status === 401) {
        const stillLoggedIn = await authManager.checkAuthStatus();
        if (!stillLoggedIn) {
          this.showLoginPrompt();
        }
      }
    }
  }

  async setupMoneyButtons() {
    const refreshBtn = document.getElementById('money-refresh-button');
    const backBtn = document.getElementById('money-back-button');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        const errorEl = document.getElementById('money-error');
        const successEl = document.getElementById('money-success');
        if (errorEl) {
          errorEl.style.display = 'none';
          errorEl.textContent = '';
        }
        if (successEl) successEl.style.display = 'none';
        refreshBtn.disabled = true;
        window.dispatchEvent(new CustomEvent('request-refresh-user-data'));
      });
      this.addButtonHoverEffects(refreshBtn);
    }
    window.addEventListener('user-data-refreshed', (e) => {
      const refreshBtn = document.getElementById('money-refresh-button');
      if (refreshBtn) refreshBtn.disabled = false;
      const moneyContainer = document.getElementById('money-container');
      if (moneyContainer && moneyContainer.style.display === 'block') {
        const detail = e?.detail;
        if (detail?.error) {
          const errorEl = document.getElementById('money-error');
          if (errorEl) {
            errorEl.textContent = this.i18next.t('money.refreshError');
            errorEl.style.display = 'block';
          }
        } else {
          this.renderMoneyBalances();
        }
      }
    });
    if (backBtn) {
      backBtn.addEventListener('click', async () => this.showDashboard());
      this.addButtonHoverEffects(backBtn);
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
          const moneyContainer = document.getElementById('money-container');
          
          if (dashboardContainer) dashboardContainer.style.display = 'none';
          if (settingsContainer) settingsContainer.style.display = 'none';
          if (snowReportForm) snowReportForm.style.display = 'block';
          if (moneyContainer) moneyContainer.style.display = 'none';

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
      const distanceText = this.i18next.t('dashboard.recordingStatsDist', {
          distance: distance
      });
      const elevationText = this.i18next.t('dashboard.recordingStatsEle', {
          elevation: elevation
      });
      card.querySelector('p').textContent = `${distanceText} ${elevationText}`;
  
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
      'snow-report-form',
      'voucher-form-container',
      'voucher-display-container',
      'money-container'
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

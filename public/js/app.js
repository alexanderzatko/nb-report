import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import HttpBackend from '/node_modules/i18next-http-backend/esm/index.js';
import LanguageDetector from '/node_modules/i18next-browser-languagedetector/dist/esm/i18nextBrowserLanguageDetector.js';
import Logger from './utils/Logger.js';
import AuthManager from './auth/AuthManager.js';
import UIManager from './ui/UIManager.js';
import NetworkManager from './network/NetworkManager.js';
import StateManager from './state/StateManager.js';
import ServiceWorkerManager from './services/ServiceWorkerManager.js';
import { initI18next, resetI18next } from './i18n.js';
import FormManager from './form/FormManager.js';
import SelectManager from './managers/SelectManager.js';
import PhotoManager from './media/PhotoManager.js';
import GPSManager from './managers/GPSManager.js';
import DatabaseManager from './managers/DatabaseManager.js';
import SettingsManager from './managers/SettingsManager.js';
import StorageManager from './storage/StorageManager.js';

class App {
  constructor() {
    if (App.instance) {
      return App.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.managers = {};
    this.i18next = i18next;
    this.processingAuth = false;
    this.featureManagersInitialized = false;
    this.initializationInProgress = false;
    App.instance = this;
  }

  static getInstance() {
    if (!App.instance) {
      App.instance = new App();
    }
    return App.instance;
  }

  async start() {
    if (this.initialized) {
      return;
    }
    
    try {
      await this.initializeCoreSystem();
    } catch (error) {
      this.logger.error('Core initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  async initializeCoreSystem() {
      try {
        await initI18next();
  
        // Initialize only essential managers
        this.managers = {
          state: StateManager.getInstance(),
          auth: AuthManager.getInstance(),
          ui: UIManager.getInstance(),
          network: NetworkManager.getInstance()
        };
  
        // Initialize offline detection
        window.addEventListener('online', () => this.handleOnlineStatus());
        window.addEventListener('offline', () => this.handleOfflineStatus());
  
        // Single unified auth state change handler
        this.managers.auth.subscribe('authStateChange', async (isAuthenticated) => {
          if (this.initializationInProgress) return;
    
          try {
            if (isAuthenticated) {
              // First restore any cached state
              const stateManager = StateManager.getInstance();
              await stateManager.restorePersistedState();
    
              // Update UI with whatever data we have
              const userData = stateManager.getState('auth.user');
              await this.managers.ui.updateUIBasedOnAuthState(true, userData);
    
              // If we're online, refresh the data
              if (navigator.onLine) {
                try {
                  await this.refreshUserData();
                } catch (error) {
                  if (!userData) {
                    throw error; // Only throw if we don't have cached data
                  }
                }
              }
    
              // Initialize feature managers
              await this.initializeFeatureManagers();
            } else {
              await this.deactivateFeatureManagers();
              await this.managers.ui.initializeLoginUI();
            }
          } catch (error) {
            console.error('Error handling auth state change:', error);
            if (navigator.onLine) {
              await this.managers.auth.logout();
            }
          }
        });
  
        // Initialize service worker for PWA functionality
        if ('serviceWorker' in navigator) {
          this.managers.serviceWorker = ServiceWorkerManager.getInstance();
          await this.managers.serviceWorker.initialize();
        }
  
        // Check auth state last
        const isAuthenticated = await this.managers.auth.checkAuthStatus();
        if (!isAuthenticated && !await this.checkForURLParameters()) {
          await this.managers.ui.initializeLoginUI();
        }
    
        this.initialized = true;  
      } catch (error) {
        this.logger.error('Failed to initialize core system:', error);
        throw error;
      }
  }

  async initializeCorei18n() {
    // Only initialize if not already initialized
    if (!this.i18next.isInitialized) {
      await this.i18next
        .use(HttpBackend)
        .use(LanguageDetector)
        .init({
          fallbackLng: 'en',
          load: 'languageOnly',
          debug: true,
          backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json'
          },
          detection: {
            order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
            lookupQuerystring: 'lng',
            lookupCookie: 'i18next',
            lookupLocalStorage: 'i18nextLng',
            caches: ['localStorage', 'cookie'],
          }
        });
    }
  
    this.logger.debug(`Initialized core i18n with language: ${this.i18next.language}`);
  }

  async checkForURLParameters() {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('code') && !this.processingAuth) {
          this.processingAuth = true;
          this.initializationInProgress = true;
          try {
              console.log('Processing OAuth callback...');
              const success = await this.managers.auth.handleOAuthCallback(
                  urlParams.get('code'),
                  urlParams.get('state')
              );
              window.history.replaceState({}, document.title, '/');
              
            if (success) {
              console.log('OAuth callback successful, fetching user data...');
              // First fetch user data
              const userData = await this.refreshUserData();
              await this.managers.ui.updateUIBasedOnAuthState(true, userData);
              await this.initializeFeatureManagers();
              return true;
            } else {
              console.log('OAuth callback failed, showing login...');
              await this.managers.ui.initializeLoginUI();
            }
          } finally {
              this.processingAuth = false;
              this.initializationInProgress = false;
          }
      }
      return false;
  }

  async refreshUserData() {
    try {
      const userData = await this.managers.network.get('/api/user-data');
      if (userData) {
        // Cache the full user data response
        localStorage.setItem('cached_user_data', JSON.stringify(userData));
        
        const stateManager = StateManager.getInstance();
        stateManager.setState('storage.userData', userData);
        
        // Prepare current user data object
        const currentUserData = {
          language: userData.language,
          nabezky_uid: userData.nabezky_uid,
          rovas_uid: userData.rovas_uid,
          ski_center_admin: userData.ski_center_admin,
          user_name: userData.user_name
        };
  
        // Handle ski center data for admin users
        if (userData.ski_center_admin === "1" && userData.ski_centers_data?.length > 0) {
          const storageManager = StorageManager.getInstance();
          const savedCenterId = storageManager.getSelectedSkiCenter();
          
          let selectedCenter;
          if (savedCenterId) {
            // Find saved center in the available centers
            selectedCenter = userData.ski_centers_data.find(center => 
              center[0][0] === String(savedCenterId)
            );
          }
          
          // If no saved center or saved center not found, use first center
          if (!selectedCenter) {
            selectedCenter = userData.ski_centers_data[0];
            // Save the first center as new preference
            await storageManager.setSelectedSkiCenter(selectedCenter[0][0]);
          }
  
          // Add selected center's data to currentUserData
          currentUserData.ski_center_id = selectedCenter[0][0];
          currentUserData.ski_center_name = selectedCenter[1][0];
          currentUserData.trails = selectedCenter[2];
        } else {
          // For non-admin users, clear any stored ski center data
          const storageManager = StorageManager.getInstance();
          storageManager.clearSelectedSkiCenter();
        }
  
        // Update auth data with user context
        const authManager = AuthManager.getInstance();
        const currentAuthData = authManager.getStoredAuthData();
        if (currentAuthData) {
          await authManager.updateStoredAuthData({
            ...currentAuthData,
            userData: currentUserData
          });
        }
  
        // Set the full user state
        stateManager.setState('auth.user', currentUserData);
        
        return currentUserData;
      }
    } catch (error) {
      console.error('Error refreshing user data:', error);
      throw error;
    }
  }

  async initializeFeatureManagers() {
    if (this.featureManagersInitialized) {
      return;
    }

    this.logger.debug('Initializing feature managers');

    try {
      // Now load complete translations
      await initI18next();

      // Initialize feature managers in correct order
      this.managers.database = DatabaseManager.getInstance();
      await this.managers.database.getDatabase();

      this.managers.select = SelectManager.getInstance();
      this.managers.form = FormManager.getInstance();
      this.managers.photo = PhotoManager.getInstance();
      this.managers.gps = GPSManager.getInstance();
      this.managers.settings = SettingsManager.getInstance();
      await this.managers.settings.initialize();

      // Initialize remaining managers
      await this.managers.select.initialize();
      await this.managers.form.initialize();

      // Get user data from state before initializing UI
      const stateManager = StateManager.getInstance();
      const userData = stateManager.getState('auth.user');

      // Initialize full UI features
      await this.managers.ui.initializeAuthenticatedUI();

      // Check GPS features last
      if (this.managers.gps.isSupported()) {
        const hasActiveRecording = await this.managers.gps.checkForActiveRecording();
        if (hasActiveRecording) {
          await this.managers.ui.updateGPSCardVisibility();
        } else {
          const latestTrack = await this.managers.gps.loadLatestTrack();
          if (latestTrack) {
            await this.managers.ui.showGPSTrackCard();
          }
        }
      }

      this.featureManagersInitialized = true;
      this.logger.debug('Feature managers initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize feature managers:', error);
      throw error;
    }
  }

  async deactivateFeatureManagers() {
    if (!this.featureManagersInitialized) {
      return;
    }

    this.logger.debug('Deactivating feature managers');

    try {
      // Clean up each manager
      if (this.managers.gps) {
        this.managers.gps.stopRecording();
        this.managers.gps.clearTrack();
      }

      if (this.managers.form) {
        this.managers.form.resetForm();
      }

      if (this.managers.photo) {
        this.managers.photo.clearPhotos();
      }

      if (this.managers.select) {
        this.managers.select.clearState();
      }

      if (this.managers.database) {
        await this.managers.database.clearDatabase();
      }

      // Reset UI to login state
      await this.managers.ui.resetToLoginState();

      this.featureManagersInitialized = false;
      this.logger.debug('Feature managers deactivated');

    } catch (error) {
      this.logger.error('Error deactivating feature managers:', error);
    }
  }

  handleInitializationError(error) {
    this.logger.error('Initialization error:', error);
    const errorMessage = this.i18next.isInitialized ? 
      this.i18next.t('errors.application.initFailed') : 
      'Application initialization failed. Please try again.';
    alert(errorMessage);
  }
}

// Create and export app instance
const app = App.getInstance();

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.start().catch(error => {
    console.error('Failed to start application:', error);
  });
});

export default app;

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import Logger from './utils/Logger.js';
import AuthManager from './auth/AuthManager.js';
import UIManager from './ui/UIManager.js';
import StateManager from './state/StateManager.js';
import ServiceWorkerManager from './services/ServiceWorkerManager.js';
import { initI18next, resetI18next } from './i18n.js';
import FormManager from './form/FormManager.js';
import SelectManager from './managers/SelectManager.js';
import PhotoManager from './media/PhotoManager.js';
import GPSManager from './managers/GPSManager.js';
import DatabaseManager from './managers/DatabaseManager.js';

class App {
  constructor() {
    if (App.instance) {
      return App.instance;
    }
    
    this.logger = Logger.getInstance();
    this.initialized = false;
    this.managers = {};
    this.i18next = i18next;
    this.featureManagersInitialized = false;
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
      // Initialize minimal i18next with only core translations
      await resetI18next();
      await this.initializeCorei18n();

      // Initialize only essential managers
      this.managers = {
        state: StateManager.getInstance(),
        auth: AuthManager.getInstance(),
        ui: UIManager.getInstance()
      };

      // Initialize minimal UI (login screen only)
      await this.managers.ui.initializeLoginUI();

      // Initialize service worker for PWA functionality
      if ('serviceWorker' in navigator) {
        this.managers.serviceWorker = ServiceWorkerManager.getInstance();
        await this.managers.serviceWorker.initialize();
      }

      // Subscribe to auth state changes
      this.managers.auth.subscribe('authStateChange', async (isAuthenticated) => {
        if (isAuthenticated) {
          await this.initializeFeatureManagers();
        } else {
          await this.deactivateFeatureManagers();
        }
      });

      // Check initial auth state
      const isAuthenticated = await this.managers.auth.checkAuthStatus();
      if (isAuthenticated) {
        await this.initializeFeatureManagers();
      } else {
        this.managers.ui.initializeLoginUI();
      }

      this.initialized = true;
      this.logger.debug('Core system initialized');

    } catch (error) {
      this.logger.error('Failed to initialize core system:', error);
      throw error;
    }
  }

  async initializeCorei18n() {
    const coreTranslations = {
      'auth': true,
      'errors': true,
      'common': true
    };

    // Initialize i18next with language detection for core translations
    await i18next
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

    this.logger.debug(`Initialized core i18n with language: ${i18next.language}`);
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
      await this.managers.database.initialize();

      this.managers.select = SelectManager.getInstance();
      this.managers.form = FormManager.getInstance();
      this.managers.photo = PhotoManager.getInstance();
      this.managers.gps = GPSManager.getInstance();

      // Initialize remaining managers
      await this.managers.select.initialize();
      await this.managers.form.initialize();
      
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
        await this.managers.database.clearStores();
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

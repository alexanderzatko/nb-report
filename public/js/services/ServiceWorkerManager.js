// services/ServiceWorkerManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class ServiceWorkerManager {
  static instance = null;

  constructor() {
    if (ServiceWorkerManager.instance) {
      return ServiceWorkerManager.instance;
    }
    
    this.registration = null;
    this.updateFound = false;
    this.i18next = i18next;

    ServiceWorkerManager.instance = this;
  }

  static getInstance() {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }
  
  async initialize() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker is not supported in this browser');
      return false;
    }

    try {
      await this.registerServiceWorker();
      this.setupUpdateHandling();
      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  async registerServiceWorker() {
    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('ServiceWorker registration successful with scope:', this.registration.scope);
      return true;
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
      throw error;
    }
  }

  setupUpdateHandling() {
    if (!this.registration) return;

    // Handle updates found during initial registration
    if (this.registration.waiting) {
      this.updateFound = true;
      this.notifyUpdateReady();
    }

    // Handle updates found after page load
    this.registration.addEventListener('updatefound', () => {
      const newWorker = this.registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.updateFound = true;
          this.notifyUpdateReady();
        }
      });
    });

    // Handle controller change
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.updateFound) {
        console.log('New service worker activated, reloading page...');
        window.location.reload();
      }
    });
  }

  notifyUpdateReady() {
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-notification-content">
        <div class="update-notification-header">
          <h3>${this.i18next.t('updates.newVersionTitle')}</h3>
          <button class="update-notification-close">&times;</button>
        </div>
        <p>${this.i18next.t('updates.newVersionMessage')}</p>
        <div class="update-notification-actions">
          <button class="update-notification-update">${this.i18next.t('updates.updateNow')}</button>
          <button class="update-notification-later">${this.i18next.t('updates.updateLater')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(notification);

    const closeBtn = notification.querySelector('.update-notification-close');
    const updateBtn = notification.querySelector('.update-notification-update');
    const laterBtn = notification.querySelector('.update-notification-later');

    const removeNotification = () => {
      notification.classList.add('update-notification-hiding');
      setTimeout(() => notification.remove(), 300);
    };

    closeBtn.addEventListener('click', removeNotification);
    laterBtn.addEventListener('click', removeNotification);
    updateBtn.addEventListener('click', () => {
      removeNotification();
      this.applyUpdate();
    });

    // Update translations when language changes
    window.addEventListener('languageChanged', () => {
      const title = notification.querySelector('h3');
      const message = notification.querySelector('p');
      const updateButton = notification.querySelector('.update-notification-update');
      const laterButton = notification.querySelector('.update-notification-later');

      title.textContent = this.i18next.t('updates.newVersionTitle');
      message.textContent = this.i18next.t('updates.newVersionMessage');
      updateButton.textContent = this.i18next.t('updates.updateNow');
      laterButton.textContent = this.i18next.t('updates.updateLater');
    });
  }

  async applyUpdate() {
    if (!this.registration) return;

    try {
      if (this.registration.waiting) {
        // Send message to service worker to skip waiting
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Error applying update:', error);
      // Force reload as fallback
      window.location.reload();
    }
  }

  async clearCache() {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => caches.delete(key))
      );
      console.log('Cache cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  async preloadResources(resources) {
    if (!this.registration) return;

    try {
      const cache = await caches.open('snow-report-cache');
      await cache.addAll(resources);
      console.log('Resources preloaded successfully');
      return true;
    } catch (error) {
      console.error('Error preloading resources:', error);
      return false;
    }
  }

  async postMessageToSW(message) {
    if (!this.registration || !this.registration.active) return;

    try {
      this.registration.active.postMessage(message);
      return true;
    } catch (error) {
      console.error('Error posting message to Service Worker:', error);
      return false;
    }
  }

  // Optional: Monitor service worker lifecycle states
  setupLifecycleMonitoring() {
    navigator.serviceWorker.addEventListener('message', event => {
      console.log('Message from service worker:', event.data);
    });

    if (this.registration) {
      ['installing', 'waiting', 'active'].forEach(state => {
        const worker = this.registration[state];
        if (worker) {
          worker.addEventListener('statechange', () => {
            console.log(`Service worker ${state} state changed to:`, worker.state);
          });
        }
      });
    }
  }

  // Optional: Handle offline/online status
  setupNetworkStatusHandling() {
    window.addEventListener('online', () => {
      console.log('Application is online');
      this.postMessageToSW({ type: 'ONLINE' });
    });

    window.addEventListener('offline', () => {
      console.log('Application is offline');
      this.postMessageToSW({ type: 'OFFLINE' });
    });
  }

  // Get current service worker registration
  getRegistration() {
    return this.registration;
  }

  // Check if service worker is supported and active
  isServiceWorkerActive() {
    return !!navigator.serviceWorker.controller;
  }
}

export default ServiceWorkerManager;

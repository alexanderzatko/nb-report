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
      
      // Check for existing waiting worker
      if (this.registration.waiting) {
        console.log('[ServiceWorker] Found waiting worker on initial registration');
        this.updateFound = true;
        await this.notifyUpdateReady();
      }
  
      // Listen for new updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        console.log('[ServiceWorker] Update found - new worker installing');
        
        newWorker.addEventListener('statechange', () => {
          console.log('[ServiceWorker] New worker state:', newWorker.state);
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[ServiceWorker] New version installed and waiting');
            this.updateFound = true;
            this.notifyUpdateReady();
          }
        });
      });
  
      // Handle controller change
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[ServiceWorker] Controller changed');
        if (refreshing) {
          console.log('[ServiceWorker] Refresh already in progress');
          return;
        }
        refreshing = true;
        console.log('[ServiceWorker] Reloading page for new version');
        window.location.reload();
      });
  
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

  async notifyUpdateReady() {
    console.log('[ServiceWorker] Showing update notification');
    
    // Remove any existing notification
    const existingNotification = document.querySelector('.update-notification');
    if (existingNotification) {
      console.log('[ServiceWorker] Removing existing notification');
      existingNotification.remove();
    }
  
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
  
    // Add notification to DOM
    document.body.appendChild(notification);
    console.log('[ServiceWorker] Update notification added to DOM');
  
    // Handle update button click
    const updateButton = notification.querySelector('.update-notification-update');
    updateButton.addEventListener('click', async () => {
      console.log('[ServiceWorker] Update button clicked');
      notification.classList.add('update-notification-hiding');
      setTimeout(() => notification.remove(), 300);
      await this.applyUpdate();
    });
  
    // Handle later button click
    const laterButton = notification.querySelector('.update-notification-later');
    laterButton.addEventListener('click', () => {
      console.log('[ServiceWorker] Later button clicked');
      notification.classList.add('update-notification-hiding');
      setTimeout(() => notification.remove(), 300);
    });
  
    // Handle close button click
    const closeButton = notification.querySelector('.update-notification-close');
    closeButton.addEventListener('click', () => {
      console.log('[ServiceWorker] Close button clicked');
      notification.classList.add('update-notification-hiding');
      setTimeout(() => notification.remove(), 300);
    });
  
    // Prevent notification from being automatically removed
    return new Promise(resolve => {
      notification.addEventListener('transitionend', () => {
        if (notification.classList.contains('update-notification-hiding')) {
          notification.remove();
          resolve();
        }
      });
    });
  }

  async applyUpdate() {
    if (!this.registration) {
      console.log('[ServiceWorker] No registration available for update');
      return;
    }
  
    try {
      if (this.registration.waiting) {
        console.log('[ServiceWorker] Sending skip waiting message');
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        console.log('[ServiceWorker] No waiting worker to update to');
      }
    } catch (error) {
      console.error('[ServiceWorker] Error applying update:', error);
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

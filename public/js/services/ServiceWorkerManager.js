// services/ServiceWorkerManager.js

class ServiceWorkerManager {
  constructor() {
    if (ServiceWorkerManager.instance) {
      return ServiceWorkerManager.instance;
    }
    
    this.registration = null;
    this.updateFound = false;
    this.i18next = i18next;
    
    ServiceWorkerManager.instance = this;
  }

  async initialize() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker is not supported in this browser');
      return false;
    }

    try {
      await this.registerServiceWorker();
      this.setupUpdateHandling();
      
      // Check for updates every 30 minutes
      setInterval(() => {
        this.checkForUpdates();
      }, 30 * 60 * 1000);
      
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
      
      // Check for waiting service worker immediately after registration
      if (this.registration.waiting) {
        this.notifyUpdateReady();
      }
      
      return true;
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
      throw error;
    }
  }

  async checkForUpdates() {
    if (!this.registration) return;
    
    try {
      await this.registration.update();
      console.log('Service Worker update check completed');
    } catch (error) {
      console.error('Error checking for Service Worker updates:', error);
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

    // Listen for update messages from the service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_AVAILABLE') {
        this.notifyUpdateReady();
      }
    });
  }

  notifyUpdateReady() {
    // Remove any existing notification first
    const existingNotification = document.querySelector('.update-notification');
    if (existingNotification) {
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
}

export default ServiceWorkerManager;

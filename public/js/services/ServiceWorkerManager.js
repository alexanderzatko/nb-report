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
    this.notificationShown = false;  // Add flag to prevent multiple notifications
    console.log('[ServiceWorkerManager] Initialized');

    ServiceWorkerManager.instance = this;
  }

  static getInstance() {
    if (!ServiceWorkerManager.instance) {
      ServiceWorkerManager.instance = new ServiceWorkerManager();
    }
    return ServiceWorkerManager.instance;
  }

  async initialize() {
    console.log('[ServiceWorkerManager] Starting initialization');
    if (!('serviceWorker' in navigator)) {
      console.log('[ServiceWorkerManager] Service Worker not supported');
      return false;
    }

    // Wait for i18next to be ready
    if (!this.i18next.isInitialized) {
      console.log('[ServiceWorkerManager] Waiting for i18next initialization');
      await new Promise(resolve => {
        this.i18next.on('initialized', resolve);
      });
    }

    try {
      await this.registerServiceWorker();
      console.log('[ServiceWorkerManager] Initialization complete');
      return true;
    } catch (error) {
      console.error('[ServiceWorkerManager] Initialization failed:', error);
      return false;
    }
  }

  async registerServiceWorker() {
    console.log('[ServiceWorkerManager] Registering service worker');
    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('[ServiceWorkerManager] Registration successful, scope:', this.registration.scope);
  
      // Check for waiting worker immediately
      if (this.registration.waiting) {
        console.log('[ServiceWorkerManager] Found waiting worker on initial registration');
        this.updateFound = true;
        // Add delay before showing notification
        setTimeout(() => this.notifyUpdateReady(), 2000);
      }
  
      // Watch for new updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        console.log('[ServiceWorker] Update found, new worker installing');
        
        newWorker.addEventListener('statechange', () => {
          console.log('[ServiceWorker] Worker state changed to:', newWorker.state);
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[ServiceWorker] New version ready to activate');
            this.updateFound = true;
            // Add delay before showing notification
            setTimeout(() => this.notifyUpdateReady(), 2000);
          }
        });
      });
  
      // Handle page reload after service worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
  
      return true;
    } catch (error) {
      console.error('[ServiceWorkerManager] Registration failed:', error);
      throw error;
    }
  }

  async notifyUpdateReady() {
    if (this.notificationShown) {
      console.log('[ServiceWorkerManager] Notification already shown');
      return;
    }
  
    console.log('[ServiceWorkerManager] Creating update notification');
    this.notificationShown = true;
  
    // Create notification element
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
    console.log('[ServiceWorkerManager] Notification added to DOM');
  
    return new Promise((resolve) => {
      const cleanup = () => {
        notification.classList.add('update-notification-hiding');
        setTimeout(() => {
          notification.remove();
          resolve();
        }, 300);
      };
  
      notification.querySelector('.update-notification-update').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Update button clicked');
        this.applyUpdate();
        cleanup();
      });
  
      notification.querySelector('.update-notification-later').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Later button clicked');
        cleanup();
      });
  
      notification.querySelector('.update-notification-close').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Close button clicked');
        cleanup();
      });
    });
  }

  async applyUpdate() {
    console.log('[ServiceWorkerManager] Applying update');
    if (!this.registration || !this.registration.waiting) {
      console.log('[ServiceWorkerManager] No waiting worker to activate');
      return;
    }

    try {
      console.log('[ServiceWorkerManager] Sending SKIP_WAITING message');
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.error('[ServiceWorkerManager] Error applying update:', error);
      window.location.reload();
    }
  }
}

export default ServiceWorkerManager;

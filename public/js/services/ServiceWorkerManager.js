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
    console.log('[ServiceWorkerManager] Initialized');

    ServiceWorkerManager.instance = this;
  }

  async initialize() {
    console.log('[ServiceWorkerManager] Starting initialization');
    if (!('serviceWorker' in navigator)) {
      console.log('[ServiceWorkerManager] Service Worker not supported');
      return false;
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

      // Immediately check for waiting worker
      if (this.registration.waiting) {
        console.log('[ServiceWorkerManager] Found waiting worker on initial check');
        this.updateFound = true;
        await this.notifyUpdateReady();
      }

      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        console.log('[ServiceWorkerManager] Update found, new worker installing');

        newWorker.addEventListener('statechange', () => {
          console.log('[ServiceWorkerManager] Worker state changed to:', newWorker.state);
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[ServiceWorkerManager] New version ready to activate');
            this.updateFound = true;
            this.notifyUpdateReady().catch(console.error);
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[ServiceWorkerManager] Controller changed');
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
    console.log('[ServiceWorkerManager] Creating update notification');
    
    // Remove any existing notification
    const existing = document.querySelector('.update-notification');
    if (existing) {
      console.log('[ServiceWorkerManager] Removing existing notification');
      existing.remove();
    }

    return new Promise((resolve) => {
      const notification = document.createElement('div');
      notification.className = 'update-notification';
      
      // Store reference to prevent garbage collection
      this.currentNotification = notification;
      
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

      // Add notification to DOM after a small delay
      setTimeout(() => {
        document.body.appendChild(notification);
        console.log('[ServiceWorkerManager] Notification added to DOM');
      }, 1000);

      // Handle update button
      notification.querySelector('.update-notification-update').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Update button clicked');
        this.applyUpdate();
        notification.classList.add('update-notification-hiding');
        setTimeout(() => notification.remove(), 300);
        resolve();
      });

      // Handle later button
      notification.querySelector('.update-notification-later').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Later button clicked');
        notification.classList.add('update-notification-hiding');
        setTimeout(() => notification.remove(), 300);
        resolve();
      });

      // Handle close button
      notification.querySelector('.update-notification-close').addEventListener('click', () => {
        console.log('[ServiceWorkerManager] Close button clicked');
        notification.classList.add('update-notification-hiding');
        setTimeout(() => notification.remove(), 300);
        resolve();
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

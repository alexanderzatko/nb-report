import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import AuthManager from '../auth/AuthManager.js';

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
        await this.notifyUpdateReady();
      }
  
      // Watch for new updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        console.log('[ServiceWorker] Update found, new worker installing');
        
        if (!newWorker) {
          console.log('[ServiceWorker] No installing worker found');
          return;
        }
  
        // Add error handling for the installing worker
        newWorker.addEventListener('error', (error) => {
          console.error('[ServiceWorker] Worker installation error:', error);
        });
        
        newWorker.addEventListener('statechange', () => {
          console.log('[ServiceWorker] Worker state changed to:', newWorker.state);
          
          switch (newWorker.state) {
            case 'installed':
              if (navigator.serviceWorker.controller) {
                // Ensure we don't proceed if already redundant
                if (newWorker.state !== 'redundant') {
                  console.log('[ServiceWorker] New version ready to activate');
                  this.updateFound = true;
                  this.notifyUpdateReady();
                }
              } else {
                console.log('[ServiceWorker] Service Worker installed for the first time');
              }
              break;
            case 'activating':
              console.log('[ServiceWorker] Worker activating');
              break;
            case 'activated':
              console.log('[ServiceWorker] Worker activated');
              break;
            case 'redundant':
              console.log('[ServiceWorker] Worker became redundant');
              // Log additional information about why it became redundant
              if (this.registration.installing) {
                console.log('[ServiceWorker] New worker is installing');
              }
              if (this.registration.waiting) {
                console.log('[ServiceWorker] New worker is waiting');
              }
              if (this.registration.active) {
                console.log('[ServiceWorker] Active worker state:', this.registration.active.state);
              }
              break;
            default:
              console.log('[ServiceWorker] Worker state:', newWorker.state);
          }
        });
      });
  
      // Listen for install completion
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[ServiceWorker] Controller changed');
        if (!this.refreshing) {
          this.refreshing = true;
          window.location.reload();
        }
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

    // Wait for i18next to be fully initialized
    if (!this.i18next.isInitialized) {
      console.log('[ServiceWorkerManager] Waiting for i18next');
      await new Promise(resolve => {
        const checkInterval = setInterval(() => {
          if (this.i18next.isInitialized) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }

    console.log(`[ServiceWorkerManager] Creating update notification in language: ${this.i18next.language}`);

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
        this.handleUpdate();
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

  async handleUpdate() {
     try {
         if (!navigator.onLine) {
             this.notifyUpdateReady();
             return;
         }
  
         const authManager = AuthManager.getInstance();
         const isAuthenticated = await Promise.race([
             authManager.checkAuthStatus(),
             new Promise((_, reject) => setTimeout(() => 
                 reject(new Error('Auth check timeout')), 5000))
         ]);
         
         if (isAuthenticated) {
             try {
                 await authManager.refreshToken();
             } catch (error) {
                 console.error('Token refresh failed during update:', error);
             }
         }
         
         await this.applyUpdate();
         
     } catch (error) {
         console.error('Update handling failed:', error);
         this.notifyUpdateReady();
     }
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

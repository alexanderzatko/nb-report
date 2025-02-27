// storage/StorageManager.js

import Logger from '../utils/Logger.js';
import ConfigManager from '../config/ConfigManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';

class StorageManager {
  static instance = null;

  constructor() {
    if (StorageManager.instance) {
      return StorageManager.instance;
    }

    this.logger = Logger.getInstance();
    this.configManager = ConfigManager.getInstance();
    this.storageKeys = this.configManager.getStorageKeys();
    this.dbManager = DatabaseManager.getInstance();
    this.db = null;

    StorageManager.instance = this;
  }

  static getInstance() {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  // IndexedDB operations
  async saveToStore(storeName, data) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error saving to ${storeName}:`, error);
      throw error;
    }
  }

  async getFromStore(storeName, key) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error reading from ${storeName}:`, error);
      throw error;
    }
  }

  async getAllFromStore(storeName) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error reading all from ${storeName}:`, error);
      throw error;
    }
  }

  async updateInStore(storeName, key, data) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error updating in ${storeName}:`, error);
      throw error;
    }
  }

  async deleteFromStore(storeName, key) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error deleting from ${storeName}:`, error);
      throw error;
    }
  }

  async clearStore(storeName) {
    try {
      const db = await this.dbManager.getDatabase();
      const store = db.transaction(storeName, 'readwrite').objectStore(storeName);
      
      return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      this.logger.error(`Error clearing store ${storeName}:`, error);
      throw error;
    }
  }

  getObjectStore(storeName, mode = 'readonly') {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // LocalStorage operations with error handling
  setLocalStorage(key, value) {
    try {
      const serializedValue = JSON.stringify(value);
      localStorage.setItem(key, serializedValue);
      return true;
    } catch (error) {
      this.logger.error('Error setting localStorage:', error);
      return false;
    }
  }

  getLocalStorage(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      // Try to parse as JSON, if it fails return the raw value
      try {
        return JSON.parse(item);
      } catch (e) {
        // If it's not valid JSON, return the raw string
        return item;
      }
    } catch (error) {
      this.logger.error('Error getting localStorage:', error);
      return defaultValue;
    }
  }

  removeLocalStorage(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      this.logger.error('Error removing localStorage:', error);
      return false;
    }
  }

  // Session Storage operations
  setSessionStorage(key, value) {
    try {
      const serializedValue = JSON.stringify(value);
      sessionStorage.setItem(key, serializedValue);
      return true;
    } catch (error) {
      this.logger.error('Error setting sessionStorage:', error);
      return false;
    }
  }

  getSessionStorage(key, defaultValue = null) {
    try {
      const item = sessionStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      this.logger.error('Error getting sessionStorage:', error);
      return defaultValue;
    }
  }

  removeSessionStorage(key) {
    try {
      sessionStorage.removeItem(key);
      return true;
    } catch (error) {
      this.logger.error('Error removing sessionStorage:', error);
      return false;
    }
  }

  // Specific storage operations for the app
  async saveReport(reportData) {
    const report = {
      ...reportData,
      date: new Date(),
      status: 'draft'
    };
    return this.saveToStore(this.dbConfig.stores.reports, report);
  }

  async savePhotos(photos) {
    const photoPromises = photos.map(photo => {
      return this.saveToStore(this.dbConfig.stores.photos, {
        file: photo,
        date: new Date()
      });
    });
    return Promise.all(photoPromises);
  }

  async saveTrack(trackData) {
    return this.saveToStore(this.dbConfig.stores.tracks, {
      ...trackData,
      date: new Date()
    });
  }

  // Storage space management
  async getStorageUsage() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage,
          quota: estimate.quota,
          percentage: (estimate.usage / estimate.quota) * 100
        };
      }
      return null;
    } catch (error) {
      this.logger.error('Error getting storage usage:', error);
      return null;
    }
  }

  async cleanupOldData(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      // Cleanup old reports
      const reports = await this.getAllFromStore(this.dbConfig.stores.reports);
      const oldReports = reports.filter(report => new Date(report.date) < cutoffDate);
      await Promise.all(oldReports.map(report => 
        this.deleteFromStore(this.dbConfig.stores.reports, report.id)
      ));

      // Cleanup old photos
      const photos = await this.getAllFromStore(this.dbConfig.stores.photos);
      const oldPhotos = photos.filter(photo => new Date(photo.date) < cutoffDate);
      await Promise.all(oldPhotos.map(photo => 
        this.deleteFromStore(this.dbConfig.stores.photos, photo.id)
      ));

      this.logger.info('Storage cleanup completed', {
        reportsRemoved: oldReports.length,
        photosRemoved: oldPhotos.length
      });
    } catch (error) {
      this.logger.error('Error during storage cleanup:', error);
      throw error;
    }
  }

  // Database maintenance
  async compactDatabase() {
    if (!this.db) return;
    
    try {
      await this.cleanupOldData();
      // Force a garbage collection in IndexedDB
      this.db.close();
      await this.initializeDB();
      this.logger.info('Database compaction completed');
    } catch (error) {
      this.logger.error('Error during database compaction:', error);
      throw error;
    }
  }

  setSelectedSkiCenter(centerId) {
      return this.setLocalStorage(
          this.configManager.getStorageKeys().selectedSkiCenter, 
          centerId
      );
  }

  getSelectedSkiCenter() {
      return this.getLocalStorage(
          this.configManager.getStorageKeys().selectedSkiCenter
      );
  }

  clearSelectedSkiCenter() {
      return this.removeLocalStorage(
          this.configManager.getStorageKeys().selectedSkiCenter
      );
  }
}

export default StorageManager;

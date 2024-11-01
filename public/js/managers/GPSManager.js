// managers/GPSManager.js

import Logger from '../utils/Logger.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class GPSManager {
  static instance = null;

  constructor() {
    if (GPSManager.instance) {
      return GPSManager.instance;
    }

    this.backgroundSync = false;
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        this.backgroundSync = true;
    }
    
    this.logger = Logger.getInstance();
    this.i18next = i18next;
    this.isRecording = false;
    this.currentTrack = null;
    this.watchId = null;
    this.trackPoints = [];
    this.lastPoint = null;
    this.totalDistance = 0;
    this.lastElevation = null;
    
    this.wakeLock = null;
    this.hasWakeLock = 'wakeLock' in navigator;

    // Update dbVersion to trigger onupgradeneeded
    this.dbName = 'GPSTrackerDB';
    this.dbVersion = 2;
    this.db = null;
    this.initializeDB();

    this.recordingMetadata = {
        startTime: null,
        distance: 0,
        elapsedTime: 0
    };

    this.requestPersistentStorage();

    GPSManager.instance = this;
}

  static getInstance() {
    if (!GPSManager.instance) {
      GPSManager.instance = new GPSManager();
    }
    return GPSManager.instance;
  }

  async requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        this.logger.debug('Persistent storage request result:', isPersisted);
        
        // Check if we got persistence
        if (isPersisted) {
          this.logger.debug('Persistent storage granted');
        } else {
          this.logger.warn('Persistent storage denied');
        }
        
        // Also check available space
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          this.logger.debug('Storage estimate:', {
            usage: `${Math.round(estimate.usage / 1024 / 1024)} MB`,
            quota: `${Math.round(estimate.quota / 1024 / 1024)} MB`,
            percentageUsed: `${Math.round((estimate.usage / estimate.quota) * 100)}%`
          });
        }
      }
    } catch (error) {
      this.logger.error('Error requesting persistent storage:', error);
      // Don't throw the error - we can still function without persistence
    }
  }

  checkGPSCapability() {
    // Wait for i18next to be initialized before accessing translations
    if (!this.i18next.isInitialized) {
      return {
        supported: false,
        reason: 'GPS check unavailable' // Fallback message
      };
    }

    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) {
      return {
        supported: false,
        reason: this.i18next.t('errors.gps.androidOnly')
      };
    }
  
    if (!('geolocation' in navigator)) {
      return {
        supported: false,
        reason: this.i18next.t('errors.gps.notAvailable')
      };
    }
  
    return {
      supported: true
    };
  }

  async hasExistingTrack() {
      if (this.currentTrack) {
          return true;
      }
      // Try loading the latest track if none is in memory
      const latestTrack = await this.loadLatestTrack();
      return latestTrack !== null;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(value) {
    return value * Math.PI / 180;
  }

  async startRecording() {
      try {
          const capability = this.checkGPSCapability();
          if (!capability.supported) {
              alert(capability.reason);
              return false;
          }

          const permission = await this.requestLocationPermission();
          if (!permission) {
              throw new Error(this.i18next.t('errors.gps.permissionDenied'));
          }

          if (this.backgroundSync) {
              await navigator.serviceWorker.ready;
              await navigator.serviceWorker.sync.register('gps-sync');
          }

          // Clear any existing active points
          await this.clearActivePoints();
  
          this.trackPoints = [];
          this.totalDistance = 0;
          this.lastPoint = null;
          this.lastElevation = null;
          this.isRecording = true;
  
          if (this.hasWakeLock) {
              try {
                  this.wakeLock = await navigator.wakeLock.request('screen');
                  this.logger.debug('Wake Lock acquired');
              } catch (err) {
                  this.logger.warn('Failed to acquire wake lock:', err);
              }
          }
  
          this.watchId = navigator.geolocation.watchPosition(
              (position) => this.handlePosition(position),
              (error) => this.handleError(error),
              {
                  enableHighAccuracy: true,
                  timeout: 30000,
                  maximumAge: 0
              }
          );
  
          this.recordingMetadata = {
              startTime: new Date().toISOString(),
              distance: 0,
              elapsedTime: 0
          };
  
          // Save initial metadata
          await this.saveTrackMetadata(this.recordingMetadata);
          return true;
  
      } catch (error) {
          this.logger.error('Error starting GPS recording:', error);
          throw error;
      }
  }

  async saveTrackMetadata(metadata) {
      if (!this.db) await this.initializeDB();
      
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['trackMetadata'], 'readwrite');
          const store = transaction.objectStore('trackMetadata');
          
          const request = store.put({
              id: 'current',
              ...metadata
          });
  
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }
  
  async requestLocationPermission() {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      if (result.state === 'granted') {
        return true;
      }
      if (result.state === 'prompt') {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => {
              this.logger.error(this.i18next.t('errors.gps.permissionDenied'));
              resolve(false);
            }
          );
        });
      }
      return false;
    } catch (error) {
      this.logger.error('Error requesting location permission:', error);
      return false;
    }
  }

  async handlePosition(position) {
    const point = {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      ele: position.coords.altitude,
      time: new Date().toISOString(),
      accuracy: position.coords.accuracy
    };

    if (this.lastPoint) {
      const distance = this.calculateDistance(
        this.lastPoint.lat,
        this.lastPoint.lon,
        point.lat,
        point.lon
      );
      this.totalDistance += distance;
    }

    // Update metadata
    this.recordingMetadata.distance = this.totalDistance;
    this.recordingMetadata.elapsedTime = 
        new Date() - new Date(this.recordingMetadata.startTime);
    await this.saveTrackMetadata(this.recordingMetadata);

    this.trackPoints.push(point);
    this.lastPoint = point;
    this.lastElevation = point.ele;

    // Save point to IndexedDB
    try {
      await this.savePoint(point);
    } catch (error) {
      this.logger.error('Failed to save GPS point:', error);
    }

    // Emit update event
    const event = new CustomEvent('gps-update', {
      detail: {
        distance: this.totalDistance,
        elevation: this.lastElevation
      }
    });
    window.dispatchEvent(event);
  }

  async loadTrackMetadata() {
      if (!this.db) await this.initializeDB();
      
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['trackMetadata'], 'readonly');
          const store = transaction.objectStore('trackMetadata');
          const request = store.get('current');
  
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  async clearTrackMetadata() {
      if (!this.db) await this.initializeDB();
      
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['trackMetadata'], 'readwrite');
          const store = transaction.objectStore('trackMetadata');
          const request = store.delete('current');
  
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
      });
  }
  
  handleError(error) {
    this.logger.error('GPS Error:', error);
    // Emit error event
    const event = new CustomEvent('gps-error', {
      detail: { error }
    });
    window.dispatchEvent(event);
  }

  async stopRecording() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.logger.debug('Wake Lock released');
        this.wakeLock = null;
      } catch (err) {
        this.logger.warn('Error releasing wake lock:', err);
      }
    }

    this.isRecording = false;

    // Create track data
    const metadata = await this.loadTrackMetadata();
    const track = {
        points: this.trackPoints,
        totalDistance: this.totalDistance,
        startTime: metadata.startTime,
        endTime: new Date().toISOString(),
        elapsedTime: metadata.elapsedTime
    };

    this.logger.debug('Track data before save:', {
      totalDistance: track.totalDistance,
      pointsCount: track.points.length,
      startTime: track.startTime,
      endTime: track.endTime
    });

    // Save completed track
    try {
      const trackId = await this.saveTrack(track);
      this.currentTrack = track;

      this.logger.debug('Track saved and set as currentTrack:', {
        id: trackId,
        currentTrackSet: !!this.currentTrack,
        currentTrackDistance: this.currentTrack?.totalDistance
      });
          
      // Clear metadata after successful save
      await this.clearTrackMetadata();

      // Clear active points after successful save
      await this.clearActivePoints();
      
      return track;
    } catch (error) {
      this.logger.error('Failed to save completed track:', error);
      throw error;
    }
  }

  getTrackStats() {
    this.logger.debug('Getting track stats, currentTrack:', {
      exists: !!this.currentTrack,
      data: this.currentTrack,
      totalDistance: this.currentTrack?.totalDistance,
      startTime: this.currentTrack?.startTime,
      endTime: this.currentTrack?.endTime
    });
  
    if (!this.currentTrack) {
      this.logger.debug('No current track available');
      return null;
    }
  
    try {
      const stats = {
        distance: Math.round(this.currentTrack.totalDistance),
        startTime: new Date(this.currentTrack.startTime),
        endTime: new Date(this.currentTrack.endTime),
        duration: this.calculateDuration(
          this.currentTrack.startTime,
          this.currentTrack.endTime
        )
      };
      this.logger.debug('Calculated track stats:', stats);
      return stats;
    } catch (error) {
      this.logger.error('Error calculating track stats:', error);
      return null;
    }
  }

  calculateDuration(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diff = end - start;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { hours, minutes };
  }

  getCurrentStats() {
    if (!this.isRecording) return null;
    
    return {
      distance: Math.round(this.totalDistance),
      elevation: this.lastElevation
    };
  }

  clearTrack() {
    this.currentTrack = null;
    this.trackPoints = [];
    this.totalDistance = 0;
    this.lastPoint = null;
    this.lastElevation = null;
  }

  async initializeDB() {
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onerror = (event) => {
          this.logger.error('IndexedDB error:', event.target.error);
          reject(event.target.error);
        };

        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.logger.debug('IndexedDB initialized successfully');
          resolve();
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          // Create tracks store if it doesn't exist
          if (!db.objectStoreNames.contains('tracks')) {
            const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
            trackStore.createIndex('startTime', 'startTime', { unique: false });
          }
          
          // Create points store for active recording if it doesn't exist
          if (!db.objectStoreNames.contains('activePoints')) {
            const pointsStore = db.createObjectStore('activePoints', { keyPath: 'timestamp' });
            pointsStore.createIndex('timestamp', 'timestamp', { unique: false });
          }

          // Create trackMetadata store if it doesn't exist
          if (!db.objectStoreNames.contains('trackMetadata')) {
            db.createObjectStore('trackMetadata', { keyPath: 'id' });
          }
        };
      });
    } catch (error) {
      this.logger.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
}

  // Save point during recording
  async savePoint(point) {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['activePoints'], 'readwrite');
      const store = transaction.objectStore('activePoints');
      
      const request = store.add({
        ...point,
        timestamp: new Date(point.time).getTime()
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Load active recording points
  async loadActivePoints() {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['activePoints'], 'readonly');
      const store = transaction.objectStore('activePoints');
      const request = store.getAll();

      request.onsuccess = () => {
        const points = request.result;
        resolve(points.sort((a, b) => a.timestamp - b.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Clear active recording points
  async clearActivePoints() {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['activePoints'], 'readwrite');
      const store = transaction.objectStore('activePoints');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Save completed track
  async saveTrack(track) {
      if (!this.db) await this.initializeDB();
      
      this.logger.debug('Saving track with data:', track); // Add debug logging
      
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['tracks'], 'readwrite');
          const store = transaction.objectStore('tracks');
          
          const trackData = {
              id: new Date().getTime().toString(),
              points: track.points,
              totalDistance: track.totalDistance || 0,
              startTime: track.startTime,
              endTime: track.endTime,
              elapsedTime: track.endTime - track.startTime
          };
  
          this.logger.debug('Track data prepared for save:', trackData);
  
          const request = store.add(trackData);
  
          request.onsuccess = () => {
              this.logger.debug('Track saved successfully with ID:', trackData.id);
              resolve(trackData.id);
          };
          request.onerror = () => reject(request.error);
      });
  }

  // Load saved track
  async loadTrack(trackId) {
    if (!this.db) await this.initializeDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['tracks'], 'readonly');
      const store = transaction.objectStore('tracks');
      const request = store.get(trackId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async checkForActiveRecording() {
    try {
      const points = await this.loadActivePoints();
      if (points.length > 0) {
        this.trackPoints = points.map(p => ({
          lat: p.lat,
          lon: p.lon,
          ele: p.ele,
          time: new Date(p.timestamp).toISOString(),
          accuracy: p.accuracy
        }));
        
        // Recalculate total distance
        this.totalDistance = 0;
        for (let i = 1; i < this.trackPoints.length; i++) {
          const distance = this.calculateDistance(
            this.trackPoints[i-1].lat,
            this.trackPoints[i-1].lon,
            this.trackPoints[i].lat,
            this.trackPoints[i].lon
          );
          this.totalDistance += distance;
        }
        
        this.lastPoint = this.trackPoints[this.trackPoints.length - 1];
        this.lastElevation = this.lastPoint.ele;
        this.isRecording = true;
        
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error('Error checking for active recording:', error);
      return false;
    }
  }

  async loadLatestTrack() {
      if (!this.db) await this.initializeDB();
      
      return new Promise((resolve, reject) => {
          const transaction = this.db.transaction(['tracks'], 'readonly');
          const store = transaction.objectStore('tracks');
          const index = store.index('startTime');
          
          // Get the most recent track
          const request = index.openCursor(null, 'prev');
  
          request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                  // Found the latest track
                  const track = cursor.value;
                  this.logger.debug('Loaded latest track:', track); // Add debug logging
                  
                  this.currentTrack = {
                      points: track.points,
                      totalDistance: track.totalDistance || 0,
                      startTime: track.startTime,
                      endTime: track.endTime,
                      elapsedTime: track.endTime - track.startTime
                  };
                  resolve(this.currentTrack);
              } else {
                  this.logger.debug('No tracks found');
                  resolve(null);
              }
          };
  
          request.onerror = () => reject(request.error);
      });
  }

  async importGPXFile(content) {
      try {
          const parser = new DOMParser();
          const gpxDoc = parser.parseFromString(content, "text/xml");
          
          const trackPoints = Array.from(gpxDoc.getElementsByTagName('trkpt')).map(point => ({
              lat: parseFloat(point.getAttribute('lat')),
              lon: parseFloat(point.getAttribute('lon')),
              ele: parseFloat(point.querySelector('ele')?.textContent) || null,
              time: point.querySelector('time')?.textContent || new Date().toISOString()
          }));
  
          if (trackPoints.length === 0) {
              throw new Error('No track points found in GPX file');
          }
  
          this.trackPoints = trackPoints;
          this.calculateTrackStats();
          
          const track = {
              points: this.trackPoints,
              totalDistance: this.totalDistance,
              startTime: trackPoints[0].time,
              endTime: trackPoints[trackPoints.length - 1].time,
              elapsedTime: new Date(trackPoints[trackPoints.length - 1].time) - new Date(trackPoints[0].time)
          };
  
          await this.saveTrack(track);
          this.currentTrack = track;
          
          // Emit event for UI updates
          const event = new CustomEvent('gpx-imported', { detail: track });
          window.dispatchEvent(event);
          
          return true;
      } catch (error) {
          this.logger.error('Error importing GPX file:', error);
          throw error;
      }
  }
  
  calculateTrackStats() {
      this.totalDistance = 0;
      for (let i = 1; i < this.trackPoints.length; i++) {
          const distance = this.calculateDistance(
              this.trackPoints[i-1].lat,
              this.trackPoints[i-1].lon,
              this.trackPoints[i].lat,
              this.trackPoints[i].lon
          );
          this.totalDistance += distance;
      }
  }

  exportGPX() {
    if (!this.currentTrack) return null;

    const header = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NaBezky Report App">
  <trk>
    <name>NaBezky Track ${this.currentTrack.startTime}</name>
    <trkseg>`;

    const points = this.currentTrack.points.map(point => 
      `      <trkpt lat="${point.lat}" lon="${point.lon}">
        <ele>${point.ele || 0}</ele>
        <time>${point.time}</time>
      </trkpt>`
    ).join('\n');

    const footer = `
    </trkseg>
  </trk>
</gpx>`;

    return header + points + footer;
  }
}

export default GPSManager;

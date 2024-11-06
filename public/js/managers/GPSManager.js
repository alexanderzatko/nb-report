// managers/GPSManager.js

import Logger from '../utils/Logger.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import DatabaseManager from './DatabaseManager.js';
import StateManager from '../state/StateManager.js';

class GPSManager {
    static instance = null;

    constructor() {
        if (GPSManager.instance) {
            return GPSManager.instance;
        }

        this.logger = Logger.getInstance();
        this.i18next = i18next;
        this.isRecording = false;
        this.watchId = null;
        this.dbManager = DatabaseManager.getInstance();
        this.stateManager = StateManager.getInstance();
        
        // Only keep actively recording data in memory
        this.activeRecording = {
            points: [],
            distance: 0,
            lastPoint: null,
            lastElevation: null,
            startTime: null
        };
        
        this.wakeLock = null;
        this.hasWakeLock = 'wakeLock' in navigator;

        GPSManager.instance = this;
    }

    static getInstance() {
        if (!GPSManager.instance) {
            GPSManager.instance = new GPSManager();
        }
        return GPSManager.instance;
    }

    checkGPSCapability() {
        if (!this.i18next.isInitialized) {
            return {
                supported: false,
                reason: 'GPS check unavailable'
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

    isSupported() {
        const capability = this.checkGPSCapability();
        return capability.supported;
    }

    async hasExistingTrack() {
        try {
            const db = await this.dbManager.getDatabase();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['tracks'], 'readonly');
                const store = transaction.objectStore('tracks');
                const countRequest = store.count();

                countRequest.onsuccess = () => {
                    const hasTrack = countRequest.result > 0;
                    this.stateManager.setState('gps.hasTrack', hasTrack);
                    resolve(hasTrack);
                };

                countRequest.onerror = (error) => {
                    this.logger.error('Error checking for existing tracks:', error);
                    resolve(false);
                };
            });
        } catch (error) {
            this.logger.error('Error in hasExistingTrack:', error);
            return false;
        }
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
    
    async startRecording() {
        try {
            const capability = this.checkGPSCapability();
            if (!capability.supported) {
                this.stateManager.setState('gps.error', capability.reason);
                return false;
            }

            const permission = await this.requestLocationPermission();
            if (!permission) {
                this.stateManager.setState('gps.error', this.i18next.t('errors.gps.permissionDenied'));
                return false;
            }

            // Clear any existing recording data
            await this.clearActivePoints();
            this.resetActiveRecording();

            this.isRecording = true;
            this.activeRecording.startTime = new Date().toISOString();

            // Acquire wake lock if available
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

            this.stateManager.setState('gps.isRecording', true);
            return true;

        } catch (error) {
            this.logger.error('Error starting GPS recording:', error);
            this.stateManager.setState('gps.error', error.message);
            return false;
        }
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

        try {
            // Save completed track
            const trackData = {
                points: this.activeRecording.points,
                totalDistance: this.activeRecording.distance,
                startTime: this.activeRecording.startTime,
                endTime: new Date().toISOString()
            };

            const trackId = await this.saveTrack(trackData);
            if (!trackId) {
                throw new Error('Failed to save track');
            }

            // Clear active recording data
            await this.clearActivePoints();
            this.resetActiveRecording();

            // Update state
            this.stateManager.setState('gps.isRecording', false);
            this.stateManager.setState('gps.hasTrack', true);
            
            return trackData;

        } catch (error) {
            this.logger.error('Error stopping recording:', error);
            return null;
        }
    }

    async getTrackStats() {
        try {
            if (this.isRecording) {
                return {
                    distance: Math.round(this.activeRecording.distance),
                    elevation: this.activeRecording.lastElevation
                };
            }

            const track = await this.loadLatestTrack();
            if (!track) return null;

            return {
                distance: Math.round(track.totalDistance),
                startTime: new Date(track.startTime),
                endTime: new Date(track.endTime),
                duration: this.calculateDuration(track.startTime, track.endTime)
            };
        } catch (error) {
            this.logger.error('Error getting track stats:', error);
            return null;
        }
    }

    async loadLatestTrack() {
        try {
            const db = await this.dbManager.getDatabase();
            
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(['tracks'], 'readonly');
                const store = transaction.objectStore('tracks');
                const index = store.index('startTime');
                const request = index.openCursor(null, 'prev');

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    const track = cursor ? cursor.value : null;
                    if (track) {
                        this.stateManager.setState('gps.hasTrack', true);
                    }
                    resolve(track);
                };

                request.onerror = (error) => {
                    this.logger.error('Error loading latest track:', error);
                    reject(error);
                };
            });
        } catch (error) {
            this.logger.error('Error in loadLatestTrack:', error);
            return null;
        }
    }

    async clearTrack() {
        this.logger.debug('Clearing track data');
        try {
            const db = await this.dbManager.getDatabase();
            
            // Clear tracks store
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['tracks'], 'readwrite');
                const tracksStore = transaction.objectStore('tracks');
                const request = tracksStore.clear();
                
                request.onsuccess = resolve;
                request.onerror = (error) => {
                    this.logger.error('Error clearing tracks store:', error);
                    reject(error);
                };
            });

            // Clear metadata store
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['trackMetadata'], 'readwrite');
                const metadataStore = transaction.objectStore('trackMetadata');
                const request = metadataStore.clear();
                
                request.onsuccess = resolve;
                request.onerror = (error) => {
                    this.logger.error('Error clearing track metadata:', error);
                    reject(error);
                };
            });

            // Update state
            this.stateManager.setState('gps.hasTrack', false);
            
            this.logger.debug('Track data cleared successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to clear track data:', error);
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

        if (this.activeRecording.lastPoint) {
            const distance = this.calculateDistance(
                this.activeRecording.lastPoint.lat,
                this.activeRecording.lastPoint.lon,
                point.lat,
                point.lon
            );
            this.activeRecording.distance += distance;
        }

        this.activeRecording.points.push(point);
        this.activeRecording.lastPoint = point;
        this.activeRecording.lastElevation = point.ele;

        try {
            await this.savePoint(point);
            
            // Update state
            this.stateManager.setState('gps.recording', {
                distance: this.activeRecording.distance,
                elevation: this.activeRecording.lastElevation
            });
        } catch (error) {
            this.logger.error('Failed to save GPS point:', error);
        }
    }

    handleError(error) {
        this.logger.error('GPS Error:', error);
        this.stateManager.setState('gps.error', error.message);
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

    async savePoint(point) {
        const db = await this.dbManager.getDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['activePoints'], 'readwrite');
            const store = transaction.objectStore('activePoints');
            
            const request = store.add({
                ...point,
                timestamp: new Date(point.time).getTime()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async saveTrack(trackData) {
        const db = await this.dbManager.getDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['tracks'], 'readwrite');
            const store = transaction.objectStore('tracks');
            
            const data = {
                id: new Date().getTime().toString(),
                ...trackData
            };

            const request = store.add(data);

            request.onsuccess = () => resolve(data.id);
            request.onerror = () => reject(request.error);
        });
    }

    async loadActivePoints() {
        const db = await this.dbManager.getDatabase();
        
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['activePoints'], 'readonly');
          const store = transaction.objectStore('activePoints');
          const request = store.getAll();
        
          request.onsuccess = () => {
            const points = request.result;
            resolve(points.sort((a, b) => a.timestamp - b.timestamp));
          };
          request.onerror = () => reject(request.error);
        });
    }

    async clearActivePoints() {
        const db = await this.dbManager.getDatabase();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['activePoints'], 'readwrite');
            const store = transaction.objectStore('activePoints');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    resetActiveRecording() {
        this.activeRecording = {
            points: [],
            distance: 0,
            lastPoint: null,
            lastElevation: null,
            startTime: null
        };
        this.stateManager.setState('gps.recording', null);
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

    calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diff = end - start;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return { hours, minutes };
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

            let totalDistance = 0;
            for (let i = 1; i < trackPoints.length; i++) {
                totalDistance += this.calculateDistance(
                    trackPoints[i-1].lat,
                    trackPoints[i-1].lon,
                    trackPoints[i].lat,
                    trackPoints[i].lon
                );
            }

            const trackData = {
                points: trackPoints,
                totalDistance: totalDistance,
                startTime: trackPoints[0].time,
                endTime: trackPoints[trackPoints.length - 1].time
            };

            await this.saveTrack(trackData);
            this.stateManager.setState('gps.hasTrack', true);

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

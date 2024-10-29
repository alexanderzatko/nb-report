// managers/GPSManager.js

class GPSManager {
  static instance = null;

  constructor() {
    if (GPSManager.instance) {
      return GPSManager.instance;
    }

    this.logger = Logger.getInstance();
    this.isRecording = false;
    this.currentTrack = null;
    this.watchId = null;
    this.trackPoints = [];
    this.lastPoint = null;
    this.totalDistance = 0;
    this.lastElevation = null;
    
    GPSManager.instance = this;
  }

  static getInstance() {
    if (!GPSManager.instance) {
      GPSManager.instance = new GPSManager();
    }
    return GPSManager.instance;
  }

  checkGPSCapability() {
    // Check if device is Android
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (!isAndroid) {
      return {
        supported: false,
        reason: 'This feature is currently only supported on Android devices'
      };
    }

    // Check for geolocation API
    if (!('geolocation' in navigator)) {
      return {
        supported: false,
        reason: 'GPS functionality is not available on this device'
      };
    }

    // Check for background capability
    if (!('BackgroundGeolocation' in window)) {
      return {
        supported: false,
        reason: 'Background GPS recording is not supported on this device'
      };
    }

    return {
      supported: true
    };
  }

  hasExistingTrack() {
    return this.currentTrack !== null;
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
        throw new Error(capability.reason);
      }

      // Request permission
      const permission = await this.requestLocationPermission();
      if (!permission) {
        throw new Error('Location permission denied');
      }

      this.trackPoints = [];
      this.totalDistance = 0;
      this.lastPoint = null;
      this.lastElevation = null;
      this.isRecording = true;

      // Start watching position
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handlePosition(position),
        (error) => this.handleError(error),
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );

      return true;
    } catch (error) {
      this.logger.error('Error starting GPS recording:', error);
      throw error;
    }
  }

  async requestLocationPermission() {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      if (result.state === 'granted') {
        return true;
      }
      if (result.state === 'prompt') {
        // This will trigger the permission prompt
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false)
          );
        });
      }
      return false;
    } catch (error) {
      this.logger.error('Error requesting location permission:', error);
      return false;
    }
  }

  handlePosition(position) {
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

    this.trackPoints.push(point);
    this.lastPoint = point;
    this.lastElevation = point.ele;

    // Emit update event
    const event = new CustomEvent('gps-update', {
      detail: {
        distance: this.totalDistance,
        elevation: this.lastElevation
      }
    });
    window.dispatchEvent(event);
  }

  handleError(error) {
    this.logger.error('GPS Error:', error);
    // Emit error event
    const event = new CustomEvent('gps-error', {
      detail: { error }
    });
    window.dispatchEvent(event);
  }

  stopRecording() {
    if (this.watchId) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.isRecording = false;
    this.currentTrack = {
      points: this.trackPoints,
      totalDistance: this.totalDistance,
      startTime: this.trackPoints[0]?.time,
      endTime: this.trackPoints[this.trackPoints.length - 1]?.time
    };
    return this.currentTrack;
  }

  getTrackStats() {
    if (!this.currentTrack) return null;

    return {
      distance: Math.round(this.currentTrack.totalDistance),
      startTime: new Date(this.currentTrack.startTime),
      endTime: new Date(this.currentTrack.endTime),
      duration: this.calculateDuration(
        this.currentTrack.startTime,
        this.currentTrack.endTime
      )
    };
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

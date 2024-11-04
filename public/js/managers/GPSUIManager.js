// managers/GPSUIManager.js

import Logger from '../utils/Logger.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';

class GPSUIManager {
  static instance = null;

  constructor() {
    if (GPSUIManager.instance) {
      return GPSUIManager.instance;
    }
    
    this.logger = Logger.getInstance();
    this.i18next = i18next;
    this.initialized = false;
    GPSUIManager.instance = this;
  }

  static getInstance() {
    if (!GPSUIManager.instance) {
      GPSUIManager.instance = new GPSUIManager();
    }
    return GPSUIManager.instance;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      const gpsCard = document.querySelector('[data-feature="gps-recording"]');
      if (!gpsCard) {
        this.logger.error('GPS card not found');
        return;
      }

      // Listen for GPS updates
      window.addEventListener('gps-update', () => {
        const gpsCard = document.querySelector('[data-feature="gps-recording"]');
        if (gpsCard) {
          this.updateGPSCardForRecording(gpsCard);
        }
      });

      this.initialized = true;
      this.logger.debug('GPS UI manager initialized');

    } catch (error) {
      this.logger.error('Failed to initialize GPS UI manager:', error);
      throw error;
    }
  }

  updateGPSCardVisibility(capability = null) {
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (!gpsCard) return;
    
    if (capability) {
      if (capability.supported) {
        gpsCard.classList.remove('disabled');
        if (capability.isRecording) {
          this.updateGPSCardForRecording(gpsCard);
        } else {
          this.updateGPSCardForStandby(gpsCard);
        }
      } else {
        gpsCard.classList.add('disabled');
        gpsCard.querySelector('p').textContent = capability.reason;
      }
    }
  }

  updateGPSCardForRecording(card, stats) {
    if (!card) return;

    card.querySelector('h3').textContent = this.i18next.t('dashboard.stopGpsRecording');
    card.querySelector('p').textContent = this.i18next.t('dashboard.recordingStats', {
      distance: stats.distance,
      elevation: stats.elevation ? Math.round(stats.elevation) : '–'
    });
  }

  updateGPSCardForStandby(card) {
    if (!card) return;

    card.querySelector('h3').textContent = this.i18next.t('dashboard.recordGps');
    card.querySelector('p').textContent = this.i18next.t('dashboard.recordGpsDesc');
  }

  showGPSTrackCard(stats) {
    if (!stats) {
      this.logger.debug('No track stats available');
      return;
    }

    this.logger.debug('Showing GPS track card with stats:', stats);

    const container = document.querySelector('.dashboard-grid');
    if (!container) {
      this.logger.warn('Dashboard grid container not found');
      return;
    }

    // Remove existing track card if present
    this.removeGPSTrackCard();

    const trackCard = document.createElement('div');
    trackCard.className = 'dashboard-card';
    trackCard.dataset.feature = 'gps-track';
    
    trackCard.innerHTML = `
      <div class="card-icon"></div>
      <h3>${this.i18next.t('dashboard.gpsTrack')}</h3>
      <p>${this.i18next.t('dashboard.trackStats', {
        distance: stats.distance,
        hours: stats.duration.hours,
        minutes: stats.duration.minutes
      })}</p>
      <a href="#" class="gpx-download">${this.i18next.t('dashboard.downloadGpx')}</a>
    `;

    // Add click handler for the download link
    trackCard.querySelector('.gpx-download').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleGPXDownload();
    });

    container.appendChild(trackCard);
    this.logger.debug('GPS track card added to dashboard');
  }

  async handleGPXDownload() {
    try {
      const event = new CustomEvent('gps-download-requested');
      window.dispatchEvent(event);
    } catch (error) {
      this.logger.error('Error initiating GPX download:', error);
      alert(this.i18next.t('dashboard.gpxDownloadError'));
    }
  }

  removeGPSTrackCard() {
    const trackCard = document.querySelector('[data-feature="gps-track"]');
    if (trackCard) {
      trackCard.remove();
    }
  }

  reset() {
    this.logger.debug('Resetting GPS UI manager');
    this.removeGPSTrackCard();
    
    const gpsCard = document.querySelector('[data-feature="gps-recording"]');
    if (gpsCard) {
      gpsCard.classList.add('disabled');
    }
  }
}

export default GPSUIManager;

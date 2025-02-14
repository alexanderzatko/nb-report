// form/FormManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import SelectManager from '../managers/SelectManager.js';
import PhotoManager from '../media/PhotoManager.js';
import Logger from '../utils/Logger.js';
import GPSManager from '../managers/GPSManager.js';
import StateManager from '../state/StateManager.js';
import AuthManager from '../auth/AuthManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';

class FormManager {
  static instance = null;

  constructor() {
    if (FormManager.instance) {
      return FormManager.instance;
    }

    this.formConfig = {
      admin: {
        requiredFields: [
          {
            id: 'snow-depth-total',
            type: 'number',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-note',
            type: 'textarea',
            validationKey: 'form.validation.required'
          }
        ]
      },
      regular: {
        requiredFields: [
          {
            id: 'report-title',
            type: 'text',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-date',
            type: 'date',
            validationKey: 'form.validation.required'
          },
          {
            id: 'country',
            type: 'select',
            validationKey: 'form.validation.required'
          },
          {
            id: 'region',
            type: 'select',
            validationKey: 'form.validation.required'
          },
          {
            id: 'report-note',
            type: 'textarea',
            validationKey: 'form.validation.required'
          }
        ]
      }
    };

    this.i18next = i18next;
    this.trailConditions = {};
    this.formStartTime = null;
    this.elapsedTimeInterval = null;
    this.selectManager = SelectManager.getInstance();
    this.photoManager = PhotoManager.getInstance();
    this.logger = Logger.getInstance();
    this.isSubmitting = false;

    this.dbManager = DatabaseManager.getInstance();
    this.currentFormId = null;
    this.autoSaveInterval = null;
    this.setupAutoSave();
    
    FormManager.instance = this;
  }

  static getInstance() {
      if (!FormManager.instance) {
          FormManager.instance = new FormManager();
      }
      return FormManager.instance;
  }

  async initialize() {
      if (this.initialized) {
          return;
      }
  
      try {
          this.logger.debug('FormManager initialize starting');
          
          // Wait for i18next to be ready
          if (!this.i18next.isInitialized) {
              this.logger.debug('Waiting for i18next to initialize...');
              await new Promise(resolve => {
                  this.i18next.on('initialized', resolve);
              });
          }
  
          // Initialize core form functionality
          this.setupEventListeners();
          this.initializeFormValidation();
          this.initializeDatePicker();
            
          // Initialize GPS/GPX sections if present
          if (document.getElementById('gps-track-section')) {
              await this.initializeGPSTrackSection();
          }
  
          this.logger.debug('About to initialize GPX section');
          await this.initializeGPXSection();
          this.logger.debug('GPX section initialization complete');
          
          this.initialized = true;
          this.logger.debug('Form manager initialization complete');
  
      } catch (error) {
          this.logger.error('Error initializing form manager:', error);
          throw error;
      }
  }

  setupAutoSave() {
      // Auto-save form data every 30 seconds
      this.autoSaveInterval = setInterval(() => {
          if (this.currentFormId) {
              this.saveFormState();
          }
      }, 30000);
  }

  async saveFormState() {
      if (!this.currentFormId) return;

      try {
          const formData = this.collectFormData();
          await this.dbManager.updateFormData(this.currentFormId, {
              formState: formData,
              lastSaved: new Date().toISOString()
          });
          this.logger.debug('Form state saved successfully');
      } catch (error) {
          this.logger.error('Error saving form state:', error);
      }
  }

  async restoreFormState() {
      if (!this.currentFormId) return;

      try {
          const savedData = await this.dbManager.getFormData(this.currentFormId);
          if (savedData?.formState) {
              this.populateFormFields(savedData.formState);
              this.logger.debug('Form state restored successfully');
          }
      } catch (error) {
          this.logger.error('Error restoring form state:', error);
      }
  }

  setupEventListeners() {
      console.log('Setting up form event listeners');
      const form = document.getElementById('snow-report-form');
      if (form) {
          console.log('Form found, setting up submit handler');
          // Remove any existing submit handler to avoid duplicates
          form.removeEventListener('submit', this.handleFormSubmit);
          // Add new submit handler
          form.addEventListener('submit', (event) => this.handleFormSubmit(event));
      }
  
      const cancelButton = document.getElementById('cancel-button');
      if (cancelButton) {
          // Remove any existing click handler to avoid duplicates
          cancelButton.removeEventListener('click', this.handleCancel);
          // Add new cancel handler
          cancelButton.addEventListener('click', () => this.handleCancel());
      }
  }

  async replaceCommonSections(activeSection, commonTemplate) {
      try {
          const placeholders = activeSection.querySelectorAll('.common-section-placeholder');
          this.logger.debug(`Found ${placeholders.length} placeholders to replace`);
          
          placeholders.forEach((placeholder) => {
              this.logger.debug(`Replacing placeholder`);
              // Create a new div to hold the common content
              const container = document.createElement('div');
              // Clone the template content
              const commonContent = commonTemplate.content.cloneNode(true);
              // Append to our container first
              container.appendChild(commonContent);
              // Clear and replace placeholder content
              placeholder.innerHTML = '';
              placeholder.appendChild(container);
          });
      } catch (error) {
          this.logger.error('Error replacing common sections:', error);
          throw error;
      }
  }
  
  async initializeForm(userData) {
      this.logger.debug('Initializing form with user data:', userData);

      // Create new form entry in database
      const formData = {
          userId: userData?.nabezky_uid,
          startTime: new Date().toISOString(),
          isAdmin: userData?.ski_center_admin === "1",
          formState: {}
      };
  
      this.currentFormId = await this.dbManager.saveFormData(formData);
      this.photoManager.setCurrentFormId(this.currentFormId);
      
      // Try to restore any saved form state
      await this.restoreFormState();

      // Get required elements
      const regularUserSection = document.getElementById('regular-user-section');
      const adminSection = document.getElementById('admin-section');
      const trailsSection = document.getElementById('trails-section');
      const rewardsSection = document.getElementById('rewards-section');
      const commonTemplate = document.getElementById('common-section');
  
      if (!regularUserSection || !adminSection || !commonTemplate) {
          this.logger.error('Required form sections not found');
          return;
      }
  
      const isAdmin = userData?.ski_center_admin === "1";
      const stateManager = StateManager.getInstance();
      const currentCenter = stateManager.getSkiCenterData();
      const hasTrails = currentCenter?.trails && Array.isArray(currentCenter.trails) && currentCenter.trails.length > 0;

      this.logger.debug('Form initialization:', {
        isAdmin,
        hasTrails,
        currentCenter,
      });
        
      if (isAdmin && currentCenter) {
          const skiCenterNameDiv = document.getElementById('ski-center-name');
          if (skiCenterNameDiv) {
            skiCenterNameDiv.textContent = currentCenter.name;

              const storage = stateManager.getState('storage.userData');
              if (storage?.ski_centers_data?.length > 1) {
                  const switchLink = document.createElement('a');
                  switchLink.href = '#';
                  switchLink.className = 'switch-center-link';
                  switchLink.textContent = this.i18next.t('form.switchSkiCenter');
                  switchLink.onclick = (e) => {
                      e.preventDefault();
                      const event = new Event('showSettings');
                      window.dispatchEvent(event);
                      
                      // Hide the form
                      const form = document.getElementById('snow-report-form');
                      if (form) {
                          form.style.display = 'none';
                      }
                      
                      // Show settings
                      const settingsContainer = document.getElementById('settings-container');
                      if (settingsContainer) {
                          settingsContainer.style.display = 'block';
                      }
                  };
                  skiCenterNameDiv.appendChild(switchLink);
              }
          } else {
              this.logger.warn('Ski center name div not found');
          }
  
          // Set the hidden input value
          const skiCenterIdInput = document.getElementById('ski-center-id');
          if (skiCenterIdInput) {
              skiCenterIdInput.value = currentCenter.id;
          } else {
              this.logger.warn('Ski center ID input not found');
          }
      }
  
      // Clear existing content from sections to prevent duplication
      regularUserSection.style.display = isAdmin ? 'none' : 'block';
      adminSection.style.display = isAdmin ? 'block' : 'none';

      // Handle common sections
      const activeSection = isAdmin ? adminSection : regularUserSection;
  
      try {
          await this.replaceCommonSections(activeSection, commonTemplate);
          await this.photoManager.initializePhotoUpload(true);
      } catch (error) {
          this.logger.error('Failed to replace common sections:', error);
          throw error;
      }
  
          
      // Set visibility for trails section
      trailsSection.style.display = 'none';
      if (isAdmin && hasTrails) {
        trailsSection.style.display = 'block';
        // Now pass the trails from currentCenter instead of userData
        this.initializeTrailsSection(currentCenter.trails);
      }
  
      // Set visibility for rewards section based on rovas_uid
      if (rewardsSection) {
          rewardsSection.style.display = 
              (userData?.rovas_uid && !isNaN(userData.rovas_uid)) ? 'block' : 'none';
      }
      
      // Initialize form fields based on user type
      const config = isAdmin ? this.formConfig.admin : this.formConfig.regular;
      this.initializeFormFields(config);

      const privateReportSection = document.getElementById('private-report-section');
      if (privateReportSection) {
        privateReportSection.style.display = isAdmin ? 'none' : 'block';
      }
      // Initialize form components that need to be refreshed
      await this.refreshFormComponents();
  }

  async refreshFormComponents() {
      // Refresh dropdowns if SelectManager is available
      const selectManager = SelectManager.getInstance();
      if (selectManager) {
          await selectManager.refreshAllDropdowns();
      }
  }
  
  initializeFormFields(config) {
    config.requiredFields.forEach(field => {
      const element = document.getElementById(field.id);
      if (element) {
        element.required = true;
        element.setAttribute('data-i18n-validate', field.validationKey);
        this.addValidationClearingListener(element);
      }
    });
  }

  addValidationClearingListener(element) {
    element.addEventListener('input', () => {
      if (element.value.trim()) {
        element.classList.remove('field-invalid');
        const formGroup = element.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
          const validationMessage = formGroup.querySelector('.validation-message');
          if (validationMessage) {
            validationMessage.textContent = '';
          }
        }
      }
    });
  }

  setupFormValidation() {
    const form = document.querySelector('form');
    if (!form) return;

    // Prevent default form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      return false;
    });
  }

  async initializeGPSTrackSection() {
    const gpsManager = GPSManager.getInstance();
    const track = await gpsManager.loadLatestTrack();
    
    const gpsTrackSection = document.getElementById('gps-track-section');
    const trackLabel = document.getElementById('gps-track-label');
    const trackDetails = document.getElementById('gps-track-details');
    
    if (track && gpsTrackSection && trackLabel && trackDetails) {
        this.logger.debug('Track data:', track);  // Add debug logging
        
        const startDate = new Date(track.startTime);
        const endDate = new Date(track.endTime);
        
        // Format date properly
        const formattedDate = startDate.toLocaleDateString(this.i18next.language, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        
        // Calculate duration in milliseconds
        const durationMs = endDate.getTime() - startDate.getTime();
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        const formattedDuration = `${hours}:${String(minutes).padStart(2, '0')}`;

        this.logger.debug('Formatted values:', {
            date: formattedDate,
            duration: formattedDuration,
            distance: Math.round(track.totalDistance)
        });
        
        trackLabel.textContent = this.i18next.t('form.gpsTrack.attachLabel', {
            date: formattedDate
        });
        
        trackDetails.textContent = this.i18next.t('form.gpsTrack.details', {
            distance: Math.round(track.totalDistance),
            duration: formattedDuration
        });
        
        gpsTrackSection.style.display = 'block';
    } else {
        gpsTrackSection.style.display = 'none';
    }
  }

  async initializeGPXSection() {
      this.logger.debug('Starting GPX section initialization');
      const gpxSelect = document.getElementById('gpx-option');
      const existingOption = document.getElementById('existing-gpx-option');
      const uploadContainer = document.getElementById('gpx-upload-container');
      const infoDisplay = document.getElementById('gpx-info-display');
      const gpsManager = GPSManager.getInstance();
  
      // First, remove the inline style from the upload container
      if (uploadContainer) {
          uploadContainer.removeAttribute('style');
      }
  
      try {
          // First explicitly check if there's a track stored
          const hasTrack = await gpsManager.hasExistingTrack();
          
          // Only try to get track stats if we confirmed a track exists
          const trackStats = hasTrack ? await gpsManager.getTrackStats() : null;
  
          this.logger.debug('Track check results:', {
              hasTrack,
              hasTrackStats: !!trackStats,
              optionPresent: existingOption !== null,
              uploadContainerPresent: uploadContainer !== null
          });
          
          if (existingOption && gpxSelect) {
              // Remove existing event listeners by cloning the select
              const newGpxSelect = gpxSelect.cloneNode(true);
              gpxSelect.parentNode.replaceChild(newGpxSelect, gpxSelect);
              
              // Update our reference to the new element
              const gpxSelectElement = newGpxSelect;

              // First remove any existing "existing" options from the cloned select
              const existingOptions = gpxSelectElement.querySelectorAll('option[value="existing"]');
              existingOptions.forEach(opt => opt.remove());

              // Hide or show the existing track option based on actual track existence
              if (!hasTrack || !trackStats) {
                  if (infoDisplay) {
                      infoDisplay.style.display = 'none';
                  }
              } else {
                  // We have confirmed we have both track and stats
                  const firstOption = gpxSelectElement.querySelector('option');
                  if (firstOption) {
                      gpxSelectElement.insertBefore(existingOption, firstOption.nextSibling);
                  } else {
                      gpxSelectElement.appendChild(existingOption);
                  }
                  existingOption.style.display = '';
  
                  if (infoDisplay) {
                      infoDisplay.innerHTML = this.i18next.t('form.gpx.trackInfo', {
                          date: new Date(trackStats.startTime).toLocaleDateString(),
                          distance: trackStats.distance.toString(),
                          duration: `${trackStats.duration.hours}:${String(trackStats.duration.minutes).padStart(2, '0')}`
                      });
                  }
              }
  
              // Add change listener
              gpxSelectElement.addEventListener('change', (e) => {
                  const selectedValue = e.target.value;
                  this.logger.debug('GPX select changed:', {
                      selectedValue,
                      uploadContainerDisplay: uploadContainer?.style.display
                  });
                  
                  if (infoDisplay) {
                      infoDisplay.style.display = selectedValue === 'existing' && hasTrack ? '' : 'none';
                  }
                  
                  if (uploadContainer) {
                      uploadContainer.style.display = selectedValue === 'upload' ? '' : 'none';
                      this.logger.debug('Upload container display after change:', uploadContainer.style.display);
                  }
              });
  
              // Initialize file upload handlers
              this.setupGPXUpload();
              
              // Set initial visibility based on current selection
              const initialValue = gpxSelectElement.value;
              if (uploadContainer) {
                  uploadContainer.style.display = initialValue === 'upload' ? '' : 'none';
              }
              if (infoDisplay) {
                  infoDisplay.style.display = (initialValue === 'existing' && hasTrack) ? '' : 'none';
              }
          }
  
      } catch (error) {
          this.logger.error('Error initializing GPX section:', error);
          // On error, ensure the existing option is removed
          if (gpxSelect && existingOption) {
              const existingOptionElement = gpxSelect.querySelector('option[value="existing"]');
              if (existingOptionElement) {
                  gpxSelect.removeChild(existingOptionElement);
              }
          }
          throw error;
      }
  }
  
  setupGPXUpload() {
      const gpxUploadBtn = document.getElementById('gpx-upload-btn');
      const gpxFileInput = document.getElementById('gpx-file-input');
      const confirmDialog = document.getElementById('gpx-confirm-dialog');
      const confirmReplace = document.getElementById('gpx-confirm-replace');
      const confirmCancel = document.getElementById('gpx-confirm-cancel');
      let pendingGPXFile = null;
  
      if (!gpxUploadBtn || !gpxFileInput) {
          this.logger.error('Required GPX upload elements not found');
          return;
      }
  
      // Remove existing listeners
      const newGpxUploadBtn = gpxUploadBtn.cloneNode(true);
      const newGpxFileInput = gpxFileInput.cloneNode(true);
      gpxUploadBtn.parentNode.replaceChild(newGpxUploadBtn, gpxUploadBtn);
      gpxFileInput.parentNode.replaceChild(newGpxFileInput, gpxFileInput);
  
      newGpxUploadBtn.addEventListener('click', () => {
          newGpxFileInput.click();
      });
  
      newGpxFileInput.accept = '.gpx,application/gpx+xml,application/xml';
      newGpxFileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
  
          if (!file.name.endsWith('.gpx')) {
              const errorElement = document.getElementById('gpx-error');
              if (errorElement) {
                  errorElement.textContent = this.i18next.t('form.gpx.errors.invalidFile');
              }
              return;
          }
  
          const gpsManager = GPSManager.getInstance();
          const hasTrack = await gpsManager.hasExistingTrack();
          
          if (hasTrack) {
              pendingGPXFile = file;
              const trackStats = await gpsManager.getTrackStats();
              
              const existingTrackInfo = document.getElementById('existing-track-info');
              if (existingTrackInfo && trackStats) {
                  existingTrackInfo.innerHTML = `
                      <p><strong>${this.i18next.t('form.gpx.currentTrack')}</strong><br>
                      ${new Date(trackStats.startTime).toLocaleDateString()} at ${new Date(trackStats.startTime).toLocaleTimeString()}<br>
                      Distance: ${trackStats.distance} km</p>
                  `;
              }
              
              if (confirmDialog) {
                  confirmDialog.style.display = 'block';
              }
          } else {
              try {
                  await this.processGPXFile(file);
              } catch (error) {
                  this.logger.error('Error processing GPX file:', error);
              }
          }
      });
  
      if (confirmReplace) {
          const newConfirmReplace = confirmReplace.cloneNode(true);
          confirmReplace.parentNode.replaceChild(newConfirmReplace, confirmReplace);
          
          newConfirmReplace.addEventListener('click', async () => {
              if (pendingGPXFile) {
                  try {
                      // First clear existing track
                      const gpsManager = GPSManager.getInstance();
                      await gpsManager.clearTrack();
                      
                      // Then process the new file
                      await this.processGPXFile(pendingGPXFile);
                  } catch (error) {
                      this.logger.error('Error replacing track:', error);
                  }
                  pendingGPXFile = null;
              }
              if (confirmDialog) {
                  confirmDialog.style.display = 'none';
              }
          });
      }
  
      if (confirmCancel) {
          const newConfirmCancel = confirmCancel.cloneNode(true);
          confirmCancel.parentNode.replaceChild(newConfirmCancel, confirmCancel);
          
          newConfirmCancel.addEventListener('click', () => {
              pendingGPXFile = null;
              if (confirmDialog) {
                  confirmDialog.style.display = 'none';
              }
              if (newGpxFileInput) {
                  newGpxFileInput.value = '';
              }
          });
      }
  }
  
  async processGPXFile(file) {
      try {
          // Read and process the file
          const content = await file.text();
          const gpsManager = GPSManager.getInstance();
          
          // Import GPX file to storage
          await gpsManager.importGPXFile(content);
          
          // Get track stats after import
          const trackStats = await gpsManager.getTrackStats();
          
          // Update UI elements
          const gpxFilename = document.getElementById('gpx-filename');
          if (gpxFilename) {
              gpxFilename.textContent = file.name;
          }
  
          const infoDisplay = document.getElementById('gpx-info-display');
          if (infoDisplay && trackStats) {
              infoDisplay.style.display = '';
              infoDisplay.innerHTML = this.i18next.t('form.gpx.trackInfo', {
                  date: new Date(trackStats.startTime).toLocaleDateString(),
                  distance: trackStats.distance.toString(),
                  duration: `${trackStats.duration.hours}:${String(trackStats.duration.minutes).padStart(2, '0')}`
              });
          }
  
          // Show existing GPX option
          const existingOption = document.getElementById('existing-gpx-option');
          if (existingOption) {
              existingOption.style.display = 'block';
          }
  
          // Clear error message
          const errorElement = document.getElementById('gpx-error');
          if (errorElement) {
              errorElement.textContent = '';
          }
  
          this.logger.debug('GPX file processed successfully', {
              filename: file.name,
              hasTrackStats: !!trackStats
          });
  
      } catch (error) {
          this.logger.error('Error processing GPX file:', error);
          
          // Show error message
          const errorElement = document.getElementById('gpx-error');
          if (errorElement) {
              errorElement.textContent = this.i18next.t('form.gpx.errors.processingError');
          }
          
          // Clear file input
          const fileInput = document.getElementById('gpx-file-input');
          if (fileInput) {
              fileInput.value = '';
          }
          
          throw error;
      }
  }

  formatDuration(duration) {
      if (!duration) return '0:00';
      return `${duration.hours}:${String(duration.minutes).padStart(2, '0')}`;
  }
  
  initializeTrailsSection(trails) {
    const container = document.getElementById('trails-container');
    if (!container) return;

    container.innerHTML = '';
    
    trails.forEach(([trailId, trailName]) => {
      const trailElement = this.createTrailElement(trailId, trailName);
      container.appendChild(trailElement);
    });
  }

  createTrailElement(trailId, trailName) {
    const div = document.createElement('div');
    div.className = 'trail-item';
    div.dataset.trailId = trailId;
    
    // Trail name header
    const nameDiv = document.createElement('div');
    nameDiv.className = 'trail-name';
    nameDiv.textContent = trailName;
    div.appendChild(nameDiv);
  
    // Free Style condition
    const freeStyleGroup = document.createElement('div');
    freeStyleGroup.className = 'condition-group';
    
    const freeStyleHeader = document.createElement('div');
    freeStyleHeader.className = 'condition-header';
    
    const freeStyleLabel = document.createElement('span');
    freeStyleLabel.className = 'condition-label';
    freeStyleLabel.textContent = this.i18next.t('form.freeStyle');
    
    const freeStyleValue = document.createElement('span');
    freeStyleValue.className = 'selected-value';
    freeStyleValue.dataset.forType = 'free';
    // Set default text for unknown condition
    freeStyleValue.textContent = this.i18next.t('form.trackConditions.0');
    
    freeStyleHeader.appendChild(freeStyleLabel);
    freeStyleHeader.appendChild(freeStyleValue);
    
    const freeStyleButtons = document.createElement('div');
    freeStyleButtons.className = 'condition-buttons';
    
    this.createConditionButtons(freeStyleButtons, freeStyleValue, trailId, 'free');
    
    freeStyleGroup.appendChild(freeStyleHeader);
    freeStyleGroup.appendChild(freeStyleButtons);
    div.appendChild(freeStyleGroup);
  
    // Classic Style condition
    const classicGroup = document.createElement('div');
    classicGroup.className = 'condition-group';
    
    const classicHeader = document.createElement('div');
    classicHeader.className = 'condition-header';
    
    const classicLabel = document.createElement('span');
    classicLabel.className = 'condition-label';
    classicLabel.textContent = this.i18next.t('form.classicStyle');
    
    const classicValue = document.createElement('span');
    classicValue.className = 'selected-value';
    classicValue.dataset.forType = 'classic';
    // Set default text for unknown condition
    classicValue.textContent = this.i18next.t('form.trackConditions.0');
    
    classicHeader.appendChild(classicLabel);
    classicHeader.appendChild(classicValue);
    
    const classicButtons = document.createElement('div');
    classicButtons.className = 'condition-buttons';
    
    this.createConditionButtons(classicButtons, classicValue, trailId, 'classic');
    
    classicGroup.appendChild(classicHeader);
    classicGroup.appendChild(classicButtons);
    div.appendChild(classicGroup);
  
    // Next Maintenance Section
    const maintenanceGroup = document.createElement('div');
    maintenanceGroup.className = 'condition-group';
    
    const maintenanceHeader = document.createElement('div');
    maintenanceHeader.className = 'condition-header';
    
    const maintenanceLabel = document.createElement('span');
    maintenanceLabel.className = 'condition-label';
    maintenanceLabel.textContent = this.i18next.t('form.nextMaintenance');
    
    const maintenanceValue = document.createElement('span');
    maintenanceValue.className = 'selected-value';
    maintenanceValue.dataset.forType = 'maintenance';
    // Set default text for unknown condition
    maintenanceValue.textContent = this.i18next.t('form.maintenance.unknown');
    
    maintenanceHeader.appendChild(maintenanceLabel);
    maintenanceHeader.appendChild(maintenanceValue);
    
    const maintenanceButtons = document.createElement('div');
    maintenanceButtons.className = 'condition-buttons';
    
    this.createMaintenanceButtons(maintenanceButtons, maintenanceValue, trailId);
    
    maintenanceGroup.appendChild(maintenanceHeader);
    maintenanceGroup.appendChild(maintenanceButtons);
    div.appendChild(maintenanceGroup);
  
    return div;
  }

  createConditionButtons(container, valueDisplay, trailId, type) {
    const conditions = [
      { value: '0', label: '?', title: this.i18next.t('form.trackConditions.0') },
      { value: '1', label: '★★★', title: this.i18next.t('form.trackConditions.1') },
      { value: '2', label: '★★', title: this.i18next.t('form.trackConditions.2') },
      { value: '3', label: '★', title: this.i18next.t('form.trackConditions.3') },
      { value: '4', label: '≠', title: this.i18next.t('form.trackConditions.4') },
      { value: '5', label: '= =', title: this.i18next.t('form.trackConditions.5') }
    ];
  
    conditions.forEach(condition => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-btn';
      // Add selected class for the default unknown condition
      if (condition.value === '0') {
        button.classList.add('selected');
        
        // Initialize trail conditions for this type
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId][type] = '0';
      }
      button.dataset.value = condition.value;
      button.title = condition.title;
      
      const textSpan = document.createElement('span');
      textSpan.className = 'condition-btn-text';
      textSpan.textContent = condition.label;
      button.appendChild(textSpan);
      
      button.addEventListener('click', () => {
        container.querySelectorAll('.condition-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');
        valueDisplay.textContent = ': ' + condition.title;
        
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId][type] = condition.value;
      });
  
      const resizeObserver = new ResizeObserver(() => {
        this.scaleTextToFit(textSpan);
      });
      resizeObserver.observe(button);
      
      container.appendChild(button);
    });
  }
  
  createMaintenanceButtons(container, valueDisplay, trailId) {
    const options = [
      { value: '0', label: '?', title: this.i18next.t('form.maintenance.unknown') },
      { value: '1', label: '1', title: this.i18next.t('form.maintenance.today') },
      { value: '2', label: '2', title: this.i18next.t('form.maintenance.tomorrow') },
      { value: '3+', label: '3+', title: this.i18next.t('form.maintenance.laterDays') },
      { value: 'Ps', label: 'Ps', title: this.i18next.t('form.maintenance.fridaySaturday') },
      { value: 'snow', label: '❄', title: this.i18next.t('form.maintenance.afterSnow') }
    ];
  
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'condition-btn';
      // Add selected class for the default unknown condition
      if (option.value === '0') {
        button.classList.add('selected');
        
        // Initialize trail conditions for maintenance
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId].maintenance = '0';
      }
      button.dataset.value = option.value;
      button.title = option.title;
      
      const textSpan = document.createElement('span');
      textSpan.className = 'condition-btn-text';
      textSpan.textContent = option.label;
      button.appendChild(textSpan);
      
      button.addEventListener('click', () => {
        container.querySelectorAll('.condition-btn').forEach(btn => {
          btn.classList.remove('selected');
        });
        button.classList.add('selected');
        valueDisplay.textContent = ': ' + option.title;
        
        if (!this.trailConditions[trailId]) {
          this.trailConditions[trailId] = {};
        }
        this.trailConditions[trailId].maintenance = option.value;
      });
  
      const resizeObserver = new ResizeObserver(() => {
        this.scaleTextToFit(textSpan);
      });
      resizeObserver.observe(button);
      
      container.appendChild(button);
    });
  }

  //used to make the button labels to fit the button for the trails section
  scaleTextToFit(textElement) {
    const button = textElement.parentElement;
    const buttonWidth = button.clientWidth - 4; // Account for padding
    const buttonHeight = button.clientHeight - 4;
    
    // Reset scale to measure original size
    textElement.style.transform = 'scale(1)';
    const textWidth = textElement.scrollWidth;
    const textHeight = textElement.scrollHeight;
    
    // Calculate scale factors for both dimensions
    const scaleX = buttonWidth / textWidth;
    const scaleY = buttonHeight / textHeight;
    
    // Use the smaller scale factor to ensure text fits in both dimensions
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up past original size
    
    // Apply the scaling
    textElement.style.transform = `scale(${scale})`;
  }
    
  initializeFormValidation() {
    console.log('Initializing form validation');
    // Select all required inputs and textareas
    const inputs = document.querySelectorAll('input[required], textarea[required], select[required], [data-i18n-validate]');
    
    inputs.forEach(input => {    
      // Set custom validation message
      input.addEventListener('invalid', (e) => {
        e.preventDefault();
        const formGroup = input.closest('.form-group');
        
        if (!input.value) {
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate || 'form.validation.required');
          input.setCustomValidity(requiredMsg);
          
          if (formGroup) {
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
            
            formGroup.classList.add('show-validation');
            input.classList.add('field-invalid');
          }
        }
      });
      
      // Clear custom validation on input/change
      const clearValidation = () => {
        input.setCustomValidity('');
        const formGroup = input.closest('.form-group');
        if (formGroup) {
          formGroup.classList.remove('show-validation');
          input.classList.remove('field-invalid');
        }
      };
  
      input.addEventListener('input', clearValidation);
      input.addEventListener('change', clearValidation);
  
      // Handle blur event
      input.addEventListener('blur', () => {
        if (!input.value && input.required) {
          const formGroup = input.closest('.form-group');
          const requiredMsg = this.i18next.t(input.dataset.i18nValidate || 'form.validation.required');
          
          input.setCustomValidity(requiredMsg);
          input.classList.add('field-invalid');
          
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = requiredMsg;
            }
          }
        }
      });
    });
  }

  initializeDatePicker() {
    const dateInput = document.getElementById('report-date');
    if (dateInput) {
      const today = new Date();
      const formattedDate = today.toISOString().split('T')[0];
      dateInput.value = formattedDate;
      dateInput.max = formattedDate;
    }
  }

  startTrackingFormTime() {
    if (!this.formStartTime) {
      this.formStartTime = new Date();
      this.elapsedTimeInterval = setInterval(() => this.updateElapsedTime(), 1000);
    }
  }

  stopTrackingFormTime() {
    if (this.elapsedTimeInterval) {
      clearInterval(this.elapsedTimeInterval);
      this.elapsedTimeInterval = null;
    }
    this.formStartTime = null;
  }

  updateElapsedTime() {
    if (!this.formStartTime) return;
    
    const now = new Date();
    const diff = Math.floor((now - this.formStartTime) / 1000);
    
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;
    
    document.getElementById('elapsed-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('elapsed-minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('elapsed-seconds').textContent = String(seconds).padStart(2, '0');
  }

  async handleFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
  
    if (this.isSubmitting) {
      this.logger.debug('Form submission already in progress');
      return;
    }

    const submitButton = document.querySelector('button[type="submit"]');
    const submissionModal = document.getElementById('submission-modal');
    const progressDiv = document.getElementById('submission-progress');

    try {

      const authManager = AuthManager.getInstance();
      const tokenRefreshed = await authManager.checkAndRefreshToken();
      if (!tokenRefreshed) {
          throw new Error('Authentication expired. Please log in again.');
      }

      this.isSubmitting = true;
      submitButton.classList.add('submitting');
      this.logger.debug('Form submission started');
  
      // Show the modal
      submissionModal.style.display = 'block';
      submissionModal.querySelector('.modal-content').classList.add('submitting');

      const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
      this.logger.debug('Is admin form:', isAdmin);

      const config = isAdmin ? this.formConfig.admin : this.formConfig.regular;
      const requiredFields = config.requiredFields.map(field => ({
        element: document.getElementById(field.id),
        required: true
      }));

      this.logger.debug('Found fields to validate:', requiredFields.length);

      let isValid = true;
      let firstInvalidElement = null;
      
      requiredFields.forEach(({element, required}) => {
        if (!element) {
          this.logger.warn('Required element not found in DOM');
          return;
        }

        if (required && !element.value.trim()) {
          isValid = false;
          element.classList.add('field-invalid');
          
          const formGroup = element.closest('.form-group');
          if (formGroup) {
            formGroup.classList.add('show-validation');
            const validationMessage = formGroup.querySelector('.validation-message');
            if (validationMessage) {
              validationMessage.textContent = this.i18next.t('form.validation.required');
            }
          }
          
          if (!firstInvalidElement) {
            firstInvalidElement = element;
          }
        }
      });
    
      this.logger.debug('Form validation result:', isValid);
      if (!isValid && firstInvalidElement) {
        this.logger.debug('Scrolling to first invalid element:', firstInvalidElement.id);
        firstInvalidElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center'
        });
        setTimeout(() => firstInvalidElement.focus(), 500);
        this.isSubmitting = false;
        return;
      }

      let uploadedPhotoData = { photoIds: [], photoCaptions: {} };

      // Handle photo uploads if present
      const photos = this.photoManager.getPhotos();
      if (photos && photos.length > 0) {
          progressDiv.textContent = this.i18next.t('form.uploadingPhotos', { 
              current: 0, 
              total: photos.length 
          });

          try {
              uploadedPhotoData = await this.handlePhotoUploads(progressDiv);
              this.logger.debug('Photos uploaded successfully:', uploadedPhotoData);
          } catch (error) {
              throw new Error(this.i18next.t('form.photoUploadError'));
          }
      }

      // Update progress for form submission
      progressDiv.textContent = this.i18next.t('form.sendingReport');

      // Continue with form submission if validation passes
      const formData = this.collectVisibleData(isAdmin);

      // Handle GPX data
      const gpxId = await this.handleGpxUpload();

      const formContent = this.collectVisibleData(isAdmin);

      // Include the photo data in the submission
      const submissionData = {
          data: {
              ...formContent,
              photoIds: uploadedPhotoData.photoIds,
              photoCaptions: uploadedPhotoData.photoCaptions,
              gpxId,
              reportType: isAdmin ? 'admin' : 'regular',
              trailConditions: isAdmin ? this.trailConditions : undefined
          }
      };
      
      const result = await this.submitFormData(submissionData, isAdmin);

      if (result.success) {
          this.showSuccess(this.i18next.t('form.validation.submitSuccess'));
          this.stopTrackingFormTime();
          this.resetForm();
          
          // Show dashboard
          document.getElementById('dashboard-container').style.display = 'block';
          document.getElementById('snow-report-form').style.display = 'none';
      } else {
          this.showError(result.message || this.i18next.t('form.validation.submitError'));
      }
    } catch (error) {
      this.logger.error('Error submitting snow report:', error);
      this.showError(this.i18next.t('form.validation.submitError'));
    } finally {
        this.isSubmitting = false;
        submitButton.classList.remove('submitting');
        submissionModal.style.display = 'none';
        submissionModal.querySelector('.modal-content').classList.remove('submitting');
        progressDiv.textContent = '';
    }
  }

  collectFormData() {
      const formData = new FormData();
      
      // Determine which form type is visible
      const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
      
      // Get common fields that are visible
      const visibleData = this.collectVisibleData(isAdmin);
      
      // Add each visible field to FormData
      Object.entries(visibleData).forEach(([key, value]) => {
          if (value !== null && value !== undefined && value !== '') {
              formData.append(key, value);
          }
      });
  
      // Add trail conditions for admin
      if (isAdmin && Object.keys(this.trailConditions).length > 0) {
          formData.append('trailConditions', JSON.stringify(this.trailConditions));
      }
  
      // Add rewards data if rewards section is visible
      const rewardsSection = document.getElementById('rewards-section');
      if (rewardsSection?.style.display !== 'none') {
          const laborTime = document.getElementById('labor-time')?.value;
          const rewardRequested = document.getElementById('reward-requested')?.value;
          
          if (laborTime) formData.append('laborTime', laborTime);
          if (rewardRequested) formData.append('rewardRequested', rewardRequested);
      }
  
      // Handle GPS/GPX data
      const gpxOption = document.getElementById('gpx-option');
      if (gpxOption && gpxOption.value !== 'none') {
          const gpsManager = GPSManager.getInstance();
          if (gpsManager.hasExistingTrack()) {
              formData.append('gpx', gpsManager.exportGPX());
          }
      }
  
      return formData;
  }

  collectVisibleData(isAdmin) {
      const data = {};
      
      // Common fields for both user types
      const commonFields = {
          'report-date': 'reportDate',
          'report-note': 'note',
          'snow-type': 'snowType'
      };
  
      // Process common fields
      Object.entries(commonFields).forEach(([elementId, dataKey]) => {
          const element = document.getElementById(elementId);
          if (element && element.value) {
              data[dataKey] = element.value;
          }
      });
      
      if (isAdmin) {
          // Admin-specific fields
          const adminFields = {
              'snow-depth-total': 'snowDepthTotal',
              'snow-depth-new': 'snowDepthNew',
              'ski-center-id': 'skiCenterId'
          };
  
          Object.entries(adminFields).forEach(([elementId, dataKey]) => {
              const element = document.getElementById(elementId);
              if (element && element.value) {
                  data[dataKey] = element.value;
              }
          });
          
      } else {
          // Regular user-specific fields
          const regularUserFields = {
              'report-title': 'reportTitle',
              'country': 'country',
              'region': 'region',
              'snow-depth250': 'snowDepth250',
              'snow-depth500': 'snowDepth500',
              'snow-depth750': 'snowDepth750',
              'snow-depth1000': 'snowDepth1000',
              'classic-style': 'classicstyle',
              'free-style': 'freestyle',
              'snow-age': 'snowage',
              'wetness': 'wetness'
          };
  
          Object.entries(regularUserFields).forEach(([elementId, dataKey]) => {
              const element = document.getElementById(elementId);
              if (element && element.value) {
                  data[dataKey] = element.value;
              }
          });

          const privateReportCheckbox = document.getElementById('private-report');
          if (privateReportCheckbox) {
              data.privateReport = privateReportCheckbox.checked;
          }
      }
      
      // Add rewards data if rewards section is visible and enabled
      const rewardsSection = document.getElementById('rewards-section');
      if (rewardsSection?.style.display !== 'none') {
          const laborTime = document.getElementById('labor-time')?.value;
          const rewardRequested = document.getElementById('reward-requested')?.value;
          
          if (laborTime) data.laborTime = laborTime;
          if (rewardRequested) data.rewardRequested = rewardRequested;
      }
      
      return data;
  }

  collectAdminFormData(formData) {
    const snowDepthTotal = document.getElementById('snow-depth-total')?.value;
    const snowDepthNew = document.getElementById('snow-depth-new')?.value;
    
    if (snowDepthTotal) formData.append('snowDepthTotal', snowDepthTotal);
    if (snowDepthNew) formData.append('snowDepthNew', snowDepthNew);
    formData.append('trailConditions', JSON.stringify(this.trailConditions));
  }

  collectRegularUserFormData(formData) {
    const fields = ['report-date', 'snow-depth250', 'snow-depth500', 'snow-depth750', 'snow-depth1000'];
    fields.forEach(field => {
      const element = document.getElementById(field);
      if (element?.value) {
        formData.append(field.replace('-', ''), element.value);
      }
    });
  }

  collectRewardsData(formData) {
      const rewardsSection = document.getElementById('rewards-section');
      if (rewardsSection?.style.display !== 'none') {
          const laborTime = document.getElementById('labor-time')?.value;
          const rewardRequested = document.getElementById('reward-requested')?.value;
          
          if (laborTime) formData.append('laborTime', laborTime);
          if (rewardRequested) formData.append('rewardRequested', rewardRequested);
      }
  }
  
  async submitFormData(submissionData, isAdmin) {
      try {
          this.logger.debug('Submitting form data:', submissionData);
  
          const response = await fetch('/api/submit-snow-report', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify(submissionData)
          });
  
          if (!response.ok) {
              throw new Error(await response.text());
          }
  
          return await response.json();
      } catch (error) {
          this.logger.error('Form submission error:', error);
          throw error;
      }
  }

  async handlePhotoUploads(progressDiv) {
    const photoManager = PhotoManager.getInstance();
    const photos = photoManager.getPhotos();  // Now returns ordered array of {file, caption, id}
    const photoIds = [];
    const photoCaptions = {};
    const photoOrder = new Map();  // Track original order
    let currentPhoto = 0;
  
    if (photos && photos.length > 0) {
      for (const photo of photos) {
        try {
          currentPhoto++;
          const progressText = this.i18next.t('form.uploadingPhotos', {
            current: currentPhoto,
            total: photos.length
          });
          if (progressDiv) {
            progressDiv.textContent = progressText;
          }
  
          this.logger.debug('Preparing photo upload:', {
            filename: photo.file.name,
            size: photo.file.size,
            type: photo.file.type,
            hasCaption: !!photo.caption,
            photoId: photo.id,
            progress: `${currentPhoto}/${photos.length}`
          });
  
          const photoData = new FormData();
          photoData.append('filedata', photo.file);
          if (photo.caption) {
            photoData.append('caption', photo.caption);
            this.logger.debug('Added caption to FormData:', photo.caption);
          }
  
          const response = await fetch('/api/upload-file', {
            method: 'POST',
            credentials: 'include',
            body: photoData
          });
  
          if (!response.ok) {
            const errorData = await response.json();
            this.logger.error('Photo upload failed:', {
              status: response.status,
              statusText: response.statusText,
              error: errorData
            });
            throw new Error(errorData.details || errorData.error || 'Upload failed');
          }
  
          const result = await response.json();
          this.logger.debug('Photo upload successful:', result);
          
          // Store fid and maintain order
          photoIds.push(result.fid);
          photoOrder.set(result.fid, photo.id);  // Link server fid to original photo ID
          if (photo.caption) {
            photoCaptions[result.fid] = photo.caption;
          }
        } catch (error) {
          this.logger.error('Error uploading photo:', {
            error: error.message,
            details: error.response?.data,
            status: error.response?.status
          });
          throw new Error(`Failed to upload photo: ${error.response?.data?.details || error.message}`);
        }
      }
      
      if (progressDiv) {
        progressDiv.textContent = this.i18next.t('form.photosUploaded');
      }
    }
  
    // Sort photoIds array based on original order
    const sortedPhotoIds = photoIds.sort((a, b) => {
      const orderA = photos.findIndex(p => p.id === photoOrder.get(a));
      const orderB = photos.findIndex(p => p.id === photoOrder.get(b));
      return orderA - orderB;
    });
  
    return {
      photoIds: sortedPhotoIds,
      photoCaptions: photoCaptions
    };
  }
  
  async handleGpxUpload() {
      const gpxOption = document.getElementById('gpx-option');
      if (!gpxOption || (gpxOption.value !== 'existing' && gpxOption.value !== 'upload')) {
          return null;
      }
  
      const gpsManager = GPSManager.getInstance();
      const gpxContent = gpsManager.exportGPX();
      if (!gpxContent) {
          return null;
      }
  
      const gpxData = new FormData();
      const gpxBlob = new Blob([gpxContent], { type: 'application/gpx+xml' });
      gpxData.append('filedata', gpxBlob, 'track.gpx');
      
      const response = await fetch('/api/upload-file', {
          method: 'POST',
          credentials: 'include',
          body: gpxData
      });
      
      if (!response.ok) {
          throw new Error('Failed to upload GPX file');
      }
      
      const result = await response.json();
      return result.fid;
  }
    
  async fileToBase64(file) {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
      });
  }
    
  async clearGPXData(gpsManager) {
      this.logger.debug('Starting GPX data cleanup');
      try {
          // Clear all GPX data through GPS manager
          const cleared = await gpsManager.clearTrack();
          if (!cleared) {
              throw new Error('Failed to clear track data');
          }
  
          // Reset all GPX-related UI elements
          this.resetGPXUI();
          
          this.logger.debug('GPX data cleanup completed successfully');
      } catch (error) {
          this.logger.error('Error during GPX data cleanup:', error);
          throw error;
      }
  }

  resetGPXUI() {
      this.logger.debug('Resetting GPX UI elements');
      
      // Reset select element
      const gpxSelect = document.getElementById('gpx-option');
      if (gpxSelect) {
          gpxSelect.value = 'none';
          
          // Find and remove existing GPX option if present
          const existingOption = gpxSelect.querySelector('option[value="existing"]');
          if (existingOption) {
              existingOption.remove();
          }
      }
  
      // Clear file input
      const fileInput = document.getElementById('gpx-file-input');
      if (fileInput) {
          fileInput.value = '';
      }
  
      // Clear filename display
      const gpxFilename = document.getElementById('gpx-filename');
      if (gpxFilename) {
          gpxFilename.textContent = '';
      }
  
      // Clear info display
      const infoDisplay = document.getElementById('gpx-info-display');
      if (infoDisplay) {
          infoDisplay.style.display = 'none';
          infoDisplay.innerHTML = '';
      }
  
      // Hide upload container
      const uploadContainer = document.getElementById('gpx-upload-container');
      if (uploadContainer) {
          uploadContainer.style.display = 'none';
      }
  
      // Clear error message if any
      const errorElement = document.getElementById('gpx-error');
      if (errorElement) {
          errorElement.textContent = '';
      }
  
      // Hide confirmation dialog if visible
      const confirmDialog = document.getElementById('gpx-confirm-dialog');
      if (confirmDialog) {
          confirmDialog.style.display = 'none';
      }
  
      this.logger.debug('GPX UI elements reset completed');
  }

  handleCancel() {
    this.stopTrackingFormTime();
    this.resetForm();
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
  }

  resetForm() {
    const form = document.getElementById('snow-report-form');
    if (form) {
      form.reset();
      this.trailConditions = {};
      this.photoManager.clearPhotos();
      this.stopTrackingFormTime();
      if (this.currentFormId) {
        try {
            // Clear form data from database
            await this.dbManager.clearForm(this.currentFormId);
            this.currentFormId = null;
        } catch (error) {
            this.logger.error('Error clearing form data:', error);
        }
      }

      this.formStartTime = null;
      
      // Clear select manager state
      this.selectManager.clearState();
      
      const hoursElement = document.getElementById('elapsed-hours');
      const minutesElement = document.getElementById('elapsed-minutes');
      const secondsElement = document.getElementById('elapsed-seconds');
      if (hoursElement) hoursElement.textContent = '00';
      if (minutesElement) minutesElement.textContent = '00';
      if (secondsElement) secondsElement.textContent = '00';
      
      const selectedButtons = document.querySelectorAll('.condition-btn.selected');
      selectedButtons.forEach(button => button.classList.remove('selected'));

      this.resetGPXUI();

      form.style.display = 'none';
      const dashboardContainer = document.getElementById('dashboard-container');
      if (dashboardContainer) {
        dashboardContainer.style.display = 'block';
      }
    }
  }

  showSuccess(message) {
    alert(message);
  }

  showError(message) {
    alert(message);
  }
  
  handleConditionSelection(trailId, type, value, buttonGroup) {
    // Remove selection from all buttons in the group
    buttonGroup.querySelectorAll('.condition-btn').forEach(btn => {
      btn.classList.remove('selected');
    });

    // Select the clicked button
    const selectedButton = buttonGroup.querySelector(`[data-value="${value}"]`);
    if (selectedButton) {
      selectedButton.classList.add('selected');
    }

    // Store the selection
    if (!this.trailConditions[trailId]) {
      this.trailConditions[trailId] = {};
    }
    this.trailConditions[trailId][type] = value;
  }

  validateField(input) {
    const validity = input.validity;
    
    if (validity.valueMissing) {
      return this.i18next.t(input.dataset.i18nValidate);
    }
    
    if (input.type === 'number') {
      const value = Number(input.value);
      const min = Number(input.min);
      const max = Number(input.max);
      
      if (value < min) {
        return this.i18next.t(input.dataset.i18nValidateMin, { min: min });
      }
      if (value > max) {
        return this.i18next.t(input.dataset.i18nValidateMax, { max: max });
      }
    }
    
    return '';
  }

  getFormData() {
    return this.trailConditions;
  }
}

export default FormManager;

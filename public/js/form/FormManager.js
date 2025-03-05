// form/FormManager.js

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import SelectManager from '../managers/SelectManager.js';
import PhotoManager from '../media/PhotoManager.js';
import VideoManager from '../media/VideoManager.js';
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
    this.videoManager = VideoManager.getInstance();
    this.logger = Logger.getInstance();
    this.isSubmitting = false;

    this.dbManager = DatabaseManager.getInstance();
    this.currentFormId = null;
    this.autoSaveInterval = null;
    this.autoSaveIntervalMs = 5000; // form autosave interval in ms

    this.lastSubmittedForm = null;
    this.lastClonedState = null;
    
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

  startAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }
    this.autoSaveInterval = setInterval(() => {
      if (this.currentFormId && document.getElementById('snow-report-form').style.display !== 'none') {
        this.saveFormState();
      }
    }, this.autoSaveIntervalMs);
  }
  
  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }
  
  async saveFormState() {
      if (!this.currentFormId) return;
  
      try {
          const formData = this.collectSerializableFormData();
 
          const dropdownValues = {};
          const dropdowns = document.querySelectorAll('select');
          dropdowns.forEach(dropdown => {
              if (dropdown.id) {
                  dropdownValues[dropdown.id] = dropdown.value;
              }
          });
        
          formData.lastModified = new Date().toISOString();
          
          await this.dbManager.updateFormData(this.currentFormId, {
              formState: {
                  ...formData,
                  dropdownValues,
                  trailConditions: this.trailConditions || {}
              },
              lastSaved: new Date().toISOString()
          });
//          this.logger.debug('Form state saved successfully');
      } catch (error) {
          this.logger.error('Error saving form state:', error);
      }
  }

  collectSerializableFormData() {
      const data = {};
      const isAdmin = document.getElementById('admin-section')?.style.display !== 'none';
      
      // Common fields
      const commonFields = [
          'report-date',
          'report-note',
          'snow-type'
      ];
  
      // Common fields processing
      commonFields.forEach(fieldId => {
          const element = document.getElementById(fieldId);
          if (element && element.value) {
              data[fieldId.replace('-', '')] = element.value;
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
          
          // Add trail conditions
          if (this.trailConditions) {
              data.trailConditions = this.trailConditions;
          }
      } else {
          // Regular user fields
          const regularFields = {
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
  
          Object.entries(regularFields).forEach(([elementId, dataKey]) => {
              const element = document.getElementById(elementId);
              if (element && element.value) {
                  data[dataKey] = element.value;
              }
          });
  
          // Handle private report checkbox
          const privateReportCheckbox = document.getElementById('private-report');
          if (privateReportCheckbox) {
              data.privateReport = privateReportCheckbox.checked;
          }
      }
      
      // Add rewards data if visible
      const rewardsSection = document.getElementById('rewards-section');
      if (rewardsSection?.style.display !== 'none') {
          const laborTime = document.getElementById('labor-time')?.value;
          const rewardRequested = document.getElementById('reward-requested')?.value;
          
          if (laborTime) data.laborTime = laborTime;
          if (rewardRequested) data.rewardRequested = rewardRequested;
      }
  
      // Add references to videos that have been added
      try {
          if (this.videoManager) {
              const videos = this.videoManager.getVideos();
              if (videos && videos.length > 0) {
                  data.videoReferences = videos.map(video => ({
                      id: video.id,
                      dbId: video.dbId,
                      caption: video.caption,
                      order: video.order
                  }));
              }
          }
      } catch (error) {
          this.logger.error('Error capturing video references for form state:', error);
      }
  
      // Add GPS/GPX data
      const gpxOption = document.getElementById('gpx-option');
      if (gpxOption && gpxOption.value !== 'none') {
          const gpsManager = GPSManager.getInstance();
          if (gpsManager.hasExistingTrack()) {
              data.gpxData = gpsManager.exportGPX();
          }
      }
  
      return data;
  }

  async restoreFormState() {
      if (!this.currentFormId) return;

      await new Promise(resolve => setTimeout(resolve, 100));

      try {
          const savedData = await this.dbManager.getFormData(this.currentFormId);
          this.logger.debug('Retrieved form data:', savedData);
          
          if (savedData && savedData.formState) {
              // Restore main form fields
              this.populateFormFields(savedData);
  
              // Restore dropdown values
              if (savedData?.formState?.dropdownValues) {
                  // Wait for all dropdowns to be populated and then set their values
                  await Promise.all(
                      Object.entries(savedData.formState.dropdownValues).map(async ([id, value]) => {                          
                          // Wait for element to be available and populated
                          const element = await this.waitForSelect(id);
                          if (element) {
                              element.value = value;
                              // Verify the value was set
                              if (element.value !== value) {
                                  this.logger.warn(`Failed to set value ${value} for dropdown ${id}`);
                              }
                          } else {
                              this.logger.warn(`Dropdown with ID "${id}" not found in the DOM.`);
                          }
                      })
                  );
              }
  
              // Restore trail conditions
              if (savedData.formState.trailConditions) {
                  this.trailConditions = savedData.formState.trailConditions;
                  this.updateTrailConditionsUI();
              }
  
              this.logger.debug('Form state restored successfully', {
                  hasDropdowns: !!savedData.formState.dropdownValues,
                  hasTrailConditions: !!savedData.formState.trailConditions
              });
          } else {
              this.logger.warn('No valid form state found in saved data');
          }
      } catch (error) {
          this.logger.error('Error restoring form state:', error);
      }
  }

  async waitForSelect(id, maxAttempts = 10) {
      for (let i = 0; i < maxAttempts; i++) {
          const element = document.getElementById(id);
          if (element && element.options.length > 0) {
              return element;
          }
          await new Promise(resolve => setTimeout(resolve, 50));
      }
      return null;
  }
  
  restoreTrailConditions(conditions) {
      Object.entries(conditions).forEach(([trailId, trailConditions]) => {
          const trailElement = document.querySelector(`[data-trail-id="${trailId}"]`);
          if (trailElement) {
              // Restore classic style
              if (trailConditions.classic) {
                  const classicBtn = trailElement.querySelector(`.condition-btn[data-value="${trailConditions.classic}"]`);
                  if (classicBtn) {
                      classicBtn.click();
                  }
              }
              
              // Restore free style
              if (trailConditions.free) {
                  const freeBtn = trailElement.querySelector(`.condition-btn[data-value="${trailConditions.free}"]`);
                  if (freeBtn) {
                      freeBtn.click();
                  }
              }
              
              // Restore maintenance
              if (trailConditions.maintenance) {
                  const maintenanceBtn = trailElement.querySelector(`.condition-btn[data-value="${trailConditions.maintenance}"]`);
                  if (maintenanceBtn) {
                      maintenanceBtn.click();
                  }
              }
          }
      });
  }

  populateFormFields(formData) {
      if (!formData?.formState) return;
      
      // Handle main form fields
      const fieldMapping = {
          reportTitle: 'report-title',
          reportdate: 'report-date',
          snowDepth250: 'snow-depth250',
          snowDepth500: 'snow-depth500',
          snowDepth750: 'snow-depth750',
          snowDepth1000: 'snow-depth1000',
          snowDepthTotal: 'snow-depth-total',
          snowDepthNew: 'snow-depth-new',
          skiCenterId: 'ski-center-id',
          reportnote: 'report-note',
          privateReport: 'private-report'
      };
  
      // Populate main form fields
      Object.entries(formData.formState).forEach(([key, value]) => {
          if (key !== 'dropdownValues' && key !== 'trailConditions' && key !== 'gpxData') {
              const elementId = fieldMapping[key] || key;
              const element = document.getElementById(elementId);
              if (element) {
                  if (element.type === 'checkbox') {
                      element.checked = value;
                  } else {
                      element.value = value;
                  }
              }
          }
      });
  
      // Handle video references
      if (formData.formState.videoReferences && this.videoManager) {
          this.logger.debug('Found video references in saved form state:', formData.formState.videoReferences);
          // videoManager.setCurrentFormId has already been called earlier in the form initialization
          // This ensures videos are restored from the database
      }

      // Handle GPX data
      if (formData.formState.gpxData) {
          const gpsManager = GPSManager.getInstance();
          gpsManager.importGPXFile(formData.formState.gpxData)
              .then(async () => {
                  // Update GPX dropdown and info display
                  const gpxSelect = document.getElementById('gpx-option');
                  const infoDisplay = document.getElementById('gpx-info-display');
                  const uploadContainer = document.getElementById('gpx-upload-container');
  
                  if (gpxSelect) {
                      // Ensure the 'existing' option is available
                      const existingOption = gpxSelect.querySelector('option[value="existing"]');
                      if (!existingOption) {
                          const option = document.createElement('option');
                          option.value = 'existing';
                          option.textContent = this.i18next.t('form.gpx.options.existing');
                          // Insert after the 'none' option
                          const noneOption = gpxSelect.querySelector('option[value="none"]');
                          if (noneOption) {
                              noneOption.after(option);
                          } else {
                              gpxSelect.appendChild(option);
                          }
                      }
                      gpxSelect.value = 'existing';
                  }
  
                  // Show track info
                  const trackStats = await gpsManager.getTrackStats();
                  if (infoDisplay && trackStats) {
                      infoDisplay.style.display = '';
                      infoDisplay.innerHTML = this.i18next.t('form.gpx.trackInfo', {
                          date: new Date(trackStats.startTime).toLocaleDateString(),
                          distance: trackStats.distance.toString(),
                          duration: `${trackStats.duration.hours}:${String(trackStats.duration.minutes).padStart(2, '0')}`
                      });
                  }
  
                  // Hide upload container
                  if (uploadContainer) {
                      uploadContainer.style.display = 'none';
                  }
              })
              .catch(error => {
                  this.logger.error('Error restoring GPX data:', error);
              });
      }
  
      // Handle dropdown values separately
      if (formData.formState.dropdownValues) {
          Object.entries(formData.formState.dropdownValues).forEach(([key, value]) => {
              const element = document.getElementById(key);
              if (element) {
                  element.value = value;
              }
          });
      }
  
      // Handle trail conditions
      if (formData.formState.trailConditions) {
          this.trailConditions = formData.formState.trailConditions;
          this.updateTrailConditionsUI();
      }
  }
  
  // Helper method to update trail conditions UI
  updateTrailConditionsUI() {
      this.logger.debug('Updating trail conditions UI with data:', this.trailConditions);
      
      Object.entries(this.trailConditions).forEach(([trailId, conditions]) => {
          const trailElement = document.querySelector(`[data-trail-id="${trailId}"]`);
          
          if (trailElement) {
              Object.entries(conditions).forEach(([type, value]) => {
                  // Find the condition group by looking for the selected-value span with matching data-for-type
                  const headerSpan = trailElement.querySelector(`span.selected-value[data-for-type="${type}"]`);
                  if (headerSpan) {
                      // Get the parent condition group
                      const conditionGroup = headerSpan.closest('.condition-group');
                      if (conditionGroup) {
                          // Find button with matching value within this condition group
                          const button = conditionGroup.querySelector(`button[data-value="${value}"]`);
                          
                          if (button) {
                              // Clear previous selection in this group
                              conditionGroup.querySelectorAll('.condition-btn').forEach(btn => {
                                  btn.classList.remove('selected');
                              });
                              // Select the new button
                              button.classList.add('selected');
                              
                              // Update the selected value text
                              headerSpan.textContent = ': ' + button.title;
                          }
                      }
                  }
              });
          }
      });
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
              // Clone the template content
              const commonContent = commonTemplate.content.cloneNode(true);
              // Clear and replace placeholder content directly
              placeholder.innerHTML = '';
              placeholder.appendChild(commonContent);
          });
      } catch (error) {
          this.logger.error('Error replacing common sections:', error);
          throw error;
      }
  }
  
  async initializeForm(userData) {
    this.logger.debug('Initializing form with user data:', userData);
    try {
        const db = await this.dbManager.getDatabase();
        const forms = await new Promise((resolve, reject) => {
            const transaction = db.transaction(['formData'], 'readonly');
            const store = transaction.objectStore('formData');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        const isAdmin = userData?.ski_center_admin === "1";
        const stateManager = StateManager.getInstance();
        const currentCenter = stateManager.getSkiCenterData();
        const hasTrails = currentCenter?.trails && Array.isArray(currentCenter.trails) && currentCenter.trails.length > 0;
  
        // Start auto-save after form is initialized
        this.startAutoSave();
  
        // Get required elements
        const regularUserSection = document.getElementById('regular-user-section');
        const adminSection = document.getElementById('admin-section');
        const trailsSection = document.getElementById('trails-section');
        const rewardsSection = document.getElementById('rewards-section');
        const commonTemplate = document.getElementById('common-section');
        const cloneSection = document.getElementById('clone-section');

        if (!regularUserSection || !adminSection || !commonTemplate) {
            this.logger.error('Required form sections not found');
            return;
        }

        // For admin users, check for previously submitted form
        if (isAdmin && cloneSection) {
            const submittedForms = forms
                .filter(form => form.submitted)
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

            if (submittedForms[0]) {
                cloneSection.style.display = 'block';
                this.lastSubmittedForm = submittedForms[0];
                this.initializeCloneFeature();
            }
        }
      
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

            const submittedForms = forms
                .filter(form => form.submitted)
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
            const cloneSection = document.getElementById('clone-section');
            if (submittedForms[0] && cloneSection) {
                cloneSection.style.display = 'block';
                this.lastSubmittedForm = submittedForms[0];
                this.initializeCloneFeature();
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
            await this.videoManager.initializeVideoUpload(true);
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

        // Handle Facebook pages section if available
        const fbPagesSection = document.getElementById('fb-pages-section');

        if (fbPagesSection) {
          const hasFbPages = userData?.fb_pages && Array.isArray(userData.fb_pages) && userData.fb_pages.length > 0;
          fbPagesSection.style.display = (isAdmin && hasFbPages) ? 'block' : 'none';
          
          // Create list of Facebook pages
          if (hasFbPages) {
            this.initializeFacebookPages(userData.fb_pages);
          }
        }

        const privateReportSection = document.getElementById('private-report-section');
        if (privateReportSection) {
          privateReportSection.style.display = isAdmin ? 'none' : 'block';
        }

        // Find unsubmitted form if it exists
        const unsubmittedForm = forms.find(form => !form.submitted);
        if (unsubmittedForm) {
            this.currentFormId = unsubmittedForm.id;
            this.photoManager.setCurrentFormId(this.currentFormId);
            this.videoManager.setCurrentFormId(this.currentFormId);

            // Initialize dropdowns first
            await this.selectManager.refreshAllDropdowns();
            
            // Then initialize trails if needed
            if (isAdmin && hasTrails) {
                await this.initializeTrailsSection(currentCenter.trails);
            }

            await this.restoreFormState();
        } else {

          // Create new form entry in database
          const formData = {
              userId: userData?.nabezky_uid,
              startTime: new Date().toISOString(),
              isAdmin: userData?.ski_center_admin === "1",
              formState: {}
          };
      
          this.currentFormId = await this.dbManager.saveFormData(formData);
          this.photoManager.setCurrentFormId(this.currentFormId);
          await this.selectManager.refreshAllDropdowns();
        }
    } catch (error) {
        this.logger.error('Error initializing form:', error);
        throw error;
    }
  }

  initializeCloneFeature() {
      const cloneCheckbox = document.getElementById('clone-previous');
      if (!cloneCheckbox) return;
  
      // Single event listener for the clone checkbox
      cloneCheckbox.addEventListener('change', async (e) => {
          if (e.target.checked && this.lastSubmittedForm) {
              await this.populateFormWithLastSubmitted();
              cloneCheckbox.disabled = true;
              
              // Use existing state management to detect changes
              const originalState = this.collectSerializableFormData();
              this.lastClonedState = originalState;
  
              // Listen to existing autosave event which fires on form changes
              this.autoSaveInterval = setInterval(() => {
                  const currentState = this.collectSerializableFormData();
                  if (JSON.stringify(currentState) !== JSON.stringify(this.lastClonedState)) {
                      cloneCheckbox.disabled = false;
                      cloneCheckbox.checked = false;
                      clearInterval(this.autoSaveInterval);
                  }
              }, 1000); // Check less frequently than autosave
          }
      });
  }

  async populateFormWithLastSubmitted() {
      if (!this.lastSubmittedForm?.formState) return;
  
      try {
          // Populate form fields using existing method
          this.populateFormFields(this.lastSubmittedForm);
          
          // Restore trail conditions if present
          if (this.lastSubmittedForm.formState.trailConditions) {
              this.trailConditions = this.lastSubmittedForm.formState.trailConditions;
              this.updateTrailConditionsUI();
          }
  
          this.logger.debug('Form populated with last submitted data');
      } catch (error) {
          this.logger.error('Error populating form with last submitted data:', error);
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
    
    // Check if modal exists
    if (!submissionModal) {
      this.logger.error('Submission modal not found');
      alert(this.i18next.t('form.validation.submitError'));
      return;
    }
    
    // Reset the modal to a clean state
    submissionModal.querySelector('.modal-content').innerHTML = `
      <h3 data-i18n="form.submitting">${this.i18next.t('form.submitting')}</h3>
      <div id="submission-progress"></div>
      <div class="modal-buttons" style="justify-content: center;"></div>
    `;
    
    const progressDiv = document.getElementById('submission-progress');
  
    try {
      // Reset the success modal flag at the beginning
      this.isShowingSuccessModal = false;
      this.logger.debug('Reset isShowingSuccessModal flag to false');
      
      const authManager = AuthManager.getInstance();
      const tokenRefreshed = await authManager.checkAndRefreshToken();
      if (!tokenRefreshed) {
        throw new Error('Authentication expired. Please log in again.');
      }
  
      this.isSubmitting = true;
      submitButton.classList.add('submitting');
      this.logger.debug('Form submission started');
  
      // Show the modal with submitting message
      submissionModal.style.display = 'block';
      submissionModal.querySelector('.modal-content').classList.add('submitting');
  
      // Initialize progress div with progress bar + text
      progressDiv.innerHTML = `
        <div class="progress-text"></div>
        <div class="progress-container">
          <div class="progress-bar" id="upload-progress-bar" style="width: 0%;"></div>
        </div>
      `;
      this.logger.debug('Progress bar initialized with width: 0%');
      const progressTextDiv = progressDiv.querySelector('.progress-text');
      const progressBar = document.getElementById('upload-progress-bar');
      
      // Ensure progress bar is reset to 0%
      if (progressBar) {
        progressBar.style.width = '0%';
        this.logger.debug('Progress bar width reset to 0%');
      }
  
      // Form validation code
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
        // Hide the modal if validation fails
        submissionModal.style.display = 'none';
        submissionModal.querySelector('.modal-content').classList.remove('submitting');
        return;
      }
  
      // Photo upload handling
      let uploadedPhotoData = { photoIds: [], photoCaptions: {} };
  
      // Handle photo uploads if present
      const photos = this.photoManager.getPhotos();
      if (photos && photos.length > 0) {
        submissionModal.querySelector('.modal-content').classList.add('uploading');
        
        if (progressTextDiv) {
          progressTextDiv.textContent = this.i18next.t('form.uploadingPhotos', { 
            current: 0, 
            total: photos.length 
          });
        }
  
        try {
          uploadedPhotoData = await this.handlePhotoUploads(progressTextDiv, progressBar);
          this.logger.debug('Photos uploaded successfully:', uploadedPhotoData);
        } catch (error) {
          throw new Error(this.i18next.t('form.photoUploadError'));
        }
      }
  
      let uploadedVideoData = { videoIds: [], videoCaptions: {} };
      
      // Handle video uploads if present
      const videos = this.videoManager.getVideos();
      if (videos && videos.length > 0) {
        submissionModal.querySelector('.modal-content').classList.add('uploading');
        
        if (progressTextDiv) {
          progressTextDiv.textContent = this.i18next.t('form.uploadingVideos', { 
            current: 0, 
            total: videos.length 
          });
        }
        
        // Reset progress bar for video uploads
        if (progressBar) {
          progressBar.style.width = '0%';
          this.logger.debug('Progress bar reset to 0% for video uploads');
        }
        
        try {
          uploadedVideoData = await this.handleVideoUploads(progressTextDiv, progressBar);
          this.logger.debug('Videos uploaded successfully:', uploadedVideoData);
        } catch (error) {
          throw new Error(this.i18next.t('form.videoUploadError'));
        }
      }
  
      // Update progress for form submission
      submissionModal.querySelector('.modal-content').classList.remove('uploading');
      
      if (progressTextDiv) {
        progressTextDiv.textContent = this.i18next.t('form.sendingReport');
      }
      
      if (progressBar) {
        progressBar.style.width = '100%';
      }
  
      // Form data collection and submission...
      const formData = this.collectVisibleData(isAdmin);
      const gpxId = await this.handleGpxUpload();
      const formContent = this.collectVisibleData(isAdmin);
  
      // Include the photo and video data in the submission
      const submissionData = {
          data: {
              ...formContent,
              photoIds: uploadedPhotoData.photoIds,
              photoCaptions: uploadedPhotoData.photoCaptions,
              videoIds: uploadedVideoData.videoIds,
              videoCaptions: uploadedVideoData.videoCaptions,
              gpxId,
              reportType: isAdmin ? 'admin' : 'regular',
              trailConditions: isAdmin ? this.trailConditions : undefined
          }
      };
      
      // Submit the form data
      const result = await this.submitFormData(submissionData, isAdmin);
  
      let showingSuccessModal = false;
  
      if (result.success) {
        showingSuccessModal = true;
        await this.dbManager.markFormAsSubmitted(this.currentFormId);
        
        this.logger.debug('Form submission successful, showing links modal');
        
        // Show success modal with links
        this.showSuccessWithLinks(result);
        
        this.stopTrackingFormTime();
        this.resetForm(true);
        
        // Show dashboard
        document.getElementById('dashboard-container').style.display = 'block';
        document.getElementById('snow-report-form').style.display = 'none';
        document.getElementById('continue-draft-link').style.display = 'none';
      } else {
        this.logger.error('Form submission failed with result:', result);
        this.showError(result.message || this.i18next.t('form.validation.submitError'));
      }
    } catch (error) {
      this.logger.error('Error submitting snow report:', error);
      this.showError(this.i18next.t('form.validation.submitError'));
    }   finally {
      this.isSubmitting = false;
      submitButton.classList.remove('submitting');
      
      // Only hide modal if not showing success and there was an error
      if (!this.isShowingSuccessModal) {
        this.logger.debug('Hiding submission modal due to error or cancellation');
        submissionModal.style.display = 'none';
        submissionModal.querySelector('.modal-content').classList.remove('submitting');
        submissionModal.querySelector('.modal-content').classList.remove('uploading');
      } else {
        this.logger.debug('Keeping modal visible for success page');
      }
    }
  }

  showSuccessWithLinks(result) {
    // Get the existing modal
    const submissionModal = document.getElementById('submission-modal');
    if (!submissionModal) {
      this.logger.error('Submission modal not found');
      this.showSuccess(this.i18next.t('form.submitSuccess'));
      return;
    }
  
    // Set flag to indicate we're showing the success modal
    this.isShowingSuccessModal = true;
  
    const modalContent = submissionModal.querySelector('.modal-content');
    if (!modalContent) {
      this.logger.error('Modal content not found');
      this.showSuccess(this.i18next.t('form.submitSuccess'));
      return;
    }
  
    // Remove 'submitting' class if present
    modalContent.classList.remove('submitting');
  
    // Clear existing content
    modalContent.innerHTML = '';
    
    // Create success icon
    const successIcon = document.createElement('div');
    successIcon.className = 'success-icon';
    successIcon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="color(srgb 0.3601 0.3851 0.4062)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9 12l2 2 4-4"></path>
      </svg>
    `;
    modalContent.appendChild(successIcon);
    
    // Add success message
    const successMessage = document.createElement('h3');
    successMessage.textContent = this.i18next.t('form.submitSuccess');
    modalContent.appendChild(successMessage);
  
    this.logger.debug('Adding links to modal with result:', result);
  
    // Create a container for the links
    const linksContainer = document.createElement('div');
    linksContainer.className = 'result-links';
    
    // Add link to nabezky.sk portal if available
    if (result.nb_node_url) {
      const nabezkyLink = document.createElement('p');
      nabezkyLink.innerHTML = `<a href="${result.nb_node_url}" target="_blank" class="result-link">
        ${this.i18next.t('form.viewOnNaBezky')}</a>`;
      linksContainer.appendChild(nabezkyLink);
    }
    
    // Add Facebook page links if available
    if (result.fb_page_url) {
      console.log('Processing Facebook page URL:', result.fb_page_url);
      
      // Convert to array if it's a single string
      const fbPageUrls = Array.isArray(result.fb_page_url) 
        ? result.fb_page_url 
        : [result.fb_page_url];
      
      console.log('FB page URLs:', fbPageUrls);
      
      // Get user data directly
      const stateManager = StateManager.getInstance();
      const userData = stateManager.getState('auth.user');
      console.log('User data for Facebook pages:', userData);
      
      // Create the link text based on how many pages there are
      if (fbPageUrls.length === 1) {
        // Find the page name if available
        let pageName = "Facebook stránka"; // Default value
        
        // Try direct matching
        if (userData && userData.fb_pages && userData.fb_pages.length > 0) {
          for (const page of userData.fb_pages) {
            if (fbPageUrls[0].includes(page.page_id)) {
              pageName = page.page_name;
              console.log('Found matching page:', pageName);
              break;
            }
          }
        }
        
        // Create paragraph with unlinked text
        const fbPageParagraph = document.createElement('p');
        
        // Add the text prefix without the placeholder
        const textNode = document.createTextNode(this.i18next.t('form.viewOnFacebookPrefix') + ' ');
        fbPageParagraph.appendChild(textNode);
        
        // Create the link element
        const linkElement = document.createElement('a');
        linkElement.href = fbPageUrls[0];
        linkElement.target = '_blank';
        linkElement.className = 'result-link';
        linkElement.textContent = pageName;
        
        // Add link to paragraph
        fbPageParagraph.appendChild(linkElement);
        linksContainer.appendChild(fbPageParagraph);
      } else if (fbPageUrls.length > 1) {
        // Multiple pages
        const fbPageHeader = document.createElement('p');
        fbPageHeader.textContent = this.i18next.t('form.viewOnFacebookPagesPrefix');
        linksContainer.appendChild(fbPageHeader);
        
        const pageList = document.createElement('ul');
        fbPageUrls.forEach(url => {
          // Default page name
          let pageName = "Facebook stránka";
          
          // Try to extract the page ID and look it up
          if (userData && userData.fb_pages) {
            for (const page of userData.fb_pages) {
              if (url.includes(page.page_id)) {
                pageName = page.page_name;
                break;
              }
            }
          }
          
          const listItem = document.createElement('li');
          const linkElement = document.createElement('a');
          linkElement.href = url;
          linkElement.target = '_blank';
          linkElement.className = 'result-link';
          linkElement.textContent = pageName;
          
          listItem.appendChild(linkElement);
          pageList.appendChild(listItem);
        });
        linksContainer.appendChild(pageList);
      }
    }
    
    // Add timeline link if present
    if (result.fb_timeline_url) {
      const timelineLink = document.createElement('p');
      timelineLink.innerHTML = `<a href="${result.fb_timeline_url}" target="_blank" class="result-link">
        ${this.i18next.t('form.viewOnFacebookProfile')}</a>`;
      linksContainer.appendChild(timelineLink);
    }
  
    // Log what links we're adding
    this.logger.debug('Adding links container with content:', linksContainer.innerHTML);
  
    // Add the links container to the modal
    modalContent.appendChild(linksContainer);
    
    // Create button container and OK button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';
    buttonContainer.style.justifyContent = 'center';
    
    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.className = 'photo-button';
    okButton.textContent = this.i18next.t('form.ok');
    okButton.onclick = () => {
      submissionModal.style.display = 'none';
      this.isShowingSuccessModal = false;
    };
    
    buttonContainer.appendChild(okButton);
    modalContent.appendChild(buttonContainer);
  
    // Show the modal (it should already be visible, but just in case)
    submissionModal.style.display = 'block';
  }

  async handleVideoUploads(progressTextDiv, progressBar) {
    this.logger.debug('Starting video uploads with progress tracking');
    
    const videoManager = VideoManager.getInstance();
    const videos = videoManager.getVideos();
    
    this.logger.debug(`Found ${videos.length} videos to upload`);
    
    // Make sure progress bar is visible and at 0%
    if (progressBar) {
      progressBar.style.width = '0%';
      this.logger.debug('Video progress bar initialized at 0%');
    } else {
      this.logger.warn('Progress bar element not found for video uploads');
    }
    
    const videoIds = [];
    const videoCaptions = {};
    const videoOrder = new Map();
    let currentVideo = 0;
    let overallProgress = 0;
  
    if (videos && videos.length > 0) {
      for (const video of videos) {
        try {
          currentVideo++;
          const progressText = this.i18next.t('form.uploadingVideos', {
            current: currentVideo,
            total: videos.length
          });
          
          if (progressTextDiv) {
            progressTextDiv.textContent = progressText;
          }
          
          this.logger.debug('Preparing video upload:', {
            filename: video.file.name,
            size: video.file.size,
            type: video.file.type,
            hasCaption: !!video.caption,
            videoId: video.id,
            progress: `${currentVideo}/${videos.length}`
          });
  
          // Each file contributes equally to the overall progress
          const fileWeight = 100 / videos.length;
          let lastFileProgress = 0;
          
          // Use the upload with progress function
          const result = await uploadFileWithProgress(
            video.file, 
            video.caption,
            (percentComplete) => {
              // Calculate overall progress:
              // Previous completed files + progress of current file
              const previousFilesProgress = (currentVideo - 1) * fileWeight;
              const thisFileProgress = (percentComplete / 100) * fileWeight;
              overallProgress = previousFilesProgress + thisFileProgress;
              
              if (progressBar) {
                progressBar.style.width = `${overallProgress}%`;
                this.logger.debug(`Progress: ${Math.round(overallProgress)}%`);
              }
              
              // Only log significant changes to avoid spam
              if (Math.floor(percentComplete / 10) > Math.floor(lastFileProgress / 10)) {
                this.logger.debug(`File ${currentVideo}/${videos.length} progress: ${Math.round(percentComplete)}%`);
                lastFileProgress = percentComplete;
              }
            }
          );
  
          this.logger.debug('Video upload successful:', result);
          
          // Store fid and maintain order
          videoIds.push(result.fid);
          videoOrder.set(result.fid, video.id);
          
          // Make sure to store the caption with the server-assigned fid
          if (video.caption) {
            videoCaptions[result.fid] = video.caption;
            this.logger.debug('Storing caption for video:', {
              fid: result.fid,
              caption: video.caption
            });
          }
        } catch (error) {
          this.logger.error('Error uploading video:', {
            error: error.message
          });
          throw new Error(`Failed to upload video: ${error.message}`);
        }
      }
      
      if (progressTextDiv) {
        progressTextDiv.textContent = this.i18next.t('form.videosUploaded');
      }
      
      // Set to 100% when done
      if (progressBar) {
        progressBar.style.width = '100%';
      }
    }
  
    // Sort videoIds array based on original order
    const sortedVideoIds = videoIds.sort((a, b) => {
      const orderA = videos.findIndex(p => p.id === videoOrder.get(a));
      const orderB = videos.findIndex(p => p.id === videoOrder.get(b));
      return orderA - orderB;
    });
  
    this.logger.debug('Completed video uploads with data:', {
      videoIds: sortedVideoIds,
      videoCaptions: videoCaptions
    });
  
    return {
      videoIds: sortedVideoIds,
      videoCaptions: videoCaptions
    };
  }

  async function uploadFileWithProgress(file, caption, progressCallback) {
    return new Promise((resolve, reject) => {
      // Create FormData
      const formData = new FormData();
      formData.append('filedata', file);
      if (caption) {
        formData.append('caption', caption);
      }
      
      // Create XHR request for progress tracking
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          progressCallback(percentComplete);
        }
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid response format'));
          }
        } else {
          reject(new Error(`Upload failed with status: ${xhr.status}`));
        }
      });
      
      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });
      
      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });
      
      // Open and send the request
      xhr.open('POST', '/api/upload-file', true);
      xhr.withCredentials = true; // Include credentials for cross-origin requests if needed
      xhr.send(formData);
    });
  }
  
  getFacebookPageName(url, fbPages) {
    // Add console.log in addition to this.logger for guaranteed output
    console.log('getFacebookPageName called with:', { url, fbPages });
    this.logger.debug('getFacebookPageName called with:', { url, fbPages });
    
    if (!url || !fbPages || !fbPages.length) {
      console.log('Missing required data, returning default page name');
      return this.i18next.t('form.facebookPage');
    }
    
    try {
      // Extract the page ID from the URL
      // URL format is typically https://www.facebook.com/PAGE_ID/posts/POST_ID
      const urlParts = url.split('/');
      console.log('URL parts:', urlParts);
      
      const facebookIndex = urlParts.indexOf('facebook.com');
      console.log('Facebook index:', facebookIndex);
      
      if (facebookIndex === -1) {
        // Try another approach if facebook.com isn't found as a separate part
        const fbIndex = urlParts.findIndex(part => part.includes('facebook.com'));
        console.log('Alternative FB index:', fbIndex);
        
        if (fbIndex !== -1) {
          // Extract the page ID from the URL differently
          // It might be something like "www.facebook.com/596487096875201/posts/..."
          const fullPath = urlParts[fbIndex];
          console.log('Full path with facebook.com:', fullPath);
          
          const afterFB = fullPath.split('facebook.com/')[1];
          console.log('After facebook.com/:', afterFB);
          
          if (afterFB) {
            const pageId = afterFB.split('/')[0];
            console.log('Extracted page ID (alternative method):', pageId);
            
            // Find matching page in user data
            const page = fbPages.find(p => p.page_id === pageId);
            console.log('Found page object:', page);
            
            if (page && page.page_name) {
              console.log('Returning page name:', page.page_name);
              return page.page_name;
            }
          }
        }
        
        console.log('Could not find facebook.com in URL parts');
        return this.i18next.t('form.facebookPage');
      }
      
      const pageIdIndex = facebookIndex + 1;
      if (pageIdIndex < urlParts.length) {
        const pageId = urlParts[pageIdIndex];
        console.log('Extracted page ID (standard method):', pageId);
        
        // Find matching page in user data
        const page = fbPages.find(p => p.page_id === pageId);
        console.log('Found page object:', page);
        
        if (page && page.page_name) {
          console.log('Returning page name:', page.page_name);
          return page.page_name;
        }
      }
    } catch (error) {
      console.error('Error extracting Facebook page name:', error);
      this.logger.error('Error extracting Facebook page name:', error);
    }
    
    console.log('Falling back to default page name');
    return this.i18next.t('form.facebookPage');
  }
  
  // Helper function to get Facebook page name from URL
  getFacebookPageName(url, fbPages) {
    if (!url || !fbPages || !fbPages.length) {
      return this.i18next.t('form.facebookPage');
    }
    
    try {
      // Extract the page ID from the URL
      // URL format is typically https://www.facebook.com/PAGE_ID/posts/POST_ID
      const urlParts = url.split('/');
      const pageIdIndex = urlParts.indexOf('facebook.com') + 1;
      if (pageIdIndex < urlParts.length) {
        const pageId = urlParts[pageIdIndex];
        
        // Find matching page in user data
        const page = fbPages.find(p => p.page_id === pageId);
        if (page && page.page_name) {
          return page.page_name;
        }
      }
    } catch (error) {
      this.logger.error('Error extracting Facebook page name:', error);
    }
    
    return this.i18next.t('form.facebookPage');
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
              'snow-depth-new': 'snowDepthNew'
              // Deliberately omitting 'ski-center-id' as we'll set it directly from state
          };
  
          const postToFbCheckbox = document.getElementById('post-to-fb');
          if (postToFbCheckbox && postToFbCheckbox.closest('div').style.display !== 'none') {
              data.post_to_fb = postToFbCheckbox.checked ? 1 : 0;
          }
  
          Object.entries(adminFields).forEach(([elementId, dataKey]) => {
              const element = document.getElementById(elementId);
              if (element && element.value) {
                  data[dataKey] = element.value;
              }
          });
          
          // ALWAYS get ski center ID from state manager for admin forms
          const stateManager = StateManager.getInstance();
          const currentCenter = stateManager.getSkiCenterData();
          
          if (currentCenter && currentCenter.id) {
              // Use the ID from state manager
              data.skiCenterId = currentCenter.id;
              this.logger.debug('Using ski center ID from state manager:', currentCenter.id);
          } else {
              // Fallback to form input only if state manager has no value (shouldn't happen)
              const skiCenterIdInput = document.getElementById('ski-center-id');
              if (skiCenterIdInput && skiCenterIdInput.value) {
                  data.skiCenterId = skiCenterIdInput.value;
                  this.logger.debug('Falling back to form input for ski center ID:', skiCenterIdInput.value);
              }
          }
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
  
      const result = await response.json();
      
      // Debug the result to see what we're getting back from the server
      this.logger.debug('Form submission response:', result);
      
      return result;
    } catch (error) {
      this.logger.error('Form submission error:', error);
      throw error;
    }
  }

  async handlePhotoUploads(progressTextDiv, progressBar) {
    this.logger.debug('Starting photo uploads with progress tracking');
    
    const photoManager = PhotoManager.getInstance();
    const photos = photoManager.getPhotos();
    
    this.logger.debug(`Found ${photos.length} photos to upload`);
    
    // Make sure progress bar is visible and at 0%
    if (progressBar) {
      progressBar.style.width = '0%';
      this.logger.debug('Photo progress bar initialized at 0%');
    }
    
    const photoIds = [];
    const photoCaptions = {};
    const photoOrder = new Map();
    let currentPhoto = 0;
    let overallProgress = 0;
  
    if (photos && photos.length > 0) {
      for (const photo of photos) {
        try {
          currentPhoto++;
          // Update text to show which file is being processed
          const progressText = this.i18next.t('form.uploadingPhotos', {
            current: currentPhoto,
            total: photos.length
          });
          
          if (progressTextDiv) {
            progressTextDiv.textContent = progressText;
          }
          
          this.logger.debug('Preparing photo upload:', {
            filename: photo.file.name,
            size: photo.file.size,
            type: photo.file.type,
            hasCaption: !!photo.caption,
            photoId: photo.id,
            progress: `${currentPhoto}/${photos.length}`
          });
  
          // Each file contributes equally to the overall progress
          const fileWeight = 100 / photos.length;
          let lastFileProgress = 0;
          
          // Use the upload with progress function
          const result = await uploadFileWithProgress(
            photo.file, 
            photo.caption,
            (percentComplete) => {
              // Calculate overall progress:
              // Previous completed files + progress of current file
              const previousFilesProgress = (currentPhoto - 1) * fileWeight;
              const thisFileProgress = (percentComplete / 100) * fileWeight;
              overallProgress = previousFilesProgress + thisFileProgress;
              
              if (progressBar) {
                progressBar.style.width = `${overallProgress}%`;
                this.logger.debug(`Progress: ${Math.round(overallProgress)}%`);
              }
              
              // Only log significant changes to avoid spam
              if (Math.floor(percentComplete / 10) > Math.floor(lastFileProgress / 10)) {
                this.logger.debug(`File ${currentPhoto}/${photos.length} progress: ${Math.round(percentComplete)}%`);
                lastFileProgress = percentComplete;
              }
            }
          );
  
          this.logger.debug('Photo upload successful:', result);
          
          // Store fid and maintain order
          photoIds.push(result.fid);
          photoOrder.set(result.fid, photo.id);
          if (photo.caption) {
            photoCaptions[result.fid] = photo.caption;
          }
        } catch (error) {
          this.logger.error('Error uploading photo:', error);
          throw new Error(`Failed to upload photo: ${error.message}`);
        }
      }
      
      if (progressTextDiv) {
        progressTextDiv.textContent = this.i18next.t('form.photosUploaded');
      }
      
      // Set to 100% when done
      if (progressBar) {
        progressBar.style.width = '100%';
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

  initializeFacebookPages(fbPages) {
    const fbPagesListElement = document.getElementById('fb-pages-list');
    if (!fbPagesListElement) return;
    
    // Clear existing content
    fbPagesListElement.innerHTML = '';
    
    // Add each Facebook page to the list
    fbPages.forEach(page => {
      const listItem = document.createElement('li');
      listItem.textContent = page.page_name;
      listItem.dataset.pageId = page.page_id;
      fbPagesListElement.appendChild(listItem);
    });
    
    // Check the post to FB checkbox by default
    const postToFbCheckbox = document.getElementById('post-to-fb');
    if (postToFbCheckbox) {
      postToFbCheckbox.checked = true;
    }
  }

  handleCancel() {
    this.stopAutoSave();
    this.stopTrackingFormTime();
    this.resetForm();
    document.getElementById('dashboard-container').style.display = 'block';
    document.getElementById('snow-report-form').style.display = 'none';
    document.getElementById('continue-draft-link').style.display = 'none';
  }

  resetForm(keepDatabaseData = false) {

    // Clear clone interval if exists
    if (this.autoSaveInterval) {
        clearInterval(this.autoSaveInterval);
        this.autoSaveInterval = null;
    }
    this.lastSubmittedForm = null;
    this.lastClonedState = null;
    
    // Only clear database if explicitly requested
    if (!keepDatabaseData && this.currentFormId) {
        try {
            this.dbManager.clearForm(this.currentFormId);
            this.currentFormId = null;
        } catch (error) {
            this.logger.error('Error clearing form data:', error);
        }
    }
    
    const form = document.getElementById('snow-report-form');
    if (form) {
      form.reset();
      this.trailConditions = {};
      this.photoManager.clearPhotos();
      this.videoManager.clearVideos();
      this.stopTrackingFormTime();
      this.formStartTime = null;
      
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

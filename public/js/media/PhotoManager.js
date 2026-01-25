import Logger from '../utils/Logger.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import StateManager from '../state/StateManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';

class PhotoManager {
  static instance = null;

  constructor() {
      if (PhotoManager.instance) {
          return PhotoManager.instance;
      }
      this.photoEntries = [];  // Array of {id, file, caption, order} objects
      this.nextId = 1;

      this.photos = [];
      this.photoCaptions = new Map();
      this.logger = Logger.getInstance();
      this.initialized = false;
      this.i18next = i18next;
      PhotoManager.instance = this;
      this.dbManager = DatabaseManager.getInstance();
      this.currentFormId = null;
  }

  static getInstance() {
    if (!PhotoManager.instance) {
      PhotoManager.instance = new PhotoManager();
    }
    return PhotoManager.instance;
  }

  rationalToNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object' && 'numerator' in value) {
      const denom = value.denominator ?? 1;
      const num = value.numerator ?? null;
      if (num === null) return null;
      const n = denom ? num / denom : num;
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  dmsToDecimal(dmsArray, ref) {
    if (!Array.isArray(dmsArray) || dmsArray.length < 2) return null;
    const deg = this.rationalToNumber(dmsArray[0]);
    const min = this.rationalToNumber(dmsArray[1]);
    const sec = this.rationalToNumber(dmsArray[2] ?? 0);
    if (deg === null || min === null || sec === null) return null;

    let dec = deg + (min / 60) + (sec / 3600);
    if (ref === 'S' || ref === 'W') dec = -dec;
    return Number.isFinite(dec) ? dec : null;
  }

  async getPhotoGeoOrientation(file) {
    const logger = this.logger;
    return new Promise((resolve) => {
      EXIF.getData(file, function() {
        const img = this;

        const latDms = EXIF.getTag(img, 'GPSLatitude');
        const latRef = EXIF.getTag(img, 'GPSLatitudeRef');
        const lonDms = EXIF.getTag(img, 'GPSLongitude');
        const lonRef = EXIF.getTag(img, 'GPSLongitudeRef');

        const gpsImgDirection = EXIF.getTag(img, 'GPSImgDirection');

        const lat = latDms ? PhotoManager.instance.dmsToDecimal(latDms, latRef) : null;
        const lon = lonDms ? PhotoManager.instance.dmsToDecimal(lonDms, lonRef) : null;
        const heading = gpsImgDirection !== undefined && gpsImgDirection !== null
          ? PhotoManager.instance.rationalToNumber(gpsImgDirection)
          : null;

        // Normalize heading to [0, 360)
        const headingNormalized = heading !== null
          ? ((heading % 360) + 360) % 360
          : null;

        const meta = {
          lat,
          lon,
          // Camera compass direction (degrees), when present
          orientation: headingNormalized
        };

        logger.debug('Extracted EXIF geo/orientation:', meta);
        resolve(meta);
      });
    });
  }

  async getPhotoTimestamp(file) {
    const logger = this.logger;
    logger.debug('Getting time from the photo EXIF');
    
    return new Promise((resolve) => {
      EXIF.getData(file, function() {
        let timestamp;
        const img = this;
        
        // Log all available tags for debugging
        logger.debug('All EXIF tags:');
        const allTags = EXIF.getAllTags(img);
//        logger.debug(JSON.stringify(allTags, null, 2));
        
        // Try GPS timestamp first (it's in UTC)
        const gpsDateStamp = EXIF.getTag(img, "GPSDateStamp");
        const gpsTimeStamp = EXIF.getTag(img, "GPSTimeStamp");
        
        if (gpsDateStamp && gpsTimeStamp) {
          logger.debug('Found GPS timestamp data:', { gpsDateStamp, gpsTimeStamp });
          
          try {
            // GPSDateStamp is in format "YYYY:MM:DD"
            // GPSTimeStamp is an array of [hours, minutes, seconds]
            const [datePart] = gpsDateStamp.split(' ');
            const formattedDate = datePart.replace(/:/g, '-');
            const timeStr = gpsTimeStamp.map(num => Math.floor(num).toString().padStart(2, '0')).join(':');
            const formattedDateTime = `${formattedDate}T${timeStr}Z`; // 'Z' indicates UTC
            
            timestamp = new Date(formattedDateTime);
            
            if (!isNaN(timestamp.getTime())) {
              logger.debug('Successfully parsed GPS timestamp (UTC):', timestamp);
              resolve(timestamp);
              return;
            }
          } catch (error) {
            logger.debug('Error parsing GPS timestamp:', error);
          }
        }
        
        // Try original datetime with timezone offset if available
        const originalTime = EXIF.getTag(img, "DateTimeOriginal") || 
                           EXIF.getTag(img, "DateTimeDigitised") ||  
                           EXIF.getTag(img, "DateTimeDigitized") || 
                           EXIF.getTag(img, "DateTime");
        
        const offsetTime = EXIF.getTag(img, "OffsetTimeOriginal") ||
                          EXIF.getTag(img, "OffsetTime");
        
        logger.debug('Found datetime data:', { originalTime, offsetTime });
        
        if (originalTime) {
          try {
            // Standard format is "YYYY:MM:DD HH:MM:SS"
            const [datePart, timePart] = originalTime.split(' ');
            const formattedDate = datePart.replace(/:/g, '-');
            
            // If we have timezone offset, use it, otherwise assume local time
            let formattedDateTime;
            if (offsetTime) {
              formattedDateTime = `${formattedDate}T${timePart}${offsetTime}`;
            } else {
              formattedDateTime = `${formattedDate}T${timePart}`;
            }
            
            timestamp = new Date(formattedDateTime);
            
            if (!isNaN(timestamp.getTime())) {
              logger.debug('Successfully parsed EXIF timestamp:', timestamp);
              resolve(timestamp);
              return;
            }
          } catch (error) {
            logger.debug('Error parsing EXIF timestamp:', error);
          }
        }
        
        // Last resort: file timestamp or current time
        timestamp = file.lastModified ? new Date(file.lastModified) : new Date();
        logger.debug('Using fallback timestamp:', timestamp);
        resolve(timestamp);
      });
    });
  }
  
  async initializePhotoUpload(forceInit = false) {
    console.log('PhotoManager initializePhotoUpload called, force:', forceInit);
    
    if (this.initialized && !forceInit) {
      console.log('PhotoManager already initialized');
      return;
    }

    if (!this.i18next.isInitialized) {
        await new Promise(resolve => {
            this.i18next.on('initialized', resolve);
        });
    }

    // Set up language change listener after ensuring i18next is initialized
    this.i18next.on('languageChanged', () => {
        if (this.initialized) {
            this.updateTranslations();
        }
    });

    this.initialized = false;  // Reset flag when forced
    console.log('Finding photo elements');

    // Create or find photo reorder instruction text
    let reorderInstruction = document.getElementById('photo-reorder-instruction');
    const previewContainer = document.getElementById('photo-preview-container');
    if (previewContainer && !reorderInstruction) {
      reorderInstruction = document.createElement('p');
      reorderInstruction.id = 'photo-reorder-instruction';
      reorderInstruction.className = 'photo-reorder-instruction';
      reorderInstruction.textContent = this.i18next.t('form.photoReorderInstruction', 'Click anywhere on a photo and drag it to a new position to rearrange the photos order');
      reorderInstruction.style.display = 'none'; // Hidden by default, shown when 2+ photos
      previewContainer.parentNode.insertBefore(reorderInstruction, previewContainer);
    } else if (reorderInstruction) {
      reorderInstruction.textContent = this.i18next.t('form.photoReorderInstruction', 'Click anywhere on a photo and drag it to a new position to rearrange the photos order');
    }

    // Find existing elements
    const selectPhotosBtn = document.getElementById('select-photos');
    const takePhotoBtn = document.getElementById('take-photo');
    const fileInput = document.getElementById('photo-file-input');
    const cameraInput = document.getElementById('camera-input');

    console.log('Photo elements found:', {
      selectPhotosBtn: !!selectPhotosBtn,
      takePhotoBtn: !!takePhotoBtn,
      fileInput: !!fileInput,
      cameraInput: !!cameraInput
    });
    
    this.logger.debug('Found elements:', {
      selectPhotosBtn: !!selectPhotosBtn,
      takePhotoBtn: !!takePhotoBtn,
      fileInput: !!fileInput,
      cameraInput: !!cameraInput
    });

    if (!selectPhotosBtn || !takePhotoBtn) {
      this.logger.error('Photo buttons not found in DOM');
      return;
    }

    if (!fileInput || !cameraInput) {
      this.logger.debug('Creating input elements...');
      this.createInputElements();
      return this.initializePhotoUpload();
    }

    // Remove any existing listeners
    const newFileInput = fileInput.cloneNode(true);
    const newCameraInput = cameraInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    cameraInput.parentNode.replaceChild(newCameraInput, cameraInput);

    // Add event listeners
    selectPhotosBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.logger.debug('Select photos button clicked');
      newFileInput.click();
    };

    takePhotoBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.logger.debug('Take photo button clicked');
      newCameraInput.click();
    };

    newFileInput.onchange = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.logger.debug('File input change event', { files: e.target.files?.length });
      if (e.target.files?.length > 0) {
        await this.handleFiles(e.target.files);
        e.target.value = ''; // Clear the input
      }
    };

    newCameraInput.onchange = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.logger.debug('Camera input change event', { files: e.target.files?.length });
      if (e.target.files?.length > 0) {
        await this.handleFiles(e.target.files);
        e.target.value = ''; // Clear the input
      }
    };

    // Update translations
    this.updateTranslations();
    
    this.initialized = true;
    this.logger.debug('PhotoManager initialization complete');
  }

  updateTranslations() {
      const selectPhotosBtn = document.getElementById('select-photos');
      const takePhotoBtn = document.getElementById('take-photo');
      
      if (selectPhotosBtn) {
          selectPhotosBtn.textContent = this.i18next.t('form.selectPhotos');
      }
      if (takePhotoBtn) {
          takePhotoBtn.textContent = this.i18next.t('form.takePhoto');
      }

      // Also update any existing photo captions placeholder text
      const captionInputs = document.querySelectorAll('.photo-caption');
      captionInputs.forEach(input => {
          input.placeholder = this.i18next.t('form.captionPlaceholder', 'Add a caption...');
      });
      
      // Update photo reorder instruction text
      const reorderInstruction = document.getElementById('photo-reorder-instruction');
      if (reorderInstruction) {
          reorderInstruction.textContent = this.i18next.t('form.photoReorderInstruction', 'Click anywhere on a photo and drag it to a new position to rearrange the photos order');
      }
  }
  
  createInputElements() {
    this.logger.debug('Creating file input elements');
    
    // Create file input if it doesn't exist
    if (!document.getElementById('photo-file-input')) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'photo-file-input';
      fileInput.accept = 'image/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
    }

    // Create camera input if it doesn't exist
    if (!document.getElementById('camera-input')) {
      const cameraInput = document.createElement('input');
      cameraInput.type = 'file';
      cameraInput.id = 'camera-input';
      cameraInput.accept = 'image/*';
      cameraInput.capture = 'environment';
      cameraInput.style.display = 'none';
      document.body.appendChild(cameraInput);
    }
  }
  
  async handleFiles(fileList) {
      if (!fileList || fileList.length === 0) {
          this.logger.warn('No files selected');
          return;
      }
  
      const previewContainer = document.getElementById('photo-preview-container');
      if (!previewContainer) {
          this.logger.error('Preview container not found');
          return;
      }
  
      // Check if user is admin
      const stateManager = StateManager.getInstance();
      const userData = stateManager.getState('auth.user');
      const isAdmin = userData?.ski_center_admin === "1";
  
      // Step 1: Extract timestamps for all photos and create file metadata
      const fileMetadata = [];
      for (const file of Array.from(fileList)) {
          if (!file.type.startsWith('image/')) {
              this.logger.warn(`Skipping non-image file: ${file.name}`);
              continue;
          }
          
          // Extract timestamp for all photos (for sorting purposes)
          const photoTimestamp = await this.getPhotoTimestamp(file);
          // Extract lat/lon + orientation from EXIF BEFORE resize (resize strips EXIF)
          const exifMeta = await this.getPhotoGeoOrientation(file);
          fileMetadata.push({
              file,
              timestamp: photoTimestamp,
              timestampValue: photoTimestamp.getTime(),
              exifMeta
          });
      }
  
      // Step 2: Sort files by timestamp (oldest first)
      fileMetadata.sort((a, b) => a.timestampValue - b.timestampValue);
      this.logger.debug('Files sorted by timestamp:', fileMetadata.map(f => ({ name: f.file.name, time: f.timestamp })));
  
      // Step 3: Process files in sorted order
      for (const { file, timestamp: photoTimestamp, exifMeta } of fileMetadata) {
          try {
              // Process image first
              let processedFile = await this.resizeImage(file);
  
              if (isAdmin) {
                  this.logger.debug('Original photo timestamp:', photoTimestamp);
  
                  // Process the image with timestamp overlay
                  processedFile = await this.addTimestampToImage(processedFile, photoTimestamp);
              }
  
              // Save to database with order based on timestamp
              let photoId = null;
              if (this.currentFormId) {
                  try {
                      const initialCaption = '';
                      const order = this.photoEntries.length;
                      photoId = await this.dbManager.savePhoto(this.currentFormId, processedFile, initialCaption, order, photoTimestamp, exifMeta);
                      this.logger.debug('Saved photo to database:', photoId);
                  } catch (error) {
                      this.logger.error('Failed to save photo to database:', error);
                      throw error;
                  }
              }
  
              // Only add to photos array and preview if database save was successful
              if (photoId || !this.currentFormId) {
                  this.photos.push(processedFile);
                  await this.addPhotoPreview(processedFile, photoId, '', photoTimestamp, exifMeta);
              }
  
          } catch (error) {
              this.logger.error('Error processing file:', error);
              // Continue with next file instead of breaking the whole upload
              continue;
          }
      }
  }
  
  async reorderPhotos(draggedPhotoId, targetPhotoId) {
    const draggedIndex = this.photoEntries.findIndex(entry => entry.id === draggedPhotoId);
    const targetIndex = this.photoEntries.findIndex(entry => entry.id === targetPhotoId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }
    
    // Remove dragged photo from its position
    const [draggedEntry] = this.photoEntries.splice(draggedIndex, 1);
    
    // Insert at target position
    this.photoEntries.splice(targetIndex, 0, draggedEntry);
    
    // Update all order indices
    this.photoEntries.forEach((entry, index) => {
      entry.order = index;
    });
    
    // Reorder DOM elements
    await this.reorderDOMElements();
    
    // Update database order
    await this.savePhotoOrderToDatabase();
  }
  
  async reorderDOMElements() {
    const previewContainer = document.getElementById('photo-preview-container');
    if (!previewContainer) {
      return;
    }
    
    // Sort entries by order
    const sortedEntries = [...this.photoEntries].sort((a, b) => a.order - b.order);
    
    // Reorder DOM elements to match sorted entries
    sortedEntries.forEach((entry) => {
      const wrapper = previewContainer.querySelector(`[data-photo-id="${entry.id}"]`);
      if (wrapper) {
        previewContainer.appendChild(wrapper);
      }
    });
  }
  
  async savePhotoOrderToDatabase() {
    if (!this.currentFormId) {
      return;
    }
    
    // Update order in database for all photos
    for (const entry of this.photoEntries) {
      if (entry.dbId) {
        try {
          await this.dbManager.updatePhotoOrder(entry.dbId, entry.order);
        } catch (error) {
          this.logger.error('Error updating photo order in database:', error);
        }
      }
    }
  }
  
  
  async addTimestampToImage(file, timestamp) {
      return new Promise((resolve, reject) => {
          const img = new Image();
          const reader = new FileReader();
  
          reader.onload = () => {
              img.src = reader.result;
          };
  
          img.onload = () => {
              try {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext('2d');
  
                  // Draw the image
                  ctx.drawImage(img, 0, 0);
  
                  // Configure text style
                  ctx.fillStyle = 'white';
                  ctx.strokeStyle = 'black';
                  ctx.lineWidth = 3;
                  const fontSize = Math.max(Math.min(img.width * 0.04, 48), 16);
                  ctx.font = `${fontSize}px Arial`;
  
                  // Format the timestamp
                  const timestampText = timestamp.toLocaleString(this.i18next.language, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                  });
  
                  // Position text
                  const padding = fontSize;
                  const textMetrics = ctx.measureText(timestampText);
                  const x = canvas.width - textMetrics.width - padding;
                  const y = canvas.height - padding;
  
                  // Draw text
                  ctx.strokeText(timestampText, x, y);
                  ctx.fillText(timestampText, x, y);
  
                  canvas.toBlob((blob) => {
                      resolve(new File([blob], file.name, {
                          type: 'image/jpeg',
                          lastModified: timestamp.getTime()
                      }));
                  }, 'image/jpeg', 0.9);
              } catch (error) {
                  reject(error);
              }
          };
  
          img.onerror = reject;
          reader.onerror = reject;
  
          reader.readAsDataURL(file);
      });
  }

  async resizeImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result;
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Resize if image is too large
          if (width > 1900 || height > 1900) {
            if (width > height) {
              height = Math.round((height * 1900) / width);
              width = 1900;
            } else {
              width = Math.round((width * 1900) / height);
              height = 1900;
            }
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          }, 'image/jpeg', 0.9);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      reader.readAsDataURL(file);
    });
  }

  async addPhotoPreview(file, dbId, caption = '', timestamp = null, exifMeta = null) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const previewContainer = document.getElementById('photo-preview-container');
          if (!previewContainer) {
            throw new Error('Preview container not found');
          }

          const wrapper = document.createElement('div');
          wrapper.className = 'photo-preview';

          const img = document.createElement('img');
          img.src = e.target.result;
          img.dataset.rotation = '0';

          // Generate unique ID and add to photoEntries
          const photoId = `photo_${this.nextId++}`;
          const photoOrder = this.photoEntries.length;
          const photoEntry = {
            id: photoId,
            dbId: dbId,
            file: file,
            caption: caption,
            order: photoOrder,
            timestamp: timestamp || null,
            exif: exifMeta || null
          };
          this.photoEntries.push(photoEntry);
          
          wrapper.dataset.photoId = photoId;

          // Create photo info container
          const photoInfo = document.createElement('div');
          photoInfo.className = 'photo-info';

          // Create caption textarea with auto-expand
          const captionInput = document.createElement('textarea');
          captionInput.className = 'photo-caption';
          captionInput.placeholder = this.i18next.t('form.captionPlaceholder', 'Add a caption...');
          captionInput.maxLength = 200;
          captionInput.rows = 1;
          captionInput.style.resize = 'none';
          captionInput.style.overflow = 'hidden';

          if (dbId) {
              const entry = this.photoEntries.find(entry => entry.dbId === dbId);
              if (entry && entry.caption) {
                  captionInput.value = entry.caption;
              }
          }

          // Auto-expand textarea functionality
          const autoExpand = () => {
              captionInput.style.height = 'auto';
              const scrollHeight = captionInput.scrollHeight;
              const maxHeight = 100; // Maximum height in pixels
              captionInput.style.height = Math.min(scrollHeight, maxHeight) + 'px';
              
              // Show scrollbar if content exceeds max height
              if (scrollHeight > maxHeight) {
                  captionInput.style.overflowY = 'auto';
              } else {
                  captionInput.style.overflowY = 'hidden';
              }
          };
          captionInput.addEventListener('input', autoExpand);
          captionInput.addEventListener('paste', () => {
              setTimeout(autoExpand, 10);
          });
          // Call once on load to set initial height
          setTimeout(autoExpand, 10);

          // Save caption to the photoEntry
          captionInput.addEventListener('input', async (e) => {
              const entry = this.photoEntries.find(entry => entry.id === photoId);
              if (entry) {
                  entry.caption = e.target.value;
                  try {
                      // Use the database ID (dbId) rather than the UI ID
                      if (entry.dbId) {
                          await this.dbManager.updateCaption(entry.dbId, e.target.value);
                      }
                  } catch (error) {
                      this.logger.error('Error updating caption in database:', error);
                  }
              }
          });

          const controlsDiv = document.createElement('div');
          controlsDiv.className = 'photo-controls';

          const rotateBtn = document.createElement('button');
          rotateBtn.className = 'rotate-photo';
          rotateBtn.innerHTML = '↻';
          rotateBtn.title = 'Rotate 90° clockwise';
          rotateBtn.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.rotatePhoto(img, file, photoId);
          };

          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-photo';
          removeBtn.innerHTML = '×';
          removeBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.removePhoto(photoId, wrapper);
          };

          controlsDiv.appendChild(rotateBtn);
          controlsDiv.appendChild(removeBtn);
          
          // Make photo preview draggable
          wrapper.draggable = true;
          wrapper.classList.add('draggable-photo');
          wrapper.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', photoId);
            wrapper.classList.add('dragging');
          });
          wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('dragging');
          });
          wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!wrapper.classList.contains('drag-over')) {
              wrapper.classList.add('drag-over');
            }
          });
          wrapper.addEventListener('dragleave', () => {
            wrapper.classList.remove('drag-over');
          });
          wrapper.addEventListener('drop', async (e) => {
            e.preventDefault();
            wrapper.classList.remove('drag-over');
            const draggedPhotoId = e.dataTransfer.getData('text/plain');
            if (draggedPhotoId && draggedPhotoId !== photoId) {
              await this.reorderPhotos(draggedPhotoId, photoId);
            }
          });
          
          // Assemble the layout: img, controls, photoInfo (with caption)
          photoInfo.appendChild(captionInput);
          wrapper.appendChild(img);
          wrapper.appendChild(controlsDiv);
          wrapper.appendChild(photoInfo);
          previewContainer.appendChild(wrapper);
          
          // Update instruction text visibility
          this.updateReorderInstructionVisibility();

          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file for preview'));
      };

      reader.readAsDataURL(file);
    });
  }

  async rotatePhoto(img, file, photoIndex) {
    try {
      const currentRotation = parseInt(img.dataset.rotation) || 0;
      const newRotation = (currentRotation + 90) % 360;
      img.style.transform = `rotate(${newRotation}deg)`;
      img.dataset.rotation = newRotation;

      const rotatedFile = await this.rotateImage(file, newRotation);
      this.photos[photoIndex] = rotatedFile;
    } catch (error) {
      this.logger.error('Error rotating photo:', error);
      throw error;
    }
  }

  async removePhoto(photoId, wrapper) {
      try {
        const photoEntry = this.photoEntries.find(entry => entry.id === photoId);
      if (photoEntry) {
          // If we have a database ID, delete from database
          if (photoEntry.dbId) {
              await this.dbManager.deletePhoto(photoEntry.dbId);
          }

          this.photoEntries = this.photoEntries.filter(entry => entry.id !== photoId);
          this.photoCaptions.delete(photoId);
          wrapper.remove();

          // Reorder remaining photos
          this.photoEntries.forEach((entry, index) => {
              entry.order = index;
          });
      
          // Update database order
          await this.savePhotoOrderToDatabase();
          
          // Update instruction text visibility
          this.updateReorderInstructionVisibility();
        }
      } catch (error) {
          this.logger.error('Error removing photo:', error);
          throw error;
      }
  }

  async rotateImage(file, degrees) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = () => {
        img.src = reader.result;
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const swap = degrees === 90 || degrees === 270;
          canvas.width = swap ? img.height : img.width;
          canvas.height = swap ? img.width : img.height;

          const ctx = canvas.getContext('2d');
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((degrees * Math.PI) / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);

          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          }, 'image/jpeg', 0.9);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image for rotation'));
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file for rotation'));
      };

      reader.readAsDataURL(file);
    });
  }

  getPhotos() {
    // Return photos sorted by their original order
    return this.photoEntries
      .sort((a, b) => a.order - b.order)
      .map(entry => ({
        file: entry.file,
        caption: entry.caption,
        id: entry.id,
        exif: entry.exif || null
      }));
  }

  clearPhotos() {
    this.photoEntries = [];
    const previewContainer = document.getElementById('photo-preview-container');
    if (previewContainer) {
      previewContainer.innerHTML = '';
    }
    // Update instruction text visibility
    this.updateReorderInstructionVisibility();
  }
  
  updateReorderInstructionVisibility() {
    const reorderInstruction = document.getElementById('photo-reorder-instruction');
    if (reorderInstruction) {
      // Show instruction only if there are 2+ photos (reordering only makes sense with multiple photos)
      if (this.photoEntries.length >= 2) {
        reorderInstruction.style.display = 'block';
      } else {
        reorderInstruction.style.display = 'none';
      }
    }
  }

  setCurrentFormId(formId) {
      this.currentFormId = formId;
      // Attempt to restore photos for this form
      if (formId) {
          this.restorePhotos(formId);
      }
  }

  async restorePhotos(formId) {
      try {
          const photos = await this.dbManager.getPhotos(formId);
          if (!photos || photos.length === 0) return;
  
          // Wait for the preview container to be available
          const maxAttempts = 10;
          let attempts = 0;
          
          const waitForContainer = () => {
              return new Promise((resolve, reject) => {
                  const check = () => {
                      const container = document.getElementById('photo-preview-container');
                      if (container) {
                          resolve(container);
                      } else if (attempts >= maxAttempts) {
                          reject(new Error('Preview container not found after maximum attempts'));
                      } else {
                          attempts++;
                          setTimeout(check, 100);
                      }
                  };
                  check();
              });
          };
  
          await waitForContainer();
          
          // Clear existing photos
          this.photos = [];
          this.photoCaptions.clear();
          this.photoEntries = [];  // Clear photo entries as well
          
          // Restore each photo with order and timestamp
          // Sort photos by order first to ensure correct restoration order
          const sortedPhotos = [...photos].sort((a, b) => {
              const orderA = a.order !== undefined ? a.order : 0;
              const orderB = b.order !== undefined ? b.order : 0;
              return orderA - orderB;
          });
          
          for (const photoData of sortedPhotos) {
              const timestamp = photoData.photoTimestamp ? new Date(photoData.photoTimestamp) : null;
              const order = photoData.order !== undefined ? photoData.order : this.photoEntries.length;
              await this.addPhotoPreview(photoData.photo, photoData.id, photoData.caption || '', timestamp, photoData.exif || null);
              // Update the order of the entry that was just created
              const lastEntry = this.photoEntries[this.photoEntries.length - 1];
              if (lastEntry) {
                  lastEntry.order = order;
              }
          }
          
          // Ensure photos are sorted by order
          this.photoEntries.sort((a, b) => a.order - b.order);
          await this.reorderDOMElements();
          
          // Update database with correct orders (in case some were missing)
          await this.savePhotoOrderToDatabase();
          
          // Update instruction text visibility
          this.updateReorderInstructionVisibility();
      } catch (error) {
          this.logger.error('Error restoring photos:', error);
      }
  }

  async updatePhotoCaption(photoIndex, caption) {
      this.logger.debug('Updating caption:', caption);
      try {
          if (this.currentFormId) {
              const photos = await this.dbManager.getPhotos(this.currentFormId);
              if (photos && photos[photoIndex]) {
                  const photoData = photos[photoIndex];
                  await this.dbManager.updateCaption(photoData.id, caption);
              }
          }
          this.photoCaptions.set(photoIndex, caption);
      } catch (error) {
          this.logger.error('Error updating photo caption:', error);
      }
  }
}

export default PhotoManager;

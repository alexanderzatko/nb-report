// media/VideoManager.js

import Logger from '../utils/Logger.js';
import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import StateManager from '../state/StateManager.js';
import DatabaseManager from '../managers/DatabaseManager.js';

class VideoManager {
  static instance = null;

  constructor() {
    if (VideoManager.instance) {
      return VideoManager.instance;
    }
    this.videoEntries = [];  // Array of {id, file, caption, order} objects
    this.nextId = 1;

    this.logger = Logger.getInstance();
    this.initialized = false;
    this.i18next = i18next;
    VideoManager.instance = this;
    this.dbManager = DatabaseManager.getInstance();
    this.currentFormId = null;
  }

  static getInstance() {
    if (!VideoManager.instance) {
      VideoManager.instance = new VideoManager();
    }
    return VideoManager.instance;
  }

  async initializeVideoUpload(forceInit = false) {
    console.log('VideoManager initializeVideoUpload called, force:', forceInit);
    
    if (this.initialized && !forceInit) {
      console.log('VideoManager already initialized');
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
    console.log('Finding video elements');

    // Find existing elements
    const selectVideosBtn = document.getElementById('select-videos');
    const fileInput = document.getElementById('video-file-input');

    console.log('Video elements found:', {
      selectVideosBtn: !!selectVideosBtn,
      fileInput: !!fileInput
    });
    
    this.logger.debug('Found elements:', {
      selectVideosBtn: !!selectVideosBtn,
      fileInput: !!fileInput
    });

    if (!selectVideosBtn) {
      this.logger.error('Video buttons not found in DOM');
      return;
    }

    if (!fileInput) {
      this.logger.debug('Creating input elements...');
      this.createInputElements();
      return this.initializeVideoUpload();
    }

    // Remove any existing listeners
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);

    // Add event listeners
    selectVideosBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.logger.debug('Select videos button clicked');
      newFileInput.click();
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

    // Update translations
    this.updateTranslations();
    
    this.initialized = true;
    this.logger.debug('VideoManager initialization complete');
  }

  updateTranslations() {
      const selectVideosBtn = document.getElementById('select-videos');
      
      if (selectVideosBtn) {
          selectVideosBtn.textContent = this.i18next.t('form.selectVideos');
      }

      // Also update any existing video captions placeholder text
      const captionInputs = document.querySelectorAll('.video-caption');
      captionInputs.forEach(input => {
          input.placeholder = this.i18next.t('form.captionPlaceholder', 'Add a caption...');
      });
  }
  
  createInputElements() {
    this.logger.debug('Creating file input elements');
    
    // Create file input if it doesn't exist
    if (!document.getElementById('video-file-input')) {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'video-file-input';
      fileInput.accept = 'video/*';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
    }
  }
  
  async handleFiles(fileList) {
      if (!fileList || fileList.length === 0) {
          this.logger.warn('No files selected');
          return;
      }
  
      const previewContainer = document.getElementById('video-preview-container');
      if (!previewContainer) {
          this.logger.error('Preview container not found');
          return;
      }
  
      for (const file of fileList) {
          try {
              if (!file.type.startsWith('video/')) {
                  this.logger.warn(`Skipping non-video file: ${file.name}`);
                  continue;
              }
  
              // Check file size - limit to 50MB
              const maxSize = 50 * 1024 * 1024; // 50MB in bytes
              if (file.size > maxSize) {
                  alert(this.i18next.t('form.videoTooLarge', 'Video size should be less than 50MB'));
                  continue;
              }
  
              // Save to database if form ID exists
              let videoId = null;
              if (this.currentFormId) {
                  try {
                      const initialCaption = '';
                      videoId = await this.dbManager.saveVideo(this.currentFormId, file);
                      this.logger.debug('Saved video to database:', videoId);
                  } catch (error) {
                      this.logger.error('Failed to save video to database:', error);
                      throw error;
                  }
              }
  
              // Only add to videos array and preview if database save was successful or form ID doesn't exist
              if (videoId || !this.currentFormId) {
                  this.videoEntries.push(file);
                  await this.addVideoPreview(file, videoId);
              }
  
          } catch (error) {
              this.logger.error('Error processing file:', error);
              // Continue with next file instead of breaking the whole upload
              continue;
          }
      }
  }

  async addVideoPreview(file, dbId, caption = '') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const previewContainer = document.getElementById('video-preview-container');
          if (!previewContainer) {
            throw new Error('Preview container not found');
          }

          const wrapper = document.createElement('div');
          wrapper.className = 'video-preview';

          // Create video element
          const video = document.createElement('video');
          video.controls = true;
          video.src = URL.createObjectURL(file);
          video.style.width = '100%';
          video.style.height = '150px';

          // Generate unique ID and add to videoEntries
          const videoId = `video_${this.nextId++}`;
          const videoOrder = this.videoEntries.length;
          const videoEntry = {
            id: videoId,
            dbId: dbId,
            file: file,
            caption: caption,
            order: videoOrder
          };
          this.videoEntries.push(videoEntry);
          
          wrapper.dataset.videoId = videoId;

          // Create video info container
          const videoInfo = document.createElement('div');
          videoInfo.className = 'video-info';

          // Create caption input
          const captionInput = document.createElement('input');
          captionInput.type = 'text';
          captionInput.className = 'video-caption';
          captionInput.placeholder = this.i18next.t('form.captionPlaceholder', 'Add a caption...');
          captionInput.maxLength = 200;

          if (caption) {
            captionInput.value = caption;
          }

          // Save caption to the videoEntry
          captionInput.addEventListener('input', async (e) => {
              const entry = this.videoEntries.find(entry => entry.id === videoId);
              if (entry) {
                  entry.caption = e.target.value;
                  try {
                      // Use the database ID (dbId) rather than the UI ID
                      if (entry.dbId) {
                          await this.dbManager.updateVideoCaption(entry.dbId, e.target.value);
                      }
                  } catch (error) {
                      this.logger.error('Error updating caption in database:', error);
                  }
              }
          });

          const controlsDiv = document.createElement('div');
          controlsDiv.className = 'video-controls';

          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-video';
          removeBtn.innerHTML = '×';
          removeBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.removeVideo(videoId, wrapper);
          };

          controlsDiv.appendChild(removeBtn);
          
          videoInfo.appendChild(captionInput);
          wrapper.appendChild(video);
          wrapper.appendChild(controlsDiv);
          wrapper.appendChild(videoInfo);
          previewContainer.appendChild(wrapper);

          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read file for preview'));
      };

      reader.readAsArrayBuffer(file.slice(0, 1024)); // Just read the start of the file
    });
  }

  async removeVideo(videoId, wrapper) {
      try {
        const videoEntry = this.videoEntries.find(entry => entry.id === videoId);
        if (videoEntry) {
            // If we have a database ID, delete from database
            if (videoEntry.dbId) {
                await this.dbManager.deleteVideo(videoEntry.dbId);
            }

            this.videoEntries = this.videoEntries.filter(entry => entry.id !== videoId);
            wrapper.remove();

            // Reorder remaining videos
            this.videoEntries.forEach((entry, index) => {
                entry.order = index;
            });
        }
      } catch (error) {
          this.logger.error('Error removing video:', error);
          throw error;
      }
  }

  getVideos() {
    // Return videos sorted by their original order
    return this.videoEntries
      .sort((a, b) => a.order - b.order)
      .map(entry => ({
        file: entry.file,
        caption: entry.caption,
        id: entry.id
      }));
  }

  clearVideos() {
    this.videoEntries = [];
    const previewContainer = document.getElementById('video-preview-container');
    if (previewContainer) {
      previewContainer.innerHTML = '';
    }
  }

  setCurrentFormId(formId) {
      this.currentFormId = formId;
      // Attempt to restore videos for this form
      if (formId) {
          this.restoreVideos(formId);
      }
  }

  async restoreVideos(formId) {
      try {
          const videos = await this.dbManager.getVideos(formId);
          if (!videos || videos.length === 0) return;
  
          // Wait for the preview container to be available
          const maxAttempts = 10;
          let attempts = 0;
          
          const waitForContainer = () => {
              return new Promise((resolve, reject) => {
                  const check = () => {
                      const container = document.getElementById('video-preview-container');
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
          
          // Clear existing videos
          this.videoEntries = [];
          
          // Restore each video
          for (const videoData of videos) {
              await this.addVideoPreview(videoData.video, videoData.id, videoData.caption);
          }
      } catch (error) {
          this.logger.error('Error restoring videos:', error);
      }
  }
}

export default VideoManager;

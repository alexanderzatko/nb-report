import Logger from '../utils/Logger.js';

class PhotoManager {
  static instance = null;

  constructor() {
    if (PhotoManager.instance) {
      return PhotoManager.instance;
    }
    this.photos = [];
    this.logger = Logger.getInstance();
    this.initialized = false;
    PhotoManager.instance = this;
  }

  static getInstance() {
    if (!PhotoManager.instance) {
      PhotoManager.instance = new PhotoManager();
    }
    return PhotoManager.instance;
  }

  initializePhotoUpload() {
    if (this.initialized) {
      this.logger.debug('PhotoManager already initialized');
      return;
    }

    this.logger.debug('Initializing PhotoManager...');

    // Find existing elements
    const selectPhotosBtn = document.getElementById('select-photos');
    const takePhotoBtn = document.getElementById('take-photo');
    const fileInput = document.getElementById('photo-file-input');
    const cameraInput = document.getElementById('camera-input');

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

    this.initialized = true;
    this.logger.debug('PhotoManager initialization complete');
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

    try {
      for (const file of fileList) {
        if (!file.type.startsWith('image/')) {
          this.logger.warn(`Skipping non-image file: ${file.name}`);
          continue;
        }

        const resizedFile = await this.resizeImage(file);
        this.photos.push(resizedFile);
        await this.addPhotoPreview(resizedFile);
      }
    } catch (error) {
      this.logger.error('Error handling files:', error);
      throw error;
    }
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

  async addPhotoPreview(file) {
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

          const photoIndex = this.photos.indexOf(file);

          const controlsDiv = document.createElement('div');
          controlsDiv.className = 'photo-controls';

          const rotateBtn = document.createElement('button');
          rotateBtn.className = 'rotate-photo';
          rotateBtn.innerHTML = '↻';
          rotateBtn.title = 'Rotate 90° clockwise';
          rotateBtn.onclick = async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await this.rotatePhoto(img, file, photoIndex);
          };

          const removeBtn = document.createElement('button');
          removeBtn.className = 'remove-photo';
          removeBtn.innerHTML = '×';
          removeBtn.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.removePhoto(photoIndex, wrapper);
          };

          controlsDiv.appendChild(rotateBtn);
          controlsDiv.appendChild(removeBtn);
          wrapper.appendChild(img);
          wrapper.appendChild(controlsDiv);
          previewContainer.appendChild(wrapper);

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

removePhoto(photoIndex, wrapper) {
    this.logger.debug('Removing photo at index:', photoIndex, 'Current photos array:', this.photos);
    
    if (photoIndex >= 0 && photoIndex < this.photos.length) {
      // Remove from array
      this.photos.splice(photoIndex, 1);
      // Remove from UI
      wrapper.remove();
      
      this.logger.debug('Photo removed. Remaining photos:', this.photos);
      
      // Update preview container if no photos left
      if (this.photos.length === 0) {
        const previewContainer = document.getElementById('photo-preview-container');
        if (previewContainer) {
          previewContainer.innerHTML = '';
        }
      }
    } else {
      this.logger.error('Invalid photo index:', photoIndex);
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
    return this.photos;
  }

  clearPhotos() {
    this.photos = [];
    const previewContainer = document.getElementById('photo-preview-container');
    if (previewContainer) {
      previewContainer.innerHTML = '';
    }
  }
}

export default PhotoManager;

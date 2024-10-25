// media/PhotoManager.js

class PhotoManager {
  constructor() {
    this.photos = [];
    this.initializePhotoUpload();
  }

  initializePhotoUpload() {
    const selectPhotosBtn = document.getElementById('select-photos');
    const takePhotoBtn = document.getElementById('take-photo');
    const fileInput = document.getElementById('photo-file-input');
    const cameraInput = document.getElementById('camera-input');
    const previewContainer = document.getElementById('photo-preview-container');

    if (selectPhotosBtn) {
      selectPhotosBtn.addEventListener('click', () => fileInput.click());
    }
    if (takePhotoBtn) {
      takePhotoBtn.addEventListener('click', () => cameraInput.click());
    }
    
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    }
    if (cameraInput) {
      cameraInput.addEventListener('change', (e) => this.handleFiles(e.target.files));
    }
  }

  async resizeImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        EXIF.getData(img, function() {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          if (width > 1900 || height > 1900) {
            if (width > height) {
              height = Math.round((height * 1900) / width);
              width = 1900;
            } else {
              width = Math.round((width * 1900) / height);
              height = 1900;
            }
          }
          
          const orientation = EXIF.getTag(this, 'Orientation') || 1;
          if (orientation > 4) {
            canvas.width = height;
            canvas.height = width;
          } else {
            canvas.width = width;
            canvas.height = height;
          }
          
          const ctx = canvas.getContext('2d');
          this.applyOrientation(ctx, orientation, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          }, 'image/jpeg', 0.9);
        });
      };
      img.src = URL.createObjectURL(file);
    });
  }

  applyOrientation(ctx, orientation, width, height) {
    switch (orientation) {
      case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, height, width); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
    }
  }

  async handleFiles(fileList) {
    for (const file of fileList) {
      if (file.type.startsWith('image/')) {
        const resizedFile = await this.resizeImage(file);
        this.photos.push(resizedFile);
        this.addPhotoPreview(resizedFile);
      }
    }
    document.getElementById('photo-file-input').value = '';
    document.getElementById('camera-input').value = '';
  }

  addPhotoPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
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
      rotateBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.rotatePhoto(img, file, photoIndex);
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
      
      const previewContainer = document.getElementById('photo-preview-container');
      if (previewContainer) {
        previewContainer.appendChild(wrapper);
      }
    };
    reader.readAsDataURL(file);
  }

  async rotatePhoto(img, file, photoIndex) {
    const currentRotation = parseInt(img.dataset.rotation) || 0;
    const newRotation = (currentRotation + 90) % 360;
    img.style.transform = `rotate(${newRotation}deg)`;
    img.dataset.rotation = newRotation;
    
    const rotatedFile = await this.rotateImage(file, newRotation);
    this.photos[photoIndex] = rotatedFile;
  }

  removePhoto(photoIndex, wrapper) {
    this.photos.splice(photoIndex, 1);
    wrapper.remove();
  }

  async rotateImage(file, degrees) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
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
      };
      img.src = URL.createObjectURL(file);
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

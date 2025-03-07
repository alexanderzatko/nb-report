// managers/DatabaseManager.js

import Logger from '../utils/Logger.js';

class DatabaseManager {
    static instance = null;

    constructor() {
        if (DatabaseManager.instance) {
            return DatabaseManager.instance;
        }

        this.logger = Logger.getInstance();
        this.dbName = 'AppDB';
        this.dbVersion = 4; // Increased version for new stores
        this.db = null;
        DatabaseManager.instance = this;
    }

    static getInstance() {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    async getDatabase() {
        if (this.db) {
            return this.db;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                this.logger.error('IndexedDB error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createStores(db);
            };
        });
    }

    createStores(db) {
        // Existing stores
        if (!db.objectStoreNames.contains('tracks')) {
            const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
            trackStore.createIndex('startTime', 'startTime', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('activePoints')) {
            const pointsStore = db.createObjectStore('activePoints', { keyPath: 'timestamp' });
            pointsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('trackMetadata')) {
            db.createObjectStore('trackMetadata', { keyPath: 'id' });
        }

        // New stores for form data
        if (!db.objectStoreNames.contains('formData')) {
            const formStore = db.createObjectStore('formData', { keyPath: 'id' });
            formStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('photos')) {
            const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
            photoStore.createIndex('timestamp', 'timestamp', { unique: false });
            photoStore.createIndex('formId', 'formId', { unique: false });
        }

        if (!db.objectStoreNames.contains('videos')) {
            const videoStore = db.createObjectStore('videos', { keyPath: 'id' });
            videoStore.createIndex('timestamp', 'timestamp', { unique: false });
            videoStore.createIndex('formId', 'formId', { unique: false });
        }

        if (!db.objectStoreNames.contains('metadata')) {
            const metaStore = db.createObjectStore('metadata', { keyPath: 'key' });
            metaStore.put({
                key: 'schemaVersion',
                value: this.dbVersion,
                lastUpdated: new Date().toISOString()
            });
        }
    }

    async saveFormData(data) {
        // Step 1: Get all existing forms
        const db = await this.getDatabase();
        const existingForms = await this.getAllForms();
    
        // Filter to find unsubmitted form
        const unsubmittedForm = existingForms.find(form => !form.submitted);
    
        // If we have an unsubmitted form, keep only that and the most recent submitted one
        if (unsubmittedForm) {
            const submittedForms = existingForms
                .filter(form => form.submitted)
                .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    
            // Keep only the most recent submitted form
            const recentSubmitted = submittedForms[0];
    
            // Delete all other forms and their associated media
            for (const form of existingForms) {
                if (form !== unsubmittedForm && form !== recentSubmitted) {
                    await this.clearFormAndMedia(form.id);
                }
            }
        }
    
        // Prepare new form data
        const formData = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            submitted: false,  // Default to draft status
            submittedAt: null,
            ...data
        };
    
        const transaction = db.transaction(['formData'], 'readwrite');
        const store = transaction.objectStore('formData');
        
        return new Promise((resolve, reject) => {
            const request = store.add(formData);
            request.onsuccess = () => resolve(formData.id);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllForms() {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readonly');
        const store = transaction.objectStore('formData');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // This is a new method to delete a form and all its associated media
    async clearFormAndMedia(formId) {
        try {
            this.logger.debug(`Clearing form ${formId} and associated media`);
            await this.deleteFormMedia(formId);
            await this.deleteFormData(formId);
            return true;
        } catch (error) {
            this.logger.error(`Error clearing form ${formId} and media:`, error);
            throw error;
        }
    }

    // Helper method to delete form data only
    async deleteFormData(formId) {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readwrite');
        const store = transaction.objectStore('formData');
        
        return new Promise((resolve, reject) => {
            const request = store.delete(formId);
            request.onsuccess = () => {
                this.logger.debug(`Form ${formId} deleted successfully`);
                resolve();
            };
            request.onerror = () => reject(request.error);
            
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    // Helper method to delete all media associated with a form
    async deleteFormMedia(formId) {
        try {
            // First delete photos
            await this.deleteMediaByFormId(formId, 'photos');
            
            // Then delete videos
            await this.deleteMediaByFormId(formId, 'videos');
            
            return true;
        } catch (error) {
            this.logger.error(`Error deleting media for form ${formId}:`, error);
            throw error;
        }
    }

    // Generic method to delete media from a specific store by formId
    async deleteMediaByFormId(formId, storeName) {
        const db = await this.getDatabase();
        
        // First get all matching items
        const items = await this.getMediaByFormId(formId, storeName);
        
        if (items.length > 0) {
            this.logger.debug(`Deleting ${items.length} ${storeName} for form ${formId}`);
            
            // Delete each item in a separate transaction
            for (const item of items) {
                await this.deleteMediaItem(storeName, item.id);
            }
            
            this.logger.debug(`All ${storeName} for form ${formId} deleted successfully`);
        } else {
            this.logger.debug(`No ${storeName} found for form ${formId}`);
        }
        
        return true;
    }

    async getMediaByFormId(formId, storeName) {
        const db = await this.getDatabase();
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index('formId');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(formId);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = (e) => {
                this.logger.error(`Error getting ${storeName} for form ${formId}:`, e.target.error);
                reject(e.target.error);
            };
        });
    }

    async deleteMediaItem(storeName, itemId) {
        const db = await this.getDatabase();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.delete(itemId);
            
            request.onsuccess = () => {
                resolve();
            };
            
            request.onerror = (e) => {
                this.logger.error(`Error deleting ${storeName} ${itemId}:`, e.target.error);
                reject(e.target.error);
            };
        });
    }

    async markFormAsSubmitted(formId) {
        try {
            this.logger.debug(`Marking form ${formId} as submitted`);
            
            // Step 1: Get all forms
            const forms = await this.getAllForms();
            
            // Step 2: Delete old submitted forms
            const oldSubmittedForms = forms.filter(form => form.submitted && form.id !== formId);
            
            for (const oldForm of oldSubmittedForms) {
                await this.clearFormAndMedia(oldForm.id);
            }
            
            // Step 3: Get the current form in a new transaction
            const db = await this.getDatabase();
            const getFormTransaction = db.transaction(['formData'], 'readonly');
            const getFormStore = getFormTransaction.objectStore('formData');
            
            const currentForm = await new Promise((resolve, reject) => {
                const request = getFormStore.get(formId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => reject(e.target.error);
            });
            
            if (!currentForm) {
                this.logger.warn(`Form ${formId} not found or already deleted`);
                return false;
            }
            
            // Step 4: Update the form in yet another transaction
            const updateTransaction = db.transaction(['formData'], 'readwrite');
            const updateStore = updateTransaction.objectStore('formData');
            
            // Update the form object
            currentForm.submitted = true;
            currentForm.submittedAt = new Date().toISOString();
            
            return new Promise((resolve, reject) => {
                const updateRequest = updateStore.put(currentForm);
                
                updateRequest.onsuccess = () => {
                    this.logger.debug(`Form ${formId} marked as submitted successfully`);
                    resolve(true);
                };
                
                updateRequest.onerror = (e) => {
                    this.logger.error(`Error updating form ${formId}:`, e.target.error);
                    reject(e.target.error);
                };
                
                // Handle transaction error
                updateTransaction.onerror = (e) => {
                    this.logger.error(`Transaction error when marking form ${formId} as submitted:`, e.target.error);
                    reject(e.target.error);
                };
            });
        } catch (error) {
            this.logger.error('Error marking form as submitted:', error);
            throw error;
        }
    }

    async getFormData(formId) {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readonly');
        const store = transaction.objectStore('formData');

        return new Promise((resolve, reject) => {
            const request = store.get(formId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async updateFormData(formId, data) {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readwrite');
        const store = transaction.objectStore('formData');
    
        return new Promise((resolve, reject) => {
            const request = store.get(formId);
            request.onsuccess = () => {
                const updatedData = {
                    ...request.result,
                    ...data,
                    lastUpdated: new Date().toISOString()
                };
                // Ensure we don't accidentally change submitted status during update
                if (!updatedData.submitted) {
                    updatedData.submittedAt = null;
                }
                const updateRequest = store.put(updatedData);
                updateRequest.onsuccess = () => resolve();
                updateRequest.onerror = () => reject(updateRequest.error);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Photo methods
    async savePhoto(formId, file, caption = '') {
        try {
            // Convert file to base64 BEFORE starting the transaction
            const fileData = {
                name: file.name,
                type: file.type,
                lastModified: file.lastModified,
                data: await this.fileToBase64(file)
            };
    
            const photoData = {
                id: Date.now().toString(),
                formId,
                caption,
                timestamp: new Date().toISOString(),
                file: fileData
            };
    
            // Now start the transaction with the prepared data
            const db = await this.getDatabase();
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
    
            return new Promise((resolve, reject) => {
                const request = store.add(photoData);
                
                request.onsuccess = () => resolve(photoData.id);
                
                request.onerror = () => reject(request.error);
                
                // Handle transaction errors
                transaction.onerror = () => reject(transaction.error);
                
                // Ensure transaction completes
                transaction.oncomplete = () => {
                    this.logger.debug('Photo transaction completed successfully');
                };
            });
        } catch (error) {
            this.logger.error('Error in savePhoto:', error);
            throw error;
        }
    }

    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => resolve(reader.result);
            
            reader.onerror = () => {
                this.logger.error('Error reading file:', reader.error);
                reject(reader.error);
            };
            
            reader.onabort = () => {
                this.logger.warn('File reading aborted');
                reject(new Error('File reading aborted'));
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    async getPhotos(formId) {
        try {
            const db = await this.getDatabase();
            const transaction = db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const index = store.index('formId');
    
            return new Promise((resolve, reject) => {
                const request = index.getAll(formId);
                
                request.onsuccess = () => {
                    const photos = request.result;
                    const processedPhotos = photos.map(photo => ({
                        ...photo,
                        photo: this.base64ToFile(photo.file.data, photo.file.name, photo.file.type)
                    }));
                    resolve(processedPhotos);
                };
                
                request.onerror = () => reject(request.error);
                
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            this.logger.error('Error in getPhotos:', error);
            throw error;
        }
    }

    base64ToFile(base64, filename, type) {
        try {
            const arr = base64.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while(n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: type || mime });
        } catch (error) {
            this.logger.error('Error converting base64 to File:', error);
            // Return a minimal File object if conversion fails
            return new File([""], filename, { type: type || 'image/jpeg' });
        }
    }
    
    async deletePhoto(photoId) {
        return this.deleteMediaItem('photos', photoId);
    }

    // This method is now deprecated in favor of clearFormAndMedia
    async clearForm(formId) {
        return this.clearFormAndMedia(formId);
    }

    async clearDatabase() {
        const db = await this.getDatabase();
        const stores = [...db.objectStoreNames];
        
        // Clear each store in a separate transaction
        for (const storeName of stores) {
            await this.clearObjectStore(storeName);
        }
        
        return true;
    }
    
    async clearObjectStore(storeName) {
        const db = await this.getDatabase();
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async updateCaption(photoId, caption) {
        try {
            const db = await this.getDatabase();
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
    
            return new Promise((resolve, reject) => {
                const getRequest = store.get(photoId);
                
                getRequest.onsuccess = () => {
                    const photo = getRequest.result;
                    if (photo) {
                        photo.caption = caption;
                        const updateRequest = store.put(photo);
                        updateRequest.onsuccess = () => {
                            resolve();
                        };
                        updateRequest.onerror = () => reject(updateRequest.error);
                    } else {
                        reject(new Error('Photo not found'));
                    }
                };
                getRequest.onerror = () => reject(getRequest.error);
            });
        } catch (error) {
            this.logger.error('Error updating caption:', error);
            throw error;
        }
    }

    async saveVideo(formId, file, caption = '') {
        try {
            // Convert file to base64 BEFORE starting the transaction
            const fileData = {
                name: file.name,
                type: file.type,
                lastModified: file.lastModified,
                data: await this.fileToBase64(file)
            };
    
            const videoData = {
                id: Date.now().toString(),
                formId,
                caption,
                timestamp: new Date().toISOString(),
                file: fileData
            };
    
            // Now start the transaction with the prepared data
            const db = await this.getDatabase();
            const transaction = db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
    
            return new Promise((resolve, reject) => {
                const request = store.add(videoData);
                
                request.onsuccess = () => resolve(videoData.id);
                
                request.onerror = () => reject(request.error);
                
                transaction.onerror = () => reject(transaction.error);
                
                transaction.oncomplete = () => {
                    this.logger.debug('Video transaction completed successfully');
                };
            });
        } catch (error) {
            this.logger.error('Error in saveVideo:', error);
            throw error;
        }
    }
    
    async getVideos(formId) {
        try {
            const db = await this.getDatabase();
            const transaction = db.transaction(['videos'], 'readonly');
            const store = transaction.objectStore('videos');
            const index = store.index('formId');
    
            return new Promise((resolve, reject) => {
                const request = index.getAll(formId);
                
                request.onsuccess = () => {
                    const videos = request.result;
                    const processedVideos = videos.map(video => ({
                        ...video,
                        video: this.base64ToFile(video.file.data, video.file.name, video.file.type)
                    }));
                    resolve(processedVideos);
                };
                
                request.onerror = () => reject(request.error);
                
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            this.logger.error('Error in getVideos:', error);
            throw error;
        }
    }
    
    async deleteVideo(videoId) {
        return this.deleteMediaItem('videos', videoId);
    }
    
    async updateVideoCaption(videoId, caption) {
        try {
            const db = await this.getDatabase();
            const transaction = db.transaction(['videos'], 'readwrite');
            const store = transaction.objectStore('videos');
    
            return new Promise((resolve, reject) => {
                const getRequest = store.get(videoId);
                
                getRequest.onsuccess = () => {
                    const video = getRequest.result;
                    if (video) {
                        video.caption = caption;
                        const updateRequest = store.put(video);
                        updateRequest.onsuccess = () => {
                            resolve();
                        };
                        updateRequest.onerror = () => reject(updateRequest.error);
                    } else {
                        reject(new Error('Video not found'));
                    }
                };
                getRequest.onerror = () => reject(getRequest.error);
            });
        } catch (error) {
            this.logger.error('Error updating video caption:', error);
            throw error;
        }
    }
    
    // Method to clean up orphaned media (photos/videos without a valid form)
    async cleanupOrphanedMedia() {
        try {
            this.logger.debug('Starting orphaned media cleanup');
            
            // Get all form IDs
            const formIds = await this.getAllFormIds();
            this.logger.debug(`Found ${formIds.length} valid forms`);
            
            // Cleanup photos
            const orphanedPhotos = await this.cleanupOrphanedMediaInStore('photos', formIds);
            
            // Cleanup videos
            const orphanedVideos = await this.cleanupOrphanedMediaInStore('videos', formIds);
            
            this.logger.debug(`Orphaned media cleanup complete: ${orphanedPhotos} photos and ${orphanedVideos} videos removed`);
            return {
                photos: orphanedPhotos,
                videos: orphanedVideos
            };
        } catch (error) {
            this.logger.error('Error cleaning up orphaned media:', error);
            return {
                photos: 0,
                videos: 0,
                error: error.message
            };
        }
    }
    
    async getAllFormIds() {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readonly');
        const store = transaction.objectStore('formData');
        
        return new Promise((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
    
    async cleanupOrphanedMediaInStore(storeName, validFormIds) {
        const db = await this.getDatabase();
        
        // Get all media in this store
        const allMedia = await this.getAllFromStore(storeName);
        
        // Find orphaned media (those with formId not in validFormIds)
        const orphanedMedia = allMedia.filter(item => !validFormIds.includes(item.formId));
        
        if (orphanedMedia.length > 0) {
            this.logger.debug(`Found ${orphanedMedia.length} orphaned ${storeName} to delete`);
            
            // Delete each orphaned item
            for (const item of orphanedMedia) {
                await this.deleteMediaItem(storeName, item.id);
            }
            
            this.logger.debug(`Deleted ${orphanedMedia.length} orphaned ${storeName}`);
        } else {
            this.logger.debug(`No orphaned ${storeName} found`);
        }
        
        return orphanedMedia.length;
    }
    
    async getAllFromStore(storeName) {
        const db = await this.getDatabase();
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

export default DatabaseManager;

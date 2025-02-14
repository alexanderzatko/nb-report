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
        this.dbVersion = 3; // Increased version for new stores
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

        // Add schema version info store
        if (!db.objectStoreNames.contains('metadata')) {
            const metaStore = db.createObjectStore('metadata', { keyPath: 'key' });
            metaStore.put({
                key: 'schemaVersion',
                value: this.dbVersion,
                lastUpdated: new Date().toISOString()
            });
        }
    }

    // Form data methods
    async saveFormData(data) {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData'], 'readwrite');
        const store = transaction.objectStore('formData');

        const formData = {
            id: Date.now().toString(),  // Unique ID for the form
            timestamp: new Date().toISOString(),
            ...data
        };

        return new Promise((resolve, reject) => {
            const request = store.add(formData);
            request.onsuccess = () => resolve(formData.id);
            request.onerror = () => reject(request.error);
        });
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
        const db = await this.getDatabase();
        const transaction = db.transaction(['photos'], 'readwrite');
        const store = transaction.objectStore('photos');

        return new Promise((resolve, reject) => {
            const request = store.delete(photoId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearForm(formId) {
        const db = await this.getDatabase();
        const transaction = db.transaction(['formData', 'photos'], 'readwrite');
        
        // Delete form data
        const formStore = transaction.objectStore('formData');
        const photoStore = transaction.objectStore('photos');
        const photoIndex = photoStore.index('formId');

        return new Promise((resolve, reject) => {
            // First get all photos for this form
            const photoRequest = photoIndex.getAll(formId);
            
            photoRequest.onsuccess = () => {
                // Delete each photo
                const photos = photoRequest.result;
                photos.forEach(photo => {
                    photoStore.delete(photo.id);
                });

                // Delete form data
                const formRequest = formStore.delete(formId);
                formRequest.onsuccess = () => resolve();
                formRequest.onerror = () => reject(formRequest.error);
            };
            
            photoRequest.onerror = () => reject(photoRequest.error);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async clearDatabase() {
        const db = await this.getDatabase();
        const stores = [...db.objectStoreNames];
        
        const transaction = db.transaction(stores, 'readwrite');
        stores.forEach(store => {
            transaction.objectStore(store).clear();
        });

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

export default DatabaseManager;

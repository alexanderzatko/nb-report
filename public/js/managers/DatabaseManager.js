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
        this.dbVersion = 2;
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
        // GPS tracking stores
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

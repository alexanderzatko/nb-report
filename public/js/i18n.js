import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import HttpBackend from '/node_modules/i18next-http-backend/esm/index.js';
import LanguageDetector from '/node_modules/i18next-browser-languagedetector/dist/esm/i18nextBrowserLanguageDetector.js';

let initPromise = null;
let isInitialized = false;

const initI18next = async () => {
  if (initPromise) {
    return initPromise;
  }

  initPromise = i18next
    .use(HttpBackend)
    .use(LanguageDetector)
    .init({
      fallbackLng: 'en',
      load: 'languageOnly',
      debug: true,
      returnObjects: true,
      backend: {
        loadPath: '/locales/{{lng}}/{{ns}}.json'
      },
      detection: {
        order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
        lookupQuerystring: 'lng',
        lookupCookie: 'i18next',
        lookupLocalStorage: 'i18nextLng',
        caches: ['localStorage', 'cookie'],
      }
    });

  try {
    await initPromise;
    isInitialized = true;
    
    // Set up language change event handler
    i18next.on('languageChanged', () => {
      const event = new CustomEvent('languageChanged', {
        detail: {
          language: i18next.language,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(event);
      console.log('Language changed event dispatched:', i18next.language);
    });

    console.log('i18next initialized successfully, current language:', i18next.language);
    console.log('Loaded translations:', i18next.getResourceBundle(i18next.language, 'translation'));
    
  } catch (error) {
    console.error('Error initializing i18next:', error);
    throw error;
  }

  return initPromise;
};

const changeLanguage = async (lang) => {
  if (!isInitialized) {
    await initI18next();
  }
  return i18next.changeLanguage(lang);
};

export { i18next, initI18next, changeLanguage };

import i18next from '/node_modules/i18next/dist/esm/i18next.js';
import HttpBackend from '/node_modules/i18next-http-backend/esm/index.js';
import LanguageDetector from '/node_modules/i18next-browser-languagedetector/dist/esm/i18nextBrowserLanguageDetector.js';

let initPromise = null;

const initI18next = () => {
  if (!initPromise) {
    initPromise = i18next
      .use(HttpBackend)
      .use(LanguageDetector)
      .init({
        fallbackLng: 'en',
        load: 'languageOnly',
        languageMapping: {
          'en': 'en',
          'en-GB': 'en',
          'en-US': 'en'
        },
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
      }).then(() => {
        console.log('i18next initialized, current language:', i18next.language);
        console.log('Loaded translations:', i18next.getResourceBundle(i18next.language, 'translation'));

        i18next.on('languageChanged', () => {
            console.log('i18n: Language changed event firing');
            console.log('i18n: Current language:', i18next.language);
            
            // Create custom event with more detail
            const event = new CustomEvent('languageChanged', {
                detail: {
                    language: i18next.language,
                    timestamp: Date.now()
                }
            });
            
            console.log('i18n: Dispatching languageChanged event');
            window.dispatchEvent(event);
            console.log('i18n: Event dispatched');
        });
      });
  }
  return initPromise;
};

export { i18next, initI18next };

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
            console.log('i18n: Language changed event firing, language:', i18next.language);
            
            try {
                // For Safari compatibility, use CustomEvent constructor with feature detection
                if (typeof CustomEvent === 'function') {
                    const event = new CustomEvent('languageChanged', {
                        bubbles: true,  // Allow event to bubble up through the DOM
                        detail: {
                            language: i18next.language,
                            timestamp: Date.now()
                        }
                    });
                    console.log('i18n: Dispatching custom event');
                    window.dispatchEvent(event);
                } else {
                    // Fallback for older browsers
                    const event = document.createEvent('CustomEvent');
                    event.initCustomEvent('languageChanged', true, true, {
                        language: i18next.language,
                        timestamp: Date.now()
                    });
                    console.log('i18n: Dispatching fallback event');
                    window.dispatchEvent(event);
                }
                console.log('i18n: Event dispatch complete');
            } catch (error) {
                console.error('i18n: Error dispatching language change event:', error);
            }
        });
      });
  }
  return initPromise;
};

export { i18next, initI18next };

import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend/esm/index.js';
import LanguageDetector from 'i18next-browser-languagedetector/esm/index.js';

i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .init({
    fallbackLng: 'en',
    debug: true,
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

export default i18next;

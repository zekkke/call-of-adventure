import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Імпорт файлів перекладів
import translationUk from './locales/uk/translation.json';
import translationEn from './locales/en/translation.json';
import translationRu from './locales/ru/translation.json';

// Ресурси для перекладів
const resources = {
  uk: {
    translation: translationUk,
  },
  en: {
    translation: translationEn,
  },
  ru: {
    translation: translationRu,
  },
};

i18n
  .use(LanguageDetector) // Для автоматичного визначення мови браузера
  .use(initReactI18next) // Інтеграція з React
  .init({
    resources,
    fallbackLng: 'uk', // Мова за замовчуванням (якщо не вдалося визначити мову)
    supportedLngs: ['uk', 'en', 'ru'], // Підтримувані мови
    detection: {
      order: ['localStorage', 'navigator'], // Спочатку перевіряємо localStorage, потім мову браузера
      caches: ['localStorage'], // Зберігаємо вибір мови в localStorage
      lookupLocalStorage: 'i18nextLng', // Ключ у localStorage для збереження мови
    },
    interpolation: {
      escapeValue: false, // React автоматично екранує значення
    },
  });

export default i18n;
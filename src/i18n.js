// i18n.js
import { createI18n } from 'vue-i18n';

const messages = {
    en: {
        'Report Issue': 'Report Issue',
    },
    fr: {
        'Report Issue': 'Signaler un problème',
    },
    // Add other languages here
};

const i18n = createI18n({
    locale: 'en', // Set default locale
    messages,
});

export default i18n;

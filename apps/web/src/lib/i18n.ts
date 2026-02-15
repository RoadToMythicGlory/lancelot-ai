import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  he: {
    common: {
      title: 'Lancelot',
      employees: 'עובדים',
      mcr: 'MCR',
      production: 'הפקה',
      warehouse: 'מחסן'
    }
  },
  en: {
    common: {
      title: 'Lancelot',
      employees: 'Employees',
      mcr: 'MCR',
      production: 'Production',
      warehouse: 'Warehouse'
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'he',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n; 
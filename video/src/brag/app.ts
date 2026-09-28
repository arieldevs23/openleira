import '../app.css';

import { i18n } from '@/modules/i18n';

// The app in English, dark (its default theme).
void i18n.changeLanguage('en');
document.documentElement.classList.add('dark');
document.documentElement.dataset.theme = 'dark';

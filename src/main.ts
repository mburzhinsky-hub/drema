import '@fontsource/nunito/cyrillic-400.css';
import '@fontsource/nunito/cyrillic-500.css';
import '@fontsource/nunito/cyrillic-600.css';
import '@fontsource/nunito/cyrillic-700.css';
import '@fontsource/nunito/cyrillic-800.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/yeseva-one/cyrillic-400.css';
import '@fontsource/yeseva-one/latin-400.css';
import './styles.css';

import { start } from './app/app';
import { applyFixture } from './app/fixture';
import { startReminders } from './app/reminders';
import { startViewport } from './app/viewport';
import { loadFromStorage } from './store/store';

const fx = new URLSearchParams(location.search).get('fixture');
if (fx) applyFixture(fx);
else loadFromStorage();

startViewport();
start({ fixture: !!fx });
if (!fx) startReminders();

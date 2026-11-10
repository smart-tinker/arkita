import { installTheme } from './theme.js';
export const MODE_PATHS = Object.freeze({ mermaid: '/mermaid/', model: '/model/' });
export function installChooser(document, window) { return installTheme(document, window); }
if (typeof document !== 'undefined' && typeof window !== 'undefined') installChooser(document, window);

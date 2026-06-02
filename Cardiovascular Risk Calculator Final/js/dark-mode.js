/**
 * @fileoverview Dark Mode Controller - manages theme switching with system preference detection
 * and localStorage persistence.
 *
 * @module DarkMode
 */

DRC.DarkMode = (() => {
    const STORAGE_KEY = 'drc-theme-preference';
    const THEME_LIGHT = 'light';
    const THEME_DARK = 'dark';

    let currentTheme = THEME_LIGHT;
    let systemPreference = THEME_LIGHT;
    let mediaQuery = null;

    const init = () => {
        mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        systemPreference = mediaQuery.matches ? THEME_DARK : THEME_LIGHT;

        const savedPreference = DRC.UIHelpers.safeStorage.get(STORAGE_KEY);

        if (savedPreference === THEME_DARK || savedPreference === THEME_LIGHT) {
            currentTheme = savedPreference;
        } else {
            // No saved preference — default to light mode
            currentTheme = THEME_LIGHT;
        }

        applyTheme(currentTheme);
        mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
        mediaQuery.addEventListener('change', handleSystemPreferenceChange);
        setupToggleButton();
    };

    const handleSystemPreferenceChange = (e) => {
        systemPreference = e.matches ? THEME_DARK : THEME_LIGHT;
        const savedPreference = DRC.UIHelpers.safeStorage.get(STORAGE_KEY);
        if (!savedPreference) {
            currentTheme = systemPreference;
            applyTheme(currentTheme);
            updateToggleButton();

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('darkmode:change', {
                detail: { theme: currentTheme }
            }));
        }
    };

    const applyTheme = (theme) => {
        const root = document.documentElement;
        if (theme === THEME_DARK) {
            root.classList.add('dark');
            root.setAttribute('data-theme', 'dark');
        } else {
            root.classList.remove('dark');
            root.setAttribute('data-theme', 'light');
        }
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === THEME_DARK ? '#1a1a1f' : '#f2f4f8');
        }
    };

    const setupToggleButton = () => {
        const toggleBtns = document.querySelectorAll('#settingsDarkModeBtn');
        toggleBtns.forEach(btn => {
            if (btn && !btn._darkModeListenerAttached) {
                // Mark button to prevent duplicate listeners
                btn._darkModeListenerAttached = true;
                btn.addEventListener('click', toggle);
            }
        });
        updateToggleButton();
    };

    const updateToggleButton = () => {
        const toggleBtns = document.querySelectorAll('#settingsDarkModeBtn');
        const isDark = document.documentElement.classList.contains('dark');

        toggleBtns.forEach(btn => {
            if (!btn) return;
            btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            btn.setAttribute('aria-pressed', String(isDark));
            btn.classList.toggle('active', isDark);
            const icon = btn.querySelector('.lucide-icon');
            if (icon) icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
        });

        DRC.UIHelpers.refreshIcons();
    };

    const toggle = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? THEME_LIGHT : THEME_DARK;
        DRC.UIHelpers.safeStorage.set(STORAGE_KEY, newTheme);
        currentTheme = newTheme;
        document.body.classList.add('theme-transition');
        applyTheme(newTheme);
        updateToggleButton();
        setTimeout(() => document.body.classList.remove('theme-transition'), 300);

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('darkmode:change', {
            detail: { theme: newTheme }
        }));
    };

    const isDark = () => document.documentElement.classList.contains('dark');
    const getTheme = () => currentTheme;
    const setTheme = (theme) => {
        if (theme === THEME_LIGHT || theme === THEME_DARK) {
            DRC.UIHelpers.safeStorage.set(STORAGE_KEY, theme);
            currentTheme = theme;
            applyTheme(theme);
            updateToggleButton();

            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('darkmode:change', {
                detail: { theme: theme }
            }));
        }
    };

    return { init, toggle, getTheme, isDark, setTheme };
})();

// Initialize dark mode early, accounting for late script load
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    DRC.DarkMode.init();
} else {
    document.addEventListener('DOMContentLoaded', () => DRC.DarkMode.init());
}
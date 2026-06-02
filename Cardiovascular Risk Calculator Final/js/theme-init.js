/**
 * @fileoverview Theme initialization — runs before first paint to prevent dark mode FOUC.
 * Must be loaded in <head> BEFORE the stylesheet link.
 * Uses same localStorage key as dark-mode.js ('drc-theme-preference').
 * When no saved preference exists, follows the OS system preference.
 */
(function() {
    var pref = null;
    try { pref = localStorage.getItem('drc-theme-preference'); } catch(e) {}
    if (pref === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    } else if (pref === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
    }
})();
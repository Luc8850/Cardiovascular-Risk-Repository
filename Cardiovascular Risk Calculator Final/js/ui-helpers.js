/**
 * @fileoverview Shared DOM utility functions used across UI modules.
 *
 * Provides lightweight wrappers around common DOM operations to reduce
 * boilerplate and enforce consistent null-checking throughout the UI layer.
 *
 * @module UIHelpers
 * @memberof DRC
 */

'use strict';

DRC.UIHelpers = (() => {

    /**
     * Get element by ID (cached shorthand).
     * @param {string} id — DOM element ID.
     * @returns {HTMLElement|null}
     */
    const el = (id) => document.getElementById(id);

    /**
     * Set text content of an element by ID.
     * @param {string} id — DOM element ID.
     * @param {string} text — Text to set.
     */
    const setText = (id, text) => {
        const node = el(id);
        if (node) node.textContent = text;
    };

    /**
     * Clamp a value within [min, max] and round to step precision.
     * @param {number} value — Raw value.
     * @param {number} min — Lower bound.
     * @param {number} max — Upper bound.
     * @param {number} step — Step size (determines decimal precision).
     * @returns {number} Clamped and rounded value.
     */
    const clampAndRound = (value, min, max, step) => {
        if (!isFinite(value)) value = min;
        const clamped = Math.min(Math.max(value, min), max);
        if (step >= 1) return Math.round(clamped);
        // Handle scientific notation (e.g., 1e-7) correctly
        const stepStr = String(step);
        let decimals;
        if (stepStr.includes('e-') || stepStr.includes('E-')) {
            // Scientific notation: extract exponent (handles both 1e-7 and 1E-7)
            decimals = parseInt(stepStr.split(/e-/i)[1], 10);
        } else if (stepStr.includes('.')) {
            decimals = stepStr.split('.')[1]?.length ?? 1;
        } else {
            decimals = 1;
        }
        return parseFloat(clamped.toFixed(decimals));
    };

    /**
     * Format a number for axis display, using one decimal if step < 1.
     * @param {number} value — Numeric value.
     * @param {boolean} isFloat — Whether to display as float.
     * @returns {string}
     */
    const formatAxisValue = (value, isFloat) =>
        isFloat ? parseFloat(value).toFixed(1) : String(value);

    /**
     * Escape a string for safe insertion into HTML/SVG markup.
     * Delegates to the canonical implementation in DRC.Utils for DRY.
     * @param {string} str — Raw string to escape.
     * @returns {string} HTML-safe string.
     */
    const escapeHtml = (str) => DRC.Utils.escapeHtml(str);

    /**
     * Refresh Lucide icons after dynamic DOM updates.
     * Centralized to eliminate DRY violations across the codebase.
     */
    const refreshIcons = () => {
        if (typeof lucide !== 'undefined') {
            try {
                lucide.createIcons();
            } catch (e) {
                console.warn('Failed to refresh Lucide icons:', e);
            }
        }
    };

    /**
     * Format a value as percentage string.
     * @param {number} value - The value to format.
     * @param {number} decimals - Number of decimal places (default: 1).
     * @returns {string} Formatted percentage string.
     */
    const formatPercent = (value, decimals = 1) => {
        if (!isFinite(value)) return '0%';
        return value.toFixed(decimals) + '%';
    };

    /**
     * Format a delta value as percentage string with sign.
     * @param {number} value - The delta value.
     * @param {number} decimals - Number of decimal places (default: 2).
     * @returns {string} Formatted delta percentage string.
     */
    const formatDeltaPercent = (value, decimals = 2) => {
        if (!isFinite(value)) return '0%';
        const sign = value > 0 ? '+' : '';
        return `${sign}${value.toFixed(decimals)}%`;
    };

    /**
     * Safe localStorage wrapper with try-catch error handling.
     * Prevents crashes when localStorage is disabled or quota is exceeded.
     */
    const safeStorage = {
        /**
         * Get item from localStorage.
         * @param {string} key — Storage key.
         * @returns {string|null} Stored value or null on error.
         */
        get: (key) => {
            try {
                return localStorage.getItem(key);
            } catch {
                return null;
            }
        },
        /**
         * Set item in localStorage.
         * @param {string} key — Storage key.
         * @param {string} value — Value to store.
         */
        set: (key, value) => {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.warn('Storage failed:', e);
            }
        },
        /**
         * Remove item from localStorage.
         * @param {string} key — Storage key.
         */
        remove: (key) => {
            try {
                localStorage.removeItem(key);
            } catch {
                // Silently ignore
            }
        }
    };

    return { el, setText, clampAndRound, formatAxisValue, escapeHtml, refreshIcons, safeStorage, formatPercent, formatDeltaPercent };
})();

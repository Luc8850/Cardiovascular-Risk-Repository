/**
 * DRC Utilities Module
 * Central utility functions for the Diabetes Risk Calculator
 *
 * Dependencies: DRC.I18n (optional - safe if not loaded)
 * Loads after: ui-helpers.js
 * Loads before: ui-controller.js
 */

(function() {
    'use strict';

    // Ensure DRC namespace exists
    if (typeof window.DRC === 'undefined') {
        window.DRC = {};
    }

    const DRC = window.DRC;

    /**
     * Create a translator function
     * @returns {Function} Translator function (key, fallback) => string
     */
    const createTranslator = () => {
        return (key, fallback) => {
            return DRC.I18n?.t(key, fallback) || fallback || key;
        };
    };

    /**
     * Debounce a function
     * @param {Function} fn - Function to debounce
     * @param {number} ms - Milliseconds to wait
     * @returns {Function} Debounced function
     */
    const debounce = (fn, ms) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    };

    /**
     * Escape HTML special characters
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    const escapeHtml = (str) => {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    /**
     * Create a DOM element cache
     * @returns {Object} Cache object with get and clear methods
     */
    const createElementCache = () => {
        const cache = new Map();
        return {
            get: (id) => {
                if (!cache.has(id)) {
                    const el = document.getElementById(id);
                    if (el) cache.set(id, el);
                }
                return cache.get(id);
            },
            clear: () => cache.clear()
        };
    };

    /**
     * Create a focus trap for a container element.
     * Keeps Tab/Shift+Tab cycling within the container's focusable elements.
     * @param {HTMLElement} container - The container to trap focus within
     * @returns {Object} Focus trap with activate() and deactivate() methods
     */
    const createFocusTrap = (container) => {
        const focusableSelectors = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]):not(:disabled)';

        const getFocusable = () => {
            const all = container.querySelectorAll(focusableSelectors);
            // Filter to visible elements only
            return Array.from(all).filter(el => el.offsetParent !== null);
        };

        const handleKeydown = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = getFocusable();
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        };

        const handleFocusin = (e) => {
            if (!container.contains(e.target)) {
                // Don't redirect focus if the target is inside an open modal on top of this container
                const targetModal = e.target.closest('.modal-overlay.open, .drc-modal-overlay');
                if (targetModal && targetModal !== container) return;
                const first = container.querySelector(focusableSelectors);
                if (first) first.focus();
            }
        };

        return {
            activate() {
                container.addEventListener('keydown', handleKeydown);
                document.addEventListener('focusin', handleFocusin);
                // Move focus to first focusable element
                const first = container.querySelector(focusableSelectors);
                if (first) first.focus();
            },
            deactivate() {
                container.removeEventListener('keydown', handleKeydown);
                document.removeEventListener('focusin', handleFocusin);
            }
        };
    };

    // ─── Flag SVG creation (M2: createElementNS for XSS consistency) ─────

    const SVG_NS = 'http://www.w3.org/2000/svg';

    const createFlagSvg = (code) => {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 20 14');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', '0.5');
        rect.setAttribute('y', '0.5');
        rect.setAttribute('width', '19');
        rect.setAttribute('height', '13');
        rect.setAttribute('rx', '1');
        rect.setAttribute('stroke', 'currentColor');
        rect.setAttribute('stroke-width', '0.5');

        if (code === 'en') {
            rect.setAttribute('fill', '#1e3a8a');
            svg.appendChild(rect);
            const whiteCross = document.createElementNS(SVG_NS, 'path');
            whiteCross.setAttribute('d', 'M0 0L20 14M20 0L0 14');
            whiteCross.setAttribute('stroke', '#f8fafc');
            whiteCross.setAttribute('stroke-width', '2.5');
            svg.appendChild(whiteCross);
            const redCross = document.createElementNS(SVG_NS, 'path');
            redCross.setAttribute('d', 'M0 0L20 14M20 0L0 14');
            redCross.setAttribute('stroke', '#dc2626');
            redCross.setAttribute('stroke-width', '1.5');
            svg.appendChild(redCross);
            const whiteV = document.createElementNS(SVG_NS, 'rect');
            whiteV.setAttribute('x', '8.5'); whiteV.setAttribute('y', '0');
            whiteV.setAttribute('width', '3'); whiteV.setAttribute('height', '14');
            whiteV.setAttribute('fill', '#f8fafc');
            svg.appendChild(whiteV);
            const whiteH = document.createElementNS(SVG_NS, 'rect');
            whiteH.setAttribute('x', '0'); whiteH.setAttribute('y', '5.5');
            whiteH.setAttribute('width', '20'); whiteH.setAttribute('height', '3');
            whiteH.setAttribute('fill', '#f8fafc');
            svg.appendChild(whiteH);
            const redV = document.createElementNS(SVG_NS, 'rect');
            redV.setAttribute('x', '9'); redV.setAttribute('y', '0');
            redV.setAttribute('width', '2'); redV.setAttribute('height', '14');
            redV.setAttribute('fill', '#dc2626');
            svg.appendChild(redV);
            const redH = document.createElementNS(SVG_NS, 'rect');
            redH.setAttribute('x', '0'); redH.setAttribute('y', '6');
            redH.setAttribute('width', '20'); redH.setAttribute('height', '2');
            redH.setAttribute('fill', '#dc2626');
            svg.appendChild(redH);
        } else if (code === 'de') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            const black = document.createElementNS(SVG_NS, 'rect');
            black.setAttribute('x', '1'); black.setAttribute('y', '1');
            black.setAttribute('width', '18'); black.setAttribute('height', '4');
            black.setAttribute('fill', '#1f2937');
            svg.appendChild(black);
            const red = document.createElementNS(SVG_NS, 'rect');
            red.setAttribute('x', '1'); red.setAttribute('y', '5');
            red.setAttribute('width', '18'); red.setAttribute('height', '4');
            red.setAttribute('fill', '#dc2626');
            svg.appendChild(red);
            const gold = document.createElementNS(SVG_NS, 'rect');
            gold.setAttribute('x', '1'); gold.setAttribute('y', '9');
            gold.setAttribute('width', '18'); gold.setAttribute('height', '4');
            gold.setAttribute('fill', '#f59e0b');
            svg.appendChild(gold);
        } else if (code === 'fr') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            const blue = document.createElementNS(SVG_NS, 'rect');
            blue.setAttribute('x', '1'); blue.setAttribute('y', '1');
            blue.setAttribute('width', '6'); blue.setAttribute('height', '12');
            blue.setAttribute('fill', '#1e40af');
            svg.appendChild(blue);
            const white = document.createElementNS(SVG_NS, 'rect');
            white.setAttribute('x', '7'); white.setAttribute('y', '1');
            white.setAttribute('width', '6'); white.setAttribute('height', '12');
            white.setAttribute('fill', '#f8fafc');
            svg.appendChild(white);
            const red = document.createElementNS(SVG_NS, 'rect');
            red.setAttribute('x', '13'); red.setAttribute('y', '1');
            red.setAttribute('width', '6'); red.setAttribute('height', '12');
            red.setAttribute('fill', '#dc2626');
            svg.appendChild(red);
        } else if (code === 'es') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            const topRed = document.createElementNS(SVG_NS, 'rect');
            topRed.setAttribute('x', '1'); topRed.setAttribute('y', '1');
            topRed.setAttribute('width', '18'); topRed.setAttribute('height', '3');
            topRed.setAttribute('fill', '#dc2626');
            svg.appendChild(topRed);
            const yellow = document.createElementNS(SVG_NS, 'rect');
            yellow.setAttribute('x', '1'); yellow.setAttribute('y', '4');
            yellow.setAttribute('width', '18'); yellow.setAttribute('height', '6');
            yellow.setAttribute('fill', '#fbbf24');
            svg.appendChild(yellow);
            const bottomRed = document.createElementNS(SVG_NS, 'rect');
            bottomRed.setAttribute('x', '1'); bottomRed.setAttribute('y', '10');
            bottomRed.setAttribute('width', '18'); bottomRed.setAttribute('height', '3');
            bottomRed.setAttribute('fill', '#dc2626');
            svg.appendChild(bottomRed);
        }

        return svg;
    };

    // Export utilities under DRC.Utils
    DRC.Utils = {
        createTranslator,
        debounce,
        escapeHtml,
        createElementCache,
        createFocusTrap,
        createFlagSvg
    };

})();

/**
 * @fileoverview I18n UI Component
 *
 * Language selector button and dropdown for the top navigation.
 * Manages the UI interactions for language switching.
 *
 * @module I18nUI
 * @memberof DRC
 */

'use strict';

window.DRC = window.DRC || {};

DRC.I18nUI = (() => {
    // ─── State ───────────────────────────────────────────────────────────
    let _dropdown = null;
    let _button = null;
    let _isOpen = false;

    // ─── Private Methods ─────────────────────────────────────────────────

    /** Supported flag language codes (matching DRC.Utils.createFlagSvg) */
    const FLAG_LANGS = ['en', 'de', 'fr', 'es'];

    /**
     * Create the language dropdown element
     * @returns {HTMLElement} Dropdown element
     */
    const _createDropdown = () => {
        const dropdown = document.createElement('div');
        dropdown.className = 'lang-dropdown';
        dropdown.id = 'langDropdown';
        dropdown.setAttribute('hidden', '');
        dropdown.setAttribute('role', 'menu');
        dropdown.setAttribute('aria-label', 'Language selection');

        const languages = DRC.I18n.getAvailableLangs();
        const currentLang = DRC.I18n.getCurrentLang();

        languages.forEach(lang => {
            const option = document.createElement('button');
            option.className = 'lang-option';
            option.setAttribute('data-lang', lang);
            option.setAttribute('role', 'menuitem');
            if (lang === currentLang) {
                option.classList.add('active');
                option.setAttribute('aria-current', 'true');
            }

            const flag = document.createElement('span');
            flag.className = 'lang-flag';
            const svgEl = FLAG_LANGS.includes(lang) ? DRC.Utils.createFlagSvg(lang) : null;
            if (svgEl) {
                flag.appendChild(svgEl);
            } else {
                // Fallback: getFlag returns a text/emoji representation
                flag.textContent = DRC.I18n.getFlag(lang);
            }
            flag.setAttribute('aria-hidden', 'true');

            const name = document.createElement('span');
            name.className = 'lang-name';
            name.textContent = DRC.I18n.getLanguageName(lang);

            option.appendChild(flag);
            option.appendChild(name);

            option.addEventListener('click', () => _selectLanguage(lang));

            dropdown.appendChild(option);
        });

        return dropdown;
    };

    /**
     * Handle language selection
     * @param {string} lang - Language code
     */
    const _selectLanguage = (lang) => {
        if (lang === DRC.I18n.getCurrentLang()) {
            _closeDropdown();
            return;
        }

        const success = DRC.I18n.setLanguage(lang);
        if (success) {
            _updateButtonDisplay();
            _updateDropdownActiveState();
            _closeDropdown();
            DRC.I18n.translateDOM();

            window.dispatchEvent(new CustomEvent('drc:language-changed', {
                detail: { language: lang }
            }));
        }
    };

    /**
     * Update button display with current language
     */
    const _updateButtonDisplay = () => {
        if (!_button) return;

        const lang = DRC.I18n.getCurrentLang();
        const flagIcon = document.getElementById('langFlagIcon');
        const code = document.getElementById('langCode');

        if (flagIcon && FLAG_LANGS.includes(lang)) {
            flagIcon.replaceChildren(DRC.Utils.createFlagSvg(lang));
        }
        if (code) code.textContent = lang.toUpperCase();
    };

    /**
     * Update active state in dropdown
     */
    const _updateDropdownActiveState = () => {
        if (!_dropdown) return;

        const currentLang = DRC.I18n.getCurrentLang();
        const options = _dropdown.querySelectorAll('.lang-option');

        options.forEach(option => {
            const lang = option.getAttribute('data-lang');
            if (lang === currentLang) {
                option.classList.add('active');
                option.setAttribute('aria-current', 'true');
            } else {
                option.classList.remove('active');
                option.removeAttribute('aria-current');
            }
        });
    };

    /**
     * Open the dropdown
     */
    const _openDropdown = () => {
        if (!_dropdown || _isOpen) return;

        _dropdown.removeAttribute('hidden');
        _button?.setAttribute('aria-expanded', 'true');
        _isOpen = true;

        const rect = _button.getBoundingClientRect();
        _dropdown.style.top = `${rect.bottom + 8}px`;
        _dropdown.style.right = `${window.innerWidth - rect.right}px`;

        document.addEventListener('click', _handleDocumentClick);
        document.addEventListener('keydown', _handleKeydown);
    };

    /**
     * Close the dropdown
     */
    const _closeDropdown = () => {
        if (!_dropdown || !_isOpen) return;

        _dropdown.setAttribute('hidden', '');
        _button?.setAttribute('aria-expanded', 'false');
        _isOpen = false;

        document.removeEventListener('click', _handleDocumentClick);
        document.removeEventListener('keydown', _handleKeydown);
    };

    /**
     * Toggle dropdown visibility
     */
    const _toggleDropdown = () => {
        if (_isOpen) {
            _closeDropdown();
        } else {
            _openDropdown();
        }
    };

    /**
     * Handle clicks outside dropdown
     * @param {Event} e - Click event
     */
    const _handleDocumentClick = (e) => {
        if (!_dropdown || !_button) return;
        if (!_dropdown.contains(e.target) && !_button.contains(e.target)) {
            _closeDropdown();
        }
    };

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    const _handleKeydown = (e) => {
        if (e.key === 'Escape') {
            _closeDropdown();
            _button?.focus();
        }
    };

    // ─── Public API ─────────────────────────────────────────────────────

    /**
     * Initialize the language selector UI
     * Must be called after DRC.I18n.init()
     */
    const init = () => {
        _button = document.getElementById('langBtn');
        if (!_button) {
            // Legacy top-nav language button removed; language switching now handled by SettingsPanel.
            return;
        }

        _dropdown = _createDropdown();
        document.body.appendChild(_dropdown);

        _updateButtonDisplay();

        _button.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleDropdown();
        });

        DRC.I18n.onLanguageChange(() => {
            _updateButtonDisplay();
        });

        console.log('i18n-ui: Language selector initialized');
    };

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        init
    };
})();

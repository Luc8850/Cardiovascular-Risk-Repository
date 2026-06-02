/**
 * @fileoverview Landing Page / Onboarding Module
 *
 * A 5-step onboarding flow that appears as a full-screen overlay when users
 * first open the Diabetes Risk Calculator. Settings are persistently saved
 * to localStorage.
 *
 * Steps:
 *   1. Welcome - App intro with Get Started button
 *   2. Language Selection - 4 languages (EN, DE, FR, ES)
 *   3. Model Selection - Clinical / Clinical+Glucose / Complete Model
 *   4. Import Data - Image, PDF, Excel, Encrypted options
 *   5. Ready - Summary and Start Calculator
 *
 * @module LandingPage
 * @memberof DRC
 */

'use strict';

window.DRC = window.DRC || {};

DRC.LandingPage = (() => {
    // ─── Constants ───────────────────────────────────────────────────────
    const STORAGE_KEY = 'drc_landing_settings';
    const TOTAL_STEPS = 5;

    // Model mapping from landing page keys to CONFIG model keys
    const MODEL_MAPPING = {
        'clinical': 'gencardioLipids',
        'clinicalGlucose': 'gencardioLipids',
        'complete': 'gencardioLipids'
    };

    // Language display names
    const LANGUAGE_NAMES = {
        en: 'English',
        de: 'Deutsch',
        fr: 'Français',
        es: 'Español'
    };

    // ─── State ───────────────────────────────────────────────────────────
    let _currentStep = 1;
    let _state = {
        language: 'en',
        model: 'complete',
        importType: null,
        tutorial: false,
        completed: false,
        showSetupAgain: true
    };
    let _isVisible = false;
    let _focusTrap = null;
    let _previousFocusElement = null;
    let _pendingFile = null;        // First file selected in import step (not JSON-serializable)
    let _pendingFiles = null;       // All selected files when multiple were chosen
    let _pendingImportType = null;  // Which card was clicked before file dialog

    // ─── DOM Element References ───────────────────────────────────────────
    let _overlay = null;
    let _content = null;
    let _progressDots = null;
    let _stepCounter = null;
    let _backBtn = null;
    let _nextBtn = null;
    let _finishBtn = null;
    let _restartBtn = null;
    let _footer = null;

    // ─── Private Helper Functions ────────────────────────────────────────

    /**
     * Get translation with fallback
     * @param {string} key - Translation key
     * @param {Object} params - Parameters for interpolation
     * @returns {string} Translated text or key if not found
     */
    const _t = (key, params = {}) => {
        let text;
        if (typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.t) {
            text = DRC.I18n.t(key);
        }
        // Fallback translations if i18n not available or returned key
        if (!text || text === key) {
            const fallbacks = {
                'landing.welcome.title': 'Diabetes Risk Calculator',
                'landing.welcome.subtitle': 'Understand your 9-year diabetes risk based on the ARIC Study',
                'landing.welcome.getStarted': 'Get Started',
                'landing.welcome.skipSetup': 'Skip Setup',
                'landing.language.title': 'Choose Your Language',
                'landing.language.subtitle': 'Select your preferred language',
                'landing.model.title': 'Choose Prediction Model',
                'landing.model.subtitle': 'Select how many values to enter',
                'landing.model.clinical.name': 'Clinical Only',
                'landing.model.clinical.desc': 'Body measurements only',
                'landing.model.clinicalGlucose.name': 'Clinical + Glucose',
                'landing.model.clinicalGlucose.desc': 'Clinical values plus glucose',
                'landing.model.complete.name': 'Complete Model',
                'landing.model.complete.desc': 'All lab values for best accuracy',
                'landing.import.title': 'Import Your Data',
                'landing.import.subtitle': 'Import from file or enter manually',
                'landing.import.image': 'Image Upload',
                'landing.import.pdf': 'PDF Upload',
                'landing.import.excel': 'Excel Import',
                'landing.import.encrypted': 'Encrypted File',
                'landing.import.skip': 'Enter values manually instead',
                'landing.tutorial.title': 'Would you like a tour?',
                'landing.tutorial.subtitle': 'Learn how to use the app',
                'landing.tutorial.yes': 'Show me how to use this app',
                'landing.tutorial.no': 'Skip tutorial',
                'landing.ready.title': "You're all set!",
                'landing.ready.start': 'Start Calculator',
                'landing.ready.restart': 'Start over and change settings',
                'landing.stepCounter': 'Step {step} of {total}',
                'landing.back': 'Back',
                'landing.next': 'Next',
                'landing.restart': 'Start Over'
            };
            text = fallbacks[key] || key;
        }
        // Simple interpolation - apply to both i18n result and fallback
        if (params && Object.keys(params).length > 0) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, v);
            });
        }
        return text;
    };

    /**
     * Create flag SVG element for a language code
     * @param {string} code - Language code
     * @returns {SVGElement} Flag SVG element
     */
    const _createFlagSvg = (code) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 20 14');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
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
            // Union Jack design elements
            const whiteCross1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            whiteCross1.setAttribute('d', 'M0 0L20 14M20 0L0 14');
            whiteCross1.setAttribute('stroke', '#f8fafc');
            whiteCross1.setAttribute('stroke-width', '2.5');
            svg.appendChild(whiteCross1);
            const redCross1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            redCross1.setAttribute('d', 'M0 0L20 14M20 0L0 14');
            redCross1.setAttribute('stroke', '#dc2626');
            redCross1.setAttribute('stroke-width', '1.5');
            svg.appendChild(redCross1);
            const whiteV = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            whiteV.setAttribute('x', '8.5');
            whiteV.setAttribute('y', '0');
            whiteV.setAttribute('width', '3');
            whiteV.setAttribute('height', '14');
            whiteV.setAttribute('fill', '#f8fafc');
            svg.appendChild(whiteV);
            const whiteH = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            whiteH.setAttribute('x', '0');
            whiteH.setAttribute('y', '5.5');
            whiteH.setAttribute('width', '20');
            whiteH.setAttribute('height', '3');
            whiteH.setAttribute('fill', '#f8fafc');
            svg.appendChild(whiteH);
            const redV = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            redV.setAttribute('x', '9');
            redV.setAttribute('y', '0');
            redV.setAttribute('width', '2');
            redV.setAttribute('height', '14');
            redV.setAttribute('fill', '#dc2626');
            svg.appendChild(redV);
            const redH = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            redH.setAttribute('x', '0');
            redH.setAttribute('y', '6');
            redH.setAttribute('width', '20');
            redH.setAttribute('height', '2');
            redH.setAttribute('fill', '#dc2626');
            svg.appendChild(redH);
        } else if (code === 'de') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            // Germany - Black, Red, Gold horizontal
            const black = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            black.setAttribute('x', '1');
            black.setAttribute('y', '1');
            black.setAttribute('width', '18');
            black.setAttribute('height', '4');
            black.setAttribute('fill', '#1f2937');
            svg.appendChild(black);
            const red = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            red.setAttribute('x', '1');
            red.setAttribute('y', '5');
            red.setAttribute('width', '18');
            red.setAttribute('height', '4');
            red.setAttribute('fill', '#dc2626');
            svg.appendChild(red);
            const gold = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            gold.setAttribute('x', '1');
            gold.setAttribute('y', '9');
            gold.setAttribute('width', '18');
            gold.setAttribute('height', '4');
            gold.setAttribute('fill', '#f59e0b');
            svg.appendChild(gold);
        } else if (code === 'fr') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            // France - Blue, White, Red vertical
            const blue = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            blue.setAttribute('x', '1');
            blue.setAttribute('y', '1');
            blue.setAttribute('width', '6');
            blue.setAttribute('height', '12');
            blue.setAttribute('fill', '#1e40af');
            svg.appendChild(blue);
            const white = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            white.setAttribute('x', '7');
            white.setAttribute('y', '1');
            white.setAttribute('width', '6');
            white.setAttribute('height', '12');
            white.setAttribute('fill', '#f8fafc');
            svg.appendChild(white);
            const red = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            red.setAttribute('x', '13');
            red.setAttribute('y', '1');
            red.setAttribute('width', '6');
            red.setAttribute('height', '12');
            red.setAttribute('fill', '#dc2626');
            svg.appendChild(red);
        } else if (code === 'es') {
            rect.setAttribute('fill', 'transparent');
            svg.appendChild(rect);
            // Spain - Red, Yellow, Red horizontal
            const topRed = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            topRed.setAttribute('x', '1');
            topRed.setAttribute('y', '1');
            topRed.setAttribute('width', '18');
            topRed.setAttribute('height', '3');
            topRed.setAttribute('fill', '#dc2626');
            svg.appendChild(topRed);
            const yellow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            yellow.setAttribute('x', '1');
            yellow.setAttribute('y', '4');
            yellow.setAttribute('width', '18');
            yellow.setAttribute('height', '6');
            yellow.setAttribute('fill', '#fbbf24');
            svg.appendChild(yellow);
            const bottomRed = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bottomRed.setAttribute('x', '1');
            bottomRed.setAttribute('y', '10');
            bottomRed.setAttribute('width', '18');
            bottomRed.setAttribute('height', '3');
            bottomRed.setAttribute('fill', '#dc2626');
            svg.appendChild(bottomRed);
        }

        return svg;
    };

    /**
     * Refresh Lucide icons after DOM updates
     */
    const _refreshIcons = () => {
        if (typeof lucide !== 'undefined') {
            try {
                lucide.createIcons();
            } catch (e) {
                console.warn('Failed to refresh Lucide icons:', e);
            }
        }
    };

    /**
     * Save state to localStorage
     */
    const _saveState = () => {
        try {
            const data = {
                ..._state,
                timestamp: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Failed to save landing page settings:', e);
        }
    };

    /**
     * Load state from localStorage
     * @returns {Object|null} Saved state or null
     */
    const _loadState = () => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                return JSON.parse(data, (key, value) => {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                        return undefined;
                    }
                    return value;
                });
            }
        } catch (e) {
            console.warn('Failed to load landing page settings:', e);
        }
        return null;
    };

    /**
     * Get language display name
     * @param {string} code - Language code
     * @returns {string} Display name
     */
    const _getLanguageName = (code) => {
        if (typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.getLanguageName) {
            return DRC.I18n.getLanguageName(code);
        }
        return LANGUAGE_NAMES[code] || code;
    };

    /**
     * Check if user can proceed from current step
     * @returns {boolean} True if can proceed
     */
    const _canProceed = () => {
        switch (_currentStep) {
            case 1:
                return true; // Welcome step always allowed
            case 2:
                return !!_state.language; // Must select language
            case 3:
                return !!_state.model; // Must select model
            case 4:
                return true; // Import is optional
                return true; // Ready step
            default:
                return false;
        }
    };

    /**
     * Update navigation button states and labels
     */
    const _updateNavigation = () => {
        if (!_backBtn || !_nextBtn || !_finishBtn || !_restartBtn) return;

        // Show/hide restart button (visible after step 1)
        _restartBtn.hidden = _currentStep === 1;

        // Back button
        _backBtn.hidden = _currentStep === 1;

        // Next/Finish buttons
        if (_currentStep === TOTAL_STEPS) {
            _nextBtn.hidden = true;
            _finishBtn.hidden = false;
        } else {
            _nextBtn.hidden = _currentStep === 1; // Step 1 uses inline "Get Started" button
            _finishBtn.hidden = true;
            _nextBtn.disabled = !_canProceed();
        }

        // Hide footer entirely on step 1 (content has its own CTA button)
        if (_footer) _footer.hidden = _currentStep === 1;

        // Update button labels (for language changes)
        _backBtn.textContent = _t('landing.back');
        _nextBtn.textContent = _t('landing.next');
        _finishBtn.textContent = _t('landing.ready.start');
        const restartText = _restartBtn.querySelector('span') || _restartBtn;
        restartText.textContent = _t('landing.restart');
    };

    /**
     * Update progress dots
     */
    const _updateProgressDots = () => {
        if (!_progressDots) return;

        _progressDots.replaceChildren();
        for (let i = 1; i <= TOTAL_STEPS; i++) {
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            dot.setAttribute('role', 'progressbar');
            dot.setAttribute('aria-label', `Step ${i} of ${TOTAL_STEPS}`);
            dot.setAttribute('aria-valuenow', String(i));
            dot.setAttribute('aria-valuemax', String(TOTAL_STEPS));

            if (i === _currentStep) {
                dot.classList.add('active');
            } else if (i < _currentStep) {
                dot.classList.add('completed');
            }

            _progressDots.appendChild(dot);
        }
    };

    /**
     * Update step counter text
     */
    const _updateStepCounter = () => {
        if (!_stepCounter) return;
        _stepCounter.textContent = _t('landing.stepCounter', {
            step: String(_currentStep),
            total: String(TOTAL_STEPS)
        });
    };

    /**
     * Navigate to a specific step
     * @param {number} step - Step number
     */
    const _goToStep = (step) => {
        if (step < 1 || step > TOTAL_STEPS) return;
        _currentStep = step;
        _renderStep();
        _updateNavigation();
        _updateProgressDots();
        _updateStepCounter();
    };

    /**
     * Go to next step
     */
    const _nextStep = () => {
        if (_currentStep < TOTAL_STEPS && _canProceed()) {
            _goToStep(_currentStep + 1);
        }
    };

    /**
     * Go to previous step
     */
    const _prevStep = () => {
        if (_currentStep > 1) {
            _goToStep(_currentStep - 1);
        }
    };

    // ─── Step Renderers ──────────────────────────────────────────────────

    /**
     * Create a landing card element
     * @param {Object} options - Card options
     * @returns {HTMLElement} Card element
     */
    const _createCard = (options) => {
        const { id, icon, title, description, values, selected = false, dataset = {} } = options;

        const card = document.createElement('div');
        card.className = 'landing-card';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        if (id) card.id = id;
        if (selected) card.classList.add('selected');

        // Add dataset attributes
        Object.entries(dataset).forEach(([key, value]) => {
            card.dataset[key] = value;
        });

        // Check indicator
        const checkIndicator = document.createElement('div');
        checkIndicator.className = 'check-indicator';
        const checkIcon = document.createElement('i');
        checkIcon.setAttribute('data-lucide', 'check');
        checkIndicator.appendChild(checkIcon);
        card.appendChild(checkIndicator);

        // Icon
        if (icon) {
            const iconContainer = document.createElement('div');
            iconContainer.className = 'landing-card-icon';
            if (typeof icon === 'object' && icon.nodeType) {
                // SVG element
                iconContainer.appendChild(icon);
            } else if (typeof icon === 'string') {
                const iconEl = document.createElement('i');
                iconEl.setAttribute('data-lucide', icon);
                iconContainer.appendChild(iconEl);
            }
            card.appendChild(iconContainer);
        }

        // Title
        const titleEl = document.createElement('h3');
        titleEl.className = 'landing-card-title';
        titleEl.textContent = title;
        card.appendChild(titleEl);

        // Description
        if (description) {
            const descEl = document.createElement('p');
            descEl.className = 'landing-card-description';
            descEl.textContent = description;
            card.appendChild(descEl);
        }

        // Values list
        if (values) {
            const valuesEl = document.createElement('p');
            valuesEl.className = 'landing-card-values';
            valuesEl.textContent = values;
            card.appendChild(valuesEl);
        }

        return card;
    };

    /**
     * Render Step 1: Welcome
     */
    const _renderWelcomeStep = () => {
        const container = document.createElement('div');
        container.className = 'landing-step active landing-welcome';

        // Icon
        const iconContainer = document.createElement('div');
        iconContainer.className = 'landing-welcome-icon';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'activity');
        iconContainer.appendChild(icon);
        container.appendChild(iconContainer);

        // Title
        const title = document.createElement('h1');
        title.className = 'landing-title';
        title.textContent = _t('landing.welcome.title');
        container.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.className = 'landing-subtitle';
        subtitle.textContent = _t('landing.welcome.subtitle');
        container.appendChild(subtitle);

        // Button container
        const btnContainer = document.createElement('div');
        btnContainer.className = 'landing-welcome-buttons';

        // Get Started button
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-lg landing-get-started';
        btn.textContent = _t('landing.welcome.getStarted');
        btn.dataset.action = 'get-started';
        btnContainer.appendChild(btn);

        // Skip Setup button
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'landing-skip-setup-btn';
        skipBtn.textContent = _t('landing.welcome.skipSetup');
        skipBtn.dataset.action = 'skip-setup';
        btnContainer.appendChild(skipBtn);

        container.appendChild(btnContainer);

        return container;
    };

    /**
     * Render Step 2: Language Selection
     */
    const _renderLanguageStep = () => {
        const container = document.createElement('div');
        container.className = 'landing-step active';

        // Title
        const title = document.createElement('h2');
        title.className = 'landing-step-title';
        title.textContent = _t('landing.language.title');
        container.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.className = 'landing-step-subtitle';
        subtitle.textContent = _t('landing.language.subtitle');
        container.appendChild(subtitle);

        // Language cards
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'landing-cards four-col';

        const languages = ['en', 'de', 'fr', 'es'];
        languages.forEach(lang => {
            const flagSvg = _createFlagSvg(lang);
            const card = _createCard({
                id: `lang-card-${lang}`,
                icon: flagSvg,
                title: _getLanguageName(lang),
                selected: _state.language === lang,
                dataset: { action: 'select-language', language: lang }
            });
            cardsContainer.appendChild(card);
        });

        container.appendChild(cardsContainer);
        return container;
    };

    /**
     * Render Step 3: Model Selection
     */
    const _renderModelStep = () => {
        const container = document.createElement('div');
        container.className = 'landing-step active';

        // Title
        const title = document.createElement('h2');
        title.className = 'landing-step-title';
        title.textContent = _t('landing.model.title');
        container.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.className = 'landing-step-subtitle';
        subtitle.textContent = _t('landing.model.subtitle');
        container.appendChild(subtitle);

        // Model cards
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'landing-cards';

        const models = [
            { key: 'clinical', icon: 'user' },
            { key: 'clinicalGlucose', icon: 'droplets' },
            { key: 'complete', icon: 'clipboard-list' }
        ];

        models.forEach(model => {
            const card = _createCard({
                id: `model-card-${model.key}`,
                icon: model.icon,
                title: _t(`landing.model.${model.key}.name`),
                description: _t(`landing.model.${model.key}.desc`),
                selected: _state.model === model.key,
                dataset: { action: 'select-model', model: model.key }
            });
            cardsContainer.appendChild(card);
        });

        container.appendChild(cardsContainer);
        return container;
    };

    /**
     * Render Step 4: Import Selection
     */
    const _renderImportStep = () => {
        const container = document.createElement('div');
        container.className = 'landing-step active';

        // Title
        const title = document.createElement('h2');
        title.className = 'landing-step-title';
        title.textContent = _t('landing.import.title');
        container.appendChild(title);

        // Subtitle
        const subtitle = document.createElement('p');
        subtitle.className = 'landing-step-subtitle';
        subtitle.textContent = _t('landing.import.subtitle');
        container.appendChild(subtitle);

        // ── Skip option at TOP ──────────────────────────────────────────
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'landing-skip-btn';
        skipBtn.textContent = _t('landing.import.skip');
        skipBtn.dataset.action = 'skip-import';
        if (_state.importType === null) skipBtn.classList.add('active');
        container.appendChild(skipBtn);

        // ── Import cards ─────────────────────────────────────────────────
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'landing-cards two-col';

        const importOptions = [
            { key: 'image', icon: 'image' },
            { key: 'pdf', icon: 'file-text' },
            { key: 'excel', icon: 'table' },
            { key: 'encrypted', icon: 'lock' }
        ];

        importOptions.forEach(opt => {
            const card = _createCard({
                id: `import-card-${opt.key}`,
                icon: opt.icon,
                title: _t(`landing.import.${opt.key}`),
                selected: _state.importType === opt.key && !!_pendingFile,
                dataset: { action: 'select-import', importType: opt.key }
            });
            // Import cards are action-triggers, not selections — remove check indicators
            card.querySelector('.check-indicator')?.remove();
            cardsContainer.appendChild(card);
        });

        container.appendChild(cardsContainer);

        // ── File confirmation (shown after a file is selected) ───────────
        if (_state.importType && _pendingFile) {
            const conf = document.createElement('div');
            conf.className = 'landing-import-confirmation';
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'check-circle');
            const name = document.createElement('span');
            name.textContent = _pendingFile.name;
            conf.appendChild(icon);
            conf.appendChild(name);
            container.appendChild(conf);
        }

        // ── Hidden file inputs ───────────────────────────────────────────
        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.id = 'lp-image-file-input';
        imageInput.accept = 'image/*,.pdf';
        imageInput.multiple = true;
        imageInput.style.display = 'none';
        imageInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                _pendingFile = files[0];
                _pendingFiles = files.length > 1 ? files : null;
                _state.importType = _pendingImportType || 'image';
                _saveState();
                _renderStep();
                _updateNavigation();
            }
        });
        container.appendChild(imageInput);

        const excelInput = document.createElement('input');
        excelInput.type = 'file';
        excelInput.id = 'lp-excel-file-input';
        excelInput.accept = '.xlsx,.xls,.drc';
        excelInput.style.display = 'none';
        excelInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) {
                _pendingFile = file;
                _state.importType = _pendingImportType || 'excel';
                _saveState();
                _renderStep();
                _updateNavigation();
            }
        });
        container.appendChild(excelInput);

        return container;
    };

    /**
     * Render Step 5: Ready
     */
    const _renderReadyStep = () => {
        const container = document.createElement('div');
        container.className = 'landing-step active landing-ready';

        // Success icon
        const iconContainer = document.createElement('div');
        iconContainer.className = 'landing-success-icon';
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'check');
        iconContainer.appendChild(icon);
        container.appendChild(iconContainer);

        // Title
        const title = document.createElement('h1');
        title.className = 'landing-title';
        title.textContent = _t('landing.ready.title');
        container.appendChild(title);

        // Summary
        const summary = document.createElement('div');
        summary.className = 'landing-summary';

        // Language summary
        const langSummary = document.createElement('div');
        langSummary.className = 'landing-summary-item';
        const langLabel = document.createElement('span');
        langLabel.className = 'summary-label';
        langLabel.textContent = _t('landing.language.title') + ':';
        const langValue = document.createElement('span');
        langValue.className = 'summary-value';
        langValue.textContent = _getLanguageName(_state.language);
        langSummary.appendChild(langLabel);
        langSummary.appendChild(document.createTextNode(' '));
        langSummary.appendChild(langValue);
        summary.appendChild(langSummary);

        // Model summary
        const modelSummary = document.createElement('div');
        modelSummary.className = 'landing-summary-item';
        const modelLabel = document.createElement('span');
        modelLabel.className = 'summary-label';
        modelLabel.textContent = _t('landing.model.title') + ':';
        const modelValue = document.createElement('span');
        modelValue.className = 'summary-value';
        modelValue.textContent = _t(`landing.model.${_state.model}.name`);
        modelSummary.appendChild(modelLabel);
        modelSummary.appendChild(document.createTextNode(' '));
        modelSummary.appendChild(modelValue);
        summary.appendChild(modelSummary);

        // Import summary
        const importSummary = document.createElement('div');
        importSummary.className = 'landing-summary-item';
        const importLabel = document.createElement('span');
        importLabel.className = 'summary-label';
        importLabel.textContent = _t('landing.import.title') + ':';
        const importValue = document.createElement('span');
        importValue.className = 'summary-value';
        importValue.textContent = _state.importType
            ? _t(`landing.import.${_state.importType}`)
            : _t('landing.import.skip');
        importSummary.appendChild(importLabel);
        importSummary.appendChild(document.createTextNode(' '));
        importSummary.appendChild(importValue);
        summary.appendChild(importSummary);

        container.appendChild(summary);

        // Restart link
        const restartLink = document.createElement('button');
        restartLink.type = 'button';
        restartLink.className = 'landing-restart-link';
        restartLink.textContent = _t('landing.ready.restart');
        restartLink.dataset.action = 'restart';
        container.appendChild(restartLink);

        // Show setup again toggle
        const showAgainLabel = document.createElement('label');
        showAgainLabel.className = 'landing-show-again';
        const showAgainCb = document.createElement('input');
        showAgainCb.type = 'checkbox';
        showAgainCb.checked = !!_state.showSetupAgain;
        showAgainCb.addEventListener('change', (e) => {
            _state.showSetupAgain = e.target.checked;
            _saveState();
        });
        const showAgainText = document.createElement('span');
        showAgainText.textContent = _t('landing.ready.showAgain');
        if (!showAgainText.textContent || showAgainText.textContent === 'landing.ready.showAgain') {
            showAgainText.textContent = 'Show this setup again next time';
        }
        showAgainLabel.appendChild(showAgainCb);
        showAgainLabel.appendChild(showAgainText);
        container.appendChild(showAgainLabel);

        return container;
    };

    /**
     * Render current step content
     */
    const _renderStep = () => {
        if (!_content) return;

        // Reset scroll position so the new step starts at the top
        _content.scrollTop = 0;
        _content.replaceChildren();

        let stepContent;
        switch (_currentStep) {
            case 1:
                stepContent = _renderWelcomeStep();
                break;
            case 2:
                stepContent = _renderLanguageStep();
                break;
            case 3:
                stepContent = _renderModelStep();
                break;
            case 4:
                stepContent = _renderImportStep();
                break;
            case 5:
                stepContent = _renderReadyStep();
                break;
            default:
                stepContent = document.createElement('div');
        }

        _content.appendChild(stepContent);
        _refreshIcons();
    };

    // ─── Event Handlers ──────────────────────────────────────────────────

    /**
     * Handle click events via event delegation
     * @param {Event} e - Click event
     */
    const _handleClick = (e) => {
        const target = e.target.closest('[data-action]') || e.target.closest('.landing-card') || e.target.closest('.landing-tutorial-toggle');
        if (!target) return;

        const action = target.dataset.action;

        switch (action) {
            case 'get-started':
                _nextStep();
                break;

            case 'skip-setup':
                _skipSetup();
                break;

            case 'select-language':
                _state.language = target.dataset.language;
                _saveState();
                // Apply language immediately so the rest of the setup is translated
                if (typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.setLanguage) {
                    DRC.I18n.setLanguage(_state.language);
                }
                _renderStep();
                _updateNavigation();
                _updateStepCounter();
                break;

            case 'select-model':
                _state.model = target.dataset.model;
                _saveState();
                _renderStep();
                _updateNavigation();
                break;

            case 'select-import': {
                const type = target.dataset.importType;
                _pendingImportType = type;
                if (type === 'image' || type === 'pdf') {
                    document.getElementById('lp-image-file-input')?.click();
                } else {
                    document.getElementById('lp-excel-file-input')?.click();
                }
                break;
            }

            case 'skip-import':
                _state.importType = null;
                _pendingFile = null;
                _pendingFiles = null;
                _pendingImportType = null;
                _saveState();
                _renderStep();
                _nextStep();
                break;

            case 'finish-setup':
                _finish();
                break;

            case 'restart':
                reset();
                break;

            default:
                // Handle card clicks without data-action
                if (target.classList.contains('landing-card')) {
                    if (target.dataset.language) {
                        _state.language = target.dataset.language;
                        _saveState();
                        // Apply language immediately so the rest of the setup is translated
                        if (typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.setLanguage) {
                            DRC.I18n.setLanguage(_state.language);
                        }
                        _renderStep();
                        _updateNavigation();
                        _updateStepCounter();
                    } else if (target.dataset.model) {
                        _state.model = target.dataset.model;
                        _saveState();
                        _renderStep();
                        _updateNavigation();
                    } else if (target.dataset.importType) {
                        const type = target.dataset.importType;
                        _pendingImportType = type;
                        if (type === 'image' || type === 'pdf') {
                            document.getElementById('lp-image-file-input')?.click();
                        } else {
                            document.getElementById('lp-excel-file-input')?.click();
                        }
                    }
                }
        }
    };

    /**
     * Handle keyboard navigation
     * @param {KeyboardEvent} e - Keyboard event
     */
    const _handleKeyboard = (e) => {
        if (!_isVisible) return;

        switch (e.key) {
            case 'Enter':
                // Enter on cards should select them
                if (document.activeElement?.classList.contains('landing-card')) {
                    document.activeElement.click();
                }
                break;

            case 'Escape':
                // Escape on steps 2+ goes back
                if (_currentStep > 1) {
                    e.preventDefault();
                    _prevStep();
                }
                break;

            case 'ArrowRight':
                if (_currentStep < TOTAL_STEPS) {
                    e.preventDefault();
                    _nextStep();
                }
                break;

            case 'ArrowLeft':
                if (_currentStep > 1) {
                    e.preventDefault();
                    _prevStep();
                }
                break;
        }
    };

    /**
     * Trigger file import based on selected import type
     * @param {string} importType - 'image' | 'pdf' | 'excel' | 'encrypted'
     * @param {boolean} skipDrawer - If true, don't open patient drawer (for setup flow)
     */
    const _triggerImport = (importType, skipDrawer = false) => {
        switch (importType) {
            case 'image':
            case 'pdf':
                if (typeof DRC !== 'undefined' && DRC.OCRUIController) {
                    DRC.OCRUIController.showModal();
                    if (_pendingFiles) {
                        setTimeout(() => DRC.OCRUIController.processFiles(_pendingFiles), 200);
                    } else if (_pendingFile) {
                        setTimeout(() => DRC.OCRUIController.processFile(_pendingFile), 200);
                    } else {
                        setTimeout(() => document.getElementById('ocrFileInput')?.click(), 200);
                    }
                }
                break;
            case 'excel':
            case 'encrypted': {
                // Only open drawer if not in setup flow (skipDrawer = true)
                if (!skipDrawer) {
                    if (DRC.PatientManager?.toggleDrawer) {
                        DRC.PatientManager.toggleDrawer(true);
                    } else {
                        const drawer = document.getElementById('patientDrawer');
                        const overlay = document.getElementById('patientOverlay');
                        const btn = document.getElementById('patientMenuBtn');
                        if (drawer) drawer.classList.add('open');
                        if (overlay) overlay.classList.add('open');
                        if (btn) btn.classList.add('open');
                    }
                }
                if (_pendingFile) {
                    setTimeout(() => {
                        const input = document.getElementById('pdImportFile');
                        if (input) {
                            const dt = new DataTransfer();
                            dt.items.add(_pendingFile);
                            input.files = dt.files;
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, 300);
                } else {
                    setTimeout(() => document.getElementById('pdImportFile')?.click(), 300);
                }
                break;
            }
        }
    };

    /**
     * Skip the entire setup and use defaults
     */
    const _skipSetup = () => {
        _state.completed = true;
        _state.skipOnboarding = true;
        _saveState();

        // Hide first so optional setup work cannot keep the overlay open.
        hide();

        // Apply language (keep current/default)
        try {
            if (_state.language && typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.setLanguage) {
                DRC.I18n.setLanguage(_state.language);
            }
        } catch (e) {
            console.warn('Landing page: failed to apply language while skipping setup', e);
        }

        // Apply default model
        try {
            const mappedModel = MODEL_MAPPING[_state.model] || _state.model;
            if (mappedModel && typeof DRC !== 'undefined' && DRC.App && DRC.App.switchModel) {
                DRC.App.switchModel(mappedModel);
            }
        } catch (e) {
            console.warn('Landing page: failed to apply model while skipping setup', e);
        }

        // Trigger event for other modules
        if (typeof DRC !== 'undefined' && DRC.App && DRC.App.trigger) {
            DRC.App.trigger('landing:completed', _state);
        }
    };

    /**
     * Apply settings and finish onboarding
     */
    const _finish = () => {
        _state.completed = true;
        _state.skipOnboarding = !_state.showSetupAgain;
        _saveState();

        // Hide first so a non-critical settings/import error cannot trap the user.
        hide();

        // Apply language
        try {
            if (_state.language && typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.setLanguage) {
                DRC.I18n.setLanguage(_state.language);
            }
        } catch (e) {
            console.warn('Landing page: failed to apply language', e);
        }

        // Apply model selection
        try {
            const mappedModel = MODEL_MAPPING[_state.model] || _state.model;
            if (mappedModel && typeof DRC !== 'undefined' && DRC.App && DRC.App.switchModel) {
                DRC.App.switchModel(mappedModel);
            }
        } catch (e) {
            console.warn('Landing page: failed to apply model', e);
        }

        // Trigger import if a type was selected (skip drawer for setup flow)
        if (_state.importType) {
            setTimeout(() => _triggerImport(_state.importType, true), 400);
        }

        // Trigger event for other modules
        if (typeof DRC !== 'undefined' && DRC.App && DRC.App.trigger) {
            DRC.App.trigger('landing:completed', _state);
        }
    };

    // ─── Public API ─────────────────────────────────────────────────────

    /**
     * Initialize the landing page
     * Checks localStorage and shows if needed
     */
    const init = () => {
        // Cache DOM references
        _overlay = document.getElementById('landingOverlay');
        _content = document.getElementById('landingContent');
        _progressDots = document.getElementById('landingProgressDots');
        _stepCounter = document.getElementById('landingStepCounter');
        _backBtn = document.getElementById('landingBackBtn');
        _nextBtn = document.getElementById('landingNextBtn');
        _finishBtn = document.getElementById('landingFinishBtn');
        _restartBtn = document.getElementById('landingRestartBtn');
        _footer = _overlay ? _overlay.querySelector('.landing-footer') : null;

        if (!_overlay) {
            console.warn('Landing page overlay not found in DOM');
            return;
        }

        // Load saved state
        const saved = _loadState();
        if (saved) {
            _state = { ..._state, ...saved };
            _currentStep = 1; // Always start from beginning
        }

        // Check if should show (show if not completed AND not skipped)
        const shouldSkip = _state.completed && _state.skipOnboarding;
        if (!shouldSkip) {
            show();
        } else {
            // Apply saved settings even when skipping
            if (_state.language && typeof DRC !== 'undefined' && DRC.I18n && DRC.I18n.setLanguage) {
                DRC.I18n.setLanguage(_state.language);
            }
            // Defer model switch until after DRC.App.init() has run
            const mappedModel = MODEL_MAPPING[_state.model] || _state.model;
            if (mappedModel) {
                setTimeout(() => {
                    if (typeof DRC !== 'undefined' && DRC.App && DRC.App.switchModel) {
                        DRC.App.switchModel(mappedModel);
                    }
                }, 0);
            }
        }

        // Bind events
        _overlay.addEventListener('click', _handleClick);
        document.addEventListener('keydown', _handleKeyboard);

        // Bind navigation buttons
        if (_backBtn) {
            _backBtn.addEventListener('click', _prevStep);
            _backBtn.textContent = _t('landing.back');
        }
        if (_nextBtn) {
            _nextBtn.addEventListener('click', _nextStep);
            _nextBtn.textContent = _t('landing.next');
        }
        if (_finishBtn) {
            _finishBtn.addEventListener('click', _finish);
            _finishBtn.textContent = _t('landing.ready.start');
        }
        if (_restartBtn) {
            _restartBtn.addEventListener('click', reset);
            const restartText = _restartBtn.querySelector('span') || _restartBtn;
            restartText.textContent = _t('landing.restart');
        }

        // Listen for language changes while landing page is open
        window.addEventListener('drc:language-changed', () => {
            if (_isVisible) {
                _renderStep();
                _updateNavigation();
                _updateStepCounter();
            }
        });
    };

    /**
     * Show the landing page overlay
     */
    const show = () => {
        if (!_overlay) {
            _overlay = document.getElementById('landingOverlay');
        }
        if (_overlay) {
            _overlay.style.display = '';
            _overlay.hidden = false;
            _isVisible = true;
            _currentStep = 1;
            _renderStep();
            _updateNavigation();
            _updateProgressDots();
            _updateStepCounter();

            // Focus trap: store previous focus and activate
            _previousFocusElement = document.activeElement;
            _focusTrap = DRC.Utils.createFocusTrap(_overlay);
            _focusTrap.activate();
        }
    };

    /**
     * Hide the landing page overlay
     */
    const hide = () => {
        if (_overlay) {
            _overlay.hidden = true;
            _overlay.style.display = 'none';
            _isVisible = false;
        }
        // Focus trap: deactivate and restore focus
        if (_focusTrap) { _focusTrap.deactivate(); _focusTrap = null; }
        if (_previousFocusElement) { _previousFocusElement.focus(); _previousFocusElement = null; }
    };

    /**
     * Reset landing page settings and reload
     */
    const reset = () => {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to clear landing page settings:', e);
        }

        _state = {
            language: 'en',
            model: 'complete',
            importType: null,
            tutorial: false,
            completed: false,
            showSetupAgain: true
        };
        _pendingFile = null;
        _pendingFiles = null;
        _pendingImportType = null;
        _currentStep = 1;

        // Reload page or reinitialize
        window.location.reload();
    };

    /**
     * Get current landing page state
     * @returns {Object} Current state
     */
    const getState = () => ({ ..._state });

    /**
     * Check if landing page has been completed
     * @returns {boolean} True if completed
     */
    const isCompleted = () => _state.completed;

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        init,
        show,
        hide,
        reset,
        restart: reset,
        getState,
        isCompleted
    };
})();

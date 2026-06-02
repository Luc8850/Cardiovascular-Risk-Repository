/**
 * @fileoverview Application controller — state management & event wiring.
 *
 * Orchestrates the interaction between the RiskModel and UIController
 * modules. Handles slider events, unit toggling, and reset logic.
 *
 * @module App
 * @memberof DRC
 */

'use strict';

DRC.App = (() => {
    const UI    = () => DRC.UIController;
    const Model = () => DRC.RiskModel;
    const CFG   = DRC.CONFIG;

    /** Application state (mutable). */
    const state = {
        isMetric: false,
        prevRiskPct: null,
        activeField: null,
        /**
         * Precise SI-unit values, updated on every calculation.
         * Used as the "source of truth" during unit switches to prevent
         * cumulative rounding drift from repeated conversions.
         */
        preciseSI: null,
        /** Active model identifier, references a key in CONFIG.MODELS. */
        activeModel: CFG.DEFAULT_MODEL,
        /**
         * ISSUE-005: Re-entrancy guard for onToggleUnits.
         * While true, any stray calculate() triggered by DOM side-effects
         * (slider clamping, event bubbling, listeners on unit-toggle) is
         * skipped so it cannot overwrite state.preciseSI with rounded DOM
         * values, which would make unit conversion lossy.
         */
        _suppressRecalc: false
    };

    let _highlightedField = null;

    /** requestAnimationFrame ID for throttling slider input events. */
    let _rafId = null;

    // Cache for field elements (performance optimization)
    const fieldElementCache = new Map();

    /** Populate cache with all field elements. */
    const populateFieldCache = () => {
        fieldElementCache.clear();
        document.querySelectorAll('[data-field]').forEach(el => {
            const field = el.getAttribute('data-field');
            if (!fieldElementCache.has(field)) {
                fieldElementCache.set(field, []);
            }
            fieldElementCache.get(field).push(el);
        });
    };

    /** Re-apply cross-panel highlight after DOM re-renders. */
    const reapplyHighlight = () => {
        if (!_highlightedField) return;
        const elements = fieldElementCache.get(_highlightedField);
        if (elements) {
            elements.forEach(n => n.classList.add('factor-highlight'));
        }
    };

    // ─── Model selection ─────────────────────────────────────────────────

    /**
     * Return the currently active model object from CONFIG.MODELS.
     * @returns {Object} Model definition with intercept, betas, and field lists.
     */
    const getActiveModel = () => CFG.MODELS[state.activeModel];

    /**
     * Switch the active model and trigger a recalculation.
     * @param {string} modelId — Key from CONFIG.MODELS (e.g. 'clinical').
     */
    const switchModel = (modelId) => {
        if (!CFG.MODELS[modelId]) {
            console.error(`switchModel: unknown modelId "${modelId}"`);
            return;
        }
        state.activeModel = modelId;
        trigger('model:changed', { modelId, model: CFG.MODELS[modelId] });
        window.dispatchEvent(new CustomEvent('model:changed', { detail: { modelId } }));
        calculate();
    };

    // ─── Core calculation pipeline ──────────────────────────────────────

    /**
     * Full recalculation: reads inputs, runs the model, updates all UI.
     * @returns {number} Current risk percentage.
     */
    /**
     * Compute the "original" (pre-simulation) SI-unit values by overriding
     * any simulated factors with their stored pre-simulation slider values
     * (converted from display units to SI). Operates on the lossless
     * preciseSI source of truth so the main "Your Risk" display is
     * idempotent across unit toggles.
     * @param {Object} siVals - Current SI values (full precision)
     * @returns {Object} SI values with simulated factors reverted to originals
     */
    const _getOriginalSI = (siVals) => {
        // Prefer the authoritative pre-simulation snapshot: it carries the unit
        // system (isMetric) captured at simulation start, so we can convert to
        // SI correctly even if the user toggled units while a sim is active.
        const snapshot = DRC.TreatmentSimulator?.getPreSimulationSnapshot?.() || {};
        const legacy = DRC.TreatmentSimulator?.getOriginalValues?.() || {};
        const factors = new Set([...Object.keys(snapshot), ...Object.keys(legacy)]);
        if (factors.size === 0) return siVals;
        const result = { ...siVals };
        factors.forEach(factor => {
            const snap = snapshot[factor];
            // Snapshot form: { value, isMetric }. Convert to SI using the
            // snapshot's own isMetric, not the current display unit system.
            if (snap && typeof snap === 'object' && 'value' in snap) {
                const val = snap.value;
                if (CFG.CONVERTIBLE_FIELDS.includes(factor)) {
                    result[factor] = snap.isMetric
                        ? DRC.ConversionService.convertField(factor, val, false)
                        : val;
                } else {
                    result[factor] = val;
                }
                return;
            }
            // Legacy fallback (no unit-system metadata): assume current display units.
            const val = legacy[factor];
            if (val == null) return;
            if (CFG.CONVERTIBLE_FIELDS.includes(factor)) {
                result[factor] = state.isMetric
                    ? DRC.ConversionService.convertField(factor, val, false)
                    : val;
            } else {
                result[factor] = val;
            }
        });
        return result;
    };

    const _getAgeSexBaseSI = (siVals) => ({
        ...DRC.CONFIG.NORMAL_VALUES,
        age: siVals.age,
        sex: siVals.sex,
        trtBp: 0,
        smoking: 0,
        diabetes: 0
    });

    /**
     * ISSUE-005: Merge DOM-derived SI values into stored preciseSI without
     * introducing rounding drift.
     *
     * If a field's new SI value rounds to the same DOM display representation
     * (within one slider step) as the currently-stored preciseSI value, keep
     * the stored precise value. Otherwise treat it as a genuine user edit and
     * overwrite losslessly with the new value.
     *
     * @param {Object|null} previous — Previously stored precise SI values.
     * @param {Object} current — Fresh SI values derived from DOM inputs.
     * @returns {Object} Merged SI values (full precision preserved).
     */
    const _mergePreciseSI = (previous, current) => {
        if (!previous) return { ...current };
        if (DRC.TreatmentSimulator?.isAnimating?.() || DRC.TreatmentSimulator?.hasActiveSimulation?.()) {
            return { ...current };
        }
        const merged = { ...current };
        CFG.CONVERTIBLE_FIELDS.forEach(f => {
            const prev = previous[f];
            const curr = current[f];
            if (prev == null || curr == null) return;
            // Step in the *display* unit, converted back to SI. This is the
            // smallest increment a user can actually produce via the slider,
            // so differences below half-step are guaranteed to be rounding
            // artefacts, not edits.
            const mode = state.isMetric ? 'si' : 'us';
            const range = CFG.RANGES[f]?.[mode];
            if (!range) return;
            const step = range[2];
            const stepSI = state.isMetric
                ? DRC.ConversionService.convertField(f, step, false) - DRC.ConversionService.convertField(f, 0, false)
                : step;
            const MERGE_TOLERANCE_RATIO = 0.5; // Half-step tolerance for lossless merge
            const tolerance = Math.abs(stepSI) * MERGE_TOLERANCE_RATIO;
            if (Math.abs(curr - prev) <= tolerance) {
                merged[f] = prev; // Keep full-precision value
            }
        });
        return merged;
    };

    const calculate = () => {
        // ISSUE-005: Skip recalcs while a unit toggle is in progress. The
        // toggle uses state.preciseSI directly for its render pass; letting
        // calculate() run here would re-read rounded DOM values and overwrite
        // state.preciseSI, introducing cumulative rounding drift.
        if (state._suppressRecalc) return;

        const activeModel   = getActiveModel();
        const rawInputs     = UI().readInputs();
        const siValsCurrent = Model().toSI(rawInputs, state.isMetric);

        // ISSUE-005 — Idempotent preciseSI update:
        // Only overwrite state.preciseSI for a field when the DOM-derived SI
        // value differs meaningfully from the stored precise value. This makes
        // repeated unit toggles lossless: rounding the display does not drift
        // the underlying SI source of truth.
        state.preciseSI = _mergePreciseSI(state.preciseSI, siValsCurrent);

        // All risk/contribution computations use the lossless preciseSI, not
        // the rounded DOM-derived siValsCurrent. In SI display mode the DOM
        // is rounded to the slider step (e.g. 0.1 mmol/L), so feeding it into
        // computeProbability() would produce different risk before vs. after
        // a unit toggle — even when state.preciseSI is stable.
        const siLossless = state.preciseSI;

        // "Your Risk" = risk based on the original (pre-simulation) values
        const siValsOriginal = _getOriginalSI(siLossless);
        const _riskOriginal = Model().computeProbability(siValsOriginal, activeModel);
        const riskPctOriginal = (_riskOriginal != null && isFinite(_riskOriginal)) ? _riskOriginal * 100 : NaN;
        const _riskBase = Model().computeProbability(_getAgeSexBaseSI(siLossless), activeModel);
        const riskPctBase = (_riskBase != null && isFinite(_riskBase)) ? _riskBase * 100 : NaN;

        // "Your Risk with Chosen Treatments" = current (possibly simulated) risk
        const _riskCurrent = Model().computeProbability(siLossless, activeModel);
        const riskPctCurrent  = (_riskCurrent != null && isFinite(_riskCurrent)) ? _riskCurrent * 100 : NaN;

        const logOddsContributions = Model().computeContributions(siLossless, activeModel);
        const marginalSummary = Model().computeMarginalSummary(siLossless, activeModel);
        const additiveContributions = Model().computeAdditiveContributions(siLossless, _getAgeSexBaseSI(siLossless), activeModel);
        if (marginalSummary) {
            marginalSummary.whatIfContributions = { ...marginalSummary.contributions };
            marginalSummary.additiveContributions = additiveContributions;
            marginalSummary.contributions = additiveContributions;
            marginalSummary.pBaseline = _riskBase;
            marginalSummary.netDeviation = (_riskOriginal ?? NaN) - (_riskBase ?? NaN);
            marginalSummary.sumMarginals = Object.values(additiveContributions).reduce((a, b) => a + b, 0);
        }
        const isMale        = rawInputs.sex === 1;
        const treatStatus   = Model().getElevatedFactors(siLossless, isMale);

        // Render all views with the calculated data
        _renderAllViews(riskPctOriginal, riskPctCurrent, riskPctBase, logOddsContributions, marginalSummary, treatStatus, siLossless, activeModel);
        return riskPctCurrent;
    };

    /**
     * Render all views with calculated data.
     * @param {number} riskPctOriginal - Pre-simulation (baseline) risk percentage
     * @param {number} riskPctCurrent - Current (post-simulation) risk percentage
     * @param {Object} logOddsContributions - Log-odds contributions (for treatment recommendations)
     * @param {Object} marginalSummary - Marginal probability summary (for chart + treatments)
     * @param {Object} treatStatus - Treatment status with elevated factors
     * @param {Object} siVals - SI-unit values (current)
     * @param {Object} [model] - Active model definition from CONFIG.MODELS
     */
    const _renderAllViews = (riskPctOriginal, riskPctCurrent, riskPctBase, logOddsContributions, marginalSummary, treatStatus, siVals, model) => {
        const isAnimating = DRC.TreatmentSimulator?.isAnimating?.() || false;

        // During treatment animation, skip heavy DOM rebuilds — only update
        // the lightweight risk displays. The full pipeline runs once after
        // the animation completes (via onSimulationComplete → risk:recalculate).
        UI().renderRisk(riskPctOriginal);
        UI().renderBaseRisk(riskPctBase);
        UI().renderChosenRisk(riskPctCurrent, riskPctOriginal);
        UI().renderChosenTreatmentsList(DRC.TreatmentSimulator?.getSimulatedFactors?.() || []);

        if (isAnimating) return;

        UI().updateNonModSummary();
        UI().updateModSummary();
        UI().renderIconArray(riskPctOriginal);
        UI().renderContributionChart(marginalSummary, { trigger: trigger, activeModel: CFG.MODELS[state.activeModel] });
        UI().renderTreatmentOverview(treatStatus, logOddsContributions, marginalSummary, { activeModel: CFG.MODELS[state.activeModel] });

        if (state.activeField && state.prevRiskPct !== null) {
            UI().renderWhatIfBadge(state.activeField, riskPctCurrent - state.prevRiskPct);
        }

        // Refresh cache after DOM updates (for performance optimization)
        populateFieldCache();
        reapplyHighlight();

        // Refresh patient nav label to show current live risk percentage
        DRC.PatientManager?.updateNavLabel?.();
    };

    // ─── Slider event handlers ──────────────────────────────────────────

    const onSliderInput = (field) => {
        const slider = document.getElementById(`${field}-slider`);
        const input  = document.getElementById(`${field}-value`);
        if (slider && input) input.value = slider.value;
        UI().updateSliderFill(field);
        state.activeField = field;
        // Throttle calculate() to once per animation frame to avoid running
        // the full calculation pipeline on every ~60Hz input event.
        if (_rafId) cancelAnimationFrame(_rafId);
        _rafId = requestAnimationFrame(() => { calculate(); _rafId = null; });
    };

    const onSliderStart = (field) => {
        state.activeField = field;
        const raw = UI().readInputs();
        const _riskSlider = Model().computeProbability(Model().toSI(raw, state.isMetric));
        state.prevRiskPct = (_riskSlider != null && isFinite(_riskSlider)) ? _riskSlider * 100 : NaN;
    };

    /** @type {Object<string, number>} Active badge-clear timeouts per field. */
    // Entries are auto-cleaned via `delete _badgeTimeouts[field]` inside the timeout callback.
    const _badgeTimeouts = {};

    const onSliderEnd = (field) => {
        if (_badgeTimeouts[field]) clearTimeout(_badgeTimeouts[field]);
        _badgeTimeouts[field] = setTimeout(() => {
            const badge = document.getElementById(`what-if-${field}`);
            if (badge) badge.className = 'what-if-badge';
            delete _badgeTimeouts[field];
        }, 2000);
        state.prevRiskPct = null;
        state.activeField = null;
    };

    const onValueChange = (field) => {
        const slider = document.getElementById(`${field}-slider`);
        const input  = document.getElementById(`${field}-value`);
        if (!slider || !input) return;

        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const step = parseFloat(slider.step) || 1;
        let val = parseFloat(input.value);
        if (!isFinite(val)) val = min;
        val = DRC.UIHelpers.clampAndRound(val, min, max, step);
        input.value  = val;
        slider.value = val;

        UI().updateSliderFill(field);
        calculate();
    };

    // ─── Unit toggle ────────────────────────────────────────────────────

    const modelAllowsUnitConversion = (model = getActiveModel()) => {
        const fields = model?.fields || [];
        return CFG.CONVERTIBLE_FIELDS.some(field => fields.includes(field));
    };

    const updateUnitToggleAvailability = () => {
        const allowed = modelAllowsUnitConversion();
        ['lab-unit-toggle-row', 'settings-unit-option'].forEach(id => {
            const row = document.getElementById(id);
            if (row) row.hidden = !allowed;
        });
        ['unit-toggle', 'lab-unit-toggle'].forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) toggle.disabled = !allowed;
        });
        if (!allowed && state.isMetric) {
            setUnitMode(false);
        }
    };

    const setUnitMode = (isMetric) => {
        const prev = state.isMetric;
        state.isMetric = Boolean(isMetric);
        ['unit-toggle', 'lab-unit-toggle'].forEach(id => {
            const toggle = document.getElementById(id);
            if (!toggle) return;
            toggle.checked = state.isMetric;
            toggle.setAttribute('aria-checked', String(state.isMetric));
        });
        if (prev === state.isMetric) return;

        // ISSUE-005: Suppress any calculate() triggered by DOM side-effects
        // (slider auto-clamp, external listeners on unit-toggle, etc.) while
        // we rebuild display values. We render the final state manually below
        // using state.preciseSI as the lossless source of truth.
        state._suppressRecalc = true;
        try {
            _performToggleUnits();
        } finally {
            state._suppressRecalc = false;
        }
    };

    const onToggleUnits = (e) => {
        if (!modelAllowsUnitConversion()) return;
        setUnitMode(e?.target?.checked ?? !state.isMetric);
    };

    const _performToggleUnits = () => {
        // ── Rounding-drift prevention ──────────────────────────────────
        // Convert slider values FROM the stored precise SI values rather
        // than from the (rounded) DOM values. This eliminates cumulative
        // rounding errors that occur when converting back and forth:
        //   US 100 mg/dL → SI 5.6 (rounded) → US 100.8 (drift!)
        // By always starting from precise SI, the conversion is:
        //   preciseSI 5.5556 → US: 5.5556 / (1/18) = 100.0 (exact)
        //   preciseSI 5.5556 → SI: 5.5556 → display 5.6 (only display rounds)

        UI().updateUnitLabels(state.isMetric);
        UI().updateSliderRanges(state.isMetric ? 'si' : 'us');

        // Convert each convertible field from precise SI to target unit
        if (state.preciseSI) {
            const mode = state.isMetric ? 'si' : 'us';
            CFG.CONVERTIBLE_FIELDS.forEach(f => {
                const siVal = state.preciseSI[f];
                if (siVal == null) return;
                // Convert from SI to target display unit
                // When in SI mode: use siVal directly (just clamp/round)
                // When in US mode: convert from SI to US
                const converted = state.isMetric
                    ? DRC.ConversionService.convertField(f, siVal, true)
                    : siVal;
                const [min, max, step] = CFG.RANGES[f][mode];
                const display = DRC.UIHelpers.clampAndRound(converted, min, max, step);
                const input  = document.getElementById(`${f}-value`);
                const slider = document.getElementById(`${f}-slider`);
                if (input)  input.value  = display;
                if (slider) slider.value = display;
            });
        }

        UI().updateAllSliderFills();

        // Render with precise SI values (no rounding in the model path)
        const activeModel   = getActiveModel();
        const preciseSI     = state.preciseSI || Model().toSI(UI().readInputs(), state.isMetric);
        const _riskToggle = Model().computeProbability(preciseSI, activeModel);
        const riskPctCurrent = (_riskToggle != null && isFinite(_riskToggle)) ? _riskToggle * 100 : NaN;

        // Recompute "original" (pre-simulation) risk from the same lossless
        // preciseSI source, converting simulation originals from display to SI.
        const siValsOriginal  = _getOriginalSI(preciseSI);
        const _riskOrigToggle = Model().computeProbability(siValsOriginal, activeModel);
        const riskPctOriginal = (_riskOrigToggle != null && isFinite(_riskOrigToggle)) ? _riskOrigToggle * 100 : NaN;
        const _riskBaseToggle = Model().computeProbability(_getAgeSexBaseSI(preciseSI), activeModel);
        const riskPctBase = (_riskBaseToggle != null && isFinite(_riskBaseToggle)) ? _riskBaseToggle * 100 : NaN;

        const logOddsContributions = Model().computeContributions(preciseSI, activeModel);
        const marginalSummary = Model().computeMarginalSummary(preciseSI, activeModel);
        const additiveContributions = Model().computeAdditiveContributions(preciseSI, _getAgeSexBaseSI(preciseSI), activeModel);
        if (marginalSummary) {
            marginalSummary.whatIfContributions = { ...marginalSummary.contributions };
            marginalSummary.additiveContributions = additiveContributions;
            marginalSummary.contributions = additiveContributions;
            marginalSummary.pBaseline = _riskBaseToggle;
            marginalSummary.netDeviation = (_riskOrigToggle ?? NaN) - (_riskBaseToggle ?? NaN);
            marginalSummary.sumMarginals = Object.values(additiveContributions).reduce((a, b) => a + b, 0);
        }
        const sexIsMale = preciseSI.sex === 1;
        const treatStatus   = Model().getElevatedFactors(preciseSI, sexIsMale);

        _renderAllViews(riskPctOriginal, riskPctCurrent, riskPctBase, logOddsContributions, marginalSummary, treatStatus, preciseSI, activeModel);
    };

    // ─── Reset ──────────────────────────────────────────────────────────

    /**
     * Reset all inputs to the active patient's saved values, or to
     * CONFIG.DEFAULTS if no patient is loaded. This allows patients to
     * undo exploratory what-if changes and return to their saved baseline.
     *
     * Design rationale: Resetting to the active patient's values (rather
     * than fixed defaults) supports the EID principle of situation-specific
     * reference points (Vicente, 1999), enabling meaningful before/after
     * comparisons within a patient's clinical context.
     */
    const onReset = async () => {
        if (DRC.ProfileWarning) {
            const shouldProceed = await DRC.ProfileWarning.checkBeforeReset();
            if (!shouldProceed) return;
        }

        const patientData = DRC.PatientManager?.getActivePatientData?.();
        const D = CFG.DEFAULTS;

        const setField = (field, val) => {
            const slider = document.getElementById(`${field}-slider`);
            const input  = document.getElementById(`${field}-value`);
            if (slider) slider.value = val;
            if (input)  input.value  = val;
        };

        if (patientData) {
            // Reset to active patient's saved values — applyValues handles unit conversion
            DRC.PatientManager.applyValues(patientData);
        } else {
            // No active patient: fall back to CONFIG defaults (US units)
            const unitToggle = document.getElementById('unit-toggle');
            unitToggle.checked = false;
            unitToggle.setAttribute('aria-checked', 'false');
            state.isMetric = false;
            UI().updateUnitLabels(false);
            UI().updateSliderRanges('us');

            setField('age', D.age);
            setField('sbp', D.sbp);
            setField('cholHDL', D.cholHDL.us);
            setField('totalChol', D.totalChol.us);

            document.getElementById('sex-toggle').checked        = true; // Default: Male
            document.getElementById('sex-toggle').setAttribute('aria-checked', 'true');
            document.getElementById('sex-toggle').setAttribute('aria-label', 'Sex: Male');
            document.getElementById('trtBp-toggle').checked = D.trtBp;
            document.getElementById('trtBp-toggle').setAttribute('aria-checked', String(D.trtBp));
            document.getElementById('trtBp-toggle').setAttribute('aria-label', D.trtBp ? 'Treatment for hypertension: Yes' : 'Treatment for hypertension: No');
            document.getElementById('smoking-toggle').checked = D.smoking;
            document.getElementById('smoking-toggle').setAttribute('aria-checked', String(D.smoking));
            document.getElementById('smoking-toggle').setAttribute('aria-label', D.smoking ? 'Smoking: Yes' : 'Smoking: No');
            document.getElementById('diabetes-toggle').checked = D.diabetes;
            document.getElementById('diabetes-toggle').setAttribute('aria-checked', String(D.diabetes));
            document.getElementById('diabetes-toggle').setAttribute('aria-label', D.diabetes ? 'Diabetes: Yes' : 'Diabetes: No');
        }

        CFG.SLIDER_FIELDS.forEach(f => {
            const badge = document.getElementById(`what-if-${f}`);
            if (badge) badge.className = 'what-if-badge';
        });

        UI().updateAllSliderFills();
        if (DRC.TreatmentSimulator?.resetSimulated) DRC.TreatmentSimulator.resetSimulated();
        calculate();
    };

    // ─── Initialization ─────────────────────────────────────────────────

    const init = () => {
        // Initialize i18n first (synchronous for file:// compatibility)
        DRC.I18n.init();
        DRC.I18n.translateDOM();
        DRC.I18nUI.init();
        // Slider event binding
        CFG.SLIDER_FIELDS.forEach(field => {
            const slider = document.getElementById(`${field}-slider`);
            if (!slider) return;
            slider.addEventListener('input',      () => onSliderInput(field));
            slider.addEventListener('mousedown',  () => onSliderStart(field));
            slider.addEventListener('touchstart', () => onSliderStart(field), { passive: true });
            slider.addEventListener('mouseup',    () => onSliderEnd(field));
            slider.addEventListener('touchend',   () => onSliderEnd(field));
        });

        // Value input change binding
        CFG.SLIDER_FIELDS.forEach(field => {
            const input = document.getElementById(`${field}-value`);
            if (input) input.addEventListener('change', () => onValueChange(field));
        });

        // Toggle inputs
        ['trtBp-toggle', 'smoking-toggle', 'diabetes-toggle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => {
                el.setAttribute('aria-checked', String(el.checked));
                const labels = {
                    'trtBp-toggle': 'Treatment for hypertension',
                    'smoking-toggle': 'Smoking',
                    'diabetes-toggle': 'Diabetes'
                };
                el.setAttribute('aria-label', `${labels[id]}: ${el.checked ? 'Yes' : 'No'}`);
                calculate();
            });
        });

        // Sex toggle
        const sexToggle = document.getElementById('sex-toggle');
        if (sexToggle) sexToggle.addEventListener('change', () => {
            const isMale = sexToggle.checked;
            sexToggle.setAttribute('aria-checked', String(isMale));
            // WCAG 4.1.2: aria-label must convey current state meaning
            sexToggle.setAttribute('aria-label', isMale ? 'Sex: Male' : 'Sex: Female');
            calculate();
        });

        // Unit toggle
        ['unit-toggle', 'lab-unit-toggle'].forEach(id => {
            const unitToggle = document.getElementById(id);
            if (unitToggle) unitToggle.addEventListener('change', onToggleUnits);
        });
        updateUnitToggleAvailability();
        window.addEventListener('model:changed', updateUnitToggleAvailability);

        // Action buttons
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) resetBtn.addEventListener('click', onReset);

        // ISSUE-004: Dynamic reset-button label — reflects whether clicking
        // restores an active patient's saved values or CONFIG.DEFAULTS.
        const updateResetLabel = () => {
            if (!resetBtn) return;
            const t = DRC.Utils.createTranslator();
            const hasProfile = !!DRC.PatientManager?.getActivePatientData?.();
            const key = hasProfile ? 'nav.restoreProfile' : 'nav.resetDefaults';
            const fallback = hasProfile ? 'Restore profile values' : 'Reset to defaults';
            const label = t(key, fallback);
            resetBtn.setAttribute('aria-label', label);
            resetBtn.setAttribute('title', label);
        };
        updateResetLabel();
        // Re-evaluate when a profile is loaded (loadPatient triggers risk:recalculate)
        on('risk:recalculate', updateResetLabel);
        // Re-evaluate on language change so translated labels stay current
        if (DRC.I18n?.onLanguageChange) DRC.I18n.onLanguageChange(updateResetLabel);
        // Cheap safety net for add/delete/rename paths that don't fire risk:recalculate:
        // re-check right when the button is about to be used.
        if (resetBtn) {
            resetBtn.addEventListener('mouseenter', updateResetLabel);
            resetBtn.addEventListener('focus', updateResetLabel);
        }

        // Hero expandable toggle
        const expandHeroBtn = document.getElementById('expandHeroBtn');
        const heroExpandable = document.getElementById('hero-expandable');
        if (expandHeroBtn && heroExpandable) {
            expandHeroBtn.addEventListener('click', () => {
                const isOpen = heroExpandable.classList.toggle('open');
                expandHeroBtn.classList.toggle('open', isOpen);
                expandHeroBtn.setAttribute('aria-expanded', isOpen);
            });
        }

        // Cross-panel factor highlight on hover (CSS-based with JS synchronization)
        // Initial population
        populateFieldCache();

        // Event delegation on main panels for cross-panel highlighting
        // Uses mouseenter/mouseleave (fire once per element, NOT on every mouse move)
        const panels = ['panel-input', 'panel-model', 'panel-treatment'];
        panels.forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (!panel) return;

            panel.addEventListener('mouseenter', (e) => {
                const fieldEl = e.target.closest('[data-field]');
                if (!fieldEl) return;
                const field = fieldEl.getAttribute('data-field');
                if (field === _highlightedField) return;

                _highlightedField = field;

                // Add highlight class to all matching elements (cross-panel sync)
                const elements = fieldElementCache.get(field);
                if (elements) {
                    elements.forEach(n => n.classList.add('factor-highlight'));
                }
            }, true); // Use capture for reliable detection

            panel.addEventListener('mouseleave', (e) => {
                const fieldEl = e.target.closest('[data-field]');
                if (!fieldEl) return;
                const field = fieldEl.getAttribute('data-field');
                if (field !== _highlightedField) return;

                // Remove highlight from all elements
                const elements = fieldElementCache.get(field);
                if (elements) {
                    elements.forEach(n => n.classList.remove('factor-highlight'));
                }

                _highlightedField = null;
            }, true); // Use capture for reliable detection
        });

        // Collapsible sections
        document.querySelectorAll('.section-collapse-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const target = document.getElementById(targetId);
                if (!target) return;
                const collapsed = target.classList.toggle('collapsed');
                btn.classList.toggle('collapsed', collapsed);
                btn.setAttribute('aria-expanded', String(!collapsed));
                if (targetId === 'non-mod-section') {
                    document.getElementById('non-mod-summary')?.classList.toggle('visible', collapsed);
                }
                if (targetId === 'mod-section') {
                    document.getElementById('mod-summary')?.classList.toggle('visible', collapsed);
                }
            });
        });

        // Panel-level collapse buttons
        document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panelId = btn.getAttribute('data-panel');
                const panel = document.getElementById(panelId);
                if (!panel) return;
                const body = panel.querySelector('.panel-body');
                const subtitle = panel.querySelector('.panel-subtitle');
                const isCollapsed = btn.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!isCollapsed));
                if (body) body.classList.toggle('panel-hidden', isCollapsed);
                if (subtitle) subtitle.classList.toggle('panel-hidden', isCollapsed);
            });
        });

        // ─── Model Change Handler ─────────────────────────────────────────
        // Update UI when model changes (from Settings Panel)
        on('model:changed', ({ modelId, model }) => {
            const t = DRC.Utils.createTranslator();

            // Update hero model info
            const infoName = document.getElementById('model-info-name');
            const infoAccuracy = document.getElementById('model-info-accuracy');
            if (infoName) infoName.textContent = t('models.' + modelId + '.name', model.name);
            if (infoAccuracy) infoAccuracy.textContent = t('models.accuracy.' + model.accuracy, model.accuracyLabel) + ' ' + t('models.accuracyLabel', 'Vorhersagegüte');

            // Toggle input field visibility
            const allFields = CFG.ALL_FIELDS;
            allFields.forEach(field => {
                const groups = document.querySelectorAll('.input-group[data-field="' + field + '"]');
                const isVisible = model.fields.includes(field);
                groups.forEach(g => g.classList.toggle('field-hidden', !isVisible));
            });
        });

        // Set initial hero info from default model
        const initialModel = getActiveModel();
        if (initialModel) {
            const t = DRC.Utils.createTranslator();
            const infoName = document.getElementById('model-info-name');
            const infoAccuracy = document.getElementById('model-info-accuracy');
            if (infoName) infoName.textContent = t('models.' + state.activeModel + '.name', initialModel.name);
            if (infoAccuracy) infoAccuracy.textContent = t('models.accuracy.' + initialModel.accuracy, initialModel.accuracyLabel) + ' ' + t('models.accuracyLabel', 'Vorhersagegüte');
        }

        // Initialize sub-modules and run first calculation
        UI().updateAllSliderFills();
        calculate();

        // Subscribe to language changes to re-render dynamic content
        DRC.I18n.onLanguageChange(() => {
            DRC.I18n.translateDOM();
            calculate();
            // Update model switcher label and hero info with translated strings
            const currentModel = getActiveModel();
            if (currentModel) {
                const t = DRC.Utils.createTranslator();
                // Update hero model info (Settings Panel updates its own label)
                const infoName = document.getElementById('model-info-name');
                const infoAccuracy = document.getElementById('model-info-accuracy');
                if (infoName) infoName.textContent = t('models.' + state.activeModel + '.name', currentModel.name);
                if (infoAccuracy) infoAccuracy.textContent = t('models.accuracy.' + currentModel.accuracy, currentModel.accuracyLabel) + ' ' + t('models.accuracyLabel', 'Vorhersagegüte');
            }
            // Trigger global language changed event for other modules
            window.dispatchEvent(new CustomEvent('drc:language-changed-complete'));
        });
    };

    /**
     * Simple event bus for decoupled communication between modules.
     * Replaces direct method calls like DRC.App._calculate().
     */
    const eventListeners = Object.create(null); // No prototype chain lookups

    /**
     * Register an event listener.
     * @param {string} event — Event name.
     * @param {Function} callback — Callback function.
     * @returns {Function} Unsubscribe function to remove the listener.
     */
    const on = (event, callback) => {
        if (typeof callback !== 'function') {
            console.error(`Event listener for "${event}" must be a function, got ${typeof callback}`);
            return () => {};
        }
        // Reject prototype pollution keys
        if (event === '__proto__' || event === 'constructor' || event === 'prototype') {
            console.error(`Invalid event name: "${event}"`);
            return () => {};
        }
        if (!eventListeners[event]) eventListeners[event] = [];
        eventListeners[event].push(callback);

        // Return unsubscribe function
        return () => off(event, callback);
    };

    /**
     * Remove an event listener.
     * @param {string} event — Event name.
     * @param {Function} callback — Callback function to remove.
     */
    const off = (event, callback) => {
        if (!eventListeners[event]) return;
        eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
        // Clean up empty arrays
        if (eventListeners[event].length === 0) {
            delete eventListeners[event];
        }
    };

    /**
     * Trigger an event with optional data.
     * @param {string} event — Event name.
     * @param {*} data — Data to pass to listeners.
     */
    const trigger = (event, data) => {
        if (!eventListeners[event]) return;
        eventListeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error(`Error in event listener for "${event}":`, err);
            }
        });
    };

    // Register core events
    on('risk:recalculate', calculate);

    return { init, _calculate: calculate, _getState: () => ({ ...state }), on, off, trigger, switchModel, getActiveModel };
})();

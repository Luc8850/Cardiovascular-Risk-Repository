/**
 * @fileoverview Treatment Simulator — evidence-based animated interventions.
 *
 * Animates slider values toward clinically-derived treatment targets using
 * ease-out cubic interpolation. Supports reversing a simulation via
 * `unsimulate(factor)`, which restores the original (pre-simulation)
 * slider value.
 *
 * EID mapping: Knowledge-Based Behavior (KBB) — users explore causal
 * treatment effects on the model outcome through interactive simulation.
 *
 * Evidence sources documented in CONFIG.SIMULATION_EFFECTS and the
 * accompanying Designdokumentation_V3.7_Treatment_Simulation.docx.
 *
 * @module TreatmentSimulator
 * @memberof DRC
 */

'use strict';

DRC.TreatmentSimulator = (() => {
    const CFG = DRC.CONFIG;
    let _animating = false;
    /** @type {Map<string, number>} factor → original pre-simulation slider value (display unit) */
    const _simulated = new Map();
    /** @type {Object<string, {value: number, isMetric: boolean}>} Authoritative pre-simulation snapshot keyed by factor. */
    const _preSimulationValues = {};
    let _animationTimeoutId = null;

    /**
     * Resolve the pre-simulation value for a factor in the current display unit.
     * Uses the snapshot (with unit metadata) when available; falls back to the
     * legacy _simulated map value.
     * @param {string} factor
     * @returns {number|null}
     */
    const _resolveSnapshotValue = (factor) => {
        const snap = _preSimulationValues[factor];
        if (!snap) return _simulated.get(factor) ?? null;
        const currentIsMetric = DRC.UIController.getUnitToggleState();
        let val = snap.value;
        if (snap.isMetric !== currentIsMetric && DRC.CONFIG.CONVERTIBLE_FIELDS.includes(factor)) {
            const siVal = snap.isMetric ? val : DRC.ConversionService.convertField(factor, val, true);
            val = currentIsMetric ? siVal : DRC.ConversionService.convertField(factor, siVal, false);
        }
        return val;
    };

    /**
     * Get the unit-appropriate treatment delta for a factor.
     * Supports sex-dependent effects (e.g. sbp with siMale/siFemale keys).
     * @param {string} factor — Risk factor key.
     * @returns {number} Expected change in current unit system.
     */
    const getEffectDelta = (factor) => {
        const fx = DRC.CONFIG.SIMULATION_EFFECTS[factor];
        if (!fx) return 0;
        if (fx.binary) return fx.target ?? 0;
        const isMetric = DRC.UIController.getUnitToggleState();
        if (fx.siMale !== undefined) {
            const isMale = DRC.UIController.readInputs().sex === 1;
            if (isMetric) return isMale ? fx.siMale : fx.siFemale;
            return isMale ? fx.usMale : fx.usFemale;
        }
        return isMetric ? fx.si : fx.us;
    };

    const _targetFromConfig = (factor) => {
        const fx = DRC.CONFIG.SIMULATION_EFFECTS[factor];
        if (!fx) return null;
        if (fx.binary) return fx.target ?? 0;
        const isMetric = DRC.UIController.getUnitToggleState();
        const target = isMetric ? fx.targetSi : fx.targetUs;
        return target == null ? null : target;
    };

    /**
     * Compute the target slider value after treatment, clamped to range.
     * @param {string} factor — Risk factor key.
     * @returns {{ currentVal: number, targetVal: number, step: number, decimals: number }|null}
     */
    const computeTarget = (factor) => {
        const fx = DRC.CONFIG.SIMULATION_EFFECTS[factor];
        if (fx?.binary) {
            const currentInputs = DRC.UIController.readInputs();
            const currentVal = currentInputs[factor] ? 1 : 0;
            return { currentVal, targetVal: fx.target ?? 0, step: 1, decimals: 0, isBinary: true };
        }

        const { input, slider } = DRC.UIController.getSliderElements(factor);
        if (!input || !slider) return null;

        const current = parseFloat(input.value);
        const configuredTarget = _targetFromConfig(factor);
        const raw     = configuredTarget == null
            ? current + getEffectDelta(factor)
            : (configuredTarget > current ? Math.max(current, configuredTarget) : Math.min(current, configuredTarget));
        const min     = parseFloat(slider.min);
        const max     = parseFloat(slider.max);
        const step    = parseFloat(slider.step) || 1;
        const clamped = DRC.UIHelpers.clampAndRound(raw, min, max, step);
        const decimals = step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)));

        return { currentVal: current, targetVal: clamped, step, decimals };
    };

    const _setBinaryFactor = (factor, value) => {
        const toggle = document.getElementById(`${factor}-toggle`);
        if (!toggle) return;

        const checked = Boolean(value);
        toggle.checked = checked;
        toggle.setAttribute('aria-checked', String(checked));

        const label = factor === 'smoking' ? 'Smoking' : factor;
        toggle.setAttribute('aria-label', `${label}: ${checked ? 'Yes' : 'No'}`);
    };

    /** Ease-out cubic interpolation: t in [0,1] → decelerated output. */
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    /**
     * Animate a slider from its current value to a target value.
     * @param {string} factor — Risk factor key
     * @param {number} currentVal — Starting value
     * @param {number} targetVal — End value
     * @param {number} decimals — Number of decimal places
     * @param {Function} onFinish — Callback when animation completes
     */
    const _enableSimButtons = () => {
        document.querySelectorAll('.btn-simulate-treatment, .btn-undo-treatment').forEach(b => b.disabled = false);
    };

    const animateTo = (factor, currentVal, targetVal, decimals, onFinish) => {
        if (currentVal === targetVal) {
            onFinish();
            return;
        }
        _animating = true;
        document.querySelectorAll('.btn-simulate-treatment, .btn-undo-treatment').forEach(b => b.disabled = true);

        let frame = 0;
        const tick = () => {
            frame++;
            const progress     = easeOutCubic(frame / CFG.ANIMATION_STEPS);
            const interpolated = currentVal + (targetVal - currentVal) * progress;
            const isLast = frame >= CFG.ANIMATION_STEPS;
            // Snap the final frame to targetVal exactly to avoid float-rounding drift
            // (e.g. an Undo animating to 120 must land on 120, not 119.9 or 120.1).
            const val = isLast ? targetVal : parseFloat(interpolated.toFixed(decimals));

            const { input, slider } = DRC.UIController.getSliderElements(factor);
            if (input)  input.value  = val;
            if (slider) slider.value = val;
            DRC.UIController.updateSliderFill(factor);
            DRC.App.trigger('risk:recalculate');

            if (!isLast) {
                const timeoutId = setTimeout(tick, CFG.ANIMATION_DURATION / CFG.ANIMATION_STEPS);
                _animationTimeoutId = timeoutId;
            } else {
                _animationTimeoutId = null;
                _animating = false;
                _enableSimButtons();
                onFinish();
            }
        };
        tick();
    };

    /**
     * Run treatment simulation for one factor.
     * @param {string} factor — Risk factor key (e.g. 'fastGlu', 'sbp').
     */
    const simulate = (factor) => {
        if (_animating) return;
        if (_simulated.has(factor)) return;
        const info = computeTarget(factor);
        if (!info || info.currentVal === info.targetVal) return;

        const { currentVal, targetVal, decimals, isBinary } = info;
        const origVal = currentVal;

        // Store BEFORE animation so getOriginalValues() can return the pre-simulation
        // value during animation — this keeps renderRisk() (main risk) stable while
        // renderChosenRisk() shows the animated reduction in real-time.
        _simulated.set(factor, origVal);
        _preSimulationValues[factor] = { value: origVal, isMetric: DRC.UIController.getUnitToggleState() };

        // M6: Add aria-label to indicate simulated state
        const t = DRC.Utils.createTranslator();
        const simulatedSuffix = t('aria.simulatedSlider', '(simulated)');
        const { input: simInput, slider: simSlider } = DRC.UIController.getSliderElements(factor);
        if (simInput) {
            simInput.dataset.original = String(origVal);
            simInput.classList.add('slider--simulated');
            simInput.dataset.originalAriaLabel = simInput.getAttribute('aria-label') || '';
            const base = simInput.dataset.originalAriaLabel;
            simInput.setAttribute('aria-label', (base ? base + ' ' : '') + simulatedSuffix);
        }
        if (simSlider) {
            simSlider.classList.add('slider--simulated');
            simSlider.dataset.originalAriaLabel = simSlider.getAttribute('aria-label') || '';
            const base = simSlider.dataset.originalAriaLabel;
            simSlider.setAttribute('aria-label', (base ? base + ' ' : '') + simulatedSuffix);
        }

        if (isBinary) {
            _setBinaryFactor(factor, targetVal);
            onSimulationComplete(factor);
            return;
        }

        animateTo(factor, currentVal, targetVal, decimals, () => {
            onSimulationComplete(factor);
        });
    };

    /**
     * Compute the isolated risk reduction attributable to a single simulated factor.
     * Computes: risk_without_this_treatment - risk_with_all_treatments.
     * Positive result = this treatment reduced the risk.
     * @param {string} factor — Simulated factor key.
     * @returns {number} Risk reduction in percentage points.
     */
    const getIndividualReduction = (factor) => {
        if (!_simulated.has(factor)) return 0;
        const origVal = _resolveSnapshotValue(factor);
        const isMetric = DRC.UIController.getUnitToggleState();
        const currentInputs = DRC.UIController.readInputs();
        const activeModel = DRC.App?.getActiveModel?.();

        const siWith = DRC.RiskModel.toSI(currentInputs, isMetric);
        const _riskWith = DRC.RiskModel.computeProbability(siWith, activeModel);
        const riskWith = (_riskWith != null && isFinite(_riskWith)) ? _riskWith * 100 : NaN;

        const inputsWithout = { ...currentInputs, [factor]: origVal };
        const siWithout = DRC.RiskModel.toSI(inputsWithout, isMetric);
        const _riskWithout = DRC.RiskModel.computeProbability(siWithout, activeModel);
        const riskWithout = (_riskWithout != null && isFinite(_riskWithout)) ? _riskWithout * 100 : NaN;

        return riskWithout - riskWith;
    };

    const computePotentialReduction = (factor) => {
        const info = computeTarget(factor);
        if (!info || info.currentVal === info.targetVal) return 0;

        const isMetric = DRC.UIController.getUnitToggleState();
        const currentInputs = DRC.UIController.readInputs();
        const activeModel = DRC.App?.getActiveModel?.();

        const siBefore = DRC.RiskModel.toSI(currentInputs, isMetric);
        const _riskBefore = DRC.RiskModel.computeProbability(siBefore, activeModel);
        const riskBefore = (_riskBefore != null && isFinite(_riskBefore)) ? _riskBefore * 100 : NaN;

        const inputsAfter = { ...currentInputs, [factor]: info.targetVal };
        const siAfter = DRC.RiskModel.toSI(inputsAfter, isMetric);
        const _riskAfter = DRC.RiskModel.computeProbability(siAfter, activeModel);
        const riskAfter = (_riskAfter != null && isFinite(_riskAfter)) ? _riskAfter * 100 : NaN;

        return riskBefore - riskAfter;
    };

    /**
     * Clear simulation visuals (CSS class, aria-label) from a factor's DOM elements.
     * @param {string} factor
     */
    const _clearSimulationVisuals = (factor) => {
        const { input, slider } = DRC.UIController.getSliderElements(factor);
        if (input) {
            input.classList.remove('slider--simulated');
            delete input.dataset.original;
            if (input.dataset.originalAriaLabel != null) {
                if (input.dataset.originalAriaLabel) {
                    input.setAttribute('aria-label', input.dataset.originalAriaLabel);
                } else {
                    input.removeAttribute('aria-label');
                }
                delete input.dataset.originalAriaLabel;
            }
        }
        if (slider) {
            slider.classList.remove('slider--simulated');
            if (slider.dataset.originalAriaLabel != null) {
                if (slider.dataset.originalAriaLabel) {
                    slider.setAttribute('aria-label', slider.dataset.originalAriaLabel);
                } else {
                    slider.removeAttribute('aria-label');
                }
                delete slider.dataset.originalAriaLabel;
            }
        }
        delete _preSimulationValues[factor];
    };

    const unsimulate = (factor) => {
        if (_animating) return;
        if (!_simulated.has(factor)) return;

        const origVal = _resolveSnapshotValue(factor);
        const { input, slider } = DRC.UIController.getSliderElements(factor);
        const fx = DRC.CONFIG.SIMULATION_EFFECTS[factor];
        if (fx?.binary) {
            if (origVal == null) return;
            _setBinaryFactor(factor, origVal);
            _simulated.delete(factor);
            _clearSimulationVisuals(factor);
            onSimulationComplete(factor);
            return;
        }
        if (!input || !slider || origVal == null) return;

        const currentVal = parseFloat(input.value);
        const step = parseFloat(slider.step) || 1;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const decimals = step >= 1 ? 0 : Math.max(0, -Math.floor(Math.log10(step)));
        const alignedOrig = DRC.UIHelpers.clampAndRound(origVal, min, max, step);

        animateTo(factor, currentVal, alignedOrig, decimals, () => {
            input.value  = alignedOrig;
            slider.value = alignedOrig;
            _simulated.delete(factor);
            _clearSimulationVisuals(factor);
            onSimulationComplete(factor);
        });
    };

    /** Cancel any running animation and snap sliders back to original values. */
    const cancel = () => {
        if (_animationTimeoutId) {
            clearTimeout(_animationTimeoutId);
            _animationTimeoutId = null;
        }
        // Snap any animating sliders to their pre-simulation values
        _simulated.forEach((legacyOrig, factor) => {
            const origVal = _resolveSnapshotValue(factor) ?? legacyOrig;
            const { input, slider } = DRC.UIController.getSliderElements(factor);
            const fx = DRC.CONFIG.SIMULATION_EFFECTS[factor];
            if (fx?.binary) {
                _setBinaryFactor(factor, origVal);
            } else if (slider) {
                const step = parseFloat(slider.step) || 1;
                const min = parseFloat(slider.min);
                const max = parseFloat(slider.max);
                const aligned = DRC.UIHelpers.clampAndRound(origVal, min, max, step);
                if (input)  input.value  = aligned;
                slider.value = aligned;
            } else if (input) {
                input.value = origVal;
            }
            DRC.UIController.updateSliderFill(factor);
            _clearSimulationVisuals(factor);
        });
        _simulated.clear();
        _animating = false;
        _enableSimButtons();
    };

    /**
     * Re-run a simulation: instantly restores the slider to its pre-simulation
     * value, then re-animates to the treatment target. Useful when the user
     * wants to refresh the effect against a changed baseline.
     * @param {string} factor — Risk factor key
     */
    const resimulate = (factor) => {
        if (_animating) return;
        if (!_simulated.has(factor)) return;

        const origVal = _resolveSnapshotValue(factor) ?? _simulated.get(factor);
        const { input, slider } = DRC.UIController.getSliderElements(factor);
        if (!input || !slider) return;

        const step = parseFloat(slider.step) || 1;
        const min = parseFloat(slider.min);
        const max = parseFloat(slider.max);
        const alignedOrig = DRC.UIHelpers.clampAndRound(origVal, min, max, step);

        // Instantly restore to pre-simulation value and clear the simulated state
        input.value = alignedOrig;
        slider.value = alignedOrig;
        DRC.UIController.updateSliderFill(factor);
        _simulated.delete(factor);
        _clearSimulationVisuals(factor);
        DRC.App.trigger('risk:recalculate');

        // Re-run simulation from the restored baseline
        simulate(factor);
    };

    /**
     * Post-simulation/unsimulation UI updates: flash row, recompute risk.
     * Card states (reduction pill, button) are handled by renderTreatmentOverview
     * which is triggered via risk:recalculate.
     * @param {string} factor
     */
    const onSimulationComplete = (factor) => {
        // Flash completion animation for feedback
        const row = document.querySelector(`.treatment-overview-row[data-field="${factor}"]`);
        if (row) {
            row.classList.add('sim-complete');
            setTimeout(() => row.classList.remove('sim-complete'), CFG.ANIMATION_FLASH_MS);
        }

        // Trigger recalculation — renderTreatmentOverview re-renders all card states
        DRC.App.trigger('risk:recalculate');
        DRC.UIHelpers.refreshIcons();
    };

    return {
        simulate,
        unsimulate,
        resimulate,
        resetSimulated: () => {
            cancel();
            _simulated.clear();
            Object.keys(_preSimulationValues).forEach(k => delete _preSimulationValues[k]);
        },
        cancel,
        /** True if any factor currently has an active simulation snapshot. */
        hasActiveSimulation: () => _simulated.size > 0,
        /** Return the pre-simulation snapshot map (keyed by factor) for save guards. */
        getPreSimulationSnapshot: () => ({ ..._preSimulationValues }),
        /**
         * Whether an animation is currently in progress.
         * Used by App to skip heavy DOM rebuilds during animation ticks.
         */
        isAnimating: () => _animating,
        /**
         * Whether any treatment simulation is currently active.
         */
        hasActiveSimulation: () => _simulated.size > 0,
        /**
         * Return the pre-simulation snapshot (factor → {value, isMetric}).
         * Used by PatientManager to resolve original values when saving.
         */
        getPreSimulationSnapshot: () => ({ ..._preSimulationValues }),
        /**
         * Return a plain object of {factor: originalValue} for factors
         * that have been simulated (used by App to compute the
         * pre-simulation "Your Risk" value).
         */
        getOriginalValues: () => {
            const obj = {};
            _simulated.forEach((val, key) => { obj[key] = val; });
            return obj;
        },
        /**
         * Return an array of factor keys that are currently simulated.
         * Used by the UI to render the "Chosen Treatments" list.
         */
        getSimulatedFactors: () => Array.from(_simulated.keys()),
        /**
         * Compute isolated risk reduction for a single simulated factor.
         * @param {string} factor — Simulated factor key.
         * @returns {number} Risk reduction in percentage points (positive = reduced).
         */
        getIndividualReduction,
        computePotentialReduction,
        /**
         * Get the unit-appropriate treatment delta for a factor.
         * Supports sex-dependent effects (e.g. sbp with siMale/siFemale keys).
         * @param {string} factor — Risk factor key.
         * @returns {number} Expected change in current unit system.
         */
        getEffectDelta
    };
})();

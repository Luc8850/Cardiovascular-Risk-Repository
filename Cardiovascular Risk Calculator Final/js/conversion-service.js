/**
 * @fileoverview Conversion Service — centralized unit conversion logic.
 *
 * Handles all conversions between US (imperial) and SI (metric) units
 * for medical measurements. Eliminates DRY violations across the codebase.
 *
 * @module ConversionService
 * @memberof DRC
 */

'use strict';

DRC.ConversionService = (() => {
    const CFG = DRC.CONFIG;

    /** Shared multiplier lookup — single source of truth for all conversions. */
    const _getMultiplier = (field) => {
        const c = CFG.CONVERSIONS;
        return { cholHDL: c.hdlToMmol, totalChol: c.totalCholToMmol }[field] ?? null;
    };

    /**
     * Convert raw input values to SI units.
     * @param {Object} inputs — Object with raw input values
     * @param {boolean} isMetric — Whether inputs are already in metric
     * @returns {Object} New object with values converted to SI
     */
    const toSI = (inputs, isMetric) => {
        if (!isMetric) return { ...inputs };

        const c = CFG.CONVERSIONS;
        return {
            ...inputs,
            cholHDL: inputs.cholHDL / c.hdlToMmol,
            totalChol: inputs.totalChol / c.totalCholToMmol
        };
    };

    /**
     * Convert SI values to display units (US or SI).
     * @param {Object} siVals — Object with SI values
     * @param {boolean} isMetric — Target unit system (true=SI, false=US)
     * @returns {Object} New object with values converted to display units
     */
    const fromSI = (siVals, isMetric) => {
        if (!isMetric) return { ...siVals };

        const c = CFG.CONVERSIONS;
        return {
            ...siVals,
            cholHDL: siVals.cholHDL * c.hdlToMmol,
            totalChol: siVals.totalChol * c.totalCholToMmol
        };
    };

    /**
     * Convert a single field value between unit systems.
     * @param {string} field — Field name (height, waist, fastGlu, cholHDL, cholTri)
     * @param {number} value — Value to convert
     * @param {boolean} toMetric — Direction: true=to SI, false=to US
     * @returns {number} Converted value
     */
    const convertField = (field, value, toMetric) => {
        const multiplier = _getMultiplier(field);
        if (multiplier === null) return value; // No conversion needed for this field
        return toMetric ? value * multiplier : value / multiplier;
    };

    /**
     * Apply converted values to DOM elements with proper clamping.
     * Assumes savedValues contains SI values and converts to the target unit system.
     * @param {Object} siValues — Saved values in SI units
     * @param {boolean} isMetric — Target unit system
     * @param {Object} options — Optional callbacks { onValue, onComplete }
     */
    const applyConvertedValues = (siValues, isMetric, options = {}) => {
        const mode = isMetric ? 'si' : 'us';

        Object.entries(siValues).forEach(([field, siVal]) => {
            // Skip fields that have no slider range (e.g. race, parentHist, _riskPct)
            if (!CFG.RANGES[field]) return;

            let val;
            if (isMetric) {
                const multiplier = _getMultiplier(field);
                val = multiplier ? siVal * multiplier : siVal;
            } else {
                val = siVal;
            }

            const [min, max, step] = CFG.RANGES[field][mode];
            val = DRC.UIHelpers.clampAndRound(val, min, max, step);

            if (options.onValue) {
                options.onValue(field, val);
            }
        });

        if (options.onComplete) {
            options.onComplete();
        }
    };

    /**
     * Get conversion factor for a field.
     * @param {string} field — Field name
     * @returns {number|null} Conversion factor or null
     */
    const getConversionFactor = (field) => _getMultiplier(field);

    return {
        toSI,
        fromSI,
        convertField,
        applyConvertedValues,
        getConversionFactor
    };
})();

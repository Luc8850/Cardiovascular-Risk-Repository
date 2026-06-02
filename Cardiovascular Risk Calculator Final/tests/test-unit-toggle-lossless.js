/**
 * @fileoverview ISSUE-005 regression tests — unit toggle is lossless.
 *
 * Asserts that switching US ↔ SI ↔ US does not drift the computed risk.
 * Simulates the App's toggle logic in a minimal Node.js harness: the actual
 * DOM/event wiring from app.js is not loaded, but the core rule (keep the
 * precise SI source of truth and only round for display) is reproduced.
 *
 * Run with: node tests/test-unit-toggle-lossless.js
 */

'use strict';

// ─── Bootstrap: minimal browser globals ─────────────────────────────
global.window = global;
global.document = { getElementById: () => null };

require('../js/config.js');
require('../js/conversion-service.js');
require('../js/risk-model.js');

// UIHelpers stub providing clampAndRound (same semantics as js/ui-helpers.js)
global.DRC.UIHelpers = {
    clampAndRound: (val, min, max, step) => {
        const clamped = Math.min(Math.max(val, min), max);
        const rounded = Math.round(clamped / step) * step;
        // Normalize float representation to the step precision
        const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
        return parseFloat(rounded.toFixed(decimals));
    }
};

const { CONFIG } = DRC;
const { toSI, computeProbability } = DRC.RiskModel;

// ─── Test harness ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

const assert = (condition, name) => {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else { failed++; console.log(`  ✗ FAIL: ${name}`); }
};

const assertApprox = (actual, expected, tolerance, name) => {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        passed++;
        console.log(`  ✓ ${name} (diff ${diff.toExponential(2)} ≤ ${tolerance})`);
    } else {
        failed++;
        console.log(`  ✗ FAIL: ${name} — diff ${diff.toExponential(4)} exceeds ${tolerance}`);
        console.log(`     actual=${actual}, expected=${expected}`);
    }
};

// ─── Minimal App simulator: mirrors onToggleUnits / _mergePreciseSI ─
const buildApp = () => {
    const state = {
        isMetric: false,
        preciseSI: null,
        _suppressRecalc: false
    };
    // Simulated "DOM" — just a map of field → current display value
    const dom = {};

    const readInputs = () => ({
        age: dom.age, sex: dom.sex, race: dom.race, parentHist: dom.parentHist,
        sbp: dom.sbp, height: dom.height, waist: dom.waist,
        fastGlu: dom.fastGlu, cholHDL: dom.cholHDL, cholTri: dom.cholTri
    });

    const _mergePreciseSI = (previous, current) => {
        if (!previous) return { ...current };
        const merged = { ...current };
        CONFIG.CONVERTIBLE_FIELDS.forEach(f => {
            const prev = previous[f];
            const curr = current[f];
            if (prev == null || curr == null) return;
            const mode = state.isMetric ? 'si' : 'us';
            const range = CONFIG.RANGES[f]?.[mode];
            if (!range) return;
            const step = range[2];
            const stepSI = state.isMetric
                ? step
                : DRC.ConversionService.convertField(f, step, true) -
                  DRC.ConversionService.convertField(f, 0, true);
            const tolerance = Math.abs(stepSI) * 0.5;
            if (Math.abs(curr - prev) <= tolerance) merged[f] = prev;
        });
        return merged;
    };

    const calculate = () => {
        if (state._suppressRecalc) return;
        const raw = readInputs();
        const si = toSI(raw, state.isMetric);
        state.preciseSI = _mergePreciseSI(state.preciseSI, si);
        return computeProbability(state.preciseSI) * 100;
    };

    const onToggleUnits = (newIsMetric) => {
        if (state.isMetric === newIsMetric) return;
        state.isMetric = newIsMetric;
        state._suppressRecalc = true;
        try {
            if (state.preciseSI) {
                const mode = state.isMetric ? 'si' : 'us';
                CONFIG.CONVERTIBLE_FIELDS.forEach(f => {
                    const siVal = state.preciseSI[f];
                    if (siVal == null) return;
                    const converted = state.isMetric
                        ? siVal
                        : DRC.ConversionService.convertField(f, siVal, false);
                    const [min, max, step] = CONFIG.RANGES[f][mode];
                    dom[f] = DRC.UIHelpers.clampAndRound(converted, min, max, step);
                });
            }
            // Stray recalc that ISSUE-005 used to hit — simulate worst case:
            calculate();
        } finally {
            state._suppressRecalc = false;
        }
        // Final risk using preciseSI directly (lossless)
        return computeProbability(state.preciseSI) * 100;
    };

    const setInitial = (raw, isMetric) => {
        Object.assign(dom, raw);
        state.isMetric = isMetric;
        state.preciseSI = null;
        return calculate();
    };

    return { state, dom, readInputs, calculate, onToggleUnits, setInitial };
};

// =====================================================================
// SUITE A: Lossless round-trip from US
// =====================================================================
console.log('\n─── Suite A: US → SI → US round-trip (lossless) ───');
{
    const app = buildApp();
    const riskUS = app.setInitial({
        age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150
    }, false);

    const riskSI = app.onToggleUnits(true);
    assertApprox(riskSI, riskUS, 1e-10, 'US → SI: risk unchanged');

    const riskUS2 = app.onToggleUnits(false);
    assertApprox(riskUS2, riskUS, 1e-10, 'SI → US: risk unchanged');

    // Repeat many toggles — must never drift
    let r = riskUS;
    for (let i = 0; i < 20; i++) {
        r = app.onToggleUnits(i % 2 === 0);
    }
    assertApprox(r, riskUS, 1e-10, '20 successive toggles: risk identical');
}

// =====================================================================
// SUITE B: Lossless round-trip from SI
// =====================================================================
console.log('\n─── Suite B: SI → US → SI round-trip (lossless) ───');
{
    const app = buildApp();
    const riskSI = app.setInitial({
        age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
        height: 168, waist: 97, fastGlu: 5.6, cholHDL: 1.3, cholTri: 1.7
    }, true);

    const riskUS = app.onToggleUnits(false);
    assertApprox(riskUS, riskSI, 1e-10, 'SI → US: risk unchanged');

    const riskSI2 = app.onToggleUnits(true);
    assertApprox(riskSI2, riskSI, 1e-10, 'US → SI: risk unchanged');
}

// =====================================================================
// SUITE C: User edit in SI updates preciseSI losslessly
// =====================================================================
console.log('\n─── Suite C: user edit after toggle is preserved ───');
{
    const app = buildApp();
    app.setInitial({
        age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150
    }, false);
    app.onToggleUnits(true);

    // Simulate user dragging fastGlu slider in SI from 5.6 → 6.2
    app.dom.fastGlu = 6.2;
    const risk = app.calculate();
    // preciseSI.fastGlu must now be exactly 6.2 (not 5.6 from before)
    assertApprox(app.state.preciseSI.fastGlu, 6.2, 1e-12,
        'preciseSI.fastGlu updated to new user value losslessly');

    // Toggle to US and back: value must remain 6.2 (within display rounding)
    app.onToggleUnits(false);
    app.onToggleUnits(true);
    assertApprox(app.state.preciseSI.fastGlu, 6.2, 1e-10,
        'Round-trip after user edit preserves 6.2 mmol/L');
}

// =====================================================================
// SUITE D: Stray calculate() during toggle cannot overwrite preciseSI
// =====================================================================
console.log('\n─── Suite D: re-entrancy guard works ───');
{
    const app = buildApp();
    app.setInitial({
        age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150
    }, false);
    const preciseFastGlu = app.state.preciseSI.fastGlu; // 5.5555...

    // Pre-check: rounding to mg/dL step=1 is exact (100 / (1/18) = 1800 * step)
    // But SI step=0.1 means display 5.6 which drifts if re-toSI'd.
    app.onToggleUnits(true);

    // After toggle, preciseSI.fastGlu should still be the original precise value
    assertApprox(app.state.preciseSI.fastGlu, preciseFastGlu, 1e-12,
        'preciseSI.fastGlu preserved exactly after toggle (not drifted to 5.6)');
}

// =====================================================================
// SUITE E: All seven fastGlu display values in the SI step grid
// =====================================================================
console.log('\n─── Suite E: many starting values round-trip cleanly ───');
{
    const usGlu = [70, 85, 100, 115, 130, 145, 160];
    usGlu.forEach(g => {
        const app = buildApp();
        const r1 = app.setInitial({
            age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
            height: 66, waist: 38, fastGlu: g, cholHDL: 50, cholTri: 150
        }, false);
        const r2 = app.onToggleUnits(true);
        const r3 = app.onToggleUnits(false);
        assertApprox(r2, r1, 1e-10, `fastGlu=${g} mg/dL: US → SI lossless`);
        assertApprox(r3, r1, 1e-10, `fastGlu=${g} mg/dL: SI → US lossless`);
    });
}

// =====================================================================
// SUITE F: ISSUE-006 regression — calculate() after toggle must use
// state.preciseSI (not rounded DOM siValsCurrent) for risk computation.
// Otherwise the displayed risk drifts across unit switches even though
// state.preciseSI itself is preserved.
// =====================================================================
console.log('\n─── Suite F: calculate() after toggle uses preciseSI ───');
{
    const app = buildApp();
    // Pick a glucose value whose US→SI conversion does NOT land on a clean
    // 0.1 mmol/L step: 95 / 18 = 5.2777…, which rounds to display 5.3.
    // Risk from 5.2777 ≠ risk from 5.3. If calculate() used DOM-rounded
    // siValsCurrent, the SI-mode risk would differ from US-mode risk.
    const riskUS = app.setInitial({
        age: 50, sex: 1, race: 0, parentHist: 0, sbp: 120,
        height: 66, waist: 36, fastGlu: 95, cholHDL: 50, cholTri: 150
    }, false);

    app.onToggleUnits(true);
    // Simulate a subsequent calculate() (e.g. from any DOM event post-toggle).
    // Production bug: DOM.fastGlu is rounded to 5.3; if calculate() feeds
    // siValsCurrent (not preciseSI) into computeProbability, drift appears.
    const riskAfterCalc = app.calculate();
    assertApprox(riskAfterCalc, riskUS, 1e-10,
        'Risk after SI-mode calculate() matches original US-mode risk');

    // And the DOM value is the rounded 5.3 — confirming the drift trap exists
    assert(app.dom.fastGlu === 5.3,
        'DOM value is rounded to 5.3 (drift source), but risk is correct');
}

// =====================================================================
// SUITE G: Direct unit tests for _mergePreciseSI logic
// =====================================================================
console.log('\n─── Suite G: _mergePreciseSI direct unit tests ───');
{
    // Extract the _mergePreciseSI logic as a standalone function matching app.js
    const makeMerge = (isMetric) => (previous, current) => {
        if (!previous) return { ...current };
        const merged = { ...current };
        CONFIG.CONVERTIBLE_FIELDS.forEach(f => {
            const prev = previous[f];
            const curr = current[f];
            if (prev == null || curr == null) return;
            const mode = isMetric ? 'si' : 'us';
            const range = CONFIG.RANGES[f]?.[mode];
            if (!range) return;
            const step = range[2];
            const stepSI = isMetric
                ? step
                : DRC.ConversionService.convertField(f, step, true) -
                  DRC.ConversionService.convertField(f, 0, true);
            const MERGE_TOLERANCE_RATIO = 0.5;
            const tolerance = Math.abs(stepSI) * MERGE_TOLERANCE_RATIO;
            if (Math.abs(curr - prev) <= tolerance) merged[f] = prev;
        });
        return merged;
    };

    // G1: When previous is null, return a copy of current
    const mergeUS = makeMerge(false);
    const current = { fastGlu: 5.555, cholHDL: 1.3, cholTri: 1.7, waist: 97, height: 168, sbp: 120 };
    const result = mergeUS(null, current);
    assert(result !== current, 'G1: returns a new object (not same reference)');
    assert(result.fastGlu === current.fastGlu, 'G1: fastGlu copied from current when previous is null');

    // G2: In US mode, difference < half-step keeps previous precise value.
    // fastGlu US step = 1 mg/dL → SI step ≈ 1/18 ≈ 0.0556; half-step ≈ 0.0278.
    // Use a tiny float noise (0.001 mmol/L) well below half-step to simulate rounding artefact.
    const preciseFastGlu = 100 / 18; // ~5.5556
    const prev = { fastGlu: preciseFastGlu, cholHDL: 1.3, cholTri: 1.7, waist: 97, height: 168, sbp: 120 };
    const curr2 = { ...prev, fastGlu: preciseFastGlu + 0.001 }; // tiny noise < half-step
    const merged2 = mergeUS(prev, curr2);
    assertApprox(merged2.fastGlu, preciseFastGlu, 1e-12,
        'G2 (US mode): sub-half-step diff keeps previous precise fastGlu');

    // G3: Difference > half-step uses current value (genuine user edit)
    const curr3 = { ...prev, fastGlu: preciseFastGlu + 0.5 }; // 0.5 mmol/L edit >> half-step
    const merged3 = mergeUS(prev, curr3);
    assertApprox(merged3.fastGlu, preciseFastGlu + 0.5, 1e-12,
        'G3 (US mode): large edit uses current value');

    // G4: In SI mode, same principle applies
    const mergeSI = makeMerge(true);
    const preciseCholHDL = 1.492;
    const roundedCholHDL = Math.round(preciseCholHDL * 10) / 10; // 1.5
    const prevSI = { fastGlu: 5.6, cholHDL: preciseCholHDL, cholTri: 1.7, waist: 97, height: 168, sbp: 120 };
    const currSI = { ...prevSI, cholHDL: roundedCholHDL };
    const mergedSI = mergeSI(prevSI, currSI);
    assertApprox(mergedSI.cholHDL, preciseCholHDL, 1e-12,
        'G4 (SI mode): sub-half-step diff keeps previous precise cholHDL');

    // G5: Fields not in CONVERTIBLE_FIELDS (e.g. sbp) always use current value
    const prevG5 = { ...prev, sbp: 120 };
    const currG5 = { ...prevG5, sbp: 125 };
    const mergedG5 = mergeUS(prevG5, currG5);
    assert(mergedG5.sbp === 125, 'G5: non-convertible field sbp uses current value');
}

// =====================================================================
// SUMMARY
// =====================================================================
console.log('\n═══════════════════════════════════════════');
console.log(`  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);

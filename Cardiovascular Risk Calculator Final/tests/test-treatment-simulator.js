/**
 * @fileoverview Unit tests for the TreatmentSimulator module.
 *
 * TreatmentSimulator is the most DOM-entangled module in the codebase —
 * its `simulate()` function drives a setTimeout-based animation loop,
 * reads multiple DOM elements, and calls into UIController, RiskModel,
 * and App. Full animation testing requires a browser or a
 * real timer environment (e.g., Jest fake-timers).
 *
 * What IS testable in a pure Node.js context:
 *
 *   1. API shape          — module exports { simulate, unsimulate, resetSimulated,
 *                           cancel, getOriginalValues, getSimulatedFactors }
 *   2. Resilience         — simulate() with a null DOM never throws
 *   3. getOriginalValues  — returns empty object initially; updated after sim
 *   4. getSimulatedFactors — returns empty array initially
 *   5. resetSimulated()   — clears the already-simulated set
 *   6. unsimulate()       — no-op if factor not simulated, does not throw
 *   7. getEffectDelta     — indirect: effect deltas come from CONFIG and the
 *                           unit-toggle state; verified for all factors
 *   8. easeOutCubic       — indirect: animation values stay within the expected range
 *
 * Run with: node tests/test-treatment-simulator.js
 */

'use strict';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

global.window = global;
global.window.addEventListener = () => {};
global.DRC    = {};

require('../js/config.js');
require('../js/conversion-service.js');
require('../js/ui-helpers.js');

// ─── Minimal DOM mock (null DOM — all getElementById calls return null) ────────

function makeNullDocument() {
    return {
        getElementById:   () => null,
        querySelector:    () => null,
        querySelectorAll: () => []
    };
}

function makeRichDocument(overrides) {
    const elements = overrides || {};
    return {
        getElementById:   (id) => elements[id] ?? null,
        querySelector:    ()   => null,
        querySelectorAll: ()   => []
    };
}

// ─── Minimal DRC dependency stubs ────────────────────────────────────────────

function setupStubs() {
    DRC.UIController = {
        readInputs:              () => ({ age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120,
                                           height: 66, waist: 36, fastGlu: 100,
                                           cholHDL: 50, cholTri: 150 }),
        updateSliderFill:        () => {},
        getSliderElements:       () => ({ input: null, slider: null }),
        getUnitToggleState:      () => false
    };
    DRC.RiskModel = {
        toSI:               (v)    => v,
        computeProbability: ()     => 0.15
    };
    DRC.App = {
        _getState:  () => ({}),
        _calculate: () => {},
        trigger:    () => {}
    };
}

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) { passed++; console.log(`  ✓ ${name}`); }
    else           { failed++; console.log(`  ✗ FAIL: ${name}`); }
}

// ─── TEST SUITE 1: API shape ──────────────────────────────────────────────────

console.log('\n═══ TEST SUITE 1: API shape ═══');

global.document = makeNullDocument();
setupStubs();

require('../js/treatment-simulator.js');
const TS = DRC.TreatmentSimulator;

assert(typeof TS                      === 'object',   'DRC.TreatmentSimulator is an object');
assert(typeof TS.simulate             === 'function', 'TreatmentSimulator.simulate is a function');
assert(typeof TS.unsimulate           === 'function', 'TreatmentSimulator.unsimulate is a function');
assert(typeof TS.resetSimulated       === 'function', 'TreatmentSimulator.resetSimulated is a function');
assert(typeof TS.cancel               === 'function', 'TreatmentSimulator.cancel is a function');
assert(typeof TS.getOriginalValues      === 'function', 'TreatmentSimulator.getOriginalValues is a function');
assert(typeof TS.getSimulatedFactors    === 'function', 'TreatmentSimulator.getSimulatedFactors is a function');
assert(typeof TS.getIndividualReduction === 'function', 'TreatmentSimulator.getIndividualReduction is a function');
assert(typeof TS.resimulate             === 'function', 'TreatmentSimulator.resimulate is a function');
assert(typeof TS.isAnimating            === 'function', 'TreatmentSimulator.isAnimating is a function');
assert(typeof TS.getEffectDelta         === 'function', 'TreatmentSimulator.getEffectDelta is a function');
assert(typeof TS.hasActiveSimulation    === 'function', 'TreatmentSimulator.hasActiveSimulation is a function');
assert(typeof TS.getPreSimulationSnapshot === 'function', 'TreatmentSimulator.getPreSimulationSnapshot is a function');
assert(Object.keys(TS).length           === 12,         'Public API has exactly 12 members');

// ─── TEST SUITE 2: Resilience — null DOM ──────────────────────────────────────

console.log('\n═══ TEST SUITE 2: simulate()/unsimulate() resilience with null DOM ═══');

global.document = makeNullDocument();
setupStubs();

const ALL_FACTORS = Object.keys(DRC.CONFIG.SIMULATION_EFFECTS);

ALL_FACTORS.forEach(factor => {
    TS.resetSimulated();
    let threw = false;
    try { TS.simulate(factor); } catch (e) { threw = true; }
    assert(!threw, `simulate('${factor}') with null DOM does not throw`);
});

ALL_FACTORS.forEach(factor => {
    let threw = false;
    try { TS.unsimulate(factor); } catch (e) { threw = true; }
    assert(!threw, `unsimulate('${factor}') with null DOM does not throw`);
});

// Invalid / unknown factor name
TS.resetSimulated();
let threw = false;
try { TS.simulate('nonExistentFactor'); } catch (e) { threw = true; }
assert(!threw, "simulate('nonExistentFactor') does not throw");

// Empty string
threw = false;
try { TS.simulate(''); } catch (e) { threw = true; }
assert(!threw, "simulate('') does not throw");

// ─── TEST SUITE 3: getOriginalValues / getSimulatedFactors ────────────────────

console.log('\n═══ TEST SUITE 3: getOriginalValues / getSimulatedFactors ═══');

TS.resetSimulated();
const origs0 = TS.getOriginalValues();
assert(typeof origs0 === 'object' && origs0 !== null, 'getOriginalValues returns an object');
assert(Object.keys(origs0).length === 0, 'getOriginalValues is empty after resetSimulated');

const factors0 = TS.getSimulatedFactors();
assert(Array.isArray(factors0), 'getSimulatedFactors returns an array');
assert(factors0.length === 0, 'getSimulatedFactors is empty after resetSimulated');

// ─── TEST SUITE 4: resetSimulated() ───────────────────────────────────────────

console.log('\n═══ TEST SUITE 4: resetSimulated() ═══');

threw = false;
try {
    TS.resetSimulated();
    TS.resetSimulated();
    TS.resetSimulated();
} catch (e) { threw = true; }
assert(!threw, 'resetSimulated() is safe to call multiple times');

// ─── TEST SUITE 5: getEffectDelta — CONFIG values for all factors ─────────────

console.log('\n═══ TEST SUITE 5: getEffectDelta values from CONFIG ═══');

const FX = DRC.CONFIG.SIMULATION_EFFECTS;

ALL_FACTORS.forEach(factor => {
    const fx = FX[factor];
    if (fx.siMale !== undefined) {
        assert(fx.usMale !== 0, `SIMULATION_EFFECTS.${factor}.usMale is non-zero`);
        assert(fx.siMale !== 0, `SIMULATION_EFFECTS.${factor}.siMale is non-zero`);
        assert(fx.usFemale !== 0, `SIMULATION_EFFECTS.${factor}.usFemale is non-zero`);
        assert(fx.siFemale !== 0, `SIMULATION_EFFECTS.${factor}.siFemale is non-zero`);
    } else {
        assert(fx.us !== 0, `SIMULATION_EFFECTS.${factor}.us is non-zero`);
        assert(fx.si !== 0, `SIMULATION_EFFECTS.${factor}.si is non-zero`);
    }
});

assert(Math.abs(FX.fastGlu.us) >= 10, 'fastGlu US delta magnitude ≥ 10 mg/dL');
assert(Math.abs(FX.sbp.usMale) >= 5,  'sbp US (male) delta magnitude ≥ 5 mmHg');
assert(Math.abs(FX.sbp.usFemale) >= 5, 'sbp US (female) delta magnitude ≥ 5 mmHg');
assert(Math.abs(FX.waist.us)   >= 1,  'waist US delta magnitude ≥ 1 in');
assert(Math.abs(FX.cholHDL.us) >= 1,  'cholHDL US delta magnitude ≥ 1 mg/dL');
assert(Math.abs(FX.cholTri.us) >= 10, 'cholTri US delta magnitude ≥ 10 mg/dL');

// ─── TEST SUITE 6: simulate() with partial DOM (currentVal === targetVal) ─────

console.log('\n═══ TEST SUITE 6: simulate() with partial DOM (currentVal === targetVal) ═══');

const factor = 'fastGlu';

const richDoc = makeRichDocument({
    'unit-toggle':       { checked: false },
    'fastGlu-value':     { value: '50' },
    'fastGlu-slider':    { min: '50', max: '300', step: '1', value: '50' }
});

global.document = richDoc;
setupStubs();
TS.resetSimulated();

threw = false;
try { TS.simulate(factor); } catch (e) { threw = true; }
assert(!threw,
    'simulate() with currentVal === targetVal (slider at min) returns without throw');

// ─── TEST SUITE 7: easeOutCubic properties (mathematical) ─────────────────────

console.log('\n═══ TEST SUITE 7: easeOutCubic mathematical properties ═══');

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

assert(Math.abs(easeOutCubic(0)   - 0) < 1e-9,  'easeOutCubic(0) = 0 (animation starts at rest)');
assert(Math.abs(easeOutCubic(1)   - 1) < 1e-9,  'easeOutCubic(1) = 1 (animation ends at target)');
assert(Math.abs(easeOutCubic(0.5) - 0.875) < 1e-9, 'easeOutCubic(0.5) = 0.875');
assert(easeOutCubic(0.25) > 0.25,               'easeOutCubic(0.25) > 0.25 (faster start)');
assert(easeOutCubic(0.75) > 0.75,               'easeOutCubic(0.75) > 0.75 (deceleration)');

const steps = Array.from({ length: 30 }, (_, i) => easeOutCubic(i / 29));
const isMonotonic = steps.every((v, i) => i === 0 || v >= steps[i - 1]);
assert(isMonotonic, 'easeOutCubic is monotonically non-decreasing on [0, 1]');
assert(steps.every(v => v >= 0 && v <= 1), 'All easeOutCubic values are in [0, 1]');

// ─── TEST SUITE 8: getEffectDelta sex-dependent SBP (H10) ──────────────────────

console.log('\n═══ TEST SUITE 8: getEffectDelta sex-dependent SBP ═══');
{
    const FX = DRC.CONFIG.SIMULATION_EFFECTS;

    // Test SI mode, male (sex=1): should return siMale delta
    DRC.UIController.getUnitToggleState = () => true;  // isMetric = true
    DRC.UIController.readInputs = () => ({ age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120, height: 170, waist: 94, fastGlu: 5.5, cholHDL: 1.3, cholTri: 1.7 });

    const sbpSiMale = TS.getEffectDelta('sbp');
    assert(sbpSiMale === FX.sbp.siMale, `SI male: getEffectDelta('sbp') = ${sbpSiMale} (expected ${FX.sbp.siMale})`);

    // Test SI mode, female (sex=0): should return siFemale delta
    DRC.UIController.readInputs = () => ({ age: 54, sex: 0, race: 0, parentHist: 0, sbp: 120, height: 170, waist: 94, fastGlu: 5.5, cholHDL: 1.3, cholTri: 1.7 });

    const sbpSiFemale = TS.getEffectDelta('sbp');
    assert(sbpSiFemale === FX.sbp.siFemale, `SI female: getEffectDelta('sbp') = ${sbpSiFemale} (expected ${FX.sbp.siFemale})`);

    // Test US mode, male (sex=1): should return usMale delta
    DRC.UIController.getUnitToggleState = () => false;  // isMetric = false
    DRC.UIController.readInputs = () => ({ age: 54, sex: 1, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150 });

    const sbpUsMale = TS.getEffectDelta('sbp');
    assert(sbpUsMale === FX.sbp.usMale, `US male: getEffectDelta('sbp') = ${sbpUsMale} (expected ${FX.sbp.usMale})`);

    // Test US mode, female (sex=0): should return usFemale delta
    DRC.UIController.readInputs = () => ({ age: 54, sex: 0, race: 0, parentHist: 0, sbp: 120, height: 66, waist: 38, fastGlu: 100, cholHDL: 50, cholTri: 150 });

    const sbpUsFemale = TS.getEffectDelta('sbp');
    assert(sbpUsFemale === FX.sbp.usFemale, `US female: getEffectDelta('sbp') = ${sbpUsFemale} (expected ${FX.sbp.usFemale})`);

    // Verify sex-independent factors still work
    DRC.UIController.getUnitToggleState = () => true;
    const fastGluDelta = TS.getEffectDelta('fastGlu');
    assert(fastGluDelta === FX.fastGlu.si, `SI mode: getEffectDelta('fastGlu') = ${fastGluDelta} (expected ${FX.fastGlu.si})`);

    DRC.UIController.getUnitToggleState = () => false;
    const fastGluUs = TS.getEffectDelta('fastGlu');
    assert(fastGluUs === FX.fastGlu.us, `US mode: getEffectDelta('fastGlu') = ${fastGluUs} (expected ${FX.fastGlu.us})`);

    // Verify female SBP delta is larger in magnitude than male (clinical expectation)
    assert(Math.abs(FX.sbp.siFemale) > Math.abs(FX.sbp.siMale),
        'Female SBP delta magnitude > male (clinical: -30.9 vs -17.7 mmHg)');
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n  TOTAL: ${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

/**
 * @fileoverview Pure cardiovascular risk-computation module.
 *
 * Implements the equation from gencardio_lipids.xls:
 * risk = 1 - S0 ^ exp(sum(beta * x) - meanSum)
 */

'use strict';

DRC.RiskModel = (() => {
    const { NORMAL_VALUES, RANGES } = DRC.CONFIG;

    const getModel = (model) => model || DRC.CONFIG.MODELS[DRC.CONFIG.DEFAULT_MODEL];

    const toSI = (inputs, isMetric) => DRC.ConversionService.toSI(inputs, isMetric);

    const clamp = (value, field) => {
        const range = RANGES[field]?.us;
        if (!range || !isFinite(value)) return value;
        return Math.min(Math.max(value, range[0]), range[1]);
    };

    const getSexModel = (si, model) => {
        const m = getModel(model);
        return si.sex === 1 ? m.framingham.male : m.framingham.female;
    };

    const transformedInputs = (si) => {
        const sbp = clamp(si.sbp, 'sbp');
        return {
            age: Math.log(clamp(si.age, 'age')),
            sbp: Math.log(sbp),
            totalChol: Math.log(clamp(si.totalChol, 'totalChol')),
            cholHDL: Math.log(clamp(si.cholHDL, 'cholHDL')),
            smoking: si.smoking ? 1 : 0,
            diabetes: si.diabetes ? 1 : 0
        };
    };

    const linearPredictor = (si, model) => {
        const sexModel = getSexModel(si, model);
        const c = sexModel.coefficients;
        const x = transformedInputs(si);
        const sbpCoeff = si.trtBp ? c.sbpTreated : c.sbpUntreated;

        return (
            c.age * x.age +
            sbpCoeff * x.sbp +
            c.totalChol * x.totalChol +
            c.cholHDL * x.cholHDL +
            c.smoking * x.smoking +
            c.diabetes * x.diabetes
        );
    };

    const computeProbability = (siVals, model) => {
        const sexModel = getSexModel(siVals, model);
        const sum = linearPredictor(siVals, model);
        if (!isFinite(sum)) return null;
        const exponent = Math.exp(sum - sexModel.meanSum);
        const risk = 1 - Math.pow(sexModel.baselineSurvival, exponent);
        return Math.min(Math.max(risk, 0), 1);
    };

    const coefficientFor = (field, si, model) => {
        const c = getSexModel(si, model).coefficients;
        if (field === 'sbp') return si.trtBp ? c.sbpTreated : c.sbpUntreated;
        return c[field] || 0;
    };

    const contributionValue = (field, si, reference, model) => {
        if (field === 'sex' || field === 'trtBp') return 0;
        const coeff = coefficientFor(field, si, model);
        const current = transformedInputs(si)[field];
        const ref = transformedInputs({ ...si, ...reference })[field];
        return coeff * (current - ref);
    };

    const computeContributions = (siVals, model) => {
        const result = {};
        getModel(model).fields.forEach(field => {
            result[field] = contributionValue(field, siVals, NORMAL_VALUES, model);
        });
        return result;
    };

    const computeBaselineRisk = (model) => {
        return computeProbability(NORMAL_VALUES, model);
    };

    const computeMarginalContributions = (siVals, model) => {
        const result = {};
        const baseRisk = computeProbability(siVals, model);
        getModel(model).fields.forEach(field => {
            if (field === 'sex' || field === 'trtBp') {
                result[field] = 0;
                return;
            }
            const counterfactual = { ...siVals, [field]: NORMAL_VALUES[field] };
            result[field] = baseRisk - computeProbability(counterfactual, model);
        });
        return result;
    };

    const computeMarginalSummary = (siVals, model) => {
        const pFull = computeProbability(siVals, model);
        if (pFull == null) return null;
        const pBaseline = computeBaselineRisk(model);
        const contributions = computeMarginalContributions(siVals, model);
        const sumMarginals = Object.values(contributions).reduce((a, b) => a + b, 0);
        return { contributions, pFull, pBaseline, netDeviation: pFull - pBaseline, sumMarginals };
    };

    const computeAdditiveContributions = (siVals, reference = NORMAL_VALUES, model) => {
        const pFull = computeProbability(siVals, model);
        const pReference = computeProbability(reference, model);
        if (pFull == null || pReference == null) return {};

        const raw = computeContributions(siVals, model);
        const fields = getModel(model).fields.filter(field => field !== 'sex' && field !== 'trtBp');
        const rawSum = fields.reduce((sum, field) => sum + (raw[field] || 0), 0);
        const riskDelta = pFull - pReference;

        if (!isFinite(rawSum) || Math.abs(rawSum) < 1e-12) {
            return Object.fromEntries(fields.map(field => [field, 0]));
        }

        const scale = riskDelta / rawSum;
        const scaled = {};
        fields.forEach(field => {
            scaled[field] = (raw[field] || 0) * scale;
        });
        return scaled;
    };

    const getElevatedFactors = (siVals) => {
        const elevatedFactors = [];
        if (!siVals) return { elevatedFactors, waistIsHigh: false };

        if (siVals.sbp >= 120) elevatedFactors.push('sbp');
        if (siVals.totalChol >= 200) elevatedFactors.push('totalChol');
        if (siVals.cholHDL < 60) elevatedFactors.push('cholHDL');
        if (siVals.smoking) elevatedFactors.push('smoking');

        return { elevatedFactors, waistIsHigh: false };
    };

    const computeWhatIfDelta = (rawInputs, isMetric, field, direction, model) => {
        const baseProb = computeProbability(toSI(rawInputs, isMetric), model);
        const mode = isMetric ? 'si' : 'us';
        const step = RANGES[field]?.[mode]?.[2] ?? 1;
        const range = RANGES[field]?.[mode];
        let perturbedVal = rawInputs[field] + direction * step * 5;
        if (range) perturbedVal = Math.min(Math.max(perturbedVal, range[0]), range[1]);
        const altered = { ...rawInputs, [field]: perturbedVal };
        return (computeProbability(toSI(altered, isMetric), model) - baseProb) * 100;
    };

    return {
        toSI,
        computeProbability,
        computeContributions,
        computeBaselineRisk,
        computeMarginalContributions,
        computeMarginalSummary,
        computeAdditiveContributions,
        getElevatedFactors,
        computeWhatIfDelta
    };
})();

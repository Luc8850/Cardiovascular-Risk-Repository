# Diabetes Risk Calculator

[![License: BSD 3-Clause](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
[![Tests](https://img.shields.io/badge/tests-481%20passing-brightgreen.svg)](tests/)

An interactive, web-based interface for communicating the logistic regression model by Schmidt et al. (2005) to medical laypersons. The interface is based on the Ecological Interface Design (EID) methodology (Vicente & Rasmussen, 1992).

## Scientific Background

The interface implements the validated risk model from the **Atherosclerosis Risk in Communities (ARIC)** study, which estimates the 9-year incidence of type 2 diabetes based on nine predictors:

**Model equation:**

P(Diabetes) = 1 / (1 + e^(-LP))

where LP = σ + Σ βᵢ · xᵢ with the following coefficients:

| Predictor | β Coefficient | Unit (SI) | Role |
|-----------|--------------|-----------|------|
| Age | 0.0173 | years | Non-modifiable |
| Ethnicity | 0.4433 | binary | Non-modifiable |
| Family history | 0.4981 | binary | Non-modifiable |
| Systolic blood pressure | 0.0111 | mmHg | Modifiable |
| Waist circumference | 0.0273 | cm | Modifiable |
| Height | -0.0326 | cm | Non-modifiable |
| Fasting glucose | 1.5849 | mmol/L | Modifiable (strongest predictor) |
| HDL cholesterol | -0.4718 | mmol/L | Modifiable (protective) |
| Triglycerides | 0.242 | mmol/L | Modifiable |

Intercept σ = -9.9808

### Population Means (ARIC Cohort)

The contribution analysis computes each factor's deviation from the ARIC cohort baseline. The following population means are used, yielding a **baseline population risk of ~10.94%**:

| Variable | Mean | Unit |
|----------|------|------|
| Age | 54 | years |
| Ethnicity (African-American) | 0.15 | proportion |
| Family history of diabetes | 0.38 | proportion |
| Systolic blood pressure | 120 | mmHg |
| Waist circumference | 94.76 | cm |
| Height | 168 | cm |
| Fasting glucose | 5.44 | mmol/L |
| HDL cholesterol | 1.492 | mmol/L |
| Triglycerides | 1.38 | mmol/L |

## Features

- **Real-time risk calculation** with animated gauge display (0–100%)
- **Dual-unit system** - switchable between US customary and SI units
- **Factor contribution analysis** - shows each predictor's individual contribution to overall risk (deviation from the ARIC cohort population mean)
- **Radar chart** - multidimensional visualization of modifiable risk factors relative to clinical thresholds
- **Risk timeline** - temporal progression across scenarios and treatment simulations, with color-coded treatment markers and baseline reference line
- **Treatment simulations** - evidence-based intervention scenarios (blood glucose management, blood pressure control, HDL improvement, triglyceride treatment, weight management) with animated slider adjustment
- **Treatment zone map** - heatmap visualization of treatment zones
- **Patient management** - save and load patient profiles via localStorage
- **Model transparency** - beta vector visualization and causal chains to disclose model structure (EID Abstraction Hierarchy)
- **Internationalization (i18n)** - Multi-language support (EN/DE)
- **Multi-model support** - Three model variants (Clinical, Clinical+Glucose, Full Model)

## EID Design Principles

The interface follows the core principles of Ecological Interface Design:

- **Abstraction Hierarchy (AH):** Representation of model structure across multiple levels of abstraction - from raw data (sliders) through functional relationships (contribution bars) to system purpose (risk score)
- **Skills, Rules, Knowledge (SRK) Taxonomy:** Support for all three cognitive processing levels according to Rasmussen (1983)
- **Proximity Compatibility Principle:** Spatial grouping of related information (Wickens & Carswell, 1995)
- **Direct Perception / Direct Manipulation:** Slider-based input with immediate visual feedback

## Technology

- **Vanilla JavaScript** (ES6+, IIFE module pattern, `window.DRC` namespace)
- **No framework**, no bundler, no build step required
- **SVG** for diagrams (radar chart, timeline)
- **CSS Custom Properties** for consistent theming
- **Lucide Icons** (local)
- **Google Fonts** (Plus Jakarta Sans)
- **SheetJS** for Excel import/export (CDN with SRI)

## Project Structure

```
index.html                Main interface file
style.css                 Complete stylesheet
LICENSE                   BSD 3-Clause License
js/
  config.js               Model coefficients, thresholds, treatment data
  conversion-service.js   Unit conversion (US ↔ SI)
  risk-model.js           Logistic regression, contribution calculation
  ui-helpers.js           Utility functions (clamping, formatting)
  utils.js                Shared utilities (escapeHtml, debounce, i18n cache)
  ui-controller.js        DOM rendering, slider updates, gauge animation
  radar-chart.js          SVG radar chart of risk factors
  timeline-chart.js       SVG timeline chart with snapshot tracking
  treatment-simulator.js  Animated treatment simulations
  patient-manager.js      Patient management (localStorage) with Excel I/O
  app.js                  Application logic, event binding, state management
  main.js                 Bootstrap (DOMContentLoaded)
  i18n/                   Internationalization
    translations/         JSON translation files
    i18n-service.js       Core i18n functionality
    i18n-ui.js            UI language switching
  settings-panel.js       Settings panel component
  profile-warning.js      Profile warning system
  tutorial.js             Interactive tutorial
  landing-page.js         Landing page functionality
  lib/
    lucide.min.js         Local icon library
tests/
  test-risk-model.js              Model validation (62 tests)
  test-risk-model-edge-cases.js   Edge case validation (12 tests)
  test-comparison.js              Refactoring comparison (55 tests)
  test-ui-helpers.js              UI utility functions (9 tests)
  test-ui-controller.js           UI controller tests (16 tests)
  test-timeline-chart.js          Timeline chart tests (8 tests)
  test-patient-manager.js         Patient manager tests (14 tests)
  test-treatment-simulator.js     Treatment simulator tests (10 tests)
  test-event-system.js            Event system tests (6 tests)
.github/
  CODE_OF_CONDUCT.md      Contributor Covenant code of conduct
  CONTRIBUTING.md         Contribution guidelines
  SECURITY.md             Security policy
  ISSUE_TEMPLATE/         GitHub issue templates
  PULL_REQUEST_TEMPLATE.md  PR template
```

## Usage

Open `index.html` directly in the browser - no server required.

```bash
open index.html
```

For GitHub Pages: Upload all files (including the `js/` directory) to the repository's root directory.

## Tests

Run individual test suites:

```bash
node tests/test-risk-model.js              # 62 tests - Core model validation
node tests/test-risk-model-edge-cases.js   # 12 tests - Edge case handling
node tests/test-comparison.js              # 55 tests - Refactoring comparison
node tests/test-ui-helpers.js            # 9 tests - Utility functions
node tests/test-ui-controller.js           # 16 tests - UI controller
node tests/test-timeline-chart.js          # 8 tests - Timeline functionality
node tests/test-patient-manager.js         # 14 tests - Patient management
node tests/test-treatment-simulator.js     # 10 tests - Treatment simulations
node tests/test-radar-chart.js             # 8 tests - Radar chart functionality
node tests/test-event-system.js            # 6 tests - Event system
```

**Total: 481+ tests** validate the correct implementation of the Schmidt et al. model.

## Security

This application:
- Runs **entirely client-side** — no data is transmitted to servers
- Uses `localStorage` for data persistence (stored locally in the browser)
- Implements **Content Security Policy (CSP)** headers
- Uses cryptographically secure random ID generation (`crypto.randomUUID`)
- **XSS Protection** — All dynamic content uses `textContent` or `createElement()` instead of `innerHTML`
- **Password Protection** — Optional AES-GCM encryption for Excel exports

### Security Best Practices Implemented

| Practice | Implementation |
|----------|---------------|
| XSS Prevention | `DRC.Utils.escapeHtml()` for text content |
| Safe DOM | `textContent` and `escapeHtml()` instead of `innerHTML` |
| Event Handling | Delegated events instead of document-level handlers |
| Data Sanitization | Input validation in `DRC.Validation` utilities |

See [SECURITY.md](.github/SECURITY.md) for details on reporting vulnerabilities.

## Contributing

Contributions are welcome! Please read our [Contributing Guidelines](.github/CONTRIBUTING.md) and [Code of Conduct](.github/CODE_OF_CONDUCT.md) before submitting issues or pull requests.

## License

This project is licensed under the [BSD 3-Clause License](LICENSE).

## References

- Schmidt, M. I., Duncan, B. B., Bang, H., Pankow, J. S., Ballantyne, C. M., Golden, S. H., Folsom, A. R., & Chambless, L. E. (2005). Identifying individuals at high risk for diabetes: The Atherosclerosis Risk in Communities study. *Diabetes Care, 28*(8), 2013–2018. https://doi.org/10.2337/diacare.28.8.2013
- Vicente, K. J., & Rasmussen, J. (1992). Ecological interface design: Theoretical foundations. *IEEE Transactions on Systems, Man, and Cybernetics, 22*(4), 589–606. https://doi.org/10.1109/21.156574
- Wickens, C. D., & Carswell, C. M. (1995). The proximity compatibility principle: Its psychological foundation and relevance to display design. *Human Factors, 37*(3), 473–494. https://doi.org/10.1518/001872095779049408
- Rasmussen, J. (1983). Skills, rules, and knowledge: Signals, signs, and symbols, and other distinctions in human performance models. *IEEE Transactions on Systems, Man, and Cybernetics, SMC-13*(3), 257–266. https://doi.org/10.1109/TSMC.1983.6313160




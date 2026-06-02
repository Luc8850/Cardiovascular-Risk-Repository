/**
 * @fileoverview Interactive Tutorial Module
 *
 * Guides users through interface sections with small explanation cards
 * connected by SVG lines to their target elements.
 * Global nav bar handles Prev/Next/Close. Fully i18n-aware.
 *
 * Card placement strategy:
 *  - All cards for a step are placed in a vertical column to the left or
 *    right of the highlighted section (column-based layout).
 *  - For the top nav step, cards are distributed horizontally below the bar.
 *  - Cards are sorted by their target element's Y position so lines stay short.
 *  - No collision-resolution loops needed — the column is always non-overlapping.
 *
 * @module Tutorial
 * @memberof DRC
 */

'use strict';

window.DRC = window.DRC || {};

DRC.Tutorial = (() => {

    // ─── Step Definitions ──────────────────────────────────────────────
    const STEPS = [
        {
            sectionSelector: 'nav.top-nav',
            titleKey: 'tutorial.steps.nav.title',
            items: [
                {
                    selector: '#resetBtn',
                    titleKey: 'tutorial.steps.nav.resetBtn.title',
                    textKey:  'tutorial.steps.nav.resetBtn.text'
                },
                {
                    selector: '#patientMenuBtn',
                    titleKey: 'tutorial.steps.nav.patientBtn.title',
                    textKey:  'tutorial.steps.nav.patientBtn.text'
                },
                {
                    selector: '#settingsBtn',
                    titleKey: 'tutorial.steps.nav.settingsBtn.title',
                    textKey:  'tutorial.steps.nav.settingsBtn.text'
                }
            ]
        },
        {
            sectionSelector: '#panel-input',
            titleKey: 'tutorial.steps.input.title',
            items: [
                {
                    selector: '#panel-input h2',
                    titleKey: 'tutorial.steps.input.demographic.title',
                    textKey:  'tutorial.steps.input.demographic.text',
                    forcePosition: 'right'
                },
                {
                    selector: '#age-slider',
                    titleKey: 'tutorial.steps.input.sliders.title',
                    textKey:  'tutorial.steps.input.sliders.text',
                    forcePosition: 'right'
                },
                {
                    selector: '#age-value',
                    titleKey: 'tutorial.steps.input.valuebox.title',
                    textKey:  'tutorial.steps.input.valuebox.text',
                    forcePosition: 'right'
                },
                {
                    selector: '.toggle-switch',
                    titleKey: 'tutorial.steps.input.toggle.title',
                    textKey:  'tutorial.steps.input.toggle.text',
                    forcePosition: 'right'
                }
            ]
        },
        {
            sectionSelector: '#panel-model',
            titleKey: 'tutorial.steps.model.title',
            items: [
                {
                    selector: '#your-risk-field',
                    titleKey: 'tutorial.steps.model.yourRisk.title',
                    textKey:  'tutorial.steps.model.yourRisk.text'
                },
                {
                    selector: '#chosen-risk-field',
                    titleKey: 'tutorial.steps.model.chosenRisk.title',
                    textKey:  'tutorial.steps.model.chosenRisk.text'
                },
                {
                    selector: '#contribution-chart',
                    titleKey: 'tutorial.steps.model.contributions.title',
                    textKey:  'tutorial.steps.model.contributions.text'
                }
            ]
        },
        {
            sectionSelector: '#panel-treatment',
            titleKey: 'tutorial.steps.treatment.title',
            items: [
                {
                    selector: '.tov-title',
                    titleKey: 'tutorial.steps.treatment.cards.title',
                    textKey:  'tutorial.steps.treatment.cards.text'
                },
                {
                    selector: '.btn-simulate-treatment',
                    titleKey: 'tutorial.steps.treatment.simulate.title',
                    textKey:  'tutorial.steps.treatment.simulate.text'
                }
            ]
        }
    ];

    // ─── Constants ─────────────────────────────────────────────────────
    const CARD_W_DESKTOP     = 220;
    const CARD_W_MOBILE      = 180;
    const CARD_MARGIN        = 28;   // gap between card column edge and section edge
    const EDGE_PAD           = 10;   // min distance from viewport edges
    const CARD_GAP           = 12;   // vertical gap between cards in a column
    const NAV_BAR_HEIGHT     = 100;  // space reserved for tutorial nav bar at bottom
    const TOP_NAV_HEIGHT     = 56;   // top nav min-height (48px) + border + breathing room

    // ─── State ─────────────────────────────────────────────────────────
    let _currentStep  = 0;
    let _active       = false;
    let _cardEls      = [];
    let _resizeTimer  = null;
    let _escHandler   = null;
    let _langUnsub    = null;
    let _savedScrollY = 0;
    let _wheelHandler = null;
    let _touchHandler = null;

    // ─── Cached DOM references (set in start()) ─────────────────────────
    let _overlayEl = null;
    let _svgEl     = null;
    let _navBarEl  = null;
    let _prevBtn   = null;
    let _nextBtn   = null;
    let _stepLabel = null;

    // ─── Helpers ───────────────────────────────────────────────────────
    const _t  = (key) => (DRC.I18n ? DRC.I18n.t(key) : key);
    const _el = (selector) => document.querySelector(selector);

    /**
     * Get card width based on current viewport.
     * @returns {number}
     */
    const _getCardWidth = () => {
        const vw = window.innerWidth;
        if (vw < 360) return Math.min(160, vw - 40);
        if (vw < 480) return CARD_W_MOBILE;
        return CARD_W_DESKTOP;
    };

    // ─── Column-Based Position Computation ────────────────────────────
    /**
     * Compute fixed-position {left, top} for each card using a column layout.
     *
     * Strategy:
     *  - Nav step (section at top of screen): distribute cards in rows below.
     *  - All other steps: place cards in a vertical column to the left or
     *    right of the section, sorted by target Y so lines are short.
     *
     * Guarantees: cards never overlap each other and never extend below the
     * tutorial nav bar or beyond viewport edges.
     *
     * @param {{ sectionSelector: string, items: object[] }} step
     * @param {(DOMRect|null)[]} targetRects
     * @param {number[]}         cardHeights - actual measured card heights
     * @param {number}           cardW
     * @returns {({left: number, top: number}|null)[]}
     */
    const _computePositions = (step, targetRects, cardHeights, cardW) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Indices of items that have a visible target element
        const validIdx = targetRects.reduce((acc, r, i) => { if (r) acc.push(i); return acc; }, []);
        const positions = new Array(targetRects.length).fill(null);

        if (validIdx.length === 0) return positions;

        const sectionEl   = _el(step.sectionSelector);
        const sectionRect = sectionEl ? sectionEl.getBoundingClientRect() : null;

        // ── Nav / top-of-screen, or step with forceBelow: cards below the bar ──
        if (sectionRect && (sectionRect.bottom < 120 || step.forceBelow)) {
            _layoutBelowNav(validIdx, targetRects, cardHeights, cardW, positions, sectionRect, vw, vh);
            return positions;
        }

        // ── Column layout (left or right of section) ──────────────────
        const rightSpace = sectionRect ? vw - sectionRect.right - CARD_MARGIN - EDGE_PAD : -1;
        const leftSpace  = sectionRect ? sectionRect.left - CARD_MARGIN - EDGE_PAD       : -1;

        // Forced direction: use if ANY item specifies one
        const forcedRight = step.items.some(it => it.forcePosition === 'right');
        const forcedLeft  = step.items.some(it => it.forcePosition === 'left');

        // ── Full-viewport section on narrow screen → bottom-anchored row ──
        // When the section fills both width and most of the viewport height,
        // there is no viable side column. Instead, anchor cards at the bottom
        // of the safe area (above the tutorial nav bar) as a horizontal grid,
        // and let the dashed lines point upward to each target.
        const safeBottom = vh - NAV_BAR_HEIGHT - EDGE_PAD;
        const totalH     = validIdx.reduce((sum, i) => sum + cardHeights[i] + CARD_GAP, -CARD_GAP);
        const sectionIsFullViewport = sectionRect
            && sectionRect.width  >= vw * 0.85
            && sectionRect.height >= vh * 0.5;
        const noSideSpace = !forcedRight && !forcedLeft
            && rightSpace < cardW && leftSpace < cardW;

        if (sectionIsFullViewport && noSideSpace) {
            _layoutAtBottom(validIdx, cardHeights, cardW, positions, vw, safeBottom);
            return positions;
        }

        let colLeft;
        if (forcedRight || (!forcedLeft && rightSpace >= cardW)) {
            colLeft = sectionRect
                ? Math.min(sectionRect.right + CARD_MARGIN, vw - cardW - EDGE_PAD)
                : vw - cardW - EDGE_PAD;
        } else if (forcedLeft || leftSpace >= cardW) {
            colLeft = sectionRect
                ? Math.max(sectionRect.left - CARD_MARGIN - cardW, EDGE_PAD)
                : EDGE_PAD;
        } else {
            // No clean space on either side → place on the side with more room
            colLeft = rightSpace >= leftSpace
                ? Math.max(EDGE_PAD, vw - cardW - EDGE_PAD)
                : EDGE_PAD;
        }
        colLeft = Math.max(EDGE_PAD, Math.min(colLeft, vw - cardW - EDGE_PAD));

        // Sort by target Y so visually adjacent cards map to nearby targets
        const sortedByY = [...validIdx].sort((a, b) =>
            (targetRects[a] ? targetRects[a].top : 0) -
            (targetRects[b] ? targetRects[b].top : 0)
        );

        // Center column vertically on the section, clamped to safe area
        let startY;
        if (sectionRect) {
            const secMid = (sectionRect.top + sectionRect.bottom) / 2;
            startY = secMid - totalH / 2;
        } else {
            startY = EDGE_PAD;
        }
        startY = Math.max(EDGE_PAD, startY);
        if (startY + totalH > safeBottom) {
            startY = Math.max(EDGE_PAD, safeBottom - totalH);
        }

        let y = startY;
        for (const i of sortedByY) {
            positions[i] = { left: colLeft, top: Math.round(y) };
            y += cardHeights[i] + CARD_GAP;
        }

        // Post-placement: resolve cards that overlap their own target element
        // (common on narrow viewports where the section is full-width).
        _resolveCardTargetOverlaps(positions, targetRects, cardHeights, cardW);
        // After individual pushes, some cards may overlap each other — stack them.
        _greedyStack(positions, cardHeights, cardW);

        return positions;
    };

    /**
     * Bottom-anchored grid layout.
     *
     * Used when the highlighted section fills the entire viewport (full-width +
     * full-height, e.g. model/treatment panels on mobile). There is no viable
     * side column, and placing cards inside the content would obscure it.
     *
     * Cards are arranged in as many columns as fit and anchored so the BOTTOM
     * of the last row sits at safeBottom. Lines point upward to their targets.
     */
    const _layoutAtBottom = (validIdx, cardHeights, cardW, positions, vw, safeBottom) => {
        const availW  = vw - 2 * EDGE_PAD;
        const perRow  = Math.max(1, Math.floor((availW + CARD_GAP) / (cardW + CARD_GAP)));
        const rows    = Math.ceil(validIdx.length / perRow);
        const rowH    = Math.max(...validIdx.map(i => cardHeights[i])) + CARD_GAP;
        const totalH  = rows * rowH - CARD_GAP;
        const gridTop = safeBottom - totalH;

        // Sort by card index to maintain consistent order (left-to-right, top-to-bottom)
        const sorted  = [...validIdx];
        sorted.forEach((i, j) => {
            const col      = j % perRow;
            const row      = Math.floor(j / perRow);
            const colStep  = Math.floor((availW + CARD_GAP) / perRow);
            const gridW    = perRow * colStep - CARD_GAP;
            const gridLeft = EDGE_PAD + Math.max(0, Math.floor((availW - gridW) / 2));
            positions[i] = {
                left: Math.round(gridLeft + col * colStep),
                top:  Math.round(gridTop  + row * rowH)
            };
        });
    };

    /**
     * Horizontal distribution of cards below the section.
     *
     * Fast path: if all cards fit in a single row they are distributed evenly,
     * each centred above its target element. This avoids unnecessary wrapping
     * for steps such as the timeline where the section is full-width.
     *
     * Slow path: multi-row layout where each card is centred on its target's X
     * and rows wrap when the right edge would be exceeded.
     */
    const _layoutBelowNav = (validIdx, targetRects, cardHeights, cardW, positions, sectionRect, vw, vh) => {
        const sortedByX = [...validIdx].sort((a, b) => {
            const ax = targetRects[a] ? (targetRects[a].left + targetRects[a].right) / 2 : 0;
            const bx = targetRects[b] ? (targetRects[b].left + targetRects[b].right) / 2 : 0;
            return ax - bx;
        });

        const baseTop = sectionRect.bottom + CARD_MARGIN;
        const rowH    = Math.max(...validIdx.map(i => cardHeights[i])) + CARD_GAP;

        // ── Single-row fast path ─────────────────────────────────────
        const totalW = validIdx.length * cardW + (validIdx.length - 1) * CARD_GAP;
        const availW = vw - 2 * EDGE_PAD;
        if (totalW <= availW) {
            // Centre the whole row; each card's ideal X is its target centre
            const rowStartX = EDGE_PAD + (availW - totalW) / 2;
            sortedByX.forEach((i, j) => {
                positions[i] = {
                    left: Math.round(rowStartX + j * (cardW + CARD_GAP)),
                    top:  Math.round(baseTop)
                };
            });
            return;
        }

        // ── Multi-row fallback ────────────────────────────────────────
        // Find the minimum number of columns that keeps all cards above the safe area.
        // Start with how many columns fit at full cardW; increase until rows fit vertically.
        const safeBottom   = vh - NAV_BAR_HEIGHT - EDGE_PAD;
        const availHeight  = safeBottom - baseTop;
        let   perRow       = Math.max(1, Math.floor((availW + CARD_GAP) / (cardW + CARD_GAP)));
        // If the single-column height overflows, try more columns (with narrower cards)
        while (perRow < sortedByX.length) {
            const rows = Math.ceil(sortedByX.length / perRow);
            if (rows * rowH - CARD_GAP <= availHeight) break;
            perRow++;
        }
        // Effective card width for the chosen column count
        const effectiveW = Math.floor((availW - (perRow - 1) * CARD_GAP) / perRow);
        const colStep    = effectiveW + CARD_GAP;

        sortedByX.forEach((i, j) => {
            const col      = j % perRow;
            const row      = Math.floor(j / perRow);
            const gridW    = perRow * colStep - CARD_GAP;
            const gridLeft = EDGE_PAD + Math.max(0, Math.floor((availW - gridW) / 2));
            positions[i] = {
                left: Math.round(gridLeft + col * colStep),
                top:  Math.round(baseTop + row * rowH)
            };
        });
    };

    // ─── SVG Lines ─────────────────────────────────────────────────────
    /**
     * Draw dashed pointer lines from each card edge to its target element.
     */
    const _drawLines = (items) => {
        if (!_svgEl) return;
        while (_svgEl.firstChild) _svgEl.removeChild(_svgEl.firstChild);

        const ns = 'http://www.w3.org/2000/svg';

        items.forEach((item, i) => {
            const card   = _cardEls[i];
            const target = _el(item.selector);
            if (!card || !target) return;

            const cRect = card.getBoundingClientRect();
            const tRect = target.getBoundingClientRect();

            if (tRect.width === 0 && tRect.height === 0) return;

            const tx = tRect.left + tRect.width  / 2;
            const ty = tRect.top  + tRect.height / 2;

            // Nearest point on card bounding box toward target
            const x1 = Math.min(Math.max(tx, cRect.left), cRect.right);
            const y1 = Math.min(Math.max(ty, cRect.top),  cRect.bottom);

            // Highlight ring around target (drawn first so it's behind the line)
            const ring = document.createElementNS(ns, 'rect');
            ring.setAttribute('x',            tRect.left - 3);
            ring.setAttribute('y',            tRect.top  - 3);
            ring.setAttribute('width',        tRect.width  + 6);
            ring.setAttribute('height',       tRect.height + 6);
            ring.setAttribute('rx',           '6');
            ring.setAttribute('fill',         'none');
            ring.setAttribute('stroke',       '#3b82f6');
            ring.setAttribute('stroke-width', '1.5');
            ring.setAttribute('opacity',      '0.45');
            _svgEl.appendChild(ring);

            // Dashed line
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1',               x1);
            line.setAttribute('y1',               y1);
            line.setAttribute('x2',               tx);
            line.setAttribute('y2',               ty);
            line.setAttribute('stroke',           '#3b82f6');
            line.setAttribute('stroke-width',     '1.75');
            line.setAttribute('opacity',          '0.7');
            line.setAttribute('stroke-dasharray', '5 3');
            _svgEl.appendChild(line);

            // Filled dot on target
            const dot = document.createElementNS(ns, 'circle');
            dot.setAttribute('cx',      tx);
            dot.setAttribute('cy',      ty);
            dot.setAttribute('r',       '5');
            dot.setAttribute('fill',    '#3b82f6');
            dot.setAttribute('opacity', '0.9');
            _svgEl.appendChild(dot);
        });
    };

    // ─── Card Rendering ────────────────────────────────────────────────
    const _clearCards = () => {
        _cardEls.forEach(el => el && el.parentNode && el.parentNode.removeChild(el));
        _cardEls = [];
        if (_svgEl) while (_svgEl.firstChild) _svgEl.removeChild(_svgEl.firstChild);
    };

    /**
     * Two-pass card builder.
     *
     * Pass 1 — Insert all cards off-screen (visibility:hidden) so the browser
     *           computes their real rendered heights.
     * Pass 2 — Measure heights, compute column positions, apply, fade in.
     *
     * @param {{ sectionSelector: string, items: object[] }} step
     */
    const _buildCards = (step) => {
        _clearCards();

        // Base card width
        let cardW = _getCardWidth();

        // For full-viewport sections on narrow screens (e.g. model/treatment panels
        // on mobile), cards will be bottom-anchored. Compute a narrower card width
        // so at least 2 cards fit side by side, keeping lines short and readable.
        if (!step.forceBelow) {
            const vwNow   = window.innerWidth;
            const vhNow   = window.innerHeight;
            const secEl   = _el(step.sectionSelector);
            const secR    = secEl ? secEl.getBoundingClientRect() : null;
            if (secR && secR.width >= vwNow * 0.85 && secR.height >= vhNow * 0.5) {
                const rightSp = vwNow - secR.right - CARD_MARGIN - EDGE_PAD;
                const leftSp  = secR.left - CARD_MARGIN - EDGE_PAD;
                const forced  = step.items.some(it => it.forcePosition);
                if (!forced && rightSp < cardW && leftSp < cardW) {
                    // Compute width that allows 2 columns
                    const availW2 = vwNow - 2 * EDGE_PAD;
                    const w2col   = Math.floor((availW2 - CARD_GAP) / 2);
                    if (w2col >= 130) cardW = w2col; // minimum legible width
                }
            }
        }

        // Collect target rects; skip zero-size or off-screen elements
        const targetRects = step.items.map(item => {
            const target = _el(item.selector);
            if (!target) return null;
            const rect = target.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return null;
            if (rect.top > window.innerHeight || rect.bottom < 0) return null;
            return rect;
        });

        // ── Pass 1: create hidden cards ───────────────────────────────
        step.items.forEach((item, i) => {
            if (!targetRects[i]) {
                _cardEls.push(null);
                return;
            }

            const card = document.createElement('div');
            card.className        = 'tutorial-card';
            card.style.width      = cardW + 'px';
            card.style.position   = 'fixed';
            card.style.zIndex     = '9000';
            card.style.visibility = 'hidden';
            card.style.opacity    = '0';
            card.style.left       = '-9999px';
            card.style.top        = '-9999px';

            const title = document.createElement('div');
            title.className   = 'tutorial-card-title';
            title.textContent = _t(item.titleKey);

            const text = document.createElement('p');
            text.className   = 'tutorial-card-text';
            text.textContent = _t(item.textKey);

            card.appendChild(title);
            card.appendChild(text);
            document.body.appendChild(card);
            _cardEls.push(card);
        });

        // ── Pass 2: measure heights → compute positions → apply ───────
        requestAnimationFrame(() => {
            const cardHeights = _cardEls.map(card => {
                if (!card) return 0;
                const r = card.getBoundingClientRect();
                return r.height || 100;
            });

            const positions = _computePositions(step, targetRects, cardHeights, cardW);

            step.items.forEach((item, i) => {
                const card = _cardEls[i];
                const pos  = positions[i];
                if (!card || !pos) return;

                card.style.left       = pos.left + 'px';
                card.style.top        = pos.top  + 'px';
                card.style.visibility = 'visible';
                // Fade-in on next frame (position must be committed first)
                requestAnimationFrame(() => { card.style.opacity = '1'; });
            });

            _drawLines(step.items);
        });
    };

    // ─── Programmatic Scroll (while body is position:fixed) ───────────
    /**
     * Scroll a section into view by updating body.style.top.
     *
     * When body has `position: fixed` (tutorial-active), window.scrollY is frozen
     * and scrollIntoView() has no effect. Instead we manipulate body.style.top,
     * which shifts the fixed body so the desired content is visible.
     *
     * @param {Element} sectionEl
     */
    const _scrollToSection = (sectionEl) => {
        if (!sectionEl) return;
        // Current logical scroll = -body.style.top
        const currentScrollY = -parseFloat(document.body.style.top || '0');
        const rect = sectionEl.getBoundingClientRect();
        // rect.top is viewport-relative; convert to document coordinates
        const documentTop = rect.top + currentScrollY;
        const vh = window.innerHeight;
        // For non-nav sections, reserve space for the top navigation bar so
        // section headers (e.g. "Patient Data") don't overlap with "Diabetes Calculator".
        // The nav step targets the top-nav itself, so it needs no extra margin.
        const isNavStep = sectionEl.matches && sectionEl.matches('nav.top-nav');
        const marginTop = isNavStep ? EDGE_PAD : TOP_NAV_HEIGHT;
        let newScrollY = documentTop - marginTop;
        newScrollY = Math.max(0, newScrollY);
        document.body.style.top = `-${newScrollY}px`;
    };

    // ─── Post-placement Overlap Resolution ────────────────────────────
    /**
     * If a card overlaps its own target element, push it below (or above) the target.
     * This happens on narrow viewports where the section is full-width and there is
     * no side space — cards are placed inside the section and may cover their targets.
     */
    const _resolveCardTargetOverlaps = (positions, targetRects, cardHeights, cardW) => {
        const vh = window.innerHeight;
        const safeBottom = vh - NAV_BAR_HEIGHT - EDGE_PAD;

        positions.forEach((pos, i) => {
            if (!pos || !targetRects[i]) return;
            const tRect  = targetRects[i];
            const cRight  = pos.left + cardW;
            const cBottom = pos.top  + cardHeights[i];

            const hOverlap = pos.left < tRect.right  && cRight  > tRect.left;
            const vOverlap = pos.top  < tRect.bottom && cBottom > tRect.top;

            if (hOverlap && vOverlap) {
                const belowTop = tRect.bottom + CARD_GAP;
                const aboveTop = tRect.top - cardHeights[i] - CARD_GAP;

                if (belowTop + cardHeights[i] <= safeBottom) {
                    pos.top = belowTop;
                } else if (aboveTop >= EDGE_PAD) {
                    pos.top = aboveTop;
                } else {
                    pos.top = Math.max(EDGE_PAD, safeBottom - cardHeights[i]);
                }
            }
        });
    };

    /**
     * After target-overlap resolution individual cards may overlap each other.
     * Sort by top and push any card that overlaps the one above it downward.
     */
    const _greedyStack = (positions, cardHeights, cardW) => {
        const vh = window.innerHeight;
        const safeBottom = vh - NAV_BAR_HEIGHT - EDGE_PAD;

        const validIdx = positions.reduce((acc, p, i) => { if (p) acc.push(i); return acc; }, []);
        validIdx.sort((a, b) => positions[a].top - positions[b].top);

        for (let i = 1; i < validIdx.length; i++) {
            const prevIdx = validIdx[i - 1];
            const currIdx = validIdx[i];
            const prev    = positions[prevIdx];
            const curr    = positions[currIdx];

            // Only push when cards are in the same horizontal zone
            const hOverlap = prev.left < curr.left + cardW && prev.left + cardW > curr.left;
            if (!hOverlap) continue;

            const prevBottom = prev.top + cardHeights[prevIdx] + CARD_GAP;
            if (curr.top < prevBottom) {
                curr.top = Math.min(prevBottom, safeBottom - cardHeights[currIdx]);
                curr.top = Math.max(EDGE_PAD, curr.top);
            }
        }
    };

    // ─── Section Highlighting ──────────────────────────────────────────
    const _highlight = (step) => {
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });
        const section = _el(step.sectionSelector);
        if (section) {
            section.classList.add('tutorial-highlight');
            _scrollToSection(section);
        }
    };

    // ─── Nav Bar Update ────────────────────────────────────────────────
    const _updateNav = () => {
        const step   = STEPS[_currentStep];
        const n      = _currentStep + 1;
        const total  = STEPS.length;
        const isLast = _currentStep === STEPS.length - 1;

        if (_stepLabel) {
            _stepLabel.textContent = _t('tutorial.stepLabel')
                .replace('{n}',     String(n))
                .replace('{total}', String(total))
                .replace('{title}', _t(step.titleKey));
        }

        if (_prevBtn) _prevBtn.disabled = (_currentStep === 0);

        if (_nextBtn) {
            const textSpan = _nextBtn.querySelector('[data-i18n]') || _nextBtn.querySelector('span');
            if (textSpan) {
                textSpan.textContent = isLast ? _t('tutorial.finish') : _t('tutorial.next');
                textSpan.removeAttribute('data-i18n');
            }
        }
    };

    // ─── Step Rendering ────────────────────────────────────────────────
    const _renderStep = (index) => {
        _currentStep = index;
        const step   = STEPS[index];

        _highlight(step);
        _updateNav();

        requestAnimationFrame(() => {
            if (_active) _buildCards(step);
        });
    };

    // ─── Resize Handler ────────────────────────────────────────────────
    const _onResize = () => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (_active) _renderStep(_currentStep);
        }, 100);
    };

    // ─── Public API ────────────────────────────────────────────────────
    const start = () => {
        if (_active) return;

        _overlayEl = document.getElementById('tutorialOverlay');
        _svgEl     = document.getElementById('tutorialLines');
        _navBarEl  = document.getElementById('tutorialNav');
        _prevBtn   = document.getElementById('tutorialPrevBtn');
        _nextBtn   = document.getElementById('tutorialNextBtn');
        _stepLabel = document.getElementById('tutorialStepLabel');

        if (!_overlayEl || !_svgEl || !_navBarEl) return;

        _active      = true;
        _currentStep = 0;

        _savedScrollY = window.scrollY || window.pageYOffset;

        // Set body.style.top BEFORE adding tutorial-active (position:fixed).
        // This keeps the visible content unchanged when the body becomes fixed.
        document.body.style.top = `-${_savedScrollY}px`;

        _overlayEl.style.display = 'block';
        _svgEl.style.display     = 'block';
        _navBarEl.style.display  = 'flex';
        document.body.classList.add('tutorial-active');

        if (DRC.UIHelpers && DRC.UIHelpers.refreshIcons) DRC.UIHelpers.refreshIcons();

        _escHandler = (e) => { if (e.key === 'Escape') stop(); };
        document.addEventListener('keydown', _escHandler);

        // Block scrolling during tutorial
        _wheelHandler = (e) => {
            if (_active) { e.preventDefault(); e.stopPropagation(); }
        };
        _touchHandler = (e) => {
            if (_active && e.target.closest('.tutorial-card') === null) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        window.addEventListener('wheel',     _wheelHandler, { passive: false, capture: true });
        window.addEventListener('touchmove', _touchHandler, { passive: false, capture: true });
        document.addEventListener('wheel',     _wheelHandler, { passive: false, capture: true });
        document.addEventListener('touchmove', _touchHandler, { passive: false, capture: true });

        if (DRC.I18n && DRC.I18n.onLanguageChange) {
            _langUnsub = DRC.I18n.onLanguageChange(() => {
                if (_active) _renderStep(_currentStep);
            });
        }

        window.addEventListener('resize', _onResize);

        _renderStep(0);
    };

    const stop = () => {
        if (!_active) return;
        _active = false;

        _clearCards();
        document.querySelectorAll('.tutorial-highlight').forEach(el => {
            el.classList.remove('tutorial-highlight');
        });
        // Clear body.style.top before removing position:fixed so there is no jump.
        document.body.style.top = '';
        document.body.classList.remove('tutorial-active');
        window.scrollTo(0, _savedScrollY);

        if (_overlayEl) _overlayEl.style.display = 'none';
        if (_svgEl)     _svgEl.style.display     = 'none';
        if (_navBarEl)  _navBarEl.style.display  = 'none';

        if (_escHandler) {
            document.removeEventListener('keydown', _escHandler);
            _escHandler = null;
        }
        if (_wheelHandler) {
            window.removeEventListener('wheel', _wheelHandler, { capture: true });
            document.removeEventListener('wheel', _wheelHandler, { capture: true });
            _wheelHandler = null;
        }
        if (_touchHandler) {
            window.removeEventListener('touchmove', _touchHandler, { capture: true });
            document.removeEventListener('touchmove', _touchHandler, { capture: true });
            _touchHandler = null;
        }
        if (_langUnsub) {
            _langUnsub();
            _langUnsub = null;
        }
        window.removeEventListener('resize', _onResize);
        _currentStep = 0;
    };

    const next = () => {
        if (!_active) return;
        if (_currentStep >= STEPS.length - 1) { stop(); return; }
        _renderStep(_currentStep + 1);
    };

    const prev = () => {
        if (!_active || _currentStep <= 0) return;
        _renderStep(_currentStep - 1);
    };

    const isActive = () => _active;

    return { start, stop, next, prev, isActive };
})();

/**
 * Profile Warning Modal
 *
 * Shows a centered modal when user resets all values without an active profile.
 *
 * @module ProfileWarning
 * @memberof DRC
 */

(function() {
    'use strict';

    window.DRC = window.DRC || {};

    let _modalResolve = null;
    let _sessionDismissed = false;
    let _focusTrap = null;
    let _previousFocus = null;

    function hasActiveProfile() {
        const patientData = DRC.PatientManager?.getActivePatientData?.();
        return patientData !== null && patientData !== undefined;
    }

    function checkForUnsavedData() {
        const current = DRC.UIController?.readInputs?.();
        if (!current) return false;

        const isMetric = DRC.App?._getState?.()?.isMetric ?? false;
        const D = DRC.CONFIG?.DEFAULTS;
        if (!D) return false;

        const numericFields = ['age', 'sbp', 'cholHDL', 'totalChol'];
        const tolerance = 0.001;

        for (const field of numericFields) {
            let defaultValue;
            if (['cholHDL', 'totalChol'].includes(field)) {
                defaultValue = isMetric ? D[field]?.si : D[field]?.us;
            } else {
                defaultValue = D[field];
            }

            if (defaultValue !== undefined && Math.abs(current[field] - defaultValue) > tolerance) {
                return true;
            }
        }

        if (current.sex !== (D.sex ? 1 : 0)) return true;
        if (current.trtBp !== (D.trtBp ? 1 : 0)) return true;
        if (current.smoking !== (D.smoking ? 1 : 0)) return true;
        if (current.diabetes !== (D.diabetes ? 1 : 0)) return true;

        return false;
    }

    function hideModal() {
        const modal = document.getElementById('profileWarningModal');
        if (modal) {
            modal.classList.remove('open');
            modal.style.display = 'none';
        }
        document.body.style.overflow = '';
        if (_focusTrap) { _focusTrap.deactivate(); _focusTrap = null; }
        if (_previousFocus) { _previousFocus.focus(); _previousFocus = null; }
        _modalResolve = null;
    }

    function showModal() {
        return new Promise((resolve) => {
            _modalResolve = resolve;

            const modal = document.getElementById('profileWarningModal');
            if (!modal) {
                resolve('cancel');
                return;
            }

            modal.classList.add('open');
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            _previousFocus = document.activeElement;
            _focusTrap = DRC.Utils?.createFocusTrap?.(modal);
            if (_focusTrap) _focusTrap.activate();

            if (DRC.UIHelpers?.refreshIcons) {
                DRC.UIHelpers.refreshIcons();
            }
        });
    }

    function handleAction(action) {
        if (_modalResolve) {
            _modalResolve(action);
        }
        hideModal();
    }

    function openPatientDrawer() {
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

        setTimeout(() => {
            const nameInput = document.getElementById('pdNewPatientName');
            if (nameInput) nameInput.focus();
        }, 100);
    }

    async function checkBeforeReset() {
        if (hasActiveProfile()) return true;
        if (!checkForUnsavedData()) return true;
        if (_sessionDismissed) return true;

        const choice = await showModal();

        if (choice === 'create') {
            openPatientDrawer();
            return false;
        } else if (choice === 'continue') {
            _sessionDismissed = true;
            return true;
        }
        return false;
    }

    function init() {
        const closeBtn = document.getElementById('profileWarnClose');
        const createBtn = document.getElementById('profileWarnCreateBtn');
        const continueBtn = document.getElementById('profileWarnContinueBtn');
        const cancelBtn = document.getElementById('profileWarnCancelBtn');
        const modal = document.getElementById('profileWarningModal');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => handleAction('cancel'));
        }

        if (createBtn) {
            createBtn.addEventListener('click', () => handleAction('create'));
        }

        if (continueBtn) {
            continueBtn.addEventListener('click', () => handleAction('continue'));
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => handleAction('cancel'));
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    handleAction('cancel');
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const m = document.getElementById('profileWarningModal');
                if (m?.classList.contains('open')) {
                    handleAction('cancel');
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    DRC.ProfileWarning = {
        hasActiveProfile,
        checkForUnsavedData,
        checkBeforeReset,
        showModal,
        hideModal
    };
})();

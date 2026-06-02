/**
 * @fileoverview Patient Manager — CRUD operations with localStorage + Excel I/O.
 *
 * Manages patient profiles stored in localStorage with import/export
 * capabilities via SheetJS (xlsx). Provides a drawer-based UI for
 * adding, loading, updating, and deleting patient records.
 *
 * @module PatientManager
 * @memberof DRC
 */

'use strict';

// Translation helper
const t = DRC.Utils.createTranslator();

DRC.PatientManager = (() => {
    // ─── Accessible toast and modal helpers (replace native dialogs) ────
    let _toastTimer = null;

    /**
     * Show an accessible toast notification (replaces alert()).
     * Uses visibility:hidden so the aria-live region is preserved.
     * @param {string} message
     */
    const showToast = (message) => {
        let container = document.getElementById('drc-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'drc-toast-container';
            container.setAttribute('role', 'status');
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            container.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:99999;pointer-events:none;';
            document.body.appendChild(container);
        }
        if (_toastTimer) clearTimeout(_toastTimer);
        container.textContent = message;
        container.style.cssText = container.style.cssText.replace(/visibility:\s*hidden;?/g, '').replace(/display:\s*none;?/g, '') + ';display:block;visibility:visible;';
        container.className = 'drc-toast';
        _toastTimer = setTimeout(() => { container.style.visibility = 'hidden'; }, 4000);
    };

    /**
     * Custom confirm dialog with focus trap and focus restoration (H3/L1).
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    const showConfirm = (message) => new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', message);
        overlay.className = 'drc-modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'drc-modal';

        const msg = document.createElement('p');
        msg.textContent = message;

        const btnRow = document.createElement('div');
        btnRow.className = 'drc-modal-btn-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = DRC.Utils?.createTranslator?.()('buttons.cancel', 'Cancel') || 'Cancel';
        cancelBtn.className = 'drc-btn drc-btn-secondary';
        cancelBtn.onclick = () => { cleanup(); resolve(false); };

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = DRC.Utils?.createTranslator?.()('buttons.confirm', 'Confirm') || 'Confirm';
        confirmBtn.className = 'drc-btn drc-btn-primary';
        confirmBtn.onclick = () => { cleanup(); resolve(true); };

        let focusTrap = null;
        const cleanup = () => {
            if (focusTrap) focusTrap.deactivate();
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') {
                try { previousFocus.focus(); } catch (_) { /* ignore */ }
            }
        };

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        dialog.appendChild(msg);
        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        focusTrap = DRC.Utils?.createFocusTrap?.(overlay);
        if (focusTrap) focusTrap.activate();
        confirmBtn.focus();

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(false); }
        });
    });

    /**
     * Custom prompt dialog with focus trap and focus restoration (H3/L1).
     * @param {string} message
     * @param {string} [defaultValue]
     * @returns {Promise<string|null>}
     */
    const showPrompt = (message, defaultValue) => new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', message);
        overlay.className = 'drc-modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'drc-modal';

        const msg = document.createElement('p');
        msg.textContent = message;

        const input = document.createElement('input');
        input.type = 'text';
        input.value = defaultValue || '';
        input.className = 'drc-prompt-input';

        const btnRow = document.createElement('div');
        btnRow.className = 'drc-modal-btn-row';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = DRC.Utils?.createTranslator?.()('buttons.cancel', 'Cancel') || 'Cancel';
        cancelBtn.className = 'drc-btn drc-btn-secondary';
        cancelBtn.onclick = () => { cleanup(); resolve(null); };

        const okBtn = document.createElement('button');
        okBtn.textContent = DRC.Utils?.createTranslator?.()('buttons.ok', 'OK') || 'OK';
        okBtn.className = 'drc-btn drc-btn-primary';
        okBtn.onclick = () => { cleanup(); resolve(input.value); };

        let focusTrap = null;
        const cleanup = () => {
            if (focusTrap) focusTrap.deactivate();
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') {
                try { previousFocus.focus(); } catch (_) { /* ignore */ }
            }
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { cleanup(); resolve(input.value); }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(msg);
        dialog.appendChild(input);
        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        focusTrap = DRC.Utils?.createFocusTrap?.(overlay);
        if (focusTrap) focusTrap.activate();
        input.focus();
        input.select();

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { cleanup(); resolve(null); }
        });
    });

    const STORAGE_KEY = 'drc_v1_patients';
    /** @deprecated Legacy key for backward-compatible migration */
    const LEGACY_STORAGE_KEY = 'diabetes_risk_patients';
    const FIELDS = DRC.CONFIG.ALL_FIELDS;

    let patients = [];
    let activePatientId = null;

    // ─── Encryption Storage Helpers ─────────────────────────────────────
    // NOTE: Passwords are held in-memory only — never written to any Web Storage
    // API — to prevent clear-text storage of sensitive information.
    // They are cleared automatically when the page is closed or refreshed.
    let _lastPassword = null;
    let _defaultPassword = null;
    let _defaultEnabled = false;

    const ENCRYPTION_STORAGE = {
        getLastPassword: () => _lastPassword,
        setLastPassword: (pwd) => { _lastPassword = pwd; },
        clearLastPassword: () => { _lastPassword = null; },
        getDefaultPassword: () => _defaultPassword,
        setDefaultPassword: (pwd) => { _defaultPassword = pwd; },
        clearDefaultPassword: () => { _defaultPassword = null; },
        isDefaultEnabled: () => _defaultEnabled,
        setDefaultEnabled: (enabled) => { _defaultEnabled = !!enabled; }
    };

    // ─── Persistence ────────────────────────────────────────────────────

    /**
     * Save patient data to localStorage.
     * Note: This is a client-side only application. Data never leaves the user's
     * browser. Data is obfuscated with btoa() encoding for additional security.
     * For production, consider using Web Crypto API for true encryption.
     */
    const saveToStorage = () => {
        try {
            // Data is stored client-side only, never transmitted to any server.
            // btoa() provides obfuscation only, not encryption.
            // KNOWN LIMITATION: For production use with real patient data,
            // implement Web Crypto API (AES-GCM) encryption.
            const jsonStr = JSON.stringify({ patients, activePatientId });
            const encoded = btoa(jsonStr);
            localStorage.setItem(STORAGE_KEY, encoded);
        } catch (_) {
            console.warn('PatientManager: localStorage quota exceeded, data not saved.');
            showToast(t('patientManager.saveFailed', 'Failed to save — storage is full. Please export and delete old profiles.'));
        }
    };

    const loadFromStorage = () => {
        try {
            let stored = localStorage.getItem(STORAGE_KEY);
            // Migrate from legacy key if new key is empty
            if (!stored) {
                stored = localStorage.getItem(LEGACY_STORAGE_KEY);
                if (stored) {
                    localStorage.setItem(STORAGE_KEY, stored);
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                }
            }
            if (!stored) return;

            // Decode obfuscated data (Base64)
            // Fall back to treating as plaintext for backward compatibility with unencoded data
            try {
                stored = atob(stored);
            } catch (_) {
                // If atob fails, data is likely plaintext (old format), proceed as-is
            }

            // Helper: recursively check object for prototype pollution keys at all levels
            const isSafeObject = (obj) => {
                if (obj === null || typeof obj !== 'object') return true;
                for (const key in obj) {
                    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                        return false;
                    }
                    if (!isSafeObject(obj[key])) return false;
                }
                return true;
            };

            // Use reviver to prevent prototype pollution
            const parsed = JSON.parse(stored, (key, value) => {
                // Reject __proto__, constructor, prototype keys
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    return undefined;
                }
                // Also check nested objects for pollution attempts
                if (typeof value === 'object' && value !== null && !isSafeObject(value)) {
                    return undefined;
                }
                return value;
            });

            if (parsed && typeof parsed === 'object') {
                // Validate data structure
                if (Array.isArray(parsed.patients)) {
                    patients = parsed.patients.filter(p => p && typeof p === 'object' && p.id);
                }
                if (typeof parsed.activePatientId === 'string' || parsed.activePatientId === null) {
                    activePatientId = parsed.activePatientId;
                }
            }
        } catch (e) {
            patients = [];
            activePatientId = null;
        }
    };

    // ─── Value capture/apply ────────────────────────────────────────────

    /** Capture current slider/toggle values + displayed risk + active unit system. */
    const captureCurrentValues = () => {
        const vals = {};
        FIELDS.forEach(f => {
            if (f === 'sex')        vals[f] = document.getElementById('sex-toggle')?.checked ? 1 : 0;
            else if (f === 'trtBp') vals[f] = document.getElementById('trtBp-toggle')?.checked ? 1 : 0;
            else if (f === 'smoking') vals[f] = document.getElementById('smoking-toggle')?.checked ? 1 : 0;
            else if (f === 'diabetes') vals[f] = document.getElementById('diabetes-toggle')?.checked ? 1 : 0;
            else                    vals[f] = parseFloat(document.getElementById(`${f}-value`)?.value) || 0;
        });
        vals._riskPct  = parseFloat(document.getElementById('risk-percentage')?.textContent) || 0;
        // Store active unit system so values can be correctly interpreted on load
        vals._isMetric = DRC.App?._getState?.()?.isMetric ?? false;
        // Store active model so it can be restored on load
        vals._activeModel = DRC.App?._getState?.()?.activeModel || DRC.CONFIG.DEFAULT_MODEL;
        return vals;
    };

    /** Apply stored patient data to sliders/toggles.
     *  Converts values if the saved unit system differs from the current one.
     */
    const applyValues = (data) => {
        if (!data) return;
        const currentIsMetric = DRC.App?._getState?.()?.isMetric ?? false;
        // Legacy profiles without _isMetric: assume US units (false) as conservative default
        // This prevents incorrect conversion when loading old profiles in SI mode
        const savedIsMetric = data._isMetric ?? false;

        FIELDS.forEach(f => {
            if (f === 'sex' || f === 'trtBp' || f === 'smoking' || f === 'diabetes') {
                const toggleId = f === 'sex' ? 'sex-toggle' : `${f}-toggle`;
                const toggle = document.getElementById(toggleId);
                // Legacy profiles without sex field -> default to Male (1)
                if (toggle) {
                    toggle.checked = f === 'sex' ? (data[f] ?? 1) : !!data[f];
                    toggle.setAttribute('aria-checked', String(toggle.checked));
                }
            } else {
                // Convert value if the saved unit system differs from the current display unit
                let val = data[f] ?? 0;
                if (savedIsMetric !== currentIsMetric && DRC.CONFIG.CONVERTIBLE_FIELDS.includes(f)) {
                    const internalVal = savedIsMetric ? DRC.ConversionService.convertField(f, val, false) : val;
                    val = currentIsMetric ? DRC.ConversionService.convertField(f, internalVal, true) : internalVal;
                }
                // Clamp to valid slider range to prevent out-of-range display values
                const mode = currentIsMetric ? 'si' : 'us';
                if (DRC.CONFIG.RANGES[f]) {
                    const [min, max, step] = DRC.CONFIG.RANGES[f][mode];
                    val = DRC.UIHelpers?.clampAndRound?.(val, min, max, step) ?? Math.min(Math.max(val, min), max);
                }
                const input  = document.getElementById(`${f}-value`);
                const slider = document.getElementById(`${f}-slider`);
                if (input)  input.value  = val;
                if (slider) slider.value = val;
                DRC.UIController?.updateSliderFill?.(f);
            }
        });
    };

    // ─── Unique ID generation ───────────────────────────────────────────

    /**
     * Generate a cryptographically secure unique ID.
     * Uses crypto.randomUUID() when available, falls back to crypto.getRandomValues().
     */
    const generateId = () => {
        // Use native UUID if available (modern browsers)
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback: use crypto.getRandomValues for secure random bytes
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const bytes = new Uint8Array(16);
            crypto.getRandomValues(bytes);
            // Convert to hex string with timestamp prefix for uniqueness
            const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
            return Date.now().toString(36) + '_' + hex.slice(0, 16);
        }
        // Final fallback for very old browsers — uses multiple entropy sources
        const ts = Date.now().toString(36);
        const perf = (typeof performance !== 'undefined' ? performance.now() : 0).toString(36).replace('.', '');
        const rand = Math.random().toString(36).slice(2, 10);
        return ts + '_' + perf.slice(0, 6) + rand;
    };

    // ─── Encryption Modal Controllers ─────────────────────────────────

    let _encryptionResolve = null;
    let _passwordPromptResolve = null;
    let _encryptionFocusTrap = null;
    let _encryptionPreviousFocus = null;
    let _passwordPromptFocusTrap = null;
    let _passwordPromptPreviousFocus = null;

    /** Initialize encryption modal event listeners. */
    const initEncryptionModal = () => {
        const modal = document.getElementById('encryptionModal');
        if (!modal) return;

        // Escape key closes modal
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                _hideEncryptionModal();
                if (_encryptionResolve) {
                    _encryptionResolve({ cancelled: true, useEncryption: false, password: '' });
                    _encryptionResolve = null;
                }
            }
        });

        // Radio button changes - show/hide password section
        const optionNone = document.getElementById('encOptionNone');
        const optionPassword = document.getElementById('encOptionPassword');
        const passwordSection = document.getElementById('encPasswordSection');

        const togglePasswordSection = () => {
            if (passwordSection) {
                passwordSection.style.display = optionPassword?.checked ? 'block' : 'none';
            }
        };

        optionNone?.addEventListener('change', togglePasswordSection);
        optionPassword?.addEventListener('change', togglePasswordSection);

        // Password visibility toggle
        const passwordInput = document.getElementById('encPasswordInput');
        const passwordToggle = document.getElementById('encPasswordToggle');
        const passwordToggleIcon = document.getElementById('encPasswordToggleIcon');

        passwordToggle?.addEventListener('click', () => {
            if (passwordInput) {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                if (passwordToggleIcon) {
                    passwordToggleIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });

        // Quick options buttons
        const lastPasswordBtn = document.getElementById('encUseLastPassword');
        const defaultPasswordBtn = document.getElementById('encUseDefaultPassword');

        lastPasswordBtn?.addEventListener('click', () => {
            const lastPwd = ENCRYPTION_STORAGE.getLastPassword();
            if (lastPwd && passwordInput) {
                passwordInput.value = lastPwd;
                optionPassword.checked = true;
                togglePasswordSection();
            }
        });

        defaultPasswordBtn?.addEventListener('click', () => {
            const defaultPwd = ENCRYPTION_STORAGE.getDefaultPassword();
            if (defaultPwd && passwordInput) {
                passwordInput.value = defaultPwd;
                optionPassword.checked = true;
                togglePasswordSection();
            }
        });

        // Close button
        document.getElementById('encModalClose')?.addEventListener('click', () => {
            _hideEncryptionModal();
            if (_encryptionResolve) {
                _encryptionResolve({ cancelled: true, useEncryption: false, password: '' });
                _encryptionResolve = null;
            }
        });

        // Cancel button
        document.getElementById('encCancelBtn')?.addEventListener('click', () => {
            _hideEncryptionModal();
            if (_encryptionResolve) {
                _encryptionResolve({ cancelled: true, useEncryption: false, password: '' });
                _encryptionResolve = null;
            }
        });

        // Download/Confirm button
        document.getElementById('encDownloadBtn')?.addEventListener('click', () => {
            const useEnc = optionPassword?.checked ?? false;
            const password = passwordInput?.value ?? '';

            // Validate password if encryption is selected
            if (useEnc && password.length < 8) {
                const errorEl = document.getElementById('encPasswordError');
                if (errorEl) errorEl.style.display = 'block';
                return;
            }

            // Handle "remember for session" checkbox
            const rememberSession = document.getElementById('encRememberSession')?.checked ?? false;
            if (rememberSession && useEnc && password) {
                ENCRYPTION_STORAGE.setLastPassword(password);
            }

            // Handle "set as default" checkbox
            const setDefault = document.getElementById('encSetDefault')?.checked ?? false;
            if (setDefault && useEnc && password) {
                ENCRYPTION_STORAGE.setDefaultPassword(password);
                ENCRYPTION_STORAGE.setDefaultEnabled(true);
            }

            _hideEncryptionModal();
            if (_encryptionResolve) {
                _encryptionResolve({ cancelled: false, useEncryption: useEnc, password });
                _encryptionResolve = null;
            }
        });
    };

    /** Hide encryption modal. */
    const _hideEncryptionModal = () => {
        const modal = document.getElementById('encryptionModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
        // Focus trap: deactivate and restore focus
        if (_encryptionFocusTrap) { _encryptionFocusTrap.deactivate(); _encryptionFocusTrap = null; }
        // Reactivate drawer focus trap if drawer is still open and visible
        if (_drawerFocusTrap) {
            const drawer = document.getElementById('patientDrawer');
            if (drawer && drawer.classList.contains('open') && getComputedStyle(drawer).display !== 'none') _drawerFocusTrap.activate();
        }
        if (_encryptionPreviousFocus) { _encryptionPreviousFocus.focus(); _encryptionPreviousFocus = null; }
        // Clear password input
        const passwordInput = document.getElementById('encPasswordInput');
        if (passwordInput) passwordInput.value = '';
        // Hide error
        const errorEl = document.getElementById('encPasswordError');
        if (errorEl) errorEl.style.display = 'none';
    };

    /**
     * Show encryption modal and return Promise with user selection.
     * @returns {Promise<{cancelled: boolean, useEncryption: boolean, password: string}>}
     */
    const showEncryptionModal = () => {
        return new Promise((resolve) => {
            _encryptionResolve = resolve;

            const modal = document.getElementById('encryptionModal');
            const optionNone = document.getElementById('encOptionNone');
            const optionPassword = document.getElementById('encOptionPassword');
            const passwordSection = document.getElementById('encPasswordSection');
            const passwordInput = document.getElementById('encPasswordInput');
            const quickOptions = document.getElementById('encQuickOptions');

            // Reset form state
            if (optionNone) optionNone.checked = true;
            if (optionPassword) optionPassword.checked = false;
            if (passwordSection) passwordSection.style.display = 'none';
            if (passwordInput) passwordInput.value = '';

            // Populate quick options using safe DOM methods
            if (quickOptions) {
                // Clear existing quick options
                while (quickOptions.firstChild) {
                    quickOptions.removeChild(quickOptions.firstChild);
                }

                const labelSpan = document.createElement('span');
                labelSpan.className = 'quick-options-label';
                labelSpan.textContent = t('patientManager.quickSelect', 'Quick select:');
                quickOptions.appendChild(labelSpan);

                // Last password button
                const lastPwd = ENCRYPTION_STORAGE.getLastPassword();
                if (lastPwd) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'quick-option-btn';

                    const icon = document.createElement('i');
                    icon.setAttribute('data-lucide', 'history');
                    icon.className = 'lucide-icon';
                    btn.appendChild(icon);

                    btn.appendChild(document.createTextNode(' Last Password'));

                    btn.addEventListener('click', () => {
                        if (passwordInput) passwordInput.value = lastPwd;
                        if (optionPassword) optionPassword.checked = true;
                        if (passwordSection) passwordSection.style.display = 'block';
                    });

                    quickOptions.appendChild(btn);
                }

                // Default password button
                const defaultPwd = ENCRYPTION_STORAGE.getDefaultPassword();
                if (defaultPwd && ENCRYPTION_STORAGE.isDefaultEnabled()) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'quick-option-btn';

                    const icon = document.createElement('i');
                    icon.setAttribute('data-lucide', 'star');
                    icon.className = 'lucide-icon';
                    btn.appendChild(icon);

                    btn.appendChild(document.createTextNode(' Default Password'));

                    btn.addEventListener('click', () => {
                        if (passwordInput) passwordInput.value = defaultPwd;
                        if (optionPassword) optionPassword.checked = true;
                        if (passwordSection) passwordSection.style.display = 'block';
                    });

                    quickOptions.appendChild(btn);
                }

                // Initialize icons
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }

            // Show modal
            if (modal) {
                modal.style.display = 'flex';
                // Force reflow for animation
                void modal.offsetWidth;
                modal.classList.add('open');

                // Focus trap: store previous focus and activate
                _encryptionPreviousFocus = document.activeElement;
                _encryptionFocusTrap = DRC.Utils.createFocusTrap(modal);
                _encryptionFocusTrap.activate();
                // Deactivate drawer focus trap while modal is open (prevents conflict)
                if (_drawerFocusTrap) _drawerFocusTrap.deactivate();
            }
        });
    };

    /** Initialize password prompt modal event listeners. */
    const initPasswordPromptModal = () => {
        const modal = document.getElementById('passwordPromptModal');
        if (!modal) return;

        // Escape key closes modal
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                _hidePasswordPromptModal();
                if (_passwordPromptResolve) {
                    _passwordPromptResolve(null);
                    _passwordPromptResolve = null;
                }
            }
        });

        // Password visibility toggle
        const passwordInput = document.getElementById('pwdPromptInput');
        const passwordToggle = document.getElementById('pwdPromptToggle');
        const passwordToggleIcon = document.getElementById('pwdPromptToggleIcon');

        passwordToggle?.addEventListener('click', () => {
            if (passwordInput) {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                if (passwordToggleIcon) {
                    passwordToggleIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });

        // Close button
        document.getElementById('pwdPromptClose')?.addEventListener('click', () => {
            _hidePasswordPromptModal();
            if (_passwordPromptResolve) {
                _passwordPromptResolve(null);
                _passwordPromptResolve = null;
            }
        });

        // Cancel button
        document.getElementById('pwdPromptCancelBtn')?.addEventListener('click', () => {
            _hidePasswordPromptModal();
            if (_passwordPromptResolve) {
                _passwordPromptResolve(null);
                _passwordPromptResolve = null;
            }
        });

        // Decrypt button
        document.getElementById('pwdPromptDecryptBtn')?.addEventListener('click', () => {
            const password = passwordInput?.value ?? '';
            if (password.length < 8) {
                const errorEl = document.getElementById('pwdPromptError');
                const errorText = document.getElementById('pwdPromptErrorText');
                if (errorEl) errorEl.style.display = 'block';
                if (errorText) errorText.textContent = t('patientManager.passwordMinLength', 'Password must be at least 8 characters long');
                return;
            }
            _hidePasswordPromptModal();
            if (_passwordPromptResolve) {
                _passwordPromptResolve(password);
                _passwordPromptResolve = null;
            }
        });

        // Enter key support
        passwordInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('pwdPromptDecryptBtn')?.click();
            }
        });
    };

    /** Hide password prompt modal. */
    const _hidePasswordPromptModal = () => {
        const modal = document.getElementById('passwordPromptModal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('open');
        }
        // Focus trap: deactivate and restore focus
        if (_passwordPromptFocusTrap) { _passwordPromptFocusTrap.deactivate(); _passwordPromptFocusTrap = null; }
        // Reactivate drawer focus trap if drawer is still open and visible
        if (_drawerFocusTrap) {
            const drawer = document.getElementById('patientDrawer');
            if (drawer && drawer.classList.contains('open') && getComputedStyle(drawer).display !== 'none') _drawerFocusTrap.activate();
        }
        if (_passwordPromptPreviousFocus) { _passwordPromptPreviousFocus.focus(); _passwordPromptPreviousFocus = null; }
        const passwordInput = document.getElementById('pwdPromptInput');
        if (passwordInput) passwordInput.value = '';
        const errorEl = document.getElementById('pwdPromptError');
        if (errorEl) errorEl.style.display = 'none';
    };

    /**
     * Show password prompt modal for importing encrypted files.
     * @param {string} filename - Name of the file being imported
     * @returns {Promise<string|null>} Password or null if cancelled
     */
    const showPasswordPrompt = (filename) => {
        return new Promise((resolve) => {
            _passwordPromptResolve = resolve;

            const modal = document.getElementById('passwordPromptModal');
            const passwordInput = document.getElementById('pwdPromptInput');
            const titleEl = document.getElementById('pwdPromptTitle');

            // Update title with filename if provided (using safe DOM methods)
            if (titleEl && filename) {
                // Clear existing content safely
                while (titleEl.firstChild) {
                    titleEl.removeChild(titleEl.firstChild);
                }
                // Add icon
                const icon = document.createElement('i');
                icon.setAttribute('data-lucide', 'lock');
                icon.className = 'lucide-icon';
                titleEl.appendChild(icon);
                // Add text
                titleEl.appendChild(document.createTextNode(' ' + t('patientManager.encryptedFile', 'Encrypted File')));
            }

            if (passwordInput) passwordInput.value = '';

            if (modal) {
                modal.style.display = 'flex';
                void modal.offsetWidth;
                modal.classList.add('open');

                // Focus trap: store previous focus and activate
                _passwordPromptPreviousFocus = document.activeElement;
                _passwordPromptFocusTrap = DRC.Utils.createFocusTrap(modal);
                _passwordPromptFocusTrap.activate();
                // Deactivate drawer focus trap while modal is open (prevents conflict)
                if (_drawerFocusTrap) _drawerFocusTrap.deactivate();
            }
        });
    };

    // ─── Modal Helpers ──────────────────────────────────────────────────

    /**
     * Generic N-option modal dialog (M2).
     * @param {string} message
     * @param {Array<{label: string, value: string, isPrimary?: boolean}>} options
     *   Button specs in left-to-right order. The last isPrimary button receives focus.
     * @returns {Promise<string>} Resolves to the value of the clicked button, or 'cancel' on Escape.
     */
    const _showOptionDialog = (message, options) => new Promise(resolve => {
        const previousFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', message);
        overlay.className = 'drc-modal-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'drc-modal';
        const msg = document.createElement('p');
        msg.textContent = message;
        const btnRow = document.createElement('div');
        btnRow.className = 'drc-modal-btn-row' + (options.length >= 4 ? ' drc-modal-btn-row--grid' : '');

        let focusTrap = null;
        let primaryBtn = null;
        const cleanup = () => {
            if (focusTrap) focusTrap.deactivate();
            overlay.remove();
            if (previousFocus && typeof previousFocus.focus === 'function') {
                try { previousFocus.focus(); } catch (_) {}
            }
        };

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt.label;
            btn.className = opt.isPrimary ? 'drc-btn drc-btn-primary' : 'drc-btn drc-btn-secondary';
            btn.onclick = () => { cleanup(); resolve(opt.value); };
            if (opt.isPrimary) primaryBtn = btn;
            btnRow.appendChild(btn);
        });

        dialog.appendChild(msg);
        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        focusTrap = DRC.Utils?.createFocusTrap?.(overlay);
        if (focusTrap) focusTrap.activate();
        if (primaryBtn) primaryBtn.focus();
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { cleanup(); resolve('cancel'); }
        });
    });

    /**
     * Resolve save data when a treatment simulation is active (M2).
     * Shows a dialog: save original, save simulated, save both, or cancel.
     * @returns {Promise<Object|null>} Data to save, or null if user cancelled.
     *   For 'both': returns { choice: 'both', originalData, simulatedData }.
     *   For 'original'/'simulated': returns the single data object.
     */
    const _resolveSaveDataForSimulation = async () => {
        const simulatedData = captureCurrentValues();
        const sim = DRC.TreatmentSimulator;
        if (!sim?.hasActiveSimulation?.()) return simulatedData;

        const snap = sim.getPreSimulationSnapshot?.() || {};
        const factors = Object.keys(snap);
        if (factors.length === 0) return simulatedData;

        // Build original data from snapshot
        const currentIsMetric = DRC.UIController?.getUnitToggleState?.() ?? false;
        const originalData = { ...simulatedData };
        factors.forEach(f => {
            const entry = snap[f];
            if (!entry || typeof entry !== 'object') return;
            let val = entry.value;
            if (entry.isMetric !== currentIsMetric && DRC.CONFIG.CONVERTIBLE_FIELDS.includes(f)) {
                const internalVal = entry.isMetric ? DRC.ConversionService.convertField(f, val, false) : val;
                val = currentIsMetric ? DRC.ConversionService.convertField(f, internalVal, true) : internalVal;
            }
            originalData[f] = val;
        });
        const origRiskEl = document.getElementById('risk-percentage');
        if (origRiskEl) originalData._riskPct = parseFloat(origRiskEl.textContent) || originalData._riskPct;

        const simRiskEl = document.getElementById('chosen-risk-percentage');
        if (simRiskEl) simulatedData._riskPct = parseFloat(simRiskEl.textContent) || simulatedData._riskPct;

        const tr = DRC.Utils?.createTranslator?.() || ((_, fb) => fb);
        const msg = tr('modals.simulationSaveWarning.message',
            'You have an active treatment simulation. What would you like to save?');
        const options = [
            { label: tr('buttons.cancel', 'Cancel'), value: 'cancel' },
            { label: tr('modals.simulationSaveWarning.saveSimulated', 'Save Simulated'), value: 'simulated' },
            { label: tr('modals.simulationSaveWarning.saveBoth', 'Save Both'), value: 'both' },
            { label: tr('modals.simulationSaveWarning.saveOriginal', 'Save Original'), value: 'original', isPrimary: true },
        ];

        const choice = await _showOptionDialog(msg, options);
        _lastSaveChoice = choice;

        if (choice === 'cancel') return null;
        if (choice === 'original') return originalData;
        if (choice === 'simulated') return simulatedData;
        if (choice === 'both') return { choice: 'both', originalData, simulatedData };
        return null;
    };

    // ─── CRUD Operations ────────────────────────────────────────────────

    /** Helper to persist changes and refresh UI. */
    const _persistAndRender = () => {
        saveToStorage();
        renderList();
    };

    /**
     * Sanitize patient name to prevent XSS and normalize input.
     * @param {string} name - Raw name input.
     * @returns {string|null} Sanitized name or null if invalid.
     */
    const _sanitizePatientName = (name) => {
        if (!name || typeof name !== 'string') return null;
        // Trim whitespace and normalize
        let sanitized = name.trim();
        // Limit length (HTML maxlength should enforce, but double-check)
        if (sanitized.length === 0 || sanitized.length > 60) return null;
        // Strip dangerous chars as defense-in-depth — createSafeElement/textContent also prevents XSS.
        // Allow: letters, numbers, spaces, common punctuation, international chars
        // Block: < > " ' & and control characters
        sanitized = sanitized
            .replace(/[<>"'&]/g, '')
            .replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        // Final trim after sanitization
        sanitized = sanitized.trim();
        return sanitized.length > 0 ? sanitized : null;
    };

    const addPatient = async (name) => {
        const sanitizedName = _sanitizePatientName(name);
        if (!sanitizedName) return null;
        const result = await _resolveSaveDataForSimulation();
        if (result == null) return null;

        const tr = DRC.Utils?.createTranslator?.() || ((_, fb) => fb);

        if (result && typeof result === 'object' && result.choice === 'both') {
            const origSuffix = ' ' + tr('modals.simulationSaveWarning.suffixOriginal', '(Original)');
            const simSuffix = ' ' + tr('modals.simulationSaveWarning.suffixSimulated', '(Simulated)');
            const origId = generateId();
            const simId = generateId();
            patients.push({ id: origId, name: sanitizedName + origSuffix, data: result.originalData, riskPct: result.originalData._riskPct, savedAt: new Date().toISOString() });
            patients.push({ id: simId, name: sanitizedName + simSuffix, data: result.simulatedData, riskPct: result.simulatedData._riskPct, savedAt: new Date().toISOString() });
            activePatientId = simId;
            _lastBothSaveIds = { originalId: origId, simulatedId: simId };
            _persistAndRender();
            updateNavLabel();
            return patients.find(p => p.id === simId);
        }

        const patient = {
            id: generateId(), name: sanitizedName, data: result,
            riskPct: result._riskPct, savedAt: new Date().toISOString()
        };
        patients.push(patient);
        activePatientId = patient.id;
        _persistAndRender();
        updateNavLabel();
        return patient;
    };

    const updatePatient = async (id) => {
        const patient = patients.find(p => p.id === id);
        if (!patient) return;
        const result = await _resolveSaveDataForSimulation();
        if (result == null) return;

        const tr = DRC.Utils?.createTranslator?.() || ((_, fb) => fb);

        if (result && typeof result === 'object' && result.choice === 'both') {
            const origSuffix = ' ' + tr('modals.simulationSaveWarning.suffixOriginal', '(Original)');
            Object.assign(patient, { data: result.simulatedData, riskPct: result.simulatedData._riskPct, savedAt: new Date().toISOString() });
            const origId = generateId();
            patients.push({ id: origId, name: patient.name + origSuffix, data: result.originalData, riskPct: result.originalData._riskPct, savedAt: new Date().toISOString() });
            _lastBothSaveIds = { originalId: origId, simulatedId: patient.id };
            _persistAndRender();
            updateNavLabel();
            return;
        }

        Object.assign(patient, { data: result, riskPct: result._riskPct, savedAt: new Date().toISOString() });
        _persistAndRender();
        updateNavLabel();
    };

    const deletePatient = (id) => {
        patients = patients.filter(p => p.id !== id);
        if (activePatientId === id) activePatientId = null;
        _persistAndRender();
        updateNavLabel();
    };

    const renamePatient = (id, newName) => {
        const sanitizedName = _sanitizePatientName(newName);
        if (!sanitizedName) return false;
        const patient = patients.find(p => p.id === id);
        if (!patient) return false;
        patient.name = sanitizedName;
        _persistAndRender();
        updateNavLabel();
        return true;
    };

    const loadPatient = (id) => {
        const patient = patients.find(p => p.id === id);
        if (!patient) return;
        activePatientId = id;
        _lastSaveChoice = null;
        _lastBothSaveIds = { originalId: null, simulatedId: null };
        applyValues(patient.data);
        // Restore active model if saved with profile
        if (patient.data._activeModel && DRC.CONFIG.MODELS[patient.data._activeModel] && DRC.App?.switchModel) {
            DRC.App.switchModel(patient.data._activeModel);
        }
        _persistAndRender();
        updateNavLabel();
        if (DRC.App?.trigger) {
            DRC.App.trigger('risk:recalculate');
        } else {
            document.getElementById('age-slider')?.dispatchEvent(new Event('input'));
        }
    };

    // ─── Excel Import/Export ────────────────────────────────────────────

    /** Column mappings for Excel (column name -> field key). */
    const EXCEL_COLUMNS = {
        Name: 'name', Age: 'age', Sex_Male: 'sex', Ethnicity_African_American: 'race',
        Parental_Diabetes: 'parentHist', Systolic_BP: 'sbp', Height: 'height',
        Waist: 'waist', Fasting_Glucose: 'fastGlu', HDL_Cholesterol: 'cholHDL',
        Blood_Fats_Triglycerides: 'cholTri', Risk_Pct: 'riskPct', Saved_At: 'savedAt'
    };

    /** Build a single Excel row object from a patient record. */
    const _buildExcelRow = (p) => ({
        Name: p.name, Age: p.data.age, Sex_Male: p.data.sex ?? 1, Ethnicity_African_American: p.data.race,
        Parental_Diabetes: p.data.parentHist, Systolic_BP: p.data.sbp,
        Height: p.data.height, Waist: p.data.waist,
        Fasting_Glucose: p.data.fastGlu, HDL_Cholesterol: p.data.cholHDL,
        Blood_Fats_Triglycerides: p.data.cholTri, Risk_Pct: p.riskPct, Saved_At: p.savedAt
    });

    /** Trigger file download with given data. */
    const _downloadFile = (data, filename, mimeType) => {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportToExcel = async () => {
        if (patients.length === 0) { showToast(t('patientManager.noPatientsExport', 'No patients to export.')); return; }

        // Show encryption modal
        const result = await showEncryptionModal();
        if (result.cancelled) return;

        const rows = patients.map(_buildExcelRow);
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Patients');

        // Generate Excel file as array buffer
        const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBytes = new Uint8Array(excelData);

        if (result.useEncryption && result.password) {
            // Encrypt the data
            if (!DRC.CryptoService) {
                showToast(t('patientManager.encryptionNotAvailable', 'Encryption service not available.'));
                return;
            }
            try {
                const encrypted = await DRC.CryptoService.encrypt(excelBytes, result.password);
                _downloadFile(encrypted, 'diabetes_risk_patients.drc', 'application/octet-stream');
            } catch (e) {
                console.error('Encryption failed:', e);
                showToast(t('patientManager.encryptionFailed', 'Encryption failed. Please try again.'));
            }
        } else {
            // Download as regular Excel file
            _downloadFile(excelBytes, 'diabetes_risk_patients.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
    };

    /** Export a single patient profile with formatted filename. */
    const exportSinglePatient = async (patientId) => {
        const patient = patients.find(p => p.id === patientId);
        if (!patient) { showToast(t('patientManager.patientNotFound', 'Patient not found.')); return; }

        // Show encryption modal
        const result = await showEncryptionModal();
        if (result.cancelled) return;

        const rows = [_buildExcelRow(patient)];

        // Format timestamp: YYYY-MM-DD
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 10);

        // Sanitize filename: remove special chars, limit length
        const sanitizedName = patient.name.replace(/[<>:"/\\|?*]/g, '_').slice(0, 50);
        const baseFilename = `${sanitizedName}_${timestamp}_DRC_Export`;

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Profile');

        // Generate Excel file as array buffer
        const excelData = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelBytes = new Uint8Array(excelData);

        if (result.useEncryption && result.password) {
            // Encrypt the data
            if (!DRC.CryptoService) {
                showToast(t('patientManager.encryptionNotAvailable', 'Encryption service not available.'));
                return;
            }
            try {
                const encrypted = await DRC.CryptoService.encrypt(excelBytes, result.password);
                _downloadFile(encrypted, `${baseFilename}.drc`, 'application/octet-stream');
            } catch (e) {
                console.error('Encryption failed:', e);
                showToast(t('patientManager.encryptionFailed', 'Encryption failed. Please try again.'));
            }
        } else {
            // Download as regular Excel file
            _downloadFile(excelBytes, `${baseFilename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
    };

    const importFromExcel = (file) => {
        // Validate file size (max 5MB)
        const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

        if (file.size > MAX_FILE_SIZE) {
            showToast(t('patientManager.fileTooLarge', 'File is too large. Maximum size is 5MB.'));
            return;
        }

        // Validate file extension (security check beyond HTML accept attribute)
        if (!/\.(xlsx|xls|drc)$/i.test(file.name)) {
            showToast(t('patientManager.invalidExtension', 'Invalid file type. Please upload an .xlsx, .xls, or .drc file.'));
            return;
        }

        // Check if file is encrypted .drc file
        const isDrcFile = file.name.toLowerCase().endsWith('.drc');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                let fileData = new Uint8Array(e.target.result);

                // Check if encrypted
                if (DRC.CryptoService && DRC.CryptoService.isEncrypted(fileData)) {
                    // Show password prompt
                    const password = await showPasswordPrompt(file.name);
                    if (!password) return; // User cancelled

                    // Decrypt
                    try {
                        fileData = await DRC.CryptoService.decrypt(fileData, password);
                    } catch (err) {
                        const errorEl = document.getElementById('pwdPromptError');
                        const errorText = document.getElementById('pwdPromptErrorText');
                        if (errorEl) errorEl.style.display = 'block';
                        if (errorText) errorText.textContent = t('patientManager.wrongPassword', 'Wrong password or corrupted file');
                        // Re-show modal
                        const passwordRetry = await showPasswordPrompt(file.name);
                        if (!passwordRetry) return;
                        try {
                            fileData = await DRC.CryptoService.decrypt(fileData, passwordRetry);
                        } catch (retryErr) {
                            showToast(t('patientManager.decryptError', 'Error decrypting. Please check the password.'));
                            return;
                        }
                    }
                } else if (isDrcFile) {
                    showToast(t('patientManager.unknownEncryptionFormat', 'This file appears to be encrypted, but the encryption format is not recognized.'));
                    return;
                }

                // Now process as Excel
                const wb = XLSX.read(fileData, { type: 'array' });
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                const clamp = (v, min, max) => Math.min(Math.max(isNaN(v) ? min : v, min), max);
                rows.forEach(row => {
                    const rawName = _sanitizePatientName(String(row.Name || row.name || 'Imported Patient')) || 'Imported Patient';
                    const [ageMin, ageMax] = DRC.CONFIG.RANGES.age.us;
                    const [sbpMin, sbpMax] = DRC.CONFIG.RANGES.sbp.us;
                    const [heightMin, heightMax] = DRC.CONFIG.RANGES.height.us;
                    const [waistMin, waistMax] = DRC.CONFIG.RANGES.waist.us;
                    const [fastGluMin, fastGluMax] = DRC.CONFIG.RANGES.fastGlu.us;
                    const [cholHDLMin, cholHDLMax] = DRC.CONFIG.RANGES.cholHDL.us;
                    const [cholTriMin, cholTriMax] = DRC.CONFIG.RANGES.cholTri.us;
                    const data = {
                        age:        clamp(parseFloat(row.Age        || row.age)        || 50,   ageMin,  ageMax),
                        sex:        clamp(parseInt(row.Sex_Male || row.sex) ?? 1, 0, 1),
                        race:       clamp(parseInt(row.Ethnicity_African_American || row.Race_African_American || row.race) || 0, 0, 1),
                        parentHist: clamp(parseInt(row.Parental_Diabetes || row.Parent_History || row.parentHist) || 0, 0, 1),
                        sbp:        clamp(parseFloat(row.Systolic_BP || row.sbp)       || 120,  sbpMin, sbpMax),
                        height:     clamp(parseFloat(row.Height      || row.height)    || 170,  heightMin, heightMax),
                        waist:      clamp(parseFloat(row.Waist       || row.waist)     || 90,   waistMin, waistMax),
                        fastGlu:    clamp(parseFloat(row.Fasting_Glucose || row.fastGlu) || 95, fastGluMin, fastGluMax),
                        cholHDL:    clamp(parseFloat(row.HDL_Cholesterol || row.cholHDL) || 50, cholHDLMin, cholHDLMax),
                        cholTri:    clamp(parseFloat(row.Blood_Fats_Triglycerides || row.Triglycerides || row.cholTri) || 150, cholTriMin, cholTriMax),
                        _riskPct:   clamp(parseFloat(row.Risk_Pct || 0) || 0, 0, 100),
                        // Excel import assumes US units (_isMetric: false). If the file was created
                        // in SI mode, values may be misinterpreted. Future: add _isMetric column to Excel export format.
                        _isMetric: false
                    };
                    patients.push({
                        id: generateId(), name: rawName, data,
                        riskPct: data._riskPct, savedAt: row.Saved_At || new Date().toISOString()
                    });
                });
                _persistAndRender();
                updateNavLabel();

                // Notify that import is complete (for tutorial trigger)
                window.dispatchEvent(new CustomEvent('drc:import:completed'));
            } catch (_) { console.error('Import failed:', _); showToast(t('patientManager.invalidExcel', 'Could not read the Excel file. Please check that it is a valid .xlsx file.')); }
        };
        reader.readAsArrayBuffer(file);
    };

    // ─── UI Rendering ───────────────────────────────────────────────────

    const updateNavLabel = () => {
        const active = patients.find(p => p.id === activePatientId);
        const label = document.getElementById('patientNameLabel');
        const activeLabel = document.getElementById('pdActiveLabel');
        if (label) label.textContent = active ? active.name : t('patientManager.selectProfile', 'Select Profile');
        if (activeLabel) {
            if (active) {
                const liveRisk = parseFloat(document.getElementById('risk-percentage')?.textContent);
                const displayRisk = (!isNaN(liveRisk) && liveRisk > 0) ? liveRisk.toFixed(1) : (active.riskPct?.toFixed(1) || '?');
                activeLabel.textContent = `${active.name} (${displayRisk}%)`;
            } else {
                activeLabel.textContent = t('patientManager.noProfile', 'No profile selected');
            }
        }
    };

    const renderList = () => {
        const container = document.getElementById('pdPatientList');
        if (!container) return;
        if (patients.length === 0) {
            container.textContent = '';
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'pd-empty-msg';
            emptyMsg.textContent = t('patientManager.empty', 'No profiles saved yet.');
            container.appendChild(emptyMsg);
            return;
        }
        container.textContent = '';
        patients.forEach(p => {
            const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

            const card = document.createElement('div');
            card.className = `pd-patient-card${p.id === activePatientId ? ' active' : ''}`;

            const avatar = document.createElement('div');
            avatar.className = 'pd-patient-avatar';
            avatar.textContent = initials;

            const info = document.createElement('div');
            info.className = 'pd-patient-info';

            const nameEl = document.createElement('div');
            nameEl.className = 'pd-patient-name';
            nameEl.textContent = p.name;

            const riskEl = document.createElement('div');
            riskEl.className = 'pd-patient-risk';
            const savedDate = (() => { try { const d = new Date(p.savedAt); return isNaN(d.getTime()) ? t('patientManager.unknownDate', 'Unknown') : d.toLocaleDateString(); } catch (e) { console.warn('PatientManager: invalid date for patient', p.id, e); return t('patientManager.unknownDate', 'Unknown'); } })();
            riskEl.textContent = `${t('patientManager.riskLabel', 'Risk')}: ${p.riskPct?.toFixed(1) || '?'}% \u00B7 ${savedDate}`;

            info.appendChild(nameEl);
            info.appendChild(riskEl);

            const actions = document.createElement('div');
            actions.className = 'pd-patient-actions';

            const mkBtn = (cls, title, action, icon) => {
                const btn = document.createElement('button');
                btn.className = `pd-btn-icon ${cls}`;
                btn.title = title;
                btn.dataset.action = action;
                btn.dataset.id = p.id;
                const iconEl = document.createElement('i');
                iconEl.setAttribute('data-lucide', icon.replace(/_/g, '-'));
                iconEl.className = 'lucide-icon';
                btn.appendChild(iconEl);
                return btn;
            };

            const exportBtn = mkBtn('export', t('patientManager.exportProfile', 'Export this profile to Excel'), 'export', 'download');
            const renameBtn = mkBtn('rename', t('patientManager.renameProfile', 'Rename profile'), 'rename', 'pencil');
            const saveBtn = mkBtn('save', t('patientManager.updateProfile', 'Update with current values'), 'save', 'save');
            const delBtn  = mkBtn('delete', t('patientManager.deleteProfile', 'Delete profile'), 'delete', 'trash-2');
            actions.appendChild(exportBtn);
            actions.appendChild(renameBtn);
            actions.appendChild(saveBtn);
            actions.appendChild(delBtn);

            card.appendChild(avatar);
            card.appendChild(info);
            card.appendChild(actions);

            card.addEventListener('click', (e) => { if (!e.target.closest('[data-action]')) loadPatient(p.id); });
            exportBtn.addEventListener('click', (e) => { e.stopPropagation(); exportSinglePatient(p.id); });
            renameBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newName = await showPrompt(t('patientManager.renamePrompt', 'Rename "{name}" to:').replace('{name}', p.name), p.name);
                if (newName && newName.trim() && newName.trim() !== p.name) {
                    renamePatient(p.id, newName.trim());
                }
            });
            saveBtn.addEventListener('click', async (e) => { e.stopPropagation(); await updatePatient(p.id); });
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await showConfirm(t('patientManager.deleteConfirm', 'Delete profile "{name}"?').replace('{name}', p.name))) deletePatient(p.id);
            });
            container.appendChild(card);
        });

        // Initialize Lucide icons for dynamically added content
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    // ─── Drawer toggle ──────────────────────────────────────────────────

    let _drawerFocusTrap = null;
    let _drawerPreviousFocus = null;
    let _lastSaveChoice = null;
    let _lastBothSaveIds = { originalId: null, simulatedId: null };

    /**
     * Handle close-warning dialog when closing the drawer after saving during simulation.
     * @returns {Promise<{closeDrawer: boolean, loadId: string|null}>}
     */
    const _handleSimulationCloseWarning = async () => {
        const tr = DRC.Utils?.createTranslator?.() || ((_, fb) => fb);

        if (_lastSaveChoice === 'both') {
            const msg = tr('modals.simulationCloseWarning.messageBoth',
                'You saved both original and simulated profiles. Which would you like to load?');
            const options = [
                { label: tr('modals.simulationCloseWarning.keepCurrent', 'Keep Current State'), value: 'keep' },
                { label: tr('modals.simulationCloseWarning.loadOriginal', 'Load Original Profile'), value: 'loadOriginal' },
                { label: tr('modals.simulationCloseWarning.loadSimulated', 'Load Simulated Profile'), value: 'loadSimulated', isPrimary: true },
            ];
            const choice = await _showOptionDialog(msg, options);
            if (choice === 'keep') return { closeDrawer: true, loadId: null };
            if (choice === 'loadOriginal') return { closeDrawer: true, loadId: _lastBothSaveIds.originalId };
            if (choice === 'loadSimulated') return { closeDrawer: true, loadId: _lastBothSaveIds.simulatedId };
            return { closeDrawer: false, loadId: null };
        }

        const msg = tr('modals.simulationCloseWarning.message',
            'You saved a profile. The simulation is still active. What would you like to do?');
        const options = [
            { label: tr('modals.simulationCloseWarning.keepCurrent', 'Keep Current State'), value: 'keep' },
            { label: tr('modals.simulationCloseWarning.loadProfile', 'Load Profile'), value: 'load', isPrimary: true },
        ];
        const choice = await _showOptionDialog(msg, options);
        if (choice === 'keep') return { closeDrawer: true, loadId: null };
        if (choice === 'load') return { closeDrawer: true, loadId: activePatientId };
        return { closeDrawer: false, loadId: null };
    };

    const toggleDrawer = async (open) => {
        const drawer = document.getElementById('patientDrawer');
        const overlay = document.getElementById('patientOverlay');
        const btn = document.getElementById('patientMenuBtn');

        if (open) {
            drawer?.classList.add('open');
            overlay?.classList.add('open');
            btn?.classList.add('open');
            drawer?.setAttribute('role', 'dialog');
            // Focus trap
            _drawerPreviousFocus = document.activeElement;
            if (drawer) {
                _drawerFocusTrap = DRC.Utils.createFocusTrap(drawer);
                _drawerFocusTrap.activate();
            }
        } else {
            // If a profile was saved during simulation and simulation is still active, ask the user
            if (_lastSaveChoice && DRC.TreatmentSimulator?.hasActiveSimulation?.() && activePatientId) {
                const { closeDrawer, loadId } = await _handleSimulationCloseWarning();
                if (!closeDrawer) return;

                if (loadId) {
                    DRC.TreatmentSimulator?.cancel?.();
                    loadPatient(loadId);
                }

                _lastSaveChoice = null;
                _lastBothSaveIds = { originalId: null, simulatedId: null };
            }

            drawer?.classList.remove('open');
            overlay?.classList.remove('open');
            btn?.classList.remove('open');
            drawer?.removeAttribute('role');
            // Deactivate focus trap and restore focus
            if (_drawerFocusTrap) { _drawerFocusTrap.deactivate(); _drawerFocusTrap = null; }
            if (_drawerPreviousFocus) { _drawerPreviousFocus.focus(); _drawerPreviousFocus = null; }
        }
    };

    // ─── Init ───────────────────────────────────────────────────────────

    const init = () => {
        loadFromStorage(); renderList(); updateNavLabel();

        // Initialize Lucide icons for patient drawer elements
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Initialize encryption modals
        initEncryptionModal();
        initPasswordPromptModal();

        // Subscribe to language changes to re-render UI
        if (DRC.I18n?.onLanguageChange) {
            DRC.I18n.onLanguageChange(() => {
                renderList();
                updateNavLabel();
            });
        }

        document.getElementById('patientMenuBtn')?.addEventListener('click', () => {
            const isOpen = document.getElementById('patientDrawer')?.classList.contains('open');
            toggleDrawer(!isOpen);
        });
        document.getElementById('patientDrawerClose')?.addEventListener('click', () => toggleDrawer(false));
        document.getElementById('patientOverlay')?.addEventListener('click', () => toggleDrawer(false));

        document.getElementById('pdAddPatientBtn')?.addEventListener('click', async () => {
            const input = document.getElementById('pdNewPatientName');
            if (!input?.value.trim()) { input?.focus(); return; }
            await addPatient(input.value);
            input.value = '';
        });

        document.getElementById('pdNewPatientName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('pdAddPatientBtn')?.click();
        });

        document.getElementById('pdExportBtn')?.addEventListener('click', exportToExcel);
        document.getElementById('pdImportFile')?.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file) importFromExcel(file);
            e.target.value = '';
        });
    };

    /**
     * Get the stored data of the currently active patient.
     * @returns {Object|null} Patient data object or null if no patient is active.
     */
    const getActivePatientData = () => {
        if (!activePatientId) return null;
        const patient = patients.find(p => p.id === activePatientId);
        return patient ? patient.data : null;
    };

    return { init, loadPatient, applyValues, captureCurrentValues, updateNavLabel, getActivePatientData, addPatient, renamePatient, toggleDrawer };
})();

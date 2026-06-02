/**
 * @fileoverview Bootstrap entry point — initializes the application.
 *
 * Waits for DOMContentLoaded, then starts the App and PatientManager.
 * This file must be loaded last, after all module files.
 *
 * @memberof DRC
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
    DRC.App.init();
    DRC.PatientManager.init();

});

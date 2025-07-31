// Este archivo centraliza el estado de la aplicación y las referencias a los elementos de la UI.

// --- CONSTANTES ---
export const STATUS = {
    PENDING: 'Pendiente',
    RECONCILED: 'Conciliada',
    RECONCILED_WITH_DIFF: 'Conciliado con Diferencias'
};

export const SOURCE_TYPES = {
    ARCA: 'ARCA',
    CONTABILIDAD: 'Contabilidad'
};

export const PROCESS_STATE = {
    IMPORTED: 'Archivos Importados',
    FINISHED: 'Conciliación Finalizada'
};

// --- ESTADO GLOBAL DE LA APLICACIÓN ---
export let messageTimeout; // Variable para controlar el timer del mensaje
export const appState = {
    currentReconciliationId: null,
    providerDiscrepancies: [],
    fileArca: null, fileContabilidad: null,
    dataArca: null, dataContabilidad: null,
    allArcaRecords: [], allContabilidadRecords: [],
    providerCuits: [],
    columnVisibility: {},
    manualSelection: {
        pending: new Set(),
        reconciled: new Set(),
        unmatched: new Set(),
        netDifference: 0, 
    },
};

// --- ELEMENTOS DE LA UI (Interfaz de Usuario) ---
export const ui = {
    themeToggle: document.getElementById("themeToggle"),
    menuItems: document.querySelectorAll('.sidebar-menu .menu-item'),
    toolContents: document.querySelectorAll('.tool-content'),
    toolTitle: document.getElementById('tool-title'),
    columnStyles: document.getElementById('column-styles'),
    reconciliationPanel: {
        panel: document.getElementById('manual-reconciliation-panel'),
        reconcileView: document.getElementById('reconciliation-mode-view'),
        deReconcileView: document.getElementById('dereconciliation-mode-view'),
        selectedArcaTotal: document.getElementById('selected-arca-total'),
        selectedContTotal: document.getElementById('selected-cont-total'),
        selectedNetTotal: document.getElementById('selected-net-total'),
        reconcileBtn: document.getElementById('reconcile-manual-btn'),
        selectedReconciledCount: document.getElementById('selected-reconciled-count'),
        deReconcileBtn: document.getElementById('de-reconcile-manual-btn'),
    },
    reconciler: {
        loaderOverlay: document.getElementById('loader-overlay'),
        dropZoneArca: document.getElementById('drop-zone-arca'),
        fileInputArca: document.getElementById('file-input-arca'),
        fileNameArca: document.getElementById('file-name-arca'),
        dropZoneContabilidad: document.getElementById('drop-zone-contabilidad'),
        fileInputContabilidad: document.getElementById('file-input-contabilidad'),
        fileNameContabilidad: document.getElementById('file-name-contabilidad'),
        columnMappingSection: document.getElementById('column-mapping-section'),
        selectCuitArca: document.getElementById('select-cuit-arca'),
        selectMontoArca: document.getElementById('select-monto-arca'),
        selectCuitContabilidad: document.getElementById('select-cuit-contabilidad'),
        selectMontoContabilidad: document.getElementById('select-monto-contabilidad'),
        newReconciliationNameInput: document.getElementById('new-reconciliation-name'),
        importFilesBtn: document.getElementById('import-files-btn'),
        messageBox: document.getElementById('message-box'),
        resultsSection: document.getElementById('results-section'),
    },
    hub: {
        reconciliationListContainer: document.getElementById('reconciliation-list-container'),
    },
    providerAnalysis: {
        placeholder: document.getElementById('provider-analysis-placeholder'),
        content: document.getElementById('provider-analysis-content'),
        providerSelect: document.getElementById('provider-select'),
        detailContent: document.getElementById('provider-detail-content'),
        downloadBtn: document.getElementById('download-provider-report-btn'),
        tablePending: document.getElementById('table-provider-pending'),
        tableReconciled: document.getElementById('table-provider-reconciled'),
        tableUnmatchedContabilidad: document.getElementById('table-provider-unmatched-contabilidad'),
        summaryArca: document.getElementById('provider-summary-arca'),
        summaryContabilidad: document.getElementById('provider-summary-contabilidad'),
        summaryDiferencia: document.getElementById('provider-summary-diferencia'),
        commentModal: document.getElementById('comment-modal'),
        commentTextarea: document.getElementById('comment-textarea'),
        closeCommentModalBtn: document.getElementById('close-comment-modal'),
        saveCommentBtn: document.getElementById('save-comment-btn'),
    },
    discrepancyAnalysis: {
        placeholder: document.getElementById('discrepancy-analysis-placeholder'),
        content: document.getElementById('discrepancy-analysis-content'),
        thresholdInput: document.getElementById('discrepancy-threshold'),
        applyFilterBtn: document.getElementById('apply-discrepancy-filter-btn'),
        summary: document.getElementById('discrepancy-summary'),
        providersFound: document.getElementById('summary-providers-found'),
        discrepancyTotal: document.getElementById('summary-discrepancy-total'),
        table: document.getElementById('table-discrepancies'),
    }
};

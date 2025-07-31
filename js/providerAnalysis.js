import { appState, ui, STATUS, SOURCE_TYPES } from './state.js';
import { showMessage, normalizeRecord, renderTable } from './utils.js';
import { displayGeneralResults } from './reconciler.js';
import { supabaseClient } from './config.js';

export function populateProviderSelector() {
    const { providerAnalysis: provUI } = ui;
    provUI.providerSelect.innerHTML = '<option value="">Seleccione un CUIT para ver el detalle...</option>';
    appState.providerCuits.forEach(cuit => {
        provUI.providerSelect.add(new Option(cuit, cuit));
    });
    provUI.detailContent.classList.add('hidden');
}

export function displayProviderDetails() {
    const { providerAnalysis: provUI, reconciler: recUI } = ui;
    const selectedCuit = provUI.providerSelect.value;
    const formatCurrency = (num) => num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!selectedCuit) {
        provUI.detailContent.classList.add('hidden');
        return;
    }
    const arcaCuitCol = recUI.selectCuitArca.value;
    const arcaMontoCol = recUI.selectMontoArca.value;
    const contCuitCol = recUI.selectCuitContabilidad.value;
    const contMontoCol = recUI.selectMontoContabilidad.value;
    const allArcaForProvider = appState.allArcaRecords.filter(r => normalizeRecord(r, arcaCuitCol, null).cuit === selectedCuit);
    const allContabilidadForProvider = appState.allContabilidadRecords.filter(r => normalizeRecord(r, contCuitCol, null).cuit === selectedCuit);
    const totalArcaProvider = allArcaForProvider.reduce((sum, r) => sum + normalizeRecord(r, arcaCuitCol, arcaMontoCol).monto, 0);
    const totalContabilidadProvider = allContabilidadForProvider.reduce((sum, r) => sum + normalizeRecord(r, contCuitCol, contMontoCol).monto, 0);
    const diferencia = totalArcaProvider - totalContabilidadProvider;
    provUI.summaryArca.textContent = `$${formatCurrency(totalArcaProvider)}`;
    provUI.summaryContabilidad.textContent = `$${formatCurrency(totalContabilidadProvider)}`;
    provUI.summaryDiferencia.textContent = `$${formatCurrency(diferencia)}`;
    
    const providerPending = allArcaForProvider.filter(r => r.Estado === STATUS.PENDING);
    const providerReconciled = allArcaForProvider.filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF);
    const providerUnmatchedContabilidad = allContabilidadForProvider.filter(r => r.Estado === STATUS.PENDING);

    renderTable(providerPending, provUI.tablePending, { showCheckboxes: true, recordSource: 'pending' });
    renderTable(providerReconciled, provUI.tableReconciled, { showCheckboxes: true, recordSource: 'reconciled' });
    renderTable(providerUnmatchedContabilidad, provUI.tableUnmatchedContabilidad, { showCheckboxes: true, recordSource: 'unmatched' });
    
    provUI.detailContent.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', handleManualSelection);
    });
    
    provUI.detailContent.classList.remove('hidden');
}

function updateSelectAllCheckboxes() {
    const tables = [
        ui.providerAnalysis.tablePending,
        ui.providerAnalysis.tableReconciled,
        ui.providerAnalysis.tableUnmatchedContabilidad
    ];
    tables.forEach(table => {
        const headerCheckbox = table.querySelector('thead input[type="checkbox"]');
        if (!headerCheckbox) return;
        const bodyCheckboxes = Array.from(table.querySelectorAll('tbody input[type="checkbox"]'));
        if (bodyCheckboxes.length === 0) {
            headerCheckbox.checked = false;
            headerCheckbox.indeterminate = false;
            return;
        }
        const totalChecked = bodyCheckboxes.filter(cb => cb.checked).length;
        if (totalChecked === 0) {
            headerCheckbox.checked = false;
            headerCheckbox.indeterminate = false;
        } else if (totalChecked === bodyCheckboxes.length) {
            headerCheckbox.checked = true;
            headerCheckbox.indeterminate = false;
        } else {
            headerCheckbox.checked = false;
            headerCheckbox.indeterminate = true;
        }
    });
}

export function handleManualSelection() {
    appState.manualSelection = { pending: new Set(), reconciled: new Set(), unmatched: new Set(), netDifference: 0 };
    const { providerAnalysis: provUI } = ui;
    provUI.tablePending.querySelectorAll('tbody input[type="checkbox"]:checked').forEach(cb => appState.manualSelection.pending.add(parseInt(cb.dataset.index)));
    provUI.tableReconciled.querySelectorAll('tbody input[type="checkbox"]:checked').forEach(cb => appState.manualSelection.reconciled.add(parseInt(cb.dataset.index)));
    provUI.tableUnmatchedContabilidad.querySelectorAll('tbody input[type="checkbox"]:checked').forEach(cb => appState.manualSelection.unmatched.add(parseInt(cb.dataset.index)));
    
    updateSelectAllCheckboxes(); 
    updateReconciliationPanel();
}

export function updateReconciliationPanel() {
    const { panel, reconcileView, deReconcileView, reconcileBtn, ...rest } = ui.reconciliationPanel;
    const { pending, reconciled, unmatched } = appState.manualSelection;
    const formatCurrency = (num) => num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const { reconciler: recUI } = ui;
    
    const showReconcileMode = pending.size > 0 || unmatched.size > 0;
    const showDeReconcileMode = reconciled.size > 0;

    panel.classList.toggle('hidden', !showReconcileMode && !showDeReconcileMode);
    reconcileView.classList.toggle('hidden', !showReconcileMode || showDeReconcileMode);
    deReconcileView.classList.toggle('hidden', !showDeReconcileMode || showReconcileMode);

    if (showReconcileMode && !showDeReconcileMode) {
        const arcaTotal = [...pending].reduce((sum, index) => {
            const record = appState.allArcaRecords.find(r => r.__originalIndex === index);
            return sum + (record ? normalizeRecord(record, recUI.selectCuitArca.value, recUI.selectMontoArca.value).monto : 0);
        }, 0);
        const contTotal = [...unmatched].reduce((sum, index) => {
            const record = appState.allContabilidadRecords.find(r => r.__originalIndex === index);
            return sum + (record ? normalizeRecord(record, recUI.selectCuitContabilidad.value, recUI.selectMontoContabilidad.value).monto : 0);
        }, 0);

        const net = arcaTotal - contTotal;
        appState.manualSelection.netDifference = net;
        
        rest.selectedArcaTotal.textContent = `$${formatCurrency(arcaTotal)}`;
        rest.selectedContTotal.textContent = `$${formatCurrency(contTotal)}`;
        rest.selectedNetTotal.textContent = `$${formatCurrency(net)}`;
        rest.selectedNetTotal.style.color = Math.abs(net) < 1000 ? 'var(--success-color)' : 'var(--danger-color)';
        
        const canReconcile = Math.abs(net) < 1000 && (pending.size > 0 || unmatched.size > 0);
        reconcileBtn.disabled = !canReconcile;

    }
    if (showDeReconcileMode && !showReconcileMode) {
        rest.selectedReconciledCount.textContent = reconciled.size;
    }
}

export function executeManualReconciliation() {
    const { pending, unmatched, netDifference } = appState.manualSelection;
    
    const newStatus = Math.abs(netDifference) < 0.01 ? STATUS.RECONCILED : STATUS.RECONCILED_WITH_DIFF;
    const matchId = `manual_${Date.now()}`;

    pending.forEach(index => {
        const record = appState.allArcaRecords.find(r => r.__originalIndex === index);
        if (record) {
            record.Estado = newStatus;
            record.matchId = matchId;
        }
    });
    unmatched.forEach(index => {
        const record = appState.allContabilidadRecords.find(r => r.__originalIndex === index);
        if (record) {
            record.Estado = newStatus;
            record.matchId = matchId;
        }
    });

    appState.manualSelection = { pending: new Set(), reconciled: new Set(), unmatched: new Set(), netDifference: 0 };
    displayProviderDetails();
    displayGeneralResults();
    updateReconciliationPanel();
}

export function executeDereconciliation() {
    const { reconciled } = appState.manualSelection;
    reconciled.forEach(index => {
        const record = appState.allArcaRecords.find(r => r.__originalIndex === index);
        if (record) {
            const matchId = record.matchId;
            record.Estado = STATUS.PENDING;
            delete record.matchId;
            if (matchId) {
                const contRecord = appState.allContabilidadRecords.find(r => r.matchId === matchId);
                if (contRecord) {
                    contRecord.Estado = STATUS.PENDING;
                    delete contRecord.matchId;
                }
            }
        }
    });
    appState.manualSelection = { pending: new Set(), reconciled: new Set(), unmatched: new Set(), netDifference: 0 };
    displayProviderDetails();
    displayGeneralResults();
    updateReconciliationPanel();
}

export function downloadProviderReport() {
    const { providerAnalysis: provUI, reconciler: recUI } = ui;
    const selectedCuit = provUI.providerSelect.value;
    if (!selectedCuit) {
        showMessage('Por favor, selecciona un proveedor para descargar.', true);
        return;
    }
    const wb = XLSX.utils.book_new();
    const arcaCuitCol = recUI.selectCuitArca.value;
    const contCuitCol = recUI.selectCuitContabilidad.value;
    
    const filterByCuit = (data, cuitCol) => data.filter(record => normalizeRecord(record, cuitCol, null).cuit === selectedCuit);
    const cleanForExport = ({__originalIndex, matchId, ...rest}) => rest;

    const providerPending = filterByCuit(appState.allArcaRecords, arcaCuitCol).filter(r => r.Estado === STATUS.PENDING).map(cleanForExport);
    const providerReconciled = filterByCuit(appState.allArcaRecords, arcaCuitCol).filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF).map(cleanForExport);
    const providerUnmatchedCont = filterByCuit(appState.allContabilidadRecords, contCuitCol).filter(r => r.Estado === STATUS.PENDING).map(cleanForExport);
    
    if (providerPending.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(providerPending), "ARCA Pendiente");
    if (providerReconciled.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(providerReconciled), "Conciliadas");
    if (providerUnmatchedCont.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(providerUnmatchedCont), "Contabilidad Sin Match");

    if (wb.SheetNames.length > 0) {
        XLSX.writeFile(wb, `Reporte_Proveedor_${selectedCuit}.xlsx`);
    } else {
        showMessage('No hay datos para exportar para este proveedor.', true);
    }
}

export function showCommentModal(recordIndex, sourceFile) {
    const recordList = sourceFile === SOURCE_TYPES.ARCA ? appState.allArcaRecords : appState.allContabilidadRecords;
    const record = recordList.find(r => r.__originalIndex === parseInt(recordIndex));

    if (!record) return;

    ui.providerAnalysis.commentModal.classList.remove('hidden');
    ui.providerAnalysis.commentTextarea.value = record.comentario || '';
    ui.providerAnalysis.commentTextarea.focus();

    ui.providerAnalysis.commentModal.dataset.currentIndex = recordIndex;
    ui.providerAnalysis.commentModal.dataset.currentSource = sourceFile;
}

export async function saveComment() {
    const recordIndex = parseInt(ui.providerAnalysis.commentModal.dataset.currentIndex);
    const sourceFile = ui.providerAnalysis.commentModal.dataset.currentSource;
    const commentText = ui.providerAnalysis.commentTextarea.value;
    
    const recordList = sourceFile === SOURCE_TYPES.ARCA ? appState.allArcaRecords : appState.allContabilidadRecords;
    const record = recordList.find(r => r.__originalIndex === recordIndex);

    if (record) {
        record.comentario = commentText;
        
        const icon = document.querySelector(`.comment-icon[data-record-index='${recordIndex}']`);
        if (icon) {
            if (commentText) {
                icon.classList.add('has-comment');
                icon.title = commentText;
            } else {
                icon.classList.remove('has-comment');
                icon.title = 'Añadir comentario';
            }
        }
    }
    
    ui.providerAnalysis.commentModal.classList.add('hidden');
}
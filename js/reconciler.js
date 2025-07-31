import { supabaseClient } from './config.js';
import { appState, ui, STATUS, SOURCE_TYPES, PROCESS_STATE } from './state.js';
import { showMessage, normalizeRecord, renderTable } from './utils.js';
import { populateProviderSelector } from './providerAnalysis.js';
import { calculateAllProviderDiscrepancies } from './discrepancyAnalysis.js';
import { updateToolAvailability } from './main.js';

function populateColumnSelectors(type, headers) {
    const { reconciler: recUI } = ui;
    const cuitSelect = type === 'Arca' ? recUI.selectCuitArca : recUI.selectCuitContabilidad;
    const montoSelect = type === 'Arca' ? recUI.selectMontoArca : recUI.selectMontoContabilidad;
    
    cuitSelect.innerHTML = '<option value="">Selecciona Columna CUIT...</option>';
    montoSelect.innerHTML = '<option value="">Selecciona Columna Monto...</option>';
    headers.forEach(header => {
        cuitSelect.add(new Option(header, header));
        montoSelect.add(new Option(header, header));
    });

    if (type === 'Arca') {
        cuitSelect.value = headers.find(h => h.toLowerCase().includes('cuit')) || '';
        montoSelect.value = headers.find(h => h.toLowerCase().includes('monto retenido')) || '';
    } else {
        cuitSelect.value = headers.find(h => h.toLowerCase().includes('cuit')) || '';
        montoSelect.value = headers.find(h => h.toLowerCase().includes('crédito') || h.toLowerCase().includes('monto')) || '';
    }
}

// --- LÓGICA DEL CONCILIADOR ---
export async function handleFileSelect(file, type) {
    if (!file) return;
    appState[`file${type}`] = file;
    const fileNameEl = type === 'Arca' ? ui.reconciler.fileNameArca : ui.reconciler.fileNameContabilidad;
    fileNameEl.innerHTML = `<span class="file-loaded">${file.name}</span>`;
    
    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const fileData = await file.arrayBuffer();
        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        const headers = data.length > 0 ? Object.keys(data[0]) : [];
        appState[`data${type}`] = data;
        populateColumnSelectors(type, headers);
    } catch (e) {
        console.error(`Error reading file ${type}:`, e);
        showMessage('Error al leer el archivo. Asegúrate que sea un formato válido.', true);
        appState[`file${type}`] = null;
        fileNameEl.innerHTML = `Arrastra el archivo de <span>${type}</span>`;
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
    const bothFilesLoaded = appState.fileArca && appState.fileContabilidad;
    ui.reconciler.columnMappingSection.classList.toggle('hidden', !bothFilesLoaded);
    ui.reconciler.importFilesBtn.disabled = !bothFilesLoaded;
}

export async function importAndSaveFiles() {
    const { reconciler: recUI } = ui;
    const reconciliationName = recUI.newReconciliationNameInput.value.trim();
    if (!reconciliationName) {
        showMessage('Por favor, dale un nombre a la nueva conciliación.', true);
        return;
    }

    const cuitArcaCol = recUI.selectCuitArca.value, montoArcaCol = recUI.selectMontoArca.value;
    const cuitContCol = recUI.selectCuitContabilidad.value, montoContCol = recUI.selectMontoContabilidad.value;

    if (!cuitArcaCol || !montoArcaCol || !cuitContCol || !montoContCol) {
        showMessage('Debes seleccionar las columnas de CUIT y Monto para ambos archivos.', true);
        return;
    }

    recUI.loaderOverlay.style.display = 'flex';
    try {
        const conciliationData = {
            nombre: reconciliationName,
            status: 'Borrador',
            estado_proceso: PROCESS_STATE.IMPORTED,
            cuit_arca_col: cuitArcaCol,
            monto_arca_col: montoArcaCol,
            cuit_cont_col: cuitContCol,
            monto_cont_col: montoContCol,
            configuracion_columnas: {}
        };

        const { data, error } = await supabaseClient.from('conciliaciones').insert([conciliationData]).select().single();
        if (error) throw error;
        const reconciliationId = data.id;

        const arcaRecordsToSave = appState.dataArca.filter(r => r && typeof r === 'object').map((rec, i) => ({ conciliacion_id: reconciliationId, fuente: SOURCE_TYPES.ARCA, datos_originales: {...rec, __originalIndex: i}, estado: STATUS.PENDING }));
        const contabilidadRecordsToSave = appState.dataContabilidad.filter(r => r && typeof r === 'object').map((rec, i) => ({ conciliacion_id: reconciliationId, fuente: SOURCE_TYPES.CONTABILIDAD, datos_originales: {...rec, __originalIndex: i}, estado: STATUS.PENDING }));
        const allRecordsToSave = [...arcaRecordsToSave, ...contabilidadRecordsToSave];
        
        const { error: regError } = await supabaseClient.from('registros').insert(allRecordsToSave);
        if (regError) throw regError;

        showMessage('Archivos importados y guardados con éxito. Ahora puedes iniciar la conciliación.', false);
        loadSavedReconciliations();
        
        recUI.newReconciliationNameInput.value = '';
        recUI.fileNameArca.innerHTML = `Arrastra el archivo de <span>Percepciones ARCA (.xlsx)</span>`;
        recUI.fileNameContabilidad.innerHTML = `Arrastra el archivo de <span>Contabilidad (.xlsx)</span>`;
        appState.fileArca = null;
        appState.fileContabilidad = null;
        recUI.importFilesBtn.disabled = true;
        recUI.columnMappingSection.classList.add('hidden');


    } catch (error) {
        console.error('Error al importar:', error);
        showMessage(`Error al importar: ${error.message}`, true);
    } finally {
        recUI.loaderOverlay.style.display = 'none';
    }
}


export async function processReconciliation(reconciliationId) {
    if (!reconciliationId) return;

    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const { data: concData, error: concError } = await supabaseClient.from('conciliaciones').select('*').eq('id', reconciliationId).single();
        if (concError) throw concError;
        
        const { data: regData, error: regError } = await supabaseClient.from('registros').select('*').eq('conciliacion_id', reconciliationId);
        if (regError) throw regError;

        const allArcaRecords = regData.filter(r => r.fuente === SOURCE_TYPES.ARCA).map(r => ({ ...r.datos_originales, db_id: r.id }));
        const allContabilidadRecords = regData.filter(r => r.fuente === SOURCE_TYPES.CONTABILIDAD).map(r => ({ ...r.datos_originales, db_id: r.id }));
        
        const arcaNorm = allArcaRecords.map(r => normalizeRecord(r, concData.cuit_arca_col, concData.monto_arca_col));
        const contNorm = allContabilidadRecords.map(r => normalizeRecord(r, concData.cuit_cont_col, concData.monto_cont_col));
        
        let matchCounter = 0;
        const recordsToUpdate = [];

        arcaNorm.forEach(arcaRec => {
            const match = contNorm.find(contRec => 
                !contRec.matched && 
                contRec.cuit === arcaRec.cuit && 
                contRec.monto.toFixed(2) === arcaRec.monto.toFixed(2)
            );
            
            if (match) {
                const matchId = `auto_${++matchCounter}`;
                arcaRec.matched = true;
                match.matched = true;
                
                recordsToUpdate.push({ id: arcaRec.original.db_id, estado: STATUS.RECONCILED, match_id: matchId });
                recordsToUpdate.push({ id: match.original.db_id, estado: STATUS.RECONCILED, match_id: matchId });
            }
        });

        if (recordsToUpdate.length > 0) {
            const { error: updateError } = await supabaseClient.from('registros').upsert(recordsToUpdate);
            if (updateError) throw updateError;
        }
        
        await supabaseClient.from('conciliaciones').update({ estado_proceso: PROCESS_STATE.FINISHED }).eq('id', reconciliationId);
        
        showMessage('Conciliación automática completada.', false);
        loadSavedReconciliations();
        loadSelectedReconciliation(reconciliationId);

    } catch (error) {
        console.error("Error en processReconciliation:", error);
        showMessage(`Error al procesar la conciliación: ${error.message}`, true);
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
}

export function displayGeneralResults() {
    const { reconciler: recUI } = ui;
    const arcaMontoCol = recUI.selectMontoArca.value;
    const arcaData = appState.allArcaRecords;
    
    const reconciled = arcaData.filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF);
    const pending = arcaData.filter(r => r.Estado === STATUS.PENDING);
    
    const totalArca = arcaData.reduce((sum, r) => sum + (normalizeRecord(r, null, arcaMontoCol).monto || 0), 0);
    const totalReconciled = reconciled.reduce((sum, r) => sum + (normalizeRecord(r, null, arcaMontoCol).monto || 0), 0);
    const totalPending = totalArca - totalReconciled;
    
    const formatCurrency = (num) => num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    recUI.resultsSection.innerHTML = `
        <h3><i class="fa-solid fa-chart-pie"></i> Resultados de la Conciliación</h3>
        <div class="summary-cards">
           <div class="summary-card"><h4>Total ARCA</h4><p>${`$${formatCurrency(totalArca)}`}</p><span>${arcaData.length} registros</span></div>
           <div class="summary-card success"><h4>Conciliado</h4><p>${`$${formatCurrency(totalReconciled)}`}</p><span>${reconciled.length} registros</span></div>
           <div class="summary-card danger"><h4>Pendiente</h4><p>${`$${formatCurrency(totalPending)}`}</p><span>${pending.length} registros</span></div>
        </div>
        <div class="action-section" style="margin: 2rem 0;"><button id="download-report-btn" class="btn-secondary"><i class="fa-solid fa-file-excel"></i> Descargar Reporte General</button></div>
        <div class="save-section" style="border-top: 1px solid var(--border-color); margin-top: 2rem; padding-top: 2rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: center;">
            <input type="text" id="reconciliation-name" class="select-mapping" placeholder="Nombre de la conciliación..." style="flex-grow: 1; min-width: 200px;" value="${ui.reconciler.newReconciliationNameInput.value}">
            <select id="reconciliation-status" class="select-mapping" style="flex-basis: 150px;">
                <option value="Borrador">Borrador</option>
                <option value="En Revisión">En Revisión</option>
                <option value="Finalizada">Finalizada</option>
            </select>
            <button id="save-changes-btn" class="btn-primary"><i class="fa-solid fa-save"></i> Guardar Cambios</button>
            <button id="save-as-new-btn" class="btn-secondary"><i class="fa-solid fa-copy"></i> Guardar como Nuevo</button>
        </div>
        <div class="results-tables">
            <div class="table-header">
                <h4><i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color);"></i> Vista Previa de Percepciones Pendientes</h4>
                <div class="table-config-container">
                    <button class="config-btn"><i class="fa-solid fa-gear"></i></button>
                    <div class="column-config-dropdown hidden" data-table-target="table-pending"></div>
                </div>
            </div>
            <div class="table-wrapper"><table id="table-pending"></table></div>
        </div>
    `;

    renderTable(pending, recUI.resultsSection.querySelector('#table-pending'), { maxRows: 10 });
    recUI.resultsSection.classList.remove('hidden');

    recUI.resultsSection.querySelector('#download-report-btn').addEventListener('click', () => downloadGeneralReport());
    recUI.resultsSection.querySelector('#save-changes-btn').addEventListener('click', () => saveReconciliation(false));
    recUI.resultsSection.querySelector('#save-as-new-btn').addEventListener('click', () => saveReconciliation(true));
}

export async function saveReconciliation(isNew = false) {
    const recNameInput = document.getElementById('reconciliation-name');
    const recStatusSelect = document.getElementById('reconciliation-status');
    if (!recNameInput || !recStatusSelect) {
        console.error('No se encontraron los campos para guardar.');
        return;
    }

    const reconciliationName = recNameInput.value.trim();
    if (!reconciliationName) {
        showMessage('Por favor, dale un nombre a la conciliación.', true);
        return;
    }

    const isUpdate = appState.currentReconciliationId !== null && !isNew;
    
    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const conciliationData = {
            nombre: reconciliationName,
            status: recStatusSelect.value,
            cuit_arca_col: ui.reconciler.selectCuitArca.value,
            monto_arca_col: ui.reconciler.selectMontoArca.value,
            cuit_cont_col: ui.reconciler.selectCuitContabilidad.value,
            monto_cont_col: ui.reconciler.selectMontoContabilidad.value,
            configuracion_columnas: appState.columnVisibility
        };

        let reconciliationId = appState.currentReconciliationId;

        if (isUpdate) {
            const { error } = await supabaseClient.from('conciliaciones').update(conciliationData).eq('id', reconciliationId);
            if (error) throw error;
            const { error: deleteError } = await supabaseClient.from('registros').delete().eq('conciliacion_id', reconciliationId);
            if (deleteError) throw deleteError;
        } else {
            const { data, error } = await supabaseClient.from('conciliaciones').insert([conciliationData]).select().single();
            if (error) throw error;
            reconciliationId = data.id;
            appState.currentReconciliationId = reconciliationId; 
        }
        
        const arcaRecordsToSave = appState.allArcaRecords.map(rec => ({ conciliacion_id: reconciliationId, fuente: SOURCE_TYPES.ARCA, estado: rec.Estado, match_id: rec.matchId || null, datos_originales: rec, comentario: rec.comentario || null }));
        const contabilidadRecordsToSave = appState.allContabilidadRecords.map(rec => ({ conciliacion_id: reconciliationId, fuente: SOURCE_TYPES.CONTABILIDAD, estado: rec.Estado, match_id: rec.matchId || null, datos_originales: rec, comentario: rec.comentario || null }));
        const allRecordsToSave = [...arcaRecordsToSave, ...contabilidadRecordsToSave];

        const { error: regError } = await supabaseClient.from('registros').insert(allRecordsToSave);
        if (regError) throw regError;

        showMessage('¡Conciliación guardada exitosamente!', false);
        loadSavedReconciliations();

    } catch (error) {
        console.error('Error al guardar:', error);
        showMessage(`Error al guardar: ${error.message}`, true);
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
}

export async function loadSavedReconciliations() {
    const { data, error } = await supabaseClient.from('conciliaciones').select('id, nombre, created_at, status, estado_proceso').order('created_at', { ascending: false });
    if (error) {
        console.error('Error al cargar lista:', error);
        return;
    }
    
    const container = ui.hub.reconciliationListContainer;
    container.innerHTML = '';
    
    if (data && data.length > 0) {
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Proceso</th>
                    <th>Fecha de Creación</th>
                    <th>Acciones</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = table.querySelector('tbody');
        data.forEach(rec => {
            const date = new Date(rec.created_at).toLocaleDateString('es-AR');
            const isFinished = rec.estado_proceso === PROCESS_STATE.FINISHED;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rec.nombre}</td>
                <td>${rec.status}</td>
                <td><span class="process-status ${isFinished ? 'finished' : 'imported'}">${rec.estado_proceso}</span></td>
                <td>${date}</td>
                <td class="item-actions">
                    <button title="Abrir" class="btn-secondary btn-sm" data-action="load" data-id="${rec.id}"><i class="fa-solid fa-folder-open"></i></button>
                    ${!isFinished ? `<button title="Iniciar Conciliación" class="btn-primary btn-sm" data-action="process" data-id="${rec.id}"><i class="fa-solid fa-cogs"></i></button>` : ''}
                    <button title="Renombrar" class="btn-secondary btn-sm" data-action="rename" data-id="${rec.id}" style="background: var(--subtext-color);"><i class="fa-solid fa-pencil"></i></button>
                    <button title="Eliminar" class="btn-danger btn-sm" data-action="delete" data-id="${rec.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
        container.appendChild(table);

    } else {
        container.innerHTML = '<p>No hay conciliaciones guardadas.</p>';
    }
}

export async function loadSelectedReconciliation(selectedId) {
    if (!selectedId) return;
    ui.reconciler.loaderOverlay.style.display = 'flex';
    try {
        const { data: concData, error: concError } = await supabaseClient.from('conciliaciones').select('*').eq('id', selectedId).single();
        if (concError) throw concError;
        
        const { data: regData, error: regError } = await supabaseClient.from('registros').select('*').eq('conciliacion_id', selectedId);
        if (regError) throw regError;

        appState.currentReconciliationId = selectedId;
        appState.allArcaRecords = regData.filter(r => r.fuente === SOURCE_TYPES.ARCA).map(r => ({ ...r.datos_originales, comentario: r.comentario, db_id: r.id }));
        appState.allContabilidadRecords = regData.filter(r => r.fuente === SOURCE_TYPES.CONTABILIDAD).map(r => ({ ...r.datos_originales, comentario: r.comentario, db_id: r.id }));
        
        if (concData.configuracion_columnas) appState.columnVisibility = concData.configuracion_columnas;

        const arcaHeaders = appState.allArcaRecords.length > 0 ? Object.keys(appState.allArcaRecords[0]) : [];
        const contHeaders = appState.allContabilidadRecords.length > 0 ? Object.keys(appState.allContabilidadRecords[0]) : [];
        populateColumnSelectors('Arca', arcaHeaders);
        populateColumnSelectors('Contabilidad', contHeaders);

        ui.reconciler.selectCuitArca.value = concData.cuit_arca_col;
        ui.reconciler.selectMontoArca.value = concData.monto_arca_col;
        ui.reconciler.selectCuitContabilidad.value = concData.cuit_cont_col;
        ui.reconciler.selectMontoContabilidad.value = concData.monto_cont_col;
        
        const allArcaCuits = appState.allArcaRecords.map(r => normalizeRecord(r, concData.cuit_arca_col, null).cuit);
        const allContabilidadCuits = appState.allContabilidadRecords.map(r => normalizeRecord(r, concData.cuit_cont_col, null).cuit);
        appState.providerCuits = [...new Set([...allArcaCuits, ...allContabilidadCuits])].filter(c => c).sort();

        await calculateAllProviderDiscrepancies();
        displayGeneralResults();
        
        const recNameInput = document.getElementById('reconciliation-name');
        const recStatusSelect = document.getElementById('reconciliation-status');
        recNameInput.value = concData.nombre;
        recStatusSelect.value = concData.status;

        updateToolAvailability();
        showMessage(`Conciliación "${concData.nombre}" cargada.`, false);
        ui.reconciler.columnMappingSection.classList.add('hidden');
        document.querySelector('.menu-item[data-tool="reconciler"]').click(); // Cambiar a la vista principal

    } catch (error) {
        console.error('Error al cargar:', error);
        showMessage(`Error al cargar: ${error.message}`, true);
    } finally {
        ui.reconciler.loaderOverlay.style.display = 'none';
    }
}

export async function renameSelectedReconciliation(selectedId) {
    if (!selectedId) return;
    const { data } = await supabaseClient.from('conciliaciones').select('nombre').eq('id', selectedId).single();
    const newName = prompt('Ingresa el nuevo nombre para la conciliación:', data.nombre);

    if (newName && newName.trim() !== '') {
        const { error } = await supabaseClient.from('conciliaciones').update({ nombre: newName.trim() }).eq('id', selectedId);
        if (error) showMessage(`Error al renombrar: ${error.message}`, true);
        else {
            showMessage('Renombrada con éxito.', false);
            loadSavedReconciliations();
        }
    }
}

export async function deleteSelectedReconciliation(selectedId) {
    if (!selectedId) return;
    const { data } = await supabaseClient.from('conciliaciones').select('nombre').eq('id', selectedId).single();
    if (confirm(`¿Estás seguro de que quieres eliminar "${data.nombre}"?\n\nEsta acción no se puede deshacer.`)) {
        const { error } = await supabaseClient.from('conciliaciones').delete().eq('id', selectedId);
        if (error) showMessage(`Error al eliminar: ${error.message}`, true);
        else {
            showMessage('Eliminada con éxito.', false);
            loadSavedReconciliations();
            ui.reconciler.resultsSection.classList.add('hidden');
        }
    }
}

export function downloadGeneralReport() {
    const wb = XLSX.utils.book_new();
    const pending = appState.allArcaRecords.filter(r => r.Estado === STATUS.PENDING);
    const reconciled = appState.allArcaRecords.filter(r => r.Estado === STATUS.RECONCILED || r.Estado === STATUS.RECONCILED_WITH_DIFF);
    const unmatchedContabilidad = appState.allContabilidadRecords.filter(r => r.Estado === STATUS.PENDING);
    
    if (pending.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pending.map(({__originalIndex, matchId, ...rest}) => rest)), "ARCA Pendiente");
    if (reconciled.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reconciled.map(({__originalIndex, matchId, ...rest}) => rest)), "Conciliadas");
    if (unmatchedContabilidad.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedContabilidad.map(({__originalIndex, matchId, ...rest}) => rest)), "Contabilidad Sin Match");

    if (wb.SheetNames.length > 0) {
        XLSX.writeFile(wb, "Reporte_Conciliacion_General.xlsx");
    } else {
        showMessage('No hay datos en ninguna categoría para generar el reporte.', true);
    }
}
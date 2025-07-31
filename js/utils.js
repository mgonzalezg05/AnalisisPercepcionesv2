import { appState, ui, messageTimeout, SOURCE_TYPES } from './state.js';
import { handleManualSelection } from './providerAnalysis.js';

// --- FUNCIONES AUXILIARES GLOBALES ---

export const showMessage = (message, isError = false) => {
    const msgBox = ui.reconciler.messageBox;
    clearTimeout(messageTimeout);

    msgBox.textContent = message;
    msgBox.className = 'message-box';
    msgBox.classList.add(isError ? 'error' : 'success');
    msgBox.classList.remove('hidden');

    // Usamos una variable global a través del módulo de estado para el timeout
    appState.messageTimeout = setTimeout(() => {
        msgBox.classList.add('hidden');
    }, 5000);
};

export const normalizeRecord = (record, cuitCol, montoCol) => {
    if (!record) return { cuit: '', monto: 0, original: record };
    const cuit = String(record[cuitCol] || '').replace(/[^0-9]/g, '');
    const montoValue = record[montoCol];
    let monto;
    if (typeof montoValue === 'number') {
        monto = montoValue;
    } else {
        const montoStr = String(montoValue || '0').replace(/[^0-9,.]/g, '').replace(',', '.');
        monto = parseFloat(montoStr);
    }
    return { cuit, monto: isNaN(monto) ? 0 : monto, original: record };
};

export const renderTable = (jsonData, tableElement, { maxRows = -1, showCheckboxes = false, recordSource = '' }) => {
    tableElement.innerHTML = '';
    if (!jsonData || jsonData.length === 0) {
        const tbody = document.createElement('tbody');
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.textContent = 'No se encontraron registros.';
        td.colSpan = "100%";
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
        tableElement.appendChild(tbody);
        generateColumnConfigurator(tableElement.id, [], showCheckboxes);
        return;
    }
    
    const dataHeaders = Object.keys(jsonData[0]).filter(h => h !== '__originalIndex' && h !== 'matchId' && h !== 'comentario' && h !== 'db_id');
    
    const isProviderAnalysisTable = tableElement.id.startsWith('table-provider');
    const displayHeaders = isProviderAnalysisTable ? [...dataHeaders, 'Comentarios'] : dataHeaders;
    
    generateColumnConfigurator(tableElement.id, dataHeaders, showCheckboxes);
    const dataToShow = maxRows === -1 ? jsonData : jsonData.slice(0, maxRows);
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    if (showCheckboxes) {
        const th = document.createElement('th');
        th.className = 'checkbox-cell';
        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.title = 'Seleccionar todo';
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            const bodyCheckboxes = tableElement.querySelectorAll('tbody input[type="checkbox"]');
            bodyCheckboxes.forEach(cb => {
                cb.checked = isChecked;
            });
            handleManualSelection();
        });
        th.appendChild(selectAllCheckbox);
        headerRow.appendChild(th);
    }

    displayHeaders.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    const tbody = document.createElement('tbody');
    dataToShow.forEach((rowData) => {
        const tr = document.createElement('tr');
        if (showCheckboxes) {
            const td = document.createElement('td');
            td.className = 'checkbox-cell';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.index = rowData.__originalIndex;
            checkbox.dataset.source = recordSource;
            td.appendChild(checkbox);
            tr.appendChild(td);
        }
        
        dataHeaders.forEach(header => {
            const td = document.createElement('td');
            let value = rowData[header];
            if (value instanceof Date) { value = value.toLocaleDateString('es-AR'); } 
            else if (typeof value === 'number') { value = value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
            td.textContent = value ?? '';
            tr.appendChild(td);
        });

        if (isProviderAnalysisTable) {
            const commentTd = document.createElement('td');
            const commentIcon = document.createElement('i');
            commentIcon.className = 'fa-regular fa-comment comment-icon';
            
            if (rowData.comentario) {
                commentIcon.classList.add('has-comment');
                commentIcon.title = rowData.comentario;
            } else {
                commentIcon.title = 'Añadir comentario';
            }
            
            commentIcon.dataset.recordIndex = rowData.__originalIndex;
            const source = (recordSource === 'pending' || recordSource === 'reconciled') ? SOURCE_TYPES.ARCA : SOURCE_TYPES.CONTABILIDAD;
            commentIcon.dataset.sourceFile = source;

            commentTd.appendChild(commentIcon);
            tr.appendChild(commentTd);
        }

        tbody.appendChild(tr);
    });
    
    tableElement.appendChild(thead);
    tableElement.appendChild(tbody);
    applyColumnVisibilityStyles();
};


// --- LÓGICA DE CONFIGURACIÓN DE COLUMNAS ---
export function applyColumnVisibilityStyles() {
    let styles = '';
    for (const tableId in appState.columnVisibility) {
        const tableConfig = appState.columnVisibility[tableId];
        const headers = tableConfig._headers || [];
        headers.forEach((header, index) => {
            if (!tableConfig[header]) {
                const colIndex = index + (tableConfig._hasCheckboxes ? 2 : 1);
                styles += `#${tableId} th:nth-child(${colIndex}), #${tableId} td:nth-child(${colIndex}) { display: none; }\n`;
            }
        });
    }
    ui.columnStyles.innerHTML = styles;
}

export function generateColumnConfigurator(tableId, headers, hasCheckboxes) {
    const dropdown = document.querySelector(`[data-table-target="${tableId}"]`);
    if (!dropdown) return;
    dropdown.innerHTML = '';
    
    if (!appState.columnVisibility[tableId]) {
        appState.columnVisibility[tableId] = { _headers: headers, _hasCheckboxes: hasCheckboxes };
        headers.forEach(header => {
            appState.columnVisibility[tableId][header] = true;
        });
    }
    
    headers.forEach(header => {
        const item = document.createElement('div');
        item.className = 'column-config-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `check-${tableId}-${header.replace(/\s/g, '-')}`;
        checkbox.checked = appState.columnVisibility[tableId][header];
        checkbox.dataset.column = header;
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = header;
        item.appendChild(checkbox);
        item.appendChild(label);
        dropdown.appendChild(item);
        item.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });
        checkbox.addEventListener('change', (e) => {
            appState.columnVisibility[tableId][e.target.dataset.column] = e.target.checked;
            applyColumnVisibilityStyles();
        });
    });
}

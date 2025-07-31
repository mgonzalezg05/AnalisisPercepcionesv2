import { appState, ui } from './state.js';
import { normalizeRecord } from './utils.js';

function findRazonSocialColumn(record) {
    if (!record) return 'N/A';

    // Palabras clave a buscar (en minúsculas y sin acentos)
    const searchTerms = ['razon social', 'denominacion', 'nombre'];

    // Obtener las llaves (nombres de columna) del registro
    const recordKeys = Object.keys(record);

    // Buscar la primera llave que coincida con nuestros términos de búsqueda
    const foundKey = recordKeys.find(key => {
        // Normalizar la llave: a minúsculas, sin acentos y sin espacios extra
        const normalizedKey = key.toLowerCase()
                                 .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quita acentos
                                 .trim();
        
        // Devolver verdadero si alguna de las palabras clave está incluida en la llave normalizada
        return searchTerms.some(term => normalizedKey.includes(term));
    });

    // Si se encontró una llave, devolver el valor de esa columna. Si no, 'N/A'.
    return foundKey ? record[foundKey] : 'N/A';
}

export async function calculateAllProviderDiscrepancies() {
    const { reconciler: recUI } = ui;
    appState.providerDiscrepancies = [];
    const cuitMap = new Map();

    const cuitArcaCol = recUI.selectCuitArca.value;
    const montoArcaCol = recUI.selectMontoArca.value;
    const cuitContCol = recUI.selectCuitContabilidad.value;
    const montoContCol = recUI.selectMontoContabilidad.value;

    appState.allArcaRecords.forEach(r => {
        const cuit = normalizeRecord(r, cuitArcaCol, null).cuit;
        if (!cuit) return;
        if (!cuitMap.has(cuit)) {
            cuitMap.set(cuit, {
                razonSocial: findRazonSocialColumn(r),
                totalArca: 0,
                totalContabilidad: 0
            });
        }
        cuitMap.get(cuit).totalArca += normalizeRecord(r, cuitArcaCol, montoArcaCol).monto;
    });

    appState.allContabilidadRecords.forEach(r => {
        const cuit = normalizeRecord(r, cuitContCol, null).cuit;
        if (!cuit) return;
        if (!cuitMap.has(cuit)) {
            // Si el CUIT no estaba en el archivo de ARCA, intenta sacar la razón social de aquí
            cuitMap.set(cuit, {
                razonSocial: findRazonSocialColumn(r),
                totalArca: 0,
                totalContabilidad: 0
            });
        }
        cuitMap.get(cuit).totalContabilidad += normalizeRecord(r, cuitContCol, montoContCol).monto;
    });

    for (const [cuit, totals] of cuitMap.entries()) {
        appState.providerDiscrepancies.push({
            CUIT: cuit,
            'Razón Social': totals.razonSocial,
            'Total ARCA': totals.totalArca,
            'Total Contabilidad': totals.totalContabilidad,
            Diferencia: totals.totalArca - totals.totalContabilidad,
        });
    }
}

function renderDiscrepancyTable(data) {
    const tableElement = ui.discrepancyAnalysis.table;
    tableElement.innerHTML = '';
    if (!data || data.length === 0) {
        const tbody = document.createElement('tbody');
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.textContent = 'No se encontraron proveedores que cumplan con el criterio.';
        td.colSpan = "100%";
        td.style.textAlign = 'center';
        tr.appendChild(td);
        tbody.appendChild(tr);
        tableElement.appendChild(tbody);
        return;
    }

    const headers = [...Object.keys(data[0]), 'Acción'];
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const tbody = document.createElement('tbody');
    data.forEach(rowData => {
        const tr = document.createElement('tr');
        Object.keys(rowData).forEach(key => {
            const td = document.createElement('td');
            const value = rowData[key];
            if (typeof value === 'number') {
                td.textContent = value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
                if (key === 'Diferencia') {
                    td.style.fontWeight = 'bold';
                    td.style.color = value !== 0 ? 'var(--danger-color)' : 'var(--success-color)';
                }
            } else {
                td.textContent = value;
            }
            tr.appendChild(td);
        });
        const actionTd = document.createElement('td');
        const detailButton = document.createElement('button');
        detailButton.className = 'btn-secondary';
        detailButton.innerHTML = '<i class="fa-solid fa-eye"></i> Ver Detalle';
        detailButton.style.padding = '5px 10px';
        detailButton.style.fontSize = '0.8rem';
        detailButton.dataset.cuit = rowData.CUIT;
        actionTd.appendChild(detailButton);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
    });

    tableElement.appendChild(thead);
    tableElement.appendChild(tbody);
}

export function displayDiscrepancyAnalysis() {
    const threshold = parseFloat(ui.discrepancyAnalysis.thresholdInput.value) || 0;
    const filteredData = appState.providerDiscrepancies.filter(p => Math.abs(p.Diferencia) >= threshold);

    ui.discrepancyAnalysis.providersFound.textContent = filteredData.length;
    const totalDifference = filteredData.reduce((sum, p) => sum + p.Diferencia, 0);
    ui.discrepancyAnalysis.discrepancyTotal.textContent = `${totalDifference.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}`;

    renderDiscrepancyTable(filteredData);
    ui.discrepancyAnalysis.summary.classList.remove('hidden');
}
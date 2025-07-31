import { ui, appState } from './state.js';
import { handleFileSelect, processReconciliation, saveReconciliation, loadSavedReconciliations, loadSelectedReconciliation, renameSelectedReconciliation, deleteSelectedReconciliation, downloadGeneralReport, importAndSaveFiles } from './reconciler.js';
import { displayProviderDetails, handleManualSelection, executeManualReconciliation, executeDereconciliation, downloadProviderReport, populateProviderSelector, showCommentModal, saveComment } from './providerAnalysis.js';
import { displayDiscrepancyAnalysis } from './discrepancyAnalysis.js';

// --- LÓGICA DE NAVEGACIÓN Y VISUALIZACIÓN ---
export function updateToolAvailability() {
    const hasResults = appState.allArcaRecords.length > 0 || appState.allContabilidadRecords.length > 0;

    // Herramienta de Análisis por Proveedor
    ui.providerAnalysis.placeholder.classList.toggle('hidden', hasResults);
    ui.providerAnalysis.content.classList.toggle('hidden', !hasResults);
    if (hasResults) {
        populateProviderSelector();
    }

    // Herramienta de Análisis de Desvíos
    ui.discrepancyAnalysis.placeholder.classList.toggle('hidden', hasResults);
    ui.discrepancyAnalysis.content.classList.toggle('hidden', !hasResults);
    if (!hasResults) {
        ui.discrepancyAnalysis.summary.classList.add('hidden');
    }
}

function setupNavigation() {
    ui.menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tool = item.dataset.tool;
            ui.menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            ui.toolTitle.textContent = item.querySelector('span').textContent;
            ui.toolContents.forEach(content => {
                content.classList.toggle('hidden', content.id !== `tool-${tool}`);
            });
            updateToolAvailability();
        });
    });
}

// --- INICIALIZACIÓN DE LA APP ---
function initialize() {
    // Configuración del tema (oscuro/claro)
    const currentTheme = localStorage.getItem("theme");
    if (currentTheme) {
        document.body.classList.add(currentTheme);
        if (currentTheme === "dark-mode") ui.themeToggle.checked = true;
    }
    ui.themeToggle.addEventListener("change", function() {
        document.body.classList.toggle("dark-mode", this.checked);
        localStorage.setItem("theme", this.checked ? "dark-mode" : "light-mode");
    });

    // Prevenir comportamiento por defecto de arrastrar y soltar
    ['dragover', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, e => e.preventDefault());
    });

    // Configurar la navegación principal
    setupNavigation();

    // Configurar las zonas de carga de archivos
    function setupDropZone(dropZone, fileInput, onFileSelect) {
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => onFileSelect(e.target.files[0]));
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            });
        });
        dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) onFileSelect(e.dataTransfer.files[0]);
        });
    }
    
    setupDropZone(ui.reconciler.dropZoneArca, ui.reconciler.fileInputArca, (file) => handleFileSelect(file, 'Arca'));
    setupDropZone(ui.reconciler.dropZoneContabilidad, ui.reconciler.fileInputContabilidad, (file) => handleFileSelect(file, 'Contabilidad'));
    
    // --- EVENT LISTENERS ---
    
    ui.reconciler.importFilesBtn.addEventListener('click', importAndSaveFiles);
    
    ui.providerAnalysis.providerSelect.addEventListener('change', () => {
        displayProviderDetails();
        handleManualSelection(); 
    });
    ui.providerAnalysis.downloadBtn.addEventListener('click', () => downloadProviderReport());
    
    const providerFilterInput = document.getElementById('provider-filter-input');
    providerFilterInput.addEventListener('input', () => {
        const filterValue = providerFilterInput.value.toLowerCase();
        const providerSelect = ui.providerAnalysis.providerSelect;
        for (const option of providerSelect.options) {
            if (option.value === "") continue;
            const optionValue = option.value.toLowerCase();
            option.style.display = optionValue.includes(filterValue) ? '' : 'none';
        }
    });

    ui.reconciliationPanel.reconcileBtn.addEventListener('click', executeManualReconciliation);
    ui.reconciliationPanel.deReconcileBtn.addEventListener('click', executeDereconciliation);
    document.addEventListener('manualSelectionChange', handleManualSelection);

    ui.discrepancyAnalysis.applyFilterBtn.addEventListener('click', displayDiscrepancyAnalysis);
    ui.discrepancyAnalysis.table.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (button && button.dataset.cuit) {
            const cuit = button.dataset.cuit;
            
            document.querySelector('.menu-item[data-tool="provider-analysis"]').click();

            const providerSelect = ui.providerAnalysis.providerSelect;
            const providerFilterInput = document.getElementById('provider-filter-input');
            
            providerFilterInput.value = cuit;
            providerFilterInput.dispatchEvent(new Event('input'));

            providerSelect.value = cuit;
            providerSelect.dispatchEvent(new Event('change'));
        }
    });
    
    // Event listener para el contenedor de la lista en el HUB
    ui.hub.reconciliationListContainer.addEventListener('click', (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const { action, id } = button.dataset;
        if (action === 'load') loadSelectedReconciliation(id);
        if (action === 'process') processReconciliation(id);
        if (action === 'rename') renameSelectedReconciliation(id);
        if (action === 'delete') deleteSelectedReconciliation(id);
    });

    document.querySelectorAll('.config-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const dropdown = button.nextElementSibling;
            if (dropdown) {
                const isHidden = dropdown.classList.contains('hidden');
                document.querySelectorAll('.column-config-dropdown').forEach(d => d.classList.add('hidden'));
                if (isHidden) dropdown.classList.remove('hidden');
            }
        });
    });

    window.addEventListener('click', (e) => {
        if (!e.target.closest('.table-config-container')) {
            document.querySelectorAll('.column-config-dropdown').forEach(dropdown => {
                dropdown.classList.add('hidden');
            });
        }
    });
    
    // Comentarios
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('comment-icon')) {
            const { recordIndex, sourceFile } = e.target.dataset;
            showCommentModal(recordIndex, sourceFile);
        }
    });

    ui.providerAnalysis.closeCommentModalBtn.addEventListener('click', () => {
        ui.providerAnalysis.commentModal.classList.add('hidden');
    });

    ui.providerAnalysis.saveCommentBtn.addEventListener('click', saveComment);
    
    document.querySelector('.menu-item[data-tool="reconciler"]').click();
    loadSavedReconciliations();
}

initialize();
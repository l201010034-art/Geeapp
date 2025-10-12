// Archivo: ai-connector.js

// --- 1. CONEXIÓN CON LA IA PARA ANÁLISIS (PANELES DERECHOS) ---
const AI_API_URL = '/api/analyze';
const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');
const aiActionsContainer = document.getElementById('ai-actions-container');
const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');
// let lastLabResult = null; // Almacenar el último resultado exitoso del lab

window.generateAiAnalysis = async function(data) {
    if (!data.stats && !data.chartData) return;
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando datos...</p>';
    aiActionsContainer.classList.add('hidden');
    const prompt = buildPrompt(data);
    await callAndDisplayAnalysis(prompt);
}

window.generatePrediction = async function(chartData) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Generando pronóstico...</p>';
    aiActionsContainer.classList.add('hidden');
    const prompt = buildPredictionPrompt(chartData);
    await callAndDisplayAnalysis(prompt);
}

window.generateFireRiskAnalysis = async function(data) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Interpretando mapa de riesgo...</p>';
    aiActionsContainer.classList.add('hidden');
    const prompt = buildFireRiskPrompt(data);
    await callAndDisplayAnalysis(prompt);
}

async function callAndDisplayAnalysis(prompt) {
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });
        if (!response.ok) throw new Error(`Error en la API: ${response.statusText}`);
        const result = await response.json();
        aiSummaryDiv.innerHTML = markdownToHtml(result.analysisText);
        if (result.analysisText) aiActionsContainer.classList.remove('hidden');
    } catch (error) {
        console.error("Error al generar análisis con IA:", error);
        aiSummaryDiv.innerHTML = `<p class="text-red-400">Ocurrió un error: ${error.message}</p>`;
    }
}

// --- 2. LÓGICA DE LA INTERFAZ CONVERSACIONAL (BARRA SUPERIOR) ---
commandForm.addEventListener('submit', async (event) => {
    event.preventDefault(); 
    const userQuery = commandBar.value;
    if (!userQuery) return;
    
    commandBar.disabled = true;
    commandBar.placeholder = "Procesando...";
    
    try {
        const prompt = buildConversationalPrompt(userQuery);
        const response = await fetch(AI_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        const result = await response.json();
        const jsonMatch = result.analysisText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("La IA no devolvió un JSON válido.");
        
        const params = JSON.parse(jsonMatch[0]);
        if (params.error) throw new Error(params.error);
        
        document.getElementById('startDate').value = params.startDate;
        document.getElementById('endDate').value = params.endDate;
        document.getElementById('variableSelector').value = params.variable;

        window.clearZoneCheckboxes();
        if (window.drawnItems) window.drawnItems.clearLayers();

        if (params.zona_type === 'predefinida') {
            const checkbox = window.zonaCheckboxes[params.zona_name];
            if(checkbox) {
                checkbox.checked = true;
                window.handleZoneSelection(params.zona_name);
                window.handleAnalysis('general');
            } else {
                throw new Error(`Zona predefinida '${params.zona_name}' no encontrada.`);
            }
        } else if (params.zona_type === 'municipio') {
            const municipioRoi = { name: params.zona_name, zona_type: 'municipio', zona_name: params.zona_name };
            window.handleAnalysis('general', municipioRoi);
        }
    } catch (error) {
        console.error("Error al procesar el comando de IA:", error);
        commandBar.value = `Error: ${error.message}`;
    } finally {
        commandBar.disabled = false;
        commandBar.placeholder = "Ej: Lluvia en Chiná el mes pasado...";
        if (window.innerWidth < 768) commandBar.blur();
    }
});


// Archivo: ai-connector.js
// --- SECCIÓN 3: LÓGICA PARA EL LABORATORIO DE IA (NUEVA VERSIÓN MODULAR) ---

let lastLabResult = null; // Almacenar el último resultado exitoso del lab

// Esta función ahora pide directamente la ejecución del análisis en el servidor.
async function handleLabExecution() {
    const executeButton = document.getElementById('lab-execute-button');
    const applyButton = document.getElementById('lab-apply-button');
    const previewOverlay = document.getElementById('lab-preview-overlay');
    const previewText = document.getElementById('lab-preview-text');
    const resultDisplay = document.getElementById('lab-result-display');

    // Construir el objeto de la petición basado en la UI.
    const analysisType = document.getElementById('lab-analysis-type').value;
    let requestBody;

    if (analysisType === 'HURRICANE') {
        const hurricaneSelector = document.getElementById('lab-hurricane-selector');
        if (!hurricaneSelector.value) {
            alert("Por favor, busca y selecciona un huracán.");
            return;
        }
        requestBody = {
            analysisType: 'HURRICANE',
            hurricaneSid: hurricaneSelector.value,
            hurricaneName: hurricaneSelector.options[hurricaneSelector.selectedIndex].text,
            year: document.getElementById('lab-hurricane-year').value
        };
    } else {
        const regionSelector = document.getElementById('lab-region-selector-municipalities');
        const marineRegionSelector = document.getElementById('lab-region-selector-marine');
        const regionName = !regionSelector.classList.contains('hidden') ? regionSelector.value : marineRegionSelector.value;
        
        requestBody = {
            analysisType: analysisType,
            roi: regionName,
            startDate: document.getElementById('lab-start-date').value,
            endDate: document.getElementById('lab-end-date').value
        };
    }

    // Actualizar UI para mostrar estado de carga.
    executeButton.disabled = true;
    executeButton.textContent = "Ejecutando...";
    previewOverlay.classList.remove('hidden');
    previewText.textContent = "Ejecutando en GEE y preparando previsualización...";
    resultDisplay.textContent = `// Solicitando análisis '${analysisType}' al servidor...`;

    try {
        const response = await fetch('/api/gee-lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || "Error al ejecutar el análisis en el servidor.");
        }

        lastLabResult = await response.json();
        
        resultDisplay.textContent = `// Análisis '${analysisType}' completado exitosamente.\n// El resultado está listo para ser aplicado al mapa.`;
        previewText.textContent = "✅ ¡Previsualización Lista! Cierra para aplicar al mapa.";
        applyButton.classList.remove('hidden');
        executeButton.classList.add('hidden');

    } catch (error) {
        resultDisplay.textContent = `// Ocurrió un error:\n// ${error.message}`;
        previewText.textContent = `❌ Error: ${error.message}`;
        setTimeout(() => {
            previewOverlay.classList.add('hidden');
            previewText.textContent = "Ejecutando en GEE y preparando previsualización...";
        }, 4000);
    } finally {
        executeButton.disabled = false;
        executeButton.textContent = "Ejecutar Análisis";
    }
}

function applyLabResultToMap() {
    if (lastLabResult) {
        if (lastLabResult.mapId) {
            window.addGeeLayer(lastLabResult.mapId.urlFormat, 'Resultado del Laboratorio');
        }
        if (window.legendControl && lastLabResult.visParams) {
            window.legendControl.update(lastLabResult.visParams);
        }
        if (lastLabResult.stats) {
            window.updateStatsPanel(lastLabResult.stats);
        }
        if (lastLabResult.chartData) {
            window.updateChartAndData(lastLabResult.chartData, lastLabResult.chartOptions);
        }
    }
    document.getElementById('lab-execute-button').classList.remove('hidden');
    document.getElementById('lab-apply-button').classList.add('hidden');
    document.getElementById('lab-preview-overlay').classList.add('hidden');
}

// Exponemos las funciones al objeto window para que el HTML pueda llamarlas.
window.handleLabExecution = handleLabExecution;
window.applyLabResultToMap = applyLabResultToMap;

// --- 4. LÓGICA PARA BUSCAR HURACANES EN EL LABORATORIO ---
async function fetchHurricaneList() {
    const year = document.getElementById('lab-hurricane-year').value;
    const selector = document.getElementById('lab-hurricane-selector');
    const selectorContainer = document.getElementById('lab-hurricane-selector-container');
    const fetchButton = document.getElementById('lab-fetch-hurricanes-button');

    if (!year) {
        alert("Por favor, introduce un año.");
        return;
    }

    // Deshabilitar el botón y mostrar estado de carga
    selector.innerHTML = '<option>Cargando...</option>';
    selectorContainer.classList.remove('hidden');
    fetchButton.disabled = true;
    fetchButton.textContent = "Buscando...";

    try {
        // 1. Realizar la llamada a la API del backend (esto era lo que faltaba)
        const response = await fetch('/api/gee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'getHurricaneList',
                params: { year: parseInt(year) } // Asegurarse de que el año sea un número
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || "Error al contactar el servidor.");
        }

        const { hurricaneList } = await response.json();
        
        selector.innerHTML = ''; // Limpiar el selector antes de añadir nuevas opciones

        // 2. Poblar el selector con la lista de huracanes obtenida
        if (hurricaneList && hurricaneList.length > 0) {
            hurricaneList.forEach(storm => {
                const option = document.createElement('option');
                option.value = storm.sid; // El valor será el SID único del huracán
                option.textContent = storm.name; // El texto visible será el nombre
                selector.appendChild(option);
            });
        } else {
             selector.innerHTML = `<option>No se encontraron huracanes</option>`;
        }

    } catch (error) {
        console.error("Error al buscar huracanes:", error);
        selector.innerHTML = `<option>Error: ${error.message}</option>`;
    } finally {
        // 3. Reactivar el botón y restaurar su texto original
        fetchButton.disabled = false;
        fetchButton.textContent = "1. Buscar Huracanes";
    }
}
window.fetchHurricaneList = fetchHurricaneList;
window.handleLabExecution = handleLabExecution;
window.applyLabResultToMap = applyLabResultToMap;

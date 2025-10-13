import { Loader } from './intelligent-loader.js';
// ▼▼▼ REEMPLAZA TU BLOQUE DE IMPORTACIÓN DE AI-CONNECTOR CON ESTE ▼▼▼
import {
    fetchHurricaneList,
    handleLabExecution,
    applyLabResultToMap,
    generateAiAnalysis,    // <-- Función que faltaba importar
    generatePrediction,      // <-- Función que faltaba importar
    generateFireRiskAnalysis // <-- Función que faltaba importar
} from './ai-connector.js';

// --- VARIABLES GLOBALES ---
let map, drawnItems, currentGEELayer, legendControl, layerControl, currentChart, currentChartData;
const zonaLayers = {};
const zonaCheckboxes = {};
const varParams = {
    'Temperatura del Aire (°C)': { min: 20, max: 40, palette: ['blue', 'cyan', 'yellow', 'red'], bandName: 'TAM', unit: '°C', dataset: 'ERA5' },
    'Humedad Relativa (%)': { min: 50, max: 100, palette: ['lightyellow', 'green', 'darkblue'], bandName: 'HR', unit: '%', dataset: 'ERA5' },
    'Radiación Solar (W/m²)': { min: 0, max: 1000, palette: ['lightgray', 'orange', 'red'], bandName: 'Radiacion_Solar', unit: 'W/m²', dataset: 'ERA5' },
    'Velocidad del Viento (m/s)': { min: 0, max: 10, palette: ['white', 'lightblue', 'blue'], bandName: 'wind_speed', unit: 'm/s', dataset: 'ERA5' },
    'Temp. Superficial (LST °C)': { min: 20, max: 50, palette: ['navy', 'blue', 'cyan', 'yellow', 'red'], bandName: 'LST', unit: '°C', dataset: 'MODIS' },
    'Precipitación Acumulada (mm)': { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'], bandName: 'Precipitacion', unit: 'mm', dataset: 'CHIRPS' },
    'Evapotranspiración (mm/8 días)': { min: 0, max: 40, palette: ['#d73027', '#fc8d59', '#fee090', '#e0f3f8', '#91bfdb', '#4575b4'], bandName: 'ET', unit: 'mm/8d', dataset: 'MODIS_ET'},
    'Evapotranspiración Potencial (mm/8 días)': { min: 0, max: 60, palette: ['#d73027', '#fc8d59', '#fee090', '#e0f3f8', '#91bfdb', '#4575b4'], bandName: 'PET', unit: 'mm/8d', dataset: 'MODIS_ET'},
    'Días Grado de Crecimiento (°C día)': { min: 0, max: 20, palette: ['#edf8b1', '#7fcdbb', '#2c7fb8'], bandName: 'GDD', unit: '°C día', dataset: 'ERA5_DAILY'}
};
const zonas = {
    'Todo el Estado': { geom: [[[-92.48,18.65],[-92.35,18.46],[-92.16,18.47],[-92.13,18.11],[-91.61,17.87],[-91.60,18.14],[-90.99,17.94],[-90.97,17.81],[-89.14,17.82],[-89.13,19.42],[-89.61,19.87],[-89.60,20.00],[-89.99,20.45],[-90.36,20.55],[-90.38,20.86],[-90.48,20.50],[-90.50,20.19],[-90.47,19.91],[-90.56,19.84],[-90.66,19.76],[-90.71,19.69],[-90.71,19.60],[-90.72,19.52],[-90.73,19.35],[-90.77,19.30],[-90.82,19.25],[-90.92,19.17],[-91.15,19.01],[-91.39,18.89],[-91.50,18.78],[-91.50,18.77],[-91.48,18.77],[-91.47,18.77],[-91.46,18.79],[-91.45,18.81],[-91.43,18.82],[-91.42,18.81],[-91.37,18.85],[-91.36,18.84],[-91.39,18.80],[-91.33,18.76],[-91.29,18.78],[-91.24,18.73],[-91.25,18.68],[-91.28,18.66],[-91.31,18.54],[-91.51,18.48],[-91.53,18.43],[-91.89,18.54],[-91.85,18.60],[-91.91,18.63],[-91.95,18.69],[-91.85,18.64],[-91.82,18.62],[-91.79,18.63],[-91.77,18.63],[-91.73,18.65],[-91.69,18.68],[-91.66,18.66],[-91.64,18.68],[-91.59,18.71],[-91.61,18.73],[-91.57,18.72],[-91.56,18.73],[-91.52,18.73],[-91.50,18.74],[-91.52,18.76],[-91.53,18.78],[-91.66,18.71],[-91.69,18.70],[-91.70,18.69],[-91.72,18.68],[-91.78,18.66],[-91.84,18.66]]], style: {color: 'white', fillOpacity: 0, weight: 2.5} },
    'Zona 1, Ciudad Campeche': { geom: [[[-90.45,19.89],[-90.48,19.87],[-90.52,19.86],[-90.52,19.86],[-90.53,19.86],[-90.52,19.85],[-90.53,19.85],[-90.54,19.84],[-90.55,19.83],[-90.56,19.83],[-90.56,19.82],[-90.57,19.82],[-90.57,19.82],[-90.57,19.82],[-90.57,19.82],[-90.57,19.82],[-90.58,19.81],[-90.59,19.81],[-90.59,19.81],[-90.59,19.81],[-90.60,19.80],[-90.61,19.80],[-90.61,19.79],[-90.61,19.79],[-90.62,19.79],[-90.62,19.79],[-90.63,19.79],[-90.63,19.78],[-90.63,19.77],[-90.63,19.77],[-90.63,19.77],[-90.62,19.77],[-90.61,19.78],[-90.59,19.78],[-90.59,19.79],[-90.54,19.79],[-90.54,19.79],[-90.53,19.79],[-90.52,19.78],[-90.51,19.79],[-90.50,19.79],[-90.50,19.78],[-90.50,19.77],[-90.50,19.77],[-90.51,19.76],[-90.50,19.75],[-90.51,19.75],[-90.52,19.75],[-90.52,19.74],[-90.51,19.73],[-90.49,19.74],[-90.48,19.75],[-90.46,19.74],[-90.45,19.74],[-90.46,19.75],[-90.46,19.76],[-90.47,19.76],[-90.48,19.78],[-90.46,19.79],[-90.45,19.82],[-90.45,19.84],[-90.44,19.88]]], style: {color: 'blue', fillColor: '#0000FF22', weight: 2} },
    'Zona 2, Lerma': { geom: [[[-90.59, 19.81],[-90.59, 19.81],[-90.60, 19.80],[-90.63, 19.78],[-90.63, 19.78],[-90.63, 19.77],[-90.63, 19.77],[-90.62, 19.77],[-90.59, 19.78],[-90.59, 19.79],[-90.57, 19.79],[-90.58, 19.82]]], style: {color: 'green', fillColor: '#00FF0022', weight: 2} },
    'Zona 3, Chiná': { geom: [[[-90.50, 19.77],[-90.51, 19.75],[-90.52, 19.74],[-90.50, 19.73],[-90.48, 19.75],[-90.46, 19.74],[-90.46, 19.75],[-90.47, 19.76],[-90.48, 19.78],[-90.50, 19.79]]], style: {color: 'orange', fillColor: '#FFA50022', weight: 2} },
    'Zona 4, San Fco. Campeche': { geom: [[[-90.50, 19.78],[-90.48, 19.78],[-90.46, 19.79],[-90.44, 19.88],[-90.45, 19.89],[-90.52, 19.86],[-90.52, 19.86],[-90.53, 19.86],[-90.53, 19.85],[-90.58, 19.82],[-90.57, 19.79],[-90.54, 19.79],[-90.52, 19.79]]], style: {color: 'purple', fillColor: '#80008022', weight: 2} }
};
const municipios = ["Calakmul", "Calkiní", "Campeche", "Candelaria", "Carmen", "Champotón", "Dzitbalché", "Escárcega", "Hecelchakán", "Hopelchén", "Palizada", "Seybaplaya", "Tenabo"];

// --- INICIALIZACIÓN DE LA PLATAFORMA ---
export function initPlatform() {
    Loader.init();
    google.charts.load('current', {'packages':['corechart']});
    google.charts.setOnLoadCallback(() => {
        initMap();
        populateSelectors();
        setupEventListeners();
        const defaultCheckbox = zonaCheckboxes[Object.keys(zonas)[0]];
        if (defaultCheckbox) {
            defaultCheckbox.checked = true;
            handleZoneSelection(Object.keys(zonas)[0]);
        }
    });
}

function initMap() {
    const googleSat = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',{ maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Google Satellite' });
    const googleHybrid = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',{ maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: 'Google Hybrid' });
    map = L.map('map', { center: [19.84, -90.53], zoom: 9, layers: [googleHybrid] });
    drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    const drawControl = new L.Control.Draw({ edit: { featureGroup: drawnItems }, draw: { polygon: true, polyline: false, rectangle: true, circle: false, marker: false, circlemarker: false }});
    map.addControl(drawControl);
    map.on(L.Draw.Event.CREATED, (e) => {
        drawnItems.addLayer(e.layer);
        clearZoneCheckboxes(false);
        updateStatsPanel(`${drawnItems.getLayers().length} área(s) dibujada(s). Carga datos para analizar.`);
        zoomToActiveLayers();
    });
    map.on(L.Draw.Event.EDITED, () => updateStatsPanel('Área editada. Vuelve a cargar los datos.'));
    layerControl = L.control.layers({ "Híbrido": googleHybrid, "Satélite": googleSat }, {}).addTo(map);
    legendControl = L.control({position: 'bottomright'});
    legendControl.onAdd = function (map) { this._div = L.DomUtil.create('div', 'legend'); this.update(); return this._div; };
// UBICACIÓN: platform-main.js
// REEMPLAZA la función legendControl.update completa con esta versión final.

    legendControl.update = function (varInfo) {
        // Si no hay información, limpia la leyenda y termina.
        if (!varInfo) {
            this._div.innerHTML = '';
            return;
        }

        // --- PRIORIDAD 1: Usar el HTML pre-generado ---
        // Si el backend nos envía una 'description' (como hacen el Lab de IA y Huracanes),
        // la usamos directamente. Es el método más fiable para leyendas complejas.
        if (varInfo.description && typeof varInfo.description === 'string' && varInfo.description.trim() !== '') {
            this._div.innerHTML = varInfo.description;
            return; // ¡Importante! Si usamos la descripción, no hacemos nada más.
        }

        // --- PRIORIDAD 2 (FALLBACK): Construir la leyenda manualmente ---
        // Si no hay 'description', construimos la leyenda a partir de sus partes.
        // Esto asegura que los análisis predefinidos sigan funcionando perfectamente.
        const title = varInfo.bandName || 'Leyenda';
        const unit = varInfo.unit ? `(${varInfo.unit})` : '';
        
        // Usamos '??' para manejar correctamente el valor 0.
        const min = varInfo.min ?? '';
        const max = varInfo.max ?? '';

        // Verificamos que la paleta sea un array con contenido.
        const hasPalette = Array.isArray(varInfo.palette) && varInfo.palette.length > 0;
        
        // Si hay paleta, la usamos. Si no, mostramos un gradiente por defecto.
        const gradient = hasPalette
            ? `linear-gradient(to right, ${varInfo.palette.join(', ')})`
            : `linear-gradient(to right, #FFFFFF, #000000)`;

        // Construimos el HTML final.
        this._div.innerHTML = `
            <div class="legend-title">${title} ${unit}</div>
            <div class="legend-scale-bar" style="background: ${gradient};"></div>
            <div class="legend-labels">
                <span>${min}</span>
                <span>${max}</span>
            </div>
        `;
    };
    legendControl.addTo(map);
}

function populateSelectors() {
    const varSelector = document.getElementById('variableSelector');
    Object.keys(varParams).forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        varSelector.appendChild(option);
    });
    const zonaPanel = document.getElementById('zonaSelectorPanel');
    Object.keys(zonas).forEach(name => {
        const id = `check-${name.replace(/\s/g, '')}`;
        const div = document.createElement('div');
        div.innerHTML = `<input type="checkbox" id="${id}" class="mr-2"><label for="${id}">${name}</label>`;
        const checkbox = div.firstChild;
        zonaCheckboxes[name] = checkbox;
        checkbox.addEventListener('change', () => handleZoneSelection(name));
        zonaPanel.appendChild(div);
    });
    const labRegionSelector = document.getElementById('lab-region-selector-municipalities'); // Apuntar al nuevo selector
    municipios.forEach(mun => {
        const option = document.createElement('option');
        option.value = mun;
        option.textContent = mun;
        labRegionSelector.appendChild(option);
    });
    const today = new Date().toISOString().split('T')[0];
    const aMonthAgo = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0];
    document.getElementById('lab-start-date').value = aMonthAgo;
    document.getElementById('lab-end-date').value = today;
}

// UBICACIÓN: platform-main.js
// REEMPLAZA la función setupEventListeners completa con esta versión.

function setupEventListeners() {
    const menuToggle = document.getElementById('menu-toggle');
    const controlPanel = document.getElementById('control-panel');
    const mainContent = document.querySelector('main');
    const sliderContainer = document.getElementById('opacity-slider-container');
    const labOverlay = document.getElementById('lab-overlay');

    // Manejo del panel lateral
    L.DomEvent.disableClickPropagation(sliderContainer);
    L.DomEvent.disableScrollPropagation(sliderContainer);
    menuToggle.addEventListener('click', (e) => { e.stopPropagation(); controlPanel.classList.toggle('control-panel-hidden'); });
    mainContent.addEventListener('click', () => { if (!controlPanel.classList.contains('control-panel-hidden')) { controlPanel.classList.add('control-panel-hidden'); }});
    
    // Controles principales
    document.getElementById('opacity-slider').addEventListener('input', e => { if (currentGEELayer) currentGEELayer.setOpacity(e.target.value); });
    document.getElementById('loadDataButton').addEventListener('click', () => handleAnalysis('general'));
    document.getElementById('compareButton').addEventListener('click', () => { zoomToActiveLayers(); handleAnalysis('compare'); });
    document.getElementById('precipAnalysisButton').addEventListener('click', () => handleAnalysis('precipitation'));
    document.getElementById('tempAnalysisButton').addEventListener('click', () => handleAnalysis('temperature'));
    document.getElementById('calculateSpiButton').addEventListener('click', () => handleAnalysis('spi'));
    document.getElementById('fireRiskButton').addEventListener('click', () => handleAnalysis('fireRisk'));
    document.getElementById('predictButton').addEventListener('click', () => {
    if (currentChartData) generatePrediction(currentChartData); // Se elimina 'window.'
    });    
    document.getElementById('clearDrawingButton').addEventListener('click', () => { drawnItems.clearLayers(); updateStatsPanel('Dibujos limpiados.'); });
    document.getElementById('resetButton').addEventListener('click', resetApp);
    document.getElementById('downloadCsvButton').addEventListener('click', downloadCSV);
    document.getElementById('downloadChartButton').addEventListener('click', downloadChart);
    document.getElementById('downloadPdfButton').addEventListener('click', downloadPDF);
    document.getElementById('variableSelector').addEventListener('change', toggleAnalysisPanels);
    document.getElementById('copy-ai-button').addEventListener('click', copyAiAnalysis);
    document.getElementById('download-ai-button').addEventListener('click', downloadAiAnalysis);

    document.getElementById('openLabButton').addEventListener('click', () => labOverlay.classList.remove('hidden'));
    document.getElementById('lab-close-button').addEventListener('click', () => labOverlay.classList.add('hidden'));
    labOverlay.addEventListener('click', (event) => { if (event.target === labOverlay) labOverlay.classList.add('hidden'); });
    
    document.getElementById('lab-analysis-type').addEventListener('change', handleLabAnalysisChange);
    handleLabAnalysisChange();

    // Ahora usamos las funciones importadas directamente, sin 'window'.
    document.getElementById('lab-fetch-hurricanes-button').addEventListener('click', fetchHurricaneList);
    document.getElementById('lab-execute-button').addEventListener('click', async () => {
        // 1. Muestra el loader pasándole el tipo 'lab' para los mensajes correctos.
        showLoading(true, 'lab');
        
        try {
            // 2. Espera a que la función de análisis termine.
            await handleLabExecution();
        } catch (error) {
            // 3. Si hay un error, lo mostramos en la consola.
            console.error("Fallo en la ejecución del Laboratorio:", error.message);
        } finally {
            // 4. Pase lo que pase, ocultamos la Etapa 1 del loader.
            // La Etapa 2 se activará cuando el usuario presione "Aplicar al Mapa".
            showLoading(false);
        }
    });
    
    document.getElementById('lab-apply-button').addEventListener('click', () => {
        applyLabResultToMap();
        labOverlay.classList.add('hidden');
    });

}

function handleZoneSelection(selectedName) {
    drawnItems.clearLayers(); 
    if (zonaCheckboxes[selectedName].checked) {
        const zona = zonas[selectedName];
        const layer = L.polygon(L.GeoJSON.coordsToLatLngs(zona.geom[0]), zona.style);
        map.addLayer(layer);
        zonaLayers[selectedName] = layer;
    } else {
        if (zonaLayers[selectedName]) {
            map.removeLayer(zonaLayers[selectedName]);
            delete zonaLayers[selectedName];
        }
    }
    zoomToActiveLayers();
}

function zoomToActiveLayers() {
    const layersToZoom = [...Object.values(zonaLayers), ...drawnItems.getLayers()];
    if (layersToZoom.length > 0) {
        const featureGroup = L.featureGroup(layersToZoom);
        map.fitBounds(featureGroup.getBounds(), { padding: [50, 50] });
    }
}

function clearZoneCheckboxes(removeLayers = true) {
    Object.values(zonaCheckboxes).forEach(cb => cb.checked = false);
    if (removeLayers) {
       Object.keys(zonaLayers).forEach(name => {
           if (zonaLayers[name]) {
               map.removeLayer(zonaLayers[name]);
               delete zonaLayers[name];
           }
       });
    }
}

function toggleAnalysisPanels() {
    const selectedVar = document.getElementById('variableSelector').value;
    document.getElementById('precipAnalysisPanel').classList.toggle('hidden', selectedVar !== 'Precipitación Acumulada (mm)');
    document.getElementById('tempAnalysisPanel').classList.toggle('hidden', selectedVar !== 'Temperatura del Aire (°C)');
}

function resetApp() {
    drawnItems.clearLayers();
    clearZoneCheckboxes();
    const defaultCheckbox = zonaCheckboxes[Object.keys(zonas)[0]];
    defaultCheckbox.checked = true;
    handleZoneSelection(Object.keys(zonas)[0]);
    if (currentGEELayer) map.removeLayer(currentGEELayer);
    legendControl.update(null);
    updateStatsPanel('Selecciona opciones y carga datos.');
    clearChartAndAi();
}

async function handleAnalysis(type, overrideRoi = null) {
    if (type === 'general' && getActiveROIs().length > 1) {
        updateStatsPanel('Error: Para "Cargar Datos", selecciona solo una zona o dibuja una sola área.');
        return;
    }
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    const activeROIs = overrideRoi ? [overrideRoi] : getActiveROIs();
    if (!startDate || !endDate || activeROIs.length === 0) {
        updateStatsPanel('Error: Asegúrate de seleccionar fechas y al menos una zona de interés.');
        return;
    }
    if (type === 'compare' && activeROIs.length < 2) {
        updateStatsPanel('Error: Para comparar, selecciona al menos dos zonas o dibuja dos áreas.');
        return;
    }
    clearMapAndAi();
    showLoading(true,type);
    let action, params;
    const selectedVar = document.getElementById('variableSelector').value;
    const varInfo = varParams[selectedVar];
    const baseParams = { startDate, endDate, varInfo };
    switch(type) {
        case 'general': action = 'getGeneralData'; params = { ...baseParams, roi: activeROIs[0] }; break;
        case 'compare': action = 'getCompareData'; params = { ...baseParams, rois: activeROIs }; break;
        case 'precipitation': action = 'getPrecipitationData'; params = { ...baseParams, roi: activeROIs[0], analysisType: document.getElementById('precipAnalysisSelector').value, aggregation: document.getElementById('precipAggregationSelector').value }; break;
        case 'temperature': action = 'getTemperatureData'; params = { ...baseParams, roi: activeROIs[0], analysisType: document.getElementById('tempAnalysisSelector').value }; break;
        case 'spi': action = 'getSpiData'; params = { ...baseParams, roi: activeROIs[0], timescale: parseInt(document.getElementById('spiTimescaleSelector').value) }; break;
        case 'fireRisk': action = 'getFireRiskData'; params = { ...baseParams, roi: activeROIs[0] }; break;
    }
    try {
        const response = await callGeeApi(action, params);
        legendControl.update(response.visParams || varInfo); 
        if (response.mapId) {
            // ...le pasamos el trabajo a addGeeLayer, que se encargará de la Etapa 2
            // y de ocultar el loader cuando el mapa esté listo.
            addGeeLayer(response.mapId.urlFormat, varInfo?.bandName || 'Análisis');
        } else {
            // Si NO hay mapa (ej. en una comparación de solo gráfico),
            // ocultamos el loader nosotros mismos.
            showLoading(false);
        }
        if (response.stats) updateStatsPanel(response.stats);
        if (response.chartData && response.chartData.length >= 2) {
            updateChartAndData(response.chartData, response.chartOptions);
        } else {
            clearChartAndAi();
            drawChart(null);
        }
        const aiData = { stats: response.stats, chartData: response.chartData, chartOptions: response.chartOptions, variable: selectedVar, roi: activeROIs[0]?.name || "área seleccionada", startDate, endDate };
        
        if (type === 'fireRisk') {
    generateFireRiskAnalysis(aiData); // Se elimina 'window.'
} else {
    generateAiAnalysis(aiData); // Se elimina 'window.'
}

    } catch (error) {
        console.error("Error en el análisis:", error);
        updateStatsPanel(`Error: ${error.message}`);
        legendControl.update(null);
        // Si hay un error, siempre ocultamos el loader.
        showLoading(false);
    }
    // ¡IMPORTANTE! Hemos eliminado el bloque 'finally' que ocultaba el loader prematuramente.
}

function getActiveROIs() {
    if (drawnItems.getLayers().length > 0) {
        return drawnItems.getLayers().map((layer, i) => ({
            name: `Área Dibujada ${i + 1}`,
            geom: layer.toGeoJSON().geometry
        }));
    }
    return Object.keys(zonaCheckboxes)
        .filter(name => zonaCheckboxes[name].checked)
        .map(name => ({
            name: name,
            geom: { type: 'Polygon', coordinates: zonas[name].geom }
        }));
}

async function callGeeApi(action, params) {
    const response = await fetch('/api/gee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, params }) });
    const responseText = await response.text();
    if (!response.ok) {
        try { throw new Error(JSON.parse(responseText).details || `Error del servidor ${response.status}.`); } 
        catch (e) { throw new Error(`Error del servidor ${response.status}.`); }
    }
    try { return JSON.parse(responseText); }
    catch (e) { throw new Error(`Respuesta inválida del servidor.`); }
}

// UBICACIÓN: platform-main.js

function downloadCSV() {
    // 1. Usa la variable global directamente, como en la versión antigua.
    if (!currentChartData || currentChartData.length < 2) {
        alert('No hay datos en el gráfico para descargar.');
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    
    // 2. Define una función para escapar caracteres especiales.
    const escapeCSV = (field) => {
        if (field === null || field === undefined) return '';
        let fieldStr = String(field);
        // Si el campo contiene comillas, comas o saltos de línea, lo encerramos en comillas.
        if (fieldStr.includes('"') || fieldStr.includes(',') || fieldStr.includes('\n')) {
            fieldStr = fieldStr.replace(/"/g, '""'); // Escapa las comillas dobles dentro del campo.
            return `"${fieldStr}"`;
        }
        return fieldStr;
    };

    // 3. Convierte cada fila del arreglo de datos a una línea de CSV.
    currentChartData.forEach(rowArray => {
        let row = rowArray.map(escapeCSV).join(",");
        csvContent += row + "\r\n";
    });

    // 4. Crea el enlace de descarga, lo añade al cuerpo, lo "cliquea" y lo elimina.
    // Este método es el más compatible con todos los navegadores.
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "reporte_datos_climaticos.csv");
    document.body.appendChild(link); 
    link.click();
    document.body.removeChild(link);
}

function downloadChart() {
    if (currentChart) {
        const link = document.createElement('a');
        link.href = currentChart.getImageURI(); 
        link.download = 'grafico_climatico.png';
        link.click();
    }
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    showLoading(true);
    try {
        doc.setFontSize(18);
        doc.text('Reporte de Análisis Climático', 105, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generado: ${new Date().toLocaleString('es-MX')}`, 105, 26, { align: 'center' });
        const variable = document.getElementById('variableSelector').value || 'N/A';
        const rois = getActiveROIs().map(r => r.name).join(', ') || 'N/A';
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        doc.setFontSize(12);
        doc.text('Parámetros del Análisis', 14, 40);
        doc.setFontSize(10);
        doc.text(`Variable: ${variable}`, 14, 46);
        doc.text(`Zona(s) de Interés: ${rois}`, 14, 51);
        doc.text(`Periodo: ${startDate} al ${endDate}`, 14, 56);
        const statsText = document.getElementById('stats-panel').textContent;
        doc.setFontSize(12);
        doc.text('Resumen Estadístico', 14, 68);
        doc.setFontSize(10);
        const statsLines = doc.splitTextToSize(statsText, 180);
        doc.text(statsLines, 14, 74);
        let currentY = 74 + (statsLines.length * 5) + 8;
        const chartPanel = document.getElementById('chart-panel');
        const canvas = await html2canvas(chartPanel, { backgroundColor: '#a04040' });
        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = 180;
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        doc.addImage(imgData, 'PNG', 15, currentY, pdfWidth, pdfHeight);
        currentY += pdfHeight + 10;
        const aiSummaryEl = document.getElementById('ai-summary');
        if (aiSummaryEl && aiSummaryEl.textContent.trim() !== 'Esperando análisis...') {
            doc.addPage();
            doc.setFontSize(14);
            doc.text('Análisis e Interpretación con IA', 105, 20, { align: 'center' });
            doc.setFontSize(10);
            const aiText = aiSummaryEl.innerText;
            const aiLines = doc.splitTextToSize(aiText, 180);
            doc.text(aiLines, 14, 30);
        }
        doc.save('reporte_climatico.pdf');
    } catch (error) {
        console.error("Error generando PDF:", error);
        alert("No se pudo generar el PDF. Revisa la consola para más detalles.");
    } finally {
        showLoading(false);
    }
}

function copyAiAnalysis() {
    const textToCopy = document.getElementById('ai-summary').innerText;
    navigator.clipboard.writeText(textToCopy).then(() => alert('Análisis copiado al portapapeles.'));
}

function downloadAiAnalysis() {
    const text = document.getElementById('ai-summary').innerText;
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'analisis_ia.txt';
    link.click();
    URL.revokeObjectURL(link.href);
}

function showLoading(isLoading, analysisType = 'general') {
    if (isLoading) {
        // Mensajes por defecto
        let messages = [
            "Estableciendo conexión segura con Google Earth Engine...",
            "Consultando catálogos de imágenes satelitales...",
            "Filtrando y procesando los datos para la región...",
            "Generando el mapa de resultados...",
            "Compilando las estadísticas finales..."
        ];
        
        // Mensajes personalizados para análisis específicos
        if (analysisType === 'fireRisk') {
            messages = [
                "Accediendo a datos de temperatura y sequía...",
                "Modelando las condiciones de riesgo de incendio...",
                "Clasificando el nivel de riesgo en el mapa...",
                "Generando el producto final..."
            ];
        }
        else if (analysisType === 'lab') {
            messages = [
                "Accediendo al Laboratorio de IA...",
                "Configurando el entorno de análisis en el servidor...",
                "Ejecutando el módulo de análisis especializado...",
                "Compilando resultados para la previsualización...",
                "¡Análisis completado!"
            ];
        }

        Loader.show(messages);
    } else {
        Loader.hide();
    }
}
function updateStatsPanel(text) { document.getElementById('stats-panel').textContent = text; }

function clearMapAndAi() {
    if (currentGEELayer) map.removeLayer(currentGEELayer);
    legendControl.update(null);
    clearChartAndAi();
}

// UBICACIÓN: platform-main.js

function clearChartAndAi() {
    const chartPanel = document.getElementById('chart-panel');
    chartPanel.innerHTML = '<span class="text-gray-300">El gráfico aparecerá aquí</span>';
    
    // Limpiamos la variable global
    currentChartData = null; 
    currentChart = null;
    
    // Deshabilitamos todos los botones de acción
    document.getElementById('downloadCsvButton').disabled = true;
    document.getElementById('downloadChartButton').disabled = true;
    document.getElementById('predictButton').disabled = true;
    document.getElementById('downloadPdfButton').disabled = true;
    document.getElementById('ai-analysis-panel').classList.add('hidden');
    document.getElementById('ai-actions-container').classList.add('hidden');
}

// UBICACIÓN: platform-main.js
// REEMPLAZA la función addGeeLayer completa.

function addGeeLayer(url, varName) {
    if (currentGEELayer) {
        map.removeLayer(currentGEELayer);
        layerControl.removeLayer(currentGEELayer);
    }
    
    // --- LA CORRECCIÓN CLAVE ---
    // 1. Antes de crear la capa, cambiamos el loader a la Etapa 2.
    Loader.showStage2();

    currentGEELayer = L.tileLayer(url, { attribution: 'Google Earth Engine' });

    // 2. Escuchamos el evento 'load'. Este se dispara cuando TODAS las teselas visibles se han cargado.
    currentGEELayer.on('load', function() {
        // 3. Cuando la capa está completamente visible, ocultamos el loader.
        Loader.hide();
    });
    
    // 4. Añadimos la capa al mapa (esto inicia la descarga de teselas).
    currentGEELayer.addTo(map);
    
    layerControl.addOverlay(currentGEELayer, `Capa: ${varName}`);
    document.getElementById('opacity-slider-container').style.display = 'block';
    document.getElementById('opacity-slider').value = 1;
}

// UBICACIÓN: platform-main.js

function updateChartAndData(data, options) {
    console.log("GUARDANDO DATOS (antes de la copia):", data);

    // --- LA CORRECCIÓN CLAVE Y DEFINITIVA ---
    // Creamos una copia profunda de los datos solo para la descarga.
    // Esto lo aísla de cualquier modificación inesperada por otras funciones o librerías.
    currentChartData = data.map(row => [...row]);

    console.log("DATOS AISLADOS PARA DESCARGA:", currentChartData);

    // La función de dibujo usa los datos originales, como siempre
    drawChart(data, options);
    
    // Habilita los botones
    document.getElementById('downloadCsvButton').disabled = false;
    document.getElementById('downloadChartButton').disabled = false;
    document.getElementById('predictButton').disabled = false;
    document.getElementById('downloadPdfButton').disabled = false;
}

function drawChart(data, options) {
    const chartPanel = document.getElementById('chart-panel');
    if (!data || data.length < 2) {
        chartPanel.innerHTML = '<span class="text-gray-400">No hay datos suficientes para mostrar un gráfico.</span>';
        return;
    }
    chartPanel.innerHTML = '';
    const dataTable = new google.visualization.DataTable();
    dataTable.addColumn('date', data[0][0]);
    for (let i = 1; i < data[0].length; i++) dataTable.addColumn('number', data[0][i]);
    const rows = data.slice(1).map(row => [new Date(row[0]), ...row.slice(1)]).filter(row => !isNaN(row[0].getTime()));
    if (rows.length === 0) {
        chartPanel.innerHTML = '<span class="text-gray-400">No hay datos válidos en el rango de fechas seleccionado.</span>';
        return;
    }
    dataTable.addRows(rows);
    const chartType = document.getElementById('chartTypeSelector').value;
    switch(chartType) {
        case 'ColumnChart': currentChart = new google.visualization.ColumnChart(chartPanel); break;
        case 'ScatterChart': currentChart = new google.visualization.ScatterChart(chartPanel); break;
        case 'AreaChart': currentChart = new google.visualization.AreaChart(chartPanel); break;
        default: currentChart = new google.visualization.LineChart(chartPanel);
    }
    const defaultOptions = { backgroundColor: '#a04040', titleTextStyle: { color: '#FFFFFF' }, legend: { textStyle: { color: '#FFFFFF' }, position: 'top' }, hAxis: { textStyle: { color: '#FFFFFF' }, titleTextStyle: { color: '#FFFFFF' } }, vAxis: { textStyle: { color: '#FFFFFF' }, titleTextStyle: { color: '#FFFFFF' } }, chartArea: { width: '85%', height: '75%' } };
    currentChart.draw(dataTable, {...defaultOptions, ...options});
}

// UBICACIÓN: platform-main.js
// REEMPLAZA la función handleLabAnalysisChange completa con esta versión.

function handleLabAnalysisChange() {
    const analysisType = document.getElementById('lab-analysis-type').value;
    const regionStep = document.getElementById('lab-step-region');
    const datesStep = document.getElementById('lab-step-dates');
    const actionsStep = document.getElementById('lab-step-actions');
    
    // Selectores de región
    const munSelector = document.getElementById('lab-region-selector-municipalities');
    const marineSelector = document.getElementById('lab-region-selector-marine'); // Selector para zonas marinas
    
    // Controles específicos para huracanes
    const hurricaneOptions = document.getElementById('lab-hurricane-options');
    const hurricaneSelectorContainer = document.getElementById('lab-hurricane-selector-container');

    // Ocultar todo por defecto para empezar de cero
    munSelector.classList.add('hidden');
    marineSelector.classList.add('hidden');
    hurricaneOptions.classList.add('hidden');
    datesStep.classList.add('hidden'); 

    // Mostrar los pasos principales que casi siempre se usan
    regionStep.classList.remove('hidden');
    actionsStep.classList.remove('hidden');

    // Lógica condicional para mostrar los controles correctos
    if (analysisType === 'HURRICANE') {
        // Para huracanes, solo mostramos las opciones de búsqueda de huracanes.
        hurricaneOptions.classList.remove('hidden');
        hurricaneSelectorContainer.classList.add('hidden'); // Se oculta hasta la búsqueda
    } else if (analysisType === 'FAI') {
        // ▼▼▼ LÓGICA PARA SARGAZO ▼▼▼
        // Para sargazo, mostramos el selector de zonas marinas y las fechas.
        marineSelector.classList.remove('hidden');
        datesStep.classList.remove('hidden');
    } else {
        // Para todos los demás análisis (NDVI, LST, etc.), mostramos los municipios y las fechas.
        munSelector.classList.remove('hidden');
        datesStep.classList.remove('hidden');
    }
}

// ... todo tu código existente de platform-main.js ...

// Por ejemplo, después de la última llave de cierre `}` de tu última función.


// ===============================================
//         LÓGICA DEL GEOCHAT BOT
// ===============================================

function toggleChat() {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.style.display = chatWindow.style.display === 'flex' ? 'none' : 'flex';
}

function handleChatInput(event) {
    if (event.key === 'Enter') {
        sendMessageToBot();
    }
}

async function sendMessageToBot() {
    const input = document.getElementById('chat-input');
    const messageText = input.value.trim();
    if (!messageText) return;

    const chatMessages = document.getElementById('chat-messages');

    // Muestra el mensaje del usuario
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user';
    userMessage.innerHTML = `<p>${messageText}</p>`;
    chatMessages.appendChild(userMessage);

    input.value = '';
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll

    // Muestra indicador de "escribiendo"
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'chat-message bot';
    typingIndicator.innerHTML = `<p class="loader">Geo está pensando...</p>`;
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Llama al nuevo endpoint de la IA
    try {
        const response = await fetch('/api/ask-geo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: messageText })
        });

        if (!response.ok) {
            throw new Error('Hubo un problema al contactar a Geo.');
        }

        const { answer } = await response.json();

        // Reemplaza el indicador con la respuesta de Geo
        typingIndicator.innerHTML = `<p>${answer}</p>`;
        chatMessages.scrollTop = chatMessages.scrollHeight;

    } catch (error) {
        typingIndicator.innerHTML = `<p style="color: red;">Lo siento, tuve un problema para conectarme. Intenta de nuevo.</p>`;
    }
}

// --- EXPOSICIÓN DE FUNCIONES GLOBALES ---
window.updateStatsPanel = updateStatsPanel;
window.drawChart = drawChart;
window.updateChartAndData = updateChartAndData;
window.zonaCheckboxes = zonaCheckboxes;
window.handleZoneSelection = handleZoneSelection;
window.clearZoneCheckboxes = clearZoneCheckboxes;
window.handleAnalysis = handleAnalysis;
window.addGeeLayer = addGeeLayer;
window.clearMapAndAi = clearMapAndAi;
window.clearChartAndAi = clearChartAndAi;
window.downloadCSV = downloadCSV;
window.downloadChart = downloadChart;
window.downloadPDF = downloadPDF;
window.copyAiAnalysis = copyAiAnalysis;
window.downloadAiAnalysis = downloadAiAnalysis;
window.handleLabAnalysisChange = handleLabAnalysisChange;
window.showLoading = showLoading;

// Archivo: ai-connector.js

// --- 1. CONEXIÓN CON LA IA PARA ANÁLISIS (PANELES DERECHOS) ---
const AI_API_URL = '/api/analyze';
const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');
const aiActionsContainer = document.getElementById('ai-actions-container');
const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');
let lastLabResult = null; // Almacenar el último resultado exitoso del lab

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


// --- 3. LÓGICA PARA EL LABORATORIO DE IA (MODAL) ---
// UBICACIÓN: ai-connector.js
// REEMPLAZA la función handleLabCodeGeneration completa

async function handleLabCodeGeneration() {
    const resultDisplay = document.getElementById('lab-result-display');
    const generateButton = document.getElementById('lab-generate-button');
    const executeButton = document.getElementById('lab-execute-button');
    const copyButton = document.getElementById('lab-copy-code-button');

    // --- CORRECCIÓN CLAVE ---
    // Se ajusta la construcción del objeto de la petición.
    const analysisType = document.getElementById('lab-analysis-type').value;
    let structuredRequest;

    if (analysisType === 'HURRICANE') {
        const hurricaneSelector = document.getElementById('lab-hurricane-selector');
        structuredRequest = {
            analysisType: 'HURRICANE',
            // Enviamos el SID y el nombre para usar en la leyenda.
            hurricaneSid: hurricaneSelector.value,
            hurricaneName: hurricaneSelector.options[hurricaneSelector.selectedIndex].text,
            year: document.getElementById('lab-hurricane-year').value
        };
    } else {
        structuredRequest = {
            analysisType: analysisType,
            region: document.getElementById('lab-region-selector-municipalities').value,
            startDate: document.getElementById('lab-start-date').value,
            endDate: document.getElementById('lab-end-date').value
        };
    }
    // --- FIN DE LA CORRECCIÓN ---

    generateButton.disabled = true;
    generateButton.textContent = "Generando...";
    executeButton.disabled = true;
    copyButton.disabled = true;
    resultDisplay.textContent = "// Generando código, por favor espera...";

    const prompt = buildGeeLabPrompt(structuredRequest);

    try {
        const response = await fetch('/api/gee-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) });
        if (!response.ok) throw new Error((await response.json()).error || "Error en el servidor del laboratorio.");
        
        const result = await response.json();
        const generatedCode = result.generatedCode.replace(/^```(javascript)?\s*|\s*```\s*$/g, '');
        
        resultDisplay.textContent = generatedCode;
        if (generatedCode) {
            executeButton.disabled = false;
            copyButton.disabled = false;
        }

    } catch (error) {
        resultDisplay.textContent = `// Ocurrió un error:\n// ${error.message}`;
    } finally {
        generateButton.disabled = false;
        generateButton.textContent = "Generar Código";
    }
}

async function handleLabCodeExecution() {
    const code = document.getElementById('lab-result-display').textContent;
    const executeButton = document.getElementById('lab-execute-button');
    const applyButton = document.getElementById('lab-apply-button');
    const previewOverlay = document.getElementById('lab-preview-overlay');
    const previewText = document.getElementById('lab-preview-text');

// LÍNEA NUEVA - CORREGIDA
// BLOQUE NUEVO - CORRECCIÓN DEFINITIVA
    const trimmedCode = code.trim();
    const isPlaceholderOrError = 
        trimmedCode.startsWith("// El código generado por la IA aparecerá aquí.") ||
        trimmedCode.startsWith("// Generando código, por favor espera...") ||
        trimmedCode.startsWith("// Ocurrió un error:");

    if (!code || isPlaceholderOrError) {
        alert("No hay código válido para ejecutar. Asegúrate de que la generación de código fue exitosa.");
        return;
    }    
    executeButton.classList.add('hidden');
    previewOverlay.classList.remove('hidden');
    previewText.textContent = "Ejecutando en GEE y preparando previsualización...";

// UBICACIÓN: ai-connector.js, dentro de handleLabCodeExecution

        try {
            const regionName = (() => {
                const munSelector = document.getElementById('lab-region-selector-municipalities');
                return !munSelector.classList.contains('hidden')
                    ? munSelector.value
                    : document.getElementById('lab-region-selector-marine').value;
            })();
            const startDate = document.getElementById('lab-start-date').value;
            const endDate = document.getElementById('lab-end-date').value;

            const response = await fetch('/api/gee-lab', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    codeToExecute: code,
                    roi: regionName,
                    startDate: startDate,
                    endDate: endDate
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.details || "Error al ejecutar el código en el servidor.");
            }

            // Guardamos el resultado exitoso en la variable global
            lastLabResult = await response.json();
            
            // Mostramos un mensaje de éxito y activamos el botón de aplicar
            previewText.textContent = "✅ ¡Previsualización Lista! Cierra para aplicar al mapa.";
            applyButton.classList.remove('hidden');

        } catch (error) {
            previewText.textContent = `❌ Error: ${error.message}`;
            executeButton.classList.remove('hidden'); 
            setTimeout(() => {
                previewOverlay.classList.add('hidden');
                // Restablecer el texto por si el usuario quiere intentarlo de nuevo
                previewText.textContent = "Ejecutando en GEE y preparando previsualización...";
            }, 4000); 

    } finally {
        executeButton.disabled = false;
        executeButton.textContent = "Ejecutar Código";
        // No re-habilitar el botón de ejecutar aquí, se maneja con el botón de aplicar
    }
}

// REEMPLAZA la función applyLabResultToMap completa con esta versión:

function applyLabResultToMap() {
    if (lastLabResult) {
        // 1. Añadir la capa de GEE al mapa
        if (lastLabResult.mapId) {
            window.addGeeLayer(lastLabResult.mapId.urlFormat, 'Resultado del Laboratorio');
        }

        // 2. --- LÓGICA DE LEYENDA CORREGIDA Y ROBUSTA ---
        if (window.legendControl && lastLabResult.visParams) {
            // Creamos un objeto de leyenda base y seguro.
            const legendInfo = {
                // Proporciona valores predeterminados para el título.
                bandName: 'Resultado del Laboratorio',
                unit: '',
                // Copia todas las propiedades del resultado del laboratorio (min, max, palette, description).
                ...lastLabResult.visParams
            };

            // La función de actualización ahora tiene todo lo que necesita para funcionar en cualquier caso.
            window.legendControl.update(legendInfo);
        }

        // 3. Actualizar los paneles de estadísticas y gráficos (sin cambios aquí)
        if (lastLabResult.stats) {
            window.updateStatsPanel(lastLabResult.stats);
        }
        if (lastLabResult.chartData) {
            window.updateChartAndData(lastLabResult.chartData, lastLabResult.chartOptions);
        }

        // 4. Habilitar botones de descarga
        document.getElementById('downloadCsvButton').disabled = false;
        document.getElementById('downloadChartButton').disabled = false;

    } else if (window.legendControl) {
        // Limpia la leyenda si no hay resultados
        window.legendControl.update(null);
    }
    
    // 5. Restablecer el estado del modal del laboratorio (sin cambios aquí)
    document.getElementById('lab-execute-button').classList.remove('hidden');
    document.getElementById('lab-apply-button').classList.add('hidden');
    document.getElementById('lab-preview-overlay').classList.add('hidden');
}

function handleLabCopyCode() {
    const codeToCopy = document.getElementById('lab-result-display').textContent;
    navigator.clipboard.writeText(codeToCopy).then(() => alert('Código copiado al portapapeles.'));
}

window.handleLabCodeGeneration = handleLabCodeGeneration;
window.handleLabCodeExecution = handleLabCodeExecution;
window.handleLabCopyCode = handleLabCopyCode;
window.applyLabResultToMap = applyLabResultToMap;


// --- 4. CONSTRUCCIÓN DE PROMPTS PARA LA IA ---
function markdownToHtml(text) {
    return text?.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('').replace(/<p>\*/g, '<ul>*').replace(/\* (.*?)(<br>|<\/p>)/g, '<li>$1</li>').replace(/<\/li><\/ul><\/p>/g, '</li></ul>');
}

function buildPrompt(data) {
    const { stats, chartData, variable, roi, startDate, endDate } = data;
    const chartSample = chartData ? `Los primeros 5 puntos de datos son: ${JSON.stringify(chartData.slice(0, 6))}` : "No hay datos de serie temporal.";
    return `Eres un climatólogo experto en Campeche. Analiza los siguientes datos para un informe gubernamental. **Variable:** ${variable}. **Zona:** ${roi}. **Periodo:** ${startDate} a ${endDate}. **Estadísticas:** ${stats || "N/A"}. **Muestra de datos:** ${chartSample}. **Instrucciones:** Genera un resumen ejecutivo conciso (máx 3 párrafos). Enfócate en tendencias e implicaciones prácticas para Protección Civil, Desarrollo Agropecuario y **SEDECO**. Finaliza con una **Conclusión Clave** en negritas. Responde en texto simple.`;
}

function buildConversationalPrompt(query) {
    const today = new Date().toISOString().split('T')[0];
    const municipios = "Calakmul, Calkiní, Campeche, Candelaria, Carmen, Champotón, Dzitbalché, Escárcega, Hecelchakán, Hopelchén, Palizada, Seybaplaya, Tenabo";
    return `Tu tarea es traducir la petición a JSON para una plataforma climática de Campeche. Hoy es ${today}. Extrae: startDate, endDate, variable, zona_type, zona_name. **Variables:** "Temperatura del Aire (°C)", "Humedad Relativa (%)", "Precipitación Acumulada (mm)", "Temp. Superficial (LST °C)", "Evapotranspiración (mm/8 días)". **Zonas Predefinidas:** "Todo el Estado", "Zona 1, Ciudad Campeche", "Zona 2, Lerma", "Zona 3, Chiná", "Zona 4, San Fco. Campeche". **Municipios:** ${municipios}. **Reglas:** 1. Responde solo con el JSON. 2. 'zona_type' debe ser 'predefinida' o 'municipio'. Usa nombres exactos con acentos. 3. Si no se menciona zona, usa "Todo el Estado". 4. Infiere la variable (ej. "calor" -> "Temperatura del Aire (°C)"). 5. Si la petición no es sobre clima/geografía de Campeche, responde con '{"error": "Petición fuera de alcance"}'. **Petición:** "${query}"`;
}

// UBICACIÓN: ai-connector.js

function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1];
    
    // --- LÍNEA CORREGIDA ---
    // Usamos slice(1) para quitar el encabezado y luego slice(-15) en una copia segura.
    // Esto evita que el arreglo original sea modificado.
    const dataOnly = chartData.slice(1);
    const recentDataSample = JSON.stringify(dataOnly.slice(-15));

    return `
        Eres un climatólogo experto en análisis de datos y modelado de tendencias para el estado de Campeche.
        Tu tarea es analizar la siguiente serie temporal de datos climáticos y generar un pronóstico cualitativo a corto plazo (próximas 2-4 semanas).

        **Datos de la Serie Temporal Reciente:**
        - **Variable:** ${variableName}
        - **Últimos 15 puntos de datos:** ${recentDataSample}

        **Instrucciones para tu respuesta:**
        1.  **Análisis de Tendencia:** Describe brevemente la tendencia observada en los datos más recientes. ¿Está aumentando, disminuyendo, es estable o es errática?
        2.  **Pronóstico a Corto Plazo:** Basado en esta tendencia y en tu conocimiento general del clima de Campeche para la época del año, proyecta cómo es probable que se comporte esta variable en las próximas 2 a 4 semanas.
        3.  **Implicaciones y Recomendaciones:** ¿Qué significa este pronóstico para los sectores clave?
            - **Si la tendencia es negativa (ej. menos lluvia, más calor):** Advierte sobre los riesgos (estrés hídrico, riesgo de incendios, olas de calor) y sugiere acciones preventivas para Protección Civil y la Secretaría de Desarrollo Agropecuario.
            - **Si la tendencia es positiva (ej. lluvias regulares, temperaturas moderadas):** Describe las condiciones favorables.
            - **Si la tendencia es extrema (ej. lluvias muy intensas):** Advierte sobre posibles riesgos de inundaciones.

        **Formato de Salida:**
        Usa formato Markdown. Inicia con un titular claro como "**Pronóstico de Tendencia**". Usa negritas para resaltar los puntos clave.
    `;
}

function buildFireRiskPrompt(data) {
    const { roi, startDate, endDate } = data;
    return `Eres un analista de riesgos para el gobierno de Campeche. Interpreta un mapa de "Riesgo de Incendio Promedio" para **${roi}** del **${startDate}** al **${endDate}**. La leyenda es: Verde (Bajo), Amarillo (Moderado), Naranja (Alto), Rojo (Extremo). **Instrucciones:** 1. Titula "Interpretación del Mapa de Riesgo de Incendio". 2. Explica qué implica ver manchas naranjas/rojas en zonas agrícolas o forestales. 3. Da recomendaciones accionables para SEPROCI (monitoreo, alertas), Desarrollo Agropecuario y **SEDECO** (impacto económico). Usa Markdown.`;
}

// UBICACIÓN: ai-connector.js

// UBICACIÓN: ai-connector.js

// UBICACIÓN: ai-connector.js

// UBICACIÓN: ai-connector.js

// UBICACIÓN: ai-connector.js
// Reemplaza la función buildGeeLabPrompt completa con esta versión corregida.

function buildGeeLabPrompt(request) {
    let analysisLogic = '';
    
    // Función auxiliar para crear el HTML de la leyenda de forma consistente
    const createLegendHtml = (title, palette, min, max) => {
        const gradient = `linear-gradient(to right, ${palette.join(', ')})`;
        return `
    <div class="legend-title">${title}</div>
    <div class="legend-scale-bar" style="background: ${gradient};"></div>
    <div class="legend-labels"><span>${min}</span><span>${max}</span></div>
  `;
    };

    switch (request.analysisType) {
        case 'NDVI':
            analysisLogic = `
var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(roi).filterDate(startDate, endDate).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
var addNDVI = function(image) { return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI')); };
collection = collection.map(addNDVI);
laImagenResultante = collection.select('NDVI').median();
collectionForChart = collection.select('NDVI');
bandNameForChart = 'NDVI';
visParams = {
  min: -0.2, max: 0.9, palette: ['blue', 'white', 'green'],
  description: \`${createLegendHtml('Índice de Vegetación (NDVI)', ['blue', 'white', 'green'], -0.2, 0.9)}\`
};`;
            break;
        case 'LST':
            analysisLogic = `
var collection = ee.ImageCollection('MODIS/061/MOD11A2').filterBounds(roi).filterDate(startDate, endDate);
var processLST = function(image) { return image.addBands(image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST')); };
collection = collection.map(processLST);
laImagenResultante = collection.select('LST').median();
collectionForChart = collection.select('LST');
bandNameForChart = 'LST';
visParams = {
  min: 15, max: 45, palette: ['blue', 'cyan', 'yellow', 'red'],
  description: \`${createLegendHtml('Temp. Superficial (°C)', ['blue', 'cyan', 'yellow', 'red'], 15, 45)}\`
};`;
            break;
        case 'NDWI':
            analysisLogic = `
var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(roi).filterDate(startDate, endDate).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));
var addNDWI = function(image) { return image.addBands(image.normalizedDifference(['B3', 'B8']).rename('NDWI')); };
collection = collection.map(addNDWI);
laImagenResultante = collection.select('NDWI').median();
collectionForChart = collection.select('NDWI');
bandNameForChart = 'NDWI';
visParams = {
  min: -1, max: 1, palette: ['brown', 'white', 'blue'],
  description: \`${createLegendHtml('Índice de Agua (NDWI)', ['brown', 'white', 'blue'], -1, 1)}\`
};`;
            break;
        case 'FIRE':
            analysisLogic = `
var fires = ee.ImageCollection('FIRMS').filterBounds(roi).filterDate(startDate, endDate).select('T21');
laImagenResultante = fires.reduce(ee.Reducer.max()).focal_max({radius: 3000, units: 'meters'});
collectionForChart = null;
bandNameForChart = null;
visParams = {
  min: 330, max: 360, palette: ['yellow', 'orange', 'red', 'purple'],
  description: \`${createLegendHtml('Puntos de Calor (Temp. Brillo K)', ['yellow', 'orange', 'red', 'purple'], 330, 360)}\`
};`;
            break;
        case 'FAI':
            analysisLogic = `
var waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(roi).filterDate(startDate, endDate).filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50));
var addFAI = function(image) {
  var imageWithMask = image.updateMask(waterMask.gt(80));
  var fai = imageWithMask.expression('NIR - (RED + (SWIR - RED) * (842 - 665) / (1610 - 665))', {'NIR': imageWithMask.select('B8'), 'RED': imageWithMask.select('B4'), 'SWIR': imageWithMask.select('B11')}).rename('FAI');
  return image.addBands(fai);
};
collection = collection.map(addFAI);
laImagenResultante = collection.select('FAI').max();
collectionForChart = collection.select('FAI');
bandNameForChart = 'FAI';
visParams = {
  min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
  description: \`${createLegendHtml('Índice de Algas Flotantes (FAI)', ['#000080', '#00FFFF', '#FFFF00', '#FF0000'], -0.05, 0.2)}\`
};`;
            break;
        case 'AIR_QUALITY':
            analysisLogic = `
var collection = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2').filterBounds(roi).filterDate(startDate, endDate).select('tropospheric_NO2_column_number_density');
laImagenResultante = collection.median();
collectionForChart = collection;
bandNameForChart = 'tropospheric_NO2_column_number_density';
visParams = {
  min: 0, max: 0.0003, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red'],
  description: \`${createLegendHtml('Dióxido de Nitrógeno (mol/m²)', ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red'], 0, '0.0003')}\`
};`;
            break;
// UBICACIÓN: ai-connector.js
// REEMPLAZA el 'case' completo para 'HURRICANE' en buildGeeLabPrompt

case 'HURRICANE':
    // Ahora recibimos el SID y el nombre por separado.
    const selectedHurricaneSid = request.hurricaneSid;
    const selectedHurricaneName = request.hurricaneName;
    const hurricaneYear = request.year;

    analysisLogic = `
// 1. Filtramos todos los puntos usando el SID, el identificador único y correcto.
var points = ee.FeatureCollection('NOAA/IBTrACS/v4')
    .filter(ee.Filter.eq('SID', '${selectedHurricaneSid}'));

// 2. Creamos la línea de la trayectoria ordenando los puntos por fecha.
var line = ee.Geometry.LineString(points.sort('ISO_TIME').geometry().coordinates());
var trajectoryLine = ee.FeatureCollection(line).style({color: 'FFFFFF', width: 1});

// 3. Obtenemos la capa de temperatura del mar (SST).
var lastPointDate = ee.Date(points.aggregate_max('system:time_start'));
var sst = ee.ImageCollection('NOAA/CDR/OISST/V2.1')
    .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
    .select(['sst']).mean().multiply(0.01);
var sstImage = sst.visualize({min: 20, max: 32, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']});

// 4. Definimos los estilos para los PUNTOS de intensidad.
var styles = {
  'Tropical Storm': {pointSize: 3, color: '00FFFF'},
  'Category 1':     {pointSize: 4, color: '00FF00'},
  'Category 2':     {pointSize: 5, color: 'FFFF00'},
  'Category 3':     {pointSize: 6, color: 'FF8C00'},
  'Category 4':     {pointSize: 7, color: 'FF0000'},
  'Category 5':     {pointSize: 8, color: 'FF00FF'}
};

// 5. Asignamos una categoría a cada punto.
var pointsStyled = points.map(function(feature) {
  var wind = ee.Number(feature.get('usa_wind'));
  var category = ee.String(
      ee.Algorithms.If(wind.gt(136), 'Category 5',
      ee.Algorithms.If(wind.gt(112), 'Category 4',
      ee.Algorithms.If(wind.gt(95),  'Category 3',
      ee.Algorithms.If(wind.gt(82),  'Category 2',
      ee.Algorithms.If(wind.gt(63),  'Category 1',
                                      'Tropical Storm'))))));
  return feature.set('styleProperty', category);
});

// 6. "Dibujamos" los puntos coloreados.
var intensityPoints = pointsStyled.style({
  styleProperty: 'styleProperty',
  styles: styles
});

// 7. Combinamos todo.
laImagenResultante = sstImage.blend(trajectoryLine).blend(intensityPoints);

collectionForChart = null;
bandNameForChart = null;

// La leyenda ahora usa el nombre que pasamos desde la UI.
visParams = {
  description: \`
    <div class="legend-title">Huracán: ${selectedHurricaneName} (${hurricaneYear})</div>
    <div style="font-size: 11px; margin-top: 4px;"><strong>Temperatura del Mar (°C)</strong></div>
    <div class="legend-scale-bar" style="background: linear-gradient(to right, #000080, #00FFFF, #FFFF00, #FF0000);"></div>
    <div class.="legend-labels" style="font-size: 11px;"><span>20</span><span>32</span></div>
    <div style="font-size: 11px; margin-top: 4px;"><strong>Intensidad (Saffir-Simpson)</strong></div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF00FF; border-radius: 50%; margin-right: 5px;"></div> Cat. 5</div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF0000; border-radius: 50%; margin-right: 5px;"></div> Cat. 4</div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF8C00; border-radius: 50%; margin-right: 5px;"></div> Cat. 3</div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FFFF00; border-radius: 50%; margin-right: 5px;"></div> Cat. 2</div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #00FF00; border-radius: 50%; margin-right: 5px;"></div> Cat. 1</div>
    <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #00FFFF; border-radius: 50%; margin-right: 5px;"></div> Torm./Dep. Tropical</div>
  \`
};`;
    break;
}
    // Este prompt es 100% a prueba de fallos de sintaxis.
    return ` Funciones como Map.addLayer, Map.centerObject, Map.setCenter, o similares no son compatibles para el entorno actual, siempre sustituye esas funciones con codigo valido para el entorno actual, Simepre verifica que las funciones esten definidas por ejemplo Print o ui y similares (Solo si el codigo lo requiere), Siempre añade el formato correcto para la leyenda y Genera el siguiente código GEE, sin añadir comentarios ni explicaciones:

    // ${request.analysisType}
    // ${request.region}
    // ${request.startDate} a ${request.endDate}
    ${analysisLogic}`;
}

// UBICACIÓN: /api/gee.js
// REEMPLAZA la función handleHurricaneList completa

async function handleHurricaneList({ year }) {
    if (!year) {
        throw new Error("El año es un parámetro requerido.");
    }

    const collection = ee.FeatureCollection('NOAA/IBTrACS/v4');
    
    // 1. Filtramos todos los puntos de la temporada correcta.
    const hurricanesInYear = collection.filter(ee.Filter.eq('SEASON', year));
    
    // 2. Obtenemos una lista de todos los nombres únicos que no sean 'UNNAMED'.
    // Esto es más directo y fiable.
    const distinctNames = hurricanesInYear
        .filter(ee.Filter.neq('name', 'UNNAMED'))
        .aggregate_array('name')
        .distinct();

    // 3. Para cada nombre, obtenemos su SID correspondiente.
    const stormInfo = ee.FeatureCollection(distinctNames.map(function(name) {
        // Obtenemos el primer punto de ese huracán para extraer el SID.
        var firstPoint = hurricanesInYear.filter(ee.Filter.eq('name', name)).first();
        // Creamos un objeto con el SID y el Nombre.
        return ee.Feature(null, {
            'sid': firstPoint.get('SID'),
            'name': name
        });
    }));

    return new Promise((resolve, reject) => {
        // 4. Evaluamos la lista de objetos {sid, name}.
        stormInfo.evaluate((fc, error) => {
            if (error) {
                return reject(new Error("Error al obtener la lista de huracanes: " + error));
            }
            
            // 5. Procesamos la lista final en el servidor para ordenarla.
            const hurricaneList = fc.features
                .map(f => f.properties)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            if (hurricaneList.length === 0) {
                return reject(new Error(`No se encontraron huracanes con nombre para el año ${year}.`));
            }

            // 6. Devolvemos la lista final.
            resolve({ hurricaneList });
        });
    });
}

// --- NUEVO CÓDIGO SUGERIDO ---
async function fetchHurricaneList() {
    const year = document.getElementById('lab-hurricane-year').value;
    const selector = document.getElementById('lab-hurricane-selector');
    selector.innerHTML = '<option>Cargando...</option>';
    try {
        const { hurricaneList } = await handleHurricaneList({ year });
        selector.innerHTML = '';
        hurricaneList.forEach(storm => {
            const option = document.createElement('option');
            option.value = storm.sid;
            option.textContent = storm.name;
            selector.appendChild(option);
        });
    } catch (error) {
        selector.innerHTML = `<option>Error: ${error.message}</option>`;
    }
}
window.fetchHurricaneList = fetchHurricaneList;
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
async function handleLabCodeGeneration() {
    const resultDisplay = document.getElementById('lab-result-display');
    const generateButton = document.getElementById('lab-generate-button');
    const executeButton = document.getElementById('lab-execute-button');
    const copyButton = document.getElementById('lab-copy-code-button');

    // Construir el prompt estructurado desde los controles
    const structuredRequest = {
        analysisType: document.getElementById('lab-analysis-type').value,
        region: (() => {
            const munSelector = document.getElementById('lab-region-selector-municipalities');
            return !munSelector.classList.contains('hidden')
                ? munSelector.value
                : document.getElementById('lab-region-selector-marine').value;
        })(),
        // ▲▲▲ FIN DE LA LÓGICA ▲▲▲
        startDate: document.getElementById('lab-start-date').value,
        endDate: document.getElementById('lab-end-date').value
    };
    if (!structuredRequest.startDate || !structuredRequest.endDate) {
        alert("Por favor, selecciona un rango de fechas.");
        return;
    }

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

function applyLabResultToMap() {
    if (lastLabResult) {
        // Lógica existente para el mapa y la leyenda
        if (lastLabResult.mapId) {
            window.addGeeLayer(lastLabResult.mapId.urlFormat, 'Resultado del Laboratorio');
        }
        if (window.legendControl) {
            const legendInfo = { bandName: 'Resultado Lab', unit: '', ...lastLabResult.visParams };
            window.legendControl.update(legendInfo);
        }

        // Usamos las funciones globales para poblar los paneles de análisis
        if (lastLabResult.stats) {
            window.updateStatsPanel(lastLabResult.stats);
        }
    
        if (lastLabResult.chartData) {
            window.updateChartAndData(lastLabResult.chartData, lastLabResult.chartOptions);
        }

        // Habilitar botones de descarga si es necesario
        document.getElementById('downloadCsvButton').disabled = false;
        document.getElementById('downloadChartButton').disabled = false;

    // --- CORRECCIÓN ---
    // La llave de cierre '}' que estaba aquí fue movida.
    // Ahora el 'else if' se conecta correctamente con el 'if' principal.
    } else if (window.legendControl) {
        window.legendControl.update(null);
    }
    
    // Resetear estado del modal del lab (esto se ejecuta siempre)
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

// REEMPLAZA la función buildGeeLabPrompt completa con esta:
function buildGeeLabPrompt(request) {
    let analysisSpecificInstructions = '';
    // ... (El bloque switch con las instrucciones para cada análisis se mantiene EXACTAMENTE IGUAL) ...
    switch (request.analysisType) {
        case 'NDVI':
            analysisSpecificInstructions = `
    // A. Dataset: Sentinel-2 para análisis de vegetación.
    var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

    // B. Cálculo: Implementar NDVI y crear una imagen compuesta.
    var addNDVI = function(image) {
      var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
      return image.addBands(ndvi);
    };
    collection = collection.map(addNDVI);
    
    // C. Variables de Salida
    laImagenResultante = collection.select('NDVI').median();
    collectionForChart = collection.select('NDVI');
    bandNameForChart = 'NDVI';
    visParams = {min: -0.2, max: 0.9, palette: ['blue', 'white', 'green']};`;
            break;
        case 'LST':
            analysisSpecificInstructions = `
    // A. Dataset: MODIS para Temperatura Superficial (LST).
    var collection = ee.ImageCollection('MODIS/061/MOD11A2')
        .filterBounds(roi)
        .filterDate(startDate, endDate);

    // B. Procesamiento: Seleccionar, escalar y convertir a Celsius.
    var processLST = function(image) {
      var lst = image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST');
      return image.addBands(lst);
    };
    collection = collection.map(processLST);

    // C. Variables de Salida
    laImagenResultante = collection.select('LST').median();
    collectionForChart = collection.select('LST');
    bandNameForChart = 'LST';
    visParams = {min: 15, max: 45, palette: ['blue', 'cyan', 'yellow', 'red']};`;
            break;
        // ... (Asegúrate de que TODOS tus casos del switch estén aquí)
        case 'NDWI':
            analysisSpecificInstructions = `
    // A. Dataset: Sentinel-2 para análisis de agua.
    var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

    // B. Cálculo: Implementar NDWI.
    var addNDWI = function(image) {
      var ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
      return image.addBands(ndwi);
    };
    collection = collection.map(addNDWI);
    
    // C. Variables de Salida
    laImagenResultante = collection.select('NDWI').median();
    collectionForChart = collection.select('NDWI');
    bandNameForChart = 'NDWI';
    visParams = {min: -1, max: 1, palette: ['brown', 'white', 'blue']};`;
            break;
        case 'FIRE':
            analysisSpecificInstructions = `
    // A. Dataset: Puntos de incendios activos VIIRS.
    var fires = ee.FeatureCollection('VIIRS/I-1/VNP14IMGML')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.eq('confidence', 'high'));

    // B. Procesamiento: Crear mapa de densidad.
    laImagenResultante = fires.reduceToImage({
        reducer: ee.Reducer.sum(),
        geometry: roi,
        scale: 1000
    }).focal_max(ee.Number(3000), 'circle', 'meters');

    // C. Variables de Salida (análisis solo visual)
    collectionForChart = null;
    bandNameForChart = null;
    visParams = {min: 0, max: 1, palette: ['yellow', 'orange', 'red']};`;
            break;
        case 'FAI':
            analysisSpecificInstructions = `
    // A. Dataset: Sentinel-2 para análisis de sargazo.
    var waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence');
    var collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30));

    // B. Cálculo: Implementar FAI con máscara de agua.
    var addFAI = function(image) {
      image = image.updateMask(waterMask.gt(50));
      var fai = image.expression(
        'NIR - (RED + (SWIR - RED) * (865 - 665) / (1610 - 665))', {
          'NIR': image.select('B8'),
          'RED': image.select('B4'),
          'SWIR': image.select('B11')
        }).rename('FAI');
      return image.addBands(fai);
    };
    collection = collection.map(addFAI);

    // C. Variables de Salida
    laImagenResultante = collection.select('FAI').max(); // Usar max() para resaltar mejor el sargazo
    collectionForChart = collection.select('FAI');
    bandNameForChart = 'FAI';
    visParams = {min: -0.02, max: 0.1, palette: ['black', 'cyan', 'yellow', 'red']};`;
            break;
        case 'AIR_QUALITY':
            analysisSpecificInstructions = `
    // A. Dataset: Sentinel-5P para NO2.
    var collection = ee.ImageCollection('COPERNICUS/S5P/NRTI/L3_NO2')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select('tropospheric_NO2_column_number_density');

    // B. Variables de Salida
    laImagenResultante = collection.median();
    collectionForChart = collection;
    bandNameForChart = 'tropospheric_NO2_column_number_density';
    visParams = {min: 0, max: 0.0003, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red']};`;
            break;
        // UBICACIÓN: ai-connector.js, dentro del switch en buildGeeLabPrompt

// ...
        case 'HURRICANE':
            analysisSpecificInstructions = `
    // A. Fondo de Satélite GOES: Usamos la imagen más reciente en el rango de fechas del producto MCMIPC (ya es una imagen a color).
    var goesImage = ee.ImageCollection('NOAA/GOES/16/MCMIPC')
        .filterDate(ee.Date(endDate).advance(-1, 'day'), ee.Date(endDate))
        .sort('system:time_start', false)
        .first();

    // B. Datos de Trayectoria IBTrACS.
    var tracks = ee.FeatureCollection('NOAA/IBTrACS/v4')
        .filterBounds(roi)
        .filterDate(startDate, endDate);

    // C. Visualización: Convertimos la trayectoria en una imagen para superponerla.
    var styledTracks = tracks.style({color: 'FF0000', width: 2, pointSize: 4}); // Usamos color hexadecimal

    // D. Composición Final: Superponemos la trayectoria sobre la imagen del satélite.
    // El producto MCMIPC ya está visualizado, por lo que solo lo seleccionamos y lo mezclamos.
    laImagenResultante = goesImage.select(['R', 'G', 'B']).blend(styledTracks);
    
    // E. Variables de Salida (análisis solo visual)
    collectionForChart = null;
    bandNameForChart = null;
    visParams = {min: 0, max: 255}; // visParams para una imagen RGB de 8 bits.`;
            break;
// ...
    }

    // ▼▼▼ PLANTILLA FINAL QUE SE ENVÍA A LA IA ▼▼▼
    return `
// Estas variables son inyectadas por el servidor y están listas para usar:
// var roi, startDate, endDate;

// --- INICIO DE LA LÓGICA DE LA IA ---
// El código debe definir estas 4 variables:
var laImagenResultante, collectionForChart, bandNameForChart, visParams;

${analysisSpecificInstructions}
// --- FIN DE LA LÓGICA DE LA IA ---

// No modificar estas últimas tres líneas.
console.log(JSON.stringify({visParams: visParams}));
Map.centerObject(roi, 10);
Map.addLayer(laImagenResultante.clip(roi), visParams, 'Resultado del Laboratorio');
`;
}
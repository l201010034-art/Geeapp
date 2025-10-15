
import { Loader } from './intelligent-loader.js'; // <-- AÑADE ESTA LÍNEA


// --- 1. CONEXIÓN CON LA IA PARA ANÁLISIS (PANELES DERECHOS) ---

const AI_API_URL = '/api/analyze';
const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');
const aiActionsContainer = document.getElementById('ai-actions-container');
const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');
let lastLabResult = null;

// AÑADE esta nueva función.
function resetAiPanel() {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando datos...</p>';
    aiActionsContainer.classList.add('hidden');
}

// --- CORRECCIÓN CLAVE: Se elimina 'window.' de las declaraciones de función ---
async function generateAiAnalysis(data) {
    if (!data.stats && !data.chartData) return;
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando datos...</p>';
    aiActionsContainer.classList.add('hidden');
    const prompt = buildPrompt(data);
    await callAndDisplayAnalysis(prompt);
}

async function generatePrediction(chartData) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Generando pronóstico...</p>';
    aiActionsContainer.classList.add('hidden');
    const prompt = buildPredictionPrompt(chartData);
    await callAndDisplayAnalysis(prompt);
}

async function generateFireRiskAnalysis(data) {
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
    
    // ▼▼▼ LÍNEAS NUEVAS ▼▼▼
    // Mostramos el loader inmediatamente con mensajes específicos para este proceso.
    Loader.show([
        "Interpretando tu comando...",
        "Conectando con el modelo de IA Gemini...",
        "Traduciendo lenguaje natural a parámetros...",
        "Configurando el análisis solicitado..."
    ]);
    
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
        Loader.hide(); // <-- AÑADE ESTA LÍNEA para ocultar el loader si hay un error
    } finally {
        commandBar.disabled = false;
        commandBar.placeholder = "Ej: Lluvia en Chiná el mes pasado...";
        if (window.innerWidth < 768) commandBar.blur();
    }
});


// UBICACIÓN: ai-connector.js
// REEMPLAZA la función handleLabExecution completa con esta versión.
async function handleLabExecution() {
    const labOverlay = document.getElementById('lab-overlay');
    const executeButton = document.getElementById('lab-execute-button');

    const analysisType = document.getElementById('lab-analysis-type').value;
    let requestBody;

    try { // --- Se mueve el try/catch para envolver toda la lógica ---
        if (analysisType === 'HURRICANE') {
            const hurricaneSelector = document.getElementById('lab-hurricane-selector');
            if (!hurricaneSelector.value || hurricaneSelector.options[hurricaneSelector.selectedIndex].text === 'No se encontraron huracanes') {
                // Usamos el sistema de errores de Geo para notificaciones amigables.
                window.reportErrorToGeo("Por favor, busca y selecciona un huracán válido.", "Aviso: ");
                return; // Detenemos la ejecución
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

        executeButton.disabled = true;
        Loader.show([
            "Accediendo al Laboratorio de IA...",
            "Configurando el entorno de análisis en el servidor...",
            "Ejecutando el módulo de análisis especializado...",
            "Compilando resultados para la previsualización...",
            "Refinando contenido con IA avanzada...",
            "¡Análisis completado!"
        ]);
        
        const response = await fetch('/api/gee-lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            // Si la respuesta del servidor no es OK, lanzamos un error para ser atrapado por el CATCH.
            throw new Error(errorData.details || "Error al ejecutar el análisis.");
        }

        lastLabResult = await response.json();
        console.log('[DEBUG 1/4] Respuesta del Servidor:', lastLabResult);


        labOverlay.classList.add('hidden');
        applyLabResultToMap(requestBody); 
    
    } catch (error) {
        // 1. Reportamos el error a GeoBot PRIMERO.
        window.reportErrorToGeo(error.message, "¡Ups! El análisis del laboratorio no pudo completarse. ");
        
        // 2. DESPUÉS, ocultamos el loader.
        Loader.hide();
        
        // --- ▼▼▼ LÍNEA AÑADIDA ▼▼▼ ---
        // 3. Finalmente, cerramos la ventana del Laboratorio.
        labOverlay.classList.add('hidden');

    } finally {
        // Esto se ejecuta siempre, asegurando que el botón se reactive.
        executeButton.disabled = false;
        executeButton.textContent = "🚀 Ejecutar Análisis";
    }
}

// UBICACIÓN: /ai-connector.js
// REEMPLAZA la función applyLabResultToMap completa.

function applyLabResultToMap(requestBody) {
    if (lastLabResult) {
        if (lastLabResult.mapId) window.addGeeLayer(lastLabResult.mapId.urlFormat, 'Resultado del Laboratorio');
        
        if (window.legendControl && lastLabResult.visParams) window.legendControl.update(lastLabResult.visParams);
        
        let hasValidData = false;
        if (lastLabResult.stats && !lastLabResult.stats.includes("No se pudieron calcular")) {
            hasValidData = true;
        }
        if (lastLabResult.chartData && lastLabResult.chartData.length > 1) {
            hasValidData = true;
        }

        if (hasValidData) {
            window.updateStatsPanel(lastLabResult.stats);
            if (lastLabResult.chartData && lastLabResult.chartData.length > 1) {
                window.updateChartAndData(lastLabResult.chartData, lastLabResult.chartOptions);
            }
            // ▼▼▼ NUEVA LÓGICA AÑADIDA ▼▼▼
            // Obtenemos el nombre legible del análisis y los parámetros de la solicitud.
            const analysisName = document.getElementById('lab-analysis-type').selectedOptions[0].text;
            const prompt = buildLabAnalysisPrompt(lastLabResult, analysisName, requestBody.roi, requestBody.startDate, requestBody.endDate);
            
            // Llamamos a la misma función que usan los análisis generales para mostrar la interpretación.
            callAndDisplayAnalysis(prompt);
            // ▲▲▲ FIN DE LA NUEVA LÓGICA ▲▲▲
        } else {
            window.clearChartAndAi();
            // Opcional: Informar al usuario si no hay datos para analizar.
            aiPanel.classList.remove('hidden');
            aiSummaryDiv.innerHTML = `<p class="text-gray-400">No se encontraron datos suficientes en la región y fechas seleccionadas para generar un análisis de IA.</p>`;
        }
    }
}

async function fetchHurricaneList() {
    const year = document.getElementById('lab-hurricane-year').value;
    const selector = document.getElementById('lab-hurricane-selector');
    const selectorContainer = document.getElementById('lab-hurricane-selector-container');
    const fetchButton = document.getElementById('lab-fetch-hurricanes-button');

    if (!year) {
        alert("Por favor, introduce un año.");
        return;
    }
    selector.innerHTML = '<option>Cargando...</option>';
    selectorContainer.classList.remove('hidden');
    fetchButton.disabled = true;
    fetchButton.textContent = "Buscando...";

    try {
        const response = await fetch('/api/gee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'getHurricaneList', params: { year: parseInt(year) } })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || "Error al contactar el servidor.");
        }
        const { hurricaneList } = await response.json();
        selector.innerHTML = '';
        if (hurricaneList && hurricaneList.length > 0) {
            hurricaneList.forEach(storm => {
                const option = document.createElement('option');
                option.value = storm.sid;
                option.textContent = storm.name;
                selector.appendChild(option);
            });
        } else {
             selector.innerHTML = `<option>No se encontraron huracanes</option>`;
        }
    } catch (error) {
        console.error("Error al buscar huracanes:", error);
        selector.innerHTML = `<option>Error: ${error.message}</option>`;
    } finally {
        fetchButton.disabled = false;
        fetchButton.textContent = "1. Buscar Huracanes";
    }
}


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

function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1];
    const dataOnly = chartData.slice(1);
    const recentDataSample = JSON.stringify(dataOnly.slice(-15));
    return `
        Eres un climatólogo experto en análisis de datos y modelado de tendencias para el estado de Campeche.
        Tu tarea es analizar la siguiente serie temporal de datos climáticos y generar un pronóstico cualitativo a corto plazo (próximas 2-4 semanas).
        **Datos de la Serie Temporal Reciente:**
        - **Variable:** ${variableName}
        - **Últimos 15 puntos de datos:** ${recentDataSample}
        **Instrucciones para tu respuesta:**
        1.  **Análisis de Tendencia:** Describe brevemente la tendencia observada en los datos más recientes.
        2.  **Pronóstico a Corto Plazo:** Basado en esta tendencia y en tu conocimiento del clima de Campeche, proyecta cómo es probable que se comporte esta variable en las próximas 2 a 4 semanas.
        3.  **Implicaciones y Recomendaciones:** ¿Qué significa este pronóstico para los sectores clave?
            - **Si la tendencia es negativa:** Advierte sobre los riesgos y sugiere acciones preventivas para Protección Civil y la Secretaría de Desarrollo Agropecuario.
            - **Si la tendencia es positiva:** Describe las condiciones favorables.
            - **Si la tendencia es extrema:** Advierte sobre posibles riesgos de inundaciones.
        **Formato de Salida:**
        Usa formato Markdown. Inicia con un titular claro como "**Pronóstico de Tendencia**". Usa negritas para resaltar los puntos clave.
    `;
}

function buildFireRiskPrompt(data) {
    const { roi, startDate, endDate } = data;
    return `Eres un analista de riesgos para el gobierno de Campeche. Interpreta un mapa de "Riesgo de Incendio Promedio" para **${roi}** del **${startDate}** al **${endDate}**. La leyenda es: Verde (Bajo), Amarillo (Moderado), Naranja (Alto), Rojo (Extremo). **Instrucciones:** 1. Titula "Interpretación del Mapa de Riesgo de Incendio". 2. Explica qué implica ver manchas naranjas/rojas en zonas agrícolas o forestales. 3. Da recomendaciones accionables para SEPROCI (monitoreo, alertas), Desarrollo Agropecuario y **SEDECO** (impacto económico). Usa Markdown.`;
}

export {
    generateAiAnalysis,
    generatePrediction,
    generateFireRiskAnalysis,
    handleLabExecution,
    applyLabResultToMap,
    fetchHurricaneList,
    resetAiPanel // <-- AÑADE ESTA LÍNEA

};

// UBICACIÓN: /ai-connector.js
// AÑADE esta función al final del archivo.

function buildLabAnalysisPrompt(labResult, analysisType, roi, startDate, endDate) {
    const { stats } = labResult;
    return `
        Eres un analista geoespacial experto. Interpreta el resultado de un análisis avanzado del "Laboratorio de IA".
        - **Tipo de Análisis:** ${analysisType}
        - **Región de Interés:** ${roi}
        - **Periodo:** ${startDate} a ${endDate}
        - **Estadísticas Clave:** ${stats || "No se generaron estadísticas numéricas, es un análisis visual."}

        **Instrucciones:**
        1.  Explica en un párrafo qué es este tipo de análisis y para qué sirve (ej. "El NDVI mide la salud de la vegetación...").
        2.  Basado en las estadísticas y tu conocimiento del análisis, genera un resumen ejecutivo conciso (máx 2 párrafos).
        3.  Finaliza con una **Conclusión Clave** en negritas sobre lo que los resultados implican para la región.
        **Formato de Salida:** Usa formato Markdown simple (párrafos y **negritas**).
    `;
}
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
        region: document.getElementById('lab-region-selector').value,
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

    try {
        // ¡NUEVO! Obtenemos el ROI y las fechas para enviarlos al backend
        const regionName = document.getElementById('lab-region-selector').value;
        const startDate = document.getElementById('lab-start-date').value;
        const endDate = document.getElementById('lab-end-date').value;

        // Enviamos el código JUNTO con el contexto necesario para el análisis
        const response = await fetch('/api/gee-lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                codeToExecute: code,
                roi: regionName, // Enviamos el nombre del municipio
                startDate: startDate,
                endDate: endDate
            })
        });

        if (!response.ok) throw new Error((await response.json()).details || "Error al ejecutar el código.");

        lastLabResult = await response.json();
        previewText.textContent = "✅ ¡Previsualización Lista! Cierra para aplicar al mapa.";
        applyButton.classList.remove('hidden');

    } catch (error) {
        previewText.textContent = `❌ Error: ${error.message}`;
        executeButton.classList.remove('hidden'); // Mostrar de nuevo el botón de ejecutar
        setTimeout(() => previewOverlay.classList.add('hidden'), 4000); // Ocultar overlay tras error
    } finally {
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

// UBICACIÓN: ai-connector.js

function buildGeeLabPrompt(request) {
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const optimizationRule = diffDays > 365
        ? `3. **Optimización por Tiempo (CRÍTICO):** El rango de fechas es largo (${diffDays} días). DEBES crear un compuesto temporal (ej. \`.median()\`) para la imagen del mapa (\`laImagenResultante\`).`
        : `3. **Procesamiento Directo:** El rango de fechas es corto (${diffDays} días).`;

    // --- ESTA ES LA LÓGICA QUE FALTABA ---
    let analysisSpecificInstructions = '';
    if (request.analysisType === 'FAI') {
        analysisSpecificInstructions = `
    **Instrucciones Específicas para Análisis FAI (Sargazo):**
    A. **Dataset:** Utiliza la colección 'COPERNICUS/S2_SR_HARMONIZED' (Sentinel-2).
    B. **Máscara de Agua (OBLIGATORIO Y CRÍTICO):** Antes de cualquier otro paso, es fundamental aplicar una máscara de agua para eliminar todos los píxeles de tierra. Utiliza el dataset 'JRC/GSW1_0/GlobalSurfaceWater'. Selecciona la banda 'occurrence' y actualiza la máscara de cada imagen para procesar ÚNICAMENTE los píxeles con una probabilidad de agua superior al 50% (\`.updateMask(waterMask.gt(50))\`). Esto es vital para evitar falsos positivos.
    C. **Cálculo de FAI:** Implementa el Índice de Algas Flotantes (FAI), diseñado para resaltar vegetación flotante.
    D. **Variables de Salida:** El nombre de la banda para el análisis debe ser 'FAI' (ej. \`bandNameForChart = 'FAI'\`).
        `;
    }
    // --- FIN DE LA LÓGICA FALTANTE ---

    return `Eres un desarrollador experto en GEE. Tu tarea es crear un script optimizado que genere TRES variables finales: 'laImagenResultante' (para el mapa), 'collectionForChart' (para el gráfico) y 'bandNameForChart' (un string con el nombre de la banda a graficar).

    **Reglas Estrictas de Optimización y Formato:**
    1.  **Formato de Respuesta:** Responde ÚNICAMENTE con el bloque de código JavaScript.
    2.  **Filtrado Eficiente:** Siempre filtra la colección por ROI, fecha y metadatos (ej. nubosidad < 20%) al principio.
    ${optimizationRule}
    4.  **Variables de Salida OBLIGATORIAS:**
        - \`laImagenResultante\`: Un \`ee.Image\` para el mapa. Puede ser un compuesto (ej. median()) si el periodo es largo.
        - \`collectionForChart\`: Un \`ee.ImageCollection\` con los valores listos para graficar. ¡NO apliques un reductor como \`.median()\` a esta colección!
        - \`bandNameForChart\`: Un string con el nombre de la banda principal a graficar.
    5.  **Uso de \`.clip()\`:** Aplica \`.clip(roi)\` a \`laImagenResultante\` justo antes de la visualización.
    6.  **Estructura de Finalización OBLIGATORIA:** El script DEBE terminar con estas 3 líneas, en este orden exacto:
        \`console.log(JSON.stringify({visParams: visParams}));\`
        \`Map.centerObject(roi, 10);\`
        \`Map.addLayer(laImagenResultante, visParams, 'Nombre de Capa');\`
    7.  **ROI (Región de Interés):** Usa el asset 'projects/residenciaproject-443903/assets/municipios_mexico_2024'. Filtra con 'CVE_ENT' = '04' y 'NOMGEO' = '${request.region}'.
    ${analysisSpecificInstructions}
    **Petición Estructurada a Procesar:**
    - Tipo de Análisis: "${request.analysisType}"
    - Región: "${request.region}"
    - Fecha de Inicio: "${request.startDate}"
    - Fecha de Fin: "${request.endDate}"

    **Tu Respuesta (solo código JavaScript optimizado):**`;
}
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
    if (!code || code.trim().startsWith('//')) { alert("No hay código válido para ejecutar. Asegúrate de generar el código primero y de que no haya errores."); return; }
    executeButton.classList.add('hidden');
    previewOverlay.classList.remove('hidden');
    previewText.textContent = "Ejecutando en GEE y preparando previsualización...";

    try {
        const response = await fetch('/api/gee-lab', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codeToExecute: code }) });
        if (!response.ok) throw new Error((await response.json()).details || "Error al ejecutar el código.");
        
        lastLabResult = await response.json(); // Guardar el resultado
        if (lastLabResult.code) document.getElementById('lab-result-display').textContent = lastLabResult.code;
        
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
    if (lastLabResult && lastLabResult.mapId) {
        window.addGeeLayer(lastLabResult.mapId.urlFormat, 'Resultado del Laboratorio');
        if (lastLabResult.visParams) {
            const legendInfo = { bandName: 'Resultado Lab', unit: '', ...lastLabResult.visParams };
            if (window.legendControl) window.legendControl.update(legendInfo);
        } else if (window.legendControl) {
            window.legendControl.update(null);
        }
    }
    // Resetear estado del modal del lab
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

function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1];
    const recentDataSample = JSON.stringify(chartData.slice(-15));
    return `Eres un climatólogo experto en tendencias para Campeche. Analiza la siguiente serie temporal y genera un pronóstico cualitativo a 2-4 semanas. **Variable:** ${variableName}. **Últimos 15 datos:** ${recentDataSample}. **Instrucciones:** 1. Analiza la tendencia reciente. 2. Proyecta el comportamiento a corto plazo. 3. Describe implicaciones y recomendaciones para Protección Civil, Desarrollo Agropecuario y **SEDECO**. 4. Añade un **Nivel de Confianza** (Alto, Medio, Bajo) para tu pronóstico. Usa Markdown y un titular claro.`;
}

function buildFireRiskPrompt(data) {
    const { roi, startDate, endDate } = data;
    return `Eres un analista de riesgos para el gobierno de Campeche. Interpreta un mapa de "Riesgo de Incendio Promedio" para **${roi}** del **${startDate}** al **${endDate}**. La leyenda es: Verde (Bajo), Amarillo (Moderado), Naranja (Alto), Rojo (Extremo). **Instrucciones:** 1. Titula "Interpretación del Mapa de Riesgo de Incendio". 2. Explica qué implica ver manchas naranjas/rojas en zonas agrícolas o forestales. 3. Da recomendaciones accionables para SEPROCI (monitoreo, alertas), Desarrollo Agropecuario y **SEDECO** (impacto económico). Usa Markdown.`;
}

function buildGeeLabPrompt(request) {
    return `Eres un desarrollador experto en la API JavaScript de Google Earth Engine. Tu tarea es traducir la petición estructurada a un script de GEE funcional.
    **Reglas Estrictas:**
    1.  **Formato de Respuesta:** Responde ÚNICAMENTE con el bloque de código JavaScript, sin explicaciones ni markdown.
    2.  **ROI (Región de Interés):** Usa el asset 'projects/residenciaproject-443903/assets/municipios_mexico_2024'. Filtra con 'CVE_ENT' = '04' y 'NOMGEO' = '<nombre_municipio_con_acentos>'.
    3.  **Datasets Modernos:** Usa siempre assets recientes (ej. 'COPERNICUS/S2_SR', 'VIIRS/I-1/VNP14IMGML', 'MODIS/061/MOD11A1').
    4.  **Filtro de Nubes:** Para colecciones ópticas, siempre filtra por nubosidad (ej. .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))).
    5.  **Entorno Node.js:** NUNCA uses el objeto \`ui\`. Usa \`console.log()\` para la salida JSON.
    6.  **Estructura de Finalización OBLIGATORIA:** El script DEBE terminar con estas 3 líneas, en este orden exacto:
        \`console.log(JSON.stringify({visParams: visParams}));\`
        \`Map.centerObject(roi, 10);\`
        \`Map.addLayer(laImagenResultante, visParams, 'Nombre de Capa');\`

    **Petición Estructurada a Procesar:**
    - Tipo de Análisis: "${request.analysisType}"
    - Región: "${request.region}"
    - Fecha de Inicio: "${request.startDate}"
    - Fecha de Fin: "${request.endDate}"

    **Tu Respuesta (solo código JavaScript):**`;
}
//HOLA
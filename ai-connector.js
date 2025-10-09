// Archivo: ai-connector.js (Versión 3.0 - Final y Unificada)

// ==================================================================
// === 1. CONEXIÓN CON LA IA PARA ANÁLISIS (PANELES DERECHOS) ========
// ==================================================================

const AI_API_URL = '/api/analyze';
const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');
const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');

/**
 * Llama a la IA para generar un resumen ejecutivo de los datos cargados.
 */
window.generateAiAnalysis = async function(data) {
    if (!data.stats && !data.chartData) return;
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando datos...</p>';
    const prompt = buildPrompt(data);
    await callAndDisplayAnalysis(prompt);
}

/**
 * Llama a la IA para generar una predicción basada en la tendencia de los datos.
 */
window.generatePrediction = async function(chartData) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Generando pronóstico...</p>';
    const prompt = buildPredictionPrompt(chartData);
    await callAndDisplayAnalysis(prompt);
}

/**
 * Llama a la IA para interpretar el mapa de riesgo de incendio.
 */
window.generateFireRiskAnalysis = async function(data) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Interpretando mapa de riesgo...</p>';
    const prompt = buildFireRiskPrompt(data);
    await callAndDisplayAnalysis(prompt);
}

/**
 * Función centralizada para llamar a la API de análisis y mostrar el resultado.
 */
async function callAndDisplayAnalysis(prompt) {
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });
        if (!response.ok) throw new Error(`Error en la API: ${response.statusText}`);
        const result = await response.json();
        aiSummaryDiv.innerHTML = markdownToHtml(result.analysisText);
    } catch (error) {
        console.error("Error al generar análisis con IA:", error);
        aiSummaryDiv.innerHTML = `<p class="text-red-400">Ocurrió un error: ${error.message}</p>`;
    }
}

// ==================================================================
// === 2. LÓGICA DE LA INTERFAZ CONVERSACIONAL (BARRA SUPERIOR) =====
// ==================================================================

commandForm.addEventListener('submit', function(event) {
    event.preventDefault(); 
    event.stopPropagation();
    const userQuery = commandBar.value;
    if (userQuery) {
        commandBar.disabled = true;
        commandBar.placeholder = "Procesando...";
        processConversationalQuery(userQuery);
    }
});

async function processConversationalQuery(query) {
    const prompt = buildConversationalPrompt(query);
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });
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
            window.zonaCheckboxes[params.zona_name].checked = true;
            window.handleZoneSelection(params.zona_name);
            window.handleAnalysis('general');
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
        if (window.innerWidth < 768) { commandBar.blur(); }
    }
}

// ==================================================================
// === 3. LÓGICA PARA EL LABORATORIO DE IA (MODAL) ==================
// ==================================================================

/**
 * Maneja la petición de generación de código del Laboratorio de IA.
 */
async function handleLabCodeGeneration() {
    const promptInput = document.getElementById('lab-prompt-input');
    const resultDisplay = document.getElementById('lab-result-display');
    const generateButton = document.getElementById('lab-generate-button');
    const executeButton = document.getElementById('lab-execute-button');

    const userRequest = promptInput.value;
    if (!userRequest) {
        alert("Por favor, describe el análisis que deseas generar.");
        return;
    }

    generateButton.disabled = true;
    generateButton.textContent = "Generando...";
    executeButton.disabled = true;
    resultDisplay.textContent = "// Generando código, por favor espera...";

    const prompt = buildGeeLabPrompt(userRequest);

    try {
        const response = await fetch('/api/gee-lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Error en el servidor del laboratorio.");
        }

        const result = await response.json();
        let generatedCode = result.generatedCode.replace(/^```(javascript)?\s*/, '').replace(/```\s*$/, '');
        
        resultDisplay.textContent = generatedCode;
        if (generatedCode) executeButton.disabled = false;

    } catch (error) {
        console.error("Error en la generación de código del Lab:", error);
        resultDisplay.textContent = `// Ocurrió un error:\n// ${error.message}`;
    } finally {
        generateButton.disabled = false;
        generateButton.textContent = "Generar Código";
    }
}

/**
 * Envía el código generado al backend para su ejecución en GEE.
 */
async function handleLabCodeExecution() {
    const code = document.getElementById('lab-result-display').textContent;
    const executeButton = document.getElementById('lab-execute-button');

    if (!code || code.trim() === '' || code.includes('Generando código') || code.includes('Ocurrió un error')) {
        alert("No hay código válido para ejecutar. Por favor, genera el código primero.");
        return;
    }

    executeButton.disabled = true;
    executeButton.textContent = "Ejecutando en GEE...";

    try {
        const response = await fetch('/api/gee-lab', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codeToExecute: code }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || "Error al ejecutar el código en el servidor.");
        }

        const result = await response.json();

        if (result.mapId) {
            if (result.code) {
                document.getElementById('lab-result-display').textContent = result.code;
            }
            
            window.addGeeLayer(result.mapId.urlFormat, 'Resultado del Laboratorio');
            
            if (result.visParams) {
                const legendInfo = {
                    bandName: 'Resultado del Laboratorio',
                    unit: result.visParams.unit || '',
                    min: result.visParams.min,
                    max: result.visParams.max,
                    palette: result.visParams.palette
                };
                window.legendControl.update(legendInfo);
            } else {
                window.legendControl.update(null);
            }
            
            alert("¡Éxito! La nueva capa y su leyenda se han añadido al mapa.");
        }

    } catch (error) {
        console.error("Error en la ejecución del código del Lab:", error);
        alert(`Ocurrió un error al ejecutar el código: ${error.message}`);
    } finally {
        executeButton.disabled = false;
        executeButton.textContent = "🚀 Ejecutar y Mostrar en Mapa";
    }
}

// Hacemos las funciones del laboratorio accesibles globalmente para plataforma.html
window.handleLabCodeGeneration = handleLabCodeGeneration;
window.handleLabCodeExecution = handleLabCodeExecution;

// ==================================================================
// === 4. CONSTRUCCIÓN DE PROMPTS PARA LA IA ========================
// ==================================================================

function markdownToHtml(text) {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('').replace(/<p>\*/g, '<ul>*').replace(/\* (.*?)(<br>|<\/p>)/g, '<li>$1</li>').replace(/<\/li><\/ul><\/p>/g, '</li></ul>');
}

function buildPrompt(data) {
    const { stats, chartData, variable, roi, startDate, endDate } = data;
    const chartSample = chartData ? `Los primeros 5 puntos de datos son: ${JSON.stringify(chartData.slice(0, 6))}` : "No hay datos de serie temporal.";
    return `Eres un climatólogo experto en Campeche. Analiza los siguientes datos y genera un resumen ejecutivo conciso (máx 3 párrafos) para una secretaría de gobierno. Enfócate en tendencias e implicaciones prácticas. **Variable:** ${variable}. **Zona:** ${roi}. **Periodo:** ${startDate} a ${endDate}. **Estadísticas:** ${stats || "N/A"}. **Muestra de datos:** ${chartSample}. Responde en texto simple, usando negritas para resaltar puntos clave.`;
}

function buildConversationalPrompt(query) {
    const today = new Date().toISOString().split('T')[0];
    const municipios = "Calakmul, Calkiní, Campeche, Candelaria, Carmen, Champotón, Dzitbalché, Escárcega, Hecelchakán, Hopelchén, Palizada, Seybaplaya, Tenabo";
    return `Tu tarea es traducir la petición del usuario a JSON para una plataforma climática en Campeche. Hoy es ${today}. Extrae: startDate, endDate, variable, zona_type, zona_name. **Variables:** "Temperatura del Aire (°C)", "Humedad Relativa (%)", "Precipitación Acumulada (mm)", "Temp. Superficial (LST °C)", "Evapotranspiración (mm/8 días)". **Zonas Predefinidas:** "Todo el Estado", "Zona 1, Ciudad Campeche", "Zona 2, Lerma", "Zona 3, Chiná", "Zona 4, San Fco. Campeche". **Municipios:** ${municipios}. **Reglas:** 1. Responde solo con el JSON. 2. Determina 'zona_type' ('predefinida' o 'municipio'). Usa el nombre exacto con acentos para municipios. Si no hay zona, asume "Todo el Estado". 3. Infiere la variable (ej. "lluvia" -> "Precipitación Acumulada (mm)"). 4. Interpreta fechas relativas a hoy. **Petición:** "${query}" **Tu Respuesta:**`;
}

function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1];
    const recentDataSample = JSON.stringify(chartData.slice(-15));
    return `Eres un climatólogo experto en tendencias para Campeche. Analiza la siguiente serie temporal y genera un pronóstico cualitativo a 2-4 semanas. **Variable:** ${variableName}. **Últimos 15 datos:** ${recentDataSample}. **Instrucciones:** 1. Analiza la tendencia reciente. 2. Proyecta el comportamiento a corto plazo. 3. Describe implicaciones y recomendaciones para Protección Civil o Desarrollo Agropecuario (ej. advertir de sequía/calor o inundaciones/lluvia). Usa Markdown y un titular claro.`;
}

function buildFireRiskPrompt(data) {
    const { roi, startDate, endDate } = data;
    return `Eres un analista de riesgos para el gobierno de Campeche. Interpreta un mapa de "Riesgo de Incendio Promedio" para **${roi}** del **${startDate}** al **${endDate}**. No puedes ver el mapa, pero su leyenda es: Verde (Bajo), Amarillo (Moderado), Naranja (Alto), Rojo (Extremo). **Instrucciones:** 1. Titula "Interpretación del Mapa de Riesgo de Incendio". 2. Explica la leyenda. 3. Describe qué implicaría ver manchas naranjas/rojas en zonas agrícolas. 4. Da recomendaciones accionables para SEPROCI (monitoreo, alertas) y el sector agropecuario (evitar quemas, reforzar guardarrayas). Usa Markdown.`;
}

function buildGeeLabPrompt(userRequest) {
    return `Eres un desarrollador senior experto en la API JavaScript de Google Earth Engine (GEE). Tu única tarea es traducir la petición del usuario a un script de GEE funcional, optimizado y robusto. **Reglas Estrictas e Inquebrantables:** 1. **FORMATO DE RESPUESTA:** Responde ÚNICAMENTE con el bloque de código JavaScript. No incluyas explicaciones, texto introductorio, ni bloques de código Markdown (\`\`\`). 2. **REGIÓN DE INTERÉS (ROI):** * Siempre define una ROI al principio. Si se menciona un municipio de Campeche, debes usar el asset privado: \`projects/residenciaprociertoject-443903/assets/municipios_mexico_2024\`. * Para filtrar el municipio, usa la columna 'CVE_ENT' con el valor '04' (para Campeche) y la columna 'NOMGEO' para el nombre. * **IMPORTANTE:** Los nombres de los municipios en 'NOMGEO' DEBEN llevar acentos (ej. 'Champotón', 'Hecelchakán'). 3. **DATASETS PÚBLICOS:** * Usa siempre datasets modernos y de alta calidad (ej. 'COPERNICUS/S2_SR' para Sentinel-2). * Asegúrate de usar la versión más reciente y no-deprecada de los assets públicos para evitar errores de "asset not found". 4. **FILTRADO DE NUBES:** Aplica siempre un filtro de nubosidad razonable en las colecciones ópticas (ej. \`.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))\`). 5. **CONTEXTO DE EJECUCIÓN (REGLA CRÍTICA):** El código se ejecutará en un servidor Node.js, NO en el GEE Code Editor. Por lo tanto: **NUNCA, BAJO NINGUNA CIRCUNSTANCIA, uses el objeto \`ui\`** ni ninguna de sus funciones (\`ui.Chart\`, \`ui.Label\`, etc.). Para mostrar datos, usa \`console.log()\`. 6. **OPTIMIZACIÓN OBLIGATORIA (REGLA DE ORO):** Para colecciones de datos de alta frecuencia (como GOES), SIEMPRE filtra por un rango de fechas corto y razonable ANTES de aplicar cualquier operación de ordenamiento (\`.sort()\`). No seguir esta regla causa errores de 'Computation timed out'. 7. **ESTRUCTURA DE FINALIZACIÓN (MUY IMPORTANTE):** El final de tu script DEBE seguir este orden exacto: a) **Primero, el JSON de salida:** Una llamada a \`console.log()\` imprimiendo un OBJETO JSON COMO STRING. Este objeto DEBE contener dos claves: 'explanation' (un objeto con título y descripción) y 'visParams' (el objeto de visualización con min, max, y palette). b) **Segundo, el centrado del mapa:** Una llamada a \`Map.centerObject(roi, ...)\`. c) **Tercero, la capa en el mapa:** La **ÚLTIMA LÍNEA ABSOLUTA** del script debe ser la llamada a \`Map.addLayer(...)\`. **Ejemplo de la estructura de finalización requerida:** \`\`\`javascript // ... análisis ... var visParams = {min: -1, max: 1, palette: ['blue', 'white', 'green']}; var explanation = { titulo: "Mapa de NDVI de Ejemplo", descripcion: "Muestra la salud de la vegetación." }; console.log(JSON.stringify({explanation: explanation, visParams: visParams})); Map.centerObject(roi, 10); Map.addLayer(laImagenResultante, visParams, 'NDVI de Ejemplo'); \`\`\` **Petición del Usuario a Procesar:** "${userRequest}" **Tu Respuesta (solo código JavaScript limpio):**`;
}
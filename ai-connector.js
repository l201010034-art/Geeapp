// ai-connector.js (Versión Final, Completa y Limpia)

const AI_API_URL = '/api/analyze';
const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');
const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');

//================================================================
// FUNCIONES PRINCIPALES (Llamadas desde plataforma.html)
//================================================================

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

//================================================================
// LÓGICA DE LA INTERFAZ CONVERSACIONAL
//================================================================

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
        commandBar.value = "Error. Inténtalo de nuevo.";
    } finally {
        commandBar.disabled = false;
        commandBar.placeholder = "Ej: Lluvia en Chiná el mes pasado...";
        if (window.innerWidth < 768) { commandBar.blur(); }
    }
}


//================================================================
// FUNCIONES DE AYUDA (Helpers)
//================================================================

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

/**
 * Convierte una cadena de texto con Markdown simple a HTML.
 */
function markdownToHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .split('\n\n')
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('')
        .replace(/<p>\*/g, '<ul>*')
        .replace(/\* (.*?)(<br>|<\/p>)/g, '<li>$1</li>')
        .replace(/<\/li><\/ul><\/p>/g, '</li></ul>');
}

/**
 * Construye el prompt para el resumen ejecutivo (Fase 1).
 */
function buildPrompt(data) {
    const { stats, chartData, chartOptions, variable, roi, startDate, endDate } = data;
    const chartSample = chartData ? `Los primeros 5 puntos de datos son: ${JSON.stringify(chartData.slice(0, 6))}` : "No hay datos de serie temporal disponibles.";
    return `
        Eres un experto en climatología y análisis de datos geoespaciales, especializado en el estado de Campeche, México.
        Tu tarea es actuar como un asesor para una secretaría de gobierno (ej. Protección Civil, Desarrollo Agropecuario).
        Analiza los siguientes datos y genera un resumen ejecutivo conciso (máximo 3 párrafos).
        El resumen debe ser claro, directo y enfocado en las implicaciones prácticas. No uses jerga técnica a menos que la expliques.

        **Contexto del Análisis:**
        - **Variable Analizada:** ${variable}
        - **Zona de Interés:** ${roi}
        - **Periodo:** Desde ${startDate} hasta ${endDate}

        **Datos Obtenidos:**
        1.  **Estadísticas Generales:**
            \`\`\`
            ${stats || "No disponibles."}
            \`\`\`
        2.  **Datos de Serie Temporal (Muestra):**
            ${chartSample}
            - Título del gráfico: ${chartOptions?.title || "No disponible."}

        **Instrucciones para tu respuesta:**
        1.  **Interpretación:** ¿Qué significan estos números? ¿Son altos, bajos o normales para la época y la región?
        2.  **Tendencias:** ¿Se observa alguna tendencia clave en la serie temporal (ej. aumento, descenso, picos anómalos)?
        3.  **Implicaciones y Acciones:** ¿Qué implicaciones tienen estos datos para la agricultura, el riesgo de incendios, la gestión del agua o la población en general? ¿Qué acciones o alertas tempranas se podrían considerar?

        **Formato de Salida:**
        Responde en formato de texto simple. Inicia con un titular claro. Usa negritas para resaltar los puntos más importantes.
    `;
}

/**
 * Construye el prompt para la interfaz conversacional (Fase 2).
 */
function buildConversationalPrompt(query) {
    const today = new Date().toISOString().split('T')[0];
    const municipios = "Calakmul, Calkiní, Campeche, Candelaria, Carmen, Champotón, Dzitbalché, Escárcega, Hecelchakán, Hopelchén, Palizada, Seybaplaya, Tenabo";
    return `
        Tu tarea es actuar como un traductor de lenguaje natural a un formato JSON para una plataforma de monitoreo climático en Campeche, México.
        Analiza la petición del usuario y extrae los siguientes parámetros: startDate, endDate, variable, zona_type, y zona_name.
        La fecha de hoy es ${today}.

        **Opciones Válidas:**
        - **Variables:** "Temperatura del Aire (°C)", "Humedad Relativa (%)", "Precipitación Acumulada (mm)", "Temp. Superficial (LST °C)", "Evapotranspiración (mm/8 días)".
        - **Zonas Predefinidas:** "Todo el Estado", "Zona 1, Ciudad Campeche", "Zona 2, Lerma", "Zona 3, Chiná", "Zona 4, San Fco. Campeche".
        - **Municipios de Campeche:** ${municipios}.

        **Reglas:**
        1.  **Responde ÚNICAMENTE con el objeto JSON.** No incluyas explicaciones, texto adicional ni bloques de código Markdown (\`\`\`).
        2.  **Determina el Tipo de Zona:**
            - Si la zona mencionada es una de las "Zonas Predefinidas", usa \`"zona_type": "predefinida"\` y el nombre exacto en \`zona_name\`.
            - Si la zona mencionada es uno de los "Municipios de Campeche", usa \`"zona_type": "municipio"\` y el nombre del municipio en \`zona_name\`. Asegúrate de usar el nombre oficial sin acentos (ej. "Hopelchen", "Calkini").
            - Si no se especifica una zona, asume "Todo el Estado" y trátala como predefinida.
        3.  **Infiere la Variable:** Si el usuario dice "lluvia" o "sequía", asume "Precipitación Acumulada (mm)".
        4.  **Calcula Fechas:** Interpreta fechas relativas ("mes pasado", "última semana", "2023") en formato "YYYY-MM-DD".

        **Ejemplos:**
        - Petición: "temperatura en zona lerma durante enero de 2023"
        - Tu Respuesta: {"startDate": "2023-01-01", "endDate": "2023-01-31", "variable": "Temperatura del Aire (°C)", "zona_type": "predefinida", "zona_name": "Zona 2, Lerma"}

        - Petición: "sequía en Hopelchén durante 2023"
        - Tu Respuesta: {"startDate": "2023-01-01", "endDate": "2023-12-31", "variable": "Precipitación Acumulada (mm)", "zona_type": "municipio", "zona_name": "Hopelchen"}
        
        - Petición: "lluvia de la semana pasada"
        - Tu Respuesta: {"startDate": "${new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0]}", "endDate": "${new Date().toISOString().split('T')[0]}", "variable": "Precipitación Acumulada (mm)", "zona_type": "predefinida", "zona_name": "Todo el Estado"}

        **Petición de Usuario a Procesar:**
        "${query}"
        
        **Tu Respuesta:**
    `;
}

/**
 * Construye el prompt para la predicción de tendencias (Fase 3).
 */
function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1];
    const recentDataSample = JSON.stringify(chartData.slice(-15));
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

/**
 * Construye el prompt para interpretar el mapa de riesgo de incendio.
 */
function buildFireRiskPrompt(data) {
    const { roi, startDate, endDate } = data;
    return `
        Eres un experto en protección civil y analista de riesgos para el gobierno de Campeche.
        Tu tarea es generar un resumen ejecutivo interpretando un mapa de "Riesgo de Incendio Promedio" que se ha generado para el periodo del **${startDate}** al **${endDate}** en la zona de **${roi}**.

        **IMPORTANTE:** Tú no puedes ver el mapa, pero yo te doy la leyenda que utiliza. Debes basar tu análisis en la descripción de esta leyenda.

        **Leyenda del Mapa de Riesgo:**
        - **Verde (#2ca25f):** Zonas de Riesgo Bajo. La humedad en el suelo y la vegetación es relativamente alta.
        - **Amarillo (#fee08b):** Zonas de Riesgo Moderado. Las condiciones de sequedad están presentes y el combustible vegetal empieza a ser inflamable.
        - **Naranja (#fdae61):** Zonas de Riesgo Alto. Condiciones secas, altas temperaturas y baja humedad. El combustible es altamente inflamable.
        - **Rojo (#d73027):** Zonas de Riesgo Extremo. Condiciones críticas de sequía y calor. El riesgo de ignición y propagación rápida es muy elevado.

        **Instrucciones para tu respuesta:**
        1.  **Título:** Comienza con un título claro, como "**Interpretación del Mapa de Riesgo de Incendio**".
        2.  **Explicación General:** Explica al usuario qué significa el mapa y cómo interpretar los colores, basándote en la leyenda que te proporcioné. Menciona que el mapa muestra un promedio para el periodo seleccionado.
        3.  **Análisis de Impacto (Simulado):** Aunque no ves la distribución de colores, describe qué implicaría si un funcionario viera "manchas amarillas y naranjas extendiéndose por zonas agrícolas o forestales".
        4.  **Recomendaciones Accionables:** Proporciona una lista de recomendaciones claras y directas para las partes interesadas:
            - **Para SEPROCI (Protección Civil):** Sugiere acciones como "intensificar el monitoreo en las zonas amarillas y naranjas", "pre-posicionar brigadas" o "emitir alertas tempranas a las comunidades cercanas".
            - **Para Empresas y Sector Agropecuario (SDA):** Sugiere acciones como "reforzar guardarrayas", "evitar quemas agrícolas en días de alto viento" y "asegurar planes de evacuación para el personal y equipo".

        **Formato de Salida:**
        Usa formato Markdown. Sé claro, conciso y enfócate en la acción.
    `;
}
// Archivo: ai-connector.js (añade esta función al final)

/**
 * Construye un prompt para que la IA actúe como un desarrollador de GEE.
 * @param {string} userRequest - La descripción del análisis que pide el usuario.
 * @returns {string} El prompt listo para ser enviado.
 */
function buildGeeLabPrompt(userRequest) {
    return `
        Eres un desarrollador senior experto en la API JavaScript de Google Earth Engine (GEE).
        Tu única tarea es traducir la petición del usuario a un script de GEE funcional y bien estructurado.

        **Reglas Estrictas:**
        1.  **Responde ÚNICAMENTE con el bloque de código JavaScript.** No incluyas explicaciones, saludos, ni bloques de código Markdown (\`\`\`javascript o \`\`\`). Tu respuesta debe empezar con \`var \` o \`//\` y terminar con \`}\`.
        2.  El código debe ser completo y autoejecutable en el Code Editor de GEE.
        3.  Siempre define una Región de Interés (ROI) al principio del script. Si el usuario menciona un municipio de Campeche (ej. "Calakmul", "Carmen"), búscalo en la colección \`FAO/GAUL/2015/level2\`.
        4.  Añade comentarios breves en el código para explicar los pasos clave (ej. // Filtrar colección, // Calcular índice).
        5.  Siempre termina el script con las líneas \`Map.centerObject(roi, 10);\` y \`Map.addLayer(...);\` para asegurar que el resultado sea visible en el mapa.
        6.  Usa colecciones de datos modernas y de alta resolución cuando sea posible (ej. Sentinel-2 'COPERNICUS/S2_SR' para NDVI, Landsat 9 'LANDSAT/LC09/C02/T1_L2' para otros análisis visuales).
        7.  Aplica siempre un filtro de nubosidad razonable (ej. \`.filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))\`).

        **Petición del Usuario:**
        "${userRequest}"

        **Tu Respuesta (solo código):**
    `;
}
// Archivo: ai-connector.js (añade esta función)

/**
 * Maneja la petición de generación de código del Laboratorio de IA.
 */
window.handleLabCodeGeneration = handleLabCodeGeneration; {
    const promptInput = document.getElementById('lab-prompt-input');
    const resultDisplay = document.getElementById('lab-result-display');
    const generateButton = document.getElementById('lab-generate-button');

    const userRequest = promptInput.value;
    if (!userRequest) {
        alert("Por favor, describe el análisis que deseas generar.");
        return;
    }

    // Desactivamos el botón y mostramos un estado de carga
    generateButton.disabled = true;
    generateButton.textContent = "Generando...";
    resultDisplay.textContent = "// Generando código, por favor espera...";

    // Construimos el prompt especializado
    const prompt = buildGeeLabPrompt(userRequest);

    try {
        // Llamamos a nuestra NUEVA API
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
        
        // Mostramos el código generado en el área de resultados
        resultDisplay.textContent = result.generatedCode;

    } catch (error) {
        console.error("Error en la generación de código del Lab:", error);
        resultDisplay.textContent = `// Ocurrió un error:\n// ${error.message}`;
    } finally {
        // Reactivamos el botón
        generateButton.disabled = false;
        generateButton.textContent = "Generar Código";
    }
}
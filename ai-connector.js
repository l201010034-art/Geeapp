// ai-connector.js (Versión Actualizada y Segura)

// ¡Ya no necesitamos la clave de API aquí!
const AI_API_URL = '/api/analyze'; // URL de nuestra nueva función segura

const aiPanel = document.getElementById('ai-analysis-panel');
const aiSummaryDiv = document.getElementById('ai-summary');

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

window.generateAiAnalysis = async function(data) {
    if (!data.stats && !data.chartData) return;
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando datos...</p>';
    const prompt = buildPrompt(data);
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });
        if (!response.ok) throw new Error(`Error en la API: ${response.statusText}`);
        const result = await response.json();
        // Corregido para que también use la función
        aiSummaryDiv.innerHTML = markdownToHtml(result.analysisText);
    } catch (error) {
        console.error("Error al generar análisis con IA:", error);
        aiSummaryDiv.innerHTML = '<p class="text-red-400">Ocurrió un error al contactar al servicio de IA.</p>';
    }
}

/**
 * Construye un prompt detallado y contextualizado para Gemini.
 * @param {object} data - Los datos de la plataforma.
 * @returns {string} El prompt listo para ser enviado.
 */
function buildPrompt(data) {
    const { stats, chartData, chartOptions, variable, roi, startDate, endDate } = data;

    // Simplificamos los datos del gráfico para no exceder el límite de tokens
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

// =================================================================
// === PASO 2: AÑADE ESTA NUEVA LÓGICA CONVERSACIONAL          ===
// =================================================================

const commandForm = document.getElementById('ai-command-form');
const commandBar = document.getElementById('ai-command-bar');

commandForm.addEventListener('submit', function(event) {
    // 1. Evita que la página se recargue (comportamiento por defecto del formulario)
    event.preventDefault(); 
    
    // 2. Evita que el evento "se propague" y cierre el panel del menú
    event.stopPropagation();

    const userQuery = commandBar.value;
    if (userQuery) {
        commandBar.disabled = true;
        commandBar.placeholder = "Procesando...";
        processConversationalQuery(userQuery);
    }
});
/**
 * Procesa la petición en lenguaje natural del usuario.
 * @param {string} query - Lo que el usuario escribió.
 */
async function processConversationalQuery(query) {
    // 1. Enviamos la petición a nuestra API de IA con un prompt especial
    const prompt = buildConversationalPrompt(query);
    
 try {
    const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt }),
    });
    const result = await response.json();
    let aiResponseText = result.analysisText;

    // =================================================================
    // === LA SOLUCIÓN: Limpiar y extraer el JSON de la respuesta   ===
    // =================================================================
    const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("La respuesta de la IA no contenía un JSON válido.");
    }
    const cleanedJsonString = jsonMatch[0];
    // =================================================================

    // Ahora parseamos la cadena de texto ya limpia
    const params = JSON.parse(cleanedJsonString);
    
    if (params.error) {
        throw new Error(params.error);
    }

    // ¡La Magia! Usamos los parámetros extraídos por la IA
    // para rellenar la UI y llamar a la función de análisis que ya existe.
    document.getElementById('startDate').value = params.startDate;
    document.getElementById('endDate').value = params.endDate;
    document.getElementById('variableSelector').value = params.variable;
    
    //...
    window.clearZoneCheckboxes();
    window.zonaCheckboxes[params.zona].checked = true;
    window.handleZoneSelection(params.zona);
    //...
    
    document.getElementById('loadDataButton').click();
    } catch (error) {
        console.error("Error al procesar el comando de IA:", error);
        commandBar.value = "Error. Inténtalo de nuevo.";
    } finally {
        commandBar.disabled = false;
        commandBar.placeholder = "Ej: Lluvia en Chiná el mes pasado...";
    }
}
// ... (código del paso 2) ...

/**
 * Crea un prompt para que la IA extraiga parámetros de una petición de usuario.
 * @param {string} query - Lo que el usuario escribió.
 * @returns {string} El prompt listo para ser enviado.
 */
function buildConversationalPrompt(query) {
    // Obtenemos la fecha de hoy para dar contexto a la IA sobre "ayer", "mes pasado", etc.
    const today = new Date().toISOString().split('T')[0];

    return `
        Tu tarea es actuar como un traductor de lenguaje natural a un formato JSON para una plataforma de monitoreo climático.
        Analiza la petición del usuario y extrae los siguientes parámetros: startDate, endDate, variable, y zona.
        La fecha de hoy es ${today}.
        
        **Opciones Válidas:**
        - Variables: "Temperatura del Aire (°C)", "Humedad Relativa (%)", "Precipitación Acumulada (mm)", "Temp. Superficial (LST °C)", "Evapotranspiración (mm/8 días)".
        - Zonas: "Todo el Estado", "Zona 1, Ciudad Campeche", "Zona 2, Lerma", "Zona 3, Chiná", "Zona 4, San Fco. Campeche".
        
        **Reglas:**
        - Responde ÚNICAMENTE con el objeto JSON. No incluyas explicaciones, texto adicional ni la palabra "json".
        - Si el usuario dice "lluvia", asume "Precipitación Acumulada (mm)".
        - Si el usuario no especifica una zona, asume "Todo el Estado".
        - Calcula las fechas relativas (ej. "mes pasado", "última semana", "2023"). Las fechas deben estar en formato "YYYY-MM-DD".
        - Si no puedes entender la petición, devuelve un JSON con un campo "error".
        
        **Ejemplos:**
        - Petición de Usuario: "temperatura en zona lerma durante enero de 2023"
        - Tu Respuesta: {"startDate": "2023-01-01", "endDate": "2023-01-31", "variable": "Temperatura del Aire (°C)", "zona": "Zona 2, Lerma"}
        
        - Petición de Usuario: "muéstrame la lluvia de la semana pasada"
        - Tu Respuesta: {"startDate": "2025-09-21", "endDate": "2025-09-27", "variable": "Precipitación Acumulada (mm)", "zona": "Todo el Estado"}
        
        - Petición de Usuario: "gfsdgdg"
        - Tu Respuesta: {"error": "No se pudo entender la petición."}

        **Petición de Usuario a Procesar:**
        "${query}"
        
        **Tu Respuesta:**
    `;
}

// =================================================================
// === PASO 3: AÑADE ESTA NUEVA LÓGICA DE PREDICCIÓN          ===
// =================================================================

/**
 * Llama a la IA para generar una predicción basada en datos históricos.
 * @param {Array} chartData - Los datos de la serie temporal del gráfico.
 */
window.generatePrediction = async function(chartData) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Analizando tendencias y generando pronóstico...</p>';

    const prompt = buildPredictionPrompt(chartData);

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });
        const result = await response.json();
        const predictionText = result.analysisText;

        aiSummaryDiv.innerHTML = markdownToHtml(predictionText); // Reutilizamos la función de formateo

    } catch (error) {
        console.error("Error al generar la predicción:", error);
        aiSummaryDiv.innerHTML = '<p class="text-red-400">Ocurrió un error al generar el pronóstico.</p>';
    }
}

/**
 * Construye un prompt para que la IA actúe como un analista predictivo.
 * @param {Array} chartData - Los datos de la serie temporal.
 * @returns {string} El prompt listo para ser enviado.
 */
function buildPredictionPrompt(chartData) {
    const variableName = chartData[0][1]; // ej: "TAM" o "Precipitacion"
    // Tomamos una muestra de los datos más recientes para no exceder el límite de tokens
    const recentDataSample = JSON.stringify(chartData.slice(-15)); // Últimos 15 puntos de datos

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

//================================================================
// LÓGICA ESPECIALIZADA: ANÁLISIS DEL MAPA DE RIESGO DE INCENDIO
//================================================================
window.generateFireRiskAnalysis = async function(data) {
    aiPanel.classList.remove('hidden');
    aiSummaryDiv.innerHTML = '<p class="text-gray-400 animate-pulse">Interpretando mapa de riesgo de incendio...</p>';

    const prompt = buildFireRiskPrompt(data); // Usamos un constructor de prompt específico

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt }),
        });
        const result = await response.json();
        const analysisText = result.analysisText;

        aiSummaryDiv.innerHTML = markdownToHtml(analysisText);

    } catch (error) {
        console.error("Error al generar el análisis de riesgo de incendio:", error);
        aiSummaryDiv.innerHTML = '<p class="text-red-400">Ocurrió un error al interpretar el mapa.</p>';
    }
}

/**
 * Construye un prompt para que la IA interprete el mapa de riesgo de incendio.
 * @param {object} data - Contiene la zona y el rango de fechas.
 * @returns {string} El prompt listo para ser enviado.
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

// Asegúrate de añadir esta nueva función al final de tu archivo,
// junto a los otros constructores de prompts.
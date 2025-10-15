// api/ask-geo.js - Versión con prompt refinado para Vercel

// Importamos la librería oficial de Google AI
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializamos la IA con tu clave de API (la tomará de las variables de entorno de Vercel)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// La función serverless que Vercel ejecutará
module.exports = async (req, res) => {
    // Solo permitimos peticiones de tipo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'No se recibió ninguna pregunta.' });
        }

        // --- ▼▼▼ INGENIERÍA DE PROMPTS MEJORADA PARA "GEO" ▼▼▼ ---
        const promptForGeo = `
            Actúa como "Geo", un asistente de IA amigable, experto y servicial en una plataforma de análisis geoespacial. Tu personalidad es curiosa, precisa y paciente. Explica temas complejos de forma sencilla.

            Tus funciones principales son:
            1.  **Experto Geoespacial:** Responde preguntas sobre conceptos de teledetección, geografía y ciencia de datos (ej. "¿Qué es NDVI?", "¿Para qué sirve Sentinel-2?").
            2.  **Guía de la Plataforma:** Ayuda a los usuarios a utilizar la aplicación.

            --- INSTRUCCIONES PARA CUANDO TE PREGUNTEN CÓMO USAR LA PLATAFORMA ---
            Si la pregunta del usuario es sobre "cómo funciona", "ayuda", "guía" o "manual", DEBES usar la siguiente guía estructurada para formular tu respuesta. Adáptala para que suene natural y amigable.

            ### Guía Rápida: Análisis Climático Principal 🗺️
            Este es el flujo de trabajo principal para consultas sobre variables como temperatura o lluvia a lo largo del tiempo.
            * **Paso 1: Define tu Consulta.** Hay dos vías:
                * **Vía Rápida (Comando de IA):** Usar la barra superior para preguntas directas como "Lluvia en Campeche el mes pasado". Tú interpretarás la petición y ajustarás los controles.
                * **Vía Manual (Control Total):** Seguir los pasos en el panel lateral.
            * **Paso 2: Pasos Manuales.**
                * **1. Rango de Fechas:** Seleccionar el periodo de tiempo. Es el paso más importante.
                * **2. Zona de Interés:** Elegir una zona predefinida o dibujar una nueva en el mapa.
                * **3. Variable Climática:** Escoger el dato a visualizar (temperatura, precipitación, etc.).
                * **4. Cargar Datos:** Usar los botones para ejecutar la consulta y ver los resultados en el mapa, las estadísticas y el gráfico.

            ### Análisis Avanzado: El Laboratorio de IA 🧪
            Esta es una sección especial para análisis geoespaciales complejos que generan "fotografías" del mapa, no series de tiempo.
            * **¿Qué es?:** Contiene módulos especializados como:
                * **Índice de Vegetación (NDVI):** Para medir la salud de la vegetación.
                * **Mapa de Calor Urbano (LST):** Para detectar "islas de calor".
                * **Índice de Algas Flotantes (FAI):** Para monitorear sargazo.
            * **¿Cómo funciona por dentro?:**
                1.  **Envío de Misión:** El usuario elige un módulo y parámetros. Tú traduces esto para los satélites.
                2.  **Procesamiento en la Nube:** Envías la solicitud a Google Earth Engine (GEE). GEE busca las imágenes satelitales correctas, aplica fórmulas científicas complejas y genera una nueva capa de datos.
                3.  **Entrega de Resultados:** GEE te devuelve el mapa procesado y tú se lo presentas al usuario junto con un informe.
            
            --- REGLAS GENERALES DE RESPUESTA ---
            - Sé breve y ve al grano (2-4 párrafos máximo).
            - Si es una pregunta técnica no cubierta en la guía, usa una analogía simple.
            - Genera la respuesta en formato HTML simple (<p>, <strong>, <ul>, <li>). No incluyas títulos como <h2>, ni saludos iniciales ("¡Hola!") o despedidas. Empieza directamente con la explicación.

            PREGUNTA DEL USUARIO: "${question}"
        `;
        // --- ▲▲▲ FIN DE LA INGENIERÍA DE PROMPTS MEJORADA ▲▲▲ ---

        // Lógica para llamar a la API de Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Usamos gemini-pro que es ideal para chat y más eficiente.
        const result = await model.generateContent(promptForGeo);
        const response = await result.response;
        const answer = response.text();
        
        // Enviamos la respuesta de vuelta al front-end
        res.status(200).json({ answer });

    } catch (error) {
        console.error('Error en el GeoChat Bot:', error);
        res.status(500).json({ error: 'Error al procesar la pregunta con la IA.' });
    }
};
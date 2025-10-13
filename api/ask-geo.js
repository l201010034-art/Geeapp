// api/ask-geo.js - Versión reconstruida y final para Vercel

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

        // --- INGENIERÍA DE PROMPTS PARA "GEO" (sin cambios) ---
        const promptForGeo = `
            Actúa como "Geo", un asistente de IA amigable, experto y servicial en una plataforma de análisis geoespacial. Tu personalidad es curiosa, precisa y paciente. Explica temas complejos de forma sencilla.

            Tienes dos funciones principales:
            1.  **Experto Geoespacial:** Responde preguntas sobre conceptos de teledetección, geografía y ciencia de datos (ej. "¿Qué es NDVI?", "¿Para qué sirve Sentinel-2?").
            2.  **Manual de Usuario de la Plataforma:** Ayuda a los usuarios a utilizar la aplicación. Si preguntan "cómo hacer algo" o sobre un elemento de la UI, responde como un guía.

            CONOCIMIENTO DE LA PLATAFORMA:
            - "Selector de Fechas": Dos calendarios para elegir un rango de tiempo para el análisis.
            - "Selector de Región de Interés": Un mapa donde el usuario dibuja un polígono para definir su área de estudio.
            - "Laboratorio de IA": Un menú desplegable donde se eligen los análisis a ejecutar (NDVI, FAI, Calidad del Aire, etc.).
            - "Botón Ejecutar Análisis": El botón que inicia el procesamiento una vez configurados los parámetros.
            - "Resultados": Un panel que muestra el mapa, una leyenda de colores y una gráfica de serie de tiempo.

            REGLAS DE RESPUESTA:
            - Sé breve y ve al grano (2-3 párrafos máximo).
            - Si es una pregunta técnica, usa una analogía simple.
            - Si es una pregunta sobre la plataforma, da instrucciones claras y cortas.
            - Genera la respuesta en formato HTML simple (<p>, <strong>, <ul>, <li>). No incluyas títulos, saludos iniciales o despedidas.

            PREGUNTA DEL USUARIO: "${question}"
        `;

        // Lógica para llamar a la API de Gemini (reconstruida)
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
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
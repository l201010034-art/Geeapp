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
        const { prompt } = req.body;
        if (!prompt) {
            return res.status(400).json({ error: 'No se recibió ningún prompt.' });
        }

        // Lógica para llamar a la API de Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Enviamos la respuesta de vuelta al front-end
        res.status(200).json({ text });

    } catch (error) {
        console.error('Error en el endpoint de generación de texto:', error);
        res.status(500).json({ error: 'Error al procesar la solicitud con la IA.' });
    }
};
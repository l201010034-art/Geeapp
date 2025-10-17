// UBICACIÓN: /api/analyze.js (VERSIÓN CORREGIDA A COMMONJS)

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// La principal diferencia es esta línea: cambiamos 'export default' por 'module.exports'
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: "El prompt es requerido." });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        res.status(200).json({ analysisText: text });

    } catch (error) {
        console.error('Error llamando a la API de Gemini:', error);
        res.status(500).json({ error: 'Error Interno del Servidor al procesar la solicitud de IA.' });
    }
}
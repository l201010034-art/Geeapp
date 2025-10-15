const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Usamos flash, es más rápido y económico para esta tarea

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt } = req.body; // El frontend nos enviará el prompt

        if (!prompt) {
            return res.status(400).json({ error: "El prompt es requerido." });
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Enviamos la respuesta de la IA de vuelta al frontend
        res.status(200).json({ analysisText: text });

    } catch (error) {
        console.error('Error llamando a la API de Gemini:', error);
        res.status(500).json({ error: 'Error Interno del Servidor al procesar la solicitud de IA.' });
    }
}
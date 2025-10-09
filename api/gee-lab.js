// Archivo: /api/gee-lab.js

import { GoogleGenerativeAI } from "@google/generative-ai";

// Inicializa el cliente de forma segura con tu clave de Vercel
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export default async function handler(req, res) {
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
        const generatedCode = response.text();

        // Enviamos el código generado de vuelta al frontend
        res.status(200).json({ generatedCode: generatedCode });

    } catch (error) {
        console.error('Error llamando a la API de Gemini para el Lab:', error);
        res.status(500).json({ error: 'Error Interno del Servidor al generar el código.' });
    }
}
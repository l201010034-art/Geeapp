// Archivo: /api/gee-lab.js (Versión 2.0 con capacidad de ejecución)

import { GoogleGenerativeAI } from "@google/generative-ai";
import ee from '@google/earthengine';
import vm from 'vm'; // Módulo nativo de Node.js para ejecutar código de forma segura

// Función auxiliar para inicializar GEE bajo demanda
const initializeGee = () => new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
        { client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.EE_PRIVATE_KEY },
        () => ee.initialize(null, null, resolve, reject),
        (err) => reject(new Error('La autenticación con GEE falló.'))
    );
});

// Función auxiliar para obtener el MapId de una imagen de GEE
const getMapId = (image) => new Promise((resolve, reject) => {
    // Usamos getMapId para obtener los parámetros de visualización.
    // La imagen ya debería tener sus propios parámetros de vis en el script.
    image.getMapId({}, (mapid, error) => {
        if (error) reject(new Error(error));
        else resolve(mapid);
    });
});


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt, codeToExecute } = req.body;

        if (prompt) {
            // --- MODO 1: GENERAR CÓDIGO ---
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
            const result = await model.generateContent(prompt);
            const generatedCode = result.response.text();
            return res.status(200).json({ generatedCode });

        } else if (codeToExecute) {
            // --- MODO 2: EJECUTAR CÓDIGO ---
            await initializeGee();
            
            // Creamos un 'sandbox' seguro para ejecutar el código.
            // Le damos acceso al objeto 'ee' y a 'console'.
            const sandbox = { ee: ee, console: console, print: console.log, Map: { centerObject: () => {}, addLayer: (img) => img } };            
            vm.createContext(sandbox);

            // Ejecutamos el código. La última expresión (que debería ser Map.addLayer) será el resultado.
            const wrappedCode = `(() => { ${codeToExecute} })();`;
            const imageResult = vm.runInContext(wrappedCode, sandbox);            
            // Obtenemos el MapId de la imagen resultante
            const mapId = await getMapId(imageResult);

            return res.status(200).json({ mapId });

        } else {
            return res.status(400).json({ error: "Se requiere un 'prompt' o 'codeToExecute'." });
        }

    } catch (error) {
        console.error('Error en la API del Lab:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}
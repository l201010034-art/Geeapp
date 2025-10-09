// Archivo: /api/gee-lab.js (Versión 2.1 - Corregida y Robusta)

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
    // La imagen ya debería tener sus propios parámetros de visualización definidos en el script del usuario.
    // Por eso, pasamos un objeto vacío como primer argumento.
    image.getMapId({}, (mapid, error) => {
        if (error) reject(new Error(error));
        else resolve(mapid);
    });
});


export default async function handler(req, res) {
        process.chdir('/tmp'); 

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt, codeToExecute } = req.body;

        if (prompt) {
            // --- MODO 1: GENERAR CÓDIGO (Sin cambios aquí) ---
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" }); // Usamos un modelo más reciente si está disponible
            const result = await model.generateContent(prompt);
            const generatedCode = result.response.text();
            return res.status(200).json({ generatedCode });

        } else if (codeToExecute) {
    // --- MODO 2: EJECUTAR CÓDIGO (Aquí está la corrección) ---
    await initializeGee();
    process.chdir('/tmp'); 

    const logs = [];
    const executionContext = {
        capturedImage: null,
        ee: ee,
        print: console.log,
        console: { // Capturamos los logs para buscar nuestros parámetros
            log: (message) => logs.push(message)
        }
    };

    executionContext.Map = {
        centerObject: () => {},
        addLayer: (img, visParams, name) => {
            executionContext.capturedImage = img;
            return img;
        }
    };
    
    const context = vm.createContext(executionContext);
    vm.runInContext(codeToExecute, context);
    
    if (!context.capturedImage) {
        throw new Error("El código ejecutado no añadió ninguna capa al mapa.");
    }
    
    const mapId = await getMapId(context.capturedImage);

    // Buscamos en los logs el JSON que pedimos
    let resultParams = { explanation: null, visParams: null };
    const jsonLog = logs.find(log => typeof log === 'string' && log.trim().startsWith('{'));
    if (jsonLog) {
        try {
            const parsedLog = JSON.parse(jsonLog);
            resultParams.visParams = parsedLog.visParams; // Extraemos visParams
            // También podríamos usar parsedLog.explanation si quisiéramos
        } catch (e) {
            console.error("No se pudo parsear el log JSON de la IA:", e.message);
        }
    }
    
    // Devolvemos el mapId Y los visParams al navegador
    return res.status(200).json({ mapId, visParams: resultParams.visParams });

        } else {
            return res.status(400).json({ error: "Se requiere un 'prompt' o 'codeToExecute'." });
        }

    } catch (error) {
        console.error('Error en la API del Lab:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}
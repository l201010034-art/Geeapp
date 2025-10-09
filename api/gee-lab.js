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
            
            // ======================= INICIO DE LA CORRECCIÓN =======================

            // 1. Creamos un objeto que compartiremos con el sandbox.
            //    Este objeto nos permitirá "capturar" la imagen desde fuera del sandbox.
            const executionContext = {
                capturedImage: null,
                ee: ee,
                console: console,
                print: console.log
            };

            // 2. Definimos nuestro 'Map' simulado. La función addLayer ahora
            //    modificará el `executionContext` para guardar la imagen.
            executionContext.Map = {
                centerObject: () => {}, // No hace nada, como antes.
                addLayer: (img, visParams, name) => {
                    // ¡Esta es la clave! Capturamos la imagen aquí.
                    executionContext.capturedImage = img;
                    return img; // Devolvemos la imagen por si acaso.
                }
            };
            
            // 3. Creamos el contexto del sandbox usando nuestro objeto compartido.
            const context = vm.createContext(executionContext);

            // 4. Ejecutamos el código. Ya no necesitamos envolverlo ni capturar su valor de retorno.
            vm.runInContext(codeToExecute, context);
            
            // 5. Verificamos si la imagen fue capturada. Si no, el código del usuario nunca llamó a Map.addLayer.
            if (!context.capturedImage) {
                throw new Error("El código ejecutado no añadió ninguna capa al mapa. Asegúrate de que el script incluya una llamada a `Map.addLayer(image, visParams, 'nombre');`");
            }
            
            // 6. Usamos la imagen que capturamos para obtener el MapId.
            const mapId = await getMapId(context.capturedImage);
            
            // ======================== FIN DE LA CORRECCIÓN =========================

            return res.status(200).json({ mapId });

        } else {
            return res.status(400).json({ error: "Se requiere un 'prompt' o 'codeToExecute'." });
        }

    } catch (error) {
        console.error('Error en la API del Lab:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}
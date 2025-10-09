// Archivo: /api/gee-lab.js (Versión 3.0 - Final y Unificada)

import { GoogleGenerativeAI } from "@google/generative-ai";
import ee from '@google/earthengine';
import vm from 'vm';

// --- Diccionario de Auto-Correcciones (Nivel 2) ---
const commonFixes = {
    "'USDOS/LSIB_simple/2017'": "'USDOS/LSIB/2017'",
    "'MODIS/061/MCD14ML'": "'VIIRS/I-1/VNP14IMGML'",

};

function autoCorrectCode(code) {
    let correctedCode = code;
    for (const [error, fix] of Object.entries(commonFixes)) {
        correctedCode = correctedCode.replace(new RegExp(error, 'g'), fix);
    }
    return correctedCode;
}

// --- Lógica de Ejecución de GEE (Ahora en su propia función) ---
// ... (el resto del archivo, como 'commonFixes', se mantiene igual) ...

// --- Lógica de Ejecución de GEE (Ahora en su propia función) ---
async function executeGeeCode(codeToExecute) {
    // 1. Inicializar GEE
    await new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            { client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.EE_PRIVATE_KEY },
            () => ee.initialize(null, null, resolve, reject),
            (err) => reject(new Error(`La autenticación con GEE falló: ${err}`))
        );
    });
    
    // 2. Preparar el Sandbox
    const logs = [];
    const executionContext = {
        capturedImage: null,
        ee: ee,
        print: (message) => logs.push(message.toString()),
        console: { log: (message) => logs.push(message.toString()) }
    };
    executionContext.Map = {
        centerObject: () => {},
        addLayer: (img) => { executionContext.capturedImage = img; return img; }
    };
    const context = vm.createContext(executionContext);

    // 3. Ejecutar el código
    vm.runInContext(codeToExecute, context, { timeout: 30000 });
    
    if (!context.capturedImage) {
        throw new Error("El código ejecutado no añadió ninguna capa al mapa usando Map.addLayer().");
    }
    
    // 4. Extraer los parámetros de visualización del log ANTES de pedir el mapa
    let visParams = {}; // Inicia como objeto vacío por si la IA no lo provee
    const jsonLog = logs.find(log => typeof log === 'string' && log.trim().startsWith('{'));
    if (jsonLog) {
        try {
            // Asignamos los parámetros extraídos a nuestra variable visParams
            visParams = JSON.parse(jsonLog).visParams;
        } catch (e) {
            console.warn("No se pudo parsear el log JSON de la IA:", e.message);
        }
    }

    // 5. OBTENER EL MAP ID USANDO LOS PARÁMETROS DE COLOR EXTRAÍDOS
    const mapId = await new Promise((resolve, reject) => {
        // ▼▼▼ ESTA ES LA LÍNEA CORREGIDA Y CRÍTICA ▼▼▼
        context.capturedImage.getMapId(visParams, (mapid, error) => {
            if (error) reject(new Error(error));
            else resolve(mapid);
        });
    });

    // 6. Devolvemos tanto el mapId como los visParams para la leyenda
    return { mapId, visParams };
}

// ... (el resto del archivo handler no cambia) ...


// --- Manejador Principal de la API ---
export default async function handler(req, res) {
    process.chdir('/tmp'); 

    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt, codeToExecute } = req.body;
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        if (prompt) {
            // --- MODO 1: GENERAR CÓDIGO ---
            const result = await model.generateContent(prompt);
            let generatedCode = result.response.text();
            generatedCode = autoCorrectCode(generatedCode);
            return res.status(200).json({ generatedCode });

        } else if (codeToExecute) {
            // --- MODO 2: EJECUTAR CÓDIGO CON CICLO DE DEPURACIÓN ---
            let codeToRun = codeToExecute;
            const MAX_ATTEMPTS = 2;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    console.log(`Ejecutando código (Intento ${attempt})...`);
                    const { mapId, visParams } = await executeGeeCode(codeToRun);
                    return res.status(200).json({ mapId, visParams, code: codeToRun });
                
                } catch (error) {
                    console.error(`Intento ${attempt} falló:`, error.message);
                    lastError = error;

                    if (attempt === MAX_ATTEMPTS) {
                        throw lastError;
                    }

                    console.log("Pidiendo a la IA una corrección...");
                    
                    // ▼▼▼ ESTE ES EL PROMPT MEJORADO ▼▼▼
                    const debugPrompt = `
                        Eres un experto depurador de código de Google Earth Engine. El siguiente script falló.

                        **Código Fallido:**
                        \`\`\`javascript
                        ${codeToRun}
                        \`\`\`
                        
                        **Error Producido:**
                        "${error.message}"

                        ---
                        **Documentación de la Función que Falló (del error):**
                        ${error.message.includes('Args:') ? error.message.split('Args:')[1].trim() : 'No disponible.'}
                        ---

                        **Instrucciones:**
                        1.  Analiza el **Error Producido**.
                        2.  Compara los argumentos usados en el **Código Fallido** con la **Documentación de la Función**.
                        3.  Corrige el código para que use los argumentos correctos.
                        4.  Responde solo con el bloque de código JavaScript corregido y completo.
                    `;
                    // ▲▲▲ FIN DEL PROMPT MEJORADO ▲▲▲
                    
                    const result = await model.generateContent(debugPrompt);
                    codeToRun = result.response.text().replace(/^```(javascript)?\s*/, '').replace(/```\s*$/, '');
                }
            }
        } else {
            return res.status(400).json({ error: "Se requiere un 'prompt' o 'codeToExecute'." });
        }

    } catch (error) {
        console.error('Error final en la API del Lab:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }

}
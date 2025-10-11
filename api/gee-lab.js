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
// UBICACIÓN: /api/gee-lab.js (Pega esto antes de la función executeGeeCode)

async function getStats(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 5000, bestEffort: true });
        
        dict.evaluate((stats, error) => {
            if (error) {
                reject(new Error('Error calculando estadísticas: ' + error));
            } else {
                const meanKey = `${bandName}_mean`;
                const minKey = `${bandName}_min`;
                const maxKey = `${bandName}_max`;
                
                if (!stats || stats[meanKey] == null) {
                    resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
                } else {
                    const mean = stats[meanKey].toFixed(2);
                    const min = stats[minKey].toFixed(2);
                    const max = stats[maxKey].toFixed(2);
                    resolve(
                        `Estadísticas para ${zoneName}:\n` +
                        `${prefix}: ${mean} ${unit}\n` +
                        `Mínimo: ${min} ${unit}\n` +
                        `Máximo: ${max} ${unit}`
                    );
                }
            }
        });
    });
}

async function getOptimizedChartData(collection, rois, bandName, startDate, endDate, eeRoi) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);
    
    const dateDiffDays = await new Promise((resolve, reject) => {
        eeEndDate.difference(eeStartDate, 'day').evaluate((val, err) => err ? reject(err) : resolve(val));
    });

    if (dateDiffDays > 120) {
        let aggregateUnit = 'week';
        if (dateDiffDays > 730) { 
            aggregateUnit = 'month';
        }
        
        const dateDiff = eeEndDate.difference(eeStartDate, aggregateUnit);
        const dateList = ee.List.sequence(0, dateDiff.subtract(1));
        
        const imageListWithNulls = dateList.map(offset => {
            const start = eeStartDate.advance(ee.Number(offset), aggregateUnit);
            const end = start.advance(1, aggregateUnit);
            const filtered = collection.filterDate(start, end);
            return ee.Algorithms.If(
                filtered.size().gt(0),
                filtered.mean().rename(bandName).set('system:time_start', start.millis()),
                null
            );
        });
        
        collection = ee.ImageCollection.fromImages(imageListWithNulls.removeAll([null]));
    }
    
    // Para el laboratorio, siempre tratamos el ROI como una sola entidad.
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: eeRoi,
                scale: 5000,
                bestEffort: true
            }).get(bandName);
            return ee.Feature(null, { 'system:time_start': image.get('system:time_start'), 'value': value });
        });

        series.evaluate((fc, error) => {
            if (error) reject(new Error('Error evaluando datos del gráfico: ' + error));
            else {
                const header = [['Fecha', bandName]];
                const rows = fc.features
                    .filter(f => f.properties.value !== null)
                    .map(f => [new Date(f.properties['system:time_start']).toISOString(), f.properties.value])
                    .sort((a,b) => new Date(a[0]) - new Date(b[0]));
                resolve(header.concat(rows));
            }
        });
    });
}


async function executeGeeCode(codeToExecute, roi, startDate, endDate) {
    // 1. Inicializar GEE
    await new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey(
            { client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.EE_PRIVATE_KEY },
            () => ee.initialize(null, null, resolve, reject),
            (err) => reject(new Error(`La autenticación con GEE falló: ${err}`))
        );
    });

    // 2. Preparar el Sandbox para capturar las variables
    const logs = [];
let eeRoi;
if (roi === 'Golfo de México (Zona Campeche)') {
    eeRoi = ee.Geometry.Rectangle([-94, 18, -89, 22], null, false);
} else if (roi === 'Línea Costera (Sonda de Campeche)') {
    eeRoi = ee.Geometry.Rectangle([-92.5, 18.5, -90.5, 21], null, false);
} else if (roi && typeof roi === 'object' && roi.type === 'Polygon') {
    // Esto es para futuras geometrías dibujadas por el usuario
    eeRoi = ee.Geometry.Polygon(roi.coordinates);
} else {
    // Si no es una zona marina, asumimos que es un CVEGEO de municipio
    const municipios = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');
    const feature = ee.Feature(municipios.filter(ee.Filter.eq('CVEGEO', roi)).first());
    eeRoi = feature.geometry(); // ee.Algorithms.If es manejado por GEE, no necesitamos evaluarlo aquí
}

const executionContext = {
    capturedImage: null,
    ee: ee,
    console: { log: (message) => logs.push(message.toString()) },
    laImagenResultante: null,
    collectionForChart: null,
    bandNameForChart: null,
    visParams: null,
    roi: eeRoi // Pasamos el objeto de geometría de GEE ya construido
};
    executionContext.Map = {
        centerObject: () => {},
        addLayer: (img) => { executionContext.capturedImage = img; return img; }
    };
    const context = vm.createContext(executionContext);

    // 3. Ejecutar el código
    vm.runInContext(codeToExecute, context, { timeout: 60000 }); // Aumentamos el timeout a 60s

    if (!context.capturedImage) {
        throw new Error("El código no añadió una capa al mapa (Map.addLayer).");
    }

    // 4. Obtener el Map ID
    const visParams = context.visParams || {};
    const mapId = await new Promise((resolve, reject) => {
        context.capturedImage.getMapId(visParams, (mapid, error) => error ? reject(new Error(error)) : resolve(mapid));
    });

    // 5. ¡NUEVO! Calcular estadísticas y datos del gráfico si las variables existen
    let stats = `Análisis visual para: ${context.bandNameForChart || 'Resultado del Laboratorio'}`;
    let chartData = null;

    if (context.collectionForChart && context.bandNameForChart) {
        const singleRoiForChart = { name: 'Resultado del Laboratorio', geom: roi };
        chartData = await getOptimizedChartData(context.collectionForChart, [singleRoiForChart], context.bandNameForChart, startDate, endDate, context.roi);
        
        // Usamos la imagen del mapa para las estadísticas generales
        const imageForStats = context.laImagenResultante.select(context.bandNameForChart);
        stats = await getStats(imageForStats, context.roi, context.bandNameForChart, '', 'Resultado del Laboratorio');
    }

    return { mapId, visParams, stats, chartData, chartOptions: { title: `Serie Temporal para ${context.bandNameForChart}` } };
}


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
             const { roi, startDate, endDate } = req.body; // <-- Añade esta línea para obtener los nuevos datos
             if (!roi || !startDate || !endDate) {
                return res.status(400).json({ error: "Se requiere 'roi', 'startDate' y 'endDate' para ejecutar el código." });
            }
            // --- MODO 2: EJECUTAR CÓDIGO CON CICLO DE DEPURACIÓN ---
            let codeToRun = codeToExecute;
            const MAX_ATTEMPTS = 2;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    console.log(`Ejecutando código (Intento ${attempt})...`);
                    // Pasa los nuevos parámetros a la función
                    const result = await executeGeeCode(codeToRun, roi, startDate, endDate);
                    return res.status(200).json({ ...result, code: codeToRun });
                
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
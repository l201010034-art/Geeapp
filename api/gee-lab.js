// Archivo: /api/gee-lab.js (Versión 3.0 - Final y Unificada)

import { GoogleGenerativeAI } from "@google/generative-ai";
import ee from '@google/earthengine';
import vm from 'vm';

// --- Capa 1: Diccionario de Auto-Correcciones Preventivas ---
const commonFixes = {
    // Error común: Dataset de fronteras obsoleto
    "'USDOS/LSIB_simple/2017'": "'USDOS/LSIB/2017'",
    // Error común: Dataset de incendios MODIS obsoleto, VIIRS es el sucesor
    "'MODIS/061/MCD14ML'": "'VIIRS/I-1/VNP14IMGML'",
};

function autoCorrectCode(code) {
    let correctedCode = code;
    for (const [error, fix] of Object.entries(commonFixes)) {
        correctedCode = correctedCode.replace(new RegExp(error, 'g'), fix);
    }
    return correctedCode;
}

// --- Lógica de Análisis (Estadísticas y Gráficos) ---
async function getStats(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 5000, bestEffort: true });
        
        dict.evaluate((stats, error) => {
            if (error) {
                return reject(new Error('Error calculando estadísticas: ' + error));
            }
            const meanKey = `${bandName}_mean`;
            if (!stats || stats[meanKey] == null) {
                return resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
            }
            const mean = stats[meanKey].toFixed(2);
            const min = stats[`${bandName}_min`].toFixed(2);
            const max = stats[`${bandName}_max`].toFixed(2);
            resolve(
                `Estadísticas para ${zoneName}:\n` +
                `${prefix}: ${mean} ${unit}\n` +
                `Mínimo: ${min} ${unit}\n` +
                `Máximo: ${max} ${unit}`
            );
        });
    });
}

async function getOptimizedChartData(collection, roi, bandName, startDate, endDate) {
    // ... (Esta función optimiza la consulta de datos para el gráfico)
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
    
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: roi,
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


// --- Lógica de Ejecución de GEE (Ahora en su propia función) ---
async function executeGeeCode(codeToExecute, roiParam, startDate, endDate) {
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
    if (roiParam === 'Golfo de México (Zona Campeche)') {
        eeRoi = ee.Geometry.Rectangle([-94, 18, -89, 22], null, false);
    } else if (roiParam === 'Línea Costera (Sonda de Campeche)') {
        eeRoi = ee.Geometry.Rectangle([-92.5, 18.5, -90.5, 21], null, false);
    } else {
        const municipios = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');
        eeRoi = municipios.filter(ee.Filter.eq('CVEGEO', roiParam)).first().geometry();
    }

    const executionContext = {
        ee: ee,
        console: { log: (message) => logs.push(message.toString()) },
        roi: eeRoi,
        // Variables que esperamos que la IA defina
        laImagenResultante: null,
        collectionForChart: null,
        bandNameForChart: null,
        visParams: null,
    };
    executionContext.Map = {
        centerObject: () => {},
        addLayer: (img) => { 
            // Capturamos la imagen que se añade al mapa
            if (!executionContext.laImagenResultante) {
                executionContext.laImagenResultante = img;
            }
        }
    };
    const context = vm.createContext(executionContext);

    // 3. Ejecutar el código en el sandbox
    vm.runInContext(codeToExecute, context, { timeout: 60000 });

    if (!context.laImagenResultante) {
        throw new Error("El código no definió la variable 'laImagenResultante' o no llamó a Map.addLayer.");
    }

    // 4. Obtener el Map ID para el frontend
    const visParams = context.visParams || {};
    const mapId = await new Promise((resolve, reject) => {
        context.laImagenResultante.getMapId(visParams, (mapid, error) => error ? reject(new Error(error)) : resolve(mapid));
    });

    // 5. ¡NUEVO! Calcular estadísticas y datos del gráfico si las variables existen
    let stats = `Análisis visual para: ${context.bandNameForChart || 'Resultado del Laboratorio'}`;
    let chartData = null;

    if (context.collectionForChart && context.bandNameForChart) {
        chartData = await getOptimizedChartData(context.collectionForChart, eeRoi, context.bandNameForChart, startDate, endDate);
        const imageForStats = context.laImagenResultante.select(context.bandNameForChart);
        stats = await getStats(imageForStats, eeRoi, context.bandNameForChart, '', 'Resultado del Laboratorio');
    }

    return { mapId, visParams, stats, chartData, chartOptions: { title: `Serie Temporal para ${context.bandNameForChart}` } };
}


// --- Manejador Principal de la API ---
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt, codeToExecute, roi, startDate, endDate } = req.body;
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });

        if (prompt) {
            // --- MODO 1: GENERAR CÓDIGO ---
            const result = await model.generateContent(prompt);
            let generatedCode = result.response.text();
            
            // Aplicamos la auto-corrección inicial
            generatedCode = autoCorrectCode(generatedCode);
            
            return res.status(200).json({ generatedCode });

        } else if (codeToExecute) {
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
                    const result = await executeGeeCode(codeToRun, roi, startDate, endDate);
                    return res.status(200).json({ ...result, code: codeToRun });
                
                } catch (error) {
                    console.error(`Intento ${attempt} falló:`, error.message);
                    lastError = error;

                    if (attempt === MAX_ATTEMPTS) {
                        throw lastError; // Si falla dos veces, nos rendimos y mostramos el error
                    }

                    console.log("Pidiendo a la IA una corrección...");
                    
                    // ▼▼▼ Capa 2: Prompt de Depuración Mejorado ▼▼▼
                    const debugPrompt = `
                        Eres un experto depurador de código de Google Earth Engine. El siguiente script falló.
                        **Código Fallido:**
                        \`\`\`javascript
                        ${codeToRun}
                        \`\`\`
                        
                        **Error Producido:**
                        "${error.message}"

                        **Instrucciones:**
                        1.  Analiza el error. La causa más probable es un nombre de banda incorrecto, un método obsoleto, o un mal uso de una función.
                        2.  Corrige el código para solucionar el error.
                        3.  Asegúrate de que las variables finales ('laImagenResultante', 'collectionForChart', 'bandNameForChart', 'visParams') estén definidas correctamente.
                        4.  Responde ÚNICAMENTE con el bloque de código JavaScript corregido y completo. No incluyas explicaciones.
                    `;
                    
                    const result = await model.generateContent(debugPrompt);
                    codeToRun = result.response.text().replace(/^```(javascript)?\s*|\s*```\s*$/g, '');
                    codeToRun = autoCorrectCode(codeToRun); // Aplicamos correcciones al código nuevo también
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
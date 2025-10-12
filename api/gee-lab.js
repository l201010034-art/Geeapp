// Archivo: /api/gee-lab.js (Versión 3.0 - Final y Unificada)

import { GoogleGenerativeAI } from "@google/generative-ai";
import ee from '@google/earthengine';
import vm from 'vm';

// ... después de las importaciones
function getMunicipalityCvegeo(municipalityName) {
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedInput = normalize(municipalityName);
    const cvegeoMap = {
        'calakmul': '04010', 'calkini': '04001', 'campeche': '04002', 'candelaria': '04011',
        'carmen': '04003', 'champoton': '04004', 'dzitbalche': '04013', 'escarcega': '04008',
        'hecelchakan': '04005', 'hopelchen': '04006', 'palizada': '04007', 'seybaplaya': '04012',
        'tenabo': '04009'
    };
    return cvegeoMap[normalizedInput] || null;
}
// El resto del archivo continúa...

// UBICACIÓN: api/gee-lab.js

// --- Capa 1: Diccionario de Auto-Correcciones Preventivas (Versión Definitiva) ---
const commonFixes = {
    // --- HURACANES Y CLIMA ---
    "'IBTrACS/v4'": "'NOAA/IBTrACS/v4'",
    "'GOES-16/ABI-L1b-RadC'": "'NOAA/GOES/16/MCMIPC'",
    "'NOAA/hurdat2/v2'": "'NOAA/NHC/HURDAT2/atlantic'",
    "'NOAA/CDR/OISST/V2.1'":"'NOAA/CDR/OISST/V2_1'",
    "'NOAA/OISST/V2.1/AVHRR-ONLY'":"'NOAA/CDR/AVHRR/SR/V5'",

    // --- INCENDIOS ---
    "'MODIS/061/MCD14ML'": "'FIRMS'",
    "'MODIS/MCD14ML'": "'FIRMS'",

    // --- TEMPERATURA SUPERFICIAL (LST) ---
    "'MODIS/006/MOD11A2'": "'MODIS/061/MOD11A2'",
    "'MODIS/006/MOD11A1'": "'MODIS/061/MOD11A1'",

    // --- NDVI, FAI Y SUPERFICIE TERRESTRE ---
    "'LANDSAT/LC08/C01/T1_SR'": "'LANDSAT/LC08/C02/T1_L2'",
    "'LANDSAT/LC09/C01/T1_SR'": "'LANDSAT/LC09/C02/T1_L2'",
    "'COPERNICUS/S2_SR'": "'COPERNICUS/S2_SR_HARMONIZED'",

    // --- CALIDAD DEL AIRE ---
    "'COPERNICUS/S5P/NRTI/L3_NO2'": "'COPERNICUS/S5P/OFFL/L3_NO2'",
    "'COPERNICUS/S5P/NRTI/L3_O3'": "'COPERNICUS/S5P/OFFL/L3_O3'", // También para Ozono

    // --- FRONTERAS Y DATOS VECTORIALES ---
    "'USDOS/LSIB_simple/2017'": "'USDOS/LSIB/2017'",
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

async function getOptimizedChartData(collection, roi, bandName, labStartDate, labEndDate) {
    // ... (Esta función optimiza la consulta de datos para el gráfico)
    const eeStartDate = ee.Date(labStartDate);
    const eeEndDate = ee.Date(labEndDate);
    
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


// UBICACIÓN: api/gee-lab.js

// REEMPLAZA la función executeGeeCode completa con esta:
async function executeGeeCode(codeToExecute, roiParam, labStartDate, labEndDate) {
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
    let eeRoi;
    // ... (la lógica para definir eeRoi se mantiene igual que antes) ...
    if (roiParam === 'Golfo de México (Zona Campeche)') {
        eeRoi = ee.Geometry.Rectangle([-94, 18, -89, 22], null, false);
    } else if (roiParam === 'Línea Costera (Sonda de Campeche)') {
        eeRoi = ee.Geometry.Rectangle([-92.5, 18.5, -90.5, 21], null, false);
    } else {
        const cvegeo = getMunicipalityCvegeo(roiParam);
        if (!cvegeo) throw new Error(`El nombre del municipio "${roiParam}" no es válido.`);
        const municipios = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');
        eeRoi = municipios.filter(ee.Filter.eq('CVEGEO', cvegeo)).first().geometry();
    }
    
    // 3. Construir el script final y el contexto
    const fullScript = `
        // Variables inyectadas por el servidor
        var roi = ee.Geometry(${JSON.stringify(eeRoi.getInfo())});
        var startDate = '${labStartDate}';
        var endDate = '${labEndDate}';
        
        // Variables que el código de la IA debe definir
        var laImagenResultante, collectionForChart, bandNameForChart, visParams;

        // --- INICIO DEL CÓDIGO GENERADO POR LA IA ---
        ${codeToExecute}
        // --- FIN DEL CÓDIGO GENERADO POR LA IA ---
    `;

    const context = vm.createContext({
        ee: ee,
        console: { log: (message) => logs.push(message.toString()) },
    });

    // 4. Ejecutar el script completo
    vm.runInContext(fullScript, context, { timeout: 90000 }); // Aumentamos el timeout a 90s

    const { laImagenResultante, collectionForChart, bandNameForChart, visParams } = context;

    if (!laImagenResultante) throw new Error("El código no definió 'laImagenResultante'.");
    if (!visParams) throw new Error("El código no definió 'visParams'.");

    // 5. Obtener Map ID
    const mapId = await new Promise((resolve, reject) => {
        laImagenResultante.clip(eeRoi).getMapId(visParams, (mapid, error) => error ? reject(new Error(error)) : resolve(mapid));
    });

    // 6. Calcular estadísticas y datos del gráfico
    let stats = `Análisis visual para: ${bandNameForChart || 'Resultado del Laboratorio'}`;
    let chartData = null;

    if (collectionForChart && bandNameForChart) {
        chartData = await getOptimizedChartData(collectionForChart, eeRoi, bandNameForChart, labStartDate, labEndDate);
        // Usamos la imagen ya compuesta para las estadísticas para asegurar la optimización
        const imageForStats = laImagenResultante.select(bandNameForChart); 
        stats = await getStats(imageForStats, eeRoi, bandNameForChart, '', 'Resultado del Laboratorio');
    }

    return { mapId, visParams, stats, chartData, chartOptions: { title: `Serie Temporal para ${bandNameForChart}` } };
}


// --- Manejador Principal de la API ---
export default async function handler(req, res) {
        process.chdir('/tmp'); 
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { prompt, codeToExecute, roi, labStartDate, labEndDate } = req.body;
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

        if (prompt) {
            // --- MODO 1: GENERAR CÓDIGO ---
            const result = await model.generateContent(prompt);
            let generatedCode = result.response.text();
            
            // Aplicamos la auto-corrección inicial
            generatedCode = autoCorrectCode(generatedCode);
            
            return res.status(200).json({ generatedCode });

        } else if (codeToExecute) {
            if (!roi || !labStartDate || !labEndDate) {
               return res.status(400).json({ error: "Se requiere 'roi', 'startDate' y 'endDate' para ejecutar el código." });
           }
            // --- MODO 2: EJECUTAR CÓDIGO CON CICLO DE DEPURACIÓN ---
            let codeToRun = codeToExecute;
            const MAX_ATTEMPTS = 4;
            let lastError = null;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    console.log(`Ejecutando código (Intento ${attempt})...`);
                    const result = await executeGeeCode(codeToRun, roi, labStartDate, labEndDate);
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
                        5.  Las funciones como Map.centerObject() no son reconocidas en este entorno y deben ser eliminadas o sustituidas para el entorno de servidor.
                        6.  Añade a todos los analisis una leyenda que describa la variable analizada.
                        7.  labStartDate y labEndDate son enviados desde el servidor y no necesitan ser definidos en el código.

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
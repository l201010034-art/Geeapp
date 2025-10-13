import { GoogleGenerativeAI } from '@google/generative-ai';
import ee from '@google/earthengine';

// Validar claves de API al inicio
if (!process.env.GEMINI_API_KEY) throw new Error('La variable de entorno GEMINI_API_KEY no está configurada.');
if (!process.env.EE_SERVICE_ACCOUNT_EMAIL) throw new Error('La variable de entorno EE_SERVICE_ACCOUNT_EMAIL no está configurada.');
if (!process.env.EE_PRIVATE_KEY) throw new Error('La variable de entorno EE_PRIVATE_KEY no está configurada.');

// Inicializar clientes
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// =========================================================================================
// === FUNCIONES DE PROCESAMIENTO DE GEE (CONSOLIDADAS) =====================================
// =========================================================================================

function processEra5(image) {
    const temp = image.select('temperature_2m').subtract(273.15).rename('TAM');
    const Td = image.select('dewpoint_temperature_2m').subtract(273.15);
    const rh = Td.expression('(exp((17.625 * Td)/(243.04 + Td)) / exp((17.625 * T)/(243.04 + T))) * 100', {T: temp, Td: Td}).rename('HR');
    const solar = image.select('surface_solar_radiation_downwards').divide(3600).rename('Radiacion_Solar');
    const u = image.select('u_component_of_wind_10m');
    const v = image.select('v_component_of_wind_10m');
    const speed = u.hypot(v).rename('wind_speed');
    return temp.addBands([rh, solar, speed, u, v]).copyProperties(image, ['system:time_start']);
}
function processModis(image) {
    return image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST').copyProperties(image, ['system:time_start']);
}
function processChirps(image) {
    return image.select('precipitation').rename('Precipitacion').copyProperties(image, ['system:time_start']);
}
function processET(image) {
    const scaleFactor = 0.1;
    const et = image.select('ET').multiply(scaleFactor).rename('ET');
    const pet = image.select('PET').multiply(scaleFactor).rename('PET');
    return et.addBands(pet).copyProperties(image, ['system:time_start']);
}
function processGDD(image) {
    const tMin = image.select('minimum_2m_air_temperature').subtract(273.15);
    const tMax = image.select('maximum_2m_air_temperature').subtract(273.15);
    const tBase = 10.0;
    const gdd = tMin.add(tMax).divide(2).subtract(tBase).max(0).rename('GDD');
    return gdd.copyProperties(image, ['system:time_start']);
}
function getSpiCollection(roi, timescale) {
    const referenceStart = ee.Date('1994-01-01');
    const referenceEnd = ee.Date('2025-07-01');
    const monthlyPrecip = ee.ImageCollection.fromImages(
        ee.List.sequence(0, referenceEnd.difference(referenceStart, 'month').subtract(1)).map(function(m) {
            const start = referenceStart.advance(m, 'month');
            const end = start.advance(1, 'month');
            const total = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(start, end).filterBounds(roi).sum().select('precipitation');
            return total.set('system:time_start', start.millis(), 'month', start.get('month'));
        })
    );
    const dates = ee.List.sequence(0, referenceEnd.difference(referenceStart, 'month').subtract(timescale));
    const movingWindowSums = ee.ImageCollection.fromImages(
        dates.map(function(m) {
            const windowStart = referenceStart.advance(m, 'month');
            const windowEnd = windowStart.advance(timescale, 'month');
            const collectionInWindow = monthlyPrecip.filterDate(windowStart, windowEnd);
            const windowSum = collectionInWindow.sum().rename('precip_sum');
            return windowSum.set('system:time_start', windowEnd.millis(), 'month', windowEnd.get('month'));
        })
    );
    const monthlyStats = ee.ImageCollection.fromImages(
        ee.List.sequence(1, 12).map(function(m) {
            const sumsForMonth = movingWindowSums.filter(ee.Filter.eq('month', m));
            const mean = sumsForMonth.mean();
            const stdDev = sumsForMonth.reduce(ee.Reducer.stdDev());
            const stdDevSafe = stdDev.where(stdDev.eq(0), 1);
            return mean.addBands(stdDevSafe).set('month', m);
        })
    );
    return movingWindowSums.map(function(image) {
        const month = image.get('month');
        const statsForMonth = ee.Image(monthlyStats.filter(ee.Filter.eq('month', month)).first());
        const mean = statsForMonth.select('precip_sum');
        const stdDev = statsForMonth.select('precip_sum_stdDev');
        const spi = image.subtract(mean).divide(stdDev).rename('SPI');
        return spi.copyProperties(image, image.propertyNames());
    });
}
function aggregateCollection(collection, unit, reducer, startDate, endDate) {
    const diffUnit = unit;
    const dateDiff = ee.Date(endDate).difference(ee.Date(startDate), diffUnit);
    const dateList = ee.List.sequence(0, dateDiff.subtract(1));
    const imageListWithNulls = dateList.map(function(offset) {
        const start = ee.Date(startDate).advance(ee.Number(offset), diffUnit);
        const end = start.advance(1, diffUnit);
        const filtered = collection.filterDate(start, end);
        return ee.Algorithms.If(
            filtered.size().gt(0),
            filtered.reduce(reducer).set('system:time_start', start.millis()),
            null
        );
    });
    const imageList = imageListWithNulls.removeAll([null]);
    return ee.ImageCollection.fromImages(imageList);
}

// =========================================================================================
// === MANEJADOR PRINCIPAL DE LA API UNIFICADO =============================================
// =========================================================================================
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        await new Promise((resolve, reject) => {
             ee.data.authenticateViaPrivateKey({
                client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.EE_PRIVATE_KEY
            }, () => ee.initialize(null, null, resolve, reject));
        });

        const { prompt, data, action, params } = req.body;

      if (prompt) {
        // --- Lógica de Gemini (para el chat) ---
        const systemPrompt = `
            Eres un asistente experto en análisis climático para el estado de Campeche, México.
            Tu objetivo es ayudar a los usuarios a interactuar con una plataforma de monitoreo.
            Tienes dos modos de operación:

            1.  **Traductor de Comandos:** Si la pregunta del usuario es una solicitud para visualizar datos,
                tu ÚNICA respuesta debe ser un objeto JSON con la estructura {"isCommand": true, "command": {...}}.
                - El objeto "command" debe tener una propiedad "action" y una propiedad "params".
                - Acciones válidas para "action": 'loadData', 'compare', 'precipAnalysis', 'tempAnalysis', 'calculateSpi', 'fireRisk'.
                - Si la variable es 'Precipitación Acumulada (mm)', la acción es 'precipAnalysis'.
                - Si la variable es 'Temperatura del Aire (°C)', la acción es 'tempAnalysis'.
                - Si la variable es 'Riesgo de Incendio', la acción es 'fireRisk'.
                - Si la variable es 'SPI', la acción es 'calculateSpi'.
                - Para todas las demás variables, la acción es 'loadData'.
                - Parámetros válidos para "params": 'variable', 'startDate', 'endDate', 'zone', 'timescale', 'analysisType'.
                - Nombres de variables válidas: 'Temperatura del Aire (°C)', 'Humedad Relativa (%)', 'Precipitación Acumulada (mm)', 'Riesgo de Incendio', 'SPI', 'Días Grado de Crecimiento (°C día)', etc.
                - Nombres de zonas válidas: 'Todo el Estado', 'Zona 1, Ciudad Campeche', 'Zona 2, Lerma', 'Zona 3, Chiná', 'Zona 4, San Fco. Campeche'.
                - Si el usuario menciona una zona, DEBES incluirla en el parámetro "zone". Si no menciona ninguna zona, asume "Todo el Estado".
                - Si el usuario pide un rango de tiempo relativo como "el mes pasado" o "la próxima semana", calcula las fechas startDate y endDate en formato YYYY-MM-DD. Hoy es ${new Date().toISOString().split('T')[0]}.
                - Si no puedes determinar una acción o parámetro, responde con una pregunta clarificadora en formato de texto.

            2.  **Analista de Datos:** Si la pregunta del usuario es una solicitud de resumen, tu respuesta debe ser un texto en lenguaje natural que resuma los datos.
                Tu ÚNICA respuesta debe ser un objeto JSON con la estructura {"isCommand": false, "responseText": "..."}.

            No añadas explicaciones, solo el JSON.
            `;

            const userPrompt = data 
                ? `Aquí están los datos del análisis actual: "${data}". La pregunta del usuario es: "${prompt}". Por favor, genera un resumen ejecutivo.`
                : prompt;
                
            const fullPrompt = `${systemPrompt}\n\n--- INSTRUCCIÓN DEL USUARIO ---\n\n${userPrompt}`;

            const result = await model.generateContent(fullPrompt);
            let responseText = result.response.text();
            responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                const jsonResponse = JSON.parse(responseText);
                return res.status(200).json(jsonResponse);
            } catch (e) {
                return res.status(200).json({ isCommand: false, responseText: responseText });
            }

        } else if (action && params) {
            // --- Lógica Manual (para los botones) ---
            let responseData;
            switch (action) {
                case 'getGeneralData': responseData = await handleGeneralData(params); break;
                case 'getCompareData': responseData = await handleCompareData(params); break;
                case 'getPrecipitationData': responseData = await handlePrecipitationData(params); break;
                case 'getTemperatureData': responseData = await handleTemperatureData(params); break;
                case 'getSpiData': responseData = await handleSpiData(params); break;
                case 'getFireRiskData': responseData = await handleFireRiskData(params); break;
                default: throw new Error(`Action '${action}' no reconocida.`);
            }
            return res.status(200).json(responseData);

        } else {
            return res.status(400).json({ error: 'Solicitud inválida.' });
        }

    } catch (error) {
        console.error('Error en la API:', error);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}

// =========================================================================================
// === MANEJADORES DE ANÁLISIS (LÓGICA DE GEE) =============================================
// =========================================================================================

async function getOptimizedHighFrequencyCollection(datasetName, eeRoi, startDate, endDate) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);

    const dateDiffDays = await new Promise((resolve, reject) => {
        eeEndDate.difference(eeStartDate, 'day').evaluate((val, err) => err ? reject(err) : resolve(val));
    });

    if (dateDiffDays <= 90) {
        return ee.ImageCollection(datasetName).filterDate(startDate, endDate).filterBounds(eeRoi).map(processEra5);
    }
    
    const dateList = ee.List.sequence(0, dateDiffDays - 1);
    const dailyImagesList = dateList.map(offset => {
        const start = eeStartDate.advance(ee.Number(offset), 'day');
        const end = start.advance(1, 'day');
        const hourlyImages = ee.ImageCollection(datasetName).filterDate(start, end).filterBounds(eeRoi);
        return ee.Algorithms.If(hourlyImages.size().gt(0), processEra5(hourlyImages.mean()).set('system:time_start', start.millis()), null);
    });
    
    return ee.ImageCollection.fromImages(dailyImagesList.removeAll([null]));
}

async function handleGeneralData({ roi, varInfo, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    let collection;

    if (varInfo.dataset === 'ERA5') {
        collection = await getOptimizedHighFrequencyCollection('ECMWF/ERA5_LAND/HOURLY', eeRoi, startDate, endDate);
    } else {
        const datasetMap = {
            'MODIS': 'MODIS/061/MOD11A1',
            'MODIS_ET': "MODIS/006/MOD16A2",
            'ERA5_DAILY': "ECMWF/ERA5/DAILY",
            'CHIRPS': 'UCSB-CHG/CHIRPS/DAILY'
        };
        const processMap = {
            'MODIS': processModis,
            'MODIS_ET': processET,
            'ERA5_DAILY': processGDD,
            'CHIRPS': processChirps
        };
        collection = ee.ImageCollection(datasetMap[varInfo.dataset]).filterDate(startDate,endDate).filterBounds(eeRoi).map(processMap[varInfo.dataset]);
    }
    
    // 1. Calculamos la imagen promedio SÓLO para la visualización del mapa.
    const imageForMap = collection.select(varInfo.bandName).mean();
    const mapId = await getMapId(imageForMap.clip(eeRoi), { min: varInfo.min, max: varInfo.max, palette: varInfo.palette });
    
    // 2. LLAMAMOS a la nueva función getStats, pasándole la COLECCIÓN COMPLETA.
    const stats = await getStatsForCollection(collection, eeRoi, varInfo.bandName, varInfo.unit, roi.name);
    
    const chartData = await getOptimizedChartData(collection.select(varInfo.bandName), [roi], varInfo.bandName, startDate, endDate);

    return { mapId, stats, chartData, chartOptions: { title: `Serie Temporal para ${roi.name}` } };
}

async function handleCompareData({ rois, varInfo, startDate, endDate }) {
    const features = rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name }));
    const fc = ee.FeatureCollection(features);
    const eeRoi = fc.geometry();
    let collection;

    if (varInfo.dataset === 'ERA5') {
        collection = await getOptimizedHighFrequencyCollection('ECMWF/ERA5_LAND/HOURLY', eeRoi, startDate, endDate);
    } else {
        const datasetMap = {
            'MODIS': 'MODIS/061/MOD11A1',
            'MODIS_ET': "MODIS/006/MOD16A2",
            'ERA5_DAILY': "ECMWF/ERA5/DAILY",
            'CHIRPS': 'UCSB-CHG/CHIRPS/DAILY'
        };
        const processMap = {
            'MODIS': processModis,
            'MODIS_ET': processET,
            'ERA5_DAILY': processGDD,
            'CHIRPS': processChirps
        };
        collection = ee.ImageCollection(datasetMap[varInfo.dataset]).filterDate(startDate,endDate).filterBounds(eeRoi).map(processMap[varInfo.dataset]);
    }

    const chartData = await getOptimizedChartData(collection.select(varInfo.bandName), rois, varInfo.bandName, startDate, endDate);
    
    return { 
        stats: `Comparando ${rois.length} zonas. Ver el gráfico para los resultados.`,
        chartData, 
        chartOptions: { title: `Comparación de ${varInfo.bandName} entre zonas` }
    };
}

async function handlePrecipitationData({ roi, analysisType, aggregation, startDate, endDate }) {
    if (!startDate || !endDate) {
        throw new Error("Fechas de inicio y fin son requeridas para el análisis de precipitación.");
    }
    const eeRoi = ee.Geometry(roi.geom);
    const precipCollection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(startDate, endDate).filterBounds(eeRoi).map(processChirps);
    let metricCollection, reducer, title, visParams, unit, chartTitle;
    if (analysisType === 'accumulated') {
        metricCollection = precipCollection;
        reducer = ee.Reducer.sum();
        title = 'Precipitación Total Acumulada';
        chartTitle = 'Precipitación Acumulada';
        visParams = { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'] };
        unit = 'mm';
    } else if (analysisType === 'intensity') {
        metricCollection = precipCollection.map(img => img.updateMask(img.gt(1.0)));
        reducer = ee.Reducer.mean();
        title = 'Intensidad Promedio (días > 1mm)';
        chartTitle = 'Intensidad de Lluvia';
        visParams = { min: 2, max: 20, palette: ['yellow', 'orange', 'red', 'purple'] };
        unit = 'mm/día de lluvia';
    } else {
        metricCollection = precipCollection.select('Precipitacion').map(img => img.gt(20).rename('strong_rain_day'));
        reducer = ee.Reducer.sum();
        title = 'Total de Días con Lluvia Fuerte (>20mm)';
        chartTitle = 'Días con Lluvia Fuerte (>20mm)';
        visParams = { min: 0, max: 10, palette: ['lightblue', 'blue', 'navy'] };
        unit = 'días';
    }
    const collectionForChart = aggregateCollection(metricCollection, aggregation, reducer, startDate, endDate).map(img => img.rename('metric'));
    const imageForMap = metricCollection.reduce(reducer).rename('map_result');
    const mapId = await getMapId(imageForMap.clip(eeRoi), visParams);
    const stats = await getStatsForImage(imageForMap, eeRoi, 'map_result', unit, roi.name, "Valor total/promedio");
    const chartData = await getChartData(collectionForChart, eeRoi, 'metric');
    return { mapId, stats, chartData, chartOptions: { title: `${chartTitle} (${aggregation}) para ${roi.name}` } };
}

async function handleTemperatureData({ roi, analysisType, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    const dailyCollection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(eeRoi);
    let resultImage, title, visParams, unit, bandName;
    if (analysisType === 'frost') {
        bandName = 'frost_days';
        title = 'Número de Días de Helada (Tmin <= 0°C)';
        unit = 'días';
        const tMin = dailyCollection.select('minimum_2m_air_temperature').map(img => img.subtract(273.15));
        resultImage = tMin.map(img => img.lte(0)).sum().rename(bandName);
        visParams = { min: 0, max: 5, palette: ['#cae1ff', '#acb6e5', '#7474bf'] };
    } else {
        bandName = 'hot_day_count';
        title = 'Número de Días con Tmax > 38°C';
        unit = 'días';
        const tMax = dailyCollection.select('maximum_2m_air_temperature').map(img => img.subtract(273.15));
        const hotDays = tMax.map(img => img.gt(38));
        resultImage = hotDays.sum().rename(bandName);
        visParams = { min: 0, max: 30, palette: ['#fdd49e', '#fdbb84', '#fc8d59', '#d7301f'] };
    }
    const mapId = await getMapId(resultImage.clip(eeRoi), visParams);
    const stats = await getStatsForImage(resultImage, eeRoi, bandName, unit, roi.name, `Total de ${unit}`);
    return { mapId, stats, chartData: null };
}

async function handleSpiData({ roi, timescale, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    const spiCollection = getSpiCollection(eeRoi, timescale);
    const spiForPeriod = spiCollection.filterDate(startDate, endDate);
    const spiLatestImage = spiForPeriod.sort('system:time_start', false).first();
    const visParams = { min: -2.5, max: 2.5, palette: ['#d73027', '#f46d43', '#fdae61', '#cccccc', '#abd9e9', '#74add1', '#4575b4'] };
    const mapId = await getMapId(spiLatestImage.clip(eeRoi), visParams);
    const chartData = await getOptimizedChartData(spiForPeriod, [roi], 'SPI', startDate, endDate);
    return { mapId, stats: `Mostrando el mapa SPI más reciente para el periodo.`, chartData, chartOptions: { title: `SPI de ${timescale} meses para ${roi.name}` }};
}

async function handleFireRiskData({ roi, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);
    const lstCollection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(eeStartDate, eeEndDate).filterBounds(eeRoi).map(processModis);
    const spiCollection = getSpiCollection(eeRoi, 3).filterDate(eeStartDate, eeEndDate);
    const meanLST = lstCollection.mean(); 
    const meanSPI = spiCollection.mean();
    const inputsPresent = await new Promise((resolve, reject) => {
        ee.Dictionary.fromLists(['lst', 'spi'], [meanLST, meanSPI]).evaluate((dict, err) => {
            if (err) return reject(err);
            resolve(dict.lst != null && dict.spi != null);
        });
    });
    if (!inputsPresent) {
        throw new Error("No hay suficientes datos de LST o SPI en el periodo seleccionado para calcular el riesgo de incendio.");
    }
    const lstRisk = meanLST.select('LST').unitScale(28, 42).clamp(0, 1);
    const spiRisk = meanSPI.select('SPI').multiply(-1).unitScale(0, 1.5).clamp(0, 1);
    const totalRisk = lstRisk.multiply(0.6).add(spiRisk.multiply(0.4));
    const classifiedRisk = ee.Image(0).where(totalRisk.gt(0.20), 1).where(totalRisk.gt(0.45), 2).where(totalRisk.gt(0.70), 3);
    const fireVisParams = { min: 0, max: 3, palette: ['#2ca25f', '#fee08b', '#fdae61', '#d73027'] };
    const mapId = await getMapId(classifiedRisk.clip(eeRoi), fireVisParams);
    return { mapId, stats: `Riesgo de incendio promedio calculado para el periodo seleccionado.` };
}

// =========================================================================================
// === FUNCIONES AUXILIARES (EVALUACIÓN Y FORMATO DE DATOS) ================================
// =========================================================================================

function getMapId(image, visParams) {
    return new Promise((resolve, reject) => {
        image.getMapId(visParams, (mapid, error) => error ? reject(new Error(error)) : resolve(mapid));
    });
}

// REEMPLAZA ESTA FUNCIÓN COMPLETA EN gemini.js
async function getStatsForCollection(collection, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        // Este reductor combina el cálculo de la media, mínimo y máximo en una sola pasada.
        const reducer = ee.Reducer.mean()
            .combine({ reducer2: ee.Reducer.min(), sharedInputs: true })
            .combine({ reducer2: ee.Reducer.max(), sharedInputs: true });

        // reduceRegion se aplica a toda la colección para obtener estadísticas temporales y espaciales a la vez.
        const dict = collection.select(bandName).reduceRegion({
            reducer: reducer,
            geometry: roi,
            scale: 5000, // Una escala mayor es mejor para promedios regionales
            bestEffort: true
        });
        
        dict.evaluate((stats, error) => {
            if (error) {
                return reject(new Error('Error en GEE calculando estadísticas: ' + error));
            }
            // Las claves de salida del reductor combinado son, por ejemplo, 'TAM_mean', 'TAM_min'
            const meanKey = `${bandName}_mean`;
            const minKey = `${bandName}_min`;
            const maxKey = `${bandName}_max`;

            if (!stats || stats[meanKey] == null) {
                return resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
            }
            
            const mean = stats[meanKey].toFixed(2);
            const min = stats[minKey].toFixed(2);
            const max = stats[maxKey].toFixed(2);
            
            resolve(
                `Estadísticas para ${zoneName}:\n` +
                `${prefix}: ${mean} ${unit}\n` +
                `Mínimo: ${min} ${unit}\n` +
                `Máximo: ${max} ${unit}`
            );
        });
    });
}

// EN gemini.js, AGREGA ESTA NUEVA FUNCIÓN
async function getStatsForImage(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 5000, bestEffort: true });
        dict.evaluate((stats, error) => {
            if (error) return reject(new Error('Error calculando estadísticas: ' + error));
            const meanKey = `${bandName}_mean`;
            if (!stats || stats[meanKey] == null) return resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
            resolve(`Estadísticas para ${zoneName}:\n${prefix}: ${stats[meanKey].toFixed(2)} ${unit}\nMínimo: ${stats[`${bandName}_min`].toFixed(2)} ${unit}\nMáximo: ${stats[`${bandName}_max`].toFixed(2)} ${unit}`);
        });
    });
}



async function getOptimizedChartData(collection, rois, bandName, startDate, endDate) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);
    const dateDiffDays = await new Promise((resolve, reject) => {
        eeEndDate.difference(eeStartDate, 'day').evaluate((val, err) => err ? reject(err) : resolve(val));
    });
    if (dateDiffDays > 120) {
        let aggregateUnit = 'week';
        if (dateDiffDays > 730) aggregateUnit = 'month';
        const dateDiff = eeEndDate.difference(eeStartDate, aggregateUnit);
        const dateList = ee.List.sequence(0, dateDiff.subtract(1));
        const imageListWithNulls = dateList.map(offset => {
            const start = eeStartDate.advance(ee.Number(offset), aggregateUnit);
            const end = start.advance(1, aggregateUnit);
            const filtered = collection.filterDate(start, end);
            return ee.Algorithms.If(filtered.size().gt(0), filtered.mean().rename(bandName).set('system:time_start', start.millis()), null);
        });
        collection = ee.ImageCollection.fromImages(imageListWithNulls.removeAll([null]));
    }
    const scale = 5000;
    const fc = ee.FeatureCollection(rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name })));
    return rois.length > 1 ? getChartDataByRegion(collection, fc, bandName, scale) : getChartData(collection, ee.Geometry(rois[0].geom), bandName, scale);
}

async function getChartData(collection, roi, bandName, scale = 2000) {
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({ reducer: ee.Reducer.mean(), geometry: roi, scale: scale, bestEffort: true }).get(bandName);
            return ee.Feature(null, { 'system:time_start': image.get('system:time_start'), 'value': value });
        });
        series.evaluate((fc, error) => {
            if (error) return reject(new Error('Error evaluando datos del gráfico: ' + error));
            const header = [['Fecha', bandName]];
            const rows = fc.features.filter(f => f.properties.value !== null).map(f => [new Date(f.properties['system:time_start']).toISOString(), f.properties.value]).sort((a,b) => new Date(a[0]) - new Date(b[0]));
            resolve(header.concat(rows));
        });
    });
}

async function getChartDataByRegion(collection, fc, bandName, scale = 2000) {
    return new Promise((resolve, reject) => {
        fc.aggregate_array('label').evaluate((labels, error) => {
             if (error) return reject(new Error('Error obteniendo etiquetas de región: ' + error));
             const header = [['Fecha', ...labels]];
             const timeSeries = collection.map(image => {
                 const time = image.get('system:time_start');
                 const means = image.reduceRegions({ collection: fc, reducer: ee.Reducer.mean(), scale: scale });
                 const values = labels.map(label => {
                     const feature = means.filter(ee.Filter.eq('label', label)).first();
                     return ee.Feature(feature).get('mean');
                 });
                 return ee.Feature(null, {'system:time_start': time}).set('means', values);
             });
             timeSeries.evaluate((fc, error) => {
                 if (error) return reject(new Error('Error evaluando datos de comparación: ' + error));
                 const rows = fc.features.map(f => [new Date(f.properties['system:time_start']).toISOString(), ...f.properties.means]).sort((a,b) => new Date(a[0]) - new Date(b[0]));
                 resolve(header.concat(rows));
             });
        });
    });
}


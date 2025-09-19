const ee = require('@google/earthengine');
const ui = require('users/aazuspan/geeSharp:ui.js');

// =========================================================================================
// === HELPERS Y FUNCIONES DE PROCESAMIENTO DE GEE (traídas del script original) ==========
// =========================================================================================

function processEra5(image) {
    var temp = image.select('temperature_2m').subtract(273.15).rename('TAM');
    var Td = image.select('dewpoint_temperature_2m').subtract(273.15);
    var rh = Td.expression('(exp((17.625 * Td)/(243.04 + Td)) / exp((17.625 * T)/(243.04 + T))) * 100', {T: temp, Td: Td}).rename('HR');
    var solar = image.select('surface_solar_radiation_downwards').divide(3600).rename('Radiacion_Solar');
    var u = image.select('u_component_of_wind_10m');
    var v = image.select('v_component_of_wind_10m');
    var speed = u.hypot(v).rename('wind_speed');
    return temp.addBands([rh, solar, speed, u, v]).copyProperties(image, ['system:time_start']);
}
function processModis(image) {
    return image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST').copyProperties(image, ['system:time_start']);
}
function processChirps(image) {
    return image.select('precipitation').rename('Precipitacion').copyProperties(image, ['system:time_start']);
}
function processET(image) {
    var scaleFactor = 0.1;
    var et = image.select('ET').multiply(scaleFactor).rename('ET');
    var pet = image.select('PET').multiply(scaleFactor).rename('PET');
    return et.addBands(pet).copyProperties(image, ['system:time_start']);
}
function processGDD(image) {
    var tMin = image.select('minimum_2m_air_temperature').subtract(273.15);
    var tMax = image.select('maximum_2m_air_temperature').subtract(273.15);
    var tBase = 10.0;
    var gdd = tMin.add(tMax).divide(2).subtract(tBase).max(0).rename('GDD');
    return gdd.copyProperties(image, ['system:time_start']);
}

function getSpiCollection(roi, timescale) {
    var referenceStart = ee.Date('1994-01-01');
    var referenceEnd = ee.Date('2025-07-01');
    var monthlyPrecip = ee.ImageCollection.fromImages(
        ee.List.sequence(0, referenceEnd.difference(referenceStart, 'month').subtract(1)).map(function(m) {
            var start = referenceStart.advance(m, 'month');
            var end = start.advance(1, 'month');
            var total = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(start, end).filterBounds(roi).sum().select('precipitation');
            return total.set('system:time_start', start.millis(), 'month', start.get('month'));
        })
    );
    var dates = ee.List.sequence(0, referenceEnd.difference(referenceStart, 'month').subtract(timescale));
    var movingWindowSums = ee.ImageCollection.fromImages(
        dates.map(function(m) {
            var windowStart = referenceStart.advance(m, 'month');
            var windowEnd = windowStart.advance(timescale, 'month');
            var collectionInWindow = monthlyPrecip.filterDate(windowStart, windowEnd);
            var windowSum = collectionInWindow.sum().rename('precip_sum');
            return windowSum.set('system:time_start', windowEnd.millis(), 'month', windowEnd.get('month'));
        })
    );
    var monthlyStats = ee.ImageCollection.fromImages(
        ee.List.sequence(1, 12).map(function(m) {
            var sumsForMonth = movingWindowSums.filter(ee.Filter.eq('month', m));
            var mean = sumsForMonth.mean();
            var stdDev = sumsForMonth.reduce(ee.Reducer.stdDev());
            var stdDevSafe = stdDev.where(stdDev.eq(0), 1);
            return mean.addBands(stdDevSafe).set('month', m);
        })
    );
    var spiCollection = movingWindowSums.map(function(image) {
        var month = image.get('month');
        var statsForMonth = monthlyStats.filter(ee.Filter.eq('month', month)).first();
        var mean = statsForMonth.select('precip_sum');
        var stdDev = statsForMonth.select('precip_sum_stdDev');
        var spi = image.subtract(mean).divide(stdDev).rename('SPI');
        return spi.copyProperties(image, image.propertyNames());
    });
    return spiCollection;
}

// =========================================================================================
// === MANEJADOR PRINCIPAL DE LA API (SERVERLESS FUNCTION) =================================
// =========================================================================================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        // --- Autenticación y Arranque de GEE ---
        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey(
                {
                    client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL,
                    private_key: process.env.EE_PRIVATE_KEY,
                },
                () => ee.initialize(null, null, resolve, reject),
                (err) => {
                    console.error('ERROR DE AUTENTICACIÓN:', err);
                    reject(new Error('La autenticación con Google Earth Engine falló. Revisa las credenciales en Vercel.'));
                }
            );
        });

        const { action, params } = req.body;
        if (!action || !params) {
            throw new Error('Solicitud incorrecta: Falta "action" o "params" en el cuerpo de la solicitud.');
        }

        let responseData;

        // --- ENRUTADOR DE ACCIONES ---
        switch (action) {
            case 'getGeneralData':
                responseData = await handleGeneralData(params);
                break;
            case 'getCompareData':
                 responseData = await handleCompareData(params);
                break;
            case 'getPrecipitationData':
                responseData = await handlePrecipitationData(params);
                break;
            case 'getTemperatureData':
                responseData = await handleTemperatureData(params);
                break;
            case 'getSpiData':
                responseData = await handleSpiData(params);
                break;
            case 'getFireRiskData':
                responseData = await handleFireRiskData(params);
                break;
            default:
                throw new Error(`Action '${action}' not recognized.`);
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('--- ERROR DETALLADO DEL SERVIDOR GEE ---');
        console.error('Mensaje de Error:', error.message);
        console.error('Pila de Error:', error.stack);
        console.error('Objeto de Error Completo:', JSON.stringify(error));
        console.error('--- FIN DEL INFORME DE ERROR ---');
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}

// =========================================================================================
// === MANEJADORES DE ACCIONES ESPECÍFICAS ================================================
// =========================================================================================

async function handleGeneralData(params) {
    const { roi, varInfo, startDate, endDate } = params;
    const eeRoi = ee.Geometry(roi.geom);
    
    let collection;
    if (varInfo.dataset === 'ERA5') collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').filterDate(startDate, endDate).filterBounds(eeRoi).map(processEra5);
    else if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(eeRoi).map(processModis);
    else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(eeRoi).map(processET);
    else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(eeRoi).map(processGDD);

    const imageForMap = collection.select(varInfo.bandName).mean();
    const mapId = await getMapId(imageForMap.clip(eeRoi), { min: varInfo.min, max: varInfo.max, palette: varInfo.palette });
    
    const stats = await getStats(imageForMap, eeRoi, varInfo.bandName, varInfo.unit, roi.name);
    const chartData = await getChartData(collection.select(varInfo.bandName), eeRoi, varInfo.bandName);

    return { mapId, stats, chartData, chartOptions: { title: `Serie Temporal para ${roi.name}` } };
}

async function handleCompareData(params) {
    const { rois, varInfo, startDate, endDate } = params;
    const features = rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name }));
    const fc = ee.FeatureCollection(features);

    let collection;
    if (varInfo.dataset === 'ERA5') collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processEra5);
    else if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processModis);
    else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processET);
    else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processGDD);
    
    const chartData = await getChartDataByRegion(collection.select(varInfo.bandName), fc);
    
    return { 
        stats: `Comparando ${rois.length} zonas. Ver el gráfico para los resultados.`,
        chartData, 
        chartOptions: { title: `Comparación de ${varInfo.bandName} entre zonas` }
    };
}


async function handlePrecipitationData(params) {
    const { roi, analysisType, startDate, endDate } = params;
    const eeRoi = ee.Geometry(roi.geom);
    
    const precipCollection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(startDate, endDate).filterBounds(eeRoi).map(processChirps);

    let metricCollection, reducerForAggregation, title, visParams, unit;

    if (analysisType === 'accumulated') {
        metricCollection = precipCollection;
        reducerForAggregation = ee.Reducer.sum();
        title = 'Precipitación Total Acumulada';
        visParams = { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'] };
        unit = 'mm';
    } else if (analysisType === 'intensity') {
        metricCollection = precipCollection.map(img => img.updateMask(img.gt(1.0)));
        reducerForAggregation = ee.Reducer.mean();
        title = 'Intensidad Promedio (días > 1mm)';
        visParams = { min: 2, max: 20, palette: ['yellow', 'orange', 'red', 'purple'] };
        unit = 'mm/día de lluvia';
    } else { // frequency
        metricCollection = precipCollection.map(img => img.gt(20));
        reducerForAggregation = ee.Reducer.sum();
        title = 'Total de Días con Lluvia Fuerte';
        visParams = { min: 0, max: 10, palette: ['lightblue', 'blue', 'navy'] };
        unit = 'días';
    }

    const imageForMap = metricCollection.reduce(reducerForAggregation);
    const mapId = await getMapId(imageForMap.clip(eeRoi), visParams);
    const stats = await getStats(imageForMap, eeRoi, imageForMap.bandNames().get(0), unit, roi.name, "Valor promedio");
    
    return { mapId, stats, chartData: null };
}

async function handleTemperatureData(params) {
    const { roi, analysisType, startDate, endDate } = params;
    const eeRoi = ee.Geometry(roi.geom);
    
    const dailyCollection = ee.ImageCollection("ECMWF/ERA5/DAILY")
        .filterDate(startDate, endDate).filterBounds(eeRoi);

    let resultImage, title, visParams, unit;

    if (analysisType === 'frost') {
        title = 'Número de Días de Helada (Tmin <= 0°C)';
        unit = 'días';
        const tMin = dailyCollection.select('minimum_2m_air_temperature').map(img => img.subtract(273.15));
        resultImage = tMin.map(img => img.lte(0)).sum();
        visParams = { min: 0, max: 5, palette: ['#cae1ff', '#acb6e5', '#7474bf'] };
    } else { // heatwave
        title = 'Número de Olas de Calor (>=3 días >38°C)';
        unit = 'eventos';
        const tMax = dailyCollection.select('maximum_2m_air_temperature').map(img => img.subtract(273.15));
        const hotDays = tMax.map(img => img.gt(38).rename('hot_day').copyProperties(img, ['system:time_start']));
        const timeFilter = ee.Filter.maxDifference({ difference: 3 * 24 * 60 * 60 * 1000, leftField: 'system:time_start', rightField: 'system:time_start' });
        const join = ee.Join.saveAll({ matchesKey: 'neighborhood' });
        const joinedCollection = join.apply(hotDays, hotDays, timeFilter);
        const heatwaveEvents = joinedCollection.map(img => {
            const neighborhood = ee.ImageCollection.fromImages(img.get('neighborhood'));
            return neighborhood.sum().eq(3).rename('heatwave_event');
        });
        resultImage = ee.ImageCollection(heatwaveEvents).sum();
        visParams = { min: 0, max: 3, palette: ['#fdd49e', '#fdbb84', '#fc8d59', '#d7301f'] };
    }
    
    const mapId = await getMapId(resultImage.clip(eeRoi), visParams);
    const stats = await getStats(resultImage, eeRoi, resultImage.bandNames().get(0), unit, roi.name, `Total de ${unit}`);

    return { mapId, stats, chartData: null };
}

async function handleSpiData(params) {
    const { roi, timescale, startDate, endDate } = params;
    const eeRoi = ee.Geometry(roi.geom);
    const spiCollection = getSpiCollection(eeRoi, timescale);
    const spiForPeriod = spiCollection.filterDate(startDate, endDate);
    
    const spiLatestImage = spiForPeriod.sort('system:time_start', false).first();
    const visParams = { min: -2.5, max: 2.5, palette: ['#d73027', '#f46d43', '#fdae61', '#cccccc', '#abd9e9', '#74add1', '#4575b4'] };
    const mapId = await getMapId(spiLatestImage.clip(eeRoi), visParams);
    
    const chartData = await getChartData(spiForPeriod, eeRoi, 'SPI', true);

    return { mapId, stats: `Mostrando el mapa SPI más reciente para el periodo.`, chartData, chartOptions: { title: `SPI de ${timescale} meses para ${roi.name}` }};
}

async function handleFireRiskData(params) {
    const { roi, endDate } = params;
    const eeRoi = ee.Geometry(roi.geom);
    const eeEndDate = ee.Date(endDate);

    const lstCollection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(eeEndDate.advance(-30, 'day'), eeEndDate).filterBounds(eeRoi).map(processModis);
    const spiCollection = getSpiCollection(eeRoi, 3).filterDate(eeEndDate.advance(-45, 'day'), eeEndDate);

    const latestLST = ee.Image(lstCollection.sort('system:time_start', false).first());
    const latestSPI = ee.Image(spiCollection.sort('system:time_start', false).first());

    const lstRisk = latestLST.select('LST').unitScale(30, 45).clamp(0, 1);
    const spiRisk = latestSPI.select('SPI').multiply(-1).unitScale(0, 1.5).clamp(0, 1);
    const totalRisk = lstRisk.multiply(0.6).add(spiRisk.multiply(0.4));
    
    const classifiedRisk = ee.Image(0).where(totalRisk.gt(0.25), 1).where(totalRisk.gt(0.50), 2).where(totalRisk.gt(0.75), 3);
    const fireVisParams = { min: 0, max: 3, palette: ['#2ca25f', '#fee08b', '#fdae61', '#d73027'] };

    const mapId = await getMapId(classifiedRisk.clip(eeRoi), fireVisParams);
    
    return { mapId, stats: 'Riesgo calculado para la fecha más reciente usando LST (últimos 30 días) y SPI (3 meses).' };
}


// =========================================================================================
// === FUNCIONES AUXILIARES PARA OBTENER DATOS DE GEE ======================================
// =========================================================================================

function getMapId(image, visParams) {
    return new Promise((resolve, reject) => {
        image.getMapId(visParams, (mapid, error) => {
            if (error) reject(error);
            else resolve(mapid);
        });
    });
}

async function getStats(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        bandName = ee.String(bandName);
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 1000, bestEffort: true });
        
        const meanKey = bandName.cat('_mean');
        const minKey = bandName.cat('_min');
        const maxKey = bandName.cat('_max');

        ee.Dictionary(dict).evaluate((stats, error) => {
            if (error) {
                reject(new Error('Error calculating stats: ' + error));
            } else if (!stats || stats[meanKey.getInfo()] === null || stats[meanKey.getInfo()] === undefined) {
                resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
            } else {
                const mean = stats[meanKey.getInfo()].toFixed(2);
                const min = stats[minKey.getInfo()].toFixed(2);
                const max = stats[maxKey.getInfo()].toFixed(2);
                resolve(
                    `Estadísticas para ${zoneName}:\n` +
                    `${prefix}: ${mean} ${unit}\n` +
                    `Mínimo: ${min} ${unit}\n` +
                    `Máximo: ${max} ${unit}`
                );
            }
        });
    });
}

async function getChartData(collection, roi, bandName, isSpi = false) {
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: roi,
                scale: 1000,
                bestEffort: true
            }).get(isSpi ? 'SPI' : bandName);
            return ee.Feature(null, { 'system:time_start': image.get('system:time_start'), 'value': value });
        });

        series.evaluate((fc, error) => {
            if (error) {
                reject(new Error('Error evaluating chart data: ' + error));
            } else {
                const header = [['Fecha', isSpi ? 'SPI' : bandName]];
                const rows = fc.features.map(f => {
                    const date = new Date(f.properties['system:time_start']);
                    const value = f.properties.value;
                    return [date, value === null ? 0 : value];
                }).sort((a,b) => a[0] - b[0]);
                resolve(header.concat(rows));
            }
        });
    });
}

async function getChartDataByRegion(collection, fc) {
    return new Promise((resolve, reject) => {
        const chartData = ui.Chart.image.seriesByRegion({
            imageCollection: collection,
            regions: fc,
            reducer: ee.Reducer.mean(),
            scale: 1000,
            seriesProperty: 'label'
        });

        chartData.getDataTable((dataTable, error) => {
            if (error) {
                reject(new Error('Error getting multi-series chart data: ' + error));
            } else {
                const header = dataTable.cols.map(c => c.label || c.id);
                const rows = dataTable.rows.map(r => {
                    // La primera celda es una fecha, las demás son números
                    const dateCell = new Date(r.c[0].v);
                    const valueCells = r.c.slice(1).map(cell => cell ? cell.v : null);
                    return [dateCell, ...valueCells];
                });
                resolve([header, ...rows]);
            }
        });
    });
}


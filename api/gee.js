const ee = require('@google/earthengine');

// =========================================================================================
// === HELPERS Y FUNCIONES DE PROCESAMIENTO DE GEE (traídas del script original) ==========
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
    const referenceEnd = ee.Date('2025-07-01'); // A future date to ensure we have current data
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
    return ee.ImageCollection.fromImages(imageListWithNulls.removeAll([null]));
}


// =========================================================================================
// === MANEJADOR PRINCIPAL DE LA API (SERVERLESS FUNCTION) =================================
// =========================================================================================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
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
        switch (action) {
            case 'getGeneralData': responseData = await handleGeneralData(params); break;
            case 'getCompareData': responseData = await handleCompareData(params); break;
            case 'getPrecipitationData': responseData = await handlePrecipitationData(params); break;
            case 'getTemperatureData': responseData = await handleTemperatureData(params); break;
            case 'getSpiData': responseData = await handleSpiData(params); break;
            case 'getFireRiskData': responseData = await handleFireRiskData(params); break;
            default: throw new Error(`Action '${action}' not recognized.`);
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('--- ERROR DETALLADO DEL SERVIDOR GEE ---');
        console.error('Mensaje de Error:', error.message);
        console.error('--- FIN DEL INFORME DE ERROR ---');
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}

// =========================================================================================
// === MANEJADORES DE ACCIONES ESPECÍFICAS ================================================
// =========================================================================================

async function handleGeneralData({ roi, varInfo, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    let collection;
    if (varInfo.dataset === 'ERA5') collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').filterDate(startDate, endDate).filterBounds(eeRoi).map(processEra5);
    else if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(eeRoi).map(processModis);
    else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(eeRoi).map(processET);
    else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(eeRoi).map(processGDD);
    else if (varInfo.dataset === 'CHIRPS') collection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(startDate,endDate).filterBounds(eeRoi).map(processChirps);

    const imageForMap = collection.select(varInfo.bandName).mean();
    const mapId = await getMapId(imageForMap.clip(eeRoi), { min: varInfo.min, max: varInfo.max, palette: varInfo.palette });
    
    const stats = await getStats(imageForMap, eeRoi, varInfo.bandName, varInfo.unit, roi.name);
    const chartData = await getChartData(collection.select(varInfo.bandName), eeRoi, varInfo.bandName);

    return { mapId, stats, chartData, chartOptions: { title: `Serie Temporal para ${roi.name}` } };
}

async function handleCompareData({ rois, varInfo, startDate, endDate }) {
    const features = rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name }));
    const fc = ee.FeatureCollection(features);

    let collection;
    if (varInfo.dataset === 'ERA5') collection = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY').filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processEra5);
    else if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processModis);
    else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processET);
    else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(fc.geometry()).map(processGDD);
    else if (varInfo.dataset === 'CHIRPS') collection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(startDate,endDate).filterBounds(fc.geometry()).map(processChirps);

    const chartData = await getChartDataByRegion(collection.select(varInfo.bandName), fc, varInfo.bandName);
    
    return { 
        stats: `Comparando ${rois.length} zonas. Ver el gráfico para los resultados.`,
        chartData, 
        chartOptions: { title: `Comparación de ${varInfo.bandName} entre zonas` }
    };
}


async function handlePrecipitationData({ roi, analysisType, aggregation, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    
    const precipCollection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(startDate, endDate).filterBounds(eeRoi).map(processChirps);

    let metricCollection, reducer, title, visParams, unit, chartTitle, bandName, chartBandName;

    if (analysisType === 'accumulated') {
        bandName = 'Precipitacion';
        metricCollection = precipCollection;
        reducer = ee.Reducer.sum();
        title = 'Precipitación Total Acumulada';
        chartTitle = 'Precipitación Acumulada';
        visParams = { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'] };
        unit = 'mm';
        chartBandName = 'metric';
    } else if (analysisType === 'intensity') {
        bandName = 'Precipitacion';
        metricCollection = precipCollection.map(img => img.updateMask(img.gt(1.0)));
        reducer = ee.Reducer.mean();
        title = 'Intensidad Promedio (días > 1mm)';
        chartTitle = 'Intensidad de Lluvia';
        visParams = { min: 2, max: 20, palette: ['yellow', 'orange', 'red', 'purple'] };
        unit = 'mm/día de lluvia';
        chartBandName = 'metric';
    } else { // frequency
        bandName = 'strong_rain_day';
        metricCollection = precipCollection.select('Precipitacion').map(img => img.gt(20).rename(bandName));
        reducer = ee.Reducer.sum();
        title = 'Total de Días con Lluvia Fuerte (>20mm)';
        chartTitle = 'Días con Lluvia Fuerte (>20mm)';
        visParams = { min: 0, max: 10, palette: ['lightblue', 'blue', 'navy'] };
        unit = 'días';
        chartBandName = 'chart_metric';
    }
    
    const collectionForChart = aggregateCollection(metricCollection, aggregation, reducer)
      .map(img => img.rename(chartBandName));

    const imageForMap = metricCollection.reduce(reducer).rename('map_result');
    const mapId = await getMapId(imageForMap.clip(eeRoi), visParams);
    const stats = await getStats(imageForMap, eeRoi, 'map_result', unit, roi.name, "Valor total/promedio");
    const chartData = await getChartData(collectionForChart, eeRoi, chartBandName);

    return { mapId, stats, chartData, chartOptions: { title: `${chartTitle} (${aggregation}) para ${roi.name}` } };
}

async function handleTemperatureData({ roi, analysisType, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    
    const dailyCollection = ee.ImageCollection("ECMWF/ERA5/DAILY")
        .filterDate(startDate, endDate).filterBounds(eeRoi);

    let resultImage, title, visParams, unit, bandName;

    if (analysisType === 'frost') {
        bandName = 'frost_days';
        title = 'Número de Días de Helada (Tmin <= 0°C)';
        unit = 'días';
        const tMin = dailyCollection.select('minimum_2m_air_temperature').map(img => img.subtract(273.15));
        resultImage = tMin.map(img => img.lte(0)).sum().rename(bandName);
        visParams = { min: 0, max: 5, palette: ['#cae1ff', '#acb6e5', '#7474bf'] };
    } else { // heatwave
        bandName = 'hot_day_count';
        title = 'Número de Días con Tmax > 38°C';
        unit = 'días';
        const tMax = dailyCollection.select('maximum_2m_air_temperature').map(img => img.subtract(273.15));
        const hotDays = tMax.map(img => img.gt(38));
        resultImage = hotDays.sum().rename(bandName);
        visParams = { min: 0, max: 30, palette: ['#fdd49e', '#fdbb84', '#fc8d59', '#d7301f'] };
    }
    
    const mapId = await getMapId(resultImage.clip(eeRoi), visParams);
    const stats = await getStats(resultImage, eeRoi, bandName, unit, roi.name, `Total de ${unit}`);

    return { mapId, stats, chartData: null };
}

async function handleSpiData({ roi, timescale, startDate, endDate }) {
    const eeRoi = ee.Geometry(roi.geom);
    const spiCollection = getSpiCollection(eeRoi, timescale);
    const spiForPeriod = spiCollection.filterDate(startDate, endDate);
    
    const spiLatestImage = spiForPeriod.sort('system:time_start', false).first();
    const visParams = { min: -2.5, max: 2.5, palette: ['#d73027', '#f46d43', '#fdae61', '#cccccc', '#abd9e9', '#74add1', '#4575b4'] };
    const mapId = await getMapId(spiLatestImage.clip(eeRoi), visParams);
    
    const chartData = await getChartData(spiForPeriod, eeRoi, 'SPI');

    return { mapId, stats: `Mostrando el mapa SPI más reciente para el periodo.`, chartData, chartOptions: { title: `SPI de ${timescale} meses para ${roi.name}` }};
}

async function handleFireRiskData({ roi, endDate }) {
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
            if (error) reject(new Error(error));
            else resolve(mapid);
        });
    });
}

async function getStats(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 1000, bestEffort: true });
        
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

async function getChartData(collection, roi, bandName) {
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: roi,
                scale: 1000,
                bestEffort: true
            }).get(bandName);
            return ee.Feature(null, { 'system:time_start': image.get('system:time_start'), 'value': value });
        });

        series.evaluate((fc, error) => {
            if (error) reject(new Error('Error evaluando datos del gráfico: ' + error));
            else {
                const header = [['Fecha', bandName]];
                const rows = fc.features
                    .map(f => [new Date(f.properties['system:time_start']), f.properties.value])
                    .sort((a,b) => a[0] - b[0]);
                resolve(header.concat(rows));
            }
        });
    });
}

async function getChartDataByRegion(collection, fc, bandName) {
    return new Promise((resolve, reject) => {
        fc.aggregate_array('label').evaluate((labels, error) => {
             if (error) reject(new Error('Error obteniendo etiquetas de región: ' + error));
             else {
                const header = [['Fecha', ...labels]];
        
                const timeSeries = collection.map(image => {
                    const time = image.get('system:time_start');
                    const means = image.reduceRegions({
                        collection: fc,
                        reducer: ee.Reducer.mean(),
                        scale: 1000
                    });
                    const values = labels.map(label => {
                        const feature = means.filter(ee.Filter.eq('label', label)).first();
                        return ee.Feature(feature).get(bandName);
                    });
                    return ee.Feature(null, {'system:time_start': time}).set('means', values);
                });
                
                timeSeries.evaluate((fc, error) => {
                    if (error) reject(new Error('Error evaluando datos de comparación: ' + error));
                    else {
                        const rows = fc.features.map(f => {
                            return [new Date(f.properties['system:time_start']), ...f.properties.means];
                        }).sort((a,b) => a[0] - b[0]);
                        resolve(header.concat(rows));
                    }
                });
            }
        });
    });
}


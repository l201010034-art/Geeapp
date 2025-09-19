// Import the Earth Engine library.
const ee = require('@google/earthengine');

// NOTE: This endpoint is designed for Vercel's serverless environment.
// It initializes the GEE API using credentials stored as environment variables.
// See README.md for setup instructions.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // Step 1: Initialize GEE
        const serviceAccount = process.env.EE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.EE_PRIVATE_KEY.replace(/\\n/g, '\n');

        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey(
                { client_email: serviceAccount, private_key: privateKey },
                () => ee.initialize(null, null, resolve, reject),
                (err) => reject(new Error(`GEE Authentication Error: ${err}`))
            );
        });

        // Step 2: Route the request to the correct function
        const { action, ...params } = req.body;
        let result;

        switch (action) {
            case 'getGeneralData':
                result = await getGeneralData(params);
                break;
            case 'getComparisonData':
                result = await getComparisonData(params);
                break;
            case 'getPrecipitationAnalysis':
                result = await getPrecipitationAnalysis(params);
                break;
            case 'getTemperatureAnalysis':
                result = await getTemperatureAnalysis(params);
                break;
            case 'getSpiAnalysis':
                result = await getSpiAnalysis(params);
                break;
            case 'getFireRiskAnalysis':
                result = await getFireRiskAnalysis(params);
                break;
            default:
                throw new Error('Invalid action specified.');
        }

        res.status(200).json(result);
    } catch (error) {
        console.error('GEE Server Error:', error);
        res.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}

// =========================================================================================
// === GEE DATA PROCESSING FUNCTIONS (Replicated from original script)
// =========================================================================================

// --- Helper Functions ---
function processEra5(image) {
    const temp = image.select('temperature_2m').subtract(273.15).rename('TAM');
    const Td = image.select('dewpoint_temperature_2m').subtract(273.15);
    const rh = ee.Image().expression('(exp((17.625 * Td)/(243.04 + Td)) / exp((17.625 * T)/(243.04 + T))) * 100', {T: temp, Td: Td}).rename('HR');
    const solar = image.select('surface_solar_radiation_downwards').divide(3600).rename('Radiacion_Solar');
    const u = image.select('u_component_of_wind_10m');
    const v = image.select('v_component_of_wind_10m');
    const speed = u.hypot(v).rename('wind_speed');
    return temp.addBands([rh, solar, speed]).copyProperties(image, ['system:time_start']);
}
function processModisLST(image) {
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

// --- Data Fetching Logic ---
function getCollection(variable, startDate, endDate, region) {
    let collection, processor;
    const varMap = {
        'TAM': {id: 'ECMWF/ERA5_LAND/HOURLY', processor: processEra5},
        'HR': {id: 'ECMWF/ERA5_LAND/HOURLY', processor: processEra5},
        'Radiacion_Solar': {id: 'ECMWF/ERA5_LAND/HOURLY', processor: processEra5},
        'wind_speed': {id: 'ECMWF/ERA5_LAND/HOURLY', processor: processEra5},
        'LST': {id: 'MODIS/061/MOD11A1', processor: processModisLST},
        'Precipitacion': {id: 'UCSB-CHG/CHIRPS/DAILY', processor: processChirps},
        'ET': {id: 'MODIS/006/MOD16A2', processor: processET},
        'PET': {id: 'MODIS/006/MOD16A2', processor: processET},
        'GDD': {id: 'ECMWF/ERA5/DAILY', processor: processGDD}
    };
    
    const info = varMap[variable];
    if (!info) throw new Error(`Variable '${variable}' no reconocida.`);

    collection = ee.ImageCollection(info.id).filterDate(startDate, endDate).filterBounds(region);
    return collection.map(info.processor).select(variable);
}

// --- Promisified GEE Functions ---
function getMapId(image, visParams) {
    return new Promise((resolve, reject) => {
        image.getMapId(visParams, (mapid, err) => {
            if (err) return reject(err);
            resolve(mapid);
        });
    });
}

function evaluate(eeObject) {
    return new Promise((resolve, reject) => {
        eeObject.evaluate((result, err) => {
            if (err) return reject(err);
            resolve(result);
        });
    });
}

// --- Chart Data Formatting ---
function formatChartData(timeSeries) {
    if (!timeSeries || !timeSeries.features) return [];
    return timeSeries.features
        .map(f => ({
            x: f.properties['system:time_start'],
            y: f.properties.mean
        }))
        .filter(d => d.y !== null);
}

// =========================================================================================
// === API ENDPOINT LOGIC
// =========================================================================================

async function getGeneralData({ variable, startDate, endDate, region }) {
    const geometry = ee.Geometry(region);
    const collection = getCollection(variable, startDate, endDate, geometry);

    const imageForMap = collection.mean();
    const visParams = await getVisParams(variable);
    
    const mapId = await getMapId(imageForMap.clip(geometry), visParams);

    const timeSeries = await evaluate(collection.map(img => {
        const mean = img.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geometry,
            scale: 1000,
            bestEffort: true
        });
        return ee.Feature(null, {'mean': mean.get(variable)}).copyProperties(img, ['system:time_start']);
    }));

    const stats = await evaluate(imageForMap.reduceRegion({
        reducer: ee.Reducer.mean().combine(ee.Reducer.minMax(), null, true),
        geometry: geometry,
        scale: 1000,
        bestEffort: true
    }));

    return {
        tileUrl: `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`,
        chartData: formatChartData(timeSeries),
        stats: {
            mean: stats[variable + '_mean'],
            min: stats[variable + '_min'],
            max: stats[variable + '_max']
        }
    };
}

async function getComparisonData({ variable, startDate, endDate, regions }) {
    const features = ee.FeatureCollection(regions.map(r => ee.Feature(ee.Geometry(r.geom), {label: r.name})));
    const collection = getCollection(variable, startDate, endDate, features.geometry());
    
    // ui.Chart.image.seriesByRegion is not directly available in Node API. We replicate it.
    const timeSeries = await evaluate(features.map(feature => {
        const series = collection.map(img => {
            const mean = img.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: feature.geometry(),
                scale: 1000,
                bestEffort: true
            });
            return ee.Feature(null, {'mean': mean.get(variable)})
                   .copyProperties(img, ['system:time_start']);
        });
        return ee.Feature(null, {
            'label': feature.get('label'), 
            'series': series
        });
    }));
    
    const chartData = timeSeries.features.map(f => ({
        name: f.properties.label,
        data: formatChartData({features: f.properties.series.features})
    }));

    return { chartData };
}

async function getPrecipitationAnalysis({ analysisType, aggregation, startDate, endDate, region }) {
    const geometry = ee.Geometry(region);
    const precipCollection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(startDate, endDate).filterBounds(geometry).map(processChirps);

    let metricCollection, reducer, title, visParams, unit;

    if (analysisType === 'accumulated') {
        metricCollection = precipCollection;
        reducer = ee.Reducer.sum();
        title = 'Precipitación Acumulada';
        visParams = { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'] };
        unit = 'mm';
    } else if (analysisType === 'intensity') {
        metricCollection = precipCollection.map(img => img.updateMask(img.gt(1.0)));
        reducer = ee.Reducer.mean();
        title = 'Intensidad de Lluvia';
        visParams = { min: 2, max: 20, palette: ['yellow', 'orange', 'red', 'purple'] };
        unit = 'mm/día de lluvia';
    } else { // frequency
        metricCollection = precipCollection.map(img => img.gt(20));
        reducer = ee.Reducer.sum();
        title = 'Días con Lluvia Fuerte (>20mm)';
        visParams = { min: 0, max: 10, palette: ['lightblue', 'blue', 'navy'] };
        unit = 'días';
    }

    // This logic replaces aggregateCollection for server-side processing
    const diffUnit = aggregation === 'day' ? 'day' : (aggregation === 'week' ? 'week' : (aggregation === 'month' ? 'month' : 'year'));
    const dateDiff = ee.Date(endDate).difference(ee.Date(startDate), diffUnit);
    const dateList = ee.List.sequence(0, dateDiff.subtract(1));
    const imageList = dateList.map(offset => {
        const start = ee.Date(startDate).advance(ee.Number(offset), diffUnit);
        const end = start.advance(1, diffUnit);
        const filtered = metricCollection.filterDate(start, end);
        return filtered.reduce(reducer).set('system:time_start', start.millis());
    });
    const collectionForChart = ee.ImageCollection.fromImages(imageList);
    
    const timeSeries = await evaluate(collectionForChart.select(0).map(img => {
        const mean = img.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: geometry,
            scale: 5000,
            bestEffort: true
        });
        return ee.Feature(null, {'mean': mean.get('precipitation')}).copyProperties(img, ['system:time_start']);
    }));

    const imageForMap = metricCollection.reduce(reducer);
    const mapId = await getMapId(imageForMap.clip(geometry), visParams);
    
    const stats = await evaluate(imageForMap.reduceRegion({
        reducer: ee.Reducer.mean(), geometry: geometry, scale: 5000, bestEffort: true
    }));

    return {
        tileUrl: `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`,
        chartData: formatChartData(timeSeries),
        stats: { mean: stats[Object.keys(stats)[0]] },
        title,
        unit
    };
}

async function getTemperatureAnalysis({ analysisType, startDate, endDate, region }) {
    const geometry = ee.Geometry(region);
    const dailyCollection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(geometry);
    
    let resultImage, title, visParams, unit, bandName;

    if (analysisType === 'frost') {
        title = 'Número de Días de Helada (Tmin <= 0°C)';
        unit = 'días';
        bandName = 'frost_days';
        const tMin = dailyCollection.select('minimum_2m_air_temperature').map(img => img.subtract(273.15));
        resultImage = tMin.map(img => img.lte(0)).sum().rename(bandName);
        visParams = {min: 0, max: 5, palette: ['#cae1ff', '#acb6e5', '#7474bf']};
    } else { // heatwave
        title = 'Número de Olas de Calor (>=3 días >38°C)';
        unit = 'eventos';
        bandName = 'heatwave_count';
        // This is a simplified heatwave logic for server-side performance.
        const tMax = dailyCollection.select('maximum_2m_air_temperature').map(img => img.subtract(273.15));
        const hotDays = tMax.map(img => img.gt(38));
        resultImage = hotDays.sum().divide(3).floor().rename(bandName); // Simplified: count events of 3
        visParams = {min: 0, max: 3, palette: ['#fdd49e', '#fdbb84', '#fc8d59', '#d7301f']};
    }

    const mapId = await getMapId(resultImage.clip(geometry), visParams);
    const stats = await evaluate(resultImage.reduceRegion({
        reducer: ee.Reducer.mean(), geometry: geometry, scale: 5000, bestEffort: true
    }));

    return {
        tileUrl: `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`,
        stats: { mean: stats[bandName] },
        title,
        unit
    };
}

async function getSpiAnalysis({ timescale, startDate, endDate, region }) {
    const geometry = ee.Geometry(region);
    // getSpiCollection is complex, we need to replicate its logic here.
    const referenceStart = ee.Date('1994-01-01');
    const referenceEnd = ee.Date('2025-07-01');
    const monthlyPrecip = ee.ImageCollection.fromImages(
      ee.List.sequence(0, referenceEnd.difference(referenceStart, 'month').subtract(1)).map(function(m) {
        const start = referenceStart.advance(m, 'month');
        const end = start.advance(1, 'month');
        const total = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(start, end).filterBounds(geometry).sum().select('precipitation');
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
    const spiCollection = movingWindowSums.map(function(image) {
        const month = image.get('month');
        const statsForMonth = ee.Image(monthlyStats.filter(ee.Filter.eq('month', month)).first());
        const mean = statsForMonth.select('precip_sum');
        const stdDev = statsForMonth.select('precip_sum_stdDev');
        const spi = image.subtract(mean).divide(stdDev).rename('SPI');
        return spi.copyProperties(image, image.propertyNames());
    });

    const spiForPeriod = spiCollection.filterDate(startDate, endDate);
    const spiLatestImage = spiForPeriod.sort('system:time_start', false).first();
    const spiVisParams = { min: -2.5, max: 2.5, palette: ['#d73027', '#f46d43', '#fdae61', '#cccccc', '#abd9e9', '#74add1', '#4575b4'] };
    const mapId = await getMapId(spiLatestImage.clip(geometry), spiVisParams);

    const timeSeries = await evaluate(spiForPeriod.map(img => {
        const mean = img.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: region,
            scale: 5000,
            bestEffort: true
        });
        return ee.Feature(null, {'mean': mean.get('SPI')}).copyProperties(img, ['system:time_start']);
    }));

    return {
        tileUrl: `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`,
        chartData: formatChartData(timeSeries)
    };
}

async function getFireRiskAnalysis({ endDate, region }) {
    const geometry = ee.Geometry(region);
    const end = ee.Date(endDate);
    
    const lstCollection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(end.advance(-30, 'day'), end).filterBounds(geometry).map(processModisLST);
    const spiCollection = getSpiAnalysis({timescale: 3, startDate: end.advance(-45, 'day').format(), endDate: end.format(), region}); // Simplified SPI call for risk
    
    const latestLST = ee.Image(lstCollection.sort('system:time_start', false).first());
    const latestSPI = ee.Image(spiCollection.sort('system:time_start', false).first());
    
    const lstRisk = latestLST.select('LST').unitScale(30, 45).clamp(0, 1);
    const spiRisk = latestSPI.select('SPI').multiply(-1).unitScale(0, 1.5).clamp(0, 1);
    const totalRisk = lstRisk.multiply(0.6).add(spiRisk.multiply(0.4));
    const classifiedRisk = ee.Image(0).where(totalRisk.gt(0.25), 1).where(totalRisk.gt(0.50), 2).where(totalRisk.gt(0.75), 3);
    
    const fireVisParams = { min: 0, max: 3, palette: ['#2ca25f', '#fee08b', '#fdae61', '#d73027'] };
    const mapId = await getMapId(classifiedRisk.clip(geometry), fireVisParams);

    return {
        tileUrl: `https://earthengine.googleapis.com/v1alpha/${mapId.mapid}/tiles/{z}/{x}/{y}`
    };
}


// --- Helper to get Visualization Parameters ---
async function getVisParams(variable) {
    const params = {
        'TAM': { min: 20, max: 40, palette: ['blue', 'cyan', 'yellow', 'red'] },
        'HR': { min: 50, max: 100, palette: ['lightyellow', 'green', 'darkblue'] },
        'Radiacion_Solar': { min: 0, max: 1000, palette: ['lightgray', 'orange', 'red'] },
        'wind_speed': { min: 0, max: 10, palette: ['white', 'lightblue', 'blue'] },
        'LST': { min: 20, max: 50, palette: ['navy', 'blue', 'cyan', 'yellow', 'red'] },
        'Precipitacion': { min: 0, max: 200, palette: ['#ffffcc', '#a1dab4', '#41b6c4', '#225ea8'] },
        'ET': { min: 0, max: 40, palette: ['#d73027', '#fc8d59', '#fee090', '#e0f3f8', '#91bfdb', '#4575b4']},
        'PET': { min: 0, max: 60, palette: ['#d73027', '#fc8d59', '#fee090', '#e0f3f8', '#91bfdb', '#4575b4']},
        'GDD': { min: 0, max: 20, palette: ['#edf8b1', '#7fcdbb', '#2c7fb8']}
    };
    return params[variable] || {min: 0, max: 100, palette: ['white', 'black']};
}

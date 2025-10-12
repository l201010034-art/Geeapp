import ee from '@google/earthengine';

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
            const total = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(start, end).filterBounds(roi).sum().select('precipitation').clip(roi);
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
            const mean = sumsForMonth.mean().clip(roi);
            const stdDev = sumsForMonth.reduce(ee.Reducer.stdDev()).clip(roi);
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

// UBICACIÓN: /api/gee.js
// REEMPLAZA la función handleHurricaneList completa

async function handleHurricaneList({ year, scope }) {
    if (!year) {
        throw new Error("El año es un parámetro requerido.");
    }

    const collection = ee.FeatureCollection('NOAA/IBTrACS/v4');
    const hurricanesInYear = collection.filter(ee.Filter.eq('SEASON', year));
    let filteredCollection = hurricanesInYear;

    if (scope === 'Mexico') {
        const mexicoAsset = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');
        const mexicoBoundary = mexicoAsset.union().first().geometry();
        filteredCollection = hurricanesInYear.filterBounds(mexicoBoundary);
    }
    
    // 1. Obtenemos la lista de SIDs únicos, que es el identificador fiable.
    const stormSids = filteredCollection.aggregate_array('SID').distinct();

    // 2. Para cada SID, obtenemos su nombre correspondiente para mostrarlo en la UI.
    const stormInfo = ee.FeatureCollection(stormSids.map(function(sid) {
        // Obtenemos el primer punto de ese huracán para extraer el nombre.
        var firstPoint = filteredCollection.filter(ee.Filter.eq('SID', sid)).first();
        // Creamos un objeto con el SID y el Nombre.
        return ee.Feature(null, {
            'sid': firstPoint.get('SID'),
            'name': firstPoint.get('name')
        });
    }));

    return new Promise((resolve, reject) => {
        // 3. Evaluamos la lista de objetos {sid, name}.
        stormInfo.evaluate((fc, error) => {
            if (error) {
                return reject(new Error("Error al obtener la lista de huracanes: " + error));
            }
            
            // 4. Procesamos la lista en el servidor para limpiarla y ordenarla.
            const hurricaneList = fc.features
                .map(f => f.properties)
                // Filtramos los que no tienen nombre para una UI más limpia.
                .filter(storm => storm.name !== 'UNNAMED')
                // Ordenamos alfabéticamente por nombre.
                .sort((a, b) => a.name.localeCompare(b.name));

            if (hurricaneList.length === 0) {
                return reject(new Error(`No se encontraron huracanes con nombre para el año ${year}.`));
            }

            // 5. Devolvemos la lista final.
            resolve({ hurricaneList });
        });
    });
}

// =========================================================================================
// === LÓGICA DE BÚSQUEDA DE MUNICIPIOS ====================================================
// =========================================================================================

// =========================================================================================
// === LÓGICA DE BÚSQUEDA DE MUNICIPIOS (VERSIÓN CORREGIDA Y ROBUSTA) =======================
// =========================================================================================
// REEMPLAZA la función getOfficialMunicipalityName con esta:
function getMunicipalityCvegeo(municipalityName) {
    const normalize = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedInput = normalize(municipalityName);

    // Mapeo de nombres normalizados a su CVEGEO oficial
    const cvegeoMap = {
        'calkini': '04001',
        'campeche': '04002',
        'carmen': '04003',
        'champoton': '04004',
        'hecelchakan': '04005',
        'hopelchen': '04006',
        'palizada': '04007',
        'escarcega': '04008',
        'tenabo': '04009',
        'calakmul': '04010',
        'candelaria': '04011',
        'seybaplaya': '04012',
        'dzitbalche': '04013'
    };

    return cvegeoMap[normalizedInput] || null;
}

// =========================================================================================
// === MANEJADOR PRINCIPAL DE LA API (VERSIÓN CORREGIDA) ===================================
// =========================================================================================
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    }

    try {
        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey({ client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.EE_PRIVATE_KEY },
                () => ee.initialize(null, null, resolve, reject),
                (err) => reject(new Error('La autenticación con GEE falló.'))
            );
        });

        const { action, params } = req.body;
        if (!action || !params) {
            throw new Error('Solicitud incorrecta: Falta "action" o "params".');
        }

                // --- CORRECCIÓN CLAVE ---
        // Se manejan primero las acciones que NO necesitan un ROI geográfico.
        if (action === 'getHurricaneList') {
            const responseData = await handleHurricaneList(params);
            // Se envía la respuesta y se detiene la ejecución para evitar el error de ROI.
            return res.status(200).json(responseData);
        }
        // --- FIN DE LA CORRECCIÓN ---



        // ▼▼▼ REEMPLAZA EL BLOQUE DE LÓGICA DEL ROI DENTRO DEL HANDLER CON ESTO ▼▼▼
        let eeRoi;
        const roiParam = params.roi || (params.rois ? params.rois[0] : null);

        if (action === 'getCompareData' && params.rois) {
            const features = params.rois.map(r => ee.Feature(ee.Geometry(r.geom)));
            eeRoi = ee.FeatureCollection(features).geometry();
        } else if (roiParam && roiParam.geom) {
            eeRoi = ee.Geometry(roiParam.geom);
        } else if (roiParam && roiParam.zona_type === 'municipio') {
            const cvegeo = getMunicipalityCvegeo(roiParam.zona_name);
            if (!cvegeo) {
                throw new Error(`El nombre del municipio "${roiParam.zona_name}" no es válido o no se reconoce.`);
            }

            const municipios = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');

            // El filtro ahora es por el identificador único, mucho más fiable
            const campecheMunicipality = municipios.filter(ee.Filter.eq('CVEGEO', cvegeo));

            const size = await new Promise((resolve, reject) => {
                campecheMunicipality.size().evaluate((val, err) => err ? reject(err) : resolve(val));
            });

            if (size === 0) {
                throw new Error(`No se encontró el municipio con CVEGEO "${cvegeo}" en tu asset. Verifica que el asset y los códigos CVEGEO sean correctos.`);
            }

            eeRoi = campecheMunicipality.first().geometry();

        } else {
            throw new Error('Formato de Región de Interés (ROI) no reconocido o ausente.');
        }
        // --- FIN DEL NUEVO BLOQUE ---

        // CORRECCIÓN CLAVE: Añadimos la geometría procesada a los parámetros
        params.eeRoi = eeRoi;
        // --- FIN DE LA LÓGICA CORREGIDA ---

        let responseData;
        // Pasamos tanto los parámetros originales ({...params}) como el eeRoi calculado
        switch (action) {
            case 'getGeneralData': responseData = await handleGeneralData({...params, eeRoi}); break;
            case 'getCompareData': responseData = await handleCompareData({...params, eeRoi}); break;
            case 'getPrecipitationData': responseData = await handlePrecipitationData({...params, eeRoi}); break;
            case 'getTemperatureData': responseData = await handleTemperatureData({...params, eeRoi}); break;
            case 'getSpiData': responseData = await handleSpiData({...params, eeRoi}); break;
            case 'getFireRiskData': responseData = await handleFireRiskData({...params, eeRoi}); break;
            default: throw new Error(`Action '${action}' not recognized.`);
        }

        res.status(200).json(responseData);

    } catch (error) {
        console.error('ERROR DETALLADO DEL SERVIDOR GEE:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}


// =========================================================================================
// === LÓGICA DE OPTIMIZACIÓN Y MANEJADORES DE ACCIONES ====================================
// =========================================================================================

async function getOptimizedHighFrequencyCollection(datasetName, eeRoi, startDate, endDate) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);

    const dateDiffDays = await new Promise((resolve, reject) => {
        eeEndDate.difference(eeStartDate, 'day').evaluate((val, err) => err ? reject(err) : resolve(val));
    });

    if (dateDiffDays <= 90) {
        return ee.ImageCollection(datasetName)
            .filterDate(startDate, endDate)
            .filterBounds(eeRoi)
            .map(processEra5);
    }
    
    const dateList = ee.List.sequence(0, dateDiffDays - 1);
    const dailyImagesList = dateList.map(offset => {
        const start = eeStartDate.advance(ee.Number(offset), 'day');
        const end = start.advance(1, 'day');
        
        const hourlyImages = ee.ImageCollection(datasetName)
                            .filterDate(start, end)
                            .filterBounds(eeRoi);
        
        return ee.Algorithms.If(
            hourlyImages.size().gt(0),
            processEra5(hourlyImages.mean()).set('system:time_start', start.millis()),
            null
        );
    });
    
    return ee.ImageCollection.fromImages(dailyImagesList.removeAll([null]));
}


async function handleGeneralData({ roi, varInfo, startDate, endDate, eeRoi }) {
    console.log('--- DEBUG: ENTRANDO A handleGeneralData v3 ---');
    console.log('--- DEBUG: El ROI recibido es:', JSON.stringify(roi, null, 2));
    let collection;

    if (varInfo.dataset === 'ERA5') {
        collection = await getOptimizedHighFrequencyCollection('ECMWF/ERA5_LAND/HOURLY', eeRoi, startDate, endDate);
    } else {
        if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(eeRoi).map(processModis);
        else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(eeRoi).map(processET);
        else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(eeRoi).map(processGDD);
        else if (varInfo.dataset === 'CHIRPS') collection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(startDate,endDate).filterBounds(eeRoi).map(processChirps);
    }
    
    const imageForMap = collection.select(varInfo.bandName).mean();
    const mapId = await getMapId(imageForMap.clip(eeRoi), { min: varInfo.min, max: varInfo.max, palette: varInfo.palette });
    
    const stats = await getStats(imageForMap, eeRoi, varInfo.bandName, varInfo.unit, roi.name);
    const chartData = await getOptimizedChartData(collection.select(varInfo.bandName), [roi], varInfo.bandName, startDate, endDate, eeRoi);
    return { mapId, stats, chartData, chartOptions: { title: `Serie Temporal para ${roi.name}` } };
}

async function handleCompareData({ rois, varInfo, startDate, endDate, eeRoi }) {
    const features = rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name }));
    const fc = ee.FeatureCollection(features);
    let collection;

    if (varInfo.dataset === 'ERA5') {
        collection = await getOptimizedHighFrequencyCollection('ECMWF/ERA5_LAND/HOURLY', eeRoi, startDate, endDate);
    } else {
        if (varInfo.dataset === 'MODIS') collection = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(startDate, endDate).filterBounds(eeRoi).map(processModis);
        else if (varInfo.dataset === 'MODIS_ET') collection = ee.ImageCollection("MODIS/006/MOD16A2").filterDate(startDate, endDate).filterBounds(eeRoi).map(processET);
        else if (varInfo.dataset === 'ERA5_DAILY') collection = ee.ImageCollection("ECMWF/ERA5/DAILY").filterDate(startDate, endDate).filterBounds(eeRoi).map(processGDD);
        else if (varInfo.dataset === 'CHIRPS') collection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY').filterDate(startDate,endDate).filterBounds(eeRoi).map(processChirps);
    }

    const chartData = await getOptimizedChartData(collection.select(varInfo.bandName), rois, varInfo.bandName, startDate, endDate, eeRoi);
    
    return { 
        stats: `Comparando ${rois.length} zonas. Ver el gráfico para los resultados.`,
        chartData, 
        chartOptions: { title: `Comparación de ${varInfo.bandName} entre zonas` }
    };
}


async function handlePrecipitationData({ roi, analysisType, aggregation, startDate, endDate, eeRoi }) {
    if (!startDate || !endDate) {
        throw new Error("Fechas de inicio y fin son requeridas para el análisis de precipitación.");
    }

    const precipCollection = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(startDate, endDate).filterBounds(eeRoi).map(processChirps);

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
    } else { // frequency
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
    const stats = await getStats(imageForMap, eeRoi, 'map_result', unit, roi.name, "Valor total/promedio");
    const chartData = await getChartData(collectionForChart, eeRoi, 'metric');

    return { mapId, stats, chartData, chartOptions: { title: `${chartTitle} (${aggregation}) para ${roi.name}` } };
}

async function handleTemperatureData({ roi, analysisType, startDate, endDate, eeRoi }) {
    
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

async function handleSpiData({ roi, timescale, startDate, endDate, eeRoi }) {
     console.log('--- DEBUG: EJECUTANDO handleSpiData v3 ---');

    const spiCollection = getSpiCollection(eeRoi, timescale);
    const spiForPeriod = spiCollection.filterDate(startDate, endDate);
    
    const spiLatestImage = spiForPeriod.sort('system:time_start', false).first();
    const visParams = { min: -2.5, max: 2.5, palette: ['#d73027', '#f46d43', '#fdae61', '#cccccc', '#abd9e9', '#74add1', '#4575b4'] };
    const mapId = await getMapId(spiLatestImage.clip(eeRoi), visParams);
    
    const chartData = await getOptimizedChartData(spiForPeriod, [roi], 'SPI', startDate, endDate, eeRoi);

    return { mapId, stats: `Mostrando el mapa SPI más reciente para el periodo.`, chartData, chartOptions: { title: `SPI de ${timescale} meses para ${roi.name}` }};
}

async function handleFireRiskData({ roi, startDate, endDate, eeRoi }) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);

    const lstCollection = ee.ImageCollection('MODIS/061/MOD11A1')
        .filterDate(eeStartDate, eeEndDate)
        .filterBounds(eeRoi)
        .map(processModis);

    const spiCollection = getSpiCollection(eeRoi, 3)
        .filterDate(eeStartDate, eeEndDate);

    const meanLST = lstCollection.mean(); 
    const meanSPI = spiCollection.mean();

    const inputsPresent = await new Promise((resolve, reject) => {
        ee.Dictionary.fromLists(['lst', 'spi'], [meanLST, meanSPI]).evaluate((dict, error) => {
            if (error) return reject(error);
            resolve(dict && dict.lst != null && dict.spi != null);
        });
    });

    if (!inputsPresent) {
        throw new Error("No hay suficientes datos de LST o SPI en el periodo seleccionado para calcular el riesgo de incendio.");
    }
    
    // AJUSTE 1: Umbrales de temperatura más sensibles (ej. 28°C a 42°C)
    const lstRisk = meanLST.select('LST').unitScale(28, 42).clamp(0, 1);
    const spiRisk = meanSPI.select('SPI').multiply(-1).unitScale(0, 1.5).clamp(0, 1);
    const totalRisk = lstRisk.multiply(0.6).add(spiRisk.multiply(0.4));
    
    // AJUSTE 2: Clasificación de riesgo más sensible para mostrar más variaciones
    const classifiedRisk = ee.Image(0) // Nivel 0: Bajo
        .where(totalRisk.gt(0.20), 1) // Nivel 1: Moderado
        .where(totalRisk.gt(0.45), 2) // Nivel 2: Alto
        .where(totalRisk.gt(0.70), 3); // Nivel 3: Extremo

    const fireVisParams = { min: 0, max: 3, palette: ['#2ca25f', '#fee08b', '#fdae61', '#d73027'] };

    const mapId = await getMapId(classifiedRisk.clip(eeRoi), fireVisParams);
    
    return { mapId, stats: `Riesgo de incendio promedio calculado para el periodo seleccionado.` };
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
    
    const scale = 5000;

    // --- LÓGICA CORREGIDA ---
    if (rois.length > 1) {
        // Este camino es para la función "Comparar" y funciona como antes.
        const fc = ee.FeatureCollection(rois.map(r => ee.Feature(ee.Geometry(r.geom), { label: r.name })));
        return getChartDataByRegion(collection, fc, bandName, scale);
    } else {
        // Este es el camino para un solo análisis (incluyendo municipios).
        // Usa el eeRoi que ya fue calculado y verificado en el handler principal.
        return getChartData(collection, eeRoi, bandName, scale);
    }
}

async function getChartData(collection, roi, bandName, scale = 2000) {
    return new Promise((resolve, reject) => {
        const series = collection.map(image => {
            const value = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: roi,
                scale: scale,
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

// Archivo: gee.js

async function getChartDataByRegion(collection, fc, bandName, scale = 2000) {
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
                        scale: scale
                    });
                    const values = labels.map(label => {
                        const feature = means.filter(ee.Filter.eq('label', label)).first();
                        return ee.Feature(feature).get('mean');
                    });
                    return ee.Feature(null, {'system:time_start': time}).set('means', values);
                });
                
                timeSeries.evaluate((fc, error) => {
                    if (error) reject(new Error('Error evaluando datos de comparación: ' + error));
                    else {
                        const rows = fc.features.map(f => {
                            return [new Date(f.properties['system:time_start']).toISOString(), ...f.properties.means];
                        }).sort((a,b) => new Date(a[0]) - new Date(b[0]));
                        resolve(header.concat(rows));
                    }
                });
            }
        });
    });

// UBICACIÓN: api/gee.js (fuera de la función handler)

}
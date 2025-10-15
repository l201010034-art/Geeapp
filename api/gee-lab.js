// /api/gee-lab.js - ¡NUEVA VERSIÓN MODULAR!

const ee = require('@google/earthengine');

// --- Funciones de Utilidad (Helpers) ---

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


async function getStats(image, roi, bandName, unit, zoneName, prefix = "Promedio") {
    return new Promise((resolve, reject) => {
        const reducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.minMax(), sharedInputs: true });
        const dict = image.reduceRegion({ reducer, geometry: roi, scale: 5000, bestEffort: true });
        
        dict.evaluate((stats, error) => {
            if (error) return reject(new Error('Error calculando estadísticas: ' + error));
            const meanKey = `${bandName}_mean`;
            if (!stats || stats[meanKey] == null) return resolve(`No se pudieron calcular estadísticas para ${zoneName}.`);
            const mean = stats[meanKey].toFixed(2);
            const min = stats[`${bandName}_min`].toFixed(2);
            const max = stats[`${bandName}_max`].toFixed(2);
            resolve(`Estadísticas para ${zoneName}:\n${prefix}: ${mean} ${unit}\nMínimo: ${min} ${unit}\nMáximo: ${max} ${unit}`);
        });
    });
}

// UBICACIÓN: /api/gee-lab.js
// REEMPLAZA la función getOptimizedChartData completa.

async function getOptimizedChartData(collection, roi, bandName, startDate, endDate) {
    const eeStartDate = ee.Date(startDate);
    const eeEndDate = ee.Date(endDate);
    
    const dateDiffDays = await new Promise((resolve, reject) => {
        eeEndDate.difference(eeStartDate, 'day').evaluate((val, err) => err ? reject(err) : resolve(val));
    });

    let collectionToProcess = collection;

    if (dateDiffDays > 120) {
        let aggregateUnit = 'week';
        if (dateDiffDays > 730) { 
            aggregateUnit = 'month';
        }
        
        const dateDiff = eeEndDate.difference(eeStartDate, aggregateUnit);
        const dateList = ee.List.sequence(0, dateDiff.subtract(1));
        
        const aggregatedImages = dateList.map(offset => {
            const start = eeStartDate.advance(ee.Number(offset), aggregateUnit);
            const end = start.advance(1, aggregateUnit);
            const filtered = collection.filterDate(start, end);
            
            return ee.Algorithms.If(
                filtered.size().gt(0),
                filtered.mean().set('system:time_start', start.millis()),
                null
            );
        });
        
        collectionToProcess = ee.ImageCollection.fromImages(aggregatedImages.removeAll([null]));
    }
    
    return new Promise((resolve, reject) => {
        const series = collectionToProcess.map(image => {
            const value = image.select(bandName).reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: roi,
                scale: 5000,
                bestEffort: true
            }).get(bandName);
            return ee.Feature(null, { 'system:time_start': image.get('system:time_start'), 'value': value });
        });

        series.evaluate((fc, error) => {
            // --- ESTA ES LA LÍNEA CORREGIDA ---
            if (error) return reject(new Error('Error al evaluar los datos del gráfico: ' + (error.message || 'Error desconocido de GEE.')));
            
            const header = [['Fecha', bandName]];
            const rows = fc.features
                .filter(f => f.properties.value !== null && f.properties.value !== undefined)
                .filter(f => f.properties['system:time_start'])
                .map(f => [new Date(f.properties['system:time_start']).toISOString(), f.properties.value])
                .sort((a,b) => new Date(a[0]) - new Date(b[0]));
                
            resolve(header.concat(rows));
        });
    });
}

// --- Función Principal de Ejecución (El Nuevo Enrutador) ---

async function executeAnalysis(params) {
    // 1. Inicializar GEE y preparar el ROI
    await new Promise((resolve, reject) => {
        ee.data.authenticateViaPrivateKey({ client_email: process.env.EE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.EE_PRIVATE_KEY },
            () => ee.initialize(null, null, resolve, reject),
            (err) => reject(new Error(`La autenticación con GEE falló: ${err}`))
        );
    });

    let eeRoi;
    if (params.analysisType !== 'HURRICANE') {
        if (params.roi === 'Golfo de México (Zona Campeche)') {
            eeRoi = ee.Geometry.Rectangle([-94, 18, -89, 22], null, false);
        } else if (params.roi === 'Línea Costera (Sonda de Campeche)') {
            eeRoi = ee.Geometry.Rectangle([-92.5, 18.5, -90.5, 21], null, false);
        } else {
            const cvegeo = getMunicipalityCvegeo(params.roi);
            if (!cvegeo) throw new Error(`El nombre del municipio "${params.roi}" no es válido.`);
            const municipios = ee.FeatureCollection('projects/residenciaproject-443903/assets/municipios_mexico_2024');
            eeRoi = municipios.filter(ee.Filter.eq('CVEGEO', cvegeo)).first().geometry();
        }
    }

    // 2. Enrutador: Importar y ejecutar el módulo correcto
    const moduleName = params.analysisType.toLowerCase();
    let analysisResult;

    try {
        const analysisModule = await import(`./lab/${moduleName}.js`);
        
        // Pasamos los parámetros correctos a cada módulo
        const moduleParams = params.analysisType === 'HURRICANE'
            ? { hurricaneSid: params.hurricaneSid, hurricaneName: params.hurricaneName, year: params.year }
            : { roi: eeRoi, startDate: params.startDate, endDate: params.endDate };
        
        analysisResult = await analysisModule.handleAnalysis(moduleParams);

    } catch (e) {
        console.error(e);
        throw new Error(`El módulo de análisis para "${params.analysisType}" no se encontró o contiene un error.`);
    }
    
    // 3. Procesar resultados
    let { laImagenResultante, collectionForChart, bandNameForChart, visParams } = analysisResult;

    const imageToDisplay = (params.analysisType === 'HURRICANE' || params.analysisType === 'FAI')
        ? laImagenResultante
        : laImagenResultante.clip(eeRoi);

    // ▼▼▼ LÍNEA CORREGIDA ▼▼▼
    // Si visParams tiene una paleta, úsalo; si no, usa un objeto vacío {}.
    const visualizationOptions = visParams.palette ? visParams : {};
    const mapId = await new Promise((resolve, reject) => {
        imageToDisplay.getMapId(visualizationOptions, (mapid, error) => error ? reject(new Error(error)) : resolve(mapid));
    });
    // ▲▲▲ FIN DE LA LÍNEA CORREGIDA ▲▲▲


    // 4. Calcular estadísticas y datos de gráfico
    let stats = `Análisis visual para: ${visParams.bandName || 'Resultado del Laboratorio'}`;
    let chartData = null;
    
    if (collectionForChart && bandNameForChart) {
        chartData = await getOptimizedChartData(collectionForChart, eeRoi, bandNameForChart, params.startDate, params.endDate);
        const imageForStats = collectionForChart.select(bandNameForChart).mean();
        stats = await getStats(imageForStats, eeRoi, bandNameForChart, visParams.unit || '', params.roi);
    }

    const noHayDatosGrafico = !chartData || chartData.length <= 1;
    const noHayEstadisticas = stats && stats.includes("No se pudieron calcular estadísticas");

    // Si no hay ni gráfico ni estadísticas, lanzamos un error con un mensaje claro.
    // El 'catch' de la API se encargará de enviarlo al frontend como un error real.
    if (noHayDatosGrafico && noHayEstadisticas) {
        throw new Error("No se encontraron datos satelitales para el período y región seleccionados. Intenta con un rango de fechas más amplio.");
    }
    return { mapId, visParams, stats, chartData, chartOptions: { title: `Serie Temporal para ${bandNameForChart}` } };
}


// --- Manejador Principal de la API ---
module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const result = await executeAnalysis(req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error final en la API del Lab:', error.message);
        res.status(500).json({ error: 'Error Interno del Servidor', details: error.message });
    }
}
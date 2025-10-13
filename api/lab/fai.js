// /api/lab/fai.js - VERSIÓN FINAL CON ANÁLISIS DE COBERTURA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. MÁSCARA COMBINADA Y EROSIONADA
    // Creada una sola vez para máxima eficiencia.
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    const deepWaterMask = gebco.gte(0); // Profundidad > 15m
    const finalMask = waterMask.and(deepWaterMask.focal_min(2)); // Erosionamos para limpiar bordes

    // 2. FUNCIÓN AUXILIAR PARA CALCULAR FAI Y MÁSCARA DE NUBES
    const calculateFAI = (image) => {
        const scaledImage = image.divide(10000); // Factor de escala obligatorio
        const qa = image.select('QA60');
        const cloudMask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
        
        const fai = scaledImage.expression(
            'NIR - (RED + (SWIR - RED) * (865 - 665) / (1610 - 665))', {
            'NIR': scaledImage.select('B8'),
            'RED': scaledImage.select('B4'),
            'SWIR': scaledImage.select('B12')
        }).rename('FAI');
        
        return fai.updateMask(cloudMask).updateMask(finalMask);
    };

    // 3. COLECCIÓN PRE-FILTRADA
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end);

    // 4. GENERACIÓN DE COMPUESTOS MENSUALES
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));
    const monthlyComposites = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthlyCollection = s2Collection.filterDate(ini, fin);

        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.map(calculateFAI).median().set('system:time_start', ini.millis()),
            null
        );
    });

    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 5. CÁLCULO DE COBERTURA DE SARGAZO (LA NUEVA MÉTRICA)
    const sargassumThreshold = 0.04; // Umbral FAI para considerar "presencia de sargazo"
    
    // Convertimos la colección de imágenes a una de "features" con la estadística de cobertura
    const coverageFeatures = finalCollection.map(function(image) {
        const sargassumPixels = image.select('FAI').gt(sargassumThreshold);
        // Calculamos el porcentaje de píxeles que superan el umbral
        const coverageDict = sargassumPixels.reduceRegion({
            reducer: ee.Reducer.mean(),
            geometry: region,
            scale: 500,
            bestEffort: true
        });
        const coveragePercent = ee.Number(coverageDict.get('FAI')).multiply(100);
        return ee.Feature(null, {
            'Cobertura': coveragePercent,
            'system:time_start': image.get('system:time_start')
        });
    });

    // 6. CÁLCULO DE ESTADÍSTICAS AVANZADAS (PROMESAS)
    // Usamos promesas para obtener los resultados del servidor de GEE
    const statsPromise = new Promise((resolve, reject) => {
        const statsReducer = ee.Reducer.mean().combine({ reducer2: ee.Reducer.max(), sharedInputs: true });
        coverageFeatures.reduceColumns({ reducer: statsReducer, selectors: ['Cobertura'] }).evaluate(resolve, reject);
    });
    
    const maxDatePromise = new Promise((resolve, reject) => {
        coverageFeatures.sort('Cobertura', false).first().evaluate(resolve, reject);
    });

    // Esperamos a que ambas peticiones a GEE terminen
    const [stats, maxFeature] = await Promise.all([statsPromise, maxDatePromise]);

    let customStats = "No se pudieron calcular las estadísticas de cobertura.";
    if (stats && stats.mean != null && maxFeature) {
        const maxCoverage = stats.max.toFixed(2);
        const meanCoverage = stats.mean.toFixed(2);
        const maxDate = new Date(maxFeature.properties.system_time_start).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
        
        customStats = `Cobertura Máxima: ${maxCoverage}% (Detectada en ${maxDate})\nCobertura Promedio Mensual: ${meanCoverage}%`;
    }

    // 7. RESULTADOS FINALES
    return {
        // Para el mapa, usamos el percentil 95, que resalta las zonas de acumulación persistente
        laImagenResultante: finalCollection.select('FAI').reduce(ee.Reducer.percentile([95])),
        // Para el gráfico, usamos la serie temporal de las medianas mensuales
        collectionForChart: finalCollection.select('FAI'),
        bandNameForChart: 'FAI',
        // ¡La estadística ahora es mucho más útil!
        stats: customStats, 
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'FAI (Percentil 95)', unit: ''
        }
    };
};
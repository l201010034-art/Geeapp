// /api/lab/fai.js - VERSIÓN ESCALABLE Y CIENTÍFICAMENTE CORREGIDA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. MÁSCARA COMBINADA DE AGUA Y PROFUNDIDAD
    // Esta máscara se crea una sola vez y se reutiliza, lo cual es muy eficiente.
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    // Corrección Clave #1: Usamos .lte(-15) para seleccionar mar con >15m de profundidad.
    const deepWaterMask = gebco.lte(-15);
    const finalMask = waterMask.and(deepWaterMask);

    // 2. FUNCIÓN AUXILIAR PARA CALCULAR FAI
    const calculateFAI = (image) => {
        // Corrección Clave #2: Escalamos la imagen por 10,000. Es obligatorio para Sentinel-2.
        const scaledImage = image.divide(10000);
        
        // Usamos una expresión para el cálculo, que es más limpio en GEE.
        // Incorporamos tus bandas sugeridas (B8A y B12) para mayor precisión.
        const fai = scaledImage.expression(
            'NIR - (RED + (SWIR - RED) * (865 - 665) / (2202 - 665))', {
            'NIR': scaledImage.select('B8A'),
            'RED': scaledImage.select('B4'),
            'SWIR': scaledImage.select('B12')
        }).rename('FAI');
        
        // Aplicamos la máscara al resultado final del cálculo.
        return fai.updateMask(finalMask);
    };

    // 3. COLECCIÓN PRE-FILTRADA
    // Filtramos la colección una sola vez al principio por eficiencia.
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

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

    // 5. COLECCIÓN FINAL Y RESULTADOS
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));
    return {
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection,
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'Índice de Algas Flotantes (FAI)', unit: ''
        }
    };
};
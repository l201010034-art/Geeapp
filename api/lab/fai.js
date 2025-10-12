// /api/lab/fai.js - VERSIÓN ESCALABLE FINAL
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. Pre-filtramos la colección completa UNA SOLA VEZ.
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end);

    // 2. Función auxiliar para calcular FAI (incluye escalado y máscara de agua).
    const calculateFAI = (image) => {
        const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
        const scaledImage = image.divide(10000).updateMask(waterMask);
        return scaledImage.expression(
            'NIR - (RED + (SWIR - RED) * (842 - 665) / (1610 - 665))', {
            'NIR': scaledImage.select('B8'), 'RED': scaledImage.select('B4'), 'SWIR': scaledImage.select('B11')
        }).rename('FAI');
    };

    // 3. Generamos la lista de meses para iterar.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));

    // 4. Mapeamos sobre cada mes para crear un compuesto mensual (mediana).
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

    // 5. Creamos la colección final para el gráfico.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 6. Devolvemos los resultados.
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
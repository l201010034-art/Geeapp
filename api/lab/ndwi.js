// /api/lab/ndwi.js - VERSIÓN ESCALABLE FINAL
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. Pre-filtramos la colección completa UNA SOLA VEZ.
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));

    // 2. Función auxiliar para calcular NDWI (incluye escalado).
    const calculateNDWI = (image) => {
        return image.divide(10000).normalizedDifference(['B3', 'B8']).rename('NDWI');
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
            monthlyCollection.map(calculateNDWI).median().set('system:time_start', ini.millis()),
            null
        );
    });

    // 5. Creamos la colección final para el gráfico.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 6. Devolvemos los resultados.
    return {
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection,
        bandNameForChart: 'NDWI',
        visParams: {
            min: -1, max: 1, palette: ['brown', 'white', 'blue'],
            bandName: 'Índice de Agua (NDWI)', unit: ''
        }
    };
};
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1️ Filtramos la colección UNA SOLA VEZ al principio.
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)); 

    // 2️ Función auxiliar para enmascarar nubes y calcular NDVI.
    const maskAndNDVI = (image) => {
        const qa = image.select('QA60');
        const cloudMask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
        return image.normalizedDifference(['B8', 'B4']).rename('NDVI').updateMask(cloudMask);
    };
    
    // 3️⃣ Generamos la lista de meses para iterar.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));

    // 4️⃣ Mapeamos sobre cada mes para crear un compuesto mensual (mediana).
    const monthlyComposites = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');

        // Filtramos la colección ya pre-filtrada, lo cual es muy rápido.
        const monthlyCollection = s2Collection.filterDate(ini, fin);

        // 5️⃣ Manejo robusto de meses sin datos (completamente nublados).
        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.map(maskAndNDVI).median().set('system:time_start', ini.millis()),
            null
        );
    });

    // 6️⃣ Creamos la colección final para el gráfico, eliminando los meses que no tenían datos.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 7️⃣ Devolvemos los resultados en el formato que espera la plataforma.
    return {
        laImagenResultante: finalCollection.mean(), // Para el mapa, mostramos el promedio de los meses
        collectionForChart: finalCollection,        // Para el gráfico, usamos la serie temporal mensual
        bandNameForChart: 'NDVI',
        visParams: {
            min: -0.2, max: 0.9, palette: ['blue', 'white', 'green'],
            bandName: 'Índice de Vegetación (NDVI)', unit: ''
        }
    };
};
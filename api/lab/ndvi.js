// /api/lab/ndvi.js - VERSIÓN ESCALABLE FINAL (ROBUSTA Y OPTIMIZADA)
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1️⃣ Filtramos la colección UNA SOLA VEZ al principio.
    // Esto es mucho más eficiente que filtrar dentro del bucle.
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .select(['B4', 'B8', 'QA60']);

    // 2️⃣ Función auxiliar para enmascarar nubes y calcular NDVI.
    const maskAndNDVI = (image) => {
        const qa = image.select('QA60');
        const mask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
        return image.normalizedDifference(['B8', 'B4']).rename('NDVI').updateMask(mask);
    };

    const collectionWithNDVI = collection.map(maskAndNDVI);
    
    // 3️⃣ Generamos la lista de meses para iterar.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));

    // 4️⃣ Mapeamos sobre cada mes para crear un compuesto mensual.
    const monthlyAverages = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');

        // Filtramos la colección ya pre-filtrada, lo cual es muy rápido.
        const monthlyCollection = collectionWithNDVI.filterDate(ini, fin);

        // 5️⃣ Manejo robusto de meses sin datos (completamente nublados).
        // Si hay imágenes, calculamos la mediana. Si no, devolvemos null.
        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.median().set('system:time_start', ini.millis()),
            null
        );
    });

    // 6️⃣ Creamos la colección final, eliminando los meses que no tenían datos.
    const finalCollection = ee.ImageCollection.fromImages(monthlyAverages.removeAll([null]));

    // 7️⃣ Devolvemos los resultados en el formato que espera la plataforma.
    return {
        laImagenResultante: finalCollection.mean(), // El promedio de los promedios mensuales
        collectionForChart: finalCollection, // La colección de promedios mensuales para el gráfico
        bandNameForChart: 'NDVI',
        visParams: {
            min: -0.2, max: 0.9, palette: ['blue', 'white', 'green'],
            bandName: 'Índice de Vegetación (NDVI)', unit: ''
        }
    };
};
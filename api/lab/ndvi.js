// /api/lab/ndvi.js - VERSIÓN OPTIMIZADA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    // Seleccionamos solo las bandas necesarias desde el principio para ahorrar memoria
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select(['B4', 'B8', 'QA60']); // NIR, Red, y Quality Assessment

    const calculateAndMask = (image) => {
        // Enmascarar nubes
        const qa = image.select('QA60');
        const cloudBitMask = 1 << 10;
        const cirrusBitMask = 1 << 11;
        const mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        
        // Calcular NDVI y aplicar la máscara en un solo paso
        const ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
        return ndvi.updateMask(mask); // Devolvemos solo la banda NDVI ya enmascarada
    };
    
    const collectionWithNDVI = collection.map(calculateAndMask);

    return {
        laImagenResultante: collectionWithNDVI.median(), // .median() es más robusto que .mean() para visualización
        collectionForChart: collectionWithNDVI,
        bandNameForChart: 'NDVI',
        visParams: {
            min: -0.2, max: 0.9, palette: ['blue', 'white', 'green'],
            bandName: 'Índice de Vegetación (NDVI)', unit: ''
        }
    };
};
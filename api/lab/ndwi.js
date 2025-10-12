// /api/lab/ndwi.js - VERSIÓN OPTIMIZADA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    // Seleccionamos solo las bandas necesarias
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select(['B3', 'B8']) // Green y NIR
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

    const calculateNDWI = (image) => {
        const scaledImage = image.divide(10000);
        return scaledImage.normalizedDifference(['B3', 'B8']).rename('NDWI');
    };
    
    const collectionWithNDWI = collection.map(calculateNDWI);

    return {
        laImagenResultante: collectionWithNDWI.median(),
        collectionForChart: collectionWithNDWI,
        bandNameForChart: 'NDWI',
        visParams: {
            min: -1, max: 1, palette: ['brown', 'white', 'blue'],
            bandName: 'Índice de Agua (NDWI)', unit: ''
        }
    };
};
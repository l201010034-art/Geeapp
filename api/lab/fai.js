// /api/lab/fai.js - VERSIÓN OPTIMIZADA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    
    // Seleccionamos solo las bandas necesarias
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select(['B4', 'B8', 'B11']); // Red, NIR, SWIR

    const calculateFAI = (image) => {
        const scaledImage = image.divide(10000).updateMask(waterMask);
        const fai = scaledImage.expression(
            'NIR - (RED + (SWIR - RED) * (842 - 665) / (1610 - 665))', {
            'NIR': scaledImage.select('B8'), 'RED': scaledImage.select('B4'), 'SWIR': scaledImage.select('B11')
        }).rename('FAI');
        return fai; // Devolvemos solo la banda FAI
    };
    
    const collectionWithFAI = collection.map(calculateFAI);

    return {
        laImagenResultante: collectionWithFAI.median(),
        collectionForChart: collectionWithFAI,
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'Índice de Algas Flotantes (FAI)', unit: ''
        }
    };
};
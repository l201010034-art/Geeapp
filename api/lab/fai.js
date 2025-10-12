// /api/lab/fai.js - VERSIÓN CORREGIDA

const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate);

    const addFAI = (image) => {
        // --- LA CORRECCIÓN CLAVE ---
        // Se escalan los valores de reflectancia a un rango de 0-1.
        const scaledImage = image.divide(10000);
        
        const imageWithMask = scaledImage.updateMask(waterMask);
        
        const fai = imageWithMask.expression(
            'NIR - (RED + (SWIR - RED) * (842 - 665) / (1610 - 665))', {
            'NIR': imageWithMask.select('B8'),
            'RED': imageWithMask.select('B4'),
            'SWIR': imageWithMask.select('B11')
        }).rename('FAI');
        
        // Devolvemos la imagen escalada con la nueva banda FAI.
        return scaledImage.addBands(fai);
    };
    
    const collectionWithFAI = collection.map(addFAI);

    return {
        laImagenResultante: collectionWithFAI.select('FAI').median(),
        collectionForChart: collectionWithFAI.select('FAI'),
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'Índice de Algas Flotantes (FAI)', unit: ''
        }
    };
};
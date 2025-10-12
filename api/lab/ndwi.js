const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

    const addNDWI = (image) => image.addBands(image.normalizedDifference(['B3', 'B8']).rename('NDWI'));
    const collectionWithNDWI = collection.map(addNDWI);

    return {
        laImagenResultante: collectionWithNDWI.select('NDWI').median(),
        collectionForChart: collectionWithNDWI.select('NDWI'),
        bandNameForChart: 'NDWI',
        visParams: {
            min: -1, max: 1, palette: ['brown', 'white', 'blue'],
            bandName: 'Índice de Agua (NDWI)', unit: ''
        }
    };
}
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function({ roi, startDate, endDate }) {
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(roi)
        .filterDate(startDate, endDate);

    function maskS2clouds(image) {
        var qa = image.select('QA60');
        var cloudBitMask = 1 << 10;
        var cirrusBitMask = 1 << 11;
        var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        return image.updateMask(mask).divide(10000);
    }
    const cloudMaskedCollection = collection.map(maskS2clouds);

    const addNDVI = (image) => image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'));
    const collectionWithNDVI = cloudMaskedCollection.map(addNDVI);

    return {
        laImagenResultante: collectionWithNDVI.select('NDVI').median(),
        collectionForChart: collectionWithNDVI.select('NDVI'),
        bandNameForChart: 'NDVI',
        visParams: {
            min: -0.2, max: 0.9, palette: ['blue', 'white', 'green'],
            bandName: 'Índice de Vegetación (NDVI)', unit: ''
        }
    };
}
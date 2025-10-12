import ee from '@google/earthengine';

export async function handleAnalysis({ roi, startDate, endDate }) {
    const collection = ee.ImageCollection('MODIS/061/MOD11A2')
        .filterBounds(roi)
        .filterDate(startDate, endDate);
    
    const processLST = (image) => image.addBands(image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST'));
    const collectionWithLST = collection.map(processLST);

    return {
        laImagenResultante: collectionWithLST.select('LST').median(),
        collectionForChart: collectionWithLST.select('LST'),
        bandNameForChart: 'LST',
        visParams: {
            min: 15, max: 45, palette: ['blue', 'cyan', 'yellow', 'red'],
            bandName: 'Temp. Superficial', unit: '°C'
        }
    };
}
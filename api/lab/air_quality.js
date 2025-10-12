import ee from '@google/earthengine';

export async function handleAnalysis({ roi, startDate, endDate }) {
    const collection = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select('tropospheric_NO2_column_number_density');

    return {
        laImagenResultante: collection.median(),
        collectionForChart: collection,
        bandNameForChart: 'tropospheric_NO2_column_number_density',
        visParams: {
            min: 0, max: 0.0003, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red'],
            bandName: 'Dióxido de Nitrógeno', unit: 'mol/m²'
        }
    };
}
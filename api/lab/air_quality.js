const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. Pre-filtramos la colección S5P una vez.
    const s5pCollection = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
        .filterBounds(region)
        .filterDate(start, end)
        .select('tropospheric_NO2_column_number_density');

    // 2. Generamos la lista de meses para iterar.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));
    
    // 3. Mapeamos sobre cada mes para crear un compuesto mensual (mediana).
    const monthlyComposites = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthlyCollection = s5pCollection.filterDate(ini, fin);
        
        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.median().set('system:time_start', ini.millis()),
            null
        );
    });
    
    // 4. Creamos la colección final.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));
    
    // 5. Devolvemos los resultados.
    return {
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection,
        bandNameForChart: 'tropospheric_NO2_column_number_density',
        visParams: {
            min: 0, max: 0.0003, palette: ['black', 'blue', 'purple', 'cyan', 'green', 'yellow', 'red'],
            bandName: 'Dióxido de Nitrógeno', unit: 'mol/m²'
        }
    };
};
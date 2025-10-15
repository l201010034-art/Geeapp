const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. Pre-filtramos la colección MODIS una vez.
    const modisCollection = ee.ImageCollection('MODIS/061/MOD11A2')
        .filterBounds(region)
        .filterDate(start, end);

    // 2. Función auxiliar para procesar LST.
    const processLST = (image) => {
        return image.select('LST_Day_1km').multiply(0.02).subtract(273.15).rename('LST');
    };
    
    // 3. Generamos la lista de meses para iterar.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));

    // 4. Mapeamos sobre cada mes para crear un compuesto mensual (mediana).
    const monthlyComposites = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthlyCollection = modisCollection.filterDate(ini, fin);

        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.map(processLST).median().set('system:time_start', ini.millis()),
            null
        );
    });
    
    // 5. Creamos la colección final.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 6. Devolvemos los resultados.
    return {
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection,
        bandNameForChart: 'LST',
        visParams: {
            min: 15, max: 45, palette: ['blue', 'cyan', 'yellow', 'red'],
            bandName: 'Temp. Superficial', unit: '°C'
        }
    };
};
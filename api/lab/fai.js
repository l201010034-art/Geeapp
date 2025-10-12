// /api/lab/fai.js - VERSIÓN FINAL CON MOSAICO DE IMAGECOLLECTION
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. Pre-filtramos la colección Sentinel-2 una vez.
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end);

    // --- PASO CLAVE CORREGIDO: Cargar y Mosaicar la Colección de Batimetría ---
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    
    // Cargamos el asset como una ImageCollection, no como una Image.
    const gebcoCollection = ee.ImageCollection("projects/sat-io/open-datasets/gebco/gebco_grid");
    
    // Creamos un mosaico para unir todas las teselas en una sola imagen global.
    const gebco = gebcoCollection.mosaic();
    
    // Ahora podemos trabajar con la imagen mosaico como antes.
    const deepWaterMask = gebco.select('b1').lte(-15);
    const finalMask = waterMask.and(deepWaterMask);
    // --- FIN DEL PASO CLAVE ---

    // 3. Función auxiliar para calcular FAI aplicando la máscara final.
    const calculateFAI = (image) => {
        const maskedImage = image.divide(10000).updateMask(finalMask);
        
        return maskedImage.expression(
            'NIR - (RED + (SWIR - RED) * (842 - 665) / (1610 - 665))', {
            'NIR': maskedImage.select('B8'), 'RED': maskedImage.select('B4'), 'SWIR': maskedImage.select('B11')
        }).rename('FAI');
    };

    // 4. Generamos la lista de meses para iterar, asegurando la escalabilidad.
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));

    // 5. Mapeamos sobre cada mes para crear un compuesto mensual.
    const monthlyComposites = months.map((m) => {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthlyCollection = s2Collection.filterDate(ini, fin);

        return ee.Algorithms.If(
            monthlyCollection.size().gt(0),
            monthlyCollection.map(calculateFAI).median().set('system:time_start', ini.millis()),
            null
        );
    });

    // 6. Creamos la colección final para el gráfico.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));

    // 7. Devolvemos los resultados.
    return {
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection,
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'Índice de Algas Flotantes (FAI)', unit: ''
        }
    };
};
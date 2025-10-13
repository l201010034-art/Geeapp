// /api/lab/fai.js - VERSIÓN FINAL CON MÁSCARA OCEÁNICA PRECISA
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. MÁSCARA OCEÁNICA PRECISA USANDO ÚNICAMENTE GEBCO
    // Eliminamos JRC para no incluir lagunas ni ríos.
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    
    // Creamos la máscara que solo incluye píxeles que son mar (profundidad <= -15m).
    // Esta única máscara elimina la tierra Y las aguas interiores en un solo paso.
    const oceanMask = gebco.lte(-5);

    // Erosionamos la máscara para "lijar los bordes" y eliminar la franja costera.
    const finalMask = oceanMask.focal_min({ radius: 2, units: 'pixels' });

    // 2. FUNCIÓN AUXILIAR PARA CALCULAR FAI
    const calculateFAI = (image) => {
        const scaledImage = image.divide(10000);
        const qa = image.select('QA60');
        const cloudMask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
        
        const fai = scaledImage.expression(
            'NIR - (RED + (SWIR - RED) * (865 - 665) / (2202 - 665))', {
            'NIR': scaledImage.select('B8A'),
            'RED': scaledImage.select('B4'),
            'SWIR': scaledImage.select('B12')
        }).rename('FAI');
        
        // Aplicamos la máscara de nubes y nuestra nueva máscara oceánica precisa.
        return fai.updateMask(cloudMask).updateMask(finalMask);
    };

    // 3. COLECCIÓN PRE-FILTRADA
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end);

    // 4. GENERACIÓN DE COMPUESTOS MENSUALES
    const months = ee.List.sequence(0, end.difference(start, 'month').subtract(1));
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

    // 5. COLECCIÓN FINAL Y RESULTADOS
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));
    
    return {
        laImagenResultante: finalCollection.select('FAI').mean(),
        collectionForChart: finalCollection.select('FAI'),
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'FAI Promedio', unit: ''
        }
    };
};
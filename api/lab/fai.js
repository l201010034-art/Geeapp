// /api/lab/fai.js - VERSIÓN FINAL CON MÁSCARA DE AGUA PERMANENTE
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. MÁSCARA DE PRECISIÓN (LA CORRECCIÓN DEFINITIVA)
    // Usamos el dataset JRC para identificar agua que está presente >90% del tiempo.
    // Esto excluye eficazmente lagunas estacionales y zonas intermareales.
    const permanentWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(90);
    
    // Mantenemos la máscara de profundidad que ya funciona bien para el mar abierto.
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    const deepWaterMask = gebco.lte(-5);

    // La máscara final requiere que un píxel sea AGUA PERMANENTE Y PROFUNDA.
    // Esto elimina la costa y las lagunas turbias.
    const finalMask = permanentWater.and(deepWaterMask);

    // 2. FUNCIÓN AUXILIAR PARA CALCULAR FAI
    // (Esta función no cambia)
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
        laImagenResultante: finalCollection.mean(),
        collectionForChart: finalCollection.select('FAI'),
        bandNameForChart: 'FAI',
        visParams: {
            min: -0.05, max: 0.2, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            bandName: 'Índice de Algas Flotantes (FAI)', unit: ''
        }
    };
};
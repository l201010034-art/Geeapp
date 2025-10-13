// /api/lab/fai.js - Adaptado para la plataforma GeeApp con lógica NDVI.
const ee = require('@google/earthengine');

/**
 * Este análisis detecta la máxima presencia de sargazo utilizando el índice NDVI.
 * Es ideal para aguas abiertas como el Golfo de Campeche.
 * La lógica original, variables y parámetros de visualización se han mantenido intactos.
 */
module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    // La ROI se recibe dinámicamente desde la plataforma, ignorando la que está fija en el script original.
    const region = ee.Geometry(roi); 
    const UMBRAL_NUBES = 70; // Umbral de nubes del script original.

    // =================================================================================
    // FUNCIONES DE PROCESAMIENTO (SIN MODIFICAR)
    // =================================================================================

    /**
     * Enmascara nubes, sombras y tierra.
     */
    function enmascararNubesYTierra(image) {
        const scl = image.select('SCL');
        const clasesNoDeseadas = [3, 8, 9, 10, 11];
        
        let mascaraNubes = scl.neq(clasesNoDeseadas[0]);
        for (let i = 1; i < clasesNoDeseadas.length; i++) {
            mascaraNubes = mascaraNubes.and(scl.neq(clasesNoDeseadas[i]));
        }

        const ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
        const mascaraAgua = ndwi.gt(0.1);
        const mascaraFinal = mascaraNubes.and(mascaraAgua);

        return image.updateMask(mascaraFinal);
    }

    /**
     * Calcula el Índice de Vegetación de Diferencia Normalizada (NDVI).
     */
    function calcularNDVI(image) {
        const ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
        return image.addBands(ndvi);
    }

    // =================================================================================
    // LÓGICA PRINCIPAL (SIN MODIFICAR)
    // =================================================================================

    const coleccionS2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', UMBRAL_NUBES));

    const coleccionProcesada = coleccionS2
        .map(enmascararNubesYTierra)
        .map(calcularNDVI);

    const coleccionNDVI = coleccionProcesada.select('NDVI');

    // Crea un compuesto de máxima intensidad para resaltar la mayor presencia de sargazo.
    const sargazoMaxCompuesto = coleccionNDVI.max();

    // =================================================================================
    // ADAPTACIÓN AL ENTORNO DE LA PLATAFORMA
    // =================================================================================

    return {
        // La imagen principal a mostrar en el mapa (compuesto de máximo NDVI).
        laImagenResultante: sargazoMaxCompuesto,
        
        // Colección de datos para la gráfica de series de tiempo.
        collectionForChart: coleccionNDVI,
        bandNameForChart: 'SARGAZO',
        
        // Parámetros de visualización del script original.
        visParams: {
            min: 0,
            max: 0.6,
            palette: ['0000FF', '00FFFF', '00FF00', 'FFFF00', 'FF0000'],
            bandName: 'Máxima Detección de Sargazo (FAI)',
            unit: ''
        }
    };
};
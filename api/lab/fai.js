// /api/lab/fai.js - Adaptado para la plataforma GeeApp
const ee = require('@google/earthengine');

/**
 * Maneja el análisis de FAI Costero (Sargazo), manteniendo la lógica original.
 * Calcula el mínimo, máximo y promedio (mediana) de FAI en compuestos mensuales.
 */
module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // ========================================
    // LÓGICA DE ANÁLISIS ORIGINAL
    // ========================================

    // 2. Filtrado de nubes y cirros usando QA60
    const maskClouds = function(image) {
        const qa = image.select('QA60');
        const cloudBitMask = 1 << 10;
        const cirrusBitMask = 1 << 11;
        const mask = qa.bitwiseAnd(cloudBitMask).eq(0)
                       .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        return image.updateMask(mask);
    };
    
    // 6. Máscara para mantener solo áreas marinas
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    const oceanMask = gebco.lte(0);
    const finalMask = waterMask.and(oceanMask);

    // 3. Función para calcular FAI
    const calculateFAI = function(image) {
        const red = image.select('B4');
        const nir = image.select('B8A');
        const swir = image.select('B12');
        const fai = nir.subtract(red)
            .add(swir.subtract(red).multiply(864.7 - 664.6)
            .divide(2185.7 - 664.6));
        // La máscara final se aplica aquí para asegurar que solo se procesan píxeles de océano
        return image.addBands(fai.rename('FAI')).updateMask(finalMask);
    };

    // 5. Colección Sentinel-2 filtrada
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .map(maskClouds);

    // 7. Secuencia de meses
    const nMonths = end.difference(start, 'month').round();
    const months = ee.List.sequence(0, nMonths.subtract(1));

    // 8. Crear composites mensuales: min, max y median
    const monthlyComposites = months.map(function(m) {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthCollection = s2Collection.filterDate(ini, fin)
            .map(calculateFAI); // calculateFAI ya incluye la máscara oceánica

        return ee.Algorithms.If(
            monthCollection.size().gt(0),
            ee.Image.cat([
                monthCollection.min().select('FAI').rename('FAI_min'),
                monthCollection.median().select('FAI').rename('FAI_median'),
                monthCollection.max().select('FAI').rename('FAI_max')
            ]).set('system:time_start', ini.millis()),
            null
        );
    });

    // 9. Colección final
    const finalCollection = ee.ImageCollection.fromImages(
        monthlyComposites.removeAll([null])
    );
    
    // 10. Imagen promedio (la mediana es la más representativa)
    const laImagenResultante = finalCollection.select('FAI_median').mean();
    
    // ========================================
    // ADAPTACIÓN AL ENTORNO DE LA PLATAFORMA
    // ========================================

    return {
        // Imagen principal a mostrar en el mapa (promedio de las medianas mensuales).
        laImagenResultante: laImagenResultante,
        
        // Colección de datos para la gráfica de series de tiempo.
        collectionForChart: finalCollection,
        bandNameForChart: 'FAI_median', // Banda principal para la gráfica
        
        // Parámetros de visualización (usando la mejora que ya habíamos aplicado).
        visParams: {
            min: -0.05,
            max: 0.5, // Valor optimizado para mejor visualización
            palette: ['#000080', '#00FFFF', '#00FF00', '#FFFF00', '#FF8000', '#FF0000'],
            bandName: 'FAI Promedio (Mediana)',
            unit: ''
        }
    };
};
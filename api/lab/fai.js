// /api/lab/fai.js - Adaptado para la plataforma GeeApp, manteniendo la lógica original.
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // ========================================
    // LÓGICA DE ANÁLISIS ORIGINAL
    // ========================================

    // 2. Filtrado de nubes y cirros usando QA60
    var maskClouds = function(image) {
        var qa = image.select('QA60');
        var cloudBitMask = 1 << 10;
        var cirrusBitMask = 1 << 11;
        var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
                       .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        return image.updateMask(mask);
    };

    // 3. Función para calcular FAI
    var calculateFAI = function(image, finalMask) {
        var red = image.select('B4');
        var nir = image.select('B8A'); // NIR Sentinel-2
        var swir = image.select('B12');
        var fai = nir.subtract(red)
                       .add(swir.subtract(red).multiply(864.7 - 664.6)
                       .divide(2185.7 - 664.6));
        return image.addBands(fai.rename('FAI')).updateMask(finalMask);
    };

    // 5. Colección Sentinel-2 filtrada
    var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .map(maskClouds);

    // 6. Máscara para mantener solo áreas marinas
    var waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
        .select('occurrence').gt(80);
    var gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025')
        .select('b1').rename('elevation');
    var oceanMask = gebco.lte(0);
    var finalMask = waterMask.and(oceanMask);

    // 7. Secuencia de meses
    var nMonths = end.difference(start, 'month').round();
    var months = ee.List.sequence(0, nMonths.subtract(1));

    // 8. Crear composites mensuales: min, max y median
    var monthlyComposites = months.map(function(m) {
        var ini = start.advance(m, 'month');
        var fin = ini.advance(1, 'month');
        var monthCollection = s2.filterDate(ini, fin)
            .map(function(img){ return calculateFAI(img, finalMask); });

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
    var finalCollection = ee.ImageCollection.fromImages(
        monthlyComposites.removeAll([null])
    );

    // 10. Imagen promedio (la mediana es la más representativa para la visualización principal)
    var laImagenResultante = finalCollection.select('FAI_median').mean();
    
    // ========================================
    // ADAPTACIÓN AL ENTORNO DE LA PLATAFORMA
    // ========================================

    return {
        // Imagen principal a mostrar en el mapa.
        laImagenResultante: laImagenResultante,
        
        // Colección de datos para la gráfica de series de tiempo.
        collectionForChart: finalCollection,
        bandNameForChart: 'FAI_median', // Banda principal para la gráfica
        
        // Parámetros de visualización del script original.
        visParams: {
            min: -0.05,
            max: 0.2, // Valor del script original
            palette: ['#000080', '#00FFFF', '#00FF00', '#FFFF00', '#FF8000', '#FF0000'],
            bandName: 'FAI Promedio (Mediana)',
            unit: ''
        }
    };
};
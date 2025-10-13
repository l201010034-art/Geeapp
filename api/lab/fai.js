// /api/lab/fai.js - VERSIÓN OPTIMIZADA Y ADAPTADA PARA GEEAPP
const ee = require('@google/earthengine');

/**
 * Maneja el análisis de FAI (Índice de Algas Flotantes) para sargazo.
 * Esta versión utiliza una máscara oceánica precisa y calcula compuestos mensuales
 * de mínimo, mediana y máximo, ideal para consultas en rangos de fechas extensos.
 */
module.exports.handleAnalysis = async function ({ roi, startDate, endDate }) {
    const region = ee.Geometry(roi);
    const start = ee.Date(startDate);
    const end = ee.Date(endDate);

    // 1. FILTRADO DE NUBES Y CIRROS
    const maskClouds = function(image) {
        const qa = image.select('QA60');
        const cloudBitMask = 1 << 10;
        const cirrusBitMask = 1 << 11;
        const mask = qa.bitwiseAnd(cloudBitMask).eq(0)
                       .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
        return image.updateMask(mask);
    };

    // 2. MÁSCARA OCEÁNICA PRECISA
    // Combina JRC para agua permanente y GEBCO para asegurar que sea océano (excluye lagos/ríos).
    const waterMask = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').gt(80);
    const gebco = ee.Image('projects/residenciaproject-443903/assets/gebco_2025').select('b1').rename('elevation');
    const oceanMask = gebco.lte(0);
    const finalMask = waterMask.and(oceanMask);

    // 3. FUNCIÓN PARA CALCULAR FAI
    // Se aplica la máscara oceánica directamente en el retorno.
    const calculateFAI = function(image) {
        // Escala las bandas reflectivas. La fórmula FAI original no requiere escalado,
        // pero es buena práctica hacerlo si se combinan con otros índices.
        // Para mantener la consistencia con tu script original, no se escala aquí.
        const red = image.select('B4');
        const nir = image.select('B8A');
        const swir = image.select('B12');
        
        const fai = nir.subtract(red)
            .add(swir.subtract(red).multiply(864.7 - 664.6)
            .divide(2185.7 - 664.6));
            
        return image.addBands(fai.rename('FAI')).updateMask(finalMask);
    };

    // 4. COLECCIÓN SENTINEL-2 PRE-FILTRADA
    const s2Collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(region)
        .filterDate(start, end)
        .map(maskClouds);

    // 5. GENERACIÓN DE COMPUESTOS MENSUALES (Min, Max, Mediana)
    const months = ee.List.sequence(0, end.difference(start, 'month').round().subtract(1));
    
    const monthlyComposites = months.map(function(m) {
        const ini = start.advance(m, 'month');
        const fin = ini.advance(1, 'month');
        const monthCollection = s2Collection.filterDate(ini, fin).map(calculateFAI);

        // Se usa ee.Algorithms.If para manejar meses sin imágenes y evitar errores.
        return ee.Algorithms.If(
            monthCollection.size().gt(0),
            ee.Image.cat([
                monthCollection.min().select('FAI').rename('FAI_min'),
                monthCollection.median().select('FAI').rename('FAI_median'),
                monthCollection.max().select('FAI').rename('FAI_max')
            ]).set('system:time_start', ini.millis()),
            null // Retorna nulo si no hay imágenes en el mes.
        );
    });

    // 6. COLECCIÓN FINAL Y RESULTADO PROMEDIO
    // Se eliminan los meses que no tuvieron imágenes.
    const finalCollection = ee.ImageCollection.fromImages(monthlyComposites.removeAll([null]));
    
    // Se calcula el promedio de las medianas mensuales para la visualización principal.
    const laImagenResultante = finalCollection.select('FAI_median').mean();

    // 7. OBJETO DE RETORNO PARA LA PLATAFORMA GEEAPP
    return {
        // Imagen principal a mostrar en el mapa (el promedio de las medianas).
        laImagenResultante: laImagenResultante,
        
        // Colección de datos para la gráfica de series de tiempo (usamos la mediana).
        collectionForChart: finalCollection.select(['FAI_median', 'FAI_min', 'FAI_max']),
        bandNameForChart: 'FAI_median',
        
        // Parámetros de visualización que corregimos anteriormente.
        visParams: {
            min: -0.05,
            max: 0.5,
            palette: ['#000080', '#00FFFF', '#00FF00', '#FFFF00', '#FF8000', '#FF0000'],
            bandName: 'FAI Promedio (Mediana)',
            unit: '' // El FAI es un índice adimensional.
        }
    };
};
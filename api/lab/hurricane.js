const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ hurricaneSid, hurricaneName, year }) {
    // La lógica para obtener la trayectoria del huracán no cambia.
    const points = ee.FeatureCollection('NOAA/IBTrACS/v4')
        .filter(ee.Filter.eq('SID', hurricaneSid))
        .filter(ee.Filter.bounds(ee.Geometry.Point(0,0).buffer(2e7)));

    const maxTime = points.aggregate_max('system:time_start');
    const lastPointDate = ee.Date(ee.Algorithms.If(maxTime, maxTime, `${year}-12-31`));
    
    // --- ▼▼▼ LÓGICA DE PROCESAMIENTO DE IMAGEN CORREGIDA Y ROBUSTA ▼▼▼ ---

    // 1. Definimos una función que procesa CADA imagen de la colección.
    const processSSTImage = function(image) {
        // Para cada imagen, seleccionamos la banda 'sst', la escalamos,
        // y nos aseguramos de que solo esta banda continúe en el proceso.
        return image
            .select('sst')        // Selecciona solo la banda de temperatura
            .multiply(0.01)       // Aplica el factor de escala
            .rename('sst');       // Asegura que el nombre de la banda sea consistente
    };

    // 2. Aplicamos esa función a toda la colección y luego calculamos la media.
    // El resultado de esto es GARANTIZADO que será una imagen de una sola banda.
    const sst = ee.ImageCollection('NOAA/CDR/OISST/V2_1')
        .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
        .map(processSSTImage) // <-- Aplicamos nuestra función de limpieza aquí
        .mean();              // <-- Ahora la media se calcula sobre imágenes limpias

    // 3. Visualizamos la imagen de una sola banda. Ya no se necesita el .select() aquí.
    const sstImage = sst.visualize({
        min: 20, 
        max: 32, 
        palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']
    });

    // --- ▲▲▲ FIN DE LA LÓGICA CORREGIDA ▲▲▲ ---
    
    const line = ee.Geometry.LineString(points.sort('ISO_TIME').geometry().coordinates());
    const trajectoryLine = ee.FeatureCollection(line).style({color: 'FFFFFF', width: 1.5});

    const styles = { 'Tropical Storm': {color: '00FFFF', pointSize: 3}, 'Category 1': {color: '00FF00', pointSize: 4}, 'Category 2': {color: 'FFFF00', pointSize: 5}, 'Category 3': {color: 'FF8C00', pointSize: 6}, 'Category 4': {color: 'FF0000', pointSize: 7}, 'Category 5': {color: 'FF00FF', pointSize: 8}};

    const pointsStyled = points.map(function(feature) {
        const wind = ee.Number(feature.get('USA_WIND'));
        const category = ee.String(ee.Algorithms.If(wind.gt(136), 'Category 5', ee.Algorithms.If(wind.gt(112), 'Category 4', ee.Algorithms.If(wind.gt(95),  'Category 3', ee.Algorithms.If(wind.gt(82),  'Category 2', ee.Algorithms.If(wind.gt(63),  'Category 1', 'Tropical Storm'))))));
        return feature.set('styleArgs', ee.Dictionary(styles).get(category));
    });

    const intensityPoints = pointsStyled.style({styleProperty: 'styleArgs'});
    
// UBICACIÓN: /api/lab/hurricane.js
// REEMPLAZA el objeto 'return' al final de la función con este.
    return {
        laImagenResultante: sstImage.blend(trajectoryLine).blend(intensityPoints),
        collectionForChart: null,
        bandNameForChart: null,
        // Devolvemos los parámetros base para que la IA los entienda
        visParams: {
            bandName: `Huracán: ${hurricaneName} (${year})`,
            unit: 'SST',
            min: 20,
            max: 32,
            palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
            // Y añadimos una sección especial para la leyenda personalizada
            customLegend: {
                type: 'hurricane',
                items: [
                    { label: 'Cat. 5', color: '#FF00FF' },
                    { label: 'Cat. 4', color: '#FF0000' },
                    { label: 'Cat. 3', color: '#FF8C00' },
                    { label: 'Cat. 2', color: '#FFFF00' },
                    { label: 'Cat. 1', color: '#00FF00' },
                    { label: 'Torm./Dep. Tropical', color: '#00FFFF' }
                ]
            }
        }
    };
}
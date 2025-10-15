// UBICACIÓN: /api/lab/hurricane.js
// REEMPLAZA TODO EL CONTENIDO DEL ARCHIVO CON ESTE CÓDIGO.
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ hurricaneSid, hurricaneName, year }) {
    const points = ee.FeatureCollection('NOAA/IBTrACS/v4').filter(ee.Filter.eq('SID', hurricaneSid));
    const maxTime = points.aggregate_max('system:time_start');
    const lastPointDate = ee.Date(ee.Algorithms.If(maxTime, maxTime, `${year}-12-31`));
    
    const sst = ee.ImageCollection('NOAA/CDR/OISST/V2_1')
        .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
        .select(['sst'])
        .mean()
        .multiply(0.01);

    // --- ▼▼▼ LA CORRECCIÓN MÁS IMPORTANTE Y DEFINITIVA ▼▼▼ ---

    // 1. En lugar de visualizar 'sst' directamente, creamos una nueva imagen
    //    que es explícitamente y únicamente la banda 'sst'.
    //    Esto crea un "clon limpio" de la imagen, eliminando cualquier metadato fantasma.
    const sstDeUnaSolaBanda = sst.select('sst');

    // 2. Ahora, visualizamos este clon limpio y garantizado de una sola banda.
    const sstImage = sstDeUnaSolaBanda.visualize({
        min: 20, max: 32, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']
    });

    // --- ▲▲▲ FIN DE LA CORRECCIÓN ▲▲▲ ---

    const line = ee.Geometry.LineString(points.sort('ISO_TIME').geometry().coordinates());
    const trajectoryLine = ee.FeatureCollection(line).style({color: 'FFFFFF', width: 1.5});
    const styles = { 'Tropical Storm': {color: '00FFFF', pointSize: 3}, 'Category 1': {color: '00FF00', pointSize: 4}, 'Category 2': {color: 'FFFF00', pointSize: 5}, 'Category 3': {color: 'FF8C00', pointSize: 6}, 'Category 4': {color: 'FF0000', pointSize: 7}, 'Category 5': {color: 'FF00FF', pointSize: 8}};
    const pointsStyled = points.map(function(feature) {
        const wind = ee.Number(feature.get('USA_WIND'));
        const category = ee.String(ee.Algorithms.If(wind.gt(136), 'Category 5', ee.Algorithms.If(wind.gt(112), 'Category 4', ee.Algorithms.If(wind.gt(95),  'Category 3', ee.Algorithms.If(wind.gt(82),  'Category 2', ee.Algorithms.If(wind.gt(63),  'Category 1', 'Tropical Storm'))))));
        return feature.set('styleArgs', ee.Dictionary(styles).get(category));
    });
    const intensityPoints = pointsStyled.style({styleProperty: 'styleArgs'});

    return {
        laImagenResultante: sstImage.blend(trajectoryLine).blend(intensityPoints),
        collectionForChart: null,
        bandNameForChart: null,
        // ▼▼▼ SECCIÓN CORREGIDA ▼▼▼
        visParams: {
            // Se eliminan las claves: min, max, y palette.
            bandName: `Huracán: ${hurricaneName} (${year})`,
            unit: 'SST',
            customLegend: { // La leyenda personalizada se mantiene para el frontend.
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
        // ▲▲▲ FIN DE LA SECCIÓN CORREGIDA ▲▲▲
    };
}
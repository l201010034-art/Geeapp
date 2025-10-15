const ee = require('@google/earthengine');

// Para el caso de huracanes, la función recibe los parámetros específicos
module.exports.handleAnalysis= async function ({ hurricaneSid, hurricaneName, year }) {
    const points = ee.FeatureCollection('NOAA/IBTrACS/v4')
        .filter(ee.Filter.eq('SID', hurricaneSid))
        .filter(ee.Filter.bounds(ee.Geometry.Point(0,0).buffer(2e7)));

    const maxTime = points.aggregate_max('system:time_start');
    const lastPointDate = ee.Date(ee.Algorithms.If(maxTime, maxTime, `${year}-12-31`));
    
    const sst = ee.ImageCollection('NOAA/CDR/OISST/V2_1')
        .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
        .select(['sst']).mean().multiply(0.01);
    
    const sstImage = sst.select('sst').visualize({min: 20, max: 32, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']});
    
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
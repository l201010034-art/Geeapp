// UBICACIÓN: /api/lab/hurricane.js
// REEMPLAZA toda la función con esta versión.
const ee = require('@google/earthengine');

module.exports.handleAnalysis = async function ({ hurricaneSid, hurricaneName, year }) {
    // La lógica para obtener la trayectoria del huracán no cambia.
    const points = ee.FeatureCollection('NOAA/IBTrACS/v4').filter(ee.Filter.eq('SID', hurricaneSid));
    const maxTime = points.aggregate_max('system:time_start');
    const lastPointDate = ee.Date(ee.Algorithms.If(maxTime, maxTime, `${year}-12-31`));
    
    // Lógica de procesamiento de la imagen.
    const sst = ee.ImageCollection('NOAA/CDR/OISST/V2_1')
        .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
        .select(['sst'])
        .mean()
        .multiply(0.01);

    // --- ▼▼▼ DEBUG CHECKPOINT 1 (SERVIDOR) ▼▼▼ ---
    // Este código se ejecutará en el servidor de Vercel y nos dirá las bandas de la imagen.
    await new Promise((resolve, reject) => {
        sst.bandNames().evaluate((bandas, error) => {
            if (error) {
                console.error('ERROR AL EVALUAR BANDAS:', error);
                reject(error);
            } else {
                console.log('[DEBUG-SERVER 1/2] Bandas de la imagen "sst" ANTES de visualizar:', bandas);
                resolve(bandas);
            }
        });
    });
    // --- ▲▲▲ FIN DEL DEBUG ▲▲▲ ---

    const sstImage = sst.select('sst').visualize({
        min: 20, max: 32, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']
    });

    // El resto de la lógica no cambia.
    const line = ee.Geometry.LineString(points.sort('ISO_TIME').geometry().coordinates());
    // ... (resto del código de la función sin cambios) ...
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
        visParams: {
            bandName: `Huracán: ${hurricaneName} (${year})`,
            unit: 'SST',
            min: 20,
            max: 32,
            palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000'],
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
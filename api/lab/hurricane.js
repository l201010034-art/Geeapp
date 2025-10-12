import ee from '@google/earthengine';

// Para el caso de huracanes, la función recibe los parámetros específicos
export async function handleAnalysis({ hurricaneSid, hurricaneName, year }) {
    const points = ee.FeatureCollection('NOAA/IBTrACS/v4')
        .filter(ee.Filter.eq('SID', hurricaneSid))
        .filter(ee.Filter.bounds(ee.Geometry.Point(0,0).buffer(2e7)));

    const maxTime = points.aggregate_max('system:time_start');
    const lastPointDate = ee.Date(ee.Algorithms.If(maxTime, maxTime, `${year}-12-31`));
    
    const sst = ee.ImageCollection('NOAA/CDR/OISST/V2.1')
        .filterDate(lastPointDate.advance(-2, 'day'), lastPointDate.advance(2, 'day'))
        .select(['sst']).mean().multiply(0.01);
    
    const sstImage = sst.visualize({min: 20, max: 32, palette: ['#000080', '#00FFFF', '#FFFF00', '#FF0000']});
    
    const line = ee.Geometry.LineString(points.sort('ISO_TIME').geometry().coordinates());
    const trajectoryLine = ee.FeatureCollection(line).style({color: 'FFFFFF', width: 1.5});

    const styles = { 'Tropical Storm': {color: '00FFFF', pointSize: 3}, 'Category 1': {color: '00FF00', pointSize: 4}, 'Category 2': {color: 'FFFF00', pointSize: 5}, 'Category 3': {color: 'FF8C00', pointSize: 6}, 'Category 4': {color: 'FF0000', pointSize: 7}, 'Category 5': {color: 'FF00FF', pointSize: 8}};

    const pointsStyled = points.map(function(feature) {
        const wind = ee.Number(feature.get('USA_WIND'));
        const category = ee.String(ee.Algorithms.If(wind.gt(136), 'Category 5', ee.Algorithms.If(wind.gt(112), 'Category 4', ee.Algorithms.If(wind.gt(95),  'Category 3', ee.Algorithms.If(wind.gt(82),  'Category 2', ee.Algorithms.If(wind.gt(63),  'Category 1', 'Tropical Storm'))))));
        return feature.set('styleArgs', ee.Dictionary(styles).get(category));
    });

    const intensityPoints = pointsStyled.style({styleProperty: 'styleArgs'});
    
    // Devolvemos las variables finales
    return {
        laImagenResultante: sstImage.blend(trajectoryLine).blend(intensityPoints),
        collectionForChart: null,
        bandNameForChart: null,
        visParams: {
            description: `
                <div class="legend-title">Huracán: ${hurricaneName} (${year})</div>
                <div style="font-size: 11px; margin-top: 4px;"><strong>Temperatura del Mar (°C)</strong></div>
                <div class="legend-scale-bar" style="background: linear-gradient(to right, #000080, #00FFFF, #FFFF00, #FF0000);"></div>
                <div class="legend-labels" style="font-size: 11px;"><span>20</span><span>32</span></div>
                <div style="font-size: 11px; margin-top: 4px;"><strong>Intensidad (Saffir-Simpson)</strong></div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF00FF; border-radius: 50%; margin-right: 5px;"></div> Cat. 5</div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF0000; border-radius: 50%; margin-right: 5px;"></div> Cat. 4</div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FF8C00; border-radius: 50%; margin-right: 5px;"></div> Cat. 3</div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #FFFF00; border-radius: 50%; margin-right: 5px;"></div> Cat. 2</div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #00FF00; border-radius: 50%; margin-right: 5px;"></div> Cat. 1</div>
                <div style="display: flex; align-items: center; font-size: 11px;"><div style="width: 10px; height: 10px; background-color: #00FFFF; border-radius: 50%; margin-right: 5px;"></div> Torm./Dep. Tropical</div>
            `
        }
    };
}
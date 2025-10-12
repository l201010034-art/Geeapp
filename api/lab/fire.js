import ee from '@google/earthengine';

export async function handleAnalysis({ roi, startDate, endDate }) {
    const fires = ee.ImageCollection('FIRMS')
        .filterBounds(roi)
        .filterDate(startDate, endDate)
        .select('T21');

    return {
        // Usamos focal_max para crear un mapa de densidad visualmente más útil
        laImagenResultante: fires.reduce(ee.Reducer.max()).focal_max({radius: 3000, units: 'meters'}),
        collectionForChart: null, // Los mapas de incendios no suelen tener gráficos de serie temporal
        bandNameForChart: null,
        visParams: {
            min: 330, max: 360, palette: ['yellow', 'orange', 'red', 'purple'],
            bandName: 'Puntos de Calor (Temp. Brillo)', unit: 'K'
        }
    };
}
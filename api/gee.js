// Importa la biblioteca de Google Earth Engine
const ee = require('@google/earthengine');

// Define una función asincrónica principal que manejará las solicitudes.
// Vercel ejecutará esta función cada vez que se haga una petición a /api/gee
export default async function handler(req, res) {
    // Solo permite peticiones POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        // --- Autenticación y Arranque de GEE ---
        // Obtiene las credenciales desde las variables de entorno de Vercel
        const clientEmail = process.env.EE_SERVICE_ACCOUNT_EMAIL;
        
        // La clave privada puede tener problemas de formato. 
        // Este reemplazo asegura que los saltos de línea (\n) se interpreten correctamente.
        const privateKey = process.env.EE_PRIVATE_KEY.replace(/\\n/g, '\n');

        // Verifica si las credenciales existen. Si no, devuelve un error claro.
        if (!clientEmail || !privateKey) {
            console.error('GEE Auth Error: Las variables de entorno EE_SERVICE_ACCOUNT_EMAIL o EE_PRIVATE_KEY no están definidas.');
            return res.status(500).json({ error: 'Error de configuración del servidor: Faltan credenciales de GEE.' });
        }

        const credentials = { client_email: clientEmail, private_key: privateKey };

        // Autentica y luego inicializa la sesión con GEE.
        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey(credentials, () => {
                ee.initialize(null, null, resolve, reject);
            }, (error) => {
                console.error('GEE Authentication failed:', error);
                reject(new Error('La autenticación con Google Earth Engine falló. Revisa las credenciales.'));
            });
        });

        // --- Procesamiento de la Petición ---
        // Extrae los parámetros enviados desde el frontend (index.html)
        const { action, params } = req.body;

        // Aquí iría toda la lógica compleja de tu script original de GEE.
        // Por simplicidad en este ejemplo, se manejará una acción básica.
        // En una implementación real, aquí llamarías a tus funciones 'handleSpiAnalysis', 'handleFireRisk', etc.
        
        let result;
        if (action === 'getMapId') {
            // Ejemplo: Generar un MapId para una capa de temperatura
            const image = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
                .filterDate(params.startDate, params.endDate)
                .select('temperature_2m')
                .mean()
                .subtract(273.15); // Convertir de Kelvin a Celsius

            const visParams = { min: 20, max: 40, palette: ['blue', 'cyan', 'yellow', 'red'] };
            const mapIdObject = await getMapId(image.clip(ee.Geometry.Polygon(params.roi.coordinates)), visParams);
            result = mapIdObject;

        } else if (action === 'getChartData') {
             // Lógica para generar datos para un gráfico
             // Esta sección necesitaría ser implementada para replicar la funcionalidad de gráficos.
             // Por ahora, devolvemos datos de ejemplo.
            result = { message: "La funcionalidad de gráfico aún no está implementada en este ejemplo." };

        } else {
            // Si la acción no es reconocida, devuelve un error.
            return res.status(400).json({ error: 'Acción no reconocida.' });
        }
        
        // Envía el resultado (ej. el MapId) de vuelta al frontend.
        res.status(200).json(result);

    } catch (error) {
        // Si ocurre cualquier error durante el proceso, se captura aquí.
        console.error('Error en la función del servidor GEE:', error);
        // Devuelve un error 500 con un mensaje detallado.
        res.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
}

/**
 * Función auxiliar para envolver ee.Image.getMapId en una Promesa,
 * ya que su API se basa en callbacks.
 * @param {ee.Image} image El objeto ee.Image a visualizar.
 * @param {object} visParams Los parámetros de visualización.
 * @returns {Promise<object>} Una promesa que se resuelve con el objeto MapId.
 */
function getMapId(image, visParams) {
    return new Promise((resolve, reject) => {
        image.getMapId(visParams, (mapid, error) => {
            if (error) {
                console.error('Error al obtener MapId de GEE:', error);
                reject(new Error('No se pudo generar la capa del mapa desde GEE.'));
            } else {
                resolve(mapid);
            }
        });
    });
}


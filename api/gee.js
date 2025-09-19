// Importa la biblioteca de Google Earth Engine
const ee = require('@google/earthengine');

// Define una función asincrónica principal que manejará las solicitudes.
// Vercel ejecutará esta función cada vez que se haga una petición a /api/gee
export default async function handler(req, res) {
    // Imprime el cuerpo de la solicitud para depuración
    console.log('Cuerpo de la solicitud recibida:', JSON.stringify(req.body, null, 2));

    // Solo permite peticiones POST
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }

    try {
        // --- Autenticación y Arranque de GEE ---
        const clientEmail = process.env.EE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.EE_PRIVATE_KEY.replace(/\\n/g, '\n');

        if (!clientEmail || !privateKey) {
            console.error('GEE Auth Error: Las variables de entorno EE_SERVICE_ACCOUNT_EMAIL o EE_PRIVATE_KEY no están definidas.');
            return res.status(500).json({ error: 'Error de configuración del servidor: Faltan credenciales de GEE.' });
        }

        const credentials = { client_email: clientEmail, private_key: privateKey };

        await new Promise((resolve, reject) => {
            ee.data.authenticateViaPrivateKey(credentials, () => {
                ee.initialize(null, null, resolve, reject);
            }, (error) => {
                console.error('Fallo en la autenticación de GEE:', error);
                reject(new Error('La autenticación con Google Earth Engine falló. Revisa las credenciales en Vercel.'));
            });
        });

        // --- Procesamiento de la Petición ---
        const { action, params } = req.body;

        // Valida que los parámetros necesarios existan
        if (!action || !params) {
            console.error('Solicitud incorrecta: Falta "action" o "params" en el cuerpo de la solicitud.');
            return res.status(400).json({ error: 'Solicitud incorrecta: Faltan los parámetros "action" o "params".' });
        }
        
        let result;
        if (action === 'getMapId') {
            const image = ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
                .filterDate(params.startDate, params.endDate)
                .select('temperature_2m')
                .mean()
                .subtract(273.15); 

            const visParams = { min: 20, max: 40, palette: ['blue', 'cyan', 'yellow', 'red'] };
            const mapIdObject = await getMapId(image.clip(ee.Geometry.Polygon(params.roi.coordinates)), visParams);
            result = mapIdObject;

        } else if (action === 'getChartData') {
            result = { message: "La funcionalidad de gráfico aún no está implementada en este ejemplo." };

        } else {
            return res.status(400).json({ error: 'Acción no reconocida.' });
        }
        
        res.status(200).json(result);

    } catch (error) {
        // --- REGISTRO DE ERRORES MEJORADO ---
        console.error('--- ERROR DETALLADO DEL SERVIDOR GEE ---');
        console.error('Mensaje de Error:', error.message);
        console.error('Pila de Error:', error.stack);
        console.error('Objeto de Error Completo:', JSON.stringify(error, null, 2));
        console.error('--- FIN DEL INFORME DE ERROR ---');
        
        res.status(500).json({ error: 'Error interno del servidor.', details: error.message });
    }
}

/**
 * Función auxiliar para envolver ee.Image.getMapId en una Promesa.
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


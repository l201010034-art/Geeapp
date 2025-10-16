// Cargar variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const path = require('path');
const app = express();

// Middleware para parsear el cuerpo de las peticiones JSON
app.use(express.json());

// --- Importar la lógica de las funciones serverless ---
const askGeoHandler = require('./api/ask-geo.js');
const geeHandler = require('./api/gee.js');
const geeLabHandler = require('./api/gee-lab.js');
const generateTextHandler = require('./api/generate-text.js');
const analyzeHandler = require('./api/analyze.js'); // <-- LÍNEA AÑADIDA

// --- Definir las rutas de la API ---
// Express usa (req, res), que es el mismo formato que Vercel, por lo que la adaptación es directa.
app.post('/api/ask-geo', askGeoHandler);
app.post('/api/gee', geeHandler);
app.post('/api/gee-lab', geeLabHandler);
app.post('/api/generate-text', generateTextHandler);
app.post('/api/analyze', analyzeHandler); // <-- LÍNEA AÑADIDA

// --- Servir los archivos estáticos del Frontend ---
// Sirve todos los archivos (HTML, JS, CSS, assets) desde la raíz del proyecto.
app.use(express.static(path.join(__dirname, '/')));

// Ruta principal que sirve la aplicación
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'plataforma.html'));
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de la Plataforma Climática corriendo en http://localhost:${PORT}`);
});
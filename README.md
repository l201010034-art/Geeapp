# Plataforma de Monitoreo Climático para Campeche

## Descripción del Proyecto

Esta es una aplicación web geoespacial avanzada diseñada para el análisis y la visualización de datos climáticos y ambientales del estado de Campeche, México. La plataforma integra datos de múltiples satélites a través de **Google Earth Engine** y utiliza la potencia de la **IA de Google Gemini** para ofrecer análisis interpretativos, un asistente conversacional (GeoBot) y recomendaciones personalizadas.

## Características Principales

-   **Visualización de Datos en Mapa:** Muestra capas de datos climáticos (Temperatura, Precipitación, Humedad, etc.) sobre un mapa interactivo.
-   **Análisis Geoespacial Flexible:** Permite analizar datos por municipios de Campeche, zonas predefinidas y áreas dibujadas por el usuario.
-   **Laboratorio de IA:** Módulos de análisis especializados para casos de uso avanzados como NDVI (Vegetación), LST (Mapa de Calor), Monitoreo de Sargazo (FAI), Calidad del Aire (NO2), entre otros.
-   **Asistente "GeoBot":** Un chatbot impulsado por IA que actúa como guía de la plataforma, experto en geociencias y consultor, ofreciendo recomendaciones de análisis según el perfil del usuario (Educativo, Protección Civil, Agricultura, etc.).
-   **Generación de Reportes:** Permite descargar los datos del gráfico en formato CSV, la imagen del gráfico en PNG y un reporte completo del análisis en formato PDF.

## Pila Tecnológica (Tech Stack)

-   **Frontend:**
    -   HTML5, CSS3, JavaScript (ESM)
    -   **Framework CSS:** TailwindCSS (vía CDN)
    -   **Mapas:** Leaflet.js con Leaflet.draw
    -   **Gráficos:** Google Charts
    -   **Reportes PDF:** jsPDF & html2canvas
-   **Backend (Serverless / Tradicional):**
    -   Node.js
    -   **Plataforma Sugerida:** Vercel (para despliegue serverless)
    -   **Adaptación a Servidor Propio:** Express.js
-   **APIs y Servicios Externos:**
    -   **Google Earth Engine:** Para el procesamiento de datos geoespaciales.
    -   **Google AI (Gemini Pro):** Para todas las funcionalidades de IA.

## 1. Prerrequisitos

Antes de desplegar la aplicación, necesitarás tener lo siguiente:

1.  **Node.js y npm:** Instalados en tu máquina local o en el entorno de despliegue. Se recomienda una versión LTS (ej. 18.x o superior).
2.  **Cuenta de Google Cloud Platform (GCP):** Un proyecto activo en GCP.
3.  **Cuenta de Servicio de GCP:**
    -   Dentro de tu proyecto de GCP, crea una **Cuenta de Servicio** (Service Account).
    -   Habilita la **API de Google Earth Engine** en tu proyecto y dale permisos a tu cuenta de servicio para usarla (rol de "Usuario de Earth Engine").
    -   Genera una **clave JSON** para esta cuenta de servicio y descárgala.
4.  **Clave de API de Gemini:**
    -   Ve a **Google AI Studio**.
    -   Crea una clave de API para el modelo Gemini.

## 2. Configuración de Variables de Entorno

Esta aplicación requiere claves secretas para funcionar. Deberás crear un archivo `.env` en la raíz del proyecto. En plataformas como Vercel, estas se configuran en el panel de control.

Crea un archivo llamado `.env` con el siguiente contenido:

```env
# Clave de API para Google Gemini
# Obtenida desde Google AI Studio
GEMINI_API_KEY="AIzaSy...tu...clave...aqui"

# Credenciales para Google Earth Engine
# Obtenidas del archivo JSON de tu Cuenta de Servicio de GCP

# 1. Copia el valor del campo "client_email" del archivo JSON
EE_SERVICE_ACCOUNT_EMAIL="tu-cuenta-de-servicio@tu-proyecto.iam.gserviceaccount.com"

# 2. Copia el valor del campo "private_key". 
# ¡IMPORTANTE! Debe estar entre comillas dobles y los saltos de línea (\n) deben mantenerse.
EE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n...tus...saltos...de...linea...\n...\n-----END PRIVATE KEY-----\n"

# Puerto para el servidor Express (solo para despliegue en servidor propio)
PORT=3000
```

### ¿Cómo formatear la `EE_PRIVATE_KEY`?

El valor de `private_key` en el archivo JSON es un bloque de texto largo con saltos de línea (`\n`). Es crucial mantener este formato. Cópialo tal cual y pégalo entre comillas dobles `"` en tu archivo `.env`.

## 3. Guía de Despliegue

### Opción A: Despliegue en Plataformas Serverless (Ej. Vercel)

Este es el método más simple y recomendado si no se cuenta con un servidor propio.

1.  **Repositorio Git:** Asegúrate de que todo tu código esté en un repositorio de Git (GitHub, GitLab, etc.).
2.  **`package.json`:** Utiliza el siguiente `package.json` en la raíz de tu proyecto:
    ```json
    {
      "name": "plataforma-climatica-campeche",
      "version": "1.0.0",
      "private": true,
      "dependencies": {
        "@google/earthengine": "^0.1.391",
        "@google/generative-ai": "^0.1.3"
      }
    }
    ```
3.  **Configura el Proyecto en Vercel:**
    -   Crea un nuevo proyecto en Vercel e impórtalo desde tu repositorio de Git.
    -   Vercel detectará automáticamente el directorio `/api` como funciones serverless. No se necesita configuración de build.
    -   Ve a `Settings -> Environment Variables` y añade las tres variables de entorno (`GEMINI_API_KEY`, `EE_SERVICE_ACCOUNT_EMAIL`, `EE_PRIVATE_KEY`).
4.  **Despliega:** Lanza el despliegue desde el panel de Vercel.

### Opción B: Despliegue en Servidores Propios (Locales, Gubernamentales)

Este método requiere adaptar el backend a un servidor Node.js tradicional usando el framework **Express.js**.

#### Paso 1: Actualizar Dependencias

Modifica tu `package.json` para incluir `express` y `dotenv`:

**`package.json`:**
```json
{
  "name": "gee-app",
  "version": "1.0.0",
  "description": "Aplicación climática de Campeche con GEE y Vercel",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "@google/earthengine": "^0.1.391",
    "@google/generative-ai": "^0.24.1",
    "express": "^5.1.0"
  },
  "engines": {
    "node": "22.x"
  }
}

```

#### Paso 2: Crear el Servidor (`server.js`)

Crea un nuevo archivo llamado `server.js` en la raíz de tu proyecto. Este archivo actuará como tu servidor principal.

**`server.js`:**
```javascript
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
// NOTA: Los módulos del laboratorio (ndvi.js, etc.) son importados por gee-lab.js, no necesitan ruta aquí.

// --- Definir las rutas de la API ---
// Express usa (req, res), que es el mismo formato que Vercel, por lo que la adaptación es directa.
app.post('/api/ask-geo', askGeoHandler);
app.post('/api/gee', geeHandler);
app.post('/api/gee-lab', geeLabHandler);
app.post('/api/generate-text', generateTextHandler);

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
```

#### Paso 3: Adaptar los Archivos de la API

Los archivos en el directorio `/api` están escritos en formato `module.exports`. Este formato es compatible tanto con Vercel como con Node.js, por lo que **no se necesitan cambios en los archivos dentro de `/api`**.

#### Paso 4: Pasos para el Despliegue en Servidor Propio

1.  **Prerrequisitos:** Asegúrate de que **Node.js** y **npm** estén instalados en el servidor.
2.  **Transferir Archivos:** Copia todo el proyecto (incluyendo `server.js`, `package.json`, etc.) al servidor.
3.  **Configurar `.env`:** Crea el archivo `.env` en la raíz del proyecto en el servidor con las claves de API correspondientes.
4.  **Instalar Dependencias:** En la terminal del servidor, navega a la carpeta del proyecto y ejecuta:
    ```bash
    npm install
    ```
5.  **Iniciar el Servidor:**
    ```bash
    npm start
    ```
    La aplicación estará accesible en la IP del servidor y el puerto configurado (ej. `http://tu-ip-de-servidor:3000`).

#### Recomendación para Producción

Para mantener la aplicación corriendo de forma continua y reiniciarla automáticamente si falla, se recomienda usar un gestor de procesos como **PM2**.

-   **Instalar PM2 globalmente:** `npm install pm2 -g`
-   **Iniciar la aplicación con PM2:** `pm2 start server.js --name "plataforma-climatica"`
-   **Monitorear:** `pm2 monit`

## Estructura del Proyecto

```
/
├── server.js               # (Solo para servidor propio)
├── package.json
├── .env                    # (No subir a Git)
├── README.md
│
├── plataforma.html         # Archivo principal de la aplicación
├── platform-main.js
├── ai-connector.js
├── ... (otros archivos JS y CSS del frontend)
│
├── assets/
│
└── api/                    # Directorio para las funciones Serverless / Rutas de API
    ├── ask-geo.js
    ├── gee.js
    └── ... (etc.)
```
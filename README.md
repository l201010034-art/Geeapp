Aplicación Web del Informe Climático de Campeche
Esta es una aplicación web interactiva que visualiza y analiza datos climáticos para el estado de Campeche, México. Es una implementación del script original de Google Earth Engine (GEE) diseñada para ser desplegada en Vercel.

Características
Visualización de múltiples variables climáticas (Temperatura, Humedad, Precipitación, etc.).

Selección de zonas predefinidas o dibujo de áreas de interés personalizadas.

Generación de gráficos de series temporales.

Comparación de datos entre múltiples zonas.

Análisis específicos:

Precipitación: Acumulada, intensidad y frecuencia.

Temperatura: Olas de calor y heladas.

Sequía: Cálculo del Índice de Precipitación Estandarizado (SPI).

Riesgo de Incendio: Mapa de riesgo basado en LST y SPI.

Requisitos Previos
Node.js: Necesitarás Node.js instalado en tu máquina para desarrollo local.

Cuenta de Google Earth Engine: Debes tener acceso a GEE.

Proyecto en Google Cloud: Necesitarás un proyecto en Google Cloud Platform (GCP) para crear credenciales de servicio.

Cuenta en Vercel: Para desplegar la aplicación.

Paso 1: Configurar la Autenticación de Google Earth Engine
La aplicación necesita "hablar" con GEE de forma segura. Para ello, crearemos una Cuenta de Servicio en Google Cloud.

Ve a tu Proyecto de Google Cloud:

Abre la consola de Google Cloud.

Selecciona el proyecto que usarás para GEE o crea uno nuevo.

Habilita la API de Earth Engine:

En la barra de búsqueda, escribe "Earth Engine API".

Selecciónala y haz clic en HABILITAR.

Crea una Cuenta de Servicio:

Ve a IAM y administración > Cuentas de servicio.

Haz clic en + CREAR CUENTA DE SERVICIO.

Dale un nombre (ej. gee-webapp-runner) y una descripción. Haz clic en CREAR Y CONTINUAR.

En el paso de "roles", asigna el rol: Earth Engine Resource User. Haz clic en CONTINUAR y luego en LISTO.

Genera una Clave JSON:

Busca la cuenta que acabas de crear en la lista.

Haz clic en los tres puntos bajo "Acciones" y selecciona Administrar claves.

Haz clic en AGREGAR CLAVE > Crear clave nueva.

Elige el tipo JSON y haz clic en CREAR.

Se descargará un archivo .json. ¡Guárdalo en un lugar seguro! Lo necesitarás para el siguiente paso.

Paso 2: Desplegar en Vercel
Crea un Repositorio en GitHub:

Sube los archivos index.html, la carpeta api (con gee.js adentro) y este README.md a un nuevo repositorio en tu cuenta de GitHub.

Importa el Proyecto en Vercel:

Inicia sesión en tu cuenta de Vercel.

Haz clic en Add New... > Project.

Importa el repositorio de GitHub que acabas de crear.

Configura las Variables de Entorno:

Durante el proceso de importación, Vercel te permitirá configurar el proyecto. Ve a la sección Environment Variables.

Aquí es donde usarás la información del archivo .json que descargaste.

Necesitas crear dos variables de entorno:

a. EE_SERVICE_ACCOUNT_EMAIL:

Nombre: EE_SERVICE_ACCOUNT_EMAIL

Valor: Copia y pega el client_email de tu archivo .json.

b. EE_PRIVATE_KEY:

Nombre: EE_PRIVATE_KEY

Valor: Copia todo el contenido del campo private_key de tu archivo .json. Asegúrate de incluir -----BEGIN PRIVATE KEY----- y -----END PRIVATE KEY-----\n. El valor debe estar entre comillas.

Despliega:

Haz clic en el botón Deploy.

Vercel construirá y desplegará tu aplicación. Una vez completado, te dará una URL donde podrás ver tu aplicación en vivo.

Desarrollo Local (Opcional)
Si quieres ejecutar y probar la aplicación en tu propia computadora antes de desplegarla:

Instala la CLI de Vercel:

npm install -g vercel

Crea un archivo .env.local:

En la raíz de tu proyecto, crea un archivo llamado .env.local.

Añade las mismas variables de entorno que configuraste en Vercel:

EE_SERVICE_ACCOUNT_EMAIL="tu-client-email@..."
EE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...tu-clave-privada...\n-----END PRIVATE KEY-----\n"

Ejecuta el servidor de desarrollo:

vercel dev

Esto iniciará un servidor local (generalmente en http://localhost:3000) que simula el entorno de Vercel, permitiéndote probar la comunicación entre el frontend y tu función de servidor de GEE.
// Encapsulamos toda la lógica en un objeto 'Loader' para evitar conflictos.
const Loader = {
    // Referencias a los elementos del DOM (se inicializan en null)
    element: null,
    statusElement: null,
    tipElement: null,
    stage1Container: null,
    stage2Container: null,

    // Variables para controlar los intervalos de las animaciones de texto
    statusInterval: null,
    tipInterval: null,

    // Colección de consejos útiles que rotarán durante la carga
    tips: [
        "**Consejo:** ¿Sabías que puedes dibujar tu propia área de interés en el mapa usando las herramientas de la izquierda?",
        "**Consejo:** Para comparar múltiples zonas, selecciona varias casillas y presiona el botón '📊 Comparar'.",
        "**Consejo:** Usa el Laboratorio de IA para análisis avanzados como la detección de sargazo o la calidad del aire.",
        "**Consejo:** Después de cargar datos, presiona '🔮 Predecir Tendencia' para obtener un pronóstico a corto plazo.",
        "**Consejo:** Puedes descargar los datos del gráfico en formato CSV y un reporte completo en PDF.",
        "**Consejo:** La opacidad de la capa del mapa se puede ajustar con el control deslizante en la esquina inferior izquierda."
    ],

    // Función de inicialización: Se llama cuando la página está completamente cargada.
    init: function() {
        this.element = document.getElementById('intelligent-loader');
        this.statusElement = document.getElementById('loader-status');
        this.tipElement = document.getElementById('loader-tip');
        this.stage1Container = document.getElementById('loader-stage-1');
        this.stage2Container = document.getElementById('loader-stage-2');
    },

    // Función para mostrar el loader en su Etapa 1 (Procesando en Servidor)
    show: function(statusMessages) {
        if (!this.element || !this.stage1Container) return; // Verificación de seguridad

        // Aseguramos que se muestre la Etapa 1 y se oculte la Etapa 2
        this.stage1Container.classList.remove('hidden');
        this.stage2Container.classList.add('hidden');
        
        // Detener cualquier intervalo anterior para evitar duplicados
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);

        // Configurar estado inicial de los mensajes
        let currentStatusIndex = 0;
        this.statusElement.textContent = statusMessages[0];

        let currentTipIndex = Math.floor(Math.random() * this.tips.length);
        this.tipElement.innerHTML = this.tips[currentTipIndex].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Iniciar nuevos intervalos para cambiar los mensajes dinámicamente
        this.statusInterval = setInterval(() => {
            currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
            this.statusElement.textContent = statusMessages[currentStatusIndex];
        }, 2500); // Cambia el mensaje de estado cada 2.5 segundos

        this.tipInterval = setInterval(() => {
            this.tipElement.style.opacity = '0'; // Inicia el desvanecimiento
            setTimeout(() => {
                currentTipIndex = (currentTipIndex + 1) % this.tips.length;
                this.tipElement.innerHTML = this.tips[currentTipIndex].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                this.tipElement.style.opacity = '1'; // Muestra el nuevo consejo
            }, 500); // Espera 0.5s para que termine la animación de desvanecimiento
        }, 5000); // Cambia el consejo cada 5 segundos

        // Mostrar el loader
        this.element.classList.remove('hidden');
    },

    // Nueva función para cambiar a la Etapa 2 (Renderizando Mapa)
    showStage2: function() {
        if (!this.element || !this.stage2Container) return; // Verificación de seguridad
        
        // Detenemos los intervalos de la Etapa 1 para que no sigan corriendo
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);
        
        // Ocultamos el contenido de la Etapa 1 y mostramos el de la Etapa 2
        this.stage1Container.classList.add('hidden');
        this.stage2Container.classList.remove('hidden');

        // Nos aseguramos de que el contenedor principal del loader siga visible
        this.element.classList.remove('hidden');
    },

    // Función para ocultar completamente el loader
    hide: function() {
        if (!this.element) return; // Verificación de seguridad

        // Detener todos los intervalos para no consumir recursos en segundo plano
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);

        // Ocultar el loader
        this.element.classList.add('hidden');
    }
};

// Exportamos el objeto para que pueda ser importado desde otros archivos del proyecto
export { Loader };
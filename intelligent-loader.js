// /intelligent-loader.js - Módulo Autónomo para el Loader Inteligente

// Encapsulamos toda la lógica en un objeto 'Loader' para evitar conflictos.
const Loader = {
    // Referencias a los elementos del DOM
    element: document.getElementById('intelligent-loader'),
    statusElement: document.getElementById('loader-status'),
    tipElement: document.getElementById('loader-tip'),

    // Variables para controlar los intervalos
    statusInterval: null,
    tipInterval: null,

    // Colección de consejos y mensajes
    tips: [
        "**Consejo:** ¿Sabías que puedes dibujar tu propia área de interés en el mapa usando las herramientas de la izquierda?",
        "**Consejo:** Para comparar múltiples zonas, selecciona varias casillas y presiona el botón '📊 Comparar'.",
        "**Consejo:** Usa el Laboratorio de IA para análisis avanzados como la detección de sargazo o la calidad del aire.",
        "**Consejo:** Después de cargar datos, presiona '🔮 Predecir Tendencia' para obtener un pronóstico a corto plazo.",
        "**Consejo:** Puedes descargar los datos del gráfico en formato CSV y un reporte completo en PDF.",
        "**Consejo:** La opacidad de la capa del mapa se puede ajustar con el control deslizante en la esquina inferior izquierda."
    ],

    // Función para mostrar el loader
    show: function(statusMessages) {
        // Detener cualquier intervalo anterior para evitar duplicados
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);

        // Configurar estado inicial
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

    // Función para ocultar el loader
    hide: function() {
        // Detener los intervalos para no consumir recursos en segundo plano
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);
        // Ocultar el loader
        this.element.classList.add('hidden');
    }
};

// Exportamos el objeto para que pueda ser importado desde otros archivos
export { Loader };
// /intelligent-loader.js - Módulo con Inicialización Retrasada

const Loader = {
    // 1. Inicializamos las propiedades como null.
    element: null,
    statusElement: null,
    tipElement: null,
    statusInterval: null,
    tipInterval: null,
    tips: [
        "**Consejo:** ¿Sabías que puedes dibujar tu propia área de interés en el mapa usando las herramientas de la izquierda?",
        "**Consejo:** Para comparar múltiples zonas, selecciona varias casillas y presiona el botón '📊 Comparar'.",
        "**Consejo:** Usa el Laboratorio de IA para análisis avanzados como la detección de sargazo o la calidad del aire.",
        "**Consejo:** Después de cargar datos, presiona '🔮 Predecir Tendencia' para obtener un pronóstico a corto plazo.",
        "**Consejo:** Puedes descargar los datos del gráfico en formato CSV y un reporte completo en PDF.",
        "**Consejo:** La opacidad de la capa del mapa se puede ajustar con el control deslizante en la esquina inferior izquierda."
    ],

    // 2. Creamos una función 'init' para buscar los elementos.
    init: function() {
        this.element = document.getElementById('intelligent-loader');
        this.statusElement = document.getElementById('loader-status');
        this.tipElement = document.getElementById('loader-tip');
    },

    show: function(statusMessages) {
        // 3. Verificamos si los elementos existen antes de usarlos.
        if (!this.element || !this.statusElement) return;

        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);

        let currentStatusIndex = 0;
        this.statusElement.textContent = statusMessages[0];

        let currentTipIndex = Math.floor(Math.random() * this.tips.length);
        this.tipElement.innerHTML = this.tips[currentTipIndex].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        this.statusInterval = setInterval(() => {
            currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
            this.statusElement.textContent = statusMessages[currentStatusIndex];
        }, 2500);

        this.tipInterval = setInterval(() => {
            this.tipElement.style.opacity = '0';
            setTimeout(() => {
                currentTipIndex = (currentTipIndex + 1) % this.tips.length;
                this.tipElement.innerHTML = this.tips[currentTipIndex].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                this.tipElement.style.opacity = '1';
            }, 500);
        }, 5000);

        this.element.classList.remove('hidden');
    },

    hide: function() {
        if (!this.element) return;
        clearInterval(this.statusInterval);
        clearInterval(this.tipInterval);
        this.element.classList.add('hidden');
    }
};

// 4. Exportamos el objeto Loader para que pueda ser utilizado.
export { Loader };
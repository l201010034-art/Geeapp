// tour-guide.js (Versión de Diagnóstico)

export function initTourGuide() {
    console.log("Paso A: `initTourGuide` se ha iniciado.");
    checkForDriver();
}

function checkForDriver() {
    if (window.driverjs) {
        console.log("Paso B: La librería Driver.js FUE ENCONTRADA. Preparando el tour...");
        setupTour();
    } else {
        setTimeout(checkForDriver, 50);
    }
}

function setupTour() {
    console.log("Paso C: `setupTour` se ha iniciado.");

    const startTourBtn = document.getElementById('start-tour-btn');
    console.log("Paso D: Buscando el botón con ID 'start-tour-btn'. Resultado:", startTourBtn);

    if (!startTourBtn) {
        console.error("ERROR: No se encontró el botón del tour en el HTML. Revisa que el ID sea correcto.");
        return;
    }

    const geoBotImageSrc = 'GeoBot Icon.png';

    const driver = window.driverjs.driver({
        showProgress: true,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Finalizar',
    });

    // ... (El resto del código de los pasos no cambia, por lo que se omite por brevedad)
    const tourSteps = [ { element: '#ai-command-form', popover: { title: 'Comando de IA', description: createPopoverContent(geoBotImageSrc, '¡Hola! Soy GeoBot. Usa esta barra para hacer preguntas directas, como "Muéstrame la temperatura máxima en Campeche la semana pasada".') } }, { element: 'details:nth-of-type(2)', popover: { title: 'Zona de Interés', description: createPopoverContent(geoBotImageSrc, 'Aquí puedes seleccionar o dibujar en el mapa las áreas específicas que deseas analizar.'), }, side: 'right' }, { element: '#variableSelector', popover: { title: 'Variable Climática', description: createPopoverContent(geoBotImageSrc, 'Elige qué dato quieres visualizar: precipitación, temperatura, humedad, y más.') } }, { element: '#chart-panel', popover: { title: 'Visualización de Datos', description: createPopoverContent(geoBotImageSrc, 'Una vez que cargues los datos, los gráficos y estadísticas aparecerán en este panel para un análisis detallado.'), }, side: 'top' }, { element: '#openLabButton', popover: { title: 'Laboratorio de IA', description: createPopoverContent(geoBotImageSrc, 'Para análisis más avanzados como detección de sargazo o mapas de calor, ¡entra al laboratorio! Es mi lugar favorito.') } }, { popover: { title: '¡Listo para explorar!', description: createPopoverContent(geoBotImageSrc, 'Ese es un resumen rápido. Ahora te toca a ti descubrir todo el potencial de la plataforma. ¡No dudes en preguntarme si necesitas ayuda!') } } ];

    startTourBtn.addEventListener('click', () => {
        console.log("Paso F: ¡El botón 'Iniciar Recorrido' FUE CLICADO!");
        driver.setSteps(tourSteps);
        driver.drive();
    });

    console.log("Paso E: El detector de 'clic' se ha añadido al botón correctamente.");
}

function createPopoverContent(imgSrc, text) {
    return `<div class="geobot-tour-step">
                <img src="${imgSrc}" alt="GeoBot">
                <div class="text-content">${text}</div>
            </div>`;
}
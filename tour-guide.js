// tour-guide.js

/**
 * La función principal que se exporta.
 * Inicia un verificador que espera a que window.driverjs esté disponible.
 */
export function initTourGuide() {
    checkForDriver();
}

/**
 * Esta función revisa si la librería Driver.js ya cargó.
 * Si ya cargó, ejecuta la configuración del tour.
 * Si no, espera 50ms y se vuelve a llamar a sí misma.
 */
function checkForDriver() {
    if (window.driverjs) {
        // ¡La librería está lista! Procedemos a configurar el tour.
        setupTour();
    } else {
        // La librería aún no está lista, esperamos un poco y volvemos a revisar.
        setTimeout(checkForDriver, 50);
    }
}

/**
 * Contiene toda la lógica original para configurar y activar el tour.
 * Esta función solo se llamará cuando estemos seguros de que Driver.js existe.
 */
function setupTour() {
    const startTourBtn = document.getElementById('start-tour-btn');
    if (!startTourBtn) return;

    const geoBotImageSrc = 'GeoBot Icon.png';

    // Ahora esta línea se ejecutará sin errores, porque ya verificamos que 'window.driverjs' existe.
    const driver = window.driverjs.driver({
        showProgress: true,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Finalizar',
    });

    const tourSteps = [
        { 
            element: '#ai-command-form',
            popover: { 
                title: 'Comando de IA', 
                description: createPopoverContent(geoBotImageSrc, '¡Hola! Soy GeoBot. Usa esta barra para hacer preguntas directas, como "Muéstrame la temperatura máxima en Campeche la semana pasada".')
            } 
        },
        { 
            element: 'details:nth-of-type(2)',
            popover: { 
                title: 'Zona de Interés', 
                description: createPopoverContent(geoBotImageSrc, 'Aquí puedes seleccionar o dibujar en el mapa las áreas específicas que deseas analizar.'),
            },
            side: 'right'
        },
        { 
            element: '#variableSelector', 
            popover: { 
                title: 'Variable Climática', 
                description: createPopoverContent(geoBotImageSrc, 'Elige qué dato quieres visualizar: precipitación, temperatura, humedad, y más.') 
            } 
        },
        { 
            element: '#chart-panel', 
            popover: { 
                title: 'Visualización de Datos', 
                description: createPopoverContent(geoBotImageSrc, 'Una vez que cargues los datos, los gráficos y estadísticas aparecerán en este panel para un análisis detallado.'),
            },
            side: 'top'
        },
        { 
            element: '#openLabButton', 
            popover: { 
                title: 'Laboratorio de IA', 
                description: createPopoverContent(geoBotImageSrc, 'Para análisis más avanzados como detección de sargazo o mapas de calor, ¡entra al laboratorio! Es mi lugar favorito.') 
            } 
        },
        { 
            popover: { 
                title: '¡Listo para explorar!', 
                description: createPopoverContent(geoBotImageSrc, 'Ese es un resumen rápido. Ahora te toca a ti descubrir todo el potencial de la plataforma. ¡No dudes en preguntarme si necesitas ayuda!') 
            } 
        }
    ];
    
    startTourBtn.addEventListener('click', () => {
        driver.setSteps(tourSteps);
        driver.drive();
    });
}

/**
 * Función auxiliar para crear el contenido HTML del popover.
 */
function createPopoverContent(imgSrc, text) {
    return `<div class="geobot-tour-step">
                <img src="${imgSrc}" alt="GeoBot">
                <div class="text-content">${text}</div>
            </div>`;
}
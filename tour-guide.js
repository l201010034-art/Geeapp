// tour-guide.js (Versión con todos los pasos)

import { driver } from 'https://cdn.jsdelivr.net/npm/driver.js@1.0.1/+esm';

export function initTourGuide() {
    const startTourBtn = document.getElementById('start-tour-btn');
    
    if (!startTourBtn) {
        console.error("No se encontró el botón del tour.");
        return;
    }

    const geoBotImageSrc = 'assets/GeoBot_Icon.png';
    
    const tourSteps = [
        { 
            element: '#ai-command-form',
            popover: { 
                title: 'Comando de IA', 
                description: createPopoverContent(geoBotImageSrc, '¡Hola! Soy GeoBot. Usa esta barra para hacer preguntas directas, como "Muéstrame la temperatura máxima en Campeche la semana pasada".')
            } 
        },
        // ▼▼▼ PASO AÑADIDO ▼▼▼
        { 
            element: 'details:nth-of-type(1)',
            popover: { 
                title: 'Rango de Fechas', 
                description: createPopoverContent(geoBotImageSrc, 'Aquí defines el periodo de tiempo para tu análisis. Es el primer y más importante paso para cualquier consulta manual.'),
            },
            side: 'right'
        },
        // ▲▲▲ FIN DEL PASO AÑADIDO ▲▲▲
        { 
            element: 'details:nth-of-type(2)',
            popover: { 
                title: 'Zona de Interés', 
                description: createPopoverContent(geoBotImageSrc, 'Luego, selecciona o dibuja en el mapa las áreas específicas que deseas analizar.'),
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

    const driverObj = driver({
        showProgress: true,
        nextBtnText: 'Siguiente →',
        prevBtnText: '← Anterior',
        doneBtnText: 'Finalizar',
        steps: tourSteps 
    });
    
    startTourBtn.addEventListener('click', () => {
        driverObj.drive();
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
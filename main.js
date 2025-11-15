import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Importar API key desde config (gitignored)
let CONFIG_API_KEY = null;
// Cargar config de forma asíncrona
(async () => {
    try {
        const config = await import('./config.js');
        CONFIG_API_KEY = config.OPENAI_API_KEY;
    } catch (e) {
        console.log('config.js not found, will use other methods');
    }
})();

// --- Configuración de API ---
// IMPORTANTE: Para producción, usa un backend proxy para proteger tu API key
// Por ahora, puedes configurar tu API key aquí o usar una variable de entorno
function getOpenAIApiKey() {
    // Primero intentar desde config.js (gitignored)
    if (CONFIG_API_KEY && CONFIG_API_KEY.trim() !== '') {
        return CONFIG_API_KEY;
    }
    
    // Luego intentar variable de entorno
    if (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) {
        return import.meta.env.VITE_OPENAI_API_KEY;
    }
    
    // Luego intentar localStorage
    let storedKey = localStorage.getItem('openai_api_key');
    if (storedKey && storedKey.trim() !== '') {
        return storedKey;
    }
    
    return null; // No pedir automáticamente, solo cuando se necesite
}

function requestApiKey() {
    const userKey = prompt('Por favor, ingresa tu OpenAI API Key (se guardará localmente):');
    if (userKey && userKey.trim()) {
        localStorage.setItem('openai_api_key', userKey.trim());
        return userKey.trim();
    }
    return null;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// --- Lógica de UI ---
let currentForm = null;
let parsedData = null; // Almacenar datos parseados por GPT

// --- Lógica del Modal ---
let modal, modifyBtn, acceptBtn, modalOverlay;

function initModal() {
    modal = document.getElementById('quote-modal');
    modifyBtn = document.getElementById('modify-quote-btn');
    acceptBtn = document.getElementById('accept-quote-btn');
    modalOverlay = document.getElementById('modal-overlay');
    
    if (modifyBtn) modifyBtn.addEventListener('click', hideModal);
    if (modalOverlay) modalOverlay.addEventListener('click', hideModal);
}

function showModal() {
    if (modal) modal.classList.remove('hidden');
}

function hideModal() { 
    if (modal) modal.classList.add('hidden'); 
    const statusDiv = document.getElementById('modal-status');
    if (statusDiv) statusDiv.innerHTML = "";
    if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = "[ ACEPTAR Y ENVIAR ]";
    }
    if (modifyBtn) {
        modifyBtn.disabled = false;
        // Cuando se cierra el modal, volver al chat
        resetToChat();
    }
}

// ** CORRECCIÓN: La lógica de envío ahora está TODA dentro del click **
function setupAcceptButton() {
    if (!acceptBtn) return;
    acceptBtn.addEventListener('click', () => {
    // 1. Capturar los datos FRESCOS ahora
    const currentFormData = new FormData(currentForm);
    
    // 2. Construir el objeto de datos FRESCO para sessionStorage
    const isAudio = document.getElementById('service-audio').checked;
    const isVideo = document.getElementById('service-video').checked;
    const isExistingProject = document.getElementById('existing-project').checked;
    
    // *** INICIO DE CORRECCIÓN DE BUG DE URGENCIA ***
    // Solo guardar el texto de la nota de urgencia SI es visible
    const urgencyFeeNoteElement = document.getElementById('urgency-fee-note');
    const urgencyNoteText = !urgencyFeeNoteElement.classList.contains('hidden') 
                              ? urgencyFeeNoteElement.textContent 
                              : ""; // Si está oculto, guarda un string vacío
    // *** FIN DE CORRECCIÓN DE BUG DE URGENCIA ***

    const quoteDataForRedirect = {
        name: currentFormData.get('name'),
        email: currentFormData.get('email'),
        projectName: currentFormData.get('project-name'),
        timeline: currentFormData.get('timeline'),
        brief: currentFormData.get('brief'),
        total: currentFormData.get('cotizacion_estimada'),
        isExisting: isExistingProject,
        baseFee: parseFloat(currentFormData.get('calculated_base_fee')) || 0,
        urgencyNote: urgencyNoteText, // Usar la variable corregida
        isAudio: isAudio,
        audioQty: currentFormData.get('audio_quantity'),
        audioMin: currentFormData.get('audio_min'),
        audioSec: currentFormData.get('audio_sec'),
        audioFormat: currentFormData.get('format_av_audio'),
        audioRes: currentFormData.get('resolution_av_audio'),
        audioFee: parseFloat(currentFormData.get('calculated_audio_fee')) || 0,
        isVideo: isVideo,
        videoQty: currentFormData.get('video_quantity'),
        videoMin: currentFormData.get('video_min'),
        videoSec: currentFormData.get('video_sec'),
        videoFormat: currentFormData.get('format_av_video'),
        videoRes: currentFormData.get('resolution_av_video'),
        videoFee: parseFloat(currentFormData.get('calculated_video_fee')) || 0
    };

    try {
        sessionStorage.setItem('fukuroQuote', JSON.stringify(quoteDataForRedirect));
    } catch (e) {
        console.error("Error al guardar en sessionStorage:", e);
        // Mostrar error en el modal
        const statusDiv = document.getElementById('modal-status');
        statusDiv.innerHTML = `<p class="text-red-500">-- ERROR: No se pudo guardar la sesión --</p><p>// ${e.message}</p>`;
        return; // No continuar si no se puede guardar
    }

    // 3. Enviar los datos FRESCOS a Formspree
    sendFormToSpree(currentFormData);
    });
}

// --- Lógica de Validación de Formulario Personalizada ---
function validateForm() {
    if (!currentForm) return false;

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    currentForm.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
    currentForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

    // 1. Validar Campos Básicos (Proyecto y Timeline son requeridos, Name y Email son opcionales)
    const requiredFields = ['project-name', 'timeline'];
    requiredFields.forEach(id => {
        const input = document.getElementById(id);
        if (input.value.trim() === '') {
            isValid = false;
            document.getElementById(`${id}-error`).textContent = "Campo requerido.";
            document.getElementById(`${id}-error`).classList.remove('hidden');
            input.classList.add('invalid');
        }
    });
    
    // Validar email solo si se proporciona (opcional pero debe tener formato válido)
    const emailInput = document.getElementById('email');
    if (emailInput.value.trim() !== '' && !emailRegex.test(emailInput.value)) {
        isValid = false;
        document.getElementById('email-error').textContent = "Formato de email inválido.";
        document.getElementById('email-error').classList.remove('hidden');
        emailInput.classList.add('invalid');
    }

    // 4. Validar Tipo de Servicio
    const serviceAudio = document.getElementById('service-audio').checked;
    const serviceVideo = document.getElementById('service-video').checked;
    if (!serviceAudio && !serviceVideo) {
        isValid = false;
        document.getElementById('service-type-error').textContent = "Debes seleccionar al menos un servicio.";
        document.getElementById('service-type-error').classList.remove('hidden');
    }
    
    // 6. Validar Términos
    const terms = document.getElementById('terms-checkbox');
    if (!terms.checked) {
        isValid = false;
        document.getElementById('terms-checkbox-error').textContent = "Debes aceptar los términos.";
        document.getElementById('terms-checkbox-error').classList.remove('hidden');
        terms.classList.add('invalid');
    }

    return isValid;
}

// --- Lógica del Calculador de Cotización ---
function setupQuoteCalculator() {
    const calculator = document.getElementById('quote-form-calculator');
    if (!calculator) return;

    // --- SELECCIÓN DE SERVICIO (NUEVA) ---
    const audioCheckbox = document.getElementById('service-audio');
    const videoCheckbox = document.getElementById('service-video');
    const audioControls = document.getElementById('audio-controls-container');
    const videoControls = document.getElementById('video-controls-container');

    // --- CONTROLES DE AUDIO ---
    const audioQuantityInput = document.getElementById('audio_quantity');
    const audioMinInput = document.getElementById('audio_min'); 
    const audioSecInput = document.getElementById('audio_sec'); 

    // --- CONTROLES DE VIDEO ---
    const videoQuantityInput = document.getElementById('video_quantity');
    const videoMinInput = document.getElementById('video_min'); 
    const videoSecInput = document.getElementById('video_sec'); 

    // --- INPUTS OCULTOS ---
    const calculatedBaseFeeInput = document.getElementById('calculated_base_fee');
    const calculatedAudioFeeInput = document.getElementById('calculated_audio_fee');
    const calculatedVideoFeeInput = document.getElementById('calculated_video_fee');

    // --- OTROS CONTROLES ---
    const existingProjectCheckbox = document.getElementById('existing-project');
    const quoteDisplay = document.getElementById('estimated-quote');
    const hiddenQuote = document.getElementById('hidden-quote');
    const timelineInput = document.getElementById('timeline');
    const urgencyFeeNote = document.getElementById('urgency-fee-note');
    const termsCheckbox = document.getElementById('terms-checkbox');
    const generateQuoteBtn = document.getElementById('generate-quote-btn');

    timelineInput.min = new Date().toISOString().split('T')[0];

    const RATES = {
        BASE_FEE: 1200, 
        AUDIO_TIER1: 2400, AUDIO_TIER2: 1200, 
        VIDEO_TIER1: 5000, VIDEO_TIER2: 2500, 
        URGENCY_PERCENT: 0.40
    };
    
    // Función genérica para calcular tarifa gradual
    function calculateGradualFee(totalDuration, rateTier1, rateTier2) {
        if (totalDuration <= 0) return 0;
        if (totalDuration <= 1.0) {
            return totalDuration * rateTier1;
        } else {
            const tier1Fee = 1.0 * rateTier1;
            const remainingDuration = totalDuration - 1.0;
            const tier2Fee = remainingDuration * rateTier2;
            return tier1Fee + tier2Fee;
        }
    }

    function calculateQuote() {
        const isAudio = audioCheckbox.checked;
        const isVideo = videoCheckbox.checked;
        const isExistingProject = existingProjectCheckbox.checked;

        // Mostrar/ocultar bloques de controles
        audioControls.classList.toggle('hidden', !isAudio);
        videoControls.classList.toggle('hidden', !isVideo);

        let totalAudioFee = 0;
        let totalVideoFee = 0;

        // 1. Calcular Costo de Audio (si está seleccionado)
        if (isAudio) {
            const quantity = parseFloat(audioQuantityInput.value) || 1;
            const minutes = parseFloat(audioMinInput.value) || 0;
            const seconds = parseFloat(audioSecInput.value) || 0;
            const durationPerItem = minutes + (seconds / 60);
            const totalDuration = durationPerItem * quantity;
            
            totalAudioFee = calculateGradualFee(totalDuration, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
        }

        // 2. Calcular Costo de Video (si está seleccionado)
        if (isVideo) {
            const quantity = parseFloat(videoQuantityInput.value) || 1;
            const minutes = parseFloat(videoMinInput.value) || 0;
            const seconds = parseFloat(videoSecInput.value) || 0;
            const durationPerItem = minutes + (seconds / 60);
            const totalDuration = durationPerItem * quantity;
            
            totalVideoFee = calculateGradualFee(totalDuration, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
        }

        // 3. Calcular Tarifa Base
        // Se aplica una vez si CUALQUIER servicio está seleccionado Y NO es un proyecto existente
        const totalBaseFee = (isAudio || isVideo) && !isExistingProject ? RATES.BASE_FEE : 0;
        
        // 4. Calcular Cotización Base (Suma de todo)
        const baseQuote = totalBaseFee + totalAudioFee + totalVideoFee;

        // Guardar valores calculados para el modal
        calculatedBaseFeeInput.value = totalBaseFee.toFixed(2);
        calculatedAudioFeeInput.value = totalAudioFee.toFixed(2);
        calculatedVideoFeeInput.value = totalVideoFee.toFixed(2);

        // 5. Calcular Tarifa de Urgencia
        let urgencyFee = 0;
        const selectedDateStr = timelineInput.value;
        if (selectedDateStr) {
            const selectedDate = new Date(selectedDateStr + "T00:00:00-06:00"); 
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            const threeDaysFromNow = new Date(today);
            threeDaysFromNow.setDate(today.getDate() + 3); 

            if (selectedDate < threeDaysFromNow && baseQuote > 0) {
                urgencyFee = baseQuote * RATES.URGENCY_PERCENT; 
                urgencyFeeNote.classList.remove('hidden');
                urgencyFeeNote.textContent = `> Tarifa de Urgencia Aplicada: +$${urgencyFee.toFixed(2)} MXN (40%)`;
            } else {
                urgencyFeeNote.classList.add('hidden');
            }
        } else {
            urgencyFeeNote.classList.add('hidden');
        }
        
        // 6. Total Final
        const totalQuote = baseQuote + urgencyFee;
        
        if (totalQuote > 0) {
            quoteDisplay.value = `$${totalQuote.toFixed(2)} MXN (Total)`;
        } else {
            quoteDisplay.value = "// SELECCIONA UN SERVICIO";
        }
        
        hiddenQuote.value = quoteDisplay.value;
    }
    
    // --- LISTENERS (Escuchar cualquier cambio en el formulario) ---
    // Escuchar cambios dentro del div principal de la calculadora
    calculator.addEventListener('change', calculateQuote); 
    calculator.addEventListener('input', calculateQuote);
    
    // *** CORRECCIÓN DE BUG: Escuchar los inputs FUERA del div principal ***
    existingProjectCheckbox.addEventListener('change', calculateQuote);
    timelineInput.addEventListener('change', calculateQuote);
    // *** FIN DE CORRECCIÓN ***
    
    termsCheckbox.addEventListener('change', () => {
        generateQuoteBtn.disabled = !termsCheckbox.checked;
    });

    calculateQuote(); // Calcular al cargar
}

// Función para generar el resumen de cotización desde datos parseados
function generateQuoteSummary(data) {
    const summaryDiv = document.getElementById('quote-summary');
    if (!summaryDiv) return;
    
    const isAudio = data.serviceType && data.serviceType.includes('Audio');
    const isVideo = data.serviceType && data.serviceType.includes('Video');
    const isExistingProject = data.isExistingProject || false;
    
    // Obtener valores del formulario (ya llenado)
    const baseFee = parseFloat(document.getElementById('calculated_base_fee')?.value) || 0;
    const audioFee = parseFloat(document.getElementById('calculated_audio_fee')?.value) || 0;
    const videoFee = parseFloat(document.getElementById('calculated_video_fee')?.value) || 0;
    const totalQuote = document.getElementById('hidden-quote')?.value || 'N/A';
    
    let servicesSelected = [];
    if (isAudio) servicesSelected.push("Audio");
    if (isVideo) servicesSelected.push("Video");

    let summaryHTML = `
        <p><strong class="text-gray-300">CLIENTE:</strong> ${data.name || 'N/A'}</p>
        <p><strong class="text-gray-300">EMAIL:</strong> ${data.email || 'N/A'}</p>
        <p><strong class="text-gray-300">PROYECTO:</strong> ${data.projectName || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">SERVICIOS:</strong> ${servicesSelected.join(' + ') || 'N/A'}</p>
    `;

    if (isAudio && data.audio) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${data.audio.quantity || 1}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${data.audio.minutes || 0}m ${data.audio.seconds || 0}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${data.audio.format || 'N/A'} | ${data.audio.resolution || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Audio:</strong> $${audioFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (isVideo && data.video) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${data.video.quantity || 1}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${data.video.minutes || 0}m ${data.video.seconds || 0}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${data.video.format || 'N/A'} | ${data.video.resolution || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Video:</strong> $${videoFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    summaryHTML += `<hr class="border-gray-500/50 my-2">`;
    
    if (isExistingProject) {
         summaryHTML += `<p><strong class="text-yellow-300">TARIFA BASE (Proyecto):</strong> $0.00 MXN (Proyecto existente)</p>`;
    } else if (isAudio || isVideo) {
         summaryHTML += `<p><strong class="text-gray-300">TARIFA BASE (Proyecto):</strong> $${baseFee.toFixed(2)} MXN</p>`;
         summaryHTML += `<p class="text-sm text-yellow-300/80">> (La Tarifa Base es por proyecto. Se omitirá en futuros añadidos a este proyecto.)</p>`;
    }

    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${data.timeline || 'N/A'}</p>`;
    
    const urgencyFeeNote = document.getElementById('urgency-fee-note');
    if (urgencyFeeNote && !urgencyFeeNote.classList.contains('hidden')) {
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> ${urgencyFeeNote.textContent.split(': ')[1]}</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: ${totalQuote}</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${data.brief || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;
    
    summaryDiv.innerHTML = summaryHTML;
}

// --- Lógica de Envío de Formulario ---
function handleGenerateQuote(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        const firstError = currentForm.querySelector('.invalid');
        if(firstError) firstError.focus();
        return;
    }

    // Llenar campos ocultos de Formspree (email es opcional)
    const emailValue = document.getElementById('email').value;
    if (emailValue) {
        document.getElementById('form-replyto').value = emailValue;
    }
    document.getElementById('form-subject').value = document.getElementById('project-name').value || 'Nueva Cotización FUKURO';

    // ** LÓGICA DE CAPTURA DE DATOS MOVIDA **
    // Ya no se captura aquí, se captura al hacer clic en 'acceptBtn'
    
    const summaryDiv = document.getElementById('quote-summary');
    const isAudio = document.getElementById('service-audio').checked;
    const isVideo = document.getElementById('service-video').checked;
    const baseFee = parseFloat(document.getElementById('calculated_base_fee').value) || 0;
    const audioFee = parseFloat(document.getElementById('calculated_audio_fee').value) || 0;
    const videoFee = parseFloat(document.getElementById('calculated_video_fee').value) || 0;
    const isExistingProject = document.getElementById('existing-project').checked;
    
    let servicesSelected = [];
    if (isAudio) servicesSelected.push("Audio");
    if (isVideo) servicesSelected.push("Video");

    let summaryHTML = `
        <p><strong class="text-gray-300">CLIENTE:</strong> ${document.getElementById('name').value || 'N/A'}</p>
        <p><strong class="text-gray-300">EMAIL:</strong> ${document.getElementById('email').value || 'N/A'}</p>
        <p><strong class="text-gray-300">PROYECTO:</strong> ${document.getElementById('project-name').value || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">SERVICIOS:</strong> ${servicesSelected.join(' + ') || 'N/A'}</p>
    `;

    if (isAudio) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${document.getElementById('audio_quantity').value}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${document.getElementById('audio_min').value}m ${document.getElementById('audio_sec').value}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${document.getElementById('format_av_audio').value || 'N/A'} | ${document.getElementById('resolution_av_audio').value || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Audio:</strong> $${audioFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (isVideo) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${document.getElementById('video_quantity').value}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${document.getElementById('video_min').value}m ${document.getElementById('video_sec').value}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${document.getElementById('format_av_video').value || 'N/A'} | ${document.getElementById('resolution_av_video').value || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Video:</strong> $${videoFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    summaryHTML += `<hr class="border-gray-500/50 my-2">`;
    
    if (isExistingProject) {
         summaryHTML += `<p><strong class="text-yellow-300">TARIFA BASE (Proyecto):</strong> $0.00 MXN (Proyecto existente)</p>`;
    } else if (isAudio || isVideo) {
         summaryHTML += `<p><strong class="text-gray-300">TARIFA BASE (Proyecto):</strong> $${baseFee.toFixed(2)} MXN</p>`;
         summaryHTML += `<p class="text-sm text-yellow-300/80">> (La Tarifa Base es por proyecto. Se omitirá en futuros añadidos a este proyecto.)</p>`;
    }

    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${document.getElementById('timeline').value || 'N/A'}</p>`;
    
    const urgencyFeeNote = document.getElementById('urgency-fee-note');
    if (urgencyFeeNote && !urgencyFeeNote.classList.contains('hidden')) {
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> ${urgencyFeeNote.textContent.split(': ')[1]}</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: ${document.getElementById('hidden-quote').value}</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${document.getElementById('brief').value || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;
    
    summaryDiv.innerHTML = summaryHTML;
    
    // Ya no se guarda en sessionStorage aquí

    showModal();
}

async function sendFormToSpree(formData) {
    const statusDiv = document.getElementById('modal-status');
    
    statusDiv.innerHTML = '<p class="text-yellow-300">// TRANSMITIENDO_DATOS...</p>';
    acceptBtn.disabled = true;
    acceptBtn.textContent = "[ ... ]";
    modifyBtn.disabled = true;

    try {
        const response = await fetch(currentForm.action, {
            method: currentForm.method,
            body: formData,
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            statusDiv.innerHTML = `
                <p class="text-gray-200 neon-shadow">++ TRANSMISIÓN_EXITOSA ++</p>
                <p class="mt-1">// Hemos recibido tu solicitud.</p>
                <p class="text-yellow-300 mt-2">// Redirigiendo a tu recibo...</p>
            `;
            
            // --- ¡NUEVO! Redirección ---
            setTimeout(() => {
                window.location.href = 'cotizacion.html'; 
            }, 1500); // Esperar 1.5 seg antes de redirigir

            currentForm.reset();
            setupQuoteCalculator(); // Recalcular (para resetear todo)
            modifyBtn.disabled = true;
            acceptBtn.disabled = true;
            
        } else {
            const responseData = await response.json();
            if (Object.hasOwn(responseData, 'errors')) {
                const errorMsg = responseData["errors"].map(error => error["message"]).join(", ");
                throw new Error(errorMsg);
            } else {
                throw new Error('Respuesta no-OK del servidor.');
            }
        }
    } catch (error) {
        console.error("Error al enviar formulario:", error);
        statusDiv.innerHTML = `<p class="text-red-500">-- ERROR: FALLA_TRANSMISIÓN --</p><p>// ${error.message || 'Intenta de nuevo o contacta directamente.'}</p>`;
        acceptBtn.disabled = false;
        acceptBtn.textContent = "[ ACEPTAR Y ENVIAR ]";
        modifyBtn.disabled = false;
        
        // Limpiar datos de sessionStorage si el envío falla
        sessionStorage.removeItem('fukuroQuote');
    }
}

// --- Lógica de Three.js ---
let scene, camera, renderer, mesh, clock;
const lights = [];

function createOwl() {
    const owlGroup = new THREE.Group();
    const material = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        reflectivity: 1.0,
        sheen: 1.0,
        sheenColor: new THREE.Color(0x00ffff)
    });

    const bodyGeo = new THREE.SphereGeometry(1, 32, 16);
    const body = new THREE.Mesh(bodyGeo, material);
    body.scale.set(1, 1.2, 1);
    owlGroup.add(body);

    const eyeGeo = new THREE.SphereGeometry(0.3, 12, 8);
    const eyeL = new THREE.Mesh(eyeGeo, material);
    const eyeR = new THREE.Mesh(eyeGeo, material);
    eyeL.position.set(-0.4, 0.3, 0.8);
    eyeR.position.set(0.4, 0.3, 0.8);
    owlGroup.add(eyeL);
    owlGroup.add(eyeR);
    
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const pupilGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const pupilL = new THREE.Mesh(pupilGeo, pupilMat);
    const pupilR = new THREE.Mesh(pupilGeo, pupilMat);
    pupilL.position.set(-0.4, 0.3, 1.05);
    pupilR.position.set(0.4, 0.3, 1.05);
    owlGroup.add(pupilL);
    owlGroup.add(pupilR);

    const beakGeo = new THREE.ConeGeometry(0.2, 0.4, 8);
    const beak = new THREE.Mesh(beakGeo, material);
    beak.position.set(0, 0.0, 1.0);
    beak.rotation.x = 0.5; 
    owlGroup.add(beak);

    const wingGeo = new THREE.SphereGeometry(0.7, 16, 8);
    const wingL = new THREE.Mesh(wingGeo, material);
    wingL.position.set(-0.8, -0.2, 0);
    wingL.scale.set(0.4, 1, 0.8);
    wingL.rotation.z = 0.3;
    owlGroup.add(wingL);

    const wingR = new THREE.Mesh(wingGeo, material);
    wingR.position.set(0.8, -0.2, 0);
    wingR.scale.set(0.4, 1, 0.8);
    wingR.rotation.z = -0.3;
    owlGroup.add(wingR);

    const tuftGeo = new THREE.ConeGeometry(0.15, 0.5, 8);
    const tuftL = new THREE.Mesh(tuftGeo, material);
    const tuftR = new THREE.Mesh(tuftGeo, material);
    tuftL.position.set(-0.5, 1.0, 0.2);
    tuftR.position.set(0.5, 1.0, 0.2);
    tuftL.rotation.z = -0.2;
    tuftR.rotation.z = 0.2;
    owlGroup.add(tuftL);
    owlGroup.add(tuftR);
    
    owlGroup.scale.set(0.8, 0.8, 0.8);
    return owlGroup;
}

function initThree() {
    try {
        scene = new THREE.Scene();
        clock = new THREE.Clock();
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 2.5;

        const canvas = document.getElementById('three-canvas');
        renderer = new THREE.WebGLRenderer({ canvas, antias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        
        mesh = createOwl();
        scene.add(mesh);
        scene.add(new THREE.AmbientLight(0x404040, 0.5));

        const lightColors = [0x00ff00, 0xff00ff, 0x00ffff, 0xff0000];
        lightColors.forEach((color, index) => {
            const light = new THREE.PointLight(color, 10, 5);
            light.data = {
                offset: index * (Math.PI * 2) / lightColors.length,
                speed: 1 + Math.random()
            };
            lights.push(light);
            scene.add(light);
        });

        window.addEventListener('resize', onWindowResize);
        animate();
    } catch (error) {
        console.error("Fallo al iniciar Three.js:", error);
        document.getElementById('three-canvas').style.display = 'none';
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (mesh) {
        mesh.rotation.x = elapsedTime * 0.1;
        mesh.rotation.y = elapsedTime * 0.2;
        mesh.position.y = Math.sin(elapsedTime * 0.5) * 0.1; 
    }
    lights.forEach((light) => {
        const t = elapsedTime * light.data.speed + light.data.offset;
        light.position.x = Math.sin(t) * 2;
        light.position.y = Math.cos(t * 0.8) * 2;
        light.position.z = Math.cos(t) * 2;
    });
    renderer.render(scene, camera);
}

// --- Lógica de Chat y Parsing con GPT ---
function addChatMessage(message, isUser = false) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = isUser 
        ? 'text-right text-gray-200' 
        : 'text-left text-yellow-300';
    messageDiv.textContent = isUser ? `> ${message}` : `// ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function parseUserInputWithGPT(userInput, history = [], apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('OpenAI API Key no configurada. Por favor, configura VITE_OPENAI_API_KEY o ingresa tu API key.');
    }

    const systemPrompt = `Eres un asistente que extrae información de solicitudes de cotización para servicios de audio/video. 
Analiza el texto del usuario y extrae la siguiente información en formato JSON:

{
  "name": "nombre del cliente (OPCIONAL)",
  "email": "email del cliente (OPCIONAL)",
  "projectName": "nombre del proyecto (REQUERIDO)",
  "isExistingProject": true/false,
  "serviceType": ["Audio", "Video"] o ["Audio"] o ["Video"] (REQUERIDO - al menos uno),
  "audio": {
    "quantity": número,
    "minutes": número,
    "seconds": número,
    "format": "formato de audio",
    "resolution": "calidad de audio"
  },
  "video": {
    "quantity": número,
    "minutes": número,
    "seconds": número,
    "format": "formato de video",
    "resolution": "resolución de video"
  },
  "timeline": "YYYY-MM-DD" (REQUERIDO),
  "brief": "descripción del proyecto",
  "assetsLink": "link de recursos si se menciona"
}

CAMPOS REQUERIDOS para generar cotización: projectName, timeline, serviceType (al menos Audio o Video).
name y email son OPCIONALES - solo extrae si se mencionan explícitamente.
Si algún campo no está presente en el texto, usa null. Para fechas, intenta interpretar usando el año actual. Ejemplos: "15 de diciembre" -> año actual-12-15, "25 noviembre" -> año actual-11-25, "mañana" -> fecha de mañana. SIEMPRE usa el año actual, nunca uses años pasados como 2024.
Para serviceType, determina si menciona audio, video, o ambos.
Si el usuario está proporcionando información adicional en una conversación, solo extrae los campos nuevos o actualizados.
Responde SOLO con el JSON, sin explicaciones adicionales.`;

    // Construir mensajes con historial
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userInput }
    ];

    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: messages,
                temperature: 0.3,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            let errorMessage = 'Error al comunicarse con OpenAI';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error?.message || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        
        // Intentar extraer JSON del contenido (puede venir con markdown)
        let jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No se pudo extraer JSON de la respuesta');
        }
        
        return JSON.parse(jsonMatch[0]);
    } catch (error) {
        console.error('Error parsing with GPT:', error);
        throw error;
    }
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Si ya está en formato YYYY-MM-DD, usarlo directamente
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    
    // Intentar parsear la fecha
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        // Si el año es menor a 2000, probablemente es un año mal parseado, usar año actual
        let year = date.getFullYear();
        const currentYear = new Date().getFullYear();
        if (year < 2000) {
            year = currentYear;
        }
        
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    // Si no se puede parsear, intentar con el año actual
    // Ejemplo: "25 noviembre" -> "2025-11-25"
    const currentYear = new Date().getFullYear();
    const dateWithYear = new Date(`${dateStr} ${currentYear}`);
    if (!isNaN(dateWithYear.getTime())) {
        const year = dateWithYear.getFullYear();
        const month = String(dateWithYear.getMonth() + 1).padStart(2, '0');
        const day = String(dateWithYear.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return null;
}

function fillFormFromParsedData(data) {
    // Llenar campos básicos
    if (data.name) document.getElementById('name').value = data.name;
    if (data.email) document.getElementById('email').value = data.email;
    if (data.projectName) document.getElementById('project-name').value = data.projectName;
    
    // Parsear fecha si existe
    if (data.timeline) {
        const parsedDate = parseDate(data.timeline);
        if (parsedDate) {
            document.getElementById('timeline').value = parsedDate;
        }
    }
    
    if (data.brief) document.getElementById('brief').value = data.brief;
    if (data.assetsLink) document.getElementById('assets-link').value = data.assetsLink;
    
    // Checkbox de proyecto existente
    if (data.isExistingProject !== null) {
        document.getElementById('existing-project').checked = data.isExistingProject;
    }
    
    // Servicios
    const audioCheckbox = document.getElementById('service-audio');
    const videoCheckbox = document.getElementById('service-video');
    
    if (data.serviceType && Array.isArray(data.serviceType)) {
        audioCheckbox.checked = data.serviceType.includes('Audio');
        videoCheckbox.checked = data.serviceType.includes('Video');
    }
    
    // Detalles de Audio
    if (data.audio) {
        if (data.audio.quantity) document.getElementById('audio_quantity').value = Math.min(data.audio.quantity, 10);
        if (data.audio.minutes !== null && data.audio.minutes !== undefined) {
            document.getElementById('audio_min').value = data.audio.minutes;
        }
        if (data.audio.seconds !== null && data.audio.seconds !== undefined) {
            document.getElementById('audio_sec').value = data.audio.seconds;
        }
        if (data.audio.format) document.getElementById('format_av_audio').value = data.audio.format;
        if (data.audio.resolution) document.getElementById('resolution_av_audio').value = data.audio.resolution;
    }
    
    // Detalles de Video
    if (data.video) {
        if (data.video.quantity) document.getElementById('video_quantity').value = Math.min(data.video.quantity, 10);
        if (data.video.minutes !== null && data.video.minutes !== undefined) {
            document.getElementById('video_min').value = data.video.minutes;
        }
        if (data.video.seconds !== null && data.video.seconds !== undefined) {
            document.getElementById('video_sec').value = data.video.seconds;
        }
        if (data.video.format) document.getElementById('format_av_video').value = data.video.format;
        if (data.video.resolution) document.getElementById('resolution_av_video').value = data.video.resolution;
    }
    
    // Recalcular cotización
    setupQuoteCalculator();
    
    // Trigger change events para que se calculen los valores
    audioCheckbox.dispatchEvent(new Event('change'));
    videoCheckbox.dispatchEvent(new Event('change'));
}

function getMissingFields(data) {
    const missing = [];
    // Solo projectName, timeline y serviceType son requeridos para generar la cotización
    const required = ['projectName', 'timeline'];
    
    required.forEach(field => {
        if (!data[field]) {
            missing.push(field);
        }
    });
    
    // Verificar que al menos un servicio esté seleccionado
    if (!data.serviceType || !Array.isArray(data.serviceType) || data.serviceType.length === 0) {
        missing.push('serviceType');
    }
    
    return missing;
}

let conversationHistory = []; // Guardar historial de conversación

async function handleParseInput() {
    console.log('handleParseInput called'); // Debug
    
    const userInput = document.getElementById('user-input');
    const parseBtn = document.getElementById('parse-input-btn');
    const chatStatus = document.getElementById('chat-status');
    const chatInterface = document.getElementById('chat-interface');
    const formActions = document.getElementById('form-actions');
    
    if (!userInput || !parseBtn || !chatStatus) {
        console.error('Required elements not found');
        alert('Error: No se encontraron elementos necesarios. Por favor, recarga la página.');
        return;
    }
    
    const inputText = userInput.value.trim();
    
    if (!inputText) {
        chatStatus.innerHTML = '<p class="text-red-500">// Por favor, escribe algo sobre tu proyecto.</p>';
        return;
    }
    
    // Verificar API key ANTES de continuar
    let apiKey = getOpenAIApiKey();
    
    if (!apiKey || apiKey.trim() === '') {
        console.log('No API key found, requesting from user');
        addChatMessage('Se requiere una API Key de OpenAI para continuar.', false);
        chatStatus.innerHTML = '<p class="text-yellow-300">// Solicitando API Key...</p>';
        
        // Intentar obtener la key
        apiKey = requestApiKey();
        
        if (!apiKey || apiKey.trim() === '') {
            const errorMsg = 'API Key requerida. Por favor, proporciona tu OpenAI API Key para continuar.';
            console.error(errorMsg);
            addChatMessage(`Error: ${errorMsg}`, false);
            chatStatus.innerHTML = `<p class="text-red-500">-- ERROR: ${errorMsg} --</p>`;
            parseBtn.disabled = false;
            parseBtn.textContent = '[ ANALIZAR Y LLENAR FORMULARIO ]';
            return;
        }
        
        // Si obtuvimos la key, continuar
        addChatMessage('API Key configurada. Continuando...', false);
    }
    
    // Agregar mensaje del usuario al historial
    conversationHistory.push({ role: 'user', content: inputText });
    
    // Mostrar mensaje del usuario
    addChatMessage(inputText, true);
    
    // Limpiar input
    userInput.value = '';
    
    // Deshabilitar botón y mostrar estado
    parseBtn.disabled = true;
    parseBtn.textContent = '[ ANALIZANDO... ]';
    chatStatus.innerHTML = '<p class="text-yellow-300">// Analizando tu mensaje...</p>';
    
    try {
        console.log('Calling parseUserInputWithGPT with API key:', apiKey ? 'present' : 'missing'); // Debug
        // Llamar a GPT con historial de conversación
        const parsedData = await parseUserInputWithGPT(inputText, conversationHistory, apiKey);
        console.log('Parsed data:', parsedData); // Debug
        
        // Combinar con datos anteriores si existen
        const previousData = window.parsedData || {};
        const mergedData = { ...previousData, ...parsedData };
        
        // Guardar datos parseados combinados
        window.parsedData = mergedData;
        
        // Verificar campos faltantes
        const missingFields = getMissingFields(mergedData);
        
        if (missingFields.length > 0) {
            const fieldNames = {
                'projectName': 'nombre del proyecto',
                'timeline': 'fecha de entrega',
                'serviceType': 'tipo de servicio (Audio o Video)'
            };
            
            const missingList = missingFields.map(f => fieldNames[f] || f).join(', ');
            addChatMessage(`Necesito más información: ${missingList}. Por favor, proporciona estos datos.`, false);
            chatStatus.innerHTML = `<p class="text-yellow-300">// Algunos datos faltan. Por favor, proporciona: ${missingList}</p>`;
            parseBtn.disabled = false;
            parseBtn.textContent = '[ ENVIAR INFORMACIÓN ADICIONAL ]';
            return;
        }
        
        // Llenar formulario con datos combinados (internamente, sin mostrar al usuario)
        fillFormFromParsedData(mergedData);
        
        // Calcular la cotización automáticamente
        setupQuoteCalculator();
        
        // Generar y mostrar el resumen de la cotización directamente (sin mostrar el formulario)
        generateQuoteSummary(mergedData);
        
        // Mostrar el modal de cotización (invoice)
        showModal();
        
        // Ocultar chat
        if (chatInterface) chatInterface.classList.add('hidden');
        
        // Limpiar historial para próxima vez
        conversationHistory = [];
        
    } catch (error) {
        console.error('Error in handleParseInput:', error);
        const errorMessage = error.message || 'Error desconocido';
        addChatMessage(`Error: ${errorMessage}`, false);
        chatStatus.innerHTML = `<p class="text-red-500">-- ERROR: ${errorMessage} --</p>`;
        parseBtn.disabled = false;
        parseBtn.textContent = '[ ANALIZAR Y LLENAR FORMULARIO ]';
    }
}

function resetToChat() {
    const chatInterface = document.getElementById('chat-interface');
    const form = document.getElementById('quote-form');
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const parseBtn = document.getElementById('parse-input-btn');
    
    // Cerrar modal si está abierto
    hideModal();
    
    // Resetear todo
    chatMessages.innerHTML = '<div class="text-sm text-gray-300/70">// Escribe libremente sobre tu proyecto. Analizaré tu mensaje y llenaré el formulario automáticamente.</div>';
    userInput.value = '';
    form.classList.add('hidden'); // Form siempre oculto
    chatInterface.classList.remove('hidden');
    form.reset();
    setupQuoteCalculator();
    
    // Resetear variables
    conversationHistory = [];
    window.parsedData = null;
    parseBtn.textContent = '[ ANALIZAR Y LLENAR FORMULARIO ]';
}

// --- Iniciar todo ---
// Inicializar modal primero
initModal();
// Luego configurar el botón de aceptar (después de que initModal haya asignado acceptBtn)
if (acceptBtn) {
    setupAcceptButton();
}

// Enlazar el formulario y la calculadora al cargar la página
currentForm = document.getElementById('quote-form');
if (currentForm) {
    currentForm.addEventListener('submit', handleGenerateQuote);
    setupQuoteCalculator(); 
}

// Enlazar botones de chat - Esperar a que el DOM esté listo
function setupChatInterface() {
    const parseBtn = document.getElementById('parse-input-btn');
    if (parseBtn) {
        console.log('Parse button found, adding event listener'); // Debug
        // Remover cualquier listener previo
        parseBtn.replaceWith(parseBtn.cloneNode(true));
        const newParseBtn = document.getElementById('parse-input-btn');
        newParseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Parse button clicked'); // Debug
            handleParseInput();
        });
    } else {
        console.error('Parse button not found!'); // Debug
        // Intentar de nuevo después de un breve delay
        setTimeout(setupChatInterface, 100);
    }
}

// Esperar a que el DOM esté completamente cargado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupChatInterface);
} else {
    setupChatInterface();
}

// Botón de nueva cotización está en modifyBtn, ya configurado en hideModal

// --- Lógica de Grabación de Voz ---
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
    // Verificar si el navegador soporta Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'es-MX'; // Español de México
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const userInput = document.getElementById('user-input');
            if (userInput) {
                // Agregar el texto transcrito al textarea
                userInput.value += (userInput.value ? ' ' : '') + transcript;
            }
            stopRecording();
        };
        
        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            const chatStatus = document.getElementById('chat-status');
            if (chatStatus) {
                chatStatus.innerHTML = `<p class="text-red-500">Error en reconocimiento de voz: ${event.error}</p>`;
            }
            stopRecording();
        };
        
        recognition.onend = () => {
            stopRecording();
        };
    } else {
        console.warn('Speech recognition not supported in this browser');
        const recordBtn = document.getElementById('record-voice-btn');
        if (recordBtn) {
            recordBtn.disabled = true;
            recordBtn.title = 'Reconocimiento de voz no disponible en este navegador';
        }
    }
}

function startRecording() {
    if (!recognition) {
        alert('El reconocimiento de voz no está disponible en tu navegador. Por favor, escribe tu mensaje.');
        return;
    }
    
    if (isRecording) {
        stopRecording();
        return;
    }
    
    try {
        recognition.start();
        isRecording = true;
        
        const recordBtn = document.getElementById('record-voice-btn');
        const recordIcon = document.getElementById('record-icon');
        const recordText = document.getElementById('record-text');
        const recordingStatus = document.getElementById('recording-status');
        
        if (recordBtn) {
            recordBtn.classList.remove('border-red-500', 'text-red-300', 'hover:bg-red-500');
            recordBtn.classList.add('bg-red-500', 'text-black', 'border-red-600');
        }
        if (recordIcon) recordIcon.textContent = '⏹️';
        if (recordText) recordText.textContent = '[ DETENER ]';
        if (recordingStatus) recordingStatus.classList.remove('hidden');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        isRecording = false;
    }
}

function stopRecording() {
    if (!isRecording) return;
    
    try {
        if (recognition && recognition.state !== 'stopped') {
            recognition.stop();
        }
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
    
    isRecording = false;
    
    const recordBtn = document.getElementById('record-voice-btn');
    const recordIcon = document.getElementById('record-icon');
    const recordText = document.getElementById('record-text');
    const recordingStatus = document.getElementById('recording-status');
    
    if (recordBtn) {
        recordBtn.classList.remove('bg-red-500', 'text-black', 'border-red-600');
        recordBtn.classList.add('border-red-500', 'text-red-300', 'hover:bg-red-500');
    }
    if (recordIcon) recordIcon.textContent = '🎤';
    if (recordText) recordText.textContent = '[ GRABAR VOZ ]';
    if (recordingStatus) recordingStatus.classList.add('hidden');
}

// Inicializar reconocimiento de voz al cargar
initSpeechRecognition();

// Configurar botón de grabación
const recordBtn = document.getElementById('record-voice-btn');
if (recordBtn) {
    recordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });
}

// Permitir Enter para enviar (Shift+Enter para nueva línea)
const userInput = document.getElementById('user-input');
if (userInput) {
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleParseInput();
        }
    });
}

// Iniciar el fondo 3D
initThree();

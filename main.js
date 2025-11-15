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

// Helper function to parse duration strings
function parseDurationString(durationStr) {
    if (!durationStr || typeof durationStr !== 'string') {
        return { minutes: 0, seconds: 0 };
    }
    
    let normalized = durationStr.trim();
    let minutes = 0;
    let seconds = 0;
    
    // Handle formats like "1:30" or "00:45"
    if (normalized.includes(':')) {
        const parts = normalized.split(':').map(part => part.trim());
        if (parts.length === 2) {
            minutes = parseInt(parts[0]) || 0;
            seconds = parseInt(parts[1]) || 0;
            return { minutes, seconds };
        }
    }
    
    const minMatch = normalized.match(/(\d+)\s*(?:m|min|minute|minuto|minutos)/i);
    if (minMatch) minutes = parseInt(minMatch[1]) || 0;
    
    const secMatch = normalized.match(/(\d+)\s*(?:s|sec|second|seg|segundo|segundos)/i);
    if (secMatch) seconds = parseInt(secMatch[1]) || 0;
    
    if (!minMatch && !secMatch) {
        const numMatch = normalized.match(/(\d+)/);
        if (numMatch) {
            seconds = parseInt(numMatch[1]) || 0;
        }
    }
    
    return { minutes, seconds };
}

// Standalone calculation logic (no form dependency)
const RATES = {
    BASE_FEE: 1200, 
    AUDIO_TIER1: 2400, 
    AUDIO_TIER2: 1200, 
    VIDEO_TIER1: 5000, 
    VIDEO_TIER2: 2500, 
    URGENCY_PERCENT: 0.40
};

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

function calculateQuoteFromData(data) {
    console.log('Calculating quote from data:', data);
    
    if (!data) {
        console.error('No data provided to calculateQuoteFromData');
        return {
            totalAudioFee: 0,
            totalVideoFee: 0,
            totalBaseFee: 0,
            baseQuote: 0,
            urgencyFee: 0,
            hasUrgencyFee: false,
            totalQuote: 0
        };
    }
    
    let totalAudioFee = 0;
    let totalVideoFee = 0;
    
    // Check if existing project
    const isExistingProject = data.isExistingProject || false;
    
    // Calculate Audio Fee
    if (data.audio && data.serviceType && data.serviceType.includes('Audio')) {
        const quantity = data.audio.quantity || 1;
        const minutes = data.audio.minutes || 0;
        const seconds = data.audio.seconds || 0;
        const durationPerItem = minutes + (seconds / 60);
        const individualDurations = data.audio.individualDurations || [];
        
        if (individualDurations.length > 0) {
            // Calculate fee for each individual audio
            for (let i = 0; i < individualDurations.length; i++) {
                const parsed = parseDurationString(individualDurations[i]);
                const durMinutes = parsed.minutes + (parsed.seconds / 60);
                const itemFee = calculateGradualFee(durMinutes, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
                totalAudioFee += itemFee;
            }
            // Add fee for remaining items if any
            if (individualDurations.length < quantity) {
                const remaining = quantity - individualDurations.length;
                const feePerItem = calculateGradualFee(durationPerItem, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
                totalAudioFee += feePerItem * remaining;
            }
        } else {
            // All items have same duration
            const feePerItem = calculateGradualFee(durationPerItem, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
            totalAudioFee = feePerItem * quantity;
        }
        console.log('Total Audio Fee:', totalAudioFee);
    }
    
    // Calculate Video Fee
    if (data.video && data.serviceType && data.serviceType.includes('Video')) {
        const quantity = data.video.quantity || 1;
        const minutes = data.video.minutes || 0;
        const seconds = data.video.seconds || 0;
        const durationPerItem = minutes + (seconds / 60);
        const individualDurations = data.video.individualDurations || [];
        
        if (individualDurations.length > 0) {
            // Calculate fee for each individual video
            for (let i = 0; i < individualDurations.length; i++) {
                const parsed = parseDurationString(individualDurations[i]);
                const durMinutes = parsed.minutes + (parsed.seconds / 60);
                const itemFee = calculateGradualFee(durMinutes, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
                totalVideoFee += itemFee;
            }
            // Add fee for remaining items if any
            if (individualDurations.length < quantity) {
                const remaining = quantity - individualDurations.length;
                const feePerItem = calculateGradualFee(durationPerItem, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
                totalVideoFee += feePerItem * remaining;
            }
        } else {
            // All items have same duration
            const feePerItem = calculateGradualFee(durationPerItem, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
            totalVideoFee = feePerItem * quantity;
        }
        console.log('Total Video Fee:', totalVideoFee);
    }
    
    // Calculate Base Fee
    const hasServices = (data.serviceType && data.serviceType.length > 0);
    const totalBaseFee = hasServices && !isExistingProject ? RATES.BASE_FEE : 0;
    
    // Base Quote
    const baseQuote = totalBaseFee + totalAudioFee + totalVideoFee;
    
    // Calculate Urgency Fee
    let urgencyFee = 0;
    let hasUrgencyFee = false;
    if (data.timeline && baseQuote > 0) {
        const selectedDate = new Date(data.timeline + "T00:00:00");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const threeDaysFromNow = new Date(today);
        threeDaysFromNow.setDate(today.getDate() + 3);
        
        if (selectedDate < threeDaysFromNow) {
            urgencyFee = baseQuote * RATES.URGENCY_PERCENT;
            hasUrgencyFee = true;
        }
    }
    
    // Total
    const totalQuote = baseQuote + urgencyFee;
    
    return {
        totalAudioFee,
        totalVideoFee,
        totalBaseFee,
        baseQuote,
        urgencyFee,
        hasUrgencyFee,
        totalQuote
    };
}

function buildQuoteSummaryFromData(data, calculation) {
    const isAudio = data.serviceType && data.serviceType.includes('Audio');
    const isVideo = data.serviceType && data.serviceType.includes('Video');
    const isExistingProject = data.isExistingProject || false;
    
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
        const audioQuantity = data.audio.quantity || 1;
        const audioMinutes = data.audio.minutes || 0;
        const audioSeconds = data.audio.seconds || 0;
        const audioFormat = data.audio.format || 'N/A';
        const audioResolution = data.audio.resolution || 'N/A';
        const individualDurations = data.audio.individualDurations || [];
        
        let totalDurationMinutes = 0;
        if (individualDurations.length > 0) {
            totalDurationMinutes = individualDurations.reduce((sum, dur) => {
                const parsedDur = parseDurationString(dur);
                return sum + parsedDur.minutes + (parsedDur.seconds / 60);
            }, 0);
        } else {
            totalDurationMinutes = (audioMinutes + (audioSeconds / 60)) * audioQuantity;
        }
        
        let totalDurationSeconds = Math.round(totalDurationMinutes * 60);
        let totalMinutesWhole = Math.floor(totalDurationSeconds / 60);
        let totalSeconds = totalDurationSeconds % 60;
        
        if (totalSeconds >= 60) {
            totalMinutesWhole += Math.floor(totalSeconds / 60);
            totalSeconds %= 60;
        }
        
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad Total:</strong> ${audioQuantity}</p>
                <p><strong class="text-gray-300">Specs:</strong> ${audioFormat} | ${audioResolution}</p>
                <hr class="border-gray-500/30 my-2">
        `;
        
        if (individualDurations.length > 0) {
            summaryHTML += `<p class="text-gray-400 text-sm mb-2">Desglose individual:</p>`;
            for (let i = 0; i < individualDurations.length; i++) {
                const parsedDur = parseDurationString(individualDurations[i]);
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• Audio ${i + 1}: ${parsedDur.minutes}m ${parsedDur.seconds}s</p>
                `;
            }
            if (individualDurations.length < audioQuantity) {
                const remaining = audioQuantity - individualDurations.length;
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• ${remaining} audio(s) adicional(es): ${audioMinutes}m ${audioSeconds}s c/u</p>
                `;
            }
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        } else {
            summaryHTML += `<p><strong class="text-gray-300">Duración (c/u):</strong> ${audioMinutes}m ${audioSeconds}s</p>`;
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        }
        
        summaryHTML += `
                <p><strong class="text-gray-300">Duración Total:</strong> ${totalMinutesWhole}m ${totalSeconds}s</p>
                <p><strong class="text-yellow-300">Subtotal Audio:</strong> $${calculation.totalAudioFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (isVideo && data.video) {
        const videoQuantity = data.video.quantity || 1;
        const videoMinutes = data.video.minutes || 0;
        const videoSeconds = data.video.seconds || 0;
        const videoFormat = data.video.format || 'N/A';
        const videoResolution = data.video.resolution || 'N/A';
        const individualDurations = data.video.individualDurations || [];
        
        let totalDurationMinutes = 0;
        if (individualDurations.length > 0) {
            totalDurationMinutes = individualDurations.reduce((sum, dur) => {
                const parsedDur = parseDurationString(dur);
                return sum + parsedDur.minutes + (parsedDur.seconds / 60);
            }, 0);
        } else {
            totalDurationMinutes = (videoMinutes + (videoSeconds / 60)) * videoQuantity;
        }
        
        let totalDurationSeconds = Math.round(totalDurationMinutes * 60);
        let totalMinutesWhole = Math.floor(totalDurationSeconds / 60);
        let totalSeconds = totalDurationSeconds % 60;
        
        if (totalSeconds >= 60) {
            totalMinutesWhole += Math.floor(totalSeconds / 60);
            totalSeconds %= 60;
        }
        
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad Total:</strong> ${videoQuantity}</p>
                <p><strong class="text-gray-300">Specs:</strong> ${videoFormat} | ${videoResolution}</p>
                <hr class="border-gray-500/30 my-2">
        `;
        
        if (individualDurations.length > 0) {
            summaryHTML += `<p class="text-gray-400 text-sm mb-2">Desglose individual:</p>`;
            for (let i = 0; i < individualDurations.length; i++) {
                const parsedDur = parseDurationString(individualDurations[i]);
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• Video ${i + 1}: ${parsedDur.minutes}m ${parsedDur.seconds}s</p>
                `;
            }
            if (individualDurations.length < videoQuantity) {
                const remaining = videoQuantity - individualDurations.length;
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• ${remaining} video(s) adicional(es): ${videoMinutes}m ${videoSeconds}s c/u</p>
                `;
            }
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        } else {
            summaryHTML += `<p><strong class="text-gray-300">Duración (c/u):</strong> ${videoMinutes}m ${videoSeconds}s</p>`;
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        }
        
        summaryHTML += `
                <p><strong class="text-gray-300">Duración Total:</strong> ${totalMinutesWhole}m ${totalSeconds}s</p>
                <p><strong class="text-yellow-300">Subtotal Video:</strong> $${calculation.totalVideoFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    summaryHTML += `<hr class="border-gray-500/50 my-2">`;
    
    if (!isExistingProject && (isAudio || isVideo) && calculation.totalBaseFee > 0) {
         summaryHTML += `<p><strong class="text-gray-300">TARIFA BASE (Proyecto):</strong> $${calculation.totalBaseFee.toFixed(2)} MXN</p>`;
         summaryHTML += `<p class="text-sm text-yellow-300/80">> (La Tarifa Base es por proyecto. Se omitirá en futuros añadidos a este proyecto.)</p>`;
    }

    // Format date as "day month year" (e.g., "15 noviembre 2025")
    let formattedDate = 'N/A';
    if (data.timeline) {
        const dateObj = new Date(data.timeline + "T00:00:00");
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const day = dateObj.getDate();
        const month = months[dateObj.getMonth()];
        const year = dateObj.getFullYear();
        formattedDate = `${day} ${month} ${year}`;
    }
    
    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${formattedDate}</p>`;
    
    if (calculation.hasUrgencyFee) {
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> +$${calculation.urgencyFee.toFixed(2)} MXN (40%)</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: $${calculation.totalQuote.toFixed(2)} MXN</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${data.brief || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;

    return summaryHTML;
}

// --- Lógica de UI ---
let currentForm = null;
let parsedData = null; // Almacenar datos parseados por GPT
let projects = []; // Lista de proyectos existentes
const API_BASE_URL = window.location.origin; // Use same origin for API calls

// --- Backend Authentication ---
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';
let isAuthenticated = false;

// Check if user is already authenticated
function checkAuth() {
    const authStatus = sessionStorage.getItem('backend_authenticated');
    if (authStatus === 'true') {
        isAuthenticated = true;
    }
}

// Initialize auth check
checkAuth();

// --- Lógica del Modal ---
let modal, modifyBtn, acceptBtn, modalOverlay;
let chatModal, chatModalOverlay, chatModalSummary, chatModalStatus, chatModalNewBtn, chatModalSendBtn;

function initModal() {
    modal = document.getElementById('quote-modal');
    modifyBtn = document.getElementById('modify-quote-btn');
    acceptBtn = document.getElementById('accept-quote-btn');
    modalOverlay = document.getElementById('modal-overlay');
    chatModal = document.getElementById('chat-quote-modal');
    chatModalOverlay = document.getElementById('chat-modal-overlay');
    chatModalSummary = document.getElementById('chat-quote-summary');
    chatModalStatus = document.getElementById('chat-modal-status');
    chatModalNewBtn = document.getElementById('chat-modal-new-btn');
    chatModalSendBtn = document.getElementById('chat-modal-send-btn');
    
    if (modifyBtn) modifyBtn.addEventListener('click', () => {
        // Refrescar la página para nueva cotización
        window.location.reload();
    });
    if (modalOverlay) modalOverlay.addEventListener('click', hideModal);
    if (chatModalOverlay) chatModalOverlay.addEventListener('click', resetToChat);
    if (chatModalNewBtn) chatModalNewBtn.addEventListener('click', resetToChat);
    if (chatModalSendBtn) chatModalSendBtn.addEventListener('click', handleChatModalSend);
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
    }
}

function showChatModal() {
    if (chatModal) chatModal.classList.remove('hidden');
}

function hideChatModal() {
    if (chatModal) chatModal.classList.add('hidden');
    if (chatModalStatus) chatModalStatus.innerHTML = "";
    if (chatModalSendBtn) {
        chatModalSendBtn.disabled = false;
        chatModalSendBtn.textContent = "[ ENVIAR ]";
    }
}

// Date Picker Modal Functions
let pendingDataForDatePicker = null;

function showDatePickerModal(data) {
    pendingDataForDatePicker = data;
    const datePickerModal = document.getElementById('date-picker-modal');
    const datePickerInput = document.getElementById('date-picker-input');
    
    // Set minimum date to today
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    datePickerInput.min = todayStr;
    
    // Set default to 3 days from now
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(today.getDate() + 3);
    const defaultDate = threeDaysLater.toISOString().split('T')[0];
    datePickerInput.value = defaultDate;
    
    if (datePickerModal) {
        datePickerModal.classList.remove('hidden');
    }
}

function hideDatePickerModal() {
    const datePickerModal = document.getElementById('date-picker-modal');
    if (datePickerModal) {
        datePickerModal.classList.add('hidden');
    }
    pendingDataForDatePicker = null;
}

function confirmDatePicker() {
    const datePickerInput = document.getElementById('date-picker-input');
    const selectedDate = datePickerInput.value;
    
    console.log('confirmDatePicker called', { selectedDate, hasPendingData: !!pendingDataForDatePicker });
    
    if (!selectedDate) {
        alert('Por favor selecciona una fecha');
        return;
    }
    
    if (pendingDataForDatePicker) {
        // Save reference to data before it gets cleared
        const dataWithTimeline = { ...pendingDataForDatePicker, timeline: selectedDate };
        window.parsedData = dataWithTimeline;
        
        console.log('Data with timeline:', dataWithTimeline);
        
        // Hide date picker (this clears pendingDataForDatePicker)
        hideDatePickerModal();
        
        // Calculate quote directly from data (no form needed!)
        console.log('Calculating quote...');
        const quoteCalculation = calculateQuoteFromData(dataWithTimeline);
        console.log('Quote calculation result:', quoteCalculation);
        
        // Build summary from data
        console.log('Building summary...');
        const summaryHTML = buildQuoteSummaryFromData(dataWithTimeline, quoteCalculation);
        console.log('Summary HTML length:', summaryHTML.length);
        
        const chatQuoteSummary = document.getElementById('chat-quote-summary');
        console.log('Chat quote summary element:', chatQuoteSummary);
        
        if (chatQuoteSummary) {
            chatQuoteSummary.innerHTML = summaryHTML;
        }
        
        const chatInterface = document.getElementById('chat-interface');
        if (chatInterface) chatInterface.classList.add('hidden');
        
        console.log('Showing chat modal...');
        showChatModal();
        
        const parseBtn = document.getElementById('parse-input-btn');
        if (parseBtn) {
            parseBtn.disabled = false;
            parseBtn.textContent = '[ SEND ]';
        }
        
        const chatStatus = document.getElementById('chat-status');
        if (chatStatus) {
            chatStatus.innerHTML = '<p class="text-green-500">// Cotización generada exitosamente.</p>';
        }
        
        // Clear conversation history for next time
        conversationHistory = [];
    } else {
        console.error('No pending data for date picker');
    }
}

// ** CORRECCIÓN: La lógica de envío ahora está TODA dentro del click **
function setupAcceptButton() {
    if (!acceptBtn) return;
    acceptBtn.addEventListener('click', () => {
    prepareFormForSubmission();
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

    // 3. Enviar los datos FRESCOS al backend
    sendFormToBackend(currentFormData);
    });
}

// --- Lógica de Validación de Formulario Personalizada ---
function validateForm() {
    if (!currentForm) return false;

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    currentForm.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
    currentForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

    // 1. Validar Campos Básicos (Solo project-name y brief son requeridos)
    const requiredFields = ['project-name', 'brief'];
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

    // 4. Validar Tipo de Servicio (opcional, pero recomendado)
    // Ya no es requerido - se puede generar cotización sin servicio específico
    
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
    // Primer minuto: TIER1 (precio completo)
    // Minutos adicionales: TIER2 (precio reducido/descuento)
    function calculateGradualFee(totalDuration, rateTier1, rateTier2) {
        if (totalDuration <= 0) return 0;
        if (totalDuration <= 1.0) {
            // Si es 1 minuto o menos, cobrar a tarifa completa (TIER1)
            return totalDuration * rateTier1;
        } else {
            // Si pasa de 1 minuto:
            // - Primer minuto: tarifa completa (TIER1)
            // - Minutos restantes: tarifa reducida (TIER2 - descuento)
            const tier1Fee = 1.0 * rateTier1; // Primer minuto completo
            const remainingDuration = totalDuration - 1.0; // Minutos adicionales
            const tier2Fee = remainingDuration * rateTier2; // Minutos adicionales con descuento
            const totalFee = tier1Fee + tier2Fee;
            
            // Debug log
            console.log(`Gradual fee calculation: ${totalDuration.toFixed(2)} min = 1.0 min @ $${rateTier1} + ${remainingDuration.toFixed(2)} min @ $${rateTier2} = $${tier1Fee} + $${tier2Fee.toFixed(2)} = $${totalFee.toFixed(2)}`);
            
            return totalFee;
        }
    }

    function calculateQuote() {
        const isAudio = audioCheckbox.checked;
        const isVideo = videoCheckbox.checked;
        // Check both the checkbox AND if "Proyecto Existente" radio is selected
        const projectTypeExisting = document.getElementById('project-type-existing');
        const isExistingProject = existingProjectCheckbox.checked || (projectTypeExisting && projectTypeExisting.checked);

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
            
            // Check if we have individual durations from parsedData
            const parsedData = window.parsedData || {};
            const parsedAudio = parsedData.audio || {};
            const individualDurations = parsedAudio.individualDurations || [];
            
            if (individualDurations.length > 0) {
                // Calculate fee for each individual audio
                totalAudioFee = 0;
                for (let i = 0; i < individualDurations.length; i++) {
                    const dur = individualDurations[i];
                    const parsed = parseDurationString(dur);
                    const durMinutes = parsed.minutes + (parsed.seconds / 60);
                    const itemFee = calculateGradualFee(durMinutes, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
                    totalAudioFee += itemFee;
                    console.log(`Audio ${i + 1}: ${parsed.minutes}m ${parsed.seconds}s (${durMinutes.toFixed(2)} min) = $${itemFee.toFixed(2)}`);
                }
                // Add fee for remaining items if any
                if (individualDurations.length < quantity) {
                    const remaining = quantity - individualDurations.length;
                    const feePerItem = calculateGradualFee(durationPerItem, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
                    totalAudioFee += feePerItem * remaining;
                    console.log(`${remaining} additional audio(s): ${durationPerItem.toFixed(2)} min each = $${(feePerItem * remaining).toFixed(2)}`);
                }
                console.log(`Total Audio Fee: $${totalAudioFee.toFixed(2)}`);
            } else {
                // All items have same duration
                const feePerItem = calculateGradualFee(durationPerItem, RATES.AUDIO_TIER1, RATES.AUDIO_TIER2);
                totalAudioFee = feePerItem * quantity;
                console.log(`Audio calculation: ${quantity} items × ${durationPerItem.toFixed(2)} min/item = ${feePerItem.toFixed(2)} per item × ${quantity} = ${totalAudioFee.toFixed(2)} total`);
            }
        }

        // 2. Calcular Costo de Video (si está seleccionado)
        if (isVideo) {
            const quantity = parseFloat(videoQuantityInput.value) || 1;
            const minutes = parseFloat(videoMinInput.value) || 0;
            const seconds = parseFloat(videoSecInput.value) || 0;
            const durationPerItem = minutes + (seconds / 60);
            
            // Check if we have individual durations from parsedData
            const parsedData = window.parsedData || {};
            const parsedVideo = parsedData.video || {};
            const individualDurations = parsedVideo.individualDurations || [];
            
            if (individualDurations.length > 0) {
                // Calculate fee for each individual video
                totalVideoFee = 0;
                for (let i = 0; i < individualDurations.length; i++) {
                    const dur = individualDurations[i];
                    const parsed = parseDurationString(dur);
                    const durMinutes = parsed.minutes + (parsed.seconds / 60);
                    const itemFee = calculateGradualFee(durMinutes, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
                    totalVideoFee += itemFee;
                    console.log(`Video ${i + 1}: ${parsed.minutes}m ${parsed.seconds}s (${durMinutes.toFixed(2)} min) = $${itemFee.toFixed(2)}`);
                }
                // Add fee for remaining items if any
                if (individualDurations.length < quantity) {
                    const remaining = quantity - individualDurations.length;
                    const feePerItem = calculateGradualFee(durationPerItem, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
                    totalVideoFee += feePerItem * remaining;
                    console.log(`${remaining} additional video(s): ${durationPerItem.toFixed(2)} min each = $${(feePerItem * remaining).toFixed(2)}`);
                }
                console.log(`Total Video Fee: $${totalVideoFee.toFixed(2)}`);
            } else {
                // All items have same duration
                const feePerItem = calculateGradualFee(durationPerItem, RATES.VIDEO_TIER1, RATES.VIDEO_TIER2);
                totalVideoFee = feePerItem * quantity;
                console.log(`Video calculation: ${quantity} items × ${durationPerItem.toFixed(2)} min/item = ${feePerItem.toFixed(2)} per item × ${quantity} = ${totalVideoFee.toFixed(2)} total`);
            }
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
        
        hiddenQuote.value = totalQuote.toFixed(2); // Guardar el valor numérico
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

/**
 * Genera el resumen de la cotización basado en los valores actuales del formulario
 * y luego muestra el modal.
 */
function buildQuoteSummaryHTML() {
    const isAudio = document.getElementById('service-audio').checked;
    const isVideo = document.getElementById('service-video').checked;
    const baseFee = parseFloat(document.getElementById('calculated_base_fee').value) || 0;
    const audioFee = parseFloat(document.getElementById('calculated_audio_fee').value) || 0;
    const videoFee = parseFloat(document.getElementById('calculated_video_fee').value) || 0;
    // Check both checkbox and radio button state
    const existingProjectCheckbox = document.getElementById('existing-project');
    const projectTypeExisting = document.getElementById('project-type-existing');
    const isExistingProject = (existingProjectCheckbox && existingProjectCheckbox.checked) || 
                              (projectTypeExisting && projectTypeExisting.checked);
    
    // Asegurar que hidden-quote tiene el valor formateado (para el display final)
    const totalQuote = document.getElementById('estimated-quote').value;
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
        const audioQuantityInput = document.getElementById('audio_quantity');
        const audioMinInput = document.getElementById('audio_min');
        const audioSecInput = document.getElementById('audio_sec');
        
        const audioQuantity = audioQuantityInput ? parseInt(audioQuantityInput.value) || 1 : 1;
        const audioMinutes = audioMinInput ? parseFloat(audioMinInput.value) || 0 : 0;
        const audioSeconds = audioSecInput ? parseFloat(audioSecInput.value) || 0 : 0;
        
        const audioFormat = document.getElementById('format_av_audio')?.value || 'N/A';
        const audioResolution = document.getElementById('resolution_av_audio')?.value || 'N/A';
        
        // Calculate total duration from form values (same as calculateQuote does)
        const parsedData = window.parsedData || {};
        const parsedAudio = parsedData.audio || {};
        const individualDurations = parsedAudio.individualDurations || [];
        
        let totalDurationMinutes = 0;
        if (individualDurations.length > 0) {
            totalDurationMinutes = individualDurations.reduce((sum, dur) => {
                const parsedDur = parseDurationString(dur);
                return sum + parsedDur.minutes + (parsedDur.seconds / 60);
            }, 0);
        } else {
            // Same calculation as in calculateQuote: quantity * duration per item
            totalDurationMinutes = (audioMinutes + (audioSeconds / 60)) * audioQuantity;
        }
        
        let totalDurationSeconds = Math.round(totalDurationMinutes * 60);
        if (totalDurationSeconds < 0) totalDurationSeconds = 0;
        let totalMinutesWhole = Math.floor(totalDurationSeconds / 60);
        let totalSeconds = totalDurationSeconds % 60;
        
        // Normalize seconds to minutes if >= 60
        if (totalSeconds >= 60) {
            totalMinutesWhole += Math.floor(totalSeconds / 60);
            totalSeconds %= 60;
        }
        
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad Total:</strong> ${audioQuantity}</p>
                <p><strong class="text-gray-300">Specs:</strong> ${audioFormat} | ${audioResolution}</p>
                <hr class="border-gray-500/30 my-2">
        `;
        
        // Show individual breakdown if we have individual durations
        if (individualDurations.length > 0) {
            summaryHTML += `<p class="text-gray-400 text-sm mb-2">Desglose individual:</p>`;
            for (let i = 0; i < individualDurations.length; i++) {
                const parsedDur = parseDurationString(individualDurations[i]);
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• Audio ${i + 1}: ${parsedDur.minutes}m ${parsedDur.seconds}s</p>
                `;
            }
            // If there are remaining items without individual durations, show them
            if (individualDurations.length < audioQuantity) {
                const remaining = audioQuantity - individualDurations.length;
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• ${remaining} audio(s) adicional(es): ${audioMinutes}m ${audioSeconds}s c/u</p>
                `;
            }
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        } else {
            // Show per-item duration if all are the same
            summaryHTML += `<p><strong class="text-gray-300">Duración (c/u):</strong> ${audioMinutes}m ${audioSeconds}s</p>`;
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        }
        
        summaryHTML += `
                <p><strong class="text-gray-300">Duración Total:</strong> ${totalMinutesWhole}m ${totalSeconds}s</p>
                <p><strong class="text-yellow-300">Subtotal Audio:</strong> $${audioFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (isVideo) {
        const videoQuantityInput = document.getElementById('video_quantity');
        const videoMinInput = document.getElementById('video_min');
        const videoSecInput = document.getElementById('video_sec');
        
        const videoQuantity = videoQuantityInput ? parseInt(videoQuantityInput.value) || 1 : 1;
        const videoMinutes = videoMinInput ? parseFloat(videoMinInput.value) || 0 : 0;
        const videoSeconds = videoSecInput ? parseFloat(videoSecInput.value) || 0 : 0;
        
        const videoFormat = document.getElementById('format_av_video')?.value || 'N/A';
        const videoResolution = document.getElementById('resolution_av_video')?.value || 'N/A';
        
        // Calculate total duration from form values (same as calculateQuote does)
        const parsedData = window.parsedData || {};
        const parsedVideo = parsedData.video || {};
        const individualDurations = parsedVideo.individualDurations || [];
        
        let totalDurationMinutes = 0;
        if (individualDurations.length > 0) {
            totalDurationMinutes = individualDurations.reduce((sum, dur) => {
                const parsedDur = parseDurationString(dur);
                return sum + parsedDur.minutes + (parsedDur.seconds / 60);
            }, 0);
        } else {
            // Same calculation as in calculateQuote: quantity * duration per item
            totalDurationMinutes = (videoMinutes + (videoSeconds / 60)) * videoQuantity;
        }
        
        let totalDurationSeconds = Math.round(totalDurationMinutes * 60);
        if (totalDurationSeconds < 0) totalDurationSeconds = 0;
        let totalMinutesWhole = Math.floor(totalDurationSeconds / 60);
        let totalSeconds = totalDurationSeconds % 60;
        
        // Normalize seconds to minutes if >= 60
        if (totalSeconds >= 60) {
            totalMinutesWhole += Math.floor(totalSeconds / 60);
            totalSeconds %= 60;
        }
        
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad Total:</strong> ${videoQuantity}</p>
                <p><strong class="text-gray-300">Specs:</strong> ${videoFormat} | ${videoResolution}</p>
                <hr class="border-gray-500/30 my-2">
        `;
        
        // Show individual breakdown if we have individual durations
        if (individualDurations.length > 0) {
            summaryHTML += `<p class="text-gray-400 text-sm mb-2">Desglose individual:</p>`;
            for (let i = 0; i < individualDurations.length; i++) {
                const parsedDur = parseDurationString(individualDurations[i]);
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• Video ${i + 1}: ${parsedDur.minutes}m ${parsedDur.seconds}s</p>
                `;
            }
            // If there are remaining items without individual durations, show them
            if (individualDurations.length < videoQuantity) {
                const remaining = videoQuantity - individualDurations.length;
                summaryHTML += `
                    <p class="pl-3 text-sm text-gray-300">• ${remaining} video(s) adicional(es): ${videoMinutes}m ${videoSeconds}s c/u</p>
                `;
            }
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        } else {
            // Show per-item duration if all are the same
            summaryHTML += `<p><strong class="text-gray-300">Duración (c/u):</strong> ${videoMinutes}m ${videoSeconds}s</p>`;
            summaryHTML += `<hr class="border-gray-500/30 my-2">`;
        }
        
        summaryHTML += `
                <p><strong class="text-gray-300">Duración Total:</strong> ${totalMinutesWhole}m ${totalSeconds}s</p>
                <p><strong class="text-yellow-300">Subtotal Video:</strong> $${videoFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    summaryHTML += `<hr class="border-gray-500/50 my-2">`;
    
    // Only show base fee for NEW projects (not existing projects)
    if (!isExistingProject && (isAudio || isVideo) && baseFee > 0) {
         summaryHTML += `<p><strong class="text-gray-300">TARIFA BASE (Proyecto):</strong> $${baseFee.toFixed(2)} MXN</p>`;
         summaryHTML += `<p class="text-sm text-yellow-300/80">> (La Tarifa Base es por proyecto. Se omitirá en futuros añadidos a este proyecto.)</p>`;
    }

    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${document.getElementById('timeline').value || 'N/A'}</p>`;
    
    const urgencyFeeNote = document.getElementById('urgency-fee-note');
    if (urgencyFeeNote && !urgencyFeeNote.classList.contains('hidden')) {
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> ${urgencyFeeNote.textContent.split(': ')[1]}</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: ${totalQuote}</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${document.getElementById('brief').value || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;

    return summaryHTML;
}

function prepareFormForSubmission() {
    const emailValue = document.getElementById('email').value;
    if (emailValue) {
        document.getElementById('form-replyto').value = emailValue;
    }
    document.getElementById('form-subject').value = document.getElementById('project-name').value || 'Nueva Cotización FUKURO';
    const termsCheckbox = document.getElementById('terms-checkbox');
    if (termsCheckbox) {
        termsCheckbox.checked = true;
    }
}

function handleGenerateQuote(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        const firstError = currentForm.querySelector('.invalid');
        if(firstError) firstError.focus();
        return;
    }

    prepareFormForSubmission();

    const summaryDiv = document.getElementById('quote-summary');
    const summaryHTML = buildQuoteSummaryHTML();
    summaryDiv.innerHTML = summaryHTML;
    
    showModal();
}

async function sendFormToBackend(formData, options = {}) {
    const statusElement = document.getElementById(options.statusElementId || 'modal-status');
    const submitButton = options.acceptButton || acceptBtn;
    const secondaryButton = options.modifyButton || modifyBtn;
    const sendingText = options.sendingText || "[ ... ]";
    
    if (statusElement) {
        statusElement.innerHTML = '<p class="text-yellow-300">// TRANSMITIENDO_DATOS...</p>';
    }
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = sendingText;
    }
    if (secondaryButton) secondaryButton.disabled = true;

    try {
        // Convert FormData to JSON object
        const formDataObj = {};
        for (const [key, value] of formData.entries()) {
            formDataObj[key] = value;
        }
        
        const response = await fetch(`${API_BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(formDataObj)
        });

        const responseData = await response.json();

        if (response.ok && responseData.success) {
            if (statusElement) {
                statusElement.innerHTML = `
                <p class="text-gray-200 neon-shadow">++ TRANSMISIÓN_EXITOSA ++</p>
                <p class="mt-1">// Hemos recibido tu solicitud.</p>
                <p class="text-yellow-300 mt-2">// Redirigiendo a tu recibo...</p>
            `;
            }
            
            // Reload projects to update counts
            await loadProjects();
            
            // --- Redirección ---
            setTimeout(() => {
                window.location.href = 'cotizacion.html'; 
            }, 1500); // Esperar 1.5 seg antes de redirigir

            currentForm.reset();
            setupQuoteCalculator(); // Recalcular (para resetear todo)
            if (secondaryButton) secondaryButton.disabled = true;
            if (submitButton) submitButton.disabled = true;
            
        } else {
            const errorMsg = responseData.error || 'Error del servidor';
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error("Error al enviar formulario:", error);
        if (statusElement) statusElement.innerHTML = `<p class="text-red-500">-- ERROR: FALLA_TRANSMISIÓN --</p><p>// ${error.message || 'Intenta de nuevo o contacta directamente.'}</p>`;
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = options.idleText || "[ ACEPTAR Y ENVIAR ]";
        }
        if (secondaryButton) secondaryButton.disabled = false;
        
        // Limpiar datos de sessionStorage solo si el envío falla
        sessionStorage.removeItem('fukuroQuote'); 
    }
}

function handleChatModalSend(event) {
    if (event) event.preventDefault();
    
    const data = window.parsedData;
    if (!data) {
        console.error('No data to send');
        if (chatModalStatus) {
            chatModalStatus.innerHTML = '<p class="text-red-500">Error: No hay datos para enviar</p>';
        }
        return;
    }
    
    console.log('Sending quote data:', data);
    
    // Disable buttons
    if (chatModalSendBtn) {
        chatModalSendBtn.disabled = true;
        chatModalSendBtn.textContent = '[ ENVIANDO... ]';
    }
    if (chatModalNewBtn) chatModalNewBtn.disabled = true;
    
    if (chatModalStatus) {
        chatModalStatus.innerHTML = '<p class="text-yellow-300">// TRANSMITIENDO_DATOS...</p>';
    }
    
    // Send data to backend
    sendQuoteToBackend(data);
}

async function sendQuoteToBackend(data) {
    try {
        // Prepare data for backend
        const quoteData = {
            'project-name': data.projectName || 'N/A',
            'name': data.name || '',
            'email': data.email || '',
            'existing-project': data.isExistingProject ? 'true' : 'false',
            'service_type': data.serviceType ? data.serviceType.join(', ') : '',
            'timeline': data.timeline || '',
            'brief': data.brief || '',
            'assets-link': data.assetsLink || '',
            // Calculate quote
            'cotizacion_estimada': calculateQuoteFromData(data).totalQuote.toFixed(2)
        };
        
        // Add audio details if present
        if (data.audio) {
            quoteData['audio_quantity'] = data.audio.quantity || 0;
            quoteData['audio_min'] = data.audio.minutes || 0;
            quoteData['audio_sec'] = data.audio.seconds || 0;
            quoteData['format_av_audio'] = data.audio.format || '';
            quoteData['resolution_av_audio'] = data.audio.resolution || '';
        }
        
        // Add video details if present
        if (data.video) {
            quoteData['video_quantity'] = data.video.quantity || 0;
            quoteData['video_min'] = data.video.minutes || 0;
            quoteData['video_sec'] = data.video.seconds || 0;
            quoteData['format_av_video'] = data.video.format || '';
            quoteData['resolution_av_video'] = data.video.resolution || '';
        }
        
        console.log('Sending to backend:', quoteData);
        
        const response = await fetch(`${API_BASE_URL}/api/quotes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(quoteData)
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            console.log('Quote sent successfully:', result);
            
            if (chatModalStatus) {
                chatModalStatus.innerHTML = '<p class="text-green-500">// ✓ COTIZACIÓN ENVIADA EXITOSAMENTE</p>';
            }
            
            // Reload projects list
            await loadProjects();
            
            // Show success message and redirect after a delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            throw new Error(result.error || 'Error al enviar la cotización');
        }
    } catch (error) {
        console.error('Error sending quote:', error);
        
        if (chatModalStatus) {
            chatModalStatus.innerHTML = `<p class="text-red-500">// ERROR: ${error.message}</p>`;
        }
        
        // Re-enable buttons
        if (chatModalSendBtn) {
            chatModalSendBtn.disabled = false;
            chatModalSendBtn.textContent = '[ ENVIAR ]';
        }
        if (chatModalNewBtn) chatModalNewBtn.disabled = false;
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

    // --- System Prompt con lógica a prueba de errores para DURACIÓN ---
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
    "minutes": número (duración POR CADA audio, no total),
    "seconds": número (duración POR CADA audio, no total),
    "format": "formato de audio",
    "resolution": "calidad de audio",
    "individualDurations": ["duración del audio 1", "duración del audio 2", "..."] // Opcional
  },
  "video": {
    "quantity": número,
    "minutes": número (duración POR CADA video, no total),
    "seconds": número (duración POR CADA video, no total),
    "format": "formato de video",
    "resolution": "resolución de video",
    "individualDurations": ["duración del video 1", "..."] // Opcional
  },
  "brief": "descripción del proyecto",
  "assetsLink": "link de recursos si se menciona"
}

CAMPOS REQUERIDOS para generar cotización: brief (descripción del proyecto).
projectName (nombre del proyecto) es REQUERIDO SOLO si es un proyecto nuevo. Si el usuario selecciona un proyecto existente, projectName puede ser null.
name, email y serviceType son OPCIONALES - solo extrae si se mencionan explícitamente.
NO extraigas ni menciones timeline/fecha de entrega - esto se manejará por separado.

IMPORTANTE SOBRE DURACIÓN: Los campos "minutes" y "seconds" en audio/video representan la duración DE CADA UNO de los entregables, NO la duración total. 
Ejemplo: Si el usuario dice "4 audios de 10 segundos cada uno" -> quantity: 4, seconds: 10 (NO 40).
Ejemplo: Si el usuario dice "3 videos de 2 minutos" -> quantity: 3, minutes: 2 (NO 6).

Si algún campo no está presente en el texto, usa null. Para fechas, intenta interpretar usando el año actual. Ejemplos: "15 de diciembre" -> año actual-12-15, "25 noviembre" -> año actual-11-25, "mañana" -> fecha de mañana. SIEMPRE usa el año actual, nunca uses años pasados como 2024.
Para serviceType, determina si menciona audio, video, o ambos. Si no se menciona, deja null.
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
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentYear = today.getFullYear();
    
    // Intentar parsear la fecha con el año actual primero
    let parsedDate = new Date(`${dateStr} ${currentYear}`);
    
    // Si no se puede parsear así, intentar sin año
    if (isNaN(parsedDate.getTime())) {
        parsedDate = new Date(dateStr);
    }
    
    // Si aún no se puede parsear, retornar null
    if (isNaN(parsedDate.getTime())) {
        return null;
    }
    
    // Normalizar la fecha para comparación
    parsedDate.setHours(0, 0, 0, 0);
    
    // Extraer mes y día
    let month = parsedDate.getMonth() + 1;
    let day = parsedDate.getDate();
    let year = currentYear;
    
    // Si el año parseado es menor a 2000, usar año actual
    if (parsedDate.getFullYear() < 2000) {
        year = currentYear;
    } else if (parsedDate.getFullYear() > 2000 && parsedDate.getFullYear() !== currentYear) {
        // Si GPT devolvió un año específico, usarlo
        year = parsedDate.getFullYear();
    }
    
    // Crear fecha con el año correcto
    const dateWithCorrectYear = new Date(year, month - 1, day);
    dateWithCorrectYear.setHours(0, 0, 0, 0);
    
    // Si la fecha ya pasó este año, usar el próximo año
    if (dateWithCorrectYear < today) {
        year = currentYear + 1;
    }
    
    // Formatear como YYYY-MM-DD
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    
    return `${year}-${monthStr}-${dayStr}`;
}

function fillFormFromParsedData(data) {
    // Check if existing project is selected - if so, use that name instead
    const existingProjectCheckbox = document.getElementById('existing-project');
    const existingProjectName = document.getElementById('existing-project-name');
    const isExistingProjectSelected = existingProjectCheckbox && existingProjectCheckbox.checked;
    const hasExistingProjectName = existingProjectName && existingProjectName.value && existingProjectName.value.trim() !== '';
    
    // Llenar campos básicos
    const nameInput = document.getElementById('name');
    const emailInput = document.getElementById('email');
    const projectNameInput = document.getElementById('project-name');
    const timelineInput = document.getElementById('timeline');
    const briefInput = document.getElementById('brief');
    const assetsLinkInput = document.getElementById('assets-link');
    
    if (data.name && nameInput) nameInput.value = data.name;
    if (data.email && emailInput) emailInput.value = data.email;
    
    // Only fill project name if it's a new project (not existing project selected)
    if (projectNameInput) {
        if (!isExistingProjectSelected && !hasExistingProjectName) {
            if (data.projectName) projectNameInput.value = data.projectName;
        } else if (hasExistingProjectName) {
            // Use the selected existing project name
            projectNameInput.value = existingProjectName.value;
        }
    }
    
    // Parsear fecha si existe
    if (data.timeline && timelineInput) {
        const parsedDate = parseDate(data.timeline);
        if (parsedDate) {
            timelineInput.value = parsedDate;
        }
    }
    
    if (data.brief && briefInput) briefInput.value = data.brief;
    if (data.assetsLink && assetsLinkInput) assetsLinkInput.value = data.assetsLink;
    
    // Checkbox de proyecto existente
    const existingProjectCheckboxInput = document.getElementById('existing-project');
    if (data.isExistingProject !== null && existingProjectCheckboxInput) {
        existingProjectCheckboxInput.checked = data.isExistingProject;
    }
    
    // Servicios
    const audioCheckbox = document.getElementById('service-audio');
    const videoCheckbox = document.getElementById('service-video');
    
    if (data.serviceType && Array.isArray(data.serviceType) && audioCheckbox && videoCheckbox) {
        audioCheckbox.checked = data.serviceType.includes('Audio');
        videoCheckbox.checked = data.serviceType.includes('Video');
    }
    
    // Detalles de Audio
    if (data.audio) {
        if (data.audio.quantity) {
            const qtyInput = document.getElementById('audio_quantity');
            if (qtyInput) qtyInput.value = Math.min(data.audio.quantity, 10);
        }
        if (data.audio.minutes !== null && data.audio.minutes !== undefined) {
            const minInput = document.getElementById('audio_min');
            if (minInput) {
                minInput.value = data.audio.minutes;
                console.log('Setting audio_min to:', data.audio.minutes);
            }
        }
        if (data.audio.seconds !== null && data.audio.seconds !== undefined) {
            const secInput = document.getElementById('audio_sec');
            if (secInput) {
                secInput.value = data.audio.seconds;
                console.log('Setting audio_sec to:', data.audio.seconds);
            }
        }
        const audioFormatInput = document.getElementById('format_av_audio');
        const audioResolutionInput = document.getElementById('resolution_av_audio');
        if (data.audio.format && audioFormatInput) audioFormatInput.value = data.audio.format;
        if (data.audio.resolution && audioResolutionInput) audioResolutionInput.value = data.audio.resolution;
    }
    
    // Detalles de Video
    if (data.video) {
        const videoQtyInput = document.getElementById('video_quantity');
        const videoMinInput = document.getElementById('video_min');
        const videoSecInput = document.getElementById('video_sec');
        const videoFormatInput = document.getElementById('format_av_video');
        const videoResolutionInput = document.getElementById('resolution_av_video');
        
        if (data.video.quantity && videoQtyInput) videoQtyInput.value = Math.min(data.video.quantity, 10);
        if (data.video.minutes !== null && data.video.minutes !== undefined && videoMinInput) {
            videoMinInput.value = data.video.minutes;
        }
        if (data.video.seconds !== null && data.video.seconds !== undefined && videoSecInput) {
            videoSecInput.value = data.video.seconds;
        }
        if (data.video.format && videoFormatInput) videoFormatInput.value = data.video.format;
        if (data.video.resolution && videoResolutionInput) videoResolutionInput.value = data.video.resolution;
    }
    
    // Recalcular cotización
    setupQuoteCalculator();
    
    // Trigger change events para que se calculen los valores
    if (audioCheckbox) audioCheckbox.dispatchEvent(new Event('change'));
    if (videoCheckbox) videoCheckbox.dispatchEvent(new Event('change'));
}

function getMissingFields(data) {
    const missing = [];
    
    // Check if existing project is selected
    const existingProjectCheckbox = document.getElementById('existing-project');
    const existingProjectName = document.getElementById('existing-project-name');
    const isExistingProjectSelected = existingProjectCheckbox && existingProjectCheckbox.checked;
    const hasExistingProjectName = existingProjectName && existingProjectName.value && existingProjectName.value.trim() !== '';
    
    // Solo brief es siempre requerido (timeline se maneja por separado con date picker)
    // projectName solo es requerido si NO hay un proyecto existente seleccionado
    const required = ['brief'];
    
    // Solo requerir projectName si no hay proyecto existente seleccionado
    if (!isExistingProjectSelected && !hasExistingProjectName) {
        required.push('projectName');
    }
    
    required.forEach(field => {
        if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
            missing.push(field);
        }
    });
    
    return missing;
}

function checkDurationRequirements(data) {
    const issues = [];

    if (data.audio) {
        const qty = parseInt(data.audio.quantity, 10) || 0;
        const durationsList = Array.isArray(data.audio.individualDurations) ? data.audio.individualDurations.filter(Boolean) : [];
        const hasPerItemDuration = (parseFloat(data.audio.minutes) > 0 || parseFloat(data.audio.seconds) > 0);

        if (qty > 1) {
            if (durationsList.length > 0 && durationsList.length < qty) {
                issues.push(`Necesito la duración de los ${qty} audios. Solo tengo información para ${durationsList.length}.`);
            } else if (!hasPerItemDuration && durationsList.length === 0) {
                issues.push(`Necesito la duración aproximada de cada uno de los ${qty} audios.`);
            }
        } else if (qty >= 1 && !hasPerItemDuration && durationsList.length === 0) {
            issues.push('Necesito la duración aproximada del audio.');
        }
    }

    if (data.video) {
        const qty = parseInt(data.video.quantity, 10) || 0;
        const durationsList = Array.isArray(data.video.individualDurations) ? data.video.individualDurations.filter(Boolean) : [];
        const hasPerItemDuration = (parseFloat(data.video.minutes) > 0 || parseFloat(data.video.seconds) > 0);

        if (qty > 1) {
            if (durationsList.length > 0 && durationsList.length < qty) {
                issues.push(`Necesito la duración de los ${qty} videos. Solo tengo información para ${durationsList.length}.`);
            } else if (!hasPerItemDuration && durationsList.length === 0) {
                issues.push(`Necesito la duración aproximada de cada uno de los ${qty} videos.`);
            }
        } else if (qty >= 1 && !hasPerItemDuration && durationsList.length === 0) {
            issues.push('Necesito la duración aproximada del video.');
        }
    }

    return issues;
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
            parseBtn.textContent = '[ SEND ]';
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
    parseBtn.textContent = '[ SENDING... ]';
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
        
        // Check if existing project is selected - if so, set project name from dropdown
        const existingProjectCheckbox = document.getElementById('existing-project');
        const existingProjectName = document.getElementById('existing-project-name');
        const isExistingProjectSelected = existingProjectCheckbox && existingProjectCheckbox.checked;
        const hasExistingProjectName = existingProjectName && existingProjectName.value && existingProjectName.value.trim() !== '';
        
        // If existing project is selected, use that project name
        if (isExistingProjectSelected && hasExistingProjectName && !mergedData.projectName) {
            mergedData.projectName = existingProjectName.value;
        }
        
        // Verificar campos faltantes (timeline se maneja siempre con date picker)
        const missingFields = getMissingFields(mergedData);
        
        if (missingFields.length > 0) {
            const fieldNames = {
                'projectName': 'nombre del proyecto',
                'brief': 'descripción del proyecto (brief)'
            };
            
            const missingList = missingFields.map(f => fieldNames[f] || f).join(', ');
            addChatMessage(`Necesito más información: ${missingList}. Por favor, proporciona estos datos.`, false);
            chatStatus.innerHTML = `<p class="text-yellow-300">// Algunos datos faltan. Por favor, proporciona: ${missingList}</p>`;
            parseBtn.disabled = false;
            parseBtn.textContent = '[ SEND ADDITIONAL INFO ]';
            return;
        }

        const durationIssues = checkDurationRequirements(mergedData);
        if (durationIssues.length > 0) {
            const message = durationIssues.join(' ');
            addChatMessage(message, false);
            chatStatus.innerHTML = `<p class="text-yellow-300">// ${message}</p>`;
            parseBtn.disabled = false;
            parseBtn.textContent = '[ SEND ADDITIONAL INFO ]';
            return;
        }
        
        // ALWAYS show date picker modal (regardless of whether timeline was mentioned)
        // Remove any timeline that GPT might have extracted
        delete mergedData.timeline;
        
        // Check project selection status and update data accordingly
        const projectTypeExisting = document.getElementById('project-type-existing');
        const existingProjectNameSelect = document.getElementById('existing-project-name');
        
        if (projectTypeExisting && projectTypeExisting.checked) {
            // Existing project selected
            mergedData.isExistingProject = true;
            if (existingProjectNameSelect && existingProjectNameSelect.value) {
                mergedData.projectName = existingProjectNameSelect.value;
            }
        } else {
            // New project
            mergedData.isExistingProject = false;
        }
        
        console.log('Data before date picker:', mergedData);
        
        parseBtn.disabled = false;
        parseBtn.textContent = '[ SEND ]';
        chatStatus.innerHTML = '<p class="text-green-500">// Información recibida. Selecciona la fecha de entrega.</p>';
        showDatePickerModal(mergedData);
        
    } catch (error) {
        console.error('Error in handleParseInput:', error);
        const errorMessage = error.message || 'Error desconocido';
        addChatMessage(`Error: ${errorMessage}`, false);
        chatStatus.innerHTML = `<p class="text-red-500">-- ERROR: ${errorMessage} --</p>`;
        parseBtn.disabled = false;
        parseBtn.textContent = '[ SEND ]';
    }
}

function resetToChat() {
    // Refrescar la página para resetear todo el estado completamente
    window.location.reload();
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
        recognition.continuous = true;
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
        const recordText = document.getElementById('record-text');
        const recordingStatus = document.getElementById('recording-status');
        
        if (recordBtn) {
            recordBtn.classList.add('opacity-75');
        }
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
        if (recognition) {
            recognition.stop();
        }
    } catch (error) {
        console.error('Error stopping recording:', error);
    }
    
    isRecording = false;
    
    const recordBtn = document.getElementById('record-voice-btn');
    const recordText = document.getElementById('record-text');
    const recordingStatus = document.getElementById('recording-status');
    
    if (recordBtn) {
        recordBtn.classList.remove('opacity-75');
    }
    if (recordText) recordText.textContent = '[ GRABAR VOZ ]';
    if (recordingStatus) recordingStatus.classList.add('hidden');
}

// Inicializar reconocimiento de voz al cargar
initSpeechRecognition();

// Configurar botón de grabación
const recordBtn = document.getElementById('record-voice-btn');
if (recordBtn) {
    const startHandler = (e) => {
        e.preventDefault();
        startRecording();
    };
    const endHandler = (e) => {
        e.preventDefault();
        stopRecording();
    };
    recordBtn.addEventListener('mousedown', startHandler);
    recordBtn.addEventListener('mouseup', endHandler);
    recordBtn.addEventListener('mouseleave', endHandler);
    recordBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHandler(e); }, { passive: false });
    recordBtn.addEventListener('touchend', endHandler);
    recordBtn.addEventListener('touchcancel', endHandler);
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

// --- Project Management ---
async function loadProjects() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`);
        if (response.ok) {
            const data = await response.json();
            projects = data.projects || [];
            updateProjectDropdown();
        } else {
            console.error('Failed to load projects');
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
}

function updateProjectDropdown() {
    const select = document.getElementById('existing-project-name');
    if (!select) return;
    
    select.innerHTML = '<option value="">Selecciona un proyecto...</option>';
    
    if (projects.length === 0) {
        select.innerHTML = '<option value="">No hay proyectos existentes</option>';
        return;
    }
    
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.name;
        option.textContent = project.name; // Removed quote count from frontend
        select.appendChild(option);
    });
}

function setupProjectSelection() {
    const projectTypeNew = document.getElementById('project-type-new');
    const projectTypeExisting = document.getElementById('project-type-existing');
    const existingProjectSelect = document.getElementById('existing-project-select');
    const existingProjectName = document.getElementById('existing-project-name');
    const existingProjectCheckbox = document.getElementById('existing-project');
    
    if (!projectTypeNew || !projectTypeExisting || !existingProjectSelect) return;
    
    function handleProjectTypeChange() {
        if (projectTypeNew.checked) {
            existingProjectSelect.classList.add('hidden');
            if (existingProjectCheckbox) {
                existingProjectCheckbox.checked = false;
                // Trigger recalculation when unchecking existing project
                existingProjectCheckbox.dispatchEvent(new Event('change'));
            }
        } else {
            // When "Proyecto Existente" is selected, always check the checkbox
            existingProjectSelect.classList.remove('hidden');
            if (existingProjectCheckbox) {
                existingProjectCheckbox.checked = true;
                // Trigger recalculation immediately
                existingProjectCheckbox.dispatchEvent(new Event('change'));
            }
            if (existingProjectName && existingProjectName.value) {
                const projectNameInput = document.getElementById('project-name');
                if (projectNameInput) {
                    projectNameInput.value = existingProjectName.value;
                }
            }
        }
    }
    
    projectTypeNew.addEventListener('change', handleProjectTypeChange);
    projectTypeExisting.addEventListener('change', handleProjectTypeChange);
    
    if (existingProjectName) {
        existingProjectName.addEventListener('change', (e) => {
            const projectNameInput = document.getElementById('project-name');
            if (projectNameInput) {
                projectNameInput.value = e.target.value;
            }
            if (existingProjectCheckbox) {
                existingProjectCheckbox.checked = true;
                // Trigger recalculation when selecting existing project
                existingProjectCheckbox.dispatchEvent(new Event('change'));
            }
        });
    }
}

// --- Backend Login Functions ---
function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
        document.getElementById('login-username').focus();
    }
}

function hideLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.add('hidden');
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.reset();
        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.classList.add('hidden');
            loginError.textContent = '';
        }
    }
}

function handleLogin(event) {
    if (event) event.preventDefault();
    
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const loginError = document.getElementById('login-error');
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        isAuthenticated = true;
        sessionStorage.setItem('backend_authenticated', 'true');
        hideLoginModal();
        showBackendDashboard();
    } else {
        if (loginError) {
            loginError.textContent = 'Credenciales incorrectas';
            loginError.classList.remove('hidden');
        }
    }
}

function logout() {
    isAuthenticated = false;
    sessionStorage.removeItem('backend_authenticated');
    hideBackendDashboard();
}

function showBackendDashboard() {
    const backendAccess = document.getElementById('backend-access');
    if (backendAccess) {
        backendAccess.classList.remove('hidden');
        loadBackendData();
        // Create example project if it doesn't exist
        createExampleProject();
    }
}

function hideBackendDashboard() {
    const backendAccess = document.getElementById('backend-access');
    if (backendAccess) {
        backendAccess.classList.add('hidden');
    }
}

async function loadBackendData() {
    // Load projects
    try {
        const projectsResponse = await fetch(`${API_BASE_URL}/api/projects`);
        if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            displayBackendProjects(projectsData.projects || []);
        }
    } catch (error) {
        console.error('Error loading projects:', error);
    }
    
    // Load quotes
    try {
        const quotesResponse = await fetch(`${API_BASE_URL}/api/quotes`);
        if (quotesResponse.ok) {
            const quotesData = await quotesResponse.json();
            displayBackendQuotes(quotesData.quotes || []);
        }
    } catch (error) {
        console.error('Error loading quotes:', error);
    }
}

// Create example project on first load
async function createExampleProject() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`);
        if (response.ok) {
            const data = await response.json();
            const projects = data.projects || [];
            const hasTenampa = projects.some(p => p.name === 'Tenampa 100');
            
            if (!hasTenampa) {
                await createProject('Tenampa 100');
            }
        }
    } catch (error) {
        console.error('Error checking/creating example project:', error);
    }
}

function displayBackendProjects(projectsList) {
    const projectsListDiv = document.getElementById('backend-projects-list');
    if (!projectsListDiv) return;
    
    if (projectsList.length === 0) {
        projectsListDiv.innerHTML = '<p class="text-gray-400">No hay proyectos</p>';
        return;
    }
    
    projectsListDiv.innerHTML = projectsList.map(project => `
        <div class="border border-gray-500/50 p-3 rounded space-y-2" data-project-name="${project.name}" data-project-id="${project.id}">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <p class="text-yellow-300 font-bold text-lg" id="project-name-display-${project.name.replace(/\s+/g, '-')}">${project.name}</p>
                    <p class="text-sm text-gray-400">Cotizaciones: ${project.quoteCount || 0}</p>
                    <p class="text-xs text-gray-500">Creado: ${new Date(project.createdAt).toLocaleDateString()}</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button class="view-project-page-btn nav-link submit-btn px-3 py-1 rounded text-xs bg-yellow-500/20" data-project-id="${project.id}">
                        [ VER PÁGINA ]
                    </button>
                    <button class="edit-project-btn nav-link submit-btn px-3 py-1 rounded text-xs" data-project-name="${project.name}">
                        [ EDITAR ]
                    </button>
                    <button class="view-project-quotes-btn nav-link submit-btn px-3 py-1 rounded text-xs" data-project-name="${project.name}">
                        [ VER COTIZACIONES ]
                    </button>
                </div>
            </div>
            <div class="edit-project-form hidden mt-2" id="edit-form-${project.name.replace(/\s+/g, '-')}">
                <input type="text" class="form-input text-sm" value="${project.name}" id="edit-input-${project.name.replace(/\s+/g, '-')}">
                <div class="flex gap-2 mt-2">
                    <button class="save-project-btn nav-link submit-btn px-3 py-1 rounded text-xs" data-project-name="${project.name}">
                        [ GUARDAR ]
                    </button>
                    <button class="cancel-edit-btn nav-link submit-btn px-3 py-1 rounded text-xs" data-project-name="${project.name}">
                        [ CANCELAR ]
                    </button>
                </div>
            </div>
        </div>
    `).join('');
    
    // Add event listeners for edit buttons
    projectsListDiv.querySelectorAll('.edit-project-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectName = e.target.getAttribute('data-project-name');
            const editForm = document.getElementById(`edit-form-${projectName.replace(/\s+/g, '-')}`);
            if (editForm) {
                editForm.classList.remove('hidden');
            }
        });
    });
    
    // Add event listeners for cancel buttons
    projectsListDiv.querySelectorAll('.cancel-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectName = e.target.getAttribute('data-project-name');
            const editForm = document.getElementById(`edit-form-${projectName.replace(/\s+/g, '-')}`);
            if (editForm) {
                editForm.classList.add('hidden');
            }
        });
    });
    
    // Add event listeners for save buttons
    projectsListDiv.querySelectorAll('.save-project-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const oldProjectName = e.target.getAttribute('data-project-name');
            const newProjectName = document.getElementById(`edit-input-${oldProjectName.replace(/\s+/g, '-')}`).value.trim();
            
            if (!newProjectName) {
                alert('El nombre del proyecto no puede estar vacío');
                return;
            }
            
            if (newProjectName === oldProjectName) {
                const editForm = document.getElementById(`edit-form-${oldProjectName.replace(/\s+/g, '-')}`);
                if (editForm) editForm.classList.add('hidden');
                return;
            }
            
            await updateProjectName(oldProjectName, newProjectName);
        });
    });
    
    // Add event listeners for view quotes buttons
    projectsListDiv.querySelectorAll('.view-project-quotes-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const projectName = e.target.getAttribute('data-project-name');
            await showProjectQuotes(projectName);
        });
    });
    
    // Add event listeners for view project page buttons
    projectsListDiv.querySelectorAll('.view-project-page-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.target.getAttribute('data-project-id');
            window.open(`project.html?id=${projectId}`, '_blank');
        });
    });
}

async function updateProjectName(oldName, newName) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: newName, oldName: oldName })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            // Reload data to show updated project
            loadBackendData();
        } else {
            alert('Error al actualizar el nombre del proyecto: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error updating project name:', error);
        alert('Error al actualizar el nombre del proyecto');
    }
}

async function showProjectQuotes(projectName) {
    try {
        // Get project data
        const projectsResponse = await fetch(`${API_BASE_URL}/api/projects`);
        if (!projectsResponse.ok) throw new Error('Failed to fetch projects');
        const projectsData = await projectsResponse.json();
        const project = projectsData.projects.find(p => p.name === projectName);
        
        if (!project) {
            alert('Proyecto no encontrado');
            return;
        }
        
        const quotesResponse = await fetch(`${API_BASE_URL}/api/quotes`);
        if (!quotesResponse.ok) throw new Error('Failed to fetch quotes');
        
        const quotesData = await quotesResponse.json();
        const projectQuotes = (quotesData.quotes || []).filter(q => q['project-name'] === projectName);
        
        // Create a modal to show project quotes and upload deliverables
        const modal = document.createElement('div');
        modal.id = 'project-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" onclick="this.closest('.fixed').remove()"></div>
            <div class="content-box w-full max-w-4xl z-10 p-6 flex flex-col max-h-[90vh]">
                <div class="text-center mb-6">
                    <h2 class="text-3xl neon-shadow">++ ${projectName} ++</h2>
                    <p class="text-sm text-gray-300 mt-2">${projectQuotes.length} cotización(es) | ${(project.deliverables || []).length} entregable(s)</p>
                </div>
                
                <div class="flex-grow overflow-y-auto space-y-6 pr-2">
                    <!-- Upload Deliverable Section -->
                    <div class="border border-yellow-300/50 p-4 rounded">
                        <h3 class="text-xl text-yellow-300 mb-3">[ SUBIR ENTREGABLE ]</h3>
                        <div class="space-y-3">
                            <!-- Toggle between File and Link -->
                            <div class="flex gap-4 mb-3">
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="upload-type-${project.id}" value="file" checked class="mr-2" onchange="toggleUploadType('${project.id}', 'file')">
                                    <span class="text-sm">Subir Archivo</span>
                                </label>
                                <label class="flex items-center cursor-pointer">
                                    <input type="radio" name="upload-type-${project.id}" value="link" class="mr-2" onchange="toggleUploadType('${project.id}', 'link')">
                                    <span class="text-sm">Agregar Link</span>
                                </label>
                            </div>
                            
                            <div>
                                <label class="block text-sm mb-1">Título / Descripción</label>
                                <input type="text" id="deliverable-title-${project.id}" class="form-input text-sm" placeholder="Ej: Video Final v1">
                            </div>
                            
                            <!-- File Upload -->
                            <div id="file-upload-section-${project.id}">
                                <label class="block text-sm mb-1">Archivo</label>
                                <input type="file" id="deliverable-file-${project.id}" class="form-input text-sm">
                                <p class="text-xs text-gray-400 mt-1">Los archivos con el mismo nombre se versionarán automáticamente</p>
                            </div>
                            
                            <!-- Link URL (hidden by default) -->
                            <div id="link-upload-section-${project.id}" class="hidden">
                                <label class="block text-sm mb-1">URL</label>
                                <input type="url" id="deliverable-link-${project.id}" class="form-input text-sm" placeholder="https://wetransfer.com/... o Drive">
                            </div>
                            
                            <div>
                                <label class="block text-sm mb-1">Notas (opcional)</label>
                                <textarea id="deliverable-notes-${project.id}" class="form-textarea text-sm" rows="2" placeholder="Cambios en esta versión..."></textarea>
                            </div>
                            <button onclick="uploadDeliverable('${project.id}', '${projectName}')" class="nav-link submit-btn px-4 py-2 rounded text-sm w-full">
                                [ SUBIR ]
                            </button>
                        </div>
                    </div>
                    
                    <!-- Existing Deliverables -->
                    ${(project.deliverables && project.deliverables.length > 0) ? `
                        <div class="border border-gray-500/50 p-4 rounded">
                            <h3 class="text-xl text-gray-300 mb-3">[ ENTREGABLES ACTUALES ]</h3>
                            <div class="space-y-2">
                                ${project.deliverables.map((d, idx) => {
                                    const isAudio = d.type === 'file' && d.filename && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(d.filename);
                                    const isVideo = d.type === 'file' && d.filename && /\.(mp4|webm|mov|avi|mkv)$/i.test(d.filename);
                                    const fileUrl = d.url.startsWith('/') ? '${API_BASE_URL}' + d.url : d.url;
                                    
                                    return `
                                        <div class="border border-gray-600 p-3 rounded ${d.approved ? 'border-green-500/50 bg-green-900/10' : ''}">
                                            <div class="flex justify-between items-start">
                                                <div class="flex-1">
                                                    <div class="flex items-center gap-2">
                                                        <p class="text-yellow-300 font-bold">${d.title}</p>
                                                        ${d.approved ? '<span class="text-xs text-green-300 border border-green-300 px-2 py-0.5 rounded">✓ APROBADO</span>' : ''}
                                                    </div>
                                                    ${d.type === 'file' ? `<p class="text-xs text-gray-500">${d.originalName || d.filename || 'Archivo'} ${d.fileSize ? `(${(d.fileSize / 1024 / 1024).toFixed(2)} MB)` : ''}</p>` : '<p class="text-xs text-gray-500">Link externo</p>'}
                                                </div>
                                                <button onclick="deleteDeliverable('${project.id}', ${idx})" class="text-red-400 hover:text-red-300 text-xl ml-2">×</button>
                                            </div>
                                            
                                            ${isAudio ? `
                                                <div class="mt-2 mb-2">
                                                    <audio controls preload="auto" class="w-full" style="height: 40px;">
                                                        <source src="${fileUrl}" type="audio/mp4">
                                                        <source src="${fileUrl}" type="audio/mpeg">
                                                        <source src="${fileUrl}">
                                                    </audio>
                                                </div>
                                            ` : ''}
                                            
                                            ${isVideo ? `
                                                <div class="mt-2 mb-2">
                                                    <video controls preload="auto" playsinline class="w-full rounded" style="max-height: 300px;">
                                                        <source src="${fileUrl}" type="video/mp4">
                                                        <source src="${fileUrl}" type="video/webm">
                                                        <source src="${fileUrl}">
                                                    </video>
                                                </div>
                                            ` : ''}
                                            
                                            <a href="${fileUrl}" target="_blank" download class="text-xs text-blue-300 hover:underline break-all block mt-2">
                                                ${d.type === 'file' ? '[ DESCARGAR ]' : '[ ABRIR LINK ]'}
                                            </a>
                                            ${d.notes ? `<p class="text-xs text-gray-400 mt-2">${d.notes}</p>` : ''}
                                            ${d.addedAt ? `<p class="text-xs text-gray-500 mt-1">${new Date(d.addedAt).toLocaleDateString('es-MX')}</p>` : ''}
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- Quotes -->
                    ${projectQuotes.length > 0 ? `
                        <div class="border border-gray-500/50 p-4 rounded">
                            <h3 class="text-xl text-gray-300 mb-3">[ COTIZACIONES ]</h3>
                            <div class="space-y-3">
                                ${projectQuotes.map((quote, index) => `
                                    <div class="border border-gray-600 p-3 rounded">
                                        <p class="text-yellow-300 font-bold">Cotización #${projectQuotes.length - index}</p>
                                        <p class="text-sm text-gray-400 mt-1"><strong>Cliente:</strong> ${quote.name || 'N/A'}</p>
                                        <p class="text-sm text-gray-400"><strong>Email:</strong> ${quote.email || 'N/A'}</p>
                                        <p class="text-sm text-gray-400"><strong>Total:</strong> $${quote['cotizacion_estimada'] || 'N/A'} MXN</p>
                                        <p class="text-sm text-gray-400"><strong>Fecha de entrega:</strong> ${quote.timeline || 'N/A'}</p>
                                        <p class="text-sm text-gray-400"><strong>Enviado:</strong> ${new Date(quote.submittedAt).toLocaleString()}</p>
                                        ${quote.brief ? `<div class="mt-2 p-2 bg-gray-900/50 rounded"><p class="text-xs text-gray-300"><strong>Brief:</strong> ${quote.brief.substring(0, 200)}${quote.brief.length > 200 ? '...' : ''}</p></div>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : '<p class="text-gray-400">No hay cotizaciones aún</p>'}
                </div>
                
                <div class="mt-6 text-center">
                    <button onclick="this.closest('.fixed').remove()" class="nav-link submit-btn px-6 py-3 rounded-lg text-xl">
                        [ CERRAR ]
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    } catch (error) {
        console.error('Error loading project quotes:', error);
        alert('Error al cargar las cotizaciones del proyecto');
    }
}

// Toggle upload type
window.toggleUploadType = function(projectId, type) {
    const fileSection = document.getElementById(`file-upload-section-${projectId}`);
    const linkSection = document.getElementById(`link-upload-section-${projectId}`);
    
    if (type === 'file') {
        fileSection.classList.remove('hidden');
        linkSection.classList.add('hidden');
    } else {
        fileSection.classList.add('hidden');
        linkSection.classList.remove('hidden');
    }
}

// Upload deliverable function
window.uploadDeliverable = async function(projectId, projectName) {
    const title = document.getElementById(`deliverable-title-${projectId}`).value.trim();
    const notes = document.getElementById(`deliverable-notes-${projectId}`).value.trim();
    const uploadType = document.querySelector(`input[name="upload-type-${projectId}"]:checked`).value;
    
    console.log('Starting upload:', { projectId, title, uploadType });
    
    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('notes', notes);
        
        if (uploadType === 'file') {
            const fileInput = document.getElementById(`deliverable-file-${projectId}`);
            const file = fileInput.files[0];
            
            console.log('File input:', fileInput, 'File:', file);
            
            if (!file) {
                alert('Por favor selecciona un archivo');
                return;
            }
            
            if (!title) {
                alert('Por favor ingresa un título');
                return;
            }
            
            console.log('Uploading file:', file.name, 'Size:', file.size);
            
            formData.append('file', file);
            formData.append('isLink', 'false');
        } else {
            const linkUrl = document.getElementById(`deliverable-link-${projectId}`).value.trim();
            
            if (!title || !linkUrl) {
                alert('Por favor completa título y URL');
                return;
            }
            
            try {
                new URL(linkUrl);
            } catch (e) {
                alert('URL inválida');
                return;
            }
            
            formData.append('isLink', 'true');
            formData.append('linkUrl', linkUrl);
        }
        
        console.log('Sending upload request to:', `${API_BASE_URL}/api/projects/${projectId}/upload`);
        
        // Upload to backend
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/upload`, {
            method: 'POST',
            body: formData
        });
        
        console.log('Upload response status:', response.status);
        const result = await response.json();
        console.log('Upload result:', result);
        
        if (result.success) {
            // Close modal and reopen to show updated data
            document.getElementById('project-modal').remove();
            await showProjectQuotes(projectName);
        } else {
            alert('Error al subir entregable: ' + (result.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error uploading deliverable:', error);
        alert('Error al subir entregable: ' + error.message);
    }
}

// Delete deliverable function
window.deleteDeliverable = async function(projectId, index) {
    if (!confirm('¿Eliminar este entregable?')) return;
    
    try {
        // Get current project data
        const projectsResponse = await fetch(`${API_BASE_URL}/api/projects`);
        const projectsData = await projectsResponse.json();
        const project = projectsData.projects.find(p => p.id === projectId);
        
        if (!project) {
            alert('Proyecto no encontrado');
            return;
        }
        
        // Remove deliverable
        project.deliverables.splice(index, 1);
        
        // Update project
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                links: project.links || [],
                deliverables: project.deliverables
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Close modal and reopen to show updated data
            document.getElementById('project-modal').remove();
            await showProjectQuotes(project.name);
        } else {
            alert('Error al eliminar entregable: ' + (result.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error deleting deliverable:', error);
        alert('Error al eliminar entregable');
    }
}

function displayBackendQuotes(quotesList) {
    const quotesListDiv = document.getElementById('backend-quotes-list');
    if (!quotesListDiv) return;
    
    if (quotesList.length === 0) {
        quotesListDiv.innerHTML = '<p class="text-gray-400">No hay cotizaciones</p>';
        return;
    }
    
    // Show most recent 10 quotes
    const recentQuotes = quotesList.slice(-10).reverse();
    
    quotesListDiv.innerHTML = recentQuotes.map(quote => `
        <div class="border border-gray-500/50 p-3 rounded">
            <p class="text-yellow-300 font-bold">${quote['project-name'] || 'Sin nombre'}</p>
            <p class="text-sm text-gray-400">Cliente: ${quote.name || 'N/A'}</p>
            <p class="text-sm text-gray-400">Total: ${quote['cotizacion_estimada'] || 'N/A'}</p>
            <p class="text-xs text-gray-500">Enviado: ${new Date(quote.submittedAt).toLocaleString()}</p>
        </div>
    `).join('');
}

// Setup backend login button
function setupBackendLogin() {
    const backendLoginBtn = document.getElementById('backend-login-btn');
    const loginModal = document.getElementById('login-modal');
    const loginModalOverlay = document.getElementById('login-modal-overlay');
    const loginForm = document.getElementById('login-form');
    const loginCancelBtn = document.getElementById('login-cancel-btn');
    const backendLogoutBtn = document.getElementById('backend-logout-btn');
    const backendOverlay = document.getElementById('backend-overlay');
    
    if (backendLoginBtn) {
        console.log('Backend login button found, adding event listener');
        backendLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Backend button clicked');
            if (isAuthenticated) {
                showBackendDashboard();
            } else {
                showLoginModal();
            }
        });
    } else {
        console.error('Backend login button not found!');
    }
    
    if (loginModalOverlay) {
        loginModalOverlay.addEventListener('click', hideLoginModal);
    }
    
    if (loginCancelBtn) {
        loginCancelBtn.addEventListener('click', hideLoginModal);
    }
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (backendLogoutBtn) {
        backendLogoutBtn.addEventListener('click', logout);
    }
    
    if (backendOverlay) {
        backendOverlay.addEventListener('click', hideBackendDashboard);
    }
    
    // Setup add project button
    const addProjectBtn = document.getElementById('add-project-btn');
    const addProjectForm = document.getElementById('add-project-form');
    const saveNewProjectBtn = document.getElementById('save-new-project-btn');
    const cancelNewProjectBtn = document.getElementById('cancel-new-project-btn');
    const newProjectNameInput = document.getElementById('new-project-name');
    
    if (addProjectBtn && addProjectForm) {
        addProjectBtn.addEventListener('click', () => {
            addProjectForm.classList.remove('hidden');
            if (newProjectNameInput) newProjectNameInput.focus();
        });
    }
    
    if (cancelNewProjectBtn && addProjectForm) {
        cancelNewProjectBtn.addEventListener('click', () => {
            addProjectForm.classList.add('hidden');
            if (newProjectNameInput) newProjectNameInput.value = '';
        });
    }
    
    if (saveNewProjectBtn && newProjectNameInput) {
        saveNewProjectBtn.addEventListener('click', async () => {
            const projectName = newProjectNameInput.value.trim();
            if (!projectName) {
                alert('Por favor ingresa un nombre para el proyecto');
                return;
            }
            
            await createProject(projectName);
            if (addProjectForm) addProjectForm.classList.add('hidden');
            if (newProjectNameInput) newProjectNameInput.value = '';
        });
    }
    
    // If already authenticated, show backend button as active
    if (isAuthenticated && backendLoginBtn) {
        backendLoginBtn.textContent = '[ BACKEND ✓ ]';
    }
}

async function createProject(projectName) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ name: projectName })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
            // Reload projects
            loadBackendData();
        } else {
            alert('Error al crear el proyecto: ' + (data.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error('Error creating project:', error);
        alert('Error al crear el proyecto');
    }
}

// Setup Date Picker Modal
function setupDatePickerModal() {
    const datePickerConfirmBtn = document.getElementById('date-picker-confirm-btn');
    const datePickerCancelBtn = document.getElementById('date-picker-cancel-btn');
    const datePickerOverlay = document.getElementById('date-picker-overlay');
    
    if (datePickerConfirmBtn) {
        datePickerConfirmBtn.addEventListener('click', confirmDatePicker);
    }
    
    if (datePickerCancelBtn) {
        datePickerCancelBtn.addEventListener('click', hideDatePickerModal);
    }
    
    if (datePickerOverlay) {
        datePickerOverlay.addEventListener('click', hideDatePickerModal);
    }
}

// Initialize project selection when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupProjectSelection();
        loadProjects();
        setupBackendLogin();
        setupDatePickerModal();
    });
} else {
    setupProjectSelection();
    loadProjects();
    setupBackendLogin();
    setupDatePickerModal();
}

// Iniciar el fondo 3D
initThree();

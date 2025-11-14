import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Lógica de UI ---
let currentForm = null;
let currentFormData = null;

// --- Lógica del Modal ---
const modal = document.getElementById('quote-modal');
const modifyBtn = document.getElementById('modify-quote-btn');
const acceptBtn = document.getElementById('accept-quote-btn');
const modalOverlay = document.getElementById('modal-overlay');

function showModal() {
    modal.classList.remove('hidden');
}

function hideModal() { 
    modal.classList.add('hidden'); 
    const statusDiv = document.getElementById('modal-status');
    statusDiv.innerHTML = "";
    acceptBtn.disabled = false;
    acceptBtn.textContent = "[ ACEPTAR Y ENVIAR ]";
    modifyBtn.disabled = false;
}

modifyBtn.addEventListener('click', hideModal);
modalOverlay.addEventListener('click', hideModal);
acceptBtn.addEventListener('click', () => {
    if (currentFormData) {
        sendFormToSpree(currentFormData);
    }
});

// --- Lógica de Validación de Formulario Personalizada ---
function validateForm() {
    if (!currentForm) return false;

    let isValid = true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    currentForm.querySelectorAll('.form-error').forEach(el => el.classList.add('hidden'));
    currentForm.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));

    // 1. Validar Campos Básicos (Nombre, Email, Proyecto)
    const fieldsToValidate = ['name', 'email', 'project-name', 'timeline'];
    fieldsToValidate.forEach(id => {
        const input = document.getElementById(id);
        if (input.value.trim() === '') {
            isValid = false;
            document.getElementById(`${id}-error`).textContent = "Campo requerido.";
            document.getElementById(`${id}-error`).classList.remove('hidden');
            input.classList.add('invalid');
        } else if (id === 'email' && !emailRegex.test(input.value)) {
            isValid = false;
            document.getElementById(`${id}-error`).textContent = "Formato de email inválido.";
            document.getElementById(`${id}-error`).classList.remove('hidden');
            input.classList.add('invalid');
        }
    });

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

// --- Lógica de Envío de Formulario ---
function handleGenerateQuote(event) {
    event.preventDefault();
    
    if (!validateForm()) {
        const firstError = currentForm.querySelector('.invalid');
        if(firstError) firstError.focus();
        return;
    }

    document.getElementById('form-replyto').value = document.getElementById('email').value;
    document.getElementById('form-subject').value = document.getElementById('project-name').value || 'Nueva Cotización FUKURO';

    currentFormData = new FormData(currentForm);
    
    const summaryDiv = document.getElementById('quote-summary');
    const isAudio = document.getElementById('service-audio').checked;
    const isVideo = document.getElementById('service-video').checked;
    const baseFee = parseFloat(currentFormData.get('calculated_base_fee')) || 0;
    const audioFee = parseFloat(currentFormData.get('calculated_audio_fee')) || 0;
    const videoFee = parseFloat(currentFormData.get('calculated_video_fee')) || 0;
    const isExistingProject = currentFormData.get('existing-project');
    
    let servicesSelected = [];
    if (isAudio) servicesSelected.push("Audio");
    if (isVideo) servicesSelected.push("Video");

    let summaryHTML = `
        <p><strong class="text-gray-300">CLIENTE:</strong> ${currentFormData.get('name') || 'N/A'}</p>
        <p><strong class="text-gray-300">EMAIL:</strong> ${currentFormData.get('email') || 'N/A'}</p>
        <p><strong class="text-gray-300">PROYECTO:</strong> ${currentFormData.get('project-name') || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">SERVICIOS:</strong> ${servicesSelected.join(' + ') || 'N/A'}</p>
    `;

    if (isAudio) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${currentFormData.get('audio_quantity')}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${currentFormData.get('audio_min')}m ${currentFormData.get('audio_sec')}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${currentFormData.get('format_av_audio') || 'N/A'} | ${currentFormData.get('resolution_av_audio') || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Audio:</strong> $${audioFee.toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (isVideo) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${currentFormData.get('video_quantity')}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${currentFormData.get('video_min')}m ${currentFormData.get('video_sec')}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${currentFormData.get('format_av_video') || 'N/A'} | ${currentFormData.get('resolution_av_video') || 'N/A'}</p>
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

    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${currentFormData.get('timeline') || 'N/A'}</p>`;
    
    const urgencyFeeNote = document.getElementById('urgency-fee-note');
    let urgencyNoteText = "";
    if (urgencyFeeNote && !urgencyFeeNote.classList.contains('hidden')) {
        urgencyNoteText = urgencyFeeNote.textContent; // Guardar el texto
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> ${urgencyNoteText.split(': ')[1]}</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: ${currentFormData.get('cotizacion_estimada')}</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${currentFormData.get('brief') || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;
    
    summaryDiv.innerHTML = summaryHTML;

    // *** NUEVA LÓGICA: Guardar datos en sessionStorage para la redirección ***
    const quoteDataForRedirect = {
        name: currentFormData.get('name'),
        email: currentFormData.get('email'),
        projectName: currentFormData.get('project-name'),
        timeline: currentFormData.get('timeline'),
        brief: currentFormData.get('brief'),
        total: currentFormData.get('cotizacion_estimada'),
        isExisting: isExistingProject,
        baseFee: baseFee,
        urgencyNote: urgencyNoteText,
        isAudio: isAudio,
        audioQty: currentFormData.get('audio_quantity'),
        audioMin: currentFormData.get('audio_min'),
        audioSec: currentFormData.get('audio_sec'),
        audioFormat: currentFormData.get('format_av_audio'),
        audioRes: currentFormData.get('resolution_av_audio'),
        audioFee: audioFee,
        isVideo: isVideo,
        videoQty: currentFormData.get('video_quantity'),
        videoMin: currentFormData.get('video_min'),
        videoSec: currentFormData.get('video_sec'),
        videoFormat: currentFormData.get('format_av_video'),
        videoRes: currentFormData.get('resolution_av_video'),
        videoFee: videoFee
    };
    try {
        sessionStorage.setItem('fukuroQuote', JSON.stringify(quoteDataForRedirect));
    } catch (e) {
        console.error("Error al guardar en sessionStorage:", e);
        // No detener el envío del formulario, solo fallará la redirección
    }
    // *** FIN DE LA NUEVA LÓGICA ***

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

// --- Iniciar todo ---
// Enlazar el formulario y la calculadora al cargar la página
currentForm = document.getElementById('quote-form');
if (currentForm) {
    currentForm.addEventListener('submit', handleGenerateQuote);
    setupQuoteCalculator(); 
}
// Iniciar el fondo 3D
initThree();

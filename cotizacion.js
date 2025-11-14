import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

document.addEventListener('DOMContentLoaded', () => {
    
    // Iniciar el fondo 3D (copiado de main.js)
    initThree();

    const receiptContent = document.getElementById('receipt-content');
    let quoteData = null;

    try {
        const quoteJSON = sessionStorage.getItem('fukuroQuote');
        if (!quoteJSON) {
            throw new Error("No se encontraron datos de cotización.");
        }
        quoteData = JSON.parse(quoteJSON);
    } catch (error) {
        receiptContent.innerHTML = `<p class="text-center text-red-500">-- ERROR --<br>${error.message}<br>No hay datos para mostrar. Por favor, vuelve a generar la cotización.</p>`;
        return;
    }

    // Si llegamos aquí, tenemos datos. Vamos a construir el HTML.
    
    let servicesSelected = [];
    if (quoteData.isAudio) servicesSelected.push("Audio");
    if (quoteData.isVideo) servicesSelected.push("Video");

    let summaryHTML = `
        <p><strong class="text-gray-300">CLIENTE:</strong> ${quoteData.name || 'N/A'}</p>
        <p><strong class="text-gray-300">EMAIL:</strong> ${quoteData.email || 'N/A'}</p>
        <p><strong class="text-gray-300">PROYECTO:</strong> ${quoteData.projectName || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">SERVICIOS:</strong> ${servicesSelected.join(' + ') || 'N/A'}</p>
    `;

    if (quoteData.isAudio) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Audio]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${quoteData.audioQty}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${quoteData.audioMin}m ${quoteData.audioSec}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${quoteData.audioFormat || 'N/A'} | ${quoteData.audioRes || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Audio:</strong> $${parseFloat(quoteData.audioFee).toFixed(2)} MXN</p>
            </div>
        `;
    }

    if (quoteData.isVideo) {
        summaryHTML += `
            <div class="border border-dashed border-gray-500/50 p-2 rounded mt-2">
                <p class="text-yellow-300 font-bold">[Detalles de Video]</p>
                <p><strong class="text-gray-300">Cantidad:</strong> ${quoteData.videoQty}</p>
                <p><strong class="text-gray-300">Duración (c/u):</strong> ${quoteData.videoMin}m ${quoteData.videoSec}s</p>
                <p><strong class="text-gray-300">Specs:</strong> ${quoteData.videoFormat || 'N/A'} | ${quoteData.videoRes || 'N/A'}</p>
                <p><strong class="text-gray-300">Subtotal Video:</strong> $${parseFloat(quoteData.videoFee).toFixed(2)} MXN</p>
            </div>
        `;
    }

    summaryHTML += `<hr class="border-gray-500/50 my-2">`;
    
    if (quoteData.isExisting) {
         summaryHTML += `<p><strong class="text-yellow-300">TARIFA BASE (Proyecto):</strong> $0.00 MXN (Proyecto existente)</p>`;
    } else if (quoteData.isAudio || quoteData.isVideo) {
         summaryHTML += `<p><strong class="text-gray-300">TARIFA BASE (Proyecto):</strong> $${parseFloat(quoteData.baseFee).toFixed(2)} MXN</p>`;
         summaryHTML += `<p class="text-sm text-yellow-300/80">> (La Tarifa Base es por proyecto. Se omitirá en futuros añadidos a este proyecto.)</p>`;
    }

    summaryHTML += `<p><strong class="text-gray-300">FECHA DE ENTREGA:</strong> ${quoteData.timeline || 'N/A'}</p>`;
    
    if (quoteData.urgencyNote && !quoteData.urgencyNote.includes('hidden')) {
        summaryHTML += `<p><strong class="text-red-500">TARIFA DE URGENCIA:</strong> ${quoteData.urgencyNote.split(': ')[1]}</p>`;
    }

    summaryHTML += `
        <p class="text-yellow-300 text-xl mt-4">COTIZACIÓN TOTAL: ${quoteData.total}</p>
        <p class="text-sm text-yellow-300/80 font-bold">> Cotización aproximada. Se ajustará de acuerdo a la duración final y revisiones adicionales.</p>
        
        <hr class="border-gray-500/50 my-2">
        <p><strong class="text-gray-300">BRIEF:</strong></p>
        <p class="whitespace-pre-wrap">${quoteData.brief || 'N/A'}</p>
        <hr class="border-gray-500/50 my-2">
        <p class="text-sm text-yellow-300/80">Se incluyen 3 rondas de revisión. Revisiones adicionales se cotizarán por separado.</p>
        <p class="text-sm text-yellow-300/80 font-bold">El pago total se realiza contra-entrega de los archivos finales.</p>
    `;

    // Inyectar el HTML final
    receiptContent.innerHTML = summaryHTML;

    // Limpiar el sessionStorage para que el recibo no se pueda recargar
    sessionStorage.removeItem('fukuroQuote');
});


// --- Lógica de Three.js (Copiada para el fondo) ---
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

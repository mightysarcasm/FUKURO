import * as THREE from 'three';

// API Configuration
const API_BASE_URL = 'http://localhost:3000';

// Get project ID from URL
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('id');

let currentProject = null;
let currentTab = 'pending'; // Default tab
let currentOpenFile = null; // Track which file is currently open

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    if (!projectId) {
        alert('No se especificó un proyecto');
        window.location.href = 'index.html';
        return;
    }

    await loadProject();
    setupEventListeners();
    initThreeJS();
});

// Load project data
async function loadProject() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`);
        const result = await response.json();
        
        if (result.success) {
            currentProject = result.projects.find(p => p.id === projectId);
            
            if (!currentProject) {
                alert('Proyecto no encontrado');
                window.location.href = 'index.html';
                return;
            }

            displayProjectInfo();
            await loadQuotes();
            loadLinks();
            loadWork();
        }
    } catch (error) {
        console.error('Error loading project:', error);
    }
}

// Display project information
function displayProjectInfo() {
    document.getElementById('project-title').textContent = `++ ${currentProject.name.toUpperCase()} ++`;
    document.getElementById('quote-count').textContent = currentProject.quoteCount || 0;
    
    const createdDate = new Date(currentProject.createdAt || Date.now());
    document.getElementById('created-date').textContent = createdDate.toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Load quotes for this project
async function loadQuotes() {
    try {
        console.log('Loading quotes for project:', currentProject.name);
        
        // Use the same approach as backend dashboard - get all quotes and filter
        const response = await fetch(`${API_BASE_URL}/api/quotes`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('All quotes:', result);
        
        if (result.success) {
            // Filter quotes for this project by name
            const projectQuotes = (result.quotes || []).filter(q => 
                q['project-name'] && q['project-name'].toLowerCase() === currentProject.name.toLowerCase()
            );
            console.log('Filtered quotes for project:', projectQuotes);
            displayQuotes(projectQuotes);
        } else {
            console.error('Failed to load quotes:', result.error);
            document.getElementById('quotes-list').innerHTML = `<p class="text-red-500">Error: ${result.error}</p>`;
        }
    } catch (error) {
        console.error('Error loading quotes:', error);
        document.getElementById('quotes-list').innerHTML = `<p class="text-red-500">Error al cargar cotizaciones: ${error.message}</p>`;
    }
}

// Display quotes
function displayQuotes(quotes) {
    const quotesList = document.getElementById('quotes-list');
    
    console.log('Displaying quotes:', quotes);
    
    if (!quotes || quotes.length === 0) {
        quotesList.innerHTML = '<p class="text-gray-400">No hay cotizaciones para este proyecto</p>';
        return;
    }

    quotesList.innerHTML = quotes.map((quote, index) => {
        const date = new Date(quote.submittedAt || quote.timestamp || Date.now());
        const dateStr = date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        return `
            <div class="border border-gray-600 rounded p-3 file-item">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-yellow-300 font-bold">Cotización #${quotes.length - index}</h4>
                    <span class="text-sm text-gray-400">${dateStr}</span>
                </div>
                <div class="text-sm space-y-1">
                    ${quote['name'] ? `<p><strong>Cliente:</strong> ${quote['name']}</p>` : ''}
                    ${quote['email'] ? `<p><strong>Email:</strong> ${quote['email']}</p>` : ''}
                    <p><strong>Servicios:</strong> ${quote['service_type'] || 'N/A'}</p>
                    <p><strong>Fecha de Entrega:</strong> ${quote['timeline'] ? new Date(quote['timeline']).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}</p>
                    <p class="text-yellow-300 font-bold text-lg mt-2"><strong>Total:</strong> $${quote['cotizacion_estimada'] || '0'} MXN</p>
                    ${quote['brief'] ? `<div class="mt-3 p-2 bg-gray-900/50 rounded"><p class="text-gray-300"><strong>Brief:</strong><br>${quote['brief']}</p></div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Load links/references
function loadLinks() {
    if (!currentProject.links || currentProject.links.length === 0) {
        document.getElementById('links-list').innerHTML = '<p class="text-gray-400 text-sm">No hay links guardados</p>';
        return;
    }

    displayLinks();
}

// Display links
function displayLinks() {
    const linksList = document.getElementById('links-list');
    linksList.innerHTML = currentProject.links.map((link, index) => `
        <div class="border border-gray-600 rounded p-3 file-item flex justify-between items-center">
            <div class="flex-1">
                <p class="text-yellow-300 font-bold">${link.title}</p>
                <a href="${link.url}" target="_blank" class="text-sm text-blue-300 hover:underline break-all">${link.url}</a>
                ${link.addedAt ? `<p class="text-xs text-gray-500 mt-1">${new Date(link.addedAt).toLocaleDateString('es-MX')}</p>` : ''}
            </div>
            <button onclick="deleteLink(${index})" class="ml-4 text-red-400 hover:text-red-300 text-xl">×</button>
        </div>
    `).join('');
}

// Load work/deliverables
function loadWork() {
    if (!currentProject.deliverables || currentProject.deliverables.length === 0) {
        document.getElementById('work-list').innerHTML = '<p class="text-gray-400 text-sm">No hay entregables aún</p>';
        return;
    }

    displayWork();
}

// Display work
function displayWork() {
    const workList = document.getElementById('work-list');
    
    // If a file is currently open, show detailed view
    if (currentOpenFile !== null) {
        displayFileDetails(currentOpenFile);
        return;
    }
    
    // Filter deliverables based on current tab
    let filteredDeliverables = currentProject.deliverables;
    if (currentTab === 'pending') {
        filteredDeliverables = currentProject.deliverables.filter(d => !d.approved);
    } else if (currentTab === 'approved') {
        filteredDeliverables = currentProject.deliverables.filter(d => d.approved);
    }
    
    if (filteredDeliverables.length === 0) {
        workList.innerHTML = '<p class="text-gray-400 text-sm">No hay archivos en esta categoría</p>';
        return;
    }
    
    // Show list view - just titles and descriptions
    workList.innerHTML = filteredDeliverables.map((work) => {
        const index = currentProject.deliverables.indexOf(work);
        const isFile = work.type === 'file';
        
        // Detect file type icon
        let fileIcon = '📄';
        if (isFile && work.filename) {
            if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(work.filename)) fileIcon = '🎵';
            else if (/\.(mp4|webm|mov|avi|mkv)$/i.test(work.filename)) fileIcon = '🎬';
            else if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(work.filename)) fileIcon = '🖼️';
        } else if (work.type === 'link') {
            // Check if it's a video link (Drive, YouTube, or Dropbox)
            const isVideoLink = work.url && (
                work.url.includes('drive.google.com/file/d/') || 
                work.url.includes('youtube.com') || 
                work.url.includes('youtu.be') ||
                (work.url.includes('dropbox.com') && /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(work.url))
            );
            fileIcon = isVideoLink ? '🎬' : '🔗';
        }
        
        return `
            <div class="border border-gray-600 rounded p-4 file-item cursor-pointer hover:border-yellow-300 transition-colors" onclick="openFile(${index})">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-3 mb-2">
                            <span class="text-2xl">${fileIcon}</span>
                            <div>
                                <p class="text-yellow-300 font-bold">${work.title}</p>
                                ${work.approved ? '<span class="text-xs text-green-300 border border-green-300 px-2 py-0.5 rounded mt-1 inline-block">✓ APROBADO</span>' : '<span class="text-xs text-gray-400 border border-gray-600 px-2 py-0.5 rounded mt-1 inline-block">POR APROBAR</span>'}
                            </div>
                        </div>
                        ${work.notes ? `<p class="text-sm text-gray-400 ml-11">${work.notes}</p>` : ''}
                        ${isFile && work.fileSize ? `<p class="text-xs text-gray-500 ml-11 mt-1">${(work.fileSize / 1024 / 1024).toFixed(2)} MB</p>` : ''}
                        ${work.comments && work.comments.length > 0 ? `<p class="text-xs text-blue-300 ml-11 mt-1">💬 ${work.comments.length} comentario${work.comments.length > 1 ? 's' : ''}</p>` : ''}
                    </div>
                    <span class="text-gray-400 text-xl">›</span>
                </div>
            </div>
        `;
    }).join('');
}

// Display detailed file view
function displayFileDetails(index) {
    const workList = document.getElementById('work-list');
    const work = currentProject.deliverables[index];
    const isFile = work.type === 'file';
    let fileUrl = work.url.startsWith('/') ? `${API_BASE_URL}${work.url}` : work.url;
    
    // Detect audio and video files
    const isAudio = isFile && work.filename && /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(work.filename);
    let isVideo = isFile && work.filename && /\.(mp4|webm|mov|avi|mkv)$/i.test(work.filename);
    const isImage = isFile && work.filename && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(work.filename);
    
    // Check if it's a Google Drive video link
    let isDriveVideo = false;
    let driveVideoId = null;
    
    // Check if it's a YouTube video link
    let isYouTubeVideo = false;
    let youtubeVideoId = null;
    
    // Check if it's a Dropbox video link
    let isDropboxVideo = false;
    let dropboxUrl = null;
    
    if (work.type === 'link' && work.url) {
        // Match Google Drive video URLs
        const driveMatch = work.url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            isDriveVideo = true;
            driveVideoId = driveMatch[1];
            isVideo = true; // Treat Drive videos as videos
        }
        
        // Match YouTube URLs (youtube.com/watch?v=, youtu.be/, youtube.com/embed/)
        const youtubeMatch = work.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
        if (youtubeMatch) {
            isYouTubeVideo = true;
            youtubeVideoId = youtubeMatch[1];
            isVideo = true; // Treat YouTube videos as videos
        }
        
        // Match Dropbox URLs (dropbox.com or dl.dropboxusercontent.com)
        // Convert share link to direct link for video playback
        if (work.url.includes('dropbox.com')) {
            const isVideoFile = /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(work.url);
            if (isVideoFile || work.url.includes('/s/')) {
                isDropboxVideo = true;
                
                // Multiple conversion methods for different Dropbox URL formats
                dropboxUrl = work.url;
                
                // Method 1: Standard share link (www.dropbox.com/s/...)
                if (dropboxUrl.includes('www.dropbox.com/s/')) {
                    dropboxUrl = dropboxUrl.replace('www.dropbox.com/s/', 'dl.dropboxusercontent.com/s/');
                }
                
                // Method 2: Alternative share format (dropbox.com/s/...)
                if (dropboxUrl.includes('dropbox.com/s/') && !dropboxUrl.includes('dl.dropbox')) {
                    dropboxUrl = dropboxUrl.replace('dropbox.com/s/', 'dl.dropboxusercontent.com/s/');
                }
                
                // Method 3: Scl links (dropbox.com/scl/...)
                if (dropboxUrl.includes('/scl/')) {
                    // Extract rlkey parameter for scl links
                    const urlObj = new URL(dropboxUrl);
                    const rlkey = urlObj.searchParams.get('rlkey');
                    dropboxUrl = dropboxUrl.replace(/\?.*/, '');
                    dropboxUrl = dropboxUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                    dropboxUrl += '?rlkey=' + rlkey + '&raw=1';
                } else {
                    // Standard conversion: change dl parameter
                    dropboxUrl = dropboxUrl.replace('dl=0', 'raw=1');
                    dropboxUrl = dropboxUrl.replace('dl=1', 'raw=1');
                    
                    // If no raw parameter, add it
                    if (!dropboxUrl.includes('raw=')) {
                        dropboxUrl += (dropboxUrl.includes('?') ? '&' : '?') + 'raw=1';
                    }
                }
                
                console.log('Dropbox URL conversion:', work.url, '→', dropboxUrl);
                isVideo = true;
            }
        }
    }
    
    workList.innerHTML = `
        <!-- Back Button -->
        <button onclick="closeFile()" class="mb-4 px-4 py-2 border border-gray-600 text-gray-300 hover:border-yellow-300 hover:text-yellow-300 rounded flex items-center gap-2">
            <span>‹</span> VOLVER A LA LISTA
        </button>
        
        <div class="border border-yellow-300/50 rounded p-4 bg-gray-900/30">
                <p class="text-yellow-300 font-bold mb-1">${work.title}</p>
                ${isFile ? `<p class="text-xs text-gray-500 mb-2">${work.originalName || work.filename || 'Archivo'} ${work.fileSize ? `(${(work.fileSize / 1024 / 1024).toFixed(2)} MB)` : ''}</p>` : ''}
                
                ${isAudio ? `
                    <div class="my-3" id="audio-container-${index}">
                        <audio controls preload="auto" class="w-full" id="audio-${index}">
                            <source src="${fileUrl}" type="audio/mp4">
                            <source src="${fileUrl}" type="audio/mpeg">
                            <source src="${fileUrl}">
                        </audio>
                        
                        <!-- Comment Form -->
                        <div class="mt-3 p-3 border border-gray-600 rounded">
                            <div class="flex gap-2 mb-2">
                                <button onclick="addTimestamp(${index}, 'audio')" class="nav-link submit-btn px-3 py-1 rounded text-xs bg-yellow-500/20">
                                    [ TIMESTAMP ACTUAL ]
                                </button>
                                <input type="text" id="timestamp-${index}" class="form-input text-xs flex-1" placeholder="00:00" readonly>
                            </div>
                            <textarea id="comment-${index}" class="form-textarea text-sm w-full" rows="2" placeholder="Escribe tu comentario..."></textarea>
                            <button onclick="saveComment(${index}, '${work.title}', 'audio')" class="nav-link submit-btn px-3 py-1 rounded text-xs mt-2 w-full">
                                [ GUARDAR COMENTARIO ]
                            </button>
                        </div>
                        
                        <!-- Comments List -->
                        ${(work.comments && work.comments.length > 0) ? `
                            <div class="mt-3">
                                <div class="flex justify-between items-center mb-2 cursor-pointer p-2 bg-gray-800/50 rounded" onclick="toggleComments(${index})">
                                    <p class="text-xs text-gray-300">COMENTARIOS (${work.comments.length})</p>
                                    <span id="comments-toggle-${index}" class="text-yellow-300">−</span>
                                </div>
                                <div id="comments-${index}" class="space-y-2">
                                    ${work.comments.map((c, cidx) => `
                                        <div class="p-2 bg-gray-900/50 border border-gray-700 rounded text-sm">
                                            <div class="flex justify-between items-start">
                                                <button onclick="seekTo(${index}, ${c.timestamp}, 'audio')" class="text-yellow-300 hover:text-yellow-200 font-mono text-xs">
                                                    [${formatTimestamp(c.timestamp)}]
                                                </button>
                                                <button onclick="deleteComment(${index}, ${cidx}, '${work.title}')" class="text-red-400 hover:text-red-300">×</button>
                                            </div>
                                            <p class="text-gray-300 mt-1">${c.comment}</p>
                                            <p class="text-xs text-gray-500 mt-1">${new Date(c.addedAt).toLocaleString('es-MX')}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Approve Button -->
                        <div class="mt-3">
                            <button onclick="toggleApproval(${index}, '${work.title}')" class="nav-link submit-btn px-4 py-2 rounded text-sm w-full ${work.approved ? 'bg-green-500/30 border-green-300 text-green-300' : 'bg-gray-500/20'}">
                                ${work.approved ? '✓ APROBADO' : '[ APROBAR ]'}
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                ${isVideo ? `
                    <div class="my-3" id="video-container-${index}">
                        ${isDropboxVideo ? `
                            <video 
                                id="video-${index}"
                                playsinline
                                data-plyr-config='{ "controls": ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"] }'
                            >
                                <source src="${dropboxUrl}" type="video/mp4">
                            </video>
                            <script>
                                (function() {
                                    console.log('Initializing Plyr for Dropbox video ${index}');
                                    setTimeout(function() {
                                        const player = new Plyr('#video-${index}', {
                                            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
                                            autoplay: false,
                                            clickToPlay: true,
                                            loadSprite: true,
                                            keyboard: { focused: true, global: true }
                                        });
                                        
                                        player.on('ready', () => {
                                            console.log('Plyr ready for video ${index}');
                                        });
                                        
                                        player.on('loadedmetadata', () => {
                                            console.log('Dropbox video loaded:', player.duration, 'seconds');
                                        });
                                        
                                        player.on('error', (event) => {
                                            console.error('Plyr error:', event);
                                            handleDropboxError(${index}, '${dropboxUrl.replace(/'/g, "\\'")}', '${work.url.replace(/'/g, "\\'")}');
                                        });
                                        
                                        // Store player globally for timestamp capture
                                        window['plyr_video_${index}'] = player;
                                    }, 500);
                                })();
                            </script>
                            <div class="mt-2 p-3 bg-blue-500/20 border border-blue-300/30 rounded">
                                <p class="text-xs text-blue-300 mb-1">📦 <strong>Video de Dropbox</strong></p>
                                <p class="text-xs text-gray-300">Timestamps automáticos disponibles - usa el botón "TIMESTAMP ACTUAL"</p>
                                <details class="mt-2 text-xs">
                                    <summary class="text-gray-500 cursor-pointer hover:text-gray-400">Debug info</summary>
                                    <p class="text-gray-500 mt-1 break-all">Original: ${work.url}</p>
                                    <p class="text-gray-500 mt-1 break-all">Converted: ${dropboxUrl}</p>
                                </details>
                            </div>
                        ` : isYouTubeVideo ? `
                            <iframe 
                                id="video-${index}"
                                src="https://www.youtube.com/embed/${youtubeVideoId}?enablejsapi=1" 
                                class="w-full bg-black rounded" 
                                style="height: 500px; border: none;"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowfullscreen
                            ></iframe>
                            <div class="mt-2 p-3 bg-red-900/20 border border-red-300/30 rounded">
                                <p class="text-xs text-red-300 mb-1">📺 <strong>Video de YouTube</strong></p>
                                <p class="text-xs text-gray-300">Timestamps automáticos disponibles - usa el botón "TIMESTAMP ACTUAL"</p>
                            </div>
                        ` : isDriveVideo ? `
                            <iframe 
                                id="drive-video-${index}"
                                src="https://drive.google.com/file/d/${driveVideoId}/preview" 
                                class="w-full bg-black rounded" 
                                style="height: 500px; border: none;"
                                allow="autoplay"
                            ></iframe>
                            <div class="mt-2 p-3 bg-blue-900/20 border border-blue-300/30 rounded">
                                <p class="text-xs text-blue-300 mb-2">📹 <strong>Video de Google Drive</strong></p>
                                <p class="text-xs text-gray-300">Para agregar timestamps: Pausa el video en el momento deseado, mira el tiempo en el reproductor de Drive, e ingrésalo manualmente abajo.</p>
                            </div>
                        ` : `
                            <video 
                                id="video-${index}"
                                playsinline
                                data-plyr-config='{ "controls": ["play-large", "play", "progress", "current-time", "mute", "volume", "fullscreen"] }'
                            >
                                <source src="${fileUrl}" type="video/mp4">
                            </video>
                            <script>
                                (function() {
                                    console.log('Initializing Plyr for uploaded video ${index}');
                                    console.log('Video URL:', '${fileUrl}');
                                    setTimeout(function() {
                                        const player = new Plyr('#video-${index}', {
                                            controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
                                            autoplay: false,
                                            clickToPlay: true,
                                            loadSprite: true,
                                            keyboard: { focused: true, global: true }
                                        });
                                        
                                        player.on('ready', () => {
                                            console.log('Plyr ready for video ${index}');
                                        });
                                        
                                        player.on('loadedmetadata', () => {
                                            console.log('Video loaded:', player.duration, 'seconds');
                                            const videoEl = player.elements.container.querySelector('video');
                                            if (videoEl) {
                                                console.log('Video dimensions:', videoEl.videoWidth, 'x', videoEl.videoHeight);
                                            }
                                        });
                                        
                                        player.on('error', (event) => {
                                            console.error('Plyr error:', event);
                                            handleVideoError(${index}, '${fileUrl}');
                                        });
                                        
                                        // Store player globally for timestamp capture
                                        window['plyr_video_${index}'] = player;
                                    }, 500);
                                })();
                            </script>
                        `}
                        
                        <!-- Comment Form -->
                        <div class="mt-3 p-3 border border-gray-600 rounded">
                            ${isDriveVideo ? `
                                <div class="mb-3">
                                    <label class="block text-xs text-gray-300 mb-1">Timestamp (MM:SS o M:SS)</label>
                                    <input 
                                        type="text" 
                                        id="timestamp-${index}" 
                                        class="form-input text-sm w-full" 
                                        placeholder="Ej: 1:30, 0:45, 12:05"
                                        onkeyup="validateTimeFormat(this)"
                                    >
                                    <p class="text-xs text-gray-400 mt-1">Ingresa el tiempo que ves en el reproductor de Drive</p>
                                </div>
                            ` : `
                                <div class="flex gap-2 mb-2">
                                    <button onclick="addTimestamp(${index}, 'video', ${isYouTubeVideo})" class="nav-link submit-btn px-3 py-1 rounded text-xs bg-yellow-500/20">
                                        [ TIMESTAMP ACTUAL ]
                                    </button>
                                    <input 
                                        type="text" 
                                        id="timestamp-${index}" 
                                        class="form-input text-xs flex-1" 
                                        placeholder="00:00" 
                                        readonly
                                    >
                                </div>
                                ${isDropboxVideo ? '<p class="text-xs text-gray-400 mb-2">Timestamps automáticos desde Dropbox</p>' : ''}
                            `}
                            <textarea id="comment-${index}" class="form-textarea text-sm w-full" rows="2" placeholder="Escribe tu comentario..."></textarea>
                            <button onclick="saveComment(${index}, '${work.title}', 'video')" class="nav-link submit-btn px-3 py-1 rounded text-xs mt-2 w-full">
                                [ GUARDAR COMENTARIO ]
                            </button>
                        </div>
                        
                        <!-- Comments List -->
                        ${(work.comments && work.comments.length > 0) ? `
                            <div class="mt-3">
                                <div class="flex justify-between items-center mb-2 cursor-pointer p-2 bg-gray-800/50 rounded" onclick="toggleComments(${index})">
                                    <p class="text-xs text-gray-300">COMENTARIOS (${work.comments.length})</p>
                                    <span id="comments-toggle-${index}" class="text-yellow-300">−</span>
                                </div>
                                <div id="comments-${index}" class="space-y-2">
                                    ${work.comments.map((c, cidx) => `
                                        <div class="p-2 bg-gray-900/50 border border-gray-700 rounded text-sm">
                                            <div class="flex justify-between items-start">
                                                <button onclick="seekTo(${index}, ${c.timestamp}, 'video')" class="text-yellow-300 hover:text-yellow-200 font-mono text-xs">
                                                    [${formatTimestamp(c.timestamp)}]
                                                </button>
                                                <button onclick="deleteComment(${index}, ${cidx}, '${work.title}')" class="text-red-400 hover:text-red-300">×</button>
                                            </div>
                                            <p class="text-gray-300 mt-1">${c.comment}</p>
                                            <p class="text-xs text-gray-500 mt-1">${new Date(c.addedAt).toLocaleString('es-MX')}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                        
                        <!-- Approve Button -->
                        <div class="mt-3">
                            <button onclick="toggleApproval(${index}, '${work.title}')" class="nav-link submit-btn px-4 py-2 rounded text-sm w-full ${work.approved ? 'bg-green-500/30 border-green-300 text-green-300' : 'bg-gray-500/20'}">
                                ${work.approved ? '✓ APROBADO' : '[ APROBAR ]'}
                            </button>
                        </div>
                    </div>
                ` : ''}
                
                ${isImage ? `
                    <div class="my-3 p-3 bg-black/30 rounded border border-yellow-300/30">
                        <p class="text-xs text-yellow-300 mb-2">🖼️ VISTA PREVIA</p>
                        <img src="${fileUrl}" alt="${work.title}" class="w-full rounded" style="max-height: 400px; object-fit: contain;">
                    </div>
                ` : ''}
                
                <a href="${fileUrl}" ${isFile ? 'download' : 'target="_blank"'} class="inline-block px-4 py-2 border border-blue-300 text-blue-300 hover:bg-blue-300 hover:text-black rounded text-sm mb-2">
                    ${isFile ? '[ DESCARGAR ARCHIVO ]' : '[ ABRIR LINK ]'}
                </a>
                ${work.notes ? `<p class="text-sm text-gray-400 mt-2 p-2 bg-gray-900/50 rounded">${work.notes}</p>` : ''}
                ${work.addedAt ? `<p class="text-xs text-gray-500 mt-2">${new Date(work.addedAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>` : ''}
                
                ${!isAudio && !isVideo ? `
                    <!-- Approve Button for non-media files -->
                    <div class="mt-3">
                        <button onclick="toggleApproval(${index}, '${work.title}')" class="nav-link submit-btn px-4 py-2 rounded text-sm w-full ${work.approved ? 'bg-green-500/30 border-green-300 text-green-300' : 'bg-gray-500/20'}">
                            ${work.approved ? '✓ APROBADO' : '[ APROBAR ]'}
                        </button>
                    </div>
                ` : ''}
        </div>
    `;
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('add-link-btn').addEventListener('click', addLink);
    document.getElementById('share-link-btn').addEventListener('click', shareProjectLink);
}

// Share project link
function shareProjectLink() {
    const projectUrl = window.location.href;
    
    // Try to copy to clipboard
    if (navigator.clipboard) {
        navigator.clipboard.writeText(projectUrl).then(() => {
            alert('✓ Link copiado al portapapeles!\n\n' + projectUrl);
        }).catch(err => {
            // Fallback: show the URL to copy manually
            prompt('Copia este link:', projectUrl);
        });
    } else {
        // Fallback for older browsers
        prompt('Copia este link:', projectUrl);
    }
}

// Add link
async function addLink() {
    const title = document.getElementById('link-title').value.trim();
    const url = document.getElementById('link-url').value.trim();

    if (!title || !url) {
        alert('Por favor completa título y URL');
        return;
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        alert('URL inválida');
        return;
    }

    if (!currentProject.links) currentProject.links = [];
    
    currentProject.links.push({
        title,
        url,
        addedAt: new Date().toISOString()
    });

    await saveProjectData();
    
    // Clear inputs
    document.getElementById('link-title').value = '';
    document.getElementById('link-url').value = '';
    
    displayLinks();
}

// Delete link
window.deleteLink = async function(index) {
    if (!confirm('¿Eliminar este link?')) return;
    
    currentProject.links.splice(index, 1);
    await saveProjectData();
    displayLinks();
}

// Save project data to backend
async function saveProjectData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                links: currentProject.links || [],
                deliverables: currentProject.deliverables || []
            })
        });

        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.error || 'Error al guardar');
        }

        console.log('Project data saved successfully');
    } catch (error) {
        console.error('Error saving project data:', error);
        alert('Error al guardar los cambios');
    }
}

// Format timestamp from seconds to MM:SS
function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// YouTube player instances
const youtubePlayers = {};

// Initialize YouTube API
function loadYouTubeAPI() {
    if (window.YT) return;
    
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

// Called when YouTube API is ready
window.onYouTubeIframeAPIReady = function() {
    console.log('YouTube API ready');
}

// Add current timestamp to input
window.addTimestamp = function(index, type, isYouTube = false) {
    const timestampInput = document.getElementById(`timestamp-${index}`);
    
    if (isYouTube) {
        // Handle YouTube iframe
        if (!youtubePlayers[index]) {
            // Initialize YouTube player
            loadYouTubeAPI();
            
            setTimeout(() => {
                if (window.YT && window.YT.Player) {
                    youtubePlayers[index] = new YT.Player(`${type}-${index}`, {
                        events: {
                            'onReady': () => {
                                const currentTime = youtubePlayers[index].getCurrentTime();
                                if (timestampInput) {
                                    timestampInput.value = formatTimestamp(currentTime);
                                    timestampInput.dataset.seconds = currentTime;
                                }
                            }
                        }
                    });
                } else {
                    alert('Espera un momento y vuelve a intentar (cargando YouTube API)');
                }
            }, 1000);
        } else {
            // Player already exists, get current time
            try {
                const currentTime = youtubePlayers[index].getCurrentTime();
                if (timestampInput) {
                    timestampInput.value = formatTimestamp(currentTime);
                    timestampInput.dataset.seconds = currentTime;
                }
            } catch (e) {
                alert('No se pudo obtener el tiempo actual. Asegúrate de que el video esté cargado.');
            }
        }
    } else {
        // Try to get Plyr player first
        const plyrPlayer = window[`plyr_${type}_${index}`];
        
        if (plyrPlayer && timestampInput) {
            const currentTime = plyrPlayer.currentTime;
            timestampInput.value = formatTimestamp(currentTime);
            timestampInput.dataset.seconds = currentTime;
            console.log('Captured timestamp from Plyr:', currentTime);
        } else {
            // Fallback to native HTML5 element
            const media = document.getElementById(`${type}-${index}`);
            if (media && timestampInput) {
                const currentTime = media.currentTime;
                timestampInput.value = formatTimestamp(currentTime);
                timestampInput.dataset.seconds = currentTime;
                console.log('Captured timestamp from native:', currentTime);
            }
        }
    }
}

// Seek to timestamp
window.seekTo = function(index, seconds, type) {
    // Try Plyr player first
    const plyrPlayer = window[`plyr_${type}_${index}`];
    if (plyrPlayer) {
        plyrPlayer.currentTime = seconds;
        plyrPlayer.play();
        console.log('Seeked to', seconds, 'using Plyr');
        return;
    }
    
    // Fallback to native element
    const media = document.getElementById(`${type}-${index}`);
    if (media) {
        media.currentTime = seconds;
        media.play();
    }
}

// Save comment
window.saveComment = async function(index, title, type) {
    const timestampInput = document.getElementById(`timestamp-${index}`);
    const commentInput = document.getElementById(`comment-${index}`);
    
    let timestamp;
    const comment = commentInput.value.trim();
    
    if (!comment) {
        alert('Por favor escribe un comentario');
        return;
    }
    
    // Check if it's manual entry (Drive video) or auto-captured
    if (!timestampInput.hasAttribute('readonly')) {
        // Manual entry for Drive videos
        const manualTime = timestampInput.value.trim();
        if (!manualTime) {
            alert('Por favor ingresa un timestamp');
            return;
        }
        
        // Parse M:SS or MM:SS format
        const parts = manualTime.split(':');
        if (parts.length !== 2) {
            alert('Formato incorrecto. Usa MM:SS (Ej: 1:30)');
            return;
        }
        
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseInt(parts[1]) || 0;
        
        if (seconds >= 60) {
            alert('Los segundos deben ser menores a 60');
            return;
        }
        
        timestamp = minutes * 60 + seconds;
    } else {
        // Auto-captured timestamp
        timestamp = parseFloat(timestampInput.dataset.seconds || 0);
        
        if (timestamp === 0 || !timestampInput.value) {
            alert('Por favor captura un timestamp primero');
            return;
        }
    }
    
    // Find the deliverable
    const deliverable = currentProject.deliverables.find(d => d.title === title);
    if (!deliverable) return;
    
    if (!deliverable.comments) deliverable.comments = [];
    
    deliverable.comments.push({
        timestamp: timestamp,
        comment: comment,
        addedAt: new Date().toISOString()
    });
    
    // Sort comments by timestamp
    deliverable.comments.sort((a, b) => a.timestamp - b.timestamp);
    
    await saveProjectData();
    
    // Clear inputs
    commentInput.value = '';
    timestampInput.value = '';
    delete timestampInput.dataset.seconds;
    
    // Refresh display
    displayWork();
}

// Delete comment
window.deleteComment = async function(index, commentIndex, title) {
    if (!confirm('¿Eliminar este comentario?')) return;
    
    const deliverable = currentProject.deliverables.find(d => d.title === title);
    if (!deliverable) return;
    
    deliverable.comments.splice(commentIndex, 1);
    
    await saveProjectData();
    displayWork();
}

// Toggle approval status
window.toggleApproval = async function(index, title) {
    const deliverable = currentProject.deliverables.find(d => d.title === title);
    if (!deliverable) return;
    
    deliverable.approved = !deliverable.approved;
    
    await saveProjectData();
    displayWork();
}

// Toggle section collapse/expand
window.toggleSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    const toggle = document.getElementById(`${sectionId}-toggle`);
    
    if (section && toggle) {
        if (section.classList.contains('hidden')) {
            section.classList.remove('hidden');
            toggle.textContent = '−';
        } else {
            section.classList.add('hidden');
            toggle.textContent = '+';
        }
    }
}

// Switch tab
window.switchTab = function(tab) {
    currentTab = tab;
    
    // Update tab styles
    const tabs = ['pending', 'approved', 'all'];
    tabs.forEach(t => {
        const tabElement = document.getElementById(`tab-${t}`);
        if (tabElement) {
            if (t === tab) {
                tabElement.className = 'px-4 py-2 text-sm border-b-2 border-yellow-300 text-yellow-300';
            } else {
                tabElement.className = 'px-4 py-2 text-sm border-b-2 border-transparent text-gray-400 hover:text-gray-300';
            }
        }
    });
    
    // Refresh display
    displayWork();
}

// Toggle comments collapse/expand
window.toggleComments = function(index) {
    const commentsDiv = document.getElementById(`comments-${index}`);
    const toggle = document.getElementById(`comments-toggle-${index}`);
    
    if (commentsDiv && toggle) {
        if (commentsDiv.classList.contains('hidden')) {
            commentsDiv.classList.remove('hidden');
            toggle.textContent = '−';
        } else {
            commentsDiv.classList.add('hidden');
            toggle.textContent = '+';
        }
    }
}

// Open file details
window.openFile = function(index) {
    currentOpenFile = index;
    displayWork();
}

// Close file details and return to list
window.closeFile = function() {
    currentOpenFile = null;
    displayWork();
}

// Validate time format as user types
window.validateTimeFormat = function(input) {
    const value = input.value;
    
    // Allow only numbers and colon
    input.value = value.replace(/[^\d:]/g, '');
    
    // Visual feedback for valid format
    const parts = input.value.split(':');
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const seconds = parseInt(parts[1]);
        if (seconds < 60) {
            input.classList.remove('border-red-500');
            input.classList.add('border-green-500');
        } else {
            input.classList.remove('border-green-500');
            input.classList.add('border-red-500');
        }
    } else if (input.value.length > 0) {
        input.classList.remove('border-green-500');
    }
}

// Handle video loading errors
window.handleVideoError = function(index, url) {
    const video = document.getElementById(`video-${index}`);
    if (!video) return;
    
    console.error('Video error:', video.error);
    
    const container = video.parentElement;
    const errorCode = video.error ? video.error.code : 'unknown';
    const errorMessages = {
        1: 'Carga abortada',
        2: 'Error de red',
        3: 'Error de decodificación - el video puede estar en un formato no soportado',
        4: 'Video no encontrado o formato no soportado'
    };
    
    const errorMsg = errorMessages[errorCode] || 'Error desconocido al cargar video';
    
    container.innerHTML = `
        <div class="p-6 bg-red-900/20 border border-red-500/50 rounded text-center">
            <p class="text-red-300 text-lg mb-2">⚠️ Error al cargar video</p>
            <p class="text-gray-300 text-sm mb-4">${errorMsg}</p>
            <p class="text-gray-400 text-xs mb-4">El archivo puede necesitar recodificación. Formatos recomendados: H.264 + AAC</p>
            <div class="flex gap-3 justify-center">
                <a href="${url}" download class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">
                    [ DESCARGAR VIDEO ]
                </a>
                <button onclick="retryVideo(${index}, '${url}')" class="px-4 py-2 border border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black rounded">
                    [ REINTENTAR ]
                </button>
            </div>
        </div>
    `;
}

// Retry video loading
window.retryVideo = function(index, url) {
    location.reload();
}

// Handle Dropbox video errors specifically
window.handleDropboxError = function(index, convertedUrl, originalUrl) {
    const video = document.getElementById(`video-${index}`);
    if (!video) return;
    
    console.error('Dropbox video error:', video.error, 'Converted URL:', convertedUrl, 'Original:', originalUrl);
    
    const container = video.parentElement;
    const errorCode = video.error ? video.error.code : 'unknown';
    
    container.innerHTML = `
        <div class="p-6 bg-red-900/20 border border-red-500/50 rounded">
            <p class="text-red-300 text-lg mb-2">⚠️ Error al cargar video de Dropbox</p>
            <p class="text-gray-300 text-sm mb-4">El video no se pudo cargar directamente. Esto puede deberse a:</p>
            <ul class="text-gray-400 text-sm mb-4 list-disc list-inside space-y-1">
                <li>El link no es público o tiene restricciones</li>
                <li>El formato del link no es compatible</li>
                <li>Dropbox bloqueó el streaming directo</li>
            </ul>
            
            <div class="mb-4 p-3 bg-gray-900/50 rounded">
                <p class="text-xs text-gray-500 mb-1">URL original:</p>
                <p class="text-xs text-gray-300 break-all mb-2">${originalUrl}</p>
                <p class="text-xs text-gray-500 mb-1">URL convertida:</p>
                <p class="text-xs text-gray-300 break-all">${convertedUrl}</p>
            </div>
            
            <p class="text-yellow-300 text-sm mb-3">💡 <strong>Solución recomendada:</strong> Usa YouTube en su lugar para timestamps automáticos</p>
            
            <div class="flex gap-3 justify-center flex-wrap">
                <a href="${originalUrl}" target="_blank" class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">
                    [ VER EN DROPBOX ]
                </a>
                <a href="${convertedUrl}" download class="px-4 py-2 border border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black rounded">
                    [ INTENTAR DESCARGA ]
                </a>
                <button onclick="retryVideo(${index}, '${convertedUrl}')" class="px-4 py-2 border border-gray-500 text-gray-300 hover:border-gray-400 rounded">
                    [ REINTENTAR ]
                </button>
            </div>
        </div>
    `;
}

// Three.js Background (same as main page)
let scene, camera, renderer, mesh, clock;
const lights = [];

function initThreeJS() {
    const canvas = document.getElementById('three-canvas');
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    
    clock = new THREE.Clock();
    
    mesh = createOwl();
    scene.add(mesh);
    
    createLights();
    
    window.addEventListener('resize', onWindowResize);
    animate();
}

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

    const bodyGeom = new THREE.SphereGeometry(1, 32, 32);
    const body = new THREE.Mesh(bodyGeom, material);
    body.scale.set(1, 1.2, 0.9);
    owlGroup.add(body);

    const headGeom = new THREE.SphereGeometry(0.7, 32, 32);
    const head = new THREE.Mesh(headGeom, material);
    head.position.set(0, 1.3, 0);
    head.scale.set(1.1, 1, 1);
    owlGroup.add(head);

    const eyeGeom = new THREE.SphereGeometry(0.2, 16, 16);
    const eyeMatL = material.clone();
    eyeMatL.emissive = new THREE.Color(0x00ffff);
    eyeMatL.emissiveIntensity = 0.5;
    const leftEye = new THREE.Mesh(eyeGeom, eyeMatL);
    leftEye.position.set(-0.3, 1.4, 0.5);
    owlGroup.add(leftEye);

    const eyeMatR = material.clone();
    eyeMatR.emissive = new THREE.Color(0xff00ff);
    eyeMatR.emissiveIntensity = 0.5;
    const rightEye = new THREE.Mesh(eyeGeom, eyeMatR);
    rightEye.position.set(0.3, 1.4, 0.5);
    owlGroup.add(rightEye);

    const beakGeom = new THREE.ConeGeometry(0.15, 0.3, 8);
    const beakMat = new THREE.MeshPhysicalMaterial({
        color: 0xffaa00,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xff5500,
        emissiveIntensity: 0.3
    });
    const beak = new THREE.Mesh(beakGeom, beakMat);
    beak.position.set(0, 1.2, 0.65);
    beak.rotation.x = Math.PI;
    owlGroup.add(beak);

    const wingGeom = new THREE.SphereGeometry(0.5, 16, 16);
    const leftWing = new THREE.Mesh(wingGeom, material);
    leftWing.position.set(-1, 0, 0);
    leftWing.scale.set(0.6, 1.2, 0.3);
    owlGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeom, material);
    rightWing.position.set(1, 0, 0);
    rightWing.scale.set(0.6, 1.2, 0.3);
    owlGroup.add(rightWing);

    return owlGroup;
}

function createLights() {
    const pointLight1 = new THREE.PointLight(0x00ffff, 2, 15);
    pointLight1.position.set(-3, 2, 3);
    scene.add(pointLight1);
    lights.push(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff00ff, 2, 15);
    pointLight2.position.set(3, 2, 3);
    scene.add(pointLight2);
    lights.push(pointLight2);

    const pointLight3 = new THREE.PointLight(0xffff00, 1.5, 15);
    pointLight3.position.set(0, -2, 2);
    scene.add(pointLight3);
    lights.push(pointLight3);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = clock.getElapsedTime();
    
    mesh.rotation.y = Math.sin(time * 0.5) * 0.3;
    mesh.rotation.x = Math.sin(time * 0.3) * 0.1;
    mesh.position.y = Math.sin(time * 0.8) * 0.3;

    lights[0].position.x = Math.sin(time * 0.7) * 4;
    lights[0].position.y = Math.cos(time * 0.5) * 3;

    lights[1].position.x = Math.cos(time * 0.6) * 4;
    lights[1].position.y = Math.sin(time * 0.4) * 3;

    lights[2].position.x = Math.sin(time * 0.9) * 2;
    lights[2].position.z = Math.cos(time * 0.8) * 2 + 2;

    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


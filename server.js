import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin access required' });
    }
    next();
};

// User credentials
const USERS = {
    admin: {
        username: 'admin',
        passwordHash: process.env.ADMIN_PASSWORD_HASH,
        role: 'admin'
    },
    penthouse: {
        username: 'penthouse',
        passwordHash: process.env.PENTHOUSE_PASSWORD_HASH,
        role: 'client'
    }
};

// Data file path
const PROJECTS_FILE = path.join(__dirname, 'data', 'projects.json');
const QUOTES_FILE = path.join(__dirname, 'data', 'quotes.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads directory with proper headers for media files
app.use('/uploads', (req, res, next) => {
    const filePath = req.path.toLowerCase();
    
    // Set explicit MIME types BEFORE serving the file
    if (filePath.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        console.log('Serving MP4 video:', req.path, 'MIME: video/mp4');
    } else if (filePath.endsWith('.webm')) {
        res.setHeader('Content-Type', 'video/webm');
    } else if (filePath.endsWith('.mov')) {
        res.setHeader('Content-Type', 'video/quicktime');
    } else if (filePath.endsWith('.avi')) {
        res.setHeader('Content-Type', 'video/x-msvideo');
    } else if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
    } else if (filePath.endsWith('.m4a')) {
        res.setHeader('Content-Type', 'audio/mp4');
    } else if (filePath.endsWith('.wav')) {
        res.setHeader('Content-Type', 'audio/wav');
    } else if (filePath.endsWith('.ogg')) {
        res.setHeader('Content-Type', 'audio/ogg');
    }
    
    // CORS headers for media playback
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    
    // Allow range requests for media streaming (seeking)
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Cache control
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Continue to static file serving
    next();
}, express.static(uploadsDir));

// Configure multer for file uploads with versioning
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Get projectId from URL params (more reliable than body)
        const projectId = req.params.id || 'general';
        const projectDir = path.join(uploadsDir, projectId);
        
        // Create project directory if it doesn't exist
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }
        
        cb(null, projectDir);
    },
    filename: function (req, file, cb) {
        // Get projectId from URL params
        const projectId = req.params.id || 'general';
        const projectDir = path.join(uploadsDir, projectId);
        const originalName = file.originalname;
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        
        // Check for existing files with same name
        let fileName = originalName;
        let version = 1;
        
        while (fs.existsSync(path.join(projectDir, fileName))) {
            fileName = `${baseName}_v${version}${ext}`;
            version++;
        }
        
        cb(null, fileName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Initialize data files if they don't exist
if (!fs.existsSync(PROJECTS_FILE)) {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2));
}

if (!fs.existsSync(QUOTES_FILE)) {
    fs.writeFileSync(QUOTES_FILE, JSON.stringify([], null, 2));
}

// Helper functions
function readProjects() {
    try {
        const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading projects:', error);
        return [];
    }
}

function writeProjects(projects) {
    try {
        fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing projects:', error);
        return false;
    }
}

function readQuotes() {
    try {
        const data = fs.readFileSync(QUOTES_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading quotes:', error);
        return [];
    }
}

function writeQuotes(quotes) {
    try {
        fs.writeFileSync(QUOTES_FILE, JSON.stringify(quotes, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing quotes:', error);
        return false;
    }
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// POST /api/auth/login - User login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Username and password required' });
        }

        const user = USERS[username.toLowerCase()];
        
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Compare password with hash
        const validPassword = await bcrypt.compare(password, user.passwordHash);
        
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Create JWT token
        const token = jwt.sign(
            { username: user.username, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

// GET /api/auth/verify - Verify token
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: {
            username: req.user.username,
            role: req.user.role
        }
    });
});

// ============================================
// API ROUTES
// ============================================

// GET /api/projects - Get all projects
app.get('/api/projects', (req, res) => {
    try {
        const projects = readProjects();
        res.json({ success: true, projects });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/projects/:name - Get specific project
app.get('/api/projects/:name', (req, res) => {
    try {
        const projects = readProjects();
        const project = projects.find(p => 
            p.name.toLowerCase() === req.params.name.toLowerCase()
        );
        
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        res.json({ success: true, project });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/projects - Create or update project
app.post('/api/projects', (req, res) => {
    try {
        const { name, oldName } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Project name is required' });
        }

        const projects = readProjects();
        let existingIndex = -1;
        
        // If oldName is provided, we're renaming a project
        if (oldName) {
            existingIndex = projects.findIndex(p => 
                p.name.toLowerCase() === oldName.toLowerCase()
            );
            
            if (existingIndex < 0) {
                return res.status(404).json({ success: false, error: 'Project not found' });
            }
            
            // Check if new name already exists
            const nameExists = projects.some(p => 
                p.name.toLowerCase() === name.toLowerCase() && p.name !== oldName
            );
            
            if (nameExists) {
                return res.status(400).json({ success: false, error: 'Project name already exists' });
            }
            
            // Update quotes with the new project name
            const quotes = readQuotes();
            quotes.forEach(quote => {
                if (quote['project-name'] === oldName) {
                    quote['project-name'] = name;
                }
            });
            writeQuotes(quotes);
        } else {
            // Check if project already exists
            existingIndex = projects.findIndex(p => 
                p.name.toLowerCase() === name.toLowerCase()
            );
        }

        const projectData = {
            id: existingIndex >= 0 ? projects[existingIndex].id : Date.now().toString(),
            name,
            createdAt: existingIndex >= 0 ? projects[existingIndex].createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            quoteCount: existingIndex >= 0 ? (projects[existingIndex].quoteCount || 0) : 0,
            links: existingIndex >= 0 ? (projects[existingIndex].links || []) : [],
            deliverables: existingIndex >= 0 ? (projects[existingIndex].deliverables || []) : []
        };

        if (existingIndex >= 0) {
            projects[existingIndex] = projectData;
        } else {
            projects.push(projectData);
        }

        if (writeProjects(projects)) {
            res.json({ success: true, project: projectData });
        } else {
            res.status(500).json({ success: false, error: 'Failed to save project' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/quotes - Submit a quote
app.post('/api/quotes', (req, res) => {
    try {
        const quoteData = req.body;
        
        // Validate required fields
        if (!quoteData['project-name']) {
            return res.status(400).json({ success: false, error: 'Project name is required' });
        }

        // Add timestamp
        const quote = {
            ...quoteData,
            submittedAt: new Date().toISOString(),
            id: Date.now().toString()
        };

        // Save quote
        const quotes = readQuotes();
        quotes.push(quote);
        
        if (!writeQuotes(quotes)) {
            return res.status(500).json({ success: false, error: 'Failed to save quote' });
        }

        // Update project quote count
        const projects = readProjects();
        const projectName = quoteData['project-name'];
        const projectIndex = projects.findIndex(p => 
            p.name.toLowerCase() === projectName.toLowerCase()
        );

        if (projectIndex >= 0) {
            projects[projectIndex].quoteCount = (projects[projectIndex].quoteCount || 0) + 1;
            projects[projectIndex].updatedAt = new Date().toISOString();
            writeProjects(projects);
        } else {
            // Create project if it doesn't exist
            projects.push({
                id: Date.now().toString(),
                name: projectName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                quoteCount: 1,
                links: [],
                deliverables: []
            });
            writeProjects(projects);
        }

        res.json({ success: true, quote });
    } catch (error) {
        console.error('Error submitting quote:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/quotes - Get all quotes (optional, for admin)
app.get('/api/quotes', (req, res) => {
    try {
        const quotes = readQuotes();
        res.json({ success: true, quotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/projects/:id/quotes - Get quotes for specific project
app.get('/api/projects/:id/quotes', (req, res) => {
    try {
        const projectId = req.params.id;
        const projects = readProjects();
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        const quotes = readQuotes();
        const projectQuotes = quotes.filter(q => 
            q['project-name'] && q['project-name'].toLowerCase() === project.name.toLowerCase()
        );
        
        res.json({ success: true, quotes: projectQuotes });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/projects/:id - Update project (links, deliverables)
app.put('/api/projects/:id', (req, res) => {
    try {
        const projectId = req.params.id;
        const { links, deliverables } = req.body;
        
        const projects = readProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex < 0) {
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        // Update project with new data
        projects[projectIndex].links = links || [];
        projects[projectIndex].deliverables = deliverables || [];
        projects[projectIndex].updatedAt = new Date().toISOString();
        
        if (writeProjects(projects)) {
            res.json({ success: true, project: projects[projectIndex] });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update project' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/projects/:id/upload - Upload file for a project
app.post('/api/projects/:id/upload', upload.single('file'), (req, res) => {
    try {
        const projectId = req.params.id;
        const { title, notes, isLink, linkUrl, version, replaceIndex } = req.body;
        
        console.log('Upload request received:', {
            projectId,
            title,
            isLink,
            version,
            replaceIndex,
            hasFile: !!req.file,
            fileName: req.file ? req.file.filename : 'none'
        });
        
        const projects = readProjects();
        const projectIndex = projects.findIndex(p => p.id === projectId);
        
        if (projectIndex < 0) {
            console.error('Project not found:', projectId);
            return res.status(404).json({ success: false, error: 'Project not found' });
        }
        
        const project = projects[projectIndex];
        if (!project.deliverables) project.deliverables = [];
        
        let deliverable;
        
        if (isLink === 'true') {
            // It's a link, not a file upload
            deliverable = {
                title: title || 'Link',
                url: linkUrl,
                notes: notes || '',
                addedAt: new Date().toISOString(),
                type: 'link',
                version: version ? parseInt(version) : 1
            };
        } else {
            // It's a file upload
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No file uploaded' });
            }
            
            const fileUrl = `/uploads/${projectId}/${req.file.filename}`;
            
            deliverable = {
                title: title || req.file.originalname,
                url: fileUrl,
                notes: notes || '',
                filename: req.file.filename,
                originalName: req.file.originalname,
                fileSize: req.file.size,
                addedAt: new Date().toISOString(),
                type: 'file',
                version: version ? parseInt(version) : 1
            };
        }
        
        // If replaceIndex is provided, replace the existing deliverable
        if (replaceIndex !== undefined && replaceIndex !== null && replaceIndex !== '') {
            const idx = parseInt(replaceIndex);
            if (idx >= 0 && idx < project.deliverables.length) {
                // Keep the approved status if it exists
                deliverable.approved = project.deliverables[idx].approved || false;
                project.deliverables[idx] = deliverable;
                console.log('Replaced deliverable at index:', idx);
            } else {
                console.warn('Invalid replaceIndex, adding as new deliverable');
                project.deliverables.push(deliverable);
            }
        } else {
            // Add as new deliverable
            project.deliverables.push(deliverable);
        }
        
        project.updatedAt = new Date().toISOString();
        
        if (writeProjects(projects)) {
            res.json({ 
                success: true, 
                deliverable,
                project: projects[projectIndex]
            });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update project' });
        }
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Google Drive video streaming proxy
// This allows us to stream Drive videos with automatic timestamps
app.get('/api/drive-stream/:fileId', async (req, res) => {
    const { fileId } = req.params;
    const apiKey = req.query.key; // Optional: API key from query param
    
    console.log('=== DRIVE STREAM REQUEST ===');
    console.log('File ID:', fileId);
    console.log('Origin:', req.headers.origin);
    console.log('Method:', req.method);
    console.log('Range:', req.headers.range || 'No range header');
    
    try {
        // Initialize Drive API (no auth required for public files)
        const drive = google.drive({ 
            version: 'v3',
            auth: apiKey || process.env.GOOGLE_DRIVE_API_KEY || null
        });
        
        // Get file metadata first to check if it's accessible
        let fileMetadata;
        try {
            const metadataResponse = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, mimeType, size',
                supportsAllDrives: true
            });
            fileMetadata = metadataResponse.data;
            console.log('File metadata:', fileMetadata);
        } catch (error) {
            console.error('Failed to get file metadata:', error.message);
            // If metadata fails, the file might not be public or doesn't exist
            return res.status(403).json({ 
                error: 'Unable to access file. Make sure the Drive file is publicly accessible.',
                details: error.message 
            });
        }
        
        // Set appropriate headers for video streaming
        res.setHeader('Content-Type', fileMetadata.mimeType || 'video/mp4');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
        
        if (fileMetadata.size) {
            res.setHeader('Content-Length', fileMetadata.size);
        }
        
        // Handle range requests for seeking
        const range = req.headers.range;
        if (range && fileMetadata.size) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : parseInt(fileMetadata.size) - 1;
            const chunksize = (end - start) + 1;
            
            res.status(206); // Partial Content
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileMetadata.size}`);
            res.setHeader('Content-Length', chunksize);
            
            console.log(`Range request: ${start}-${end}/${fileMetadata.size}`);
        }
        
        // Stream the file
        const fileStream = await drive.files.get(
            {
                fileId: fileId,
                alt: 'media',
                supportsAllDrives: true
            },
            {
                responseType: 'stream'
            }
        );
        
        // Pipe the Drive stream directly to the response
        fileStream.data
            .on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Stream error', details: err.message });
                }
            })
            .on('end', () => {
                console.log('Stream ended successfully');
            })
            .pipe(res);
            
    } catch (error) {
        console.error('Drive streaming error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to stream video from Drive',
                details: error.message,
                hint: 'Make sure the file is publicly accessible and the sharing link is set to "Anyone with the link can view"'
            });
        }
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`FUKURO backend server running on http://localhost:${PORT}`);
    console.log(`Drive streaming available at: http://localhost:${PORT}/api/drive-stream/:fileId`);
});


import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve static files

// Data file path
const PROJECTS_FILE = path.join(__dirname, 'data', 'projects.json');
const QUOTES_FILE = path.join(__dirname, 'data', 'quotes.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

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

// API Routes

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
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, error: 'Project name is required' });
        }

        const projects = readProjects();
        const existingIndex = projects.findIndex(p => 
            p.name.toLowerCase() === name.toLowerCase()
        );

        const projectData = {
            name,
            createdAt: existingIndex >= 0 ? projects[existingIndex].createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            quoteCount: existingIndex >= 0 ? (projects[existingIndex].quoteCount || 0) : 0
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
                name: projectName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                quoteCount: 1
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

// Start server
app.listen(PORT, () => {
    console.log(`FUKURO backend server running on http://localhost:${PORT}`);
});


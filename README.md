# FUKURO - A/V Synthesis Quote System

A modern quote generation system with AI-powered form parsing and project management.

## Features

- 🤖 AI-powered form parsing using GPT-4
- 🎤 Voice recording support (WhatsApp-style press and hold)
- 📋 Project management (new/existing projects)
- 💰 Automatic quote calculation
- 🎨 Modern cyberpunk-inspired UI

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

Create a `config.js` file (see `config.example.js`):

```javascript
export const OPENAI_API_KEY = 'your-openai-api-key-here';
```

### 3. Start the Backend Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will run on `http://localhost:3000`

### 4. Open the Application

Open `index.html` in your browser, or if running the server, navigate to `http://localhost:3000`

## Project Structure

```
FUKURO/
├── server.js              # Express backend server
├── index.html             # Main landing page
├── main.js                # Frontend logic
├── cotizacion.html        # Quote display page
├── package.json           # Node.js dependencies
├── data/                  # Data storage (auto-created)
│   ├── projects.json      # Project database
│   └── quotes.json        # Quote submissions
└── config.js              # API keys (gitignored)
```

## API Endpoints

- `GET /api/projects` - Get all projects
- `GET /api/projects/:name` - Get specific project
- `POST /api/projects` - Create/update project
- `POST /api/quotes` - Submit a quote
- `GET /api/quotes` - Get all quotes (optional)

## Usage

1. Select "Nuevo Proyecto" or "Proyecto Existente"
2. If existing, choose from the dropdown
3. Type or record a voice message describing your project
4. GPT will parse the message and fill the form
5. Review the quote summary
6. Submit to generate the quote

## Notes

- Projects are automatically created when quotes are submitted
- Quote counts are tracked per project
- Existing projects don't charge base fees for additional quotes
- All data is stored in JSON files in the `data/` directory


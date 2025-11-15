# FUKURO - Project Pages

## What's New

Each project now has its own dedicated page where both you (admin) and your clients can:

### For Clients (View Only):
- View all project details and quotes
- Upload reference materials (Drive links, mood boards, etc.)
- Check all deliverables and downloads you've provided

### For You (Admin):
- Upload work/deliverables with notes
- Organize client references
- Track all quotes for the project
- Share a unique URL with clients

## How to Access Project Pages

1. **From Backend Dashboard:**
   - Login to backend (admin/admin)
   - Click "[ VER PÁGINA ]" button next to any project
   - Opens in a new tab

2. **Direct URL Format:**
   ```
   http://localhost:3000/project.html?id=PROJECT_ID
   ```

3. **Share with Clients:**
   - Click "[ COMPARTIR LINK ]" button on the project page
   - Copies URL to clipboard
   - Send this link to your client

## Project Page Features

### Referencias y Recursos (Left Column)
- Clients can add Drive links, reference videos, mood boards
- Each link has a title and URL
- Delete unwanted links with the × button

### Mi Trabajo (Right Column)
- You upload final deliverables here
- Add WeTransfer/Drive links to files
- Include optional notes about each version
- Client can download and review

### Cotizaciones del Proyecto (Bottom)
- Shows all quotes for this project
- Includes timeline, services, total cost
- Organized chronologically

## Example: Tenampa 100

The Tenampa 100 project is ready to test:
- ID: `1731695870031`
- URL: `http://localhost:3000/project.html?id=1731695870031`
- Has 1 quote already

## Technical Details

**New Files:**
- `project.html` - Project page UI
- `project.js` - Project page logic

**Updated Files:**
- `server.js` - Added endpoints for project data storage
- `main.js` - Added "VER PÁGINA" button to backend
- `data/projects.json` - Now stores links & deliverables

**New Backend Endpoints:**
- `GET /api/projects/:id/quotes` - Get quotes for a project
- `PUT /api/projects/:id` - Update project (links, deliverables)

## Data Structure

Projects now store:
```json
{
  "id": "1731695870031",
  "name": "Tenampa 100",
  "createdAt": "2025-11-15T18:02:50.031Z",
  "updatedAt": "2025-11-15T19:33:06.343Z",
  "quoteCount": 1,
  "links": [
    {
      "title": "Drive Folder",
      "url": "https://drive.google.com/...",
      "addedAt": "2025-11-15T20:00:00.000Z"
    }
  ],
  "deliverables": [
    {
      "title": "Final Video v1",
      "url": "https://wetransfer.com/...",
      "notes": "First draft for review",
      "addedAt": "2025-11-15T20:30:00.000Z"
    }
  ]
}
```

## Usage Tips

1. **Share links early** - Send clients the project page URL so they can upload references before you start
2. **Version your deliverables** - Use clear titles like "Video Final v1", "Video Final v2 (con correcciones)"
3. **Add notes** - Explain what changed in each version
4. **Keep organized** - Delete outdated links/files to keep the page clean

## Security Note

Currently, project pages are public (anyone with the URL can view/edit). If you need authentication, let me know and we can add password protection per project.


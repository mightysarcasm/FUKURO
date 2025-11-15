# Video Services Compatibility Guide

## Supported Video Services with Automatic Timestamps

FUKURO supports automatic timestamp capture and seeking for the following video services:

---

## ✅ Fully Supported (Automatic Timestamps)

### 1. **Uploaded Videos (Native HTML5)**
- **Format**: MP4, WebM (uploaded directly to server)
- **Timestamp Support**: ✅ Full automatic capture & seek
- **API**: Native HTML5 Video API
- **Notes**: 
  - Best codec: H.264 Baseline + AAC for universal browser support
  - Works in Edge if properly encoded (see `VIDEO_ENCODING_GUIDE.md`)
  - Safari is more forgiving with codec variations

**Example URL**: `/uploads/1234567890/video.mp4`

---

### 2. **YouTube**
- **URL Formats**:
  - `https://www.youtube.com/watch?v=VIDEO_ID`
  - `https://youtu.be/VIDEO_ID`
  - `https://www.youtube.com/embed/VIDEO_ID`
- **Timestamp Support**: ✅ Full automatic capture & seek
- **API**: YouTube IFrame Player API
- **Notes**: 
  - Requires YouTube IFrame API to load
  - Excellent programmatic control
  - Most reliable third-party service

**Example**: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`

---

### 3. **Vimeo** ⭐ NEW
- **URL Formats**:
  - `https://vimeo.com/VIDEO_ID`
  - `https://player.vimeo.com/video/VIDEO_ID`
- **Timestamp Support**: ✅ Full automatic capture & seek
- **API**: Vimeo Player API
- **Notes**: 
  - Professional video hosting
  - Excellent API with Promise-based methods
  - Good performance and reliability
  - No ads, clean player interface

**Example**: `https://vimeo.com/76979871`

**API Methods Used**:
```javascript
player.getCurrentTime() // Returns Promise<number>
player.setCurrentTime(seconds) // Returns Promise
player.play() // Returns Promise
```

---

### 4. **Dropbox** (Experimental)
- **URL Formats**:
  - `https://www.dropbox.com/s/*/video.mp4`
  - `https://www.dropbox.com/scl/*/video.mp4`
- **Timestamp Support**: ✅ Automatic (via converted direct stream)
- **API**: Native HTML5 (after URL conversion)
- **Notes**: 
  - Automatically converts share links to direct streaming URLs
  - Uses `dl.dropboxusercontent.com` for playback
  - May have reliability issues depending on Dropbox link settings
  - File must be publicly accessible

**URL Conversion**:
```
From: https://www.dropbox.com/s/abc123/video.mp4?dl=0
To:   https://dl.dropboxusercontent.com/s/abc123/video.mp4?raw=1
```

---

## ⚠️ Partially Supported (Manual Timestamps)

### 5. **Google Drive**
- **URL Format**: `https://drive.google.com/file/d/FILE_ID/view`
- **Timestamp Support**: ⚠️ Manual entry only (MM:SS format)
- **API**: None (embedded iframe)
- **Notes**: 
  - Google Drive doesn't expose a JavaScript API for programmatic control
  - Users must manually enter timestamp in MM:SS format
  - Real-time validation of timestamp format provided
  - Still functional, just requires an extra step

**Why Manual?**: Google Drive's video player runs in a sandboxed iframe with no accessible API for getCurrentTime() or seek operations.

---

## ❌ Not Supported

### Services Without JavaScript API Access:

**Twitch**
- **Issue**: Iframe restrictions, requires Twitch embed API setup
- **Workaround**: Download and upload video directly

**Facebook/Instagram**
- **Issue**: No public API for embedded videos
- **Workaround**: Download and upload video directly

**TikTok**
- **Issue**: No embedded player API
- **Workaround**: Download and upload video directly

**Dailymotion**
- **Issue**: Has API but less commonly used
- **Status**: Could be added if needed (similar to YouTube/Vimeo)

---

## Comparison Table

| Service | Auto Timestamp | Seek to Timestamp | API Quality | Reliability | Notes |
|---------|---------------|-------------------|-------------|-------------|-------|
| **Uploaded MP4** | ✅ | ✅ | Native HTML5 | ⭐⭐⭐⭐⭐ | Best for control |
| **YouTube** | ✅ | ✅ | Excellent | ⭐⭐⭐⭐⭐ | Most reliable |
| **Vimeo** | ✅ | ✅ | Excellent | ⭐⭐⭐⭐⭐ | Professional, no ads |
| **Dropbox** | ✅ | ✅ | Native HTML5 | ⭐⭐⭐ | Depends on link settings |
| **Google Drive** | ❌ Manual | ❌ Manual | None | ⭐⭐⭐⭐ | Requires manual input |

---

## Recommendations

### For Maximum Compatibility:
1. **Upload directly** - Best control, no external dependencies
2. **Use YouTube** - Most reliable third-party option
3. **Use Vimeo** - Best for professional/client work (no ads)

### For Large Files:
1. **YouTube** - Unlimited storage, automatic transcoding
2. **Vimeo** - Professional quality, paid plans for more storage
3. **Upload directly** - Full control, but requires server storage

### For Client Collaboration:
1. **Vimeo** - Clean, professional interface
2. **YouTube (unlisted)** - Free, reliable
3. **Uploaded files** - Private, secure

---

## Adding More Services

To add support for another video service, you need:

1. **JavaScript API** - The service must provide a programmatic API
2. **getCurrentTime()** - Method to get current playback position
3. **setCurrentTime()** or **seek()** - Method to jump to a timestamp
4. **play()** - Method to start playback

**Services that could be added**:
- Dailymotion (has API)
- Wistia (has API)
- JW Player (has API)
- Cloudflare Stream (has API)

---

## Technical Implementation

### How Timestamp Capture Works:

**Native HTML5 Video**:
```javascript
const video = document.getElementById('video-0');
const currentTime = video.currentTime; // seconds
video.currentTime = 45.5; // seek to 45.5 seconds
```

**YouTube**:
```javascript
const player = new YT.Player('video-0');
const currentTime = player.getCurrentTime();
player.seekTo(45.5, true);
```

**Vimeo**:
```javascript
const player = new Vimeo.Player(iframe);
player.getCurrentTime().then(seconds => console.log(seconds));
player.setCurrentTime(45.5);
```

---

## FAQ

**Q: Why doesn't Dropbox work reliably?**  
A: Dropbox share links sometimes have restrictions that prevent direct streaming. Ensure the link is publicly accessible.

**Q: Can I use private YouTube videos?**  
A: Unlisted YouTube videos work fine. Private videos require authentication and won't work in embedded players.

**Q: Why is Google Drive manual only?**  
A: Google's iframe embedding doesn't expose any JavaScript API for programmatic control.

**Q: Can I add support for [service]?**  
A: If the service has a public JavaScript API with time control methods, yes! Open an issue with the service name.

---

*Last updated: November 2025*


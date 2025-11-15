# Video Encoding Guide for FUKURO

## The Problem: Edge/Chrome vs Safari Codec Support

**Issue**: Videos that play in Safari may show a **black screen** in Edge/Chrome browsers.

**Root Cause**: Safari supports a wider range of H.264 codec profiles, while Edge/Chrome require more specific encoding settings.

---

## Solution: Re-encode Videos for Universal Compatibility

### Prerequisites
Install **ffmpeg** (free, open-source):

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from: https://ffmpeg.org/download.html

**Linux:**
```bash
sudo apt install ffmpeg
```

---

### Quick Fix Command

For **maximum compatibility** with all browsers (Edge, Chrome, Safari, Firefox):

```bash
ffmpeg -i input.mp4 -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 128k output.mp4
```

**What this does:**
- **`-c:v libx264`**: Use H.264 video codec
- **`-profile:v baseline`**: Use Baseline profile (most compatible)
- **`-level 3.0`**: Compatible with older devices
- **`-pix_fmt yuv420p`**: Standard pixel format
- **`-c:a aac`**: Use AAC audio codec
- **`-b:a 128k`**: Set audio bitrate to 128kbps

---

### Batch Convert Multiple Videos

**macOS/Linux:**
```bash
for file in *.mp4; do
    ffmpeg -i "$file" -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 128k "converted_$file"
done
```

**Windows (PowerShell):**
```powershell
Get-ChildItem *.mp4 | ForEach-Object {
    ffmpeg -i $_.Name -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -c:a aac -b:a 128k "converted_$($_.Name)"
}
```

---

## Higher Quality Option

For better quality (larger file size):

```bash
ffmpeg -i input.mp4 -c:v libx264 -profile:v main -level 4.0 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k output.mp4
```

**What changed:**
- **`-profile:v main`**: Main profile (better quality, still widely compatible)
- **`-preset slow`**: Better compression (slower encoding)
- **`-crf 23`**: Constant Rate Factor (18-28 is good, lower = better quality)
- **`-b:a 192k`**: Higher audio bitrate

---

## Check Video Codec

To check what codec a video uses:

```bash
ffmpeg -i video.mp4
```

Look for:
- **Video codec**: Should say `h264 (Baseline)` or `h264 (Main)`
- **Audio codec**: Should say `aac`

---

## Browser Compatibility Chart

| Codec Profile | Edge/Chrome | Safari | Firefox |
|--------------|-------------|--------|---------|
| H.264 Baseline | ✅ | ✅ | ✅ |
| H.264 Main | ✅ | ✅ | ✅ |
| H.264 High | ⚠️ Sometimes | ✅ | ⚠️ Sometimes |
| H.265/HEVC | ❌ | ✅ | ❌ |
| VP9 | ✅ | ❌ | ✅ |
| AV1 | ✅ | ⚠️ Partial | ✅ |

**Recommendation**: Always use **H.264 Baseline or Main** for maximum compatibility.

---

## Troubleshooting

### Video still won't play?

1. **Check file integrity:**
   ```bash
   ffmpeg -v error -i video.mp4 -f null -
   ```
   (No output = file is OK)

2. **Try re-encoding with baseline profile** (see command above)

3. **Check browser console** for specific error codes:
   - Error code 3 = Decode error (codec issue)
   - Error code 4 = Format not supported

4. **Test in multiple browsers** to confirm it's not a local issue

### File size too large?

Reduce quality with CRF:
```bash
ffmpeg -i input.mp4 -c:v libx264 -profile:v baseline -crf 28 -c:a aac output.mp4
```
(Higher CRF = smaller file, lower quality. Try 23-28)

---

## Automated Solution

For a web-based conversion service, consider:
- **HandBrake** (GUI application): https://handbrake.fr/
- **CloudConvert** (web service): https://cloudconvert.com/
- **FFmpeg.wasm** (client-side conversion in browser)

---

## References

- FFmpeg Documentation: https://ffmpeg.org/documentation.html
- H.264 Browser Support: https://caniuse.com/mpeg4
- Web Video Best Practices: https://web.dev/fast/#optimize-your-videos

---

*Last updated: November 2025*


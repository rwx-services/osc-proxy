# Assets

## Tray Icon

You need to create `trayIcon.png` for the menu bar icon.

**Requirements:**
- 16x16 or 22x22 pixels (macOS will scale)
- PNG format with transparency
- Simple, monochrome design works best
- Should be visible on both light and dark menu bars

**Quick solution:**
Use an emoji or text as a temporary icon. Update `main.js`:

```javascript
// Replace
tray = new Tray(path.join(__dirname, 'assets', 'trayIcon.png'));

// With (temporary text icon)
const { nativeImage } = require('electron');
const icon = nativeImage.createEmpty();
tray = new Tray(icon);
tray.setTitle('OSC'); // Shows "OSC" in menu bar
```

## App Icon

For distribution, you'll also want `icon.icns`:

**To create:**
1. Create a 1024x1024 PNG icon
2. Use `https://cloudconvert.com/png-to-icns` or:

```bash
# macOS command line
mkdir icon.iconset
sips -z 16 16     icon_1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon_1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon_1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon_1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon_1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon_1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon_1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon_1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon_1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon_1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```

**Icon ideas:**
- OSC waveform
- Network/connection symbol
- Lightning bolt (for lighting control)
- Simple "OSC" text logo

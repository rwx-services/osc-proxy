# OSC Proxy - Electron GUI

Beautiful native macOS application for OSC Proxy with real-time metrics monitoring.

## Features

- 🎨 **Modern Dark UI** - Built with Tailwind CSS, perfect for lighting booth environments
- 📊 **Real-time Metrics** - Live dashboard showing throughput, latency, and packet loss
- 📈 **Performance Graphs** - Sparkline visualization of message rates
- ⚙️ **Easy Configuration** - Visual editor for proxy settings
- 🚀 **Menu Bar App** - Runs in background, accessible from menu bar
- 📦 **Self-contained** - Ruby proxy bundled inside, no dependencies to install

## Quick Start

### Development

```bash
# 1. Install dependencies
cd electron-app
npm install

# 2. Build Tailwind CSS
npm run build:css

# 3. Run the app
npm start
```

### Development with Hot Reload

```bash
# Terminal 1: Watch Tailwind CSS
npm run dev:css

# Terminal 2: Run Electron
npm start
```

## Building for Distribution

```bash
# Build DMG installer
npm run build

# Output: dist-build/OSC Proxy-1.0.0.dmg
```

The DMG will include:
- Electron app bundle
- Ruby proxy (bundled in Resources)
- All dependencies

Users can simply drag to Applications folder and run!

## Project Structure

```
electron-app/
├── main.js              # Electron main process
├── preload.js           # IPC bridge
├── src/
│   ├── index.html       # Main dashboard
│   ├── settings.html    # Settings window
│   ├── js/
│   │   ├── renderer.js  # Dashboard logic
│   │   └── settings.js  # Settings logic
│   └── styles/
│       └── input.css    # Tailwind source
├── dist/
│   └── styles.css       # Compiled Tailwind
└── assets/
    └── icon.icns        # App icon
```

## How It Works

1. **Electron App** launches the Ruby proxy as a child process
2. **Ruby Proxy** outputs metrics as JSON (using `--json` flag)
3. **Electron** parses JSON from STDOUT and updates the UI in real-time
4. **IPC Bridge** provides secure communication between renderer and main process

## Configuration

The app reads/writes YAML configuration files compatible with the Ruby proxy:

```yaml
udp:
  port: 21650
  bind: '127.0.0.1'

tcp:
  host: '127.0.0.1'
  port: 21600
```

Edit via:
- Settings window GUI
- Direct YAML editor
- Config file on disk

## Distribution

### Code Signing (Optional but Recommended)

1. Get an Apple Developer account ($99/year)
2. Get Developer ID certificate
3. Sign the app:

```bash
# Add to package.json build config
"mac": {
  "identity": "Developer ID Application: Your Name (TEAM_ID)"
}
```

### Notarization (For best UX)

```bash
# After building
xcrun notarytool submit "dist-build/OSC Proxy-1.0.0.dmg" \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID" \
  --wait

# Staple the notarization
xcrun stapler staple "dist-build/OSC Proxy-1.0.0.dmg"
```

### USB Distribution

Just copy the DMG to a USB drive! No App Store required.

Users can:
1. Copy DMG from USB
2. Mount DMG
3. Drag app to Applications
4. Double-click to run

**Without code signing:** Users will need to right-click → Open on first launch.
**With code signing:** App opens immediately, no warnings.

## Customization

### Colors

Edit `tailwind.config.js`:

```js
colors: {
  'proxy': {
    dark: '#0f172a',      // Background
    accent: '#10b981',    // Primary color
  }
}
```

### Metrics Update Interval

Edit `main.js`:

```js
// Ruby proxy outputs metrics every 1 second by default
// Controlled by Ruby proxy's --interval flag (if added)
```

### Menu Bar Icon

Replace `assets/trayIcon.png` with your own 16x16 or 22x22 PNG icon.

## Troubleshooting

### App won't start

- Check Console.app for errors
- Ensure Ruby is installed: `ruby --version`
- Check Ruby proxy path in `main.js`

### Metrics not updating

- Check proxy is actually running: Activity Monitor → search "ruby"
- Check Console.app for JSON parsing errors
- Verify `--json` flag is being passed to Ruby proxy

### Build fails

- Ensure you've run `npm run build:css` first
- Check that parent `../bin/osc-proxy` exists
- Verify all Ruby dependencies are in `../vendor`

## License

MIT

## Credits

- Built with [Electron](https://www.electronjs.org/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Ruby proxy by [Your Name]

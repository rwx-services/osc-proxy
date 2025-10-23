# Quick Start Guide

Get the Electron GUI running in 5 minutes!

## Prerequisites

- macOS 10.13 or later
- Node.js 16+ (`node --version`)
- Ruby 3.0+ (already installed for the proxy)

## Step 1: Install Node Dependencies

```bash
cd electron-app
npm install
```

This will install:
- Electron
- Tailwind CSS
- Build tools

## Step 2: Build Tailwind CSS

```bash
npm run build:css
```

This compiles the Tailwind styles to `dist/styles.css`.

## Step 3: Run the App

```bash
npm start
```

The OSC Proxy GUI should launch!

## Step 4: Test It

1. Click "Start" in the GUI
2. The Ruby proxy will start running
3. Send a test message:

```bash
# In another terminal
cd ..
bin/send -p 21650 --udp /test 123
```

4. Watch the metrics update in real-time!

## What You Should See

### Dashboard
- Current Rate showing messages/second
- Latency in milliseconds
- Total messages counted
- Live activity log

### Status Indicator
- 🟢 Green: Connected and forwarding
- 🔴 Red: Starting/disconnected
- ⚪️ Gray: Idle

## Next Steps

### Customize Configuration

1. Click "Settings" button
2. Edit UDP/TCP ports
3. Click "Save Configuration"
4. Restart proxy to apply changes

### Development Mode

For faster iteration:

```bash
# Terminal 1: Auto-rebuild CSS on changes
npm run dev:css

# Terminal 2: Run app (restart after JS changes)
npm start
```

### Build Distributable

```bash
npm run build
```

Creates: `dist-build/OSC Proxy-1.0.0.dmg`

## Troubleshooting

### "Cannot find module 'electron'"

```bash
npm install
```

### "Tailwind styles not loading"

```bash
npm run build:css
```

### "Ruby proxy not starting"

Check that `../bin/osc-proxy` exists:

```bash
ls -la ../bin/osc-proxy
```

Should show the Ruby proxy executable.

### Want to see console logs?

Press `Cmd+Option+I` in the Electron window to open DevTools.

## Tips

1. **Menu Bar**: The app stays running in the menu bar even after closing the window
2. **Quit**: Click the tray icon → Quit to fully exit
3. **JSON Mode**: The proxy runs with `--json` flag to output structured metrics
4. **Config Location**: Default config is `../config/lightkey.yml`

## Help

See the main [README.md](README.md) for full documentation.

# Building OSC Proxy for Distribution

## Quick Start

Use the convenient build script from the project root:

```bash
# Build all formats (DMG + ZIP + unpacked)
bin/build

# Build only portable formats (ZIP + unpacked directory) - fastest
bin/build --portable

# Build only DMG installer
bin/build --dmg

# Show help
bin/build --help
```

## Building for USB Drive (Portable)

To create a portable build that can be copied to a USB drive:

```bash
bin/build --portable
```

Or manually:

```bash
cd electron-app
npm run build:portable
```

This will create:
- `electron-app/dist-build/mac/OSC Proxy.app` or `electron-app/dist-build/mac-arm64/OSC Proxy.app` - Unpacked app directory
- `electron-app/dist-build/OSC Proxy-1.0.0-mac.zip` - ZIP archive for distribution

### For USB Drive Distribution:

**Option 1: ZIP Archive (Recommended)**
- Copy `OSC Proxy-1.0.0-mac.zip` to USB drive
- Users unzip and double-click `OSC Proxy.app` to run
- No installation required

**Option 2: Direct App Copy**
- Copy the `OSC Proxy.app` folder from `dist-build/mac/` (Intel) or `dist-build/mac-arm64/` (Apple Silicon) to USB drive
- Users can drag it to Applications or run directly from USB
- Faster than extracting a ZIP

### Architecture

The build is architecture-specific (Intel or Apple Silicon) because it includes Ruby gems with native extensions. Build on the target architecture:
- Build on Intel Mac → x86_64 build
- Build on Apple Silicon Mac → arm64 build

Both architectures will work on modern macOS versions.

## Building All Formats

To build DMG installer + ZIP + unpacked directory:

```bash
cd electron-app
npm run build
```

This creates:
- `OSC Proxy-1.0.0-mac.zip` - Portable ZIP
- `OSC Proxy-1.0.0.dmg` - DMG installer
- `mac-universal/OSC Proxy.app` - Unpacked app

## What's Included

The build includes:
- Electron app with GUI
- Ruby proxy scripts (bin/, lib/)
- Ruby dependencies (vendor/bundle)
- SQLite database library (better-sqlite3)
- All configuration files

## First Run Notes

On first run, macOS may show a security warning because the app is unsigned. Users should:
1. Right-click (or Control+click) on `OSC Proxy.app`
2. Select "Open"
3. Click "Open" in the security dialog
4. Subsequent launches will work normally

## Code Signing (Optional)

To eliminate the security warning, you can sign the app with an Apple Developer ID:

```bash
# Set your signing identity
export APPLE_ID="your@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
export SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"

# Build with signing
cd electron-app
npm run build
```

Add this to package.json under the "build" section:
```json
"afterSign": "scripts/notarize.js"
```

## Troubleshooting

### Build Fails
- Ensure you have Xcode Command Line Tools installed: `xcode-select --install`
- Make sure all dependencies are installed: `cd electron-app && npm install`

### App Won't Run from USB
- The USB drive must be formatted as Mac OS Extended (HFS+) or APFS
- FAT32/ExFAT may have issues with macOS app bundles
- Consider distributing the ZIP file instead

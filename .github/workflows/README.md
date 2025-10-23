# GitHub Actions Workflows

## Release Workflow

The `release.yml` workflow automatically builds and publishes releases when you push a version tag.

### How to Create a Release

1. **Update the version** in `electron-app/package.json`:
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Commit your changes**:
   ```bash
   git add .
   git commit -m "Release v1.0.0"
   ```

3. **Create and push a version tag**:
   ```bash
   git tag v1.0.0
   git push origin main
   git push origin v1.0.0
   ```

4. **GitHub Actions will automatically**:
   - Build the app for macOS (Intel x86_64)
   - Build the app for macOS (Apple Silicon arm64)
   - Create DMG installers for both architectures
   - Create ZIP archives for both architectures
   - Create a GitHub Release with all build artifacts
   - Generate release notes from commits

### What Gets Built

The workflow creates these files:

**Intel (x86_64):**
- `OSC Proxy-1.0.0.dmg` - DMG installer
- `OSC Proxy-1.0.0-mac.zip` - Portable ZIP

**Apple Silicon (arm64):**
- `OSC Proxy-1.0.0-arm64.dmg` - DMG installer
- `OSC Proxy-1.0.0-arm64.zip` - Portable ZIP

### Release Versions

Follow semantic versioning:
- **Major**: `v2.0.0` - Breaking changes
- **Minor**: `v1.1.0` - New features, backwards compatible
- **Patch**: `v1.0.1` - Bug fixes

### Manual Trigger (Optional)

If you want to trigger a build without creating a release:

1. Go to the Actions tab in GitHub
2. Select the workflow
3. Click "Run workflow"

### Requirements

- The workflow uses `GITHUB_TOKEN` (automatically provided by GitHub)
- No additional secrets or configuration needed
- Works on public and private repositories

### Troubleshooting

**Build fails:**
- Check that `electron-app/package.json` is valid
- Ensure all dependencies are in `package.json`
- Review the Actions log in GitHub for specific errors

**Release not created:**
- Verify the tag follows the format `v*.*.*` (e.g., `v1.0.0`)
- Check that the tag was pushed to GitHub: `git push origin v1.0.0`
- Ensure you have write permissions to the repository

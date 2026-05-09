# Icons

This folder must contain the platform icons referenced in `tauri.conf.json`:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.png` (used by tray)
- `icon.icns` (macOS)
- `icon.ico` (Windows)

You can generate them all from a single source SVG/PNG via:

```bash
npx @tauri-apps/cli icon path/to/source.png
```

A vector source is provided at `../../public/icon.svg`. Run the icon generator
once before the first `npm run app:build`.

#!/bin/bash
# Creates a proper Mac .app bundle for the Workout Admin

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="Workout Admin"
APP_PATH="$HOME/Applications/${APP_NAME}.app"

# Remove old version if exists
rm -rf "$APP_PATH"

# Create .app bundle structure
mkdir -p "$APP_PATH/Contents/MacOS"
mkdir -p "$APP_PATH/Contents/Resources"

# Create the launcher as an AppleScript that opens Terminal
cat > "$APP_PATH/Contents/MacOS/launcher" << 'OUTERSCRIPT'
#!/bin/bash
osascript -e '
tell application "Terminal"
    activate
    do script "cd \"APP_DIR_PLACEHOLDER\" && source ~/.zshrc 2>/dev/null; streamlit run admin.py --server.port 8501"
end tell'
OUTERSCRIPT

# Replace placeholder with actual path
sed -i '' "s|APP_DIR_PLACEHOLDER|$APP_DIR|g" "$APP_PATH/Contents/MacOS/launcher"

chmod +x "$APP_PATH/Contents/MacOS/launcher"

# Create Info.plist
cat > "$APP_PATH/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.workout.admin</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
</dict>
</plist>
PLIST

# Create icon
python3 << 'PYICON'
import struct, zlib, os

size = 256
pixels = []
for y in range(size):
    row = []
    for x in range(size):
        cx, cy = x - size//2, y - size//2
        dist = (cx*cx + cy*cy) ** 0.5
        if dist > 115:
            row.extend([0, 0, 0, 0])
            continue
        bg_r, bg_g, bg_b = 30, 30, 50
        is_bar = abs(cy) < 8 and abs(cx) < 60
        is_left_weight = abs(cx + 50) < 18 and abs(cy) < 35
        is_left_inner = abs(cx + 50) < 12 and abs(cy) < 28
        is_right_weight = abs(cx - 50) < 18 and abs(cy) < 35
        is_right_inner = abs(cx - 50) < 12 and abs(cy) < 28
        if is_bar:
            row.extend([180, 180, 190, 255])
        elif is_left_inner or is_right_inner:
            row.extend([233, 69, 96, 255])
        elif is_left_weight or is_right_weight:
            row.extend([200, 55, 80, 255])
        else:
            row.extend([bg_r, bg_g, bg_b, 255])
    pixels.append(bytes(row))

def create_png(w, h, rows):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''
    for r in rows:
        raw += b'\x00' + r
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

home = os.path.expanduser('~')
icon_dir = f"{home}/Applications/Workout Admin.app/Contents/Resources"
png_path = f"{icon_dir}/AppIcon.png"
with open(png_path, 'wb') as f:
    f.write(create_png(size, size, pixels))

os.system(f'mkdir -p /tmp/workout_icon.iconset')
for s in [16, 32, 64, 128, 256]:
    os.system(f'sips -z {s} {s} "{png_path}" --out "/tmp/workout_icon.iconset/icon_{s}x{s}.png" 2>/dev/null')
    if s <= 128:
        os.system(f'sips -z {s*2} {s*2} "{png_path}" --out "/tmp/workout_icon.iconset/icon_{s}x{s}@2x.png" 2>/dev/null')
os.system(f'iconutil -c icns /tmp/workout_icon.iconset -o "{icon_dir}/AppIcon.icns" 2>/dev/null')
PYICON

echo ""
echo "✅ App created at: $APP_PATH"
echo ""
echo "To add to your Dock:"
echo "  1. Run:  open ~/Applications"
echo "  2. Drag 'Workout Admin' to your Dock"
echo ""

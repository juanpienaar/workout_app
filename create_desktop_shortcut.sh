#!/bin/bash
# Creates a Mac desktop shortcut to launch the Workout Admin

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
SHORTCUT_PATH="$HOME/Desktop/Workout Admin.command"

cat > "$SHORTCUT_PATH" << SCRIPT
#!/bin/bash
cd "$APP_DIR"
echo ""
echo "========================================="
echo "  Workout Admin Dashboard"
echo "  Opening in your browser..."
echo "  Close this window to stop the server"
echo "========================================="
echo ""

# Check streamlit is installed
if ! command -v streamlit &> /dev/null; then
    echo "Installing Streamlit..."
    pip3 install streamlit pandas
fi

streamlit run admin.py --server.port 8501
SCRIPT

chmod +x "$SHORTCUT_PATH"

echo ""
echo "✅ Desktop shortcut created!"
echo "   Double-click 'Workout Admin' on your Desktop to launch."
echo ""

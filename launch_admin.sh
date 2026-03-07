#!/bin/bash
# Launch the Workout Admin Dashboard
cd "$(dirname "$0")"

# Check if streamlit is installed
if ! command -v streamlit &> /dev/null; then
    echo "Streamlit not found. Installing..."
    pip3 install streamlit pandas
fi

echo ""
echo "========================================="
echo "  Workout Admin Dashboard"
echo "========================================="
echo "  Opening in your browser..."
echo "  Press Ctrl+C to stop"
echo "========================================="
echo ""

streamlit run admin.py --server.port 8501

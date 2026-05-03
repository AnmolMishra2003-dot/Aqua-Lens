# 🐟 AquaLens — AI Fish Identification System

A beautiful, production-ready Flask web app that identifies fish species from photos using Claude Vision AI + your custom TFLite model, with real-time geolocation and weather data.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📸 Camera Capture | Real-time camera with front/back toggle |
| 📁 Photo Upload | Drag & drop or file picker |
| 🧠 AI Identification | Claude Vision API (primary) + TFLite (supplementary) |
| 📍 Geolocation | Auto-detects user location |
| 🌤 Live Weather | Temperature, wind speed, conditions via Open-Meteo |
| 🌊 Ocean UI | Animated water background, ocean color palette |
| 📊 Rich Results | Confidence score, habitat, diet, facts, edibility |

---

## 🚀 Quick Start

### 1. Clone / Place Files
```
fish_id/
├── app.py
├── requirements.txt
├── run.sh
├── model/
│   └── fish_model.tflite     ← put your model here
├── templates/
│   └── index.html
└── static/
    ├── css/style.css
    ├── js/app.js
    └── uploads/              ← auto-created
```

### 2. Set API Key
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

### 3. Add Your TFLite Model
```bash
cp fish_model.tflite model/fish_model.tflite
```

### 4. Run
```bash
chmod +x run.sh
./run.sh
```
Or manually:
```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

Open **http://localhost:5000** in your browser.

---

## 🤖 How AI Identification Works

1. **User uploads/captures** a fish photo
2. **TFLite model** (if present) runs local inference for initial signal
3. **Claude Vision API** analyzes the image with location + weather context
4. **Results** include species name, confidence, habitat, diet, facts, and more

### Getting an Anthropic API Key
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Create an account and go to **API Keys**
3. Generate a new key and export it

---

## 🌤 Weather & Location

- **Geolocation**: Uses browser `navigator.geolocation` API (requires HTTPS in production)
- **Reverse Geocoding**: OpenStreetMap Nominatim (free, no API key needed)
- **Weather**: Open-Meteo API (free, no API key needed)

---

## 🔧 TFLite Model Integration

Place `fish_model.tflite` in the `model/` directory. The app auto-detects:
- `tflite-runtime` (lightweight, recommended)
- `tensorflow` (full TF, heavier)

The model input is auto-resized to match its expected dimensions. Output signals are passed to Claude as additional context for improved accuracy.

---

## 📱 Production Deployment

For production, use HTTPS (required for camera/geolocation):

```bash
# With gunicorn
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 app:app

# With nginx as reverse proxy (handles HTTPS)
```

Or deploy to platforms like **Render**, **Railway**, **Fly.io**, or **Heroku**.

Set environment variables:
- `ANTHROPIC_API_KEY` — required
- `FLASK_ENV=production` — disables debug mode

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `flask` | Web framework |
| `anthropic` | Claude Vision API |
| `Pillow` | Image processing |
| `requests` | Weather + geocoding API calls |
| `numpy` | TFLite tensor processing |
| `tflite-runtime` | Lightweight TFLite inference |

---

## 🎨 Design System

- **Primary**: Ocean blues `#0a4f7a` → `#4fa8d8`
- **Background**: Light blue `#e8f4fd`
- **Accent**: Teal `#00b4a2`, Coral `#ff6b6b`, Gold `#f4a623`
- **Fonts**: Playfair Display (headings) + DM Sans (body)
- **Effects**: Animated water waves, floating bubbles, fish animations

---

## 📄 License

MIT — Use freely for educational and commercial projects.

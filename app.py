import os
import base64
import json
import requests
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from PIL import Image

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
app.config['UPLOAD_FOLDER'] = 'static/uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# ── Groq (FREE — no credit card, very fast)
# Get your free key at: https://console.groq.com/keys
# Free limits: 14,400 req/day · 30 req/min · vision supported
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"  # free vision model

tflite_interpreter = None


# ─────────────────────────────────────────────
#  TFLite Loader (optional)
# ─────────────────────────────────────────────
def load_tflite_model():
    global tflite_interpreter
    model_path = os.path.join('model', 'fish_model.tflite')
    if not os.path.exists(model_path):
        print("ℹ️  No TFLite model found. Using Groq vision only.")
        return False
    try:
        try:
            import tflite_runtime.interpreter as tflite
            tflite_interpreter = tflite.Interpreter(model_path=model_path)
        except ImportError:
            import tensorflow as tf
            tflite_interpreter = tf.lite.Interpreter(model_path=model_path)
        tflite_interpreter.allocate_tensors()
        print("✅ TFLite model loaded")
        return True
    except Exception as e:
        print(f"⚠️  TFLite load error: {e}")
        return False


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def image_to_base64(image_path):
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def get_image_media_type(filename):
    ext = filename.rsplit('.', 1)[1].lower()
    return {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'png': 'image/png', 'gif': 'image/gif',
            'webp': 'image/webp'}.get(ext, 'image/jpeg')

def resize_image_if_needed(image_path, max_size_kb=800):
    size_kb = os.path.getsize(image_path) / 1024
    if size_kb <= max_size_kb:
        return image_path
    try:
        img = Image.open(image_path)
        ratio = (max_size_kb / size_kb) ** 0.5
        img = img.resize((int(img.width * ratio), int(img.height * ratio)), Image.LANCZOS)
        resized_path = image_path.rsplit('.', 1)[0] + '_resized.jpg'
        img.save(resized_path, 'JPEG', quality=85)
        return resized_path
    except Exception:
        return image_path

def run_tflite_inference(image_path):
    if tflite_interpreter is None:
        return None
    try:
        import numpy as np
        input_details = tflite_interpreter.get_input_details()
        output_details = tflite_interpreter.get_output_details()
        h, w = input_details[0]['shape'][1], input_details[0]['shape'][2]
        img = Image.open(image_path).convert('RGB').resize((w, h))
        input_data = np.expand_dims(np.array(img, dtype=np.float32) / 255.0, axis=0)
        tflite_interpreter.set_tensor(input_details[0]['index'], input_data)
        tflite_interpreter.invoke()
        return tflite_interpreter.get_tensor(output_details[0]['index'])
    except Exception as e:
        print(f"TFLite inference error: {e}")
        return None


# ─────────────────────────────────────────────
#  Groq Vision — Fish Identification
#  FREE: 14,400 req/day · 30 req/min · no card
#  Key: https://console.groq.com/keys
# ─────────────────────────────────────────────
def identify_fish_with_groq(image_path, filename, lat=None, lon=None, weather=None):
    if not GROQ_API_KEY:
        return {"error": "GROQ_API_KEY not set. Get a FREE key (no credit card) at https://console.groq.com/keys"}

    proc_path = resize_image_if_needed(image_path)
    image_data = image_to_base64(proc_path)
    media_type = get_image_media_type(filename)

    location_context = ""
    if lat and lon:
        location_context = f"\nLocation: Latitude {lat}, Longitude {lon}."
    if weather and not weather.get('error'):
        location_context += (
            f"\nWeather: {weather.get('description', '')}, "
            f"{weather.get('temp', 'N/A')}°C, "
            f"Wind {weather.get('wind_speed', 'N/A')} km/h."
        )

    tflite_hint = ""
    if run_tflite_inference(image_path) is not None:
        tflite_hint = "\nNote: A local TFLite model also processed this image — provide your independent expert analysis."

    prompt = f"""You are a world-class marine biologist and expert fish identification specialist.

Carefully examine the image and identify the fish species shown.{location_context}{tflite_hint}

Respond ONLY with a single valid JSON object — absolutely no markdown, no code fences, no explanation:

{{
  "species_name": "Common English name",
  "scientific_name": "Genus species",
  "confidence": 82,
  "family": "Fish family name",
  "habitat": "Natural habitat description",
  "size_range": "e.g. 30-60 cm",
  "diet": "What this fish eats",
  "conservation_status": "IUCN Red List status or Not Assessed",
  "interesting_facts": ["fact 1", "fact 2", "fact 3"],
  "found_in_region": true,
  "region_note": "Brief note about occurrence near the detected location",
  "identification_features": ["visual feature 1", "visual feature 2", "visual feature 3"],
  "edible": true,
  "culinary_notes": "Cooking/taste notes if edible, else null",
  "warning": "Toxicity or safety warnings, or null"
}}

If no fish is visible or identifiable, return species_name as "No fish detected" with confidence 0."""

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:{media_type};base64,{image_data}"
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ],
        "temperature": 0.2,
        "max_tokens": 1500
    }

    try:
        resp = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=30
        )

        if resp.status_code != 200:
            err = resp.json()
            msg = err.get('error', {}).get('message', resp.text)
            return {"error": f"Groq API error {resp.status_code}: {msg}"}

        raw = resp.json()['choices'][0]['message']['content'].strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split('\n')
            raw = '\n'.join(lines[1:-1] if lines[-1].strip() == '```' else lines[1:])
        if raw.startswith("json"):
            raw = raw[4:].strip()

        return json.loads(raw)

    except json.JSONDecodeError as e:
        return {"error": f"Could not parse response as JSON: {e}"}
    except requests.exceptions.Timeout:
        return {"error": "Groq API request timed out. Please try again."}
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
#  Weather — Open-Meteo (100% free, no key)
# ─────────────────────────────────────────────
WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Icy fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight showers", 81: "Moderate showers", 82: "Heavy showers",
    95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ heavy hail"
}

def get_weather(lat, lon):
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lon}"
            f"&current_weather=true"
            f"&current=relative_humidity_2m,apparent_temperature"
            f"&wind_speed_unit=kmh"
        )
        resp = requests.get(url, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        cw = data.get('current_weather', {})
        current = data.get('current', {})
        wcode = cw.get('weathercode', 0)
        return {
            "temp": cw.get('temperature', 'N/A'),
            "feels_like": current.get('apparent_temperature', 'N/A'),
            "wind_speed": cw.get('windspeed', 'N/A'),
            "wind_direction": cw.get('winddirection', 'N/A'),
            "humidity": current.get('relative_humidity_2m', 'N/A'),
            "description": WEATHER_CODES.get(wcode, f"Code {wcode}"),
            "weathercode": wcode
        }
    except Exception as e:
        return {"error": str(e)}


# ─────────────────────────────────────────────
#  Reverse Geocoding — Nominatim (free, no key)
# ─────────────────────────────────────────────
def get_location_name(lat, lon):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json&zoom=10"
        resp = requests.get(url, headers={"User-Agent": "AquaLens/1.0"}, timeout=6)
        resp.raise_for_status()
        addr = resp.json().get('address', {})
        parts = [
            addr.get('city') or addr.get('town') or addr.get('village') or addr.get('county'),
            addr.get('state'),
            addr.get('country')
        ]
        return ", ".join(p for p in parts if p)
    except Exception:
        return f"{float(lat):.2f}N, {float(lon):.2f}E"


# ─────────────────────────────────────────────
#  Flask Routes
# ─────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/identify', methods=['POST'])
def identify():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    lat = request.form.get('lat')
    lon = request.form.get('lon')

    if not file or file.filename == '':
        return jsonify({'error': 'No image selected'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type. Allowed: png, jpg, jpeg, gif, webp'}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    weather_data = None
    location_name = None
    if lat and lon:
        try:
            weather_data = get_weather(float(lat), float(lon))
            location_name = get_location_name(float(lat), float(lon))
        except Exception as e:
            print(f"Location/weather error: {e}")

    result = identify_fish_with_groq(filepath, filename, lat, lon, weather_data)

    return jsonify({
        'identification': result,
        'weather': weather_data,
        'location_name': location_name,
        'image_url': f'/static/uploads/{filename}'
    })


@app.route('/api/weather', methods=['GET'])
def weather_endpoint():
    lat = request.args.get('lat')
    lon = request.args.get('lon')
    if not lat or not lon:
        return jsonify({'error': 'lat and lon are required'}), 400
    return jsonify({
        'weather': get_weather(float(lat), float(lon)),
        'location_name': get_location_name(float(lat), float(lon))
    })


@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({
        'status': 'ok',
        'ai_engine': f'Groq {GROQ_MODEL} (free)',
        'groq_configured': bool(GROQ_API_KEY),
        'tflite_loaded': tflite_interpreter is not None,
        'weather_api': 'Open-Meteo (free, no key)',
        'geocoding_api': 'Nominatim OSM (free, no key)'
    })


# ─────────────────────────────────────────────
#  Startup
# ─────────────────────────────────────────────
if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    print("\n🐟 ========================================")
    print("   AquaLens - AI Fish Identification")
    print("   Powered by Groq + Llama 4 Scout Vision")
    print("🐟 ========================================\n")

    if not GROQ_API_KEY:
        print("⚠️  GROQ_API_KEY not set!")
        print("   → FREE key (no credit card): https://console.groq.com/keys")
        print("   → Windows PowerShell: $env:GROQ_API_KEY='your-key'")
        print("   → Windows CMD:        set GROQ_API_KEY=your-key\n")
    else:
        masked = GROQ_API_KEY[:8] + "..." + GROQ_API_KEY[-4:]
        print(f"✅ Groq API key: {masked}")

    load_tflite_model()
    print("\n🚀 Server at http://localhost:5000\n")
   app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))

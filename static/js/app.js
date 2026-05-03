/* ============================================
   AquaLens - Frontend Logic
   ============================================ */

let selectedFile = null;
let currentStream = null;
let facingMode = 'environment';
let userLat = null;
let userLon = null;
let stepInterval = null;

// ── Bubble Generator ──
function createBubbles() {
  const container = document.getElementById('bubbles');
  if (!container) return;
  for (let i = 0; i < 18; i++) {
    const b = document.createElement('div');
    b.classList.add('bubble');
    const size = Math.random() * 24 + 8;
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.left = Math.random() * 100 + '%';
    b.style.animationDuration = (Math.random() * 14 + 10) + 's';
    b.style.animationDelay = (Math.random() * 12) + 's';
    container.appendChild(b);
  }
}

// ── State Manager ──
// Ensures only ONE section is ever visible at a time
function showSection(name) {
  // name: 'upload' | 'loading' | 'results' | 'error'
  const uploadCard   = document.getElementById('uploadCard');
  const loadingState = document.getElementById('loadingState');
  const resultsSection = document.getElementById('resultsSection');
  const errorState   = document.getElementById('errorState');

  // Hide everything first
  loadingState.style.display  = 'none';
  resultsSection.style.display = 'none';
  errorState.style.display    = 'none';
  uploadCard.style.opacity    = '1';
  uploadCard.style.pointerEvents = 'auto';

  if (stepInterval) { clearInterval(stepInterval); stepInterval = null; }

  if (name === 'loading') {
    uploadCard.style.opacity = '0.5';
    uploadCard.style.pointerEvents = 'none';
    loadingState.style.display = 'block';
    setTimeout(() => loadingState.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    animateLoadingSteps();
  } else if (name === 'results') {
    resultsSection.style.display = 'block';
    setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth' }), 50);
  } else if (name === 'error') {
    errorState.style.display = 'block';
    setTimeout(() => errorState.scrollIntoView({ behavior: 'smooth' }), 50);
  }
}

// ── Geolocation + Weather ──
function initLocation() {
  if (!navigator.geolocation) {
    document.getElementById('locationText').textContent = 'Location unavailable';
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLon = pos.coords.longitude;
      fetchWeather(userLat, userLon);
    },
    err => {
      document.getElementById('locationText').textContent = 'Location denied';
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function fetchWeather(lat, lon) {
  fetch(`/api/weather?lat=${lat}&lon=${lon}`)
    .then(r => r.json())
    .then(data => {
      if (data.location_name) {
        document.getElementById('locationText').textContent = data.location_name;
      }
      if (data.weather && !data.weather.error) {
        updateWeatherBar(data.weather);
      }
    })
    .catch(() => {});
}

function getWeatherIcon(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  return '⛈️';
}

function updateWeatherBar(w) {
  const bar = document.getElementById('weatherBar');
  bar.style.display = 'block';
  document.getElementById('wIcon').textContent = getWeatherIcon(w.weathercode || 0);
  document.getElementById('wDesc').textContent = w.description || '—';
  document.getElementById('wTemp').textContent = w.temp !== 'N/A' ? `${w.temp}°C` : '—';
  document.getElementById('wWind').textContent = w.wind_speed !== 'N/A' ? `${w.wind_speed} km/h` : '—';
  document.getElementById('wDir').textContent = w.wind_direction !== 'N/A' ? `${w.wind_direction}°` : '—';
}

// ── File Upload ──
document.getElementById('fileInput').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (file) loadImageFile(file);
});

function loadImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please select a valid image file.');
    return;
  }
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => showPreview(e.target.result);
  reader.readAsDataURL(file);
}

function showPreview(src) {
  document.getElementById('placeholder').style.display = 'none';
  const img = document.getElementById('previewImg');
  img.src = src;
  img.style.display = 'block';
  document.getElementById('previewOverlay').style.display = 'block';
  document.getElementById('identifyBtn').disabled = false;
  // Reset to upload section when new image loaded
  showSection('upload');
}

function resetUpload() {
  selectedFile = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('placeholder').style.display = 'flex';
  document.getElementById('previewImg').style.display = 'none';
  document.getElementById('previewImg').src = '';
  document.getElementById('previewOverlay').style.display = 'none';
  document.getElementById('identifyBtn').disabled = true;
}

function resetAll() {
  resetUpload();
  showSection('upload');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Drag & Drop ──
const uploadCard = document.getElementById('uploadCard');
uploadCard.addEventListener('dragover', e => {
  e.preventDefault();
  uploadCard.classList.add('drag-over');
});
uploadCard.addEventListener('dragleave', () => uploadCard.classList.remove('drag-over'));
uploadCard.addEventListener('drop', e => {
  e.preventDefault();
  uploadCard.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) loadImageFile(file);
});

document.getElementById('previewArea').addEventListener('click', e => {
  if (!selectedFile && (
    e.target === document.getElementById('previewArea') ||
    e.target.closest('.preview-placeholder')
  )) {
    document.getElementById('fileInput').click();
  }
});

// ── Camera ──
async function startCamera() {
  document.getElementById('cameraModal').style.display = 'flex';
  await initCamera();
}

async function initCamera() {
  try {
    if (currentStream) currentStream.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    currentStream = stream;
    document.getElementById('videoEl').srcObject = stream;
  } catch (err) {
    alert('Camera access denied or unavailable: ' + err.message);
    stopCamera();
  }
}

function flipCamera() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  initCamera();
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  document.getElementById('cameraModal').style.display = 'none';
}

function capturePhoto() {
  const video = document.getElementById('videoEl');
  const canvas = document.getElementById('captureCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(blob => {
    const file = new File([blob], 'camera_capture.jpg', { type: 'image/jpeg' });
    selectedFile = file;
    showPreview(canvas.toDataURL('image/jpeg', 0.92));
    stopCamera();
  }, 'image/jpeg', 0.92);
}

// ── Fish Identification ──
async function identifyFish() {
  if (!selectedFile) return;

  showSection('loading');

  const formData = new FormData();
  formData.append('image', selectedFile);
  if (userLat && userLon) {
    formData.append('lat', userLat);
    formData.append('lon', userLon);
  }

  try {
    const response = await fetch('/api/identify', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      showSection('error');
      document.getElementById('errorMsg').textContent = data.error || 'Server error. Please try again.';
      return;
    }

    if (data.identification && data.identification.error) {
      showSection('error');
      document.getElementById('errorMsg').textContent = data.identification.error;
      return;
    }

    displayResults(data);

  } catch (err) {
    showSection('error');
    document.getElementById('errorMsg').textContent = err.message || 'Network error. Please try again.';
  }
}

function animateLoadingSteps() {
  const steps = document.querySelectorAll('.step');
  let current = 0;
  steps.forEach(s => s.classList.remove('active', 'done'));
  if (steps.length) steps[0].classList.add('active');

  stepInterval = setInterval(() => {
    if (current < steps.length - 1) {
      steps[current].classList.remove('active');
      steps[current].classList.add('done');
      current++;
      steps[current].classList.add('active');
    }
  }, 1800);
}

function displayResults(data) {
  const id = data.identification;
  if (!id || id.error) {
    showSection('error');
    document.getElementById('errorMsg').textContent = id?.error || 'Could not identify fish.';
    return;
  }

  const confidence = id.confidence || 0;
  document.getElementById('confidenceValue').textContent = confidence;
  document.getElementById('speciesCommon').textContent = id.species_name || 'Unknown Species';
  document.getElementById('speciesScientific').textContent = id.scientific_name || '';

  // Confidence colour
  const header = document.querySelector('.species-header');
  header.classList.remove('conf-high', 'conf-mid', 'conf-low');
  if (confidence >= 75) header.classList.add('conf-high');
  else if (confidence >= 45) header.classList.add('conf-mid');
  else header.classList.add('conf-low');

  // Tags
  const tagsEl = document.getElementById('speciesTags');
  tagsEl.innerHTML = '';
  if (id.family) tagsEl.innerHTML += `<span class="tag">${id.family}</span>`;
  if (id.conservation_status) {
    const s = id.conservation_status;
    const cls = (s.includes('Endangered') || s.includes('Critical')) ? 'danger' : s.includes('Vulnerable') ? 'warning' : 'safe';
    tagsEl.innerHTML += `<span class="tag ${cls}">${s}</span>`;
  }
  if (id.edible !== undefined) {
    tagsEl.innerHTML += `<span class="tag ${id.edible ? 'safe' : 'warning'}">${id.edible ? '🍴 Edible' : '🚫 Not edible'}</span>`;
  }

  // Result image
  document.getElementById('resultImg').src = data.image_url || document.getElementById('previewImg').src;
  document.getElementById('regionBadge').style.display = id.found_in_region ? 'block' : 'none';

  // Quick stats
  document.getElementById('statHabitat').textContent = id.habitat || '—';
  document.getElementById('statSize').textContent = id.size_range || '—';
  document.getElementById('statDiet').textContent = id.diet || '—';
  document.getElementById('statConservation').textContent = id.conservation_status || 'Not assessed';
  document.getElementById('statEdible').textContent = id.edible === true ? 'Yes' : id.edible === false ? 'No' : '—';
  document.getElementById('statFamily').textContent = id.family || '—';

  // Features
  const featureList = document.getElementById('featureList');
  featureList.innerHTML = (id.identification_features || []).map(f => `<li>${f}</li>`).join('');

  // Facts
  const factsList = document.getElementById('factsList');
  factsList.innerHTML = (id.interesting_facts || []).map(f => `<li>${f}</li>`).join('');

  // Bottom notes
  const bottomNotes = document.getElementById('bottomNotes');
  bottomNotes.innerHTML = '';
  if (id.culinary_notes && id.edible) {
    bottomNotes.innerHTML += `<div class="note-chip culinary"><span>🍽️</span><span><strong>Culinary:</strong> ${id.culinary_notes}</span></div>`;
  }
  if (id.warning) {
    bottomNotes.innerHTML += `<div class="note-chip warning-chip"><span>⚠️</span><span><strong>Warning:</strong> ${id.warning}</span></div>`;
  }
  if (id.region_note) {
    bottomNotes.innerHTML += `<div class="note-chip"><span>📍</span><span>${id.region_note}</span></div>`;
  }

  // Context bar
  const contextBar = document.getElementById('contextBar');
  const weather = data.weather;
  const locationName = data.location_name;
  if (locationName || weather) {
    contextBar.style.display = 'flex';
    document.getElementById('ctxLocation').textContent = locationName || '—';
    if (weather && !weather.error) {
      document.getElementById('ctxWeather').textContent = weather.description || '—';
      document.getElementById('ctxTemp').textContent = weather.temp !== 'N/A' ? `${weather.temp}°C · Wind ${weather.wind_speed} km/h` : '—';
    }
  } else {
    contextBar.style.display = 'none';
  }

  showSection('results');
  animateCounter('confidenceValue', 0, confidence, 1200);
}

function animateCounter(id, from, to, duration) {
  const el = document.getElementById(id);
  const start = performance.now();
  function update(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (p < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  createBubbles();
  initLocation();
});

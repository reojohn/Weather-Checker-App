// ===== CONFIG =====
const apiKey = "d342be70540ded35799d0bf7b0c2a62d"; // OpenWeather API key
let map; // Google Maps instance
let marker; // single map marker
let clockTimer = null; // live clock interval tied to city
let currentUnit = "metric"; // default Celsius, can be "metric" or "imperial"

// --- internal for sun path animation control ---
let _sunPathAnimationId = null; // store requestAnimationFrame ID for sun diagram

// Track if a weather-driven sun update already happened
let _sunInitializedFromWeather = false; // flag to prevent multiple sun updates

// ===== SUN DATA & DIAGRAM =====
async function updateSunData(lat, lon, timezoneOffsetSeconds = 0) {
  try {
    const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`);
    if (!resp.ok) throw new Error("Could not fetch sun data from API");

    const d = await resp.json();
    if (!d.sys) throw new Error("Sun data not found in API response");
const sunriseUnix = d.sys.sunrise; // UTC seconds
const sunsetUnix = d.sys.sunset;   // UTC seconds
const tzSec = d.timezone ?? timezoneOffsetSeconds ?? 0;

// Save to globals for resize
_currentSunrise = new Date((sunriseUnix + tzSec) * 1000);
_currentSunset  = new Date((sunsetUnix + tzSec) * 1000);

    const fmtLocal = (utcSeconds) => {
      const cityTime = new Date((utcSeconds + tzSec) * 1000);
      const hh = cityTime.getUTCHours();
      const mm = cityTime.getUTCMinutes();
      const ampm = hh >= 12 ? "PM" : "AM";
      let h12 = hh % 12;
      if (h12 === 0) h12 = 12;
      return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
    };

    const sunriseStr = fmtLocal(sunriseUnix);
    const noonStr = fmtLocal((sunriseUnix + sunsetUnix) / 2);
    const sunsetStr = fmtLocal(sunsetUnix);

    const infoEl = document.querySelector(".sun-info");
    if (infoEl) {
      infoEl.innerHTML = `☀️ Sunrise: ${sunriseStr} | 🌞 Noon: ${noonStr} | 🌇 Sunset: ${sunsetStr}`;
    }

    const nowUTC = Date.now() / 1000;
    const cityNowUTC = nowUTC + tzSec;
    const cityNowDate = new Date(cityNowUTC * 1000);

    const sunriseDate = new Date((sunriseUnix + tzSec) * 1000);
    const sunsetDate = new Date((sunsetUnix + tzSec) * 1000);

    drawAdvancedSunPath(sunriseDate, sunsetDate, cityNowDate);

  } catch (err) {
    console.error("Sun data error:", err);
    alert("Could not fetch sun data. Please check your internet connection and try again.");
  }
}



// Expose function globally for inline/onload usage
window.updateSunData = updateSunData;

// ===== TEMPERATURE UNIT TOGGLE =====
const unitDropdown = document.getElementById("tempUnit"); // your dropdown element
if (unitDropdown) {
  unitDropdown.addEventListener("change", () => {
    // Update currentUnit based on dropdown selection
    currentUnit = unitDropdown.value === "imperial" ? "imperial" : "metric";

    // Fetch and update main city weather
    searchWeather();

    // Update other city cards
    updateOtherCitiesWeather();
  });
}


// Tiny wrapper for inline onchange="changeUnit()" in HTML
function changeUnit() {
  if (unitToggle) unitToggle.dispatchEvent(new Event('change'));
}
window.changeUnit = changeUnit;

// ===== SEARCH WEATHER BY CITY =====
// ===== SEARCH WEATHER BY CITY =====
async function searchWeather() {
  const city = document.getElementById("cityInput").value.trim();
  if (!city) return alert("Please enter a city name.");

  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${currentUnit}`
    );

    let payload;
    try { payload = await response.json(); } catch { payload = {}; }

    // Check if city does not exist
    if (response.status === 404) {
      return alert("City not found. Please check the spelling and try again.");
    }

    // Any other API error
    if (!response.ok) {
      throw new Error(payload.message || "API error");
    }

    // Success
    displayWeather(payload);        // Show main weather
    get5DayForecast(city);          // Show forecast
    updateWeatherAlerts(payload.coord?.lat, payload.coord?.lon);
    updateOtherCitiesWeather();     // Refresh other cities

  } catch (error) {
    // Network error or fetch failed
    console.error("Weather fetch error:", error);
    alert("Could not fetch data. Please check your internet connection and try again.");
  }
}






// ====== CLICKABLE CITY CARDS FUNCTIONALITY ======
document.querySelectorAll('.city-card').forEach(card => {
  card.addEventListener('click', () => {
    const cityName = card.getAttribute('data-city');
    if (cityName) {
      document.getElementById('cityInput').value = cityName; // Update input
      searchWeather(cityName); // Trigger search
    }
  });
});

// ===== USE CURRENT LOCATION =====
async function useMyLocation() {
  if (!navigator.geolocation) return alert("Geolocation is not supported.");
  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    try {
      const weatherRes = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=${currentUnit}`
      );
      let weatherData;
      try { weatherData = await weatherRes.json(); } catch { weatherData = {}; }
      if (!weatherRes.ok) throw new Error(weatherData.message || "Unable to fetch weather for your location");

      const cityName = weatherData.name || "";
      document.getElementById("cityInput").value = cityName; // update input for unit toggle
      displayWeather(weatherData); // Show weather
      get5DayForecast(cityName);   // Show forecast
    } catch (error) {
      alert(error.message);
    }
  });
}


// ===== DISPLAY MAIN WEATHER DATA =====
function displayWeather(data) {
  const tempUnit = currentUnit === "metric" ? "°C" : "°F";
  const speedUnit = currentUnit === "metric" ? "km/h" : "mph";

  // City and country header
  document.querySelector(".city-country-header h1").textContent =
    `${data.name}, ${data.sys.country}`;

  // Left column: temperature and weather description
  document.querySelector(".left-column h3").textContent = `${Math.round(data.main.temp)}${tempUnit}`;
  document.querySelector(".left-column p:nth-of-type(2)").textContent =
    capitalizeFirstLetter(data.weather[0].description);

  // Weather icon
  const iconCode = data.weather[0].icon.toLowerCase();
  document.querySelector(".left-column img").src =
    `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  document.querySelector(".left-column img").alt = data.weather[0].description;

  // Right column: humidity, wind, feels like, visibility, UV
  document.querySelector(".right-column p:nth-of-type(1)").textContent =
    `Humidity: ${data.main.humidity}%`;

  const windSpeed = currentUnit === "metric" ? (data.wind.speed * 3.6).toFixed(1) : data.wind.speed.toFixed(1);
  document.querySelector(".right-column p:nth-of-type(2)").textContent =
    `Wind Speed: ${windSpeed} ${speedUnit}`;
  document.querySelector(".right-column p:nth-of-type(3)").textContent =
    `Feels Like: ${Math.round(data.main.feels_like)}${tempUnit}`;
  document.querySelector(".right-column p:nth-of-type(4)").textContent =
    `UV Index: N/A`;
  document.querySelector(".right-column p:nth-of-type(5)").textContent =
    `Visibility: ${(data.visibility / 1000).toFixed(1)} km`;

  // Start live clock
  if (typeof data.dt === "number" && typeof data.timezone === "number") {
    startClockFromDt(data.dt, data.timezone);
  }

  // Update map, sun diagram, and sidebar stats if coordinates exist
  if (data.coord && typeof data.coord.lat === "number" && typeof data.coord.lon === "number") {
    updateMap(data.coord.lat, data.coord.lon);
    updateSunData(data.coord.lat, data.coord.lon, data.timezone); // pass timezone
    _sunInitializedFromWeather = true;

    // ✅ Update sidebar stats
    updateSidebarStats(data);
  }
}


// ===== 5-DAY FORECAST =====
async function get5DayForecast(city) {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${currentUnit}`
    );
    if (!response.ok) throw new Error("Failed to fetch 5-day forecast");

    const data = await response.json();
    const forecastBox = document.querySelector(".forecast-box");
    forecastBox.innerHTML = ""; // Clear old forecast cards

    const dailyForecasts = data.list.filter(f => f.dt_txt.includes("12:00:00"));
    dailyForecasts.slice(0, 5).forEach(f => {
      const dayDiv = document.createElement("div");
      dayDiv.classList.add("day");
      dayDiv.innerHTML = `
        <p>${new Date(f.dt * 1000).toLocaleDateString("en-US", { weekday: "short" })}</p>
        <p>${Math.round(f.main.temp)}${currentUnit === "metric" ? "°C" : "°F"}</p>
        <img src="https://openweathermap.org/img/wn/${f.weather[0].icon}@2x.png" width="50" alt="${f.weather[0].description}">
        <p>${capitalizeFirstLetter(f.weather[0].description)}</p>
      `;
      forecastBox.appendChild(dayDiv);
    });

  } catch (error) {
    console.error("Forecast error:", error);
    const forecastBox = document.querySelector(".forecast-box");
    if (forecastBox) forecastBox.textContent = "Could not load forecast. Please try again.";
  }
}


// ===== GOOGLE MAPS =====
// Initialize Google Map at a default location or provided lat/lon
function initMap(lat = 14.5995, lon = 120.9842) {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat, lng: lon }, // set map center
    zoom: 8, // default zoom level
  });

  // Place a marker on the map
  marker = new google.maps.Marker({
    position: { lat, lng: lon },
    map: map,
    title: "Current Location", // tooltip text
  });
}

// Update map center and marker for a new location
function updateMap(lat, lon) {
  if (!map) return initMap(lat, lon); // initialize if not yet created

  map.setCenter({ lat, lng: lon }); // move map center
  map.setZoom(8); // ensure zoom

  if (marker) {
    marker.setPosition({ lat, lng: lon }); // move existing marker
    marker.setTitle("Selected Location"); // update tooltip
  } else {
    // create marker if missing
    marker = new google.maps.Marker({
      position: { lat, lng: lon },
      map: map,
      title: "Selected Location",
    });
  }
}

// ===== HELPER =====
// Capitalizes the first letter of a string
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ===== THEME TOGGLE =====
const themeToggleBtn = document.getElementById("theme-toggle");
themeToggleBtn.addEventListener("click", () => {
  document.body.classList.toggle("light-mode"); // toggle class

  if (document.body.classList.contains("light-mode")) {
    // Light mode active
    themeToggleBtn.textContent = "🌙 Dark Mode"; // offer switch to dark
    document.documentElement.style.setProperty('--bg-color', '#f4f4f4');
    document.documentElement.style.setProperty('--text-color', '#1a2a35');
    document.documentElement.style.setProperty('--card-bg', '#ffffff');
    document.documentElement.style.setProperty('--accent-color', '#3498db');
    document.documentElement.style.setProperty('--border-color', '#ccc');
  } else {
    // Dark mode active
    themeToggleBtn.textContent = "☀️ Light Mode"; // offer switch to light
    document.documentElement.style.setProperty('--bg-color', '#1a2a35');
    document.documentElement.style.setProperty('--text-color', '#e0e0e0');
    document.documentElement.style.setProperty('--card-bg', '#223340');
    document.documentElement.style.setProperty('--accent-color', '#3498db');
    document.documentElement.style.setProperty('--border-color', '#3f5160');
  }
});





// ===== SIDEBAR NAV INTERACTION =====
const navLinks = document.querySelectorAll('.nav-links a');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault(); 
    navLinks.forEach(l => l.classList.remove('active')); // remove active from all
    link.classList.add('active'); // set clicked link active

    const targetText = link.textContent.trim();
    if (targetText === "🏠 Home") window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (targetText === "🌦️ Forecast") {
      document.querySelector('.forecast-container').scrollIntoView({ behavior:  'smooth' });
    }
    else if (targetText === "🗺️ Map") {
      document.querySelector('.weather-map-container').scrollIntoView({ behavior: 'smooth' });
    }
    else if (targetText === "📍 Locations") {
      document.querySelector('.other-cities-container').scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ===== UTILS: Canvas prepare for high DPI & responsive sizes =====
function prepareCanvasForDraw(canvas) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));

  // Reuse if dimensions unchanged
  if (canvas._lastCssW === cssW && canvas._lastCssH === cssH && canvas._lastDpr === dpr) {
    return { cssW, cssH, ctx: canvas.getContext('2d'), dpr };
  }

  // Set element CSS size (keeps layout) and backing store to device pixel ratio
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // scale drawing to CSS pixels

  canvas._lastCssW = cssW;
  canvas._lastCssH = cssH;
  canvas._lastDpr = dpr;

  return { cssW, cssH, ctx, dpr };
}

// ===== ADVANCED SUN PATH DRAWING =====
function drawAdvancedSunPath(sunriseUTC, sunsetUTC, cityNowDate = new Date()) {
  const canvas = document.getElementById("sunPathCanvas");
  if (!canvas) return;

  // Cancel previous animation if exists
  if (_sunPathAnimationId) {
    cancelAnimationFrame(_sunPathAnimationId);
    _sunPathAnimationId = null;
  }

  function render() {
    const prepared = prepareCanvasForDraw(canvas);
    if (!prepared) return;
    const { cssW: width, cssH: height, ctx } = prepared;

    // Determine radius and center for sun arc
    const padding = Math.max(12, Math.round(width * 0.03));
    const maxRadiusW = (width - padding * 2) / 2;
    const maxRadiusH = (height - padding * 2) / 2;
    let radius = Math.min(maxRadiusW, maxRadiusH);
    radius = Math.max(10, Math.floor(radius * 0.88));
    const centerX = width / 2;
    let baseY = Math.round(height / 2 + radius * 0.35);
    baseY = Math.min(height - padding, Math.max(padding + radius, baseY));

    ctx.clearRect(0, 0, width, height); // clear previous frame

    // Sky gradient based on theme
    const isLightMode = document.body.classList.contains("light-mode");
    const skyGradient = ctx.createLinearGradient(0, 0, 0, height);
    if (isLightMode) {
      skyGradient.addColorStop(0, "#87CEFA");
      skyGradient.addColorStop(0.7, "#B0E0E6");
      skyGradient.addColorStop(1, "#fffacd");
    } else {
      skyGradient.addColorStop(0, "#1a2a35");
      skyGradient.addColorStop(0.7, "#223340");
      skyGradient.addColorStop(1, "#445566");
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw baseline
    ctx.beginPath();
    ctx.moveTo(padding, baseY);
    ctx.lineTo(width - padding, baseY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = isLightMode ? "#888" : "#bbb";
    ctx.stroke();

    // Draw sun arc
    ctx.beginPath();
    ctx.arc(centerX, baseY, radius, Math.PI, 0, false);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#FFD700";
    ctx.stroke();

    //  use the city’s current time instead of device time
    const nowMs = cityNowDate.getTime();

    const sunriseMs = (sunriseUTC instanceof Date) ? sunriseUTC.getTime() : new Date(sunriseUTC).getTime();
    const sunsetMs  = (sunsetUTC instanceof Date) ? sunsetUTC.getTime()  : new Date(sunsetUTC).getTime();

    let totalDuration = sunsetMs - sunriseMs;
    if (totalDuration <= 0) totalDuration += 24 * 3600 * 1000;
    let elapsed = nowMs - sunriseMs;
    if (elapsed < 0) elapsed += 24 * 3600 * 1000;
    elapsed = Math.max(0, Math.min(elapsed, totalDuration));
    const progress = totalDuration > 0 ? (elapsed / totalDuration) : 0;

    const angle = Math.PI * (1 - progress);
    const sunX = centerX + radius * Math.cos(angle);
    const sunY = baseY - radius * Math.sin(angle);

    // Draw sun with radial gradient
    const sunRadius = Math.max(6, Math.round(radius * 0.12));
    const sunGradient = ctx.createRadialGradient(sunX, sunY, Math.max(1, sunRadius * 0.2), sunX, sunY, sunRadius * 2);
    if (isLightMode) {
      sunGradient.addColorStop(0, "#FFFACD");
      sunGradient.addColorStop(1, "rgba(255,215,0,0.35)");
    } else {
      sunGradient.addColorStop(0, "#FFE066");
      sunGradient.addColorStop(1, "rgba(255,165,0,0.35)");
    }
    ctx.fillStyle = sunGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw labels
    ctx.fillStyle = isLightMode ? "#333" : "#eee";
    ctx.font = `${Math.max(10, Math.round(radius * 0.12))}px Arial`;
    ctx.textBaseline = "top";
    const sunriseLabelX = Math.max(6, Math.round(centerX - radius - 6));
    const sunsetLabelX  = Math.min(width - 60, Math.round(centerX + radius - 30));
    ctx.fillText("Sunrise", sunriseLabelX, baseY + 8);
    ctx.fillText("Sunset", sunsetLabelX, baseY + 8);

    // Loop animation
    _sunPathAnimationId = requestAnimationFrame(render);
  }

  render();
}

let _currentSunrise = null;
let _currentSunset = null;


window.addEventListener("resize", () => {
  if (_sunInitializedFromWeather && _currentSunrise && _currentSunset) {
    drawAdvancedSunPath(_currentSunrise, _currentSunset, new Date());
  }
});

// expose drawing function globally
window.drawAdvancedSunPath = drawAdvancedSunPath;

// ===== LIVE CLOCK =====
function startClockFromDt(dtUnix, timezoneOffsetSeconds) {
  if (clockTimer) clearInterval(clockTimer);

  const serverDiffMs = (typeof dtUnix === "number") ? (dtUnix * 1000 - Date.now()) : 0;

  function tick() {
    const nowCorrectedMs = Date.now() + serverDiffMs;
    const cityLocalMs = nowCorrectedMs + (timezoneOffsetSeconds * 1000);
    const t = new Date(cityLocalMs);

    let h = t.getUTCHours();
    const m = t.getUTCMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;

    const clockEl = document.querySelector(".main-city-clock");
    if (clockEl) clockEl.textContent = `${h}:${String(m).padStart(2, "0")} ${ampm}`;
  }

  tick();
  clockTimer = setInterval(tick, 1000);
}

// ===== DOMCONTENTLOADED: INITIALIZE SUN IF NO WEATHER YET =====
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (!_sunInitializedFromWeather) {
      updateSunData(14.5995, 120.9842, 0); // Manila default
    }
  }, 0);
});

// ===== DOMCONTENTLOADED: CREATE SUN CANVAS IF MISSING =====
document.addEventListener("DOMContentLoaded", () => {
  const existing = document.getElementById("sunPathCanvas");
  if (existing) {
    const info = document.querySelector(".sun-info");
    if (info && !info.textContent.trim()) info.textContent = "Loading sun data...";
    return;
  }
  const container = document.querySelector(".weather-map-container");
  if (container) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("sunpath-wrapper");
    wrapper.innerHTML = `
      <h3 style="text-align:center;margin-bottom:8px;">☀️ Sun Path Diagram</h3>
      <canvas id="sunPathCanvas" width="400" height="200" style="border:1px solid #ccc; display:block; margin:0 auto;"></canvas>
      <p class="sun-info" style="text-align:center; margin-top:5px;">Loading sun data...</p>
    `;
    container.appendChild(wrapper);
  }
});

// ===== WEATHER ALERTS =====
async function updateWeatherAlerts(lat, lon) {
  const alertEl = document.getElementById("weatherAlert");
  if (!alertEl) return;

  try {
    const resp = await fetch(`https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}`);
    const data = await resp.json();

    if (data.alerts && data.alerts.length > 0) {
      const alertMessages = data.alerts.map(a => `${a.event} - ${a.severity || "Moderate"}`).join(", ");
      alertEl.textContent = `Ongoing: ${alertMessages}`;
    } else {
      alertEl.textContent = "No ongoing weather alerts.";
    }
  } catch (err) {
    console.error("Weather alerts error:", err);
    alertEl.textContent = "Unable to load alerts.";
  }
}


function getCityTime(timezoneOffsetSeconds) {
  const now = new Date(); // current local time
  // convert to UTC + city timezone
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000); 
  const cityTime = new Date(utc + timezoneOffsetSeconds * 1000);

  let h = cityTime.getUTCHours();
  let m = cityTime.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;

  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
}


// ===== OTHER CITIES LIVE WEATHER =====
async function updateOtherCitiesWeather() {
  const cards = document.querySelectorAll(".city-card");
  if (!cards.length) return;

  for (const card of cards) {
    const city = card.getAttribute("data-city");
    if (!city) continue;

    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=${currentUnit}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "City not found");

      card.querySelector(".temp").textContent = `${Math.round(data.main.temp)}${currentUnit === "metric" ? "°C" : "°F"}`;
      card.querySelector(".weather").textContent = capitalizeFirstLetter(data.weather[0].description);
      const iconEl = card.querySelector(".weather-icon");
      if (iconEl) {
        iconEl.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        iconEl.alt = data.weather[0].description;
      }

    } catch (err) {
      console.error("Other city update error:", city, err);
      card.querySelector(".temp").textContent = "N/A";
      card.querySelector(".weather").textContent = "Could not load";
      const iconEl = card.querySelector(".weather-icon");
      if (iconEl) iconEl.src = ""; 
    }
  }
}



// Refresh the other cities every 5 minutes automatically
setInterval(updateOtherCitiesWeather, 5 * 60 * 1000);

// Run once after DOM is ready
document.addEventListener("DOMContentLoaded", updateOtherCitiesWeather);

async function fetchUVIndex(lat, lon) {
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,alerts&appid=${apiKey}&units=${currentUnit}`
    );
    const data = await response.json();
    return data.current?.uvi ?? "N/A";
  } catch (err) {
    console.error("UV index fetch error:", err);
    return "N/A";
  }
}




function updateSidebarStats(data) {
  const speedUnit = currentUnit === "metric" ? "km/h" : "mph";
  const windSpeed = currentUnit === "metric" ? (data.wind.speed * 3.6).toFixed(1) : data.wind.speed.toFixed(1);

  const html = `
    <table>
      <tr>
        <th>Humidity</th>
        <td>${data.main.humidity}%</td>
      </tr>
      <tr>
        <th>Wind</th>
        <td>${windSpeed} ${speedUnit}</td>
      </tr>
      <tr>
        <th>Tip</th>
        <td>${generateWeatherTip(data)}</td>
      </tr>
    </table>
  `;

  const statsEl = document.getElementById("weatherStats");
  statsEl.innerHTML = html;

  //  update text colors based on theme
  if (document.body.classList.contains("light-mode")) {
    statsEl.style.color = "#111";          // dark text for readability
    statsEl.querySelectorAll("th").forEach(el => el.style.color = "#111"); 
    statsEl.querySelectorAll("td").forEach(el => el.style.color = "#111");
  } else {
    statsEl.style.color = "#eee";          // light text for dark mode
    statsEl.querySelectorAll("th").forEach(el => el.style.color = "#eee"); 
    statsEl.querySelectorAll("td").forEach(el => el.style.color = "#eee");
  }
}


//  Generate a friendly weather tip based on current data
function generateWeatherTip(data) {
  const tempC = data.main.temp;
  const humidity = data.main.humidity;
  const windKmh = currentUnit === "metric" ? data.wind.speed * 3.6 : data.wind.speed;
  const condition = data.weather[0].main.toLowerCase();

  // Tips array
  const tips = [];

  // Temperature-based tips
  if (tempC <= 10) tips.push("It's cold, wear a jacket!");
  else if (tempC >= 30) tips.push("Hot day, stay hydrated!");

  // Rain/Snow tips
  if (condition.includes("rain")) tips.push("Bring an umbrella ☔");
  if (condition.includes("snow")) tips.push("Wear warm clothes and boots ❄️");

  // Humidity tips
  if (humidity > 80) tips.push("High humidity, stay cool!");

  // Wind tips
  if (windKmh > 20) tips.push("Windy outside, secure loose items 🌬️");

  // Default tip if none matched
  if (tips.length === 0) tips.push("Enjoy the weather! 😎");

  // Join multiple tips nicely
  return tips.join(" ");
}


// At the bottom of your JS
function updateThemeButtonText() {
  if (document.body.classList.contains("light-mode")) {
    themeToggleBtn.textContent = "🌙 Dark Mode";
  } else {
    themeToggleBtn.textContent = "☀️ Light Mode";
  }
}

// Run once at page load
updateThemeButtonText();


// Smooth scroll for sidebar nav links
document.querySelectorAll('.nav-links a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

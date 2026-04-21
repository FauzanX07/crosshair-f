// Crosshair F - Overlay renderer
// Draws the crosshair using SVG. Updates whenever settings change.

const overlay = document.getElementById('overlay');
let currentSettings = null;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function buildShape(s) {
  // Returns SVG element string (inner content) for the chosen shape
  const half = s.size / 2;
  const t = Math.max(0.5, s.thickness);
  const gap = Math.max(0, s.gapSize);
  const color = s.color;
  const outline = s.outline ? s.outlineColor : 'none';
  const ow = s.outline ? s.outlineThickness : 0;

  // We use stroke for outline; base stroke = color, outer stroke = outline drawn first
  // Simple approach: draw outline shape behind, then color shape

  let inner = '';

  switch (s.shape) {
    case 'dot': {
      const r = Math.max(1, s.size / 4);
      inner += `<circle cx="0" cy="0" r="${r + ow}" fill="${outline}" />`;
      inner += `<circle cx="0" cy="0" r="${r}" fill="${color}" opacity="${s.opacity / 100}" />`;
      break;
    }
    case 'cross': {
      // 4 lines: top, bottom, left, right with gap from center
      const lines = [
        [0, -gap, 0, -half],
        [0, gap, 0, half],
        [-gap, 0, -half, 0],
        [gap, 0, half, 0]
      ];
      if (s.outline) {
        for (const [x1, y1, x2, y2] of lines) {
          inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow * 2}" stroke-linecap="square" />`;
        }
      }
      for (const [x1, y1, x2, y2] of lines) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity / 100}" />`;
      }
      break;
    }
    case 't': {
      // T shape: bottom + left + right (no top arm)
      const lines = [
        [0, gap, 0, half],
        [-gap, 0, -half, 0],
        [gap, 0, half, 0]
      ];
      if (s.outline) {
        for (const [x1, y1, x2, y2] of lines) {
          inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow * 2}" stroke-linecap="square" />`;
        }
      }
      for (const [x1, y1, x2, y2] of lines) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity / 100}" />`;
      }
      break;
    }
    case 'circle': {
      const r = Math.max(2, half);
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
      }
      inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      break;
    }
    case 'hybrid': {
      // Cross + circle around it
      const r = Math.max(2, half);
      const lines = [
        [0, -gap, 0, -half * 0.6],
        [0, gap, 0, half * 0.6],
        [-gap, 0, -half * 0.6, 0],
        [gap, 0, half * 0.6, 0]
      ];
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        for (const [x1, y1, x2, y2] of lines) {
          inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow * 2}" stroke-linecap="square" />`;
        }
      }
      inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      for (const [x1, y1, x2, y2] of lines) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity / 100}" />`;
      }
      break;
    }
    case 'scope': {
      // Big circle + small inner circle + crosshair
      const rOuter = half;
      const rInner = half * 0.25;
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${rOuter}" fill="none" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        inner += `<circle cx="0" cy="0" r="${rInner}" fill="none" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        inner += `<line x1="${-rOuter}" y1="0" x2="${-rInner - 2}" y2="0" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        inner += `<line x1="${rInner + 2}" y1="0" x2="${rOuter}" y2="0" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        inner += `<line x1="0" y1="${-rOuter}" x2="0" y2="${-rInner - 2}" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
        inner += `<line x1="0" y1="${rInner + 2}" x2="0" y2="${rOuter}" stroke="${outline}" stroke-width="${t + ow * 2}" />`;
      }
      inner += `<circle cx="0" cy="0" r="${rOuter}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      inner += `<circle cx="0" cy="0" r="${rInner}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      inner += `<line x1="${-rOuter}" y1="0" x2="${-rInner - 2}" y2="0" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      inner += `<line x1="${rInner + 2}" y1="0" x2="${rOuter}" y2="0" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      inner += `<line x1="0" y1="${-rOuter}" x2="0" y2="${-rInner - 2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      inner += `<line x1="0" y1="${rInner + 2}" x2="0" y2="${rOuter}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity / 100}" />`;
      break;
    }
    case 'sniper': {
      // Sniper rangefinder with multiple horizontal tick marks below center for elevation holdover
      const tick = half * 0.6;
      const draws = [];
      // main vertical
      draws.push([0, -half, 0, half]);
      // horizontal main
      draws.push([-half, 0, -gap, 0]);
      draws.push([gap, 0, half, 0]);
      // ranging tick marks below center
      for (let i = 1; i <= 4; i++) {
        const y = (half / 4) * i;
        const w = tick - (i * 2);
        draws.push([-w / 2, y, w / 2, y]);
      }
      if (s.outline) {
        for (const [x1, y1, x2, y2] of draws) {
          inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow * 2}" stroke-linecap="square" />`;
        }
      }
      for (const [x1, y1, x2, y2] of draws) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity / 100}" />`;
      }
      break;
    }
    case 'custom': {
      // handled separately below, return empty
      break;
    }
    default: break;
  }

  // center dot on top
  if (s.centerDot) {
    const cdr = Math.max(0.5, s.centerDotSize);
    if (s.outline) {
      inner += `<circle cx="0" cy="0" r="${cdr + ow}" fill="${outline}" />`;
    }
    inner += `<circle cx="0" cy="0" r="${cdr}" fill="${s.centerDotColor}" opacity="${s.opacity / 100}" />`;
  }

  return inner;
}

function render(s) {
  if (!s) return;
  currentSettings = s;

  // Compute center point of viewport with offsets
  const cx = window.innerWidth / 2 + (s.offsetX || 0);
  const cy = window.innerHeight / 2 + (s.offsetY || 0);

  // ViewBox sized for the crosshair plus buffer for outline + scope ranging
  const buffer = Math.max(20, (s.outlineThickness || 0) * 4);
  const box = (s.size || 32) * 2 + buffer;

  let svgInner;

  if (s.shape === 'custom' && s.customImage) {
    // Render custom image at requested size, with rotation
    svgInner = `<image x="${-s.size / 2}" y="${-s.size / 2}" width="${s.size}" height="${s.size}" href="${s.customImage}" opacity="${s.opacity / 100}" preserveAspectRatio="xMidYMid meet" />`;
    if (s.centerDot) {
      const cdr = Math.max(0.5, s.centerDotSize);
      svgInner += `<circle cx="0" cy="0" r="${cdr}" fill="${s.centerDotColor}" opacity="${s.opacity / 100}" />`;
    }
  } else {
    svgInner = buildShape(s);
  }

  const rotation = s.rotation || 0;

  overlay.innerHTML = `
    <svg width="${box}" height="${box}" viewBox="${-box / 2} ${-box / 2} ${box} ${box}"
         style="left: ${cx - box / 2}px; top: ${cy - box / 2}px;">
      <g transform="rotate(${rotation})">
        ${svgInner}
      </g>
    </svg>
  `;
}

let debugGridOn = false;
let calibrationOn = false;

function renderWithExtras(s) {
  render(s);
  if (debugGridOn) drawDebugGrid();
  if (calibrationOn) drawCalibrationCursor();
}

function drawDebugGrid() {
  const w = window.innerWidth, h = window.innerHeight;
  const cx = w / 2, cy = h / 2;
  const grid = document.createElement('div');
  grid.id = 'debug-grid';
  grid.innerHTML = `
    <svg width="${w}" height="${h}" style="position:fixed;inset:0;pointer-events:none;">
      <line x1="${cx}" y1="0" x2="${cx}" y2="${h}" stroke="#00ff00" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>
      <line x1="0" y1="${cy}" x2="${w}" y2="${cy}" stroke="#00ff00" stroke-width="1" stroke-dasharray="4,4" opacity="0.4"/>
      <circle cx="${cx}" cy="${cy}" r="50" fill="none" stroke="#00ff00" stroke-width="1" opacity="0.3"/>
      <circle cx="${cx}" cy="${cy}" r="100" fill="none" stroke="#00ff00" stroke-width="1" opacity="0.2"/>
      <text x="${cx + 10}" y="${cy - 10}" fill="#00ff00" font-family="monospace" font-size="11" opacity="0.7">SCREEN CENTER (${cx}, ${cy})</text>
    </svg>
  `;
  document.body.appendChild(grid);
}

function drawCalibrationCursor() {
  const banner = document.createElement('div');
  banner.id = 'calib-banner';
  banner.style.cssText = 'position:fixed;top:30px;left:50%;transform:translateX(-50%);background:#EA4D4D;color:white;padding:12px 24px;font-family:monospace;font-size:13px;letter-spacing:1px;text-transform:uppercase;border:2px solid white;z-index:99999;box-shadow:0 0 20px rgba(0,0,0,0.8);pointer-events:none;';
  banner.textContent = 'CALIBRATION MODE - Click where you want crosshair (Esc to cancel)';
  document.body.appendChild(banner);
  document.body.style.cursor = 'crosshair';
}

function clearOverlayExtras() {
  const grid = document.getElementById('debug-grid');
  if (grid) grid.remove();
  const banner = document.getElementById('calib-banner');
  if (banner) banner.remove();
  document.body.style.cursor = 'none';
}

window.crosshairAPI.onSettingsUpdate(s => {
  currentSettings = s;
  clearOverlayExtras();
  renderWithExtras(s);
});

window.crosshairAPI.getSettings().then(s => {
  currentSettings = s;
  renderWithExtras(s);
});

window.crosshairAPI.onDebug(action => {
  if (action === 'toggleGrid') {
    debugGridOn = !debugGridOn;
    clearOverlayExtras();
    renderWithExtras(currentSettings);
  }
});

window.crosshairAPI.onCalibrationStart(() => {
  calibrationOn = true;
  clearOverlayExtras();
  renderWithExtras(currentSettings);
});

window.crosshairAPI.onCalibrationCancel(() => {
  calibrationOn = false;
  clearOverlayExtras();
  renderWithExtras(currentSettings);
});

// Listen for click during calibration
document.addEventListener('click', async (e) => {
  if (calibrationOn) {
    calibrationOn = false;
    await window.crosshairAPI.setCalibration({ x: e.clientX, y: e.clientY });
    clearOverlayExtras();
  }
});

// Esc cancels calibration
document.addEventListener('keydown', async (e) => {
  if (calibrationOn && e.key === 'Escape') {
    calibrationOn = false;
    await window.crosshairAPI.cancelCalibration();
    clearOverlayExtras();
  }
});

// Re-render on resize
window.addEventListener('resize', () => {
  if (currentSettings) {
    clearOverlayExtras();
    renderWithExtras(currentSettings);
  }
});

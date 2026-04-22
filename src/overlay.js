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
    case 'x': {
      // X shape (rotated cross)
      const d = half * 0.707; // diagonal component
      const gd = gap * 0.707;
      const lines = [
        [-d, -d, -gd, -gd], [gd, gd, d, d],
        [-d, d, -gd, gd], [gd, -gd, d, -d]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="round" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'corners': {
      // 4 L-brackets around center
      const len = half * 0.5;
      const offset = gap + half * 0.3;
      const corners = [
        // top-left
        [[-offset - len, -offset], [-offset, -offset]],
        [[-offset, -offset - len], [-offset, -offset]],
        // top-right
        [[offset, -offset], [offset + len, -offset]],
        [[offset, -offset - len], [offset, -offset]],
        // bottom-left
        [[-offset - len, offset], [-offset, offset]],
        [[-offset, offset], [-offset, offset + len]],
        // bottom-right
        [[offset, offset], [offset + len, offset]],
        [[offset, offset], [offset, offset + len]]
      ];
      if (s.outline) for (const [[x1,y1],[x2,y2]] of corners)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      for (const [[x1,y1],[x2,y2]] of corners)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'brackets': {
      // [ ] around center
      const bh = half * 0.6;
      const bw = half * 0.15;
      const offset = gap + half * 0.2;
      const lines = [
        // left bracket
        [-offset, -bh, -offset, bh],
        [-offset, -bh, -offset + bw, -bh],
        [-offset, bh, -offset + bw, bh],
        // right bracket
        [offset, -bh, offset, bh],
        [offset, -bh, offset - bw, -bh],
        [offset, bh, offset - bw, bh]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'chevron': {
      // ^ pointing up
      const w = half * 0.7;
      const h_ = half * 0.5;
      const lines = [
        [-w, h_, 0, -h_],
        [0, -h_, w, h_]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="round" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'diamond': {
      const pts = `0,${-half} ${half},0 0,${half} ${-half},0`;
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linejoin="miter" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linejoin="miter" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'triangle': {
      // Triangle pointing up
      const pts = `0,${-half} ${half * 0.866},${half * 0.5} ${-half * 0.866},${half * 0.5}`;
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linejoin="miter" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linejoin="miter" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'star': {
      // 5-pointed star
      const outer = half;
      const innerR = half * 0.4;
      let pts = '';
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : innerR;
        const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        pts += `${x.toFixed(2)},${y.toFixed(2)} `;
      }
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linejoin="round" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linejoin="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'ksight': {
      // Single vertical line (K-sight style)
      if (s.outline) inner += `<line x1="0" y1="${-half}" x2="0" y2="${half}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      inner += `<line x1="0" y1="${-half}" x2="0" y2="${half}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'prong3': {
      // 3 arms at 120°
      const angles = [-90, 30, 150]; // degrees
      const lines = angles.map(a => {
        const rad = (a * Math.PI) / 180;
        return [Math.cos(rad) * gap, Math.sin(rad) * gap, Math.cos(rad) * half, Math.sin(rad) * half];
      });
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'prong6': {
      // 6 arms at 60° (snowflake / hex)
      const angles = [0, 60, 120, 180, 240, 300];
      const lines = angles.map(a => {
        const rad = (a * Math.PI) / 180;
        return [Math.cos(rad) * gap, Math.sin(rad) * gap, Math.cos(rad) * half, Math.sin(rad) * half];
      });
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'double_ring': {
      // Two concentric circles
      const rOuter = half;
      const rInner = half * 0.5;
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${rOuter}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
        inner += `<circle cx="0" cy="0" r="${rInner}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      }
      inner += `<circle cx="0" cy="0" r="${rOuter}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      inner += `<circle cx="0" cy="0" r="${rInner}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'hollow_cross': {
      // Cross outline only (double line with hollow interior)
      const lines = [
        [0, -gap, 0, -half], [0, gap, 0, half],
        [-gap, 0, -half, 0], [gap, 0, half, 0]
      ];
      // Draw thicker outline first, then same color as bg inside to create hollow effect
      for (const [x1,y1,x2,y2] of lines) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t + 2}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      }
      // Inner hollow stripe
      for (const [x1,y1,x2,y2] of lines) {
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline === 'none' ? '#000' : outline}" stroke-width="${Math.max(0.5, t - 0.5)}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      }
      break;
    }
    case 'plus_dot': {
      // Classic + with strong center dot (variant)
      const lines = [
        [0, -gap, 0, -half], [0, gap, 0, half],
        [-gap, 0, -half, 0], [gap, 0, half, 0]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="square" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="square" opacity="${s.opacity/100}" />`;
      // Always draw a dot
      const dr = Math.max(1.5, t);
      inner += `<circle cx="0" cy="0" r="${dr}" fill="${color}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'prong3': {
      const angles = [-90, 30, 150];
      const lines = angles.map(a => { const r=(a*Math.PI)/180; return [Math.cos(r)*gap, Math.sin(r)*gap, Math.cos(r)*half, Math.sin(r)*half]; });
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'prong6': {
      const angles = [0, 60, 120, 180, 240, 300];
      const lines = angles.map(a => { const r=(a*Math.PI)/180; return [Math.cos(r)*gap, Math.sin(r)*gap, Math.cos(r)*half, Math.sin(r)*half]; });
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
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

window.crosshairAPI.onSettingsUpdate(render);
window.crosshairAPI.getSettings().then(render);

// Re-render on resize
window.addEventListener('resize', () => {
  if (currentSettings) render(currentSettings);
});

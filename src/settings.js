// Crosshair F - Settings UI logic
'use strict';

const api = window.crosshairAPI;
let currentSettings = null;
let displays = [];

// ===== Tab navigation =====
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'profiles') refreshProfiles();
  });
});

// ===== Helpers =====
function $(id) { return document.getElementById(id); }

function setVal(id, v, suffix) {
  const el = $('val-' + id);
  if (el) el.textContent = v;
}

function applyToUI(s) {
  currentSettings = s;

  // Geometry
  $('size').value = s.size;
  setVal('size', s.size);
  $('thickness').value = s.thickness;
  setVal('thickness', s.thickness);
  $('gapSize').value = s.gapSize;
  setVal('gapSize', s.gapSize);
  $('rotation').value = s.rotation;
  setVal('rotation', s.rotation);
  $('opacity').value = s.opacity;
  setVal('opacity', s.opacity);

  // Color
  $('color').value = s.color;
  $('colorHex').value = s.color.toUpperCase();
  $('outline').checked = !!s.outline;
  $('outlineColor').value = s.outlineColor;
  $('outlineColorHex').value = s.outlineColor.toUpperCase();
  $('outlineThickness').value = s.outlineThickness;
  setVal('outlineThickness', s.outlineThickness);

  // Center dot
  $('centerDot').checked = !!s.centerDot;
  $('centerDotSize').value = s.centerDotSize;
  setVal('centerDotSize', s.centerDotSize);
  $('centerDotColor').value = s.centerDotColor;
  $('centerDotColorHex').value = s.centerDotColor.toUpperCase();

  // Shape
  document.querySelectorAll('.shape-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === s.shape);
  });

  // Position / display
  $('offsetX').value = s.offsetX;
  setVal('offsetX', s.offsetX);
  $('offsetY').value = s.offsetY;
  setVal('offsetY', s.offsetY);
  $('hideOnCapture').checked = !!s.hideOnCapture;
  $('startWithWindows').checked = !!s.startWithWindows;
  $('startMinimized').checked = !!s.startMinimized;

  // Hotkeys
  $('hotkeyToggle').value = s.hotkeyToggle || '';
  $('hotkeyHide').value = s.hotkeyHide || '';
  $('hotkeyReset').value = s.hotkeyReset || '';

  // Custom image
  $('customSize').value = s.customImageSize || s.size;
  setVal('customSize', s.customImageSize || s.size);

  // Preview info
  $('info-shape').textContent = (s.shape || '').toUpperCase();
  $('info-size').textContent = s.size + 'px';
  $('info-color').textContent = s.color.toUpperCase();

  renderPreview(s);
}

// ===== Live preview (uses same logic as overlay) =====
function buildShapeSVG(s) {
  const half = s.size / 2;
  const t = Math.max(0.5, s.thickness);
  const gap = Math.max(0, s.gapSize);
  const color = s.color;
  const outline = s.outline ? s.outlineColor : 'none';
  const ow = s.outline ? s.outlineThickness : 0;
  let inner = '';

  switch (s.shape) {
    case 'dot': {
      const r = Math.max(1, s.size / 4);
      inner += `<circle cx="0" cy="0" r="${r + ow}" fill="${outline}" />`;
      inner += `<circle cx="0" cy="0" r="${r}" fill="${color}" opacity="${s.opacity / 100}" />`;
      break;
    }
    case 'cross': {
      const lines = [
        [0, -gap, 0, -half], [0, gap, 0, half],
        [-gap, 0, -half, 0], [gap, 0, half, 0]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 't': {
      const lines = [[0,gap,0,half],[-gap,0,-half,0],[gap,0,half,0]];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'circle': {
      const r = Math.max(2, half);
      if (s.outline) inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'hybrid': {
      const r = Math.max(2, half);
      const lines = [
        [0, -gap, 0, -half*0.6], [0, gap, 0, half*0.6],
        [-gap, 0, -half*0.6, 0], [gap, 0, half*0.6, 0]
      ];
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
        for (const [x1,y1,x2,y2] of lines)
          inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      }
      inner += `<circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'scope': {
      const rO = half, rI = half * 0.25;
      const segs = [
        ['circle', rO], ['circle', rI],
        ['line', -rO, 0, -rI - 2, 0], ['line', rI + 2, 0, rO, 0],
        ['line', 0, -rO, 0, -rI - 2], ['line', 0, rI + 2, 0, rO]
      ];
      const draw = (col, sw) => {
        let html = '';
        for (const seg of segs) {
          if (seg[0] === 'circle') html += `<circle cx="0" cy="0" r="${seg[1]}" fill="none" stroke="${col}" stroke-width="${sw}" />`;
          else html += `<line x1="${seg[1]}" y1="${seg[2]}" x2="${seg[3]}" y2="${seg[4]}" stroke="${col}" stroke-width="${sw}" />`;
        }
        return html;
      };
      if (s.outline) inner += draw(outline, t + ow*2);
      inner += `<g opacity="${s.opacity/100}">${draw(color, t)}</g>`;
      break;
    }
    case 'sniper': {
      const draws = [
        [0,-half,0,half],
        [-half,0,-gap,0], [gap,0,half,0]
      ];
      for (let i=1;i<=4;i++) {
        const y = (half/4)*i;
        const w = (half*0.6) - (i*2);
        draws.push([-w/2, y, w/2, y]);
      }
      if (s.outline) for (const [x1,y1,x2,y2] of draws)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of draws)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
  }

  if (s.centerDot) {
    const cdr = Math.max(0.5, s.centerDotSize);
    if (s.outline) inner += `<circle cx="0" cy="0" r="${cdr + ow}" fill="${outline}" />`;
    inner += `<circle cx="0" cy="0" r="${cdr}" fill="${s.centerDotColor}" opacity="${s.opacity/100}" />`;
  }
  return inner;
}

function renderPreview(s) {
  const canvas = $('preview-canvas');
  const buffer = 30;
  const box = (s.size || 32) * 2 + buffer;
  let inner;
  if (s.shape === 'custom' && s.customImage) {
    inner = `<image x="${-s.size/2}" y="${-s.size/2}" width="${s.size}" height="${s.size}" href="${s.customImage}" opacity="${s.opacity/100}" />`;
    if (s.centerDot) {
      const cdr = Math.max(0.5, s.centerDotSize);
      inner += `<circle cx="0" cy="0" r="${cdr}" fill="${s.centerDotColor}" opacity="${s.opacity/100}" />`;
    }
  } else {
    inner = buildShapeSVG(s);
  }
  canvas.innerHTML = `
    <svg width="${box}" height="${box}" viewBox="${-box/2} ${-box/2} ${box} ${box}">
      <g transform="rotate(${s.rotation || 0})">${inner}</g>
    </svg>
  `;
}

// ===== Wire up controls =====
async function update(partial) {
  const s = await api.setSettings(partial);
  applyToUI(s);
}

const sliderIds = ['size','thickness','gapSize','rotation','opacity','outlineThickness','centerDotSize','offsetX','offsetY'];
for (const id of sliderIds) {
  $(id).addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    setVal(id, v);
    update({ [id]: v });
  });
}

$('color').addEventListener('input', e => { $('colorHex').value = e.target.value.toUpperCase(); update({ color: e.target.value }); });
$('colorHex').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { $('color').value = v; update({ color: v }); }
});
$('outlineColor').addEventListener('input', e => { $('outlineColorHex').value = e.target.value.toUpperCase(); update({ outlineColor: e.target.value }); });
$('outlineColorHex').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { $('outlineColor').value = v; update({ outlineColor: v }); }
});
$('centerDotColor').addEventListener('input', e => { $('centerDotColorHex').value = e.target.value.toUpperCase(); update({ centerDotColor: e.target.value }); });
$('centerDotColorHex').addEventListener('change', e => {
  const v = e.target.value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) { $('centerDotColor').value = v; update({ centerDotColor: v }); }
});

$('outline').addEventListener('change', e => update({ outline: e.target.checked }));
$('centerDot').addEventListener('change', e => update({ centerDot: e.target.checked }));
$('hideOnCapture').addEventListener('change', e => update({ hideOnCapture: e.target.checked }));
$('startMinimized').addEventListener('change', e => update({ startMinimized: e.target.checked }));
$('startWithWindows').addEventListener('change', async e => {
  await api.setAutoLaunch(e.target.checked);
  await update({ startWithWindows: e.target.checked });
});

document.querySelectorAll('.shape-btn').forEach(b => {
  b.addEventListener('click', () => update({ shape: b.dataset.shape }));
});

document.querySelectorAll('.cp').forEach(b => {
  b.addEventListener('click', () => {
    $('color').value = b.dataset.c;
    $('colorHex').value = b.dataset.c.toUpperCase();
    update({ color: b.dataset.c });
  });
});

// Reset & export/import
$('btn-reset').addEventListener('click', async () => {
  if (!confirm('Reset all crosshair settings to defaults?')) return;
  const s = await api.resetSettings();
  applyToUI(s);
});

$('btn-reset-pos').addEventListener('click', () => update({ offsetX: 0, offsetY: 0 }));

// Game preset dropdown
(async function loadGamePresets() {
  const presets = await api.listGamePresets();
  const sel = $('gamePreset');
  for (const p of presets) {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = p.label;
    sel.appendChild(opt);
  }
})();

$('btn-apply-preset').addEventListener('click', async () => {
  const key = $('gamePreset').value;
  if (!key) return alert('Pick a game first.');
  const r = await api.applyGamePreset(key);
  if (r.ok) {
    applyToUI(r.settings);
    alert(`Applied: ${r.note}`);
  }
});

$('btn-calibrate').addEventListener('click', async () => {
  await api.startCalibration();
  alert('Calibration mode active. Switch to your game and click where you want the crosshair. Press Esc to cancel.');
});

$('btn-debug-grid').addEventListener('click', async () => {
  await api.toggleDebugGrid();
});

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(currentSettings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `crosshair-f-preset-${Date.now()}.json`;
  a.click(); URL.revokeObjectURL(url);
});

$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const data = JSON.parse(txt);
    delete data.profiles;
    delete data.activeProfile;
    const s = await api.setSettings(data);
    applyToUI(s);
    alert('Preset imported!');
  } catch (err) {
    alert('Could not import preset: ' + err.message);
  }
  e.target.value = '';
});

// ===== Custom image (designer tab) =====
const dropzone = $('dropzone');
const customFile = $('custom-file');
$('btn-choose-file').addEventListener('click', () => customFile.click());
customFile.addEventListener('change', e => {
  if (e.target.files[0]) handleCustomFile(e.target.files[0]);
});
$('customSize').addEventListener('input', e => {
  const v = parseInt(e.target.value);
  setVal('customSize', v);
  update({ size: v, customImageSize: v });
});
$('btn-clear-custom').addEventListener('click', () => {
  update({ customImage: null, shape: 'cross' });
});

['dragenter','dragover'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault(); dropzone.classList.add('over');
}));
['dragleave','drop'].forEach(ev => dropzone.addEventListener(ev, e => {
  e.preventDefault(); dropzone.classList.remove('over');
}));
dropzone.addEventListener('drop', e => {
  if (e.dataTransfer.files[0]) handleCustomFile(e.dataTransfer.files[0]);
});
dropzone.addEventListener('click', () => customFile.click());

function handleCustomFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    update({ customImage: dataUrl, shape: 'custom' });
    alert('Custom crosshair loaded! Switching to Custom shape.');
  };
  reader.readAsDataURL(file);
}

// Export crosshair as PNG / SVG
$('btn-export-svg').addEventListener('click', () => {
  const s = currentSettings;
  const buffer = 30;
  const box = (s.size || 32) * 2 + buffer;
  const inner = (s.shape === 'custom' && s.customImage)
    ? `<image x="${-s.size/2}" y="${-s.size/2}" width="${s.size}" height="${s.size}" href="${s.customImage}" />`
    : buildShapeSVG(s);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="${-box/2} ${-box/2} ${box} ${box}">
<g transform="rotate(${s.rotation || 0})">${inner}</g>
</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `crosshair-f-${Date.now()}.svg`;
  a.click(); URL.revokeObjectURL(url);
});

$('btn-export-png').addEventListener('click', () => {
  const s = currentSettings;
  const buffer = 30;
  const box = (s.size || 32) * 2 + buffer;
  const inner = buildShapeSVG(s);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="${-box/2} ${-box/2} ${box} ${box}"><g transform="rotate(${s.rotation || 0})">${inner}</g></svg>`;
  const img = new Image();
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = box; c.height = box;
    c.getContext('2d').drawImage(img, 0, 0);
    c.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `crosshair-f-${Date.now()}.png`;
      a.click();
    });
    URL.revokeObjectURL(url);
  };
  img.src = url;
});

// ===== Profiles =====
async function refreshProfiles() {
  const names = await api.listProfiles();
  const list = $('profile-list');
  list.innerHTML = '';
  if (!names.length) {
    list.innerHTML = '<p class="muted">No profiles yet. Save your current setup above.</p>';
    return;
  }
  for (const name of names) {
    const isActive = name === currentSettings.activeProfile;
    const div = document.createElement('div');
    div.className = 'profile-item' + (isActive ? ' active' : '');
    div.innerHTML = `
      <span class="pdot"></span>
      <span class="pname">${name}</span>
      <button class="btn ghost" data-act="load">Load</button>
      <button class="btn danger" data-act="del">${name === 'default' ? 'Locked' : 'Delete'}</button>
    `;
    div.querySelector('[data-act="load"]').addEventListener('click', async () => {
      const s = await api.loadProfile(name);
      applyToUI(s);
      refreshProfiles();
    });
    const delBtn = div.querySelector('[data-act="del"]');
    if (name === 'default') {
      delBtn.disabled = true;
    } else {
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete profile "${name}"?`)) return;
        const s = await api.deleteProfile(name);
        currentSettings = s;
        refreshProfiles();
      });
    }
    list.appendChild(div);
  }
}

$('btn-save-profile').addEventListener('click', async () => {
  const name = $('profile-name').value.trim();
  if (!name) { alert('Type a name first.'); return; }
  if (name.length > 30) { alert('Profile name too long.'); return; }
  const s = await api.saveProfile(name);
  currentSettings = s;
  $('profile-name').value = '';
  refreshProfiles();
  alert(`Profile "${name}" saved.`);
});

// ===== Hotkey recording =====
['hotkeyToggle','hotkeyHide','hotkeyReset'].forEach(id => {
  const inp = $(id);
  inp.addEventListener('click', () => {
    inp.classList.add('recording');
    inp.value = 'Press keys...';
    const handler = async (e) => {
      e.preventDefault();
      if (e.key === 'Escape') {
        inp.classList.remove('recording');
        inp.value = currentSettings[id] || '';
        document.removeEventListener('keydown', handler);
        return;
      }
      // Need at least one modifier
      const parts = [];
      if (e.ctrlKey) parts.push('CommandOrControl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey && !e.ctrlKey) parts.push('Super');
      const key = e.key;
      if (['Control','Alt','Shift','Meta'].includes(key)) return;
      let mainKey = key;
      if (key.length === 1) mainKey = key.toUpperCase();
      else if (key.startsWith('Arrow')) mainKey = key.replace('Arrow','');
      else if (/^F\d+$/.test(key)) mainKey = key;
      parts.push(mainKey);
      const accel = parts.join('+');
      inp.value = accel;
      inp.classList.remove('recording');
      document.removeEventListener('keydown', handler);
      const s = await api.rebindHotkey({ [id]: accel });
      applyToUI(s);
    };
    document.addEventListener('keydown', handler);
  });
});

// ===== Toggle / Quit =====
$('btn-toggle').addEventListener('click', async () => {
  const visible = await api.toggleOverlay();
  $('toggle-text').textContent = visible ? 'CROSSHAIR ACTIVE' : 'CROSSHAIR HIDDEN';
  document.querySelector('#btn-toggle .status-dot').classList.toggle('active', visible);
});
$('btn-quit').addEventListener('click', () => {
  if (confirm('Exit Crosshair F? The overlay will stop working.')) api.quit();
});

// ===== Init =====
api.onInit(({ settings, displays: dlist }) => {
  displays = dlist;
  const sel = $('monitorIndex');
  sel.innerHTML = '';
  for (const d of dlist) {
    const opt = document.createElement('option');
    opt.value = d.index;
    opt.textContent = d.label + (d.isPrimary ? ' (Primary)' : '');
    sel.appendChild(opt);
  }
  sel.value = settings.monitorIndex;
  sel.addEventListener('change', e => update({ monitorIndex: parseInt(e.target.value) }));
  applyToUI(settings);
});

api.onSettingsUpdate(s => applyToUI(s));

// Initial load fallback if onInit did not arrive yet
api.getSettings().then(s => {
  if (!currentSettings) applyToUI(s);
});

// ===== Community =====
let communityPage = 0;
let communityState = {
  search: '', sort: 'popular', filter: '', items: []
};

let communityLoaded = false;
async function loadCommunityIfNeeded() {
  if (communityLoaded) return;
  communityLoaded = true;
  refreshCommunity();
}

async function refreshCommunity() {
  const grid = $('community-grid');
  grid.innerHTML = '<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px">Loading...</p>';
  const result = await api.communityList({
    search: communityState.search,
    game: communityState.filter,
    sort: communityState.sort,
    page: communityPage,
    limit: 20
  });
  if (!result.ok) {
    grid.innerHTML = `<p class="muted" style="grid-column:1/-1;text-align:center;padding:20px;color:var(--danger)">Error: ${result.error}</p>`;
    return;
  }
  communityState.items = result.items || [];
  renderCommunityGrid();
  $('community-page-info').textContent = `Page ${communityPage + 1}`;
  $('btn-community-prev').disabled = communityPage === 0;
  $('btn-community-next').disabled = (result.items || []).length < 20;
}

function renderCommunityGrid() {
  const grid = $('community-grid');
  grid.innerHTML = '';
  if (!communityState.items.length) return;
  for (const item of communityState.items) {
    const card = document.createElement('div');
    card.className = 'community-card';
    const previewSvg = renderMiniSVG(item.preset || {});
    card.innerHTML = `
      ${item.verified ? '<span class="community-tag">✓ Verified</span>' : ''}
      <div class="community-preview">${previewSvg}</div>
      <div class="community-meta">
        <div class="community-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="community-author">@${escapeHtml(item.author)} · ${escapeHtml(item.game || 'any')}</div>
      </div>
      <div class="community-stats">
        <span>↓ ${item.downloads || 0}</span>
        <span class="${item.verified ? 'verified' : ''}">${item.verified ? 'SAFE' : 'PENDING'}</span>
      </div>
      <button class="btn" data-id="${escapeHtml(item.id)}">Apply</button>
    `;
    card.querySelector('button').addEventListener('click', async () => {
      const r = await api.communityDownload(item.id);
      if (r.ok) {
        applyToUI(r.settings);
        alert(`"${item.name}" applied!`);
      } else {
        alert('Could not apply: ' + r.error);
      }
    });
    grid.appendChild(card);
  }
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function renderMiniSVG(preset) {
  const s = { size: 32, thickness: 2, gapSize: 4, color: '#00FF00', opacity: 100,
              rotation: 0, outline: false, outlineColor: '#000', outlineThickness: 1,
              centerDot: false, centerDotSize: 2, centerDotColor: '#FF0000',
              shape: 'cross', ...preset };
  const buffer = 30;
  const box = (s.size || 32) * 2 + buffer;
  const inner = buildShapeSVG(s);
  return `<svg width="100%" height="100%" viewBox="${-box/2} ${-box/2} ${box} ${box}"><g transform="rotate(${s.rotation||0})">${inner}</g></svg>`;
}

$('btn-community-refresh').addEventListener('click', () => { communityPage = 0; refreshCommunity(); });
$('btn-community-prev').addEventListener('click', () => { if (communityPage > 0) { communityPage--; refreshCommunity(); } });
$('btn-community-next').addEventListener('click', () => { communityPage++; refreshCommunity(); });
$('community-search').addEventListener('input', debounce(() => {
  communityState.search = $('community-search').value.trim();
  communityPage = 0;
  refreshCommunity();
}, 400));
$('community-sort').addEventListener('change', e => {
  communityState.sort = e.target.value;
  communityPage = 0;
  refreshCommunity();
});
$('community-filter').addEventListener('change', e => {
  communityState.filter = e.target.value;
  communityPage = 0;
  refreshCommunity();
});

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

$('btn-upload-crosshair').addEventListener('click', async () => {
  const name = $('upload-name').value.trim();
  const author = $('upload-author').value.trim();
  const game = $('upload-game').value;
  const tags = $('upload-tags').value.trim();
  const description = $('upload-desc').value.trim();
  if (!name || !author) return alert('Name and author tag are required.');
  if (currentSettings.shape === 'custom') {
    return alert('Custom image crosshairs cannot be uploaded to the community for safety reasons. Use a built-in shape.');
  }
  const btn = $('btn-upload-crosshair');
  btn.disabled = true;
  btn.textContent = 'Uploading...';
  const result = await api.communityUpload({
    name, author, game, tags, description,
    preset: currentSettings
  });
  btn.disabled = false;
  btn.textContent = 'Upload Current Crosshair';
  if (result.ok) {
    alert(result.message);
    $('upload-name').value = '';
    $('upload-tags').value = '';
    $('upload-desc').value = '';
    refreshCommunity();
  } else {
    alert('Upload failed: ' + result.error);
  }
});

// Load community on first tab open
document.querySelector('[data-tab="community"]').addEventListener('click', () => {
  loadCommunityIfNeeded();
});

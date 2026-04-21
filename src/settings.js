// Crosshair F - Settings UI logic
'use strict';

const api = window.crosshairAPI;
let currentSettings = null;
let displays = [];

// ============ BUILT-IN PRESET LIBRARY ============
// Inspired by popular pro configs. Categories: pro | classic | scope | creative | neon
const BUILT_IN_PRESETS = [
  // Pro Valorant
  { id:'tenz', name:'TenZ Classic', category:'pro', preset:{ shape:'cross', size:20, thickness:2, gapSize:2, color:'#FFFF00', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'scream', name:'ScreaM Dot', category:'pro', preset:{ shape:'dot', size:6, thickness:1, gapSize:0, color:'#00FF00', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#00FF00', rotation:0 } },
  { id:'shahzam', name:'Shahzam Cyan', category:'pro', preset:{ shape:'cross', size:24, thickness:2, gapSize:3, color:'#00FFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'aspas', name:'Aspas Purple', category:'pro', preset:{ shape:'plus_dot', size:18, thickness:2, gapSize:2, color:'#A855F7', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#A855F7', rotation:0 } },
  { id:'derke', name:'Derke Green', category:'pro', preset:{ shape:'cross', size:22, thickness:1.5, gapSize:3, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },

  // Pro CS2
  { id:'s1mple', name:'s1mple Green', category:'pro', preset:{ shape:'cross', size:14, thickness:1, gapSize:2, color:'#50C878', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'zywoo', name:'ZywOo Cyan', category:'pro', preset:{ shape:'cross', size:16, thickness:1, gapSize:2, color:'#00FFFF', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'niko', name:'NiKo T-Shape', category:'pro', preset:{ shape:'t', size:22, thickness:2, gapSize:3, color:'#FFFFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FFFFFF', rotation:0 } },
  { id:'device', name:'device Static', category:'pro', preset:{ shape:'cross', size:18, thickness:1, gapSize:2, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1, centerDotColor:'#00FF00', rotation:0 } },
  { id:'stewie', name:'Stewie2k Dot', category:'pro', preset:{ shape:'dot', size:8, thickness:1, gapSize:0, color:'#FFFF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },

  // Classic
  { id:'dot_only', name:'Classic Dot', category:'classic', preset:{ shape:'dot', size:6, thickness:1, gapSize:0, color:'#00FF00', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'classic_plus', name:'Classic Plus', category:'classic', preset:{ shape:'cross', size:24, thickness:2, gapSize:4, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1, centerDotColor:'#FF0000', rotation:0 } },
  { id:'thin_cross', name:'Razor Thin', category:'classic', preset:{ shape:'cross', size:20, thickness:1, gapSize:3, color:'#00FF00', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'thick_cross', name:'Thick White', category:'classic', preset:{ shape:'cross', size:28, thickness:4, gapSize:5, color:'#FFFFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:2, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'hollow_white', name:'Hollow Cross', category:'classic', preset:{ shape:'hollow_cross', size:26, thickness:3, gapSize:4, color:'#FFFFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'pixel_red', name:'Pixel Red', category:'classic', preset:{ shape:'dot', size:4, thickness:1, gapSize:0, color:'#FF0000', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:0.5, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },

  // Scope / Sniper
  { id:'mil_dot', name:'Sniper Mil-Dot', category:'scope', preset:{ shape:'sniper', size:60, thickness:2, gapSize:6, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF0000', rotation:0 } },
  { id:'red_dot', name:'Red Dot Sight', category:'scope', preset:{ shape:'circle', size:24, thickness:2, gapSize:0, color:'#FF3030', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:3, centerDotColor:'#FF3030', rotation:0 } },
  { id:'holo', name:'Holographic', category:'scope', preset:{ shape:'scope', size:50, thickness:1.5, gapSize:5, color:'#FF3030', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF3030', rotation:0 } },
  { id:'classic_scope', name:'Classic Scope', category:'scope', preset:{ shape:'scope', size:60, thickness:2, gapSize:6, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF0000', rotation:0 } },
  { id:'double_ring', name:'Double Ring', category:'scope', preset:{ shape:'double_ring', size:36, thickness:1.5, gapSize:0, color:'#00FFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:2, centerDotColor:'#FF3030', rotation:0 } },

  // Creative
  { id:'diamond', name:'Diamond', category:'creative', preset:{ shape:'diamond', size:22, thickness:2, gapSize:0, color:'#FFD700', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FFD700', rotation:0 } },
  { id:'x_shape', name:'X Shape', category:'creative', preset:{ shape:'x', size:22, thickness:2, gapSize:3, color:'#FF3030', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'chevron_up', name:'Chevron', category:'creative', preset:{ shape:'chevron', size:24, thickness:2.5, gapSize:0, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1, centerDotColor:'#FF0000', rotation:0 } },
  { id:'corners', name:'Corner Brackets', category:'creative', preset:{ shape:'corners', size:30, thickness:1.5, gapSize:4, color:'#00FFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#00FFFF', rotation:0 } },
  { id:'brackets', name:'Square Brackets', category:'creative', preset:{ shape:'brackets', size:26, thickness:2, gapSize:4, color:'#FFFFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF0000', rotation:0 } },
  { id:'ksight', name:'K-Sight', category:'creative', preset:{ shape:'ksight', size:28, thickness:2, gapSize:0, color:'#00FF00', opacity:100, outline:false, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:2, centerDotColor:'#FF0000', rotation:0 } },
  { id:'triangle', name:'Triangle', category:'creative', preset:{ shape:'triangle', size:22, thickness:2, gapSize:0, color:'#FFFF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1, centerDotColor:'#FFFF00', rotation:0 } },
  { id:'star', name:'Star', category:'creative', preset:{ shape:'star', size:24, thickness:1.5, gapSize:0, color:'#FFD700', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:false, centerDotSize:2, centerDotColor:'#FFD700', rotation:0 } },
  { id:'prong3', name:'Triple Prong', category:'creative', preset:{ shape:'prong3', size:24, thickness:2, gapSize:3, color:'#00FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF0000', rotation:0 } },
  { id:'prong6', name:'Hex Prong', category:'creative', preset:{ shape:'prong6', size:22, thickness:1.5, gapSize:3, color:'#00FFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF0000', rotation:0 } },

  // Neon
  { id:'neon_pink', name:'Neon Pink', category:'neon', preset:{ shape:'cross', size:22, thickness:2, gapSize:3, color:'#FF00FF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FF00FF', rotation:0 } },
  { id:'neon_cyan', name:'Electric Cyan', category:'neon', preset:{ shape:'hybrid', size:22, thickness:2, gapSize:2, color:'#00FFFF', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:2, centerDotColor:'#FFFFFF', rotation:0 } },
  { id:'neon_magenta', name:'Magenta Pop', category:'neon', preset:{ shape:'hybrid', size:24, thickness:2, gapSize:3, color:'#E94D5F', opacity:100, outline:true, outlineColor:'#FFFFFF', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#FFFFFF', rotation:0 } },
  { id:'neon_lime', name:'Lime Slash', category:'neon', preset:{ shape:'x', size:20, thickness:2, gapSize:2, color:'#C6FF00', opacity:100, outline:true, outlineColor:'#000000', outlineThickness:1, centerDot:true, centerDotSize:1.5, centerDotColor:'#C6FF00', rotation:0 } }
];

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
    case 'x': {
      const d = half * 0.707, gd = gap * 0.707;
      const lines = [[-d,-d,-gd,-gd],[gd,gd,d,d],[-d,d,-gd,gd],[gd,-gd,d,-d]];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="round" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'corners': {
      const len = half * 0.5;
      const offset = gap + half * 0.3;
      const corners = [
        [[-offset-len,-offset],[-offset,-offset]], [[-offset,-offset-len],[-offset,-offset]],
        [[offset,-offset],[offset+len,-offset]], [[offset,-offset-len],[offset,-offset]],
        [[-offset-len,offset],[-offset,offset]], [[-offset,offset],[-offset,offset+len]],
        [[offset,offset],[offset+len,offset]], [[offset,offset],[offset,offset+len]]
      ];
      if (s.outline) for (const [[x1,y1],[x2,y2]] of corners)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [[x1,y1],[x2,y2]] of corners)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'brackets': {
      const bh = half * 0.6, bw = half * 0.15;
      const offset = gap + half * 0.2;
      const lines = [
        [-offset,-bh,-offset,bh], [-offset,-bh,-offset+bw,-bh], [-offset,bh,-offset+bw,bh],
        [offset,-bh,offset,bh], [offset,-bh,offset-bw,-bh], [offset,bh,offset-bw,bh]
      ];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'chevron': {
      const w = half * 0.7, h_ = half * 0.5;
      const lines = [[-w,h_,0,-h_],[0,-h_,w,h_]];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linecap="round" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" stroke-linecap="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'diamond': {
      const pts = `0,${-half} ${half},0 0,${half} ${-half},0`;
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'triangle': {
      const pts = `0,${-half} ${half*0.866},${half*0.5} ${-half*0.866},${half*0.5}`;
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'star': {
      const outer = half, innerR = half * 0.4;
      let pts = '';
      for (let i=0;i<10;i++) {
        const r = i%2===0 ? outer : innerR;
        const a = (Math.PI*2*i)/10 - Math.PI/2;
        pts += `${(Math.cos(a)*r).toFixed(2)},${(Math.sin(a)*r).toFixed(2)} `;
      }
      if (s.outline) inner += `<polygon points="${pts}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" stroke-linejoin="round" />`;
      inner += `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${t}" stroke-linejoin="round" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'ksight': {
      if (s.outline) inner += `<line x1="0" y1="${-half}" x2="0" y2="${half}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      inner += `<line x1="0" y1="${-half}" x2="0" y2="${half}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
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
    case 'double_ring': {
      const rO = half, rI = half * 0.5;
      if (s.outline) {
        inner += `<circle cx="0" cy="0" r="${rO}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
        inner += `<circle cx="0" cy="0" r="${rI}" fill="none" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      }
      inner += `<circle cx="0" cy="0" r="${rO}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      inner += `<circle cx="0" cy="0" r="${rI}" fill="none" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'hollow_cross': {
      const lines = [[0,-gap,0,-half],[0,gap,0,half],[-gap,0,-half,0],[gap,0,half,0]];
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t + 2}" opacity="${s.opacity/100}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline === 'none' ? '#000' : outline}" stroke-width="${Math.max(0.5, t - 0.5)}" opacity="${s.opacity/100}" />`;
      break;
    }
    case 'plus_dot': {
      const lines = [[0,-gap,0,-half],[0,gap,0,half],[-gap,0,-half,0],[gap,0,half,0]];
      if (s.outline) for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${outline}" stroke-width="${t + ow*2}" />`;
      for (const [x1,y1,x2,y2] of lines)
        inner += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${t}" opacity="${s.opacity/100}" />`;
      const dr = Math.max(1.5, t);
      inner += `<circle cx="0" cy="0" r="${dr}" fill="${color}" opacity="${s.opacity/100}" />`;
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

// ===== Built-in game preset dropdown =====
(async function loadGamePresets() {
  try {
    const presets = await api.listGamePresets();
    const sel = document.getElementById('gamePreset');
    if (!sel || !presets) return;
    for (const p of presets) {
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.label;
      sel.appendChild(opt);
    }
  } catch (e) { console.error('loadGamePresets failed', e); }
})();

const btnApplyPreset = document.getElementById('btn-apply-preset');
if (btnApplyPreset) {
  btnApplyPreset.addEventListener('click', async () => {
    const key = document.getElementById('gamePreset').value;
    if (!key) return alert('Pick a game first.');
    const r = await api.applyGamePreset(key);
    if (r.ok) {
      applyToUI(r.settings);
      alert(`Applied: ${r.note}`);
    }
  });
}

const btnCalibrate = document.getElementById('btn-calibrate');
if (btnCalibrate) {
  btnCalibrate.addEventListener('click', async () => {
    await api.startCalibration();
    alert('Calibration mode active. Switch to your game and click where you want the crosshair. Press Esc to cancel.');
  });
}

const btnDebugGrid = document.getElementById('btn-debug-grid');
if (btnDebugGrid) {
  btnDebugGrid.addEventListener('click', async () => {
    await api.toggleDebugGrid();
  });
}

// ===== Custom user-made game presets =====
async function refreshCustomGamePresets() {
  try {
    const list = await api.listCustomGamePresets();
    const container = document.getElementById('custom-game-presets');
    if (!container) return;
    container.innerHTML = '';
    for (const p of list) {
      const item = document.createElement('div');
      item.className = 'cgp-item';
      item.innerHTML = `
        <span class="cgp-dot"></span>
        <div>
          <div class="cgp-name"></div>
          <div class="cgp-offset"></div>
        </div>
        <button class="btn" data-act="apply">Apply</button>
        <button class="btn danger" data-act="delete">Delete</button>
      `;
      item.querySelector('.cgp-name').textContent = p.name;
      item.querySelector('.cgp-offset').textContent = `X: ${p.offsetX}px · Y: ${p.offsetY}px`;
      item.querySelector('[data-act="apply"]').addEventListener('click', async () => {
        const r = await api.applyCustomGamePreset(p.id);
        if (r.ok) {
          applyToUI(r.settings);
          alert(`Applied: ${p.name}`);
        }
      });
      item.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (!confirm(`Delete "${p.name}"?`)) return;
        await api.deleteCustomGamePreset(p.id);
        refreshCustomGamePresets();
      });
      container.appendChild(item);
    }
  } catch (e) { console.error('refreshCustomGamePresets failed', e); }
}

const btnSaveGamePreset = document.getElementById('btn-save-game-preset');
if (btnSaveGamePreset) {
  btnSaveGamePreset.addEventListener('click', async () => {
    await api.openGamePresetSaveDialog();
  });
}

if (api.onCustomGamePresetsUpdated) api.onCustomGamePresetsUpdated(() => refreshCustomGamePresets());
if (api.onNotify) api.onNotify(msg => alert(msg));

refreshCustomGamePresets();

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

async function loadCommunityConfig() {
  // Backend is hardcoded. Just show browse + upload directly and load the list.
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

// Hook into the tab nav to load community on first open
document.querySelector('[data-tab="community"]').addEventListener('click', () => {
  loadCommunityConfig();
});

// Load community config silently on app start
loadCommunityConfig();

// ============ PRESET GALLERY RENDERING ============
let currentFilter = 'all';
let userCustoms = [];

function renderPresetGallery() {
  const container = $('preset-gallery');
  if (!container) return;
  container.innerHTML = '';
  const items = currentFilter === 'all'
    ? BUILT_IN_PRESETS
    : BUILT_IN_PRESETS.filter(p => p.category === currentFilter);
  for (const p of items) {
    container.appendChild(makePresetCard(p, false));
  }
}

function renderCustomGallery() {
  const container = $('custom-gallery');
  if (!container) return;
  container.innerHTML = '';
  for (const p of userCustoms) {
    container.appendChild(makePresetCard(p, true));
  }
}

function makePresetCard(p, isCustom) {
  const card = document.createElement('div');
  card.className = 'preset-card';
  card.dataset.id = p.id;

  // Mini SVG preview
  const previewBox = 120;
  const pSettings = { ...p.preset };
  // Scale preset size to fit preview nicely
  const scale = Math.min(1, 70 / (pSettings.size || 32));
  const miniPreset = { ...pSettings, size: pSettings.size * scale, thickness: (pSettings.thickness || 2) * scale, gapSize: (pSettings.gapSize || 0) * scale, centerDotSize: (pSettings.centerDotSize || 2) * scale };
  const box = 100;
  const svgInner = buildShapeSVG(miniPreset);

  card.innerHTML = `
    ${isCustom ? '<button class="delete-btn" title="Delete">×</button>' : ''}
    <div class="preset-thumb">
      <svg viewBox="${-box/2} ${-box/2} ${box} ${box}" width="100%" height="100%">
        <g transform="rotate(${pSettings.rotation || 0})">${svgInner}</g>
      </svg>
    </div>
    <div class="preset-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
    <div class="preset-cat">${isCustom ? 'CUSTOM' : (p.category || '').toUpperCase()}</div>
  `;

  card.addEventListener('click', async e => {
    if (e.target.classList.contains('delete-btn')) return;
    const s = await api.setSettings(p.preset);
    applyToUI(s);
    // Highlight
    document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });

  if (isCustom) {
    card.querySelector('.delete-btn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete "${p.name}"?`)) return;
      await api.deleteCustomCrosshair(p.id);
      userCustoms = userCustoms.filter(x => x.id !== p.id);
      renderCustomGallery();
    });
  }

  return card;
}

// Filter chips
document.querySelectorAll('.chip').forEach(c => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    currentFilter = c.dataset.filter;
    renderPresetGallery();
  });
});

// "Create New" button → jumps to Designer tab
const btnGoDesigner = $('btn-go-designer');
if (btnGoDesigner) {
  btnGoDesigner.addEventListener('click', () => {
    document.querySelector('[data-tab="designer"]').click();
    resetDesigner();
  });
}

// Load user customs on startup
async function loadUserCustoms() {
  userCustoms = await api.listCustomCrosshairs();
  renderCustomGallery();
}

// ============ DESIGNER WORKSHOP ============
let designerState = {
  shape: 'cross',
  size: 24,
  thickness: 2,
  gapSize: 3,
  rotation: 0,
  opacity: 100,
  color: '#00FF00',
  outline: true,
  outlineColor: '#000000',
  outlineThickness: 1,
  centerDot: true,
  centerDotSize: 2,
  centerDotColor: '#FF0000'
};

function resetDesigner() {
  designerState = {
    shape: 'cross', size: 24, thickness: 2, gapSize: 3, rotation: 0, opacity: 100,
    color: '#00FF00', outline: true, outlineColor: '#000000', outlineThickness: 1,
    centerDot: true, centerDotSize: 2, centerDotColor: '#FF0000'
  };
  syncDesignerUI();
}

function syncDesignerUI() {
  const s = designerState;
  if (!$('d-size')) return;
  $('d-size').value = s.size; $('dval-size').textContent = s.size;
  $('d-thickness').value = s.thickness; $('dval-thickness').textContent = s.thickness;
  $('d-gap').value = s.gapSize; $('dval-gap').textContent = s.gapSize;
  $('d-rotation').value = s.rotation; $('dval-rotation').textContent = s.rotation;
  $('d-opacity').value = s.opacity; $('dval-opacity').textContent = s.opacity;
  $('d-color').value = s.color; $('d-colorHex').value = s.color.toUpperCase();
  $('d-outline').checked = s.outline;
  $('d-outlineColor').value = s.outlineColor; $('d-outlineColorHex').value = s.outlineColor.toUpperCase();
  $('d-outlineThickness').value = s.outlineThickness; $('dval-outlineThickness').textContent = s.outlineThickness;
  $('d-centerDot').checked = s.centerDot;
  $('d-centerDotSize').value = s.centerDotSize; $('dval-centerDotSize').textContent = s.centerDotSize;
  $('d-centerDotColor').value = s.centerDotColor; $('d-centerDotColorHex').value = s.centerDotColor.toUpperCase();
  document.querySelectorAll('.base-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.shape === s.shape);
  });
  renderWorkshop();
  validateDesign();
}

function renderWorkshop() {
  const canvas = $('workshop-canvas');
  if (!canvas) return;
  const s = designerState;
  const buffer = 30;
  const box = (s.size || 32) * 2 + buffer;
  const inner = buildShapeSVG(s);
  canvas.innerHTML = `<svg width="100%" height="100%" viewBox="${-box/2} ${-box/2} ${box} ${box}"><g transform="rotate(${s.rotation || 0})">${inner}</g></svg>`;
}

// ============ VALIDATION ============
function validateDesign() {
  const s = designerState;
  const warnings = [];
  const errors = [];

  // Size sanity
  if (s.size < 4) errors.push({ text: 'Size too small (minimum 4px)', type: 'error' });
  else if (s.size > 200) errors.push({ text: 'Size too large (maximum 200px)', type: 'error' });
  else if (s.size > 120) warnings.push({ text: 'Size is unusually large, may cover important HUD elements', type: 'warn' });

  // Thickness vs size ratio
  if (s.thickness > s.size / 2) warnings.push({ text: 'Thickness is too large relative to size, shape may look distorted', type: 'warn' });

  // Gap vs size
  if (s.gapSize > s.size / 2) warnings.push({ text: 'Gap is larger than half the size, arms may disappear', type: 'warn' });

  // Opacity very low
  if (s.opacity < 25) warnings.push({ text: 'Opacity very low, crosshair may be invisible in-game', type: 'warn' });

  // Outline color same as main color
  if (s.outline && s.outlineColor.toUpperCase() === s.color.toUpperCase()) {
    warnings.push({ text: 'Outline color matches main color, outline has no effect', type: 'warn' });
  }

  // Center dot larger than whole shape
  if (s.centerDot && s.centerDotSize > s.size / 2) {
    warnings.push({ text: 'Center dot is larger than shape arms', type: 'warn' });
  }

  // Shape-specific
  if (s.shape === 'dot' && s.centerDot && s.centerDotSize >= s.size / 4) {
    warnings.push({ text: 'Dot shape + center dot overlap, one of them is redundant', type: 'warn' });
  }

  // Color readability check (very light colors may not show on white backgrounds)
  const brightness = parseInt(s.color.slice(1, 3), 16) * 0.299 +
                     parseInt(s.color.slice(3, 5), 16) * 0.587 +
                     parseInt(s.color.slice(5, 7), 16) * 0.114;
  if (brightness > 240 && !s.outline) {
    warnings.push({ text: 'Very bright color without outline may not show on bright game backgrounds', type: 'warn' });
  }
  if (brightness < 20 && !s.outline) {
    warnings.push({ text: 'Very dark color without outline may not show on dark game backgrounds', type: 'warn' });
  }

  // Render validation panel
  const panel = $('validation-panel');
  if (!panel) return;
  const dot = $('v-status-dot');
  const text = $('v-status-text');
  const list = $('validation-list');
  list.innerHTML = '';

  if (errors.length > 0) {
    dot.className = 'v-dot error';
    text.textContent = `${errors.length} error${errors.length>1?'s':''} - fix before saving`;
  } else if (warnings.length > 0) {
    dot.className = 'v-dot warn';
    text.textContent = `${warnings.length} warning${warnings.length>1?'s':''} (OK to save)`;
  } else {
    dot.className = 'v-dot';
    text.textContent = 'All good, ready to save';
  }

  [...errors, ...warnings].forEach(item => {
    const li = document.createElement('li');
    if (item.type === 'error') li.className = 'error';
    li.textContent = item.text;
    list.appendChild(li);
  });

  return errors.length === 0;
}

// Wire up designer inputs
function wireDesigner() {
  const fields = ['size','thickness','gap','rotation','opacity','outlineThickness','centerDotSize'];
  const mapping = { gap: 'gapSize' };
  for (const f of fields) {
    const el = $('d-' + f);
    if (!el) continue;
    el.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      designerState[mapping[f] || f] = v;
      $('dval-' + f).textContent = v;
      renderWorkshop(); validateDesign();
    });
  }

  document.querySelectorAll('.base-btn').forEach(b => {
    b.addEventListener('click', () => {
      designerState.shape = b.dataset.shape;
      document.querySelectorAll('.base-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderWorkshop(); validateDesign();
    });
  });

  $('d-color').addEventListener('input', e => {
    designerState.color = e.target.value;
    $('d-colorHex').value = e.target.value.toUpperCase();
    renderWorkshop(); validateDesign();
  });
  $('d-colorHex').addEventListener('change', e => {
    if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value.trim())) {
      designerState.color = e.target.value.trim();
      $('d-color').value = designerState.color;
      renderWorkshop(); validateDesign();
    }
  });
  $('d-outlineColor').addEventListener('input', e => {
    designerState.outlineColor = e.target.value;
    $('d-outlineColorHex').value = e.target.value.toUpperCase();
    renderWorkshop(); validateDesign();
  });
  $('d-centerDotColor').addEventListener('input', e => {
    designerState.centerDotColor = e.target.value;
    $('d-centerDotColorHex').value = e.target.value.toUpperCase();
    renderWorkshop(); validateDesign();
  });
  $('d-outline').addEventListener('change', e => {
    designerState.outline = e.target.checked;
    renderWorkshop(); validateDesign();
  });
  $('d-centerDot').addEventListener('change', e => {
    designerState.centerDot = e.target.checked;
    renderWorkshop(); validateDesign();
  });

  $('btn-reset-design').addEventListener('click', resetDesigner);
  $('btn-finish-design').addEventListener('click', async () => {
    if (!validateDesign()) {
      alert('Fix the errors before saving. Check the validation panel.');
      return;
    }
    showSaveDialog();
  });
}

function showSaveDialog() {
  const bg = document.createElement('div');
  bg.className = 'save-dialog-bg';
  bg.innerHTML = `
    <div class="save-dialog">
      <h3>Finish &amp; Save</h3>
      <p>Give your crosshair a name. It will be saved to "Your Custom Crosshairs".</p>
      <input type="text" id="save-name-input" placeholder="e.g. My Awesome Crosshair" maxlength="30" autofocus />
      <div class="actions">
        <button class="btn ghost" id="save-cancel">Cancel</button>
        <button class="btn" id="save-confirm">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const input = bg.querySelector('#save-name-input');
  input.focus();

  const close = () => bg.remove();
  bg.querySelector('#save-cancel').addEventListener('click', close);
  bg.addEventListener('click', e => { if (e.target === bg) close(); });

  const save = async () => {
    const name = input.value.trim();
    if (!name) return alert('Name is required.');
    if (name.length < 2) return alert('Name too short (min 2 chars).');
    if (name.length > 30) return alert('Name too long (max 30 chars).');
    if (!/^[a-zA-Z0-9 _\-.]+$/.test(name)) return alert('Name can only contain letters, numbers, spaces, dash, underscore, dot.');

    const result = await api.saveCustomCrosshair({
      name,
      preset: { ...designerState }
    });
    if (result.ok) {
      userCustoms = result.list;
      renderCustomGallery();
      close();
      alert(`"${name}" saved to Your Custom Crosshairs!`);
      // Also apply it
      const s = await api.setSettings(designerState);
      applyToUI(s);
    } else {
      alert('Save failed: ' + result.error);
    }
  };

  bg.querySelector('#save-confirm').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}

// Init when Designer tab becomes active
document.querySelector('[data-tab="designer"]').addEventListener('click', () => {
  wireDesigner();
  syncDesignerUI();
});

// Init presets on page load
renderPresetGallery();
loadUserCustoms();

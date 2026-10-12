// Tiny SVG kit shared by the /future figures. No dependencies: every figure is plain
// SVG text so it diffs in git, renders everywhere, and can be regenerated offline.
//
// Two palettes: "dark" for rowbose.com, "light" for the printed whitepaper.

export const PALETTES = {
  dark: {
    bg: '#0b1220', panel: '#111a2e', panel2: '#17233b', line: '#2a3a5a', text: '#eaf0fa',
    muted: '#9fb0cc', accent: '#22d3ee', accentSoft: 'rgba(34,211,238,.12)', private: '#a78bfa',
    privateSoft: 'rgba(167,139,250,.14)', neu: '#fbbf24', neuSoft: 'rgba(251,191,36,.14)',
    ok: '#34d399', okSoft: 'rgba(52,211,153,.14)', onAccent: '#04121a',
  },
  light: {
    bg: '#ffffff', panel: '#f4f7fb', panel2: '#e9eff7', line: '#b9c6da', text: '#0f172a',
    muted: '#475569', accent: '#0a7c8c', accentSoft: 'rgba(10,124,140,.10)', private: '#6d4fd6',
    privateSoft: 'rgba(109,79,214,.10)', neu: '#b45309', neuSoft: 'rgba(180,83,9,.10)',
    ok: '#047857', okSoft: 'rgba(4,120,87,.10)', onAccent: '#ffffff',
  },
};

// SVG shown through <img> cannot use the page's web fonts, so use a stack that exists everywhere.
export const FONT = "Inter, 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const MONO = "'Fira Code', ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function kit(T) {
  const k = {};

  // text: "\n" makes new lines; opts.size, weight, fill, anchor, mono, ls (letter-spacing), lh (line height)
  k.text = (x, y, str, o = {}) => {
    const size = o.size || 24, lh = o.lh || 1.22, anchor = o.anchor || 'start';
    const lines = String(str).split('\n');
    const first = o.vcenter ? y - ((lines.length - 1) * size * lh) / 2 + size * 0.36 : y;
    const tsp = lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(l)}</tspan>`).join('');
    return `<text x="${x}" y="${first}" font-family="${o.mono ? MONO : FONT}" font-size="${size}" font-weight="${o.weight || 500}" fill="${o.fill || T.text}" text-anchor="${anchor}"${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.opacity ? ` opacity="${o.opacity}"` : ''}>${tsp}</text>`;
  };

  k.box = (x, y, w, h, o = {}) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 16}" fill="${o.fill || T.panel}" stroke="${o.stroke || 'none'}" stroke-width="${o.sw ?? 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;

  k.circle = (cx, cy, r, o = {}) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill || 'none'}" stroke="${o.stroke || 'none'}" stroke-width="${o.sw ?? 2}"/>`;

  // curved connector from (x1,y1) down/up to (x2,y2)
  k.edge = (x1, y1, x2, y2, o = {}) => {
    const ym = (y1 + y2) / 2;
    return `<path d="M${x1} ${y1} C${x1} ${ym} ${x2} ${ym} ${x2} ${y2}" fill="none" stroke="${o.stroke || T.line}" stroke-width="${o.sw ?? 2.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ` marker-end="url(#ah-${o.arrow})"` : ''}/>`;
  };
  k.line = (x1, y1, x2, y2, o = {}) =>
    `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${o.stroke || T.line}" stroke-width="${o.sw ?? 2.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ` marker-end="url(#ah-${o.arrow})"` : ''}/>`;
  k.path = (d, o = {}) =>
    `<path d="${d}" fill="${o.fill || 'none'}" stroke="${o.stroke || T.line}" stroke-width="${o.sw ?? 2.5}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ` marker-end="url(#ah-${o.arrow})"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`;

  k.defs = () => {
    const mk = (id, c) => `<marker id="ah-${id}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
    return `<defs>${mk('accent', T.accent)}${mk('muted', T.muted)}${mk('ok', T.ok)}${mk('neu', T.neu)}${mk('private', T.private)}${mk('text', T.text)}</defs>`;
  };

  // 48x48 line icons, drawn at (x,y) with size s
  const ICONS = {
    person: (c) => `<circle cx="24" cy="15" r="8"/><path d="M8 42c0-10 7-15 16-15s16 5 16 15"/>`,
    robot: (c) => `<rect x="9" y="16" width="30" height="24" rx="7"/><path d="M24 16V9"/><circle cx="24" cy="6.5" r="2.6"/><circle cx="18" cy="27" r="2.6" fill="${c}"/><circle cx="30" cy="27" r="2.6" fill="${c}"/><path d="M18 34h12M5 25v8M43 25v8"/>`,
    building: (c) => `<rect x="10" y="6" width="28" height="36" rx="3"/><path d="M17 14h4M27 14h4M17 22h4M27 22h4M17 30h4M27 30h4M21 42v-6h6v6"/>`,
    laptop: (c) => `<rect x="9" y="11" width="30" height="21" rx="3"/><path d="M3 38h42"/>`,
    chip: (c) => `<rect x="13" y="13" width="22" height="22" rx="4"/><rect x="19" y="19" width="10" height="10" rx="2"/><path d="M19 7v6M29 7v6M19 35v6M29 35v6M7 19h6M7 29h6M35 19h6M35 29h6"/>`,
    graph: (c) => `<circle cx="24" cy="10" r="5"/><circle cx="10" cy="36" r="5"/><circle cx="38" cy="36" r="5"/><path d="M21 15l-8 16M27 15l8 16M15 36h18"/>`,
    check: (c) => `<path d="M10 25l10 10 18-21"/>`,
    search: (c) => `<circle cx="21" cy="21" r="11"/><path d="M29 29l12 12"/>`,
    shield: (c) => `<path d="M24 5l15 6v11c0 10-6 17-15 21C15 39 9 32 9 22V11z"/><path d="M16 24l6 6 11-12"/>`,
    gap: (c) => `<rect x="8" y="14" width="32" height="20" rx="5" stroke-dasharray="5 5"/><path d="M24 20v8M20 24h8"/>`,
    cloud: (c) => `<path d="M14 36a9 9 0 0 1 1-18 11 11 0 0 1 21 3 7.5 7.5 0 0 1-1 15z"/>`,
    box: (c) => `<path d="M24 5l17 8v22l-17 8-17-8V13z"/><path d="M7 13l17 8 17-8M24 21v22"/>`,
  };
  k.icon = (name, x, y, s, color) =>
    `<g transform="translate(${x} ${y}) scale(${s / 48})" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name](color)}</g>`;

  // Lego-style brick: studs on top say "snaps together"
  k.brick = (x, y, w, h, o = {}) => {
    const c = o.color || T.accent, soft = o.soft || T.accentSoft;
    const sw = Math.min(26, w * 0.2);
    const studs = [0.28, 0.72].map((f) => `<rect x="${x + w * f - sw / 2}" y="${y - 9}" width="${sw}" height="11" rx="4" fill="${soft}" stroke="${c}" stroke-width="2.2"/>`).join('');
    const body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${T.panel2}" stroke="${c}" stroke-width="${o.sw ?? 2.6}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${soft}"/>`;
    const label = k.text(x + w / 2, y + (o.tag ? h * 0.42 : h / 2), o.label, { size: o.size || 20, weight: 700, anchor: 'middle', vcenter: true, lh: 1.15 });
    const tag = o.tag ? k.text(x + w / 2, y + h - 12, o.tag, { size: 15, anchor: 'middle', mono: true, fill: T.muted, weight: 400 }) : '';
    const seal = o.seal ? `<circle cx="${x + w - 4}" cy="${y + 4}" r="13" fill="${c}"/>${k.icon('check', x + w - 4 - 9, y + 4 - 9, 18, T.onAccent)}` : '';
    return studs + body + label + tag + seal;
  };

  // small pill, text centered. Returns svg; width is estimated from the text.
  k.pill = (cx, cy, str, o = {}) => {
    const size = o.size || 18, w = Math.max(56, str.length * size * (o.wide ? 0.8 : 0.62) + 26), h = size + 14;
    return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${o.fill || T.accentSoft}" stroke="${o.stroke || T.accent}" stroke-width="2"/>` +
      k.text(cx, cy, str, { size, weight: 700, anchor: 'middle', fill: o.color || o.stroke || T.accent, vcenter: true, ls: o.ls });
  };

  k.svg = (W, H, body, title, desc) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">` +
    `<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>${k.defs()}` +
    `<rect width="${W}" height="${H}" fill="${T.bg}"/>${body}</svg>\n`;

  return k;
}

// Visual-only restyle of Gmail. This script never touches mail data: it adds root classes
// and CSS variables from the settings, letter avatars and date-group labels as data
// attributes, and a small settings panel. The CSS does the rest.
(() => {
  const root = document.documentElement;

  // ---------- Settings ----------

  const DEFAULTS = {
    enabled: true,
    width: 760,
    density: 'comfy',
    listText: 15,
    emailText: 14,
    avatars: true,
    dateGroups: true,
    snippets: false,
    checkboxes: false,
    headerIcons: 'hover',
    hoverColor: '#f2f2f2',
  };

  const WIDTH_PRESETS = { Narrow: 640, Medium: 760, Wide: 900 };
  const WIDTH_RANGE = { min: 480, max: 1600 };
  const TEXT_RANGE = { min: 11, max: 22 };

  let settings = { ...DEFAULTS };
  let panel = null;

  function apply() {
    const s = settings;
    root.classList.toggle('sg', s.enabled);
    root.classList.toggle('sg-compact', s.density === 'compact');
    root.classList.toggle('sg-no-avatars', !s.avatars);
    root.classList.toggle('sg-no-groups', !s.dateGroups);
    root.classList.toggle('sg-snippets', s.snippets);
    root.classList.toggle('sg-checkboxes', s.checkboxes);
    root.classList.toggle('sg-icons-always', s.headerIcons === 'always');
    root.style.setProperty('--sg-width', `${s.width}px`);
    root.style.setProperty('--sg-list-text', `${s.listText}px`);
    root.style.setProperty('--sg-email-text', `${s.emailText}px`);
    root.style.setProperty('--sg-hover', s.hoverColor);
    panel?.sync();
  }

  // `persist: false` applies live (while dragging a slider) without spending storage writes.
  function update(partial, { persist = true } = {}) {
    settings = { ...settings, ...partial };
    apply();
    if (persist) chrome.storage.sync.set(partial);
  }

  apply();
  chrome.storage.sync.get(DEFAULTS, (stored) => {
    settings = { ...DEFAULTS, ...stored };
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue === undefined ? DEFAULTS[key] : newValue;
    }
    apply();
  });

  // ---------- Thread-list decoration ----------

  const AVATAR_COLORS = ['#5c6bc0', '#26a69a', '#7e57c2', '#ef6c00', '#42a5f5', '#8d6e63', '#ec407a', '#66bb6a', '#78909c'];

  function colorFor(text) {
    let hash = 0;
    for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }

  // A row lists several participants ("me, Ilan 3"); show the first one who isn't the user.
  function senderOf(cell) {
    const people = [...cell.querySelectorAll('[email]')];
    const other = people.find((p) => p.textContent.trim().toLowerCase() !== 'me') || people[0];
    if (!other) return null;
    const name = (other.getAttribute('name') || other.textContent || other.getAttribute('email')).trim();
    return { name, key: other.getAttribute('email') || name };
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // Gmail puts the full timestamp in the date cell's title, e.g. "Wed, Sep 30, 2026, 9:32 AM".
  function groupFor(title) {
    if (!title) return null;
    const date = new Date(title.replace(/^[A-Za-z]{3},\s*/, '').replace(/,(?=\s*\d{1,2}:)/, ''));
    if (Number.isNaN(date.getTime())) return null;
    const now = new Date();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return 'This month';
    if (date.getFullYear() === now.getFullYear()) return date.toLocaleString('en', { month: 'long' });
    return String(date.getFullYear());
  }

  function setAttr(el, name, value) {
    if (value == null || value === '') {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  function decorate() {
    for (const tbody of document.querySelectorAll('[gh="tl"] table.F > tbody')) {
      let previous = null;
      let index = 0;
      for (const row of tbody.querySelectorAll(':scope > tr.zA')) {
        const cell = row.querySelector('td.yX');
        const sender = cell && senderOf(cell);
        if (sender) {
          setAttr(cell, 'data-sg-initial', sender.name.charAt(0).toUpperCase());
          const color = colorFor(sender.key);
          if (cell.style.getPropertyValue('--sg-avatar') !== color) cell.style.setProperty('--sg-avatar', color);
        }

        // Label the first row of each date group; a leading "Today" group stays unlabeled.
        const group = groupFor(row.querySelector('td.xW [title]')?.getAttribute('title'));
        const starts = group && group !== previous && !(index === 0 && group === 'Today');
        setAttr(row, 'data-sg-group', starts ? group : null);
        previous = group;
        index += 1;
      }
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      decorate();
      mountPanel();
    });
  }

  new MutationObserver(schedule).observe(root, { childList: true, subtree: true });

  // ---------- Settings panel ----------
  // Built with DOM calls rather than innerHTML: Gmail enforces Trusted Types.

  // The "Customize" pill sits in the header, just left of the account avatar. Gmail can
  // re-render the header, so this runs on every mutation batch and re-inserts if needed.
  function mountPanel() {
    const avatar = document.querySelector('header a[aria-label^="Google Account"]');
    const anchor = avatar?.closest('header div:has(> div > div > a[aria-label^="Google Account"])');
    if (!anchor) return;
    panel ??= createPanel();
    if (anchor.previousElementSibling !== panel.host) anchor.before(panel.host);
  }

  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else if (key in el) el[key] = value;
      else el.setAttribute(key, value);
    }
    for (const child of [].concat(children)) el.append(child);
    return el;
  }

  function gearIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M19.14 12.94a7.1 7.1 0 0 0 .05-.94 7.1 7.1 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.1 7.1 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z');
    svg.append(path);
    return svg;
  }

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: 'Google Sans', Roboto, Arial, sans-serif; }
    :host { display: inline-flex; vertical-align: middle; margin: 0 4px; }
    .pill {
      height: 36px; padding: 0 14px 0 10px; border-radius: 999px; cursor: pointer;
      display: flex; align-items: center; gap: 6px;
      border: 1px solid #c4c7c5; background: #fff; color: #444746;
      font-size: 14px; font-weight: 500; white-space: nowrap;
    }
    .pill:hover { background: #f2f2f2; }
    .pill svg { transition: transform .2s; }
    .pill:hover svg { transform: rotate(30deg); }
    .pill[aria-expanded='true'] { background: #e8f0fe; border-color: #a8c7fa; color: #0b57d0; }
    .panel {
      position: fixed; top: 60px; right: 16px; z-index: 1000;
      width: 320px; max-height: calc(100vh - 80px); overflow-y: auto;
      padding: 18px 20px 14px; border-radius: 20px; background: #fff; color: #1f1f1f;
      box-shadow: 0 2px 6px rgba(0,0,0,.15), 0 12px 32px rgba(0,0,0,.15);
      font-size: 13px;
    }
    .panel[hidden] { display: none; }
    .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .title { font-size: 16px; font-weight: 500; }
    .section { margin-top: 16px; }
    .label { display: flex; justify-content: space-between; margin-bottom: 8px; color: #444746; font-weight: 500; }
    .value { color: #1f1f1f; font-variant-numeric: tabular-nums; }
    .muted { color: #5f6368; font-weight: 400; }
    .body.off { opacity: .45; }
    input[type=range] { width: 100%; accent-color: #0b57d0; margin: 0; }
    .row { display: flex; gap: 8px; align-items: center; }
    .px { width: 76px; padding: 6px 8px; border: 1px solid #c4c7c5; border-radius: 10px; font-size: 13px; }
    .chips, .seg { display: flex; gap: 6px; margin-top: 8px; }
    .chip, .seg button {
      flex: 1; padding: 6px 0; border: 1px solid #c4c7c5; border-radius: 999px;
      background: #fff; color: #1f1f1f; font-size: 12px; cursor: pointer;
    }
    .chip.on, .seg button.on { background: #e8f0fe; border-color: #a8c7fa; color: #0b57d0; }
    .check { display: flex; align-items: center; gap: 10px; padding: 5px 0; cursor: pointer; }
    .check input { accent-color: #0b57d0; width: 16px; height: 16px; margin: 0; }
    .switch { position: relative; width: 36px; height: 20px; }
    .switch input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; position: absolute; z-index: 1; }
    .switch span { position: absolute; inset: 0; border-radius: 999px; background: #c4c7c5; transition: background .15s; }
    .switch span::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
    .switch input:checked + span { background: #0b57d0; }
    .switch input:checked + span::after { transform: translateX(16px); }
    .color { width: 36px; height: 24px; padding: 0; border: 1px solid #c4c7c5; border-radius: 8px; background: none; cursor: pointer; }
    .foot { margin-top: 16px; padding-top: 10px; border-top: 1px solid #ececec; text-align: right; }
    .link { border: 0; background: none; color: #0b57d0; font-size: 12px; cursor: pointer; padding: 4px; }
  `;

  function createPanel() {
    const host = h('div', { id: 'sg-settings' });
    const shadow = host.attachShadow({ mode: 'open' });
    const controls = [];

    // Gmail's keyboard shortcuts listen on the document; keep typing inside the panel.
    for (const type of ['keydown', 'keypress', 'keyup']) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }

    function slider(key, range, unit = 'px') {
      const value = h('span', { class: 'value' });
      const input = h('input', {
        type: 'range', min: range.min, max: range.max, step: 1,
        oninput: () => update({ [key]: Number(input.value) }, { persist: false }),
        onchange: () => update({ [key]: Number(input.value) }),
      });
      controls.push(() => {
        input.value = settings[key];
        value.textContent = `${settings[key]}${unit}`;
      });
      return { input, value };
    }

    function segmented(key, options) {
      const buttons = options.map(([label, val]) => h('button', { type: 'button', onclick: () => update({ [key]: val }) }, label));
      controls.push(() => buttons.forEach((b, i) => b.classList.toggle('on', settings[key] === options[i][1])));
      return h('div', { class: 'seg' }, buttons);
    }

    function check(key, label, hint) {
      const input = h('input', { type: 'checkbox', onchange: () => update({ [key]: input.checked }) });
      controls.push(() => { input.checked = settings[key]; });
      return h('label', { class: 'check' }, [input, h('span', {}, label), hint ? h('span', { class: 'muted' }, hint) : '']);
    }

    // Width: exact px (slider + number box) plus presets.
    const width = slider('width', WIDTH_RANGE);
    const widthBox = h('input', {
      type: 'number', class: 'px', min: WIDTH_RANGE.min, max: WIDTH_RANGE.max, step: 10,
      onchange: () => {
        const px = Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, Math.round(Number(widthBox.value) || DEFAULTS.width)));
        update({ width: px });
      },
    });
    const presetChips = Object.entries(WIDTH_PRESETS).map(([label, px]) => h('button', { type: 'button', class: 'chip', onclick: () => update({ width: px }) }, `${label} · ${px}`));
    controls.push(() => {
      if (shadow.activeElement !== widthBox) widthBox.value = settings.width;
      presetChips.forEach((chip, i) => chip.classList.toggle('on', settings.width === Object.values(WIDTH_PRESETS)[i]));
    });

    const listText = slider('listText', TEXT_RANGE);
    const emailText = slider('emailText', TEXT_RANGE);

    const enabled = h('input', { type: 'checkbox', onchange: () => update({ enabled: enabled.checked }) });
    const hover = h('input', { type: 'color', class: 'color', onchange: () => update({ hoverColor: hover.value }), oninput: () => update({ hoverColor: hover.value }, { persist: false }) });
    controls.push(() => {
      enabled.checked = settings.enabled;
      hover.value = settings.hoverColor;
      body.classList.toggle('off', !settings.enabled);
    });

    const body = h('div', { class: 'body' }, [
      h('div', { class: 'section' }, [
        h('div', { class: 'label' }, ['Content width', width.value]),
        h('div', { class: 'row' }, [width.input, widthBox]),
        h('div', { class: 'chips' }, presetChips),
      ]),
      h('div', { class: 'section' }, [h('div', { class: 'label' }, ['List text size', listText.value]), listText.input]),
      h('div', { class: 'section' }, [h('div', { class: 'label' }, ['Email text size', emailText.value]), emailText.input]),
      h('div', { class: 'section' }, [h('div', { class: 'label' }, 'Row spacing'), segmented('density', [['Compact', 'compact'], ['Comfy', 'comfy']])]),
      h('div', { class: 'section' }, [
        h('div', { class: 'label' }, 'Show'),
        check('avatars', 'Avatars'),
        check('dateGroups', 'Date groups'),
        check('snippets', 'Message preview'),
        check('checkboxes', 'Checkboxes'),
      ]),
      h('div', { class: 'section' }, [h('div', { class: 'label' }, 'Header icons'), segmented('headerIcons', [['On hover', 'hover'], ['Always', 'always']])]),
      h('div', { class: 'section' }, [h('div', { class: 'row', style: 'justify-content: space-between' }, [h('span', { class: 'label', style: 'margin: 0' }, 'Row hover color'), hover])]),
    ]);

    const box = h('div', { class: 'panel', hidden: true }, [
      h('div', { class: 'head' }, [
        h('span', { class: 'title' }, 'Simple Gmail'),
        h('label', { class: 'switch', title: 'Turn the restyle on or off' }, [enabled, h('span')]),
      ]),
      body,
      h('div', { class: 'foot' }, [h('button', { type: 'button', class: 'link', onclick: () => { settings = { ...DEFAULTS }; apply(); chrome.storage.sync.set(DEFAULTS); } }, 'Reset to defaults')]),
    ]);

    const pill = h('button', { type: 'button', class: 'pill', title: 'Clean Gmail settings', 'aria-expanded': 'false', onclick: () => toggle() }, [gearIcon(), 'Customize']);

    function toggle(open = box.hidden) {
      box.hidden = !open;
      pill.setAttribute('aria-expanded', String(open));
    }

    document.addEventListener('click', (event) => {
      if (!box.hidden && !event.composedPath().includes(host)) toggle(false);
    });
    host.addEventListener('keydown', (event) => { if (event.key === 'Escape') toggle(false); });

    shadow.append(h('style', {}, PANEL_CSS), pill, box);

    const api = { host, sync: () => controls.forEach((fn) => fn()) };
    api.sync();
    return api;
  }
})();

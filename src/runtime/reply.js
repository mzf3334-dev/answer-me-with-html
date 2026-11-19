// Answer on the page: every panel gets a Comment box, and the Reply button collects the ask answers, the comments and the remarks
// into one Markdown reply (replyText) to copy back to the agent. Answers and comments stay in localStorage across reloads.
// The remark script (remark.js) adds the blocks the reader marked, through window.__amRemarkData, and tells this script about a change
// with an "am-remark-change" event on the document.
// The Reply sheet shows the reply drawn (replyViewHtml) with the Markdown that Copy copies under a fold. Once the reader has given any
// input, a bar at the bottom of the page shows the counts and copies the reply in one click, so there is no trip to the top-right button.
const replyBtn = document.querySelector('[data-am="reply"]');
const COMMENT_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
// The JSON file one reader exports and another imports: a small, versioned record of the answers, comments and remarks.
// A demo page carries little data, so the file is capped well above a normal reply and a malformed one cannot fill storage.
const DATA_FORMAT = 'answer-me-with-html.reply';
const DATA_VERSION = 1;
const MAX_DATA_ITEMS = 100;
const MAX_DATA_TEXT = 10000;
if (replyBtn) {
  const ui = JSON.parse(replyBtn.dataset.ui);
  const storeKey = `am-reply:${location.pathname}`;
  // A page served by `am serve` runs without localStorage and the phone may discard its tab, so it keeps the answers on the
  // server: data-am-save names the write route and data-am-state carries what the server already holds for this page version.
  const serve = (() => {
    const { amSave: save, amState: state } = document.body?.dataset ?? {};
    if (!save) return null;
    try {
      return { save, restored: state ? JSON.parse(state) : null };
    } catch {
      return { save, restored: null };
    }
  })();
  let saveTimer = null;
  let pendingPatch = null;
  const sendSave = (patch) => {
    fetch(serve.save, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch), keepalive: true })
      .catch(() => {}); // a page that cannot reach the server keeps its state until it closes, as before
  };
  // Typing must not put one request per keystroke on the server; localStorage is written at once, the network follows.
  const saveSoon = (patch) => {
    clearTimeout(saveTimer);
    pendingPatch = patch;
    saveTimer = setTimeout(() => {
      pendingPatch = null;
      sendSave(patch);
    }, 400);
  };
  // A hidden or closing page sends the change it still holds, before the timer can run.
  const flushSave = () => {
    if (!pendingPatch) return;
    clearTimeout(saveTimer);
    sendSave(pendingPatch);
    pendingPatch = null;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });
  window.addEventListener('pagehide', flushSave);
  const panels = [...document.querySelectorAll('.am-panel')];
  const asks = [...document.querySelectorAll('.am-ask')];
  // Answers are saved by question text, so they still match after am patch has renumbered the asks.
  // Page text without the word joiners a right-to-left page puts after a Hebrew prefix hyphen (src/bidi.js): the reply and the saved
  // answers hold the text as the draft wrote it, a formula too (src/runtime/math-text.js).
  const WJ = new RegExp(String.fromCharCode(0x2060), 'g');
  const textOf = (el) => el && textWithMath(el).replace(WJ, '').trim();
  const keyOf = (ask) => textOf(ask.querySelector('legend')) ?? ask.dataset.ask;
  const touched = new Set();
  // One entry per panel: the box, its button and the function that opens the box, so an import can fill and reveal it.
  const slots = new Map();
  // The reader's department and staff name, loaded from the saved reply below. The export file carries them in its name.
  const user = { department: '', staffName: '' };
  // The bar is built below with the sheet; the handlers that change the counts only call this.
  let refreshBar = () => {};
  // The textarea a failed copy keeps selected, so the reader can still use the keyboard shortcut.
  let stuck = null;

  const load = () => {
    if (serve?.restored?.reply) return serve.restored.reply;
    try {
      return JSON.parse(localStorage.getItem(storeKey)) || {};
    } catch {
      return {};
    }
  };
  const save = () => {
    const state = {
      asks: Object.fromEntries(asks.map((a) => [keyOf(a), { picked: picked(a), touched: touched.has(a) }])),
      comments: Object.fromEntries([...slots].map(([id, slot]) => [id, slot.box.value]).filter(([, text]) => text.trim())),
      user: { department: user.department, staffName: user.staffName },
    };
    try {
      localStorage.setItem(storeKey, JSON.stringify(state));
    } catch {
      // Storage may be off (private window, file:// policy); answers then last until the page closes.
    }
    if (serve) saveSoon({ reply: state });
  };
  const picked = (ask) => [...ask.querySelectorAll('input')].filter((i) => i.checked).map((i) => i.value);
  const panelOf = (el) => {
    const panel = el.closest('.am-panel');
    return { id: panel?.id.replace(/^panel-/, '') ?? '', title: textOf(panel?.querySelector('.am-panel-head h2')) ?? '' };
  };

  const saved = load();
  if (saved.user && typeof saved.user === 'object') {
    user.department = typeof saved.user.department === 'string' ? saved.user.department.slice(0, 100) : '';
    user.staffName = typeof saved.user.staffName === 'string' ? saved.user.staffName.slice(0, 100) : '';
  }
  for (const ask of asks) {
    const inputs = [...ask.querySelectorAll('input')];
    const state = saved.asks?.[keyOf(ask)];
    // A saved answer applies only while every picked option still exists on the page, and only if the reader clicked: older versions started
    // with the suggestion selected and saved it untouched, and that state must come back unselected.
    if (state?.touched && Array.isArray(state.picked) && state.picked.every((v) => inputs.some((i) => i.value === v))) {
      for (const input of inputs) input.checked = state.picked.includes(input.value);
      touched.add(ask);
    }
    // A click counts even on the option that is already picked: the reader confirms the suggestion.
    const answer = () => {
      touched.add(ask);
      save();
      refreshBar();
    };
    ask.addEventListener('change', answer);
    ask.addEventListener('click', (e) => { if (e.target.matches('input')) answer(); });
  }

  for (const panel of panels) {
    const id = panel.id.replace(/^panel-/, '');
    // An icon only: narrow panels have no room for a word next to the title.
    const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'am-comment-btn', title: ui.comment, innerHTML: COMMENT_ICON });
    btn.setAttribute('aria-label', `${ui.comment} ${id}`);
    btn.setAttribute('aria-expanded', 'false');
    const wrap = Object.assign(document.createElement('div'), { className: 'am-comment', hidden: true });
    const box = Object.assign(document.createElement('textarea'), { rows: 3, placeholder: ui.commentHint, value: saved.comments?.[id] ?? '' });
    box.setAttribute('aria-label', `${ui.comment} ${id}`);
    wrap.append(box);
    const show = (open) => {
      wrap.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => {
      show(wrap.hidden);
      if (!wrap.hidden) box.focus();
    });
    box.addEventListener('input', () => {
      btn.classList.toggle('am-comment-btn--on', Boolean(box.value.trim()));
      save();
      refreshBar();
    });
    btn.classList.toggle('am-comment-btn--on', Boolean(box.value.trim()));
    if (box.value.trim()) show(true);
    (panel.querySelector('.am-panel-head') ?? panel).append(btn);
    panel.append(wrap);
    slots.set(id, { box, btn, show });
  }

  const sheet = document.createElement('dialog');
  sheet.className = 'am-reply';
  sheet.setAttribute('aria-label', ui.title);
  sheet.innerHTML = '<div class="am-reply-head"><strong></strong><span></span></div><div class="am-reply-id"><label class="am-reply-field"><span></span><input type="text" data-am-id="department" autocomplete="organization" maxlength="100"></label><label class="am-reply-field"><span></span><input type="text" data-am-id="staff" autocomplete="name" maxlength="100"></label></div><div class="am-reply-view" tabindex="0"></div><details class="am-reply-raw"><summary></summary><textarea readonly rows="10"></textarea></details><div class="am-reply-actions"><span class="am-reply-status" aria-live="polite"></span><button type="button" class="am-btn" data-act="copy"></button><button type="button" class="am-btn" data-act="export"></button><button type="button" class="am-btn" data-act="import"></button><button type="button" class="am-btn" data-act="close"></button></div><input type="file" class="am-reply-file" accept="application/json,.json" hidden>';
  sheet.querySelector('strong').textContent = ui.title;
  sheet.querySelector('span').textContent = ui.hint;
  sheet.querySelector('summary').textContent = ui.raw;
  const view = sheet.querySelector('.am-reply-view');
  const raw = sheet.querySelector('details');
  const text = sheet.querySelector('textarea');
  const status = sheet.querySelector('.am-reply-status');
  const fileInput = sheet.querySelector('.am-reply-file');
  const idFields = {
    department: sheet.querySelector('[data-am-id="department"]'),
    staffName: sheet.querySelector('[data-am-id="staff"]'),
  };
  const idLabels = sheet.querySelectorAll('.am-reply-id .am-reply-field span');
  idLabels[0].textContent = ui.department;
  idLabels[1].textContent = ui.staffName;
  for (const [key, field] of Object.entries(idFields)) {
    field.value = user[key];
    field.setAttribute('aria-label', key === 'department' ? ui.department : ui.staffName);
    field.addEventListener('input', () => {
      user[key] = field.value.slice(0, 100);
      save();
    });
  }
  const syncIdFields = () => {
    idFields.department.value = user.department;
    idFields.staffName.value = user.staffName;
  };
  const copy = sheet.querySelector('[data-act="copy"]');
  const exportBtn = sheet.querySelector('[data-act="export"]');
  const importBtn = sheet.querySelector('[data-act="import"]');
  const close = sheet.querySelector('[data-act="close"]');
  copy.textContent = ui.copy;
  exportBtn.textContent = ui.exportJson;
  importBtn.textContent = ui.importJson;
  close.textContent = ui.close;
  document.body.append(sheet);

  const compose = () => {
    const decisions = asks.map((ask) => ({
      panel: panelOf(ask).id,
      question: textOf(ask.querySelector('legend')) ?? '',
      picked: picked(ask),
      suggested: [...ask.querySelectorAll('input[data-suggested]')].map((i) => i.value),
      touched: touched.has(ask),
    }));
    const comments = [...slots].map(([id, slot]) => ({ panel: id, title: panelOf(slot.box).title, text: slot.box.value }));
    const remarks = window.__amRemarkData?.() ?? [];
    const empty = !decisions.length && !comments.some((c) => c.text.trim()) && !remarks.length;
    const title = textOf(document.querySelector('.am-head h1')) ?? document.title;
    return empty ? '' : replyText({ title, decisions, comments, remarks, ui, rtl: document.documentElement.dir === 'rtl' });
  };

  // The JSON file the reader sends back. It holds the same answers, comments and remarks as the Markdown reply, in a form
  // another copy of the page can load. The filename is {HTML name}_{department}_{staff name}_{local yyyyMMddHHmmss}.json,
  // so files from different readers and moments sort and pair by name. Only characters Windows refuses, and whitespace,
  // change to "-"; other letters (Chinese included) stay.
  const filePart = (value, max = 60) => String(value).trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
  const pad2 = (n) => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  };
  // The name of the HTML file the reader opened, not the draft's file: meta: a page saved as eal_form.html exports an
  // eal_form_* file even when its draft called it something else. The meta name is the fallback when the URL has no name.
  const pageName = () => {
    let base = location.pathname.split('/').pop() ?? '';
    try { base = decodeURIComponent(base); } catch {}
    return filePart(base.replace(/\.html?$/i, ''), 80) || filePart(document.body?.dataset?.amFile ?? '', 80) || 'form';
  };
  const exportName = (who) => `${pageName()}_${filePart(who.department, 40)}_${filePart(who.staffName, 40)}_${stamp()}.json`;
  const exportData = (who) => {
    const title = textOf(document.querySelector('.am-head h1')) ?? document.title;
    return {
      format: DATA_FORMAT,
      version: DATA_VERSION,
      page: { title, file: document.body?.dataset?.amFile ?? '' },
      exportedAt: new Date().toISOString(),
      submittedBy: { department: who.department, staffName: who.staffName },
      answers: asks.map((ask) => ({
        panel: panelOf(ask).id,
        question: textOf(ask.querySelector('legend')) ?? '',
        picked: picked(ask),
        touched: touched.has(ask),
      })),
      comments: [...slots].map(([id, slot]) => ({ panel: id, title: panelOf(slot.box).title, text: slot.box.value })).filter((c) => c.text.trim()),
      remarks: window.__amRemarkData?.() ?? [],
    };
  };
  let statusTimer = null;
  const setStatus = (text) => {
    status.textContent = text;
    if (statusTimer !== null) clearTimeout(statusTimer);
    statusTimer = text ? setTimeout(() => { status.textContent = ''; statusTimer = null; }, 3000) : null;
  };
  const flashes = new WeakMap();
  const flash = (button, text) => {
    const state = flashes.get(button) ?? { label: button.textContent, timer: null };
    clearTimeout(state.timer);
    button.textContent = text;
    state.timer = setTimeout(() => { button.textContent = state.label; }, 1400);
    flashes.set(button, state);
  };
  // Export needs both fields. An export from the bottom bar opens the sheet and points at the empty field, so the reader
  // never gets a file that does not say who sent it.
  const collectUser = () => {
    const department = user.department.trim();
    const staffName = user.staffName.trim();
    if (department && staffName && filePart(department) && filePart(staffName)) return { department, staffName };
    if (!sheet.open) open();
    setStatus(ui.idRequired);
    (!department || !filePart(department) ? idFields.department : idFields.staffName).focus();
    return null;
  };
  const downloadJson = (button) => {
    const who = collectUser();
    if (!who) return;
    const blob = new Blob([`${JSON.stringify(exportData(who), null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportName(who);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(ui.exported);
    flash(button, ui.exported);
  };
  // Import merges into the page: a matching panel or question gets the saved value, and a name the page no longer has is
  // skipped. Bounds keep a hand-made file from filling localStorage or the server record.
  const applyImport = (data) => {
    if (!data || data.format !== DATA_FORMAT || data.version !== DATA_VERSION) throw new Error('not reply data');
    const list = (value) => (Array.isArray(value) ? value.slice(0, MAX_DATA_ITEMS) : []);
    let n = 0;
    for (const entry of list(data.comments)) {
      if (typeof entry?.panel !== 'string' || typeof entry.text !== 'string') continue;
      const slot = slots.get(entry.panel);
      if (!slot) continue;
      slot.box.value = entry.text.slice(0, MAX_DATA_TEXT);
      slot.btn.classList.toggle('am-comment-btn--on', Boolean(slot.box.value.trim()));
      if (slot.box.value.trim()) slot.show(true);
      n++;
    }
    for (const entry of list(data.answers)) {
      if (typeof entry?.question !== 'string') continue;
      const ask = asks.find((candidate) => keyOf(candidate) === entry.question);
      if (!ask) continue;
      const picks = Array.isArray(entry.picked) ? entry.picked.filter((value) => typeof value === 'string') : [];
      if (!entry.touched && !picks.length) continue;
      for (const input of ask.querySelectorAll('input')) input.checked = picks.includes(input.value);
      touched.add(ask);
      n++;
    }
    n += window.__amRemarkImport?.(data.remarks) ?? 0;
    // A backup carries who sent it; putting the name back lets IT see whose comments these are, and re-export them.
    if (data.submittedBy && typeof data.submittedBy === 'object') {
      if (typeof data.submittedBy.department === 'string') user.department = data.submittedBy.department.slice(0, 100);
      if (typeof data.submittedBy.staffName === 'string') user.staffName = data.submittedBy.staffName.slice(0, 100);
      syncIdFields();
    }
    save();
    refreshBar();
    if (sheet.open) renderSheet();
    return n;
  };
  const importFile = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      setStatus(ui.imported.replace('{n}', applyImport(data)));
    } catch {
      setStatus(ui.importFailed);
    }
  };
  exportBtn.addEventListener('click', () => downloadJson(exportBtn));
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) importFile(file);
  });

  // The text goes through the clipboard API; a page the browser treats as insecure (file://) falls back to selecting a temporary
  // textarea, because the sheet's own textarea can sit inside a closed fold, where it cannot be selected.
  // That fallback reports whether it worked. When it does not, the text stays selected (so Cmd/Ctrl+C still copies it) and the
  // button says what to do instead of showing the "Copied ✓" label the reader cannot trust.
  const copyText = async (str, btn) => {
    stuck?.remove();
    stuck = null;
    try {
      await navigator.clipboard.writeText(str);
      // The close_after_reply script (close-after-reply.js) closes the tab once the reply is on the clipboard.
      document.dispatchEvent(new Event('am-reply-copied'));
    } catch {
      const tmp = Object.assign(document.createElement('textarea'), { value: str });
      tmp.style.cssText = 'position:fixed;top:-100px;opacity:0';
      // Inside the sheet while it is open: while a modal dialog is open the rest of the document cannot take focus, so a textarea
      // in the body can be selected but not focused, and the keyboard shortcut the reader is told to press would copy nothing.
      // The bottom bar copies while the sheet is closed, and a closed dialog is not rendered, so there the textarea goes in the body.
      (sheet.open ? sheet : document.body).append(tmp);
      tmp.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      if (!copied) {
        stuck = tmp;
        btn.textContent = ui.copyFailed;
        setTimeout(() => { btn.textContent = ui.copy; }, 3000);
        return;
      }
      tmp.remove();
    }
    btn.textContent = ui.done;
    setTimeout(() => { btn.textContent = ui.copy; }, 1400);
  };

  // After an import the sheet is already open, so its view is redrawn without opening it again.
  const renderSheet = () => {
    const reply = compose();
    if (reply) view.innerHTML = replyViewHtml(reply);
    else view.textContent = ui.empty;
    text.value = reply;
    raw.hidden = !reply;
    copy.disabled = !reply;
    return reply;
  };
  const open = () => {
    const reply = renderSheet();
    view.scrollTop = 0;
    raw.open = false;
    if (sheet.showModal) sheet.showModal();
    else sheet.setAttribute('open', '');
    const missing = !user.department.trim() ? idFields.department : !user.staffName.trim() ? idFields.staffName : null;
    (missing ?? (reply ? copy : close)).focus();
  };
  replyBtn.addEventListener('click', open);
  close.addEventListener('click', () => (sheet.close ? sheet.close() : sheet.removeAttribute('open')));
  // A failed copy leaves the text selected for Cmd/Ctrl+C; closing the sheet drops that textarea.
  sheet.addEventListener('close', () => { stuck?.remove(); stuck = null; });
  copy.addEventListener('click', () => copyText(text.value, copy));

  const bar = Object.assign(document.createElement('div'), { className: 'am-reply-bar', hidden: true });
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', ui.title);
  const summary = Object.assign(document.createElement('span'), { className: 'am-reply-bar-count' });
  summary.setAttribute('aria-live', 'polite');
  const preview = Object.assign(document.createElement('button'), { type: 'button', className: 'am-btn', textContent: ui.preview });
  const barExport = Object.assign(document.createElement('button'), { type: 'button', className: 'am-btn', textContent: ui.exportJson });
  const barCopy = Object.assign(document.createElement('button'), { type: 'button', className: 'am-btn am-btn--reply', textContent: ui.copy });
  preview.addEventListener('click', open);
  barExport.addEventListener('click', () => downloadJson(barExport));
  barCopy.addEventListener('click', () => copyText(compose(), barCopy));
  bar.append(summary, preview, barExport, barCopy);
  document.body.append(bar);

  // The bar shows only the counts that are above zero, and only once there is any input at all.
  refreshBar = () => {
    const counts = {
      answered: touched.size,
      comments: [...slots.values()].filter((slot) => slot.box.value.trim()).length,
      remarks: (window.__amRemarkData?.() ?? []).length,
    };
    const parts = Object.entries(counts).filter(([, n]) => n > 0).map(([kind, n]) => ui.count[kind].replace('{n}', n));
    summary.textContent = parts.join(' · ');
    bar.hidden = !parts.length;
    document.body.classList.toggle('am-has-reply-bar', parts.length > 0);
  };
  document.addEventListener('am-remark-change', () => refreshBar());
  // Saved remarks are restored by remark.js, which runs after this script in the same <script> element: its data is not there yet.
  // A microtask runs when that whole element has finished, so the first count includes them.
  queueMicrotask(() => refreshBar());
}

(() => {
  const LS_BASE = 'wcb_staff_api_base';
  const LS_TOKEN = 'wcb_staff_token';
  const LS_STAFF = 'wcb_staff_profile';

  const STATUS_RU = {
    to_do: 'Новый',
    in_progress: 'В работе',
    in_review: 'На проверке',
    done: 'Выполнен',
    closed: 'Закрыт',
  };
  const PRIORITY_RU = {
    urgent: 'Срочно',
    high: 'Высокий',
    normal: 'Обычный',
    low: 'Низкий',
  };

  let state = {
    baseUrl: '',
    token: '',
    staff: null,
    ticketsFilter: 'me',
    currentTicketId: null,
    currentChatId: null,
  };

  const SS_NOTIF_IDS = 'wcb_staff_notif_shown';
  let pollTimer = null;
  const chatSnap = new Map();
  let chatSnapInitialized = false;

  function loadShownNotifIds() {
    try {
      const j = JSON.parse(sessionStorage.getItem(SS_NOTIF_IDS) || '[]');
      return new Set(Array.isArray(j) ? j : []);
    } catch {
      return new Set();
    }
  }

  function saveShownNotifIds(set) {
    const arr = [...set].slice(-400);
    sessionStorage.setItem(SS_NOTIF_IDS, JSON.stringify(arr));
  }

  function showOsNotification(title, body) {
    const api = window.staffDesktop;
    if (api && typeof api.showNotification === 'function') {
      return api.showNotification(title, body);
    }
    return Promise.resolve({ ok: false, reason: 'no-desktop' });
  }

  async function pollDesktopNotifications() {
    if (!state.token) return;
    try {
      const rows = await api('staff/notifications?is_read=false&limit=50');
      const list = Array.isArray(rows) ? rows : [];
      const shown = loadShownNotifIds();
      let burst = 0;
      for (const n of list) {
        const id = n.id;
        if (id == null || shown.has(id)) continue;
        shown.add(id);
        const title = n.title || 'WorldCashBox Staff';
        const body = (n.message || '').replace(/\s+/g, ' ').trim().slice(0, 380);
        await showOsNotification(title, body || ' ');
        burst++;
        if (burst >= 12) break;
      }
      saveShownNotifIds(shown);

      const convData = await api('conversations');
      const convs = convData.conversations || [];
      if (!chatSnapInitialized) {
        for (const c of convs) {
          chatSnap.set(c.id, {
            at: c.last_message_at || '',
            u: c.unread_count || 0,
          });
        }
        chatSnapInitialized = true;
        return;
      }
      let chatBurst = 0;
      for (const c of convs) {
        const prev = chatSnap.get(c.id) || { at: '', u: 0 };
        const at = c.last_message_at || '';
        const u = c.unread_count || 0;
        const hasNewActivity = at && at !== prev.at;
        const shouldToast = hasNewActivity && u > 0;
        chatSnap.set(c.id, { at, u });
        if (shouldToast) {
          const preview = (c.last_message || 'Новое сообщение').replace(/\s+/g, ' ').trim().slice(0, 320);
          await showOsNotification(`Чат: ${c.title || '#' + c.id}`, preview);
          chatBurst++;
          if (chatBurst >= 6) break;
        }
      }
    } catch {
      /* сеть / 401 — тихо до следующего цикла */
    }
  }

  function startNotificationPolling() {
    stopNotificationPolling();
    chatSnapInitialized = false;
    chatSnap.clear();
    pollDesktopNotifications();
    pollTimer = setInterval(pollDesktopNotifications, 18000);
  }

  function stopNotificationPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    chatSnapInitialized = false;
    chatSnap.clear();
  }

  const $ = (id) => document.getElementById(id);

  function normalizeBase(url) {
    let u = (url || '').trim();
    if (!u) return '';
    u = u.replace(/\/+$/, '');
    if (!u.endsWith('/api')) u += '/api';
    return u + '/';
  }

  function getBase() {
    return normalizeBase(state.baseUrl || localStorage.getItem(LS_BASE) || '');
  }

  async function api(path, options = {}) {
    const base = getBase();
    if (!base) throw new Error('Не задан адрес API');
    const url = base.replace(/\/+$/, '/') + path.replace(/^\/+/, '');
    const headers = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };
    if (state.token && !headers.Authorization) {
      headers.Authorization = 'Bearer ' + state.token;
    }
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || res.statusText || 'Ошибка запроса';
      throw new Error(msg);
    }
    return data;
  }

  function showLoginError(msg) {
    const el = $('login-error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function showScreen(name) {
    $('screen-login').classList.toggle('hidden', name !== 'login');
    $('screen-main').classList.toggle('hidden', name !== 'main');
  }

  function setView(name) {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    $('view-tickets').classList.toggle('hidden', name !== 'tickets');
    $('view-ticket-detail').classList.toggle('hidden', name !== 'ticket-detail');
    $('view-chats').classList.toggle('hidden', name !== 'chats');
    $('view-analytics').classList.toggle('hidden', name !== 'analytics');
  }

  function canWriteTickets() {
    const r = state.staff?.role;
    return r === 'engineer' || r === 'support';
  }

  async function doLogin() {
    showLoginError('');
    const baseInput = normalizeBase($('api-base').value);
    if (!baseInput) {
      showLoginError('Укажите адрес API');
      return;
    }
    localStorage.setItem(LS_BASE, baseInput);
    state.baseUrl = baseInput;

    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) {
      showLoginError('Введите email и пароль');
      return;
    }

    $('btn-login').disabled = true;
    try {
      const data = await api('staff/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: '' },
        body: JSON.stringify({ email, password }),
      });
      state.token = data.token;
      state.staff = data.staff;
      localStorage.setItem(LS_TOKEN, data.token);
      localStorage.setItem(LS_STAFF, JSON.stringify(data.staff));
      showScreen('main');
      $('user-badge').textContent = `${data.staff.name || ''} · ${data.staff.role || ''}\n${data.staff.email || ''}`;
      setupTicketsFilters();
      await loadTickets();
      setView('tickets');
      startNotificationPolling();
    } catch (e) {
      showLoginError(e.message || String(e));
    } finally {
      $('btn-login').disabled = false;
    }
  }

  function isObserverStaffRole() {
    const r = state.staff?.role;
    return r === 'manager' || r === 'director';
  }

  function setupTicketsFilters() {
    const box = $('tickets-filters');
    box.innerHTML = '';
    const role = state.staff?.role;
    if (isObserverStaffRole()) {
      state.ticketsFilter = 'all';
      const span = document.createElement('span');
      span.className = 'muted';
      span.textContent = 'Все тикеты';
      box.appendChild(span);
      return;
    }
    const sel = document.createElement('select');
    sel.id = 'sel-ticket-scope';
    [['me', 'Мои'], ['all', 'Все'], ['unassigned', 'Без исполнителя']].forEach(([v, t]) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      sel.appendChild(o);
    });
    sel.value = state.ticketsFilter;
    sel.addEventListener('change', () => {
      state.ticketsFilter = sel.value;
      loadTickets();
    });
    box.appendChild(sel);
  }

  async function loadTickets() {
    const tbody = $('tickets-body');
    tbody.innerHTML = '<tr><td colspan="6">Загрузка…</td></tr>';
    try {
      let qs = 'limit=100&offset=0';
      if (state.ticketsFilter === 'me') qs += '&assigned_to=me';
      else if (state.ticketsFilter === 'unassigned') qs += '&assigned_to=unassigned';
      const data = await api('staff/support/tickets?' + qs);
      const rows = data.tickets || [];
      tbody.innerHTML = '';
      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="6">Нет тикетов</td></tr>';
        return;
      }
      for (const t of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${t.id}</td>
          <td>${escapeHtml(t.subject || '')}</td>
          <td>${escapeHtml(t.client_name || '')}</td>
          <td>${STATUS_RU[t.status] || t.status}</td>
          <td>${PRIORITY_RU[t.priority] || t.priority}</td>
          <td>${formatDate(t.created_at)}</td>`;
        tr.addEventListener('click', () => openTicket(t.id));
        tbody.appendChild(tr);
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return String(iso);
    }
  }

  async function openTicket(id) {
    state.currentTicketId = id;
    setView('ticket-detail');
    $('ticket-detail-title').textContent = 'Тикет #' + id;
    $('ticket-meta').innerHTML = 'Загрузка…';
    $('ticket-messages').innerHTML = '';
    $('ticket-reply-box').classList.toggle('hidden', !canWriteTickets());

    try {
      const data = await api('staff/support/tickets/' + id);
      const t = data.ticket || {};
      const client = data.client || {};
      const assignable = canWriteTickets() && !t.assigned_to;

      $('ticket-meta').innerHTML = `
        <p><strong>${escapeHtml(t.subject || '')}</strong></p>
        <p>Статус: <strong>${STATUS_RU[t.status] || t.status}</strong></p>
        <p>Клиент: ${escapeHtml(client.name || t.client_name || '')}</p>
        <p>Email: ${escapeHtml(client.email || t.client_email || '')}</p>
        ${assignable ? `<p><button type="button" class="btn primary" id="btn-assign-self">Взять в работу</button></p>` : ''}
        ${canWriteTickets() ? `
        <p><label>Сменить статус</label>
          <select id="sel-ticket-status">
            ${['to_do', 'in_progress', 'in_review', 'done', 'closed'].map((s) =>
              `<option value="${s}" ${t.status === s ? 'selected' : ''}>${STATUS_RU[s]}</option>`).join('')}
          </select>
          <button type="button" class="btn primary" id="btn-save-status">Сохранить статус</button>
        </p>` : ''}`;

      if (assignable) {
        $('btn-assign-self').addEventListener('click', async () => {
          try {
            await api('staff/support/tickets/' + id + '/assign', { method: 'POST' });
            await openTicket(id);
            await loadTickets();
          } catch (e) {
            alert(e.message);
          }
        });
      }
      const saveBtn = $('btn-save-status');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const st = $('sel-ticket-status').value;
          try {
            await api('staff/support/tickets/' + id + '/status', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: st }),
            });
            await openTicket(id);
            await loadTickets();
          } catch (e) {
            alert(e.message);
          }
        });
      }

      const msgs = data.messages || [];
      const box = $('ticket-messages');
      for (const m of msgs) {
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `
          <div class="who">${escapeHtml(m.user_name || m.user_type || '')}</div>
          <div>${escapeHtml(m.message || '')}</div>
          <div class="when">${formatDate(m.created_at)}</div>`;
        box.appendChild(div);
      }
    } catch (e) {
      $('ticket-meta').innerHTML = '<p class="error">' + escapeHtml(e.message) + '</p>';
    }
  }

  async function sendTicketMessage() {
    if (!canWriteTickets()) return;
    const id = state.currentTicketId;
    const text = $('ticket-reply-text').value.trim();
    if (!id || !text) return;
    const fd = new FormData();
    fd.append('message', text);
    const base = getBase().replace(/\/+$/, '/');
    const res = await fetch(base + 'staff/support/tickets/' + id + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + state.token },
      body: fd,
    });
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    if (!res.ok) throw new Error(data.error || res.statusText);
    $('ticket-reply-text').value = '';
    await openTicket(id);
  }

  async function loadChats() {
    const ul = $('chat-list');
    ul.innerHTML = '<li class="muted">Загрузка…</li>';
    try {
      const data = await api('conversations');
      const list = data.conversations || [];
      ul.innerHTML = '';
      if (!list.length) {
        ul.innerHTML = '<li class="muted">Нет чатов</li>';
        return;
      }
      for (const c of list) {
        const li = document.createElement('li');
        li.dataset.id = c.id;
        li.innerHTML = `<div class="title">${escapeHtml(c.title || 'Чат #' + c.id)}</div>
          <div class="preview">${escapeHtml(c.last_message || '—')}</div>`;
        li.addEventListener('click', () => {
          document.querySelectorAll('.chat-list li').forEach((x) => x.classList.remove('active'));
          li.classList.add('active');
          openChat(c.id, c.title || 'Чат');
        });
        ul.appendChild(li);
      }
    } catch (e) {
      ul.innerHTML = '<li class="muted">' + escapeHtml(e.message) + '</li>';
    }
  }

  async function openChat(id, title) {
    state.currentChatId = id;
    $('chat-placeholder').classList.add('hidden');
    $('chat-active').classList.remove('hidden');
    $('chat-active-title').textContent = title;
    const box = $('chat-messages');
    box.innerHTML = 'Загрузка…';
    try {
      const data = await api('conversations/' + id + '/messages');
      const msgs = data.messages || [];
      box.innerHTML = '';
      for (const m of msgs) {
        const div = document.createElement('div');
        div.className = 'msg';
        div.innerHTML = `
          <div class="who">${escapeHtml(m.sender_name || m.sender_type || '')}</div>
          <div>${escapeHtml(m.message || '')}</div>
          <div class="when">${formatDate(m.created_at)}</div>`;
        box.appendChild(div);
      }
      box.scrollTop = box.scrollHeight;
    } catch (e) {
      box.innerHTML = '<p class="error">' + escapeHtml(e.message) + '</p>';
    }
  }

  async function sendChatMessage() {
    const id = state.currentChatId;
    const text = $('chat-input').value.trim();
    if (!id || !text) return;
    try {
      await api('conversations/' + id + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      $('chat-input').value = '';
      await openChat(id, $('chat-active-title').textContent);
      await loadChats();
    } catch (e) {
      alert(e.message);
    }
  }

  async function loadAnalytics() {
    const period = $('analytics-period').value;
    const grid = $('analytics-summary');
    const tbody = $('analytics-top-body');
    grid.innerHTML = 'Загрузка…';
    tbody.innerHTML = '';
    try {
      const data = await api('staff/support/analytics?period=' + encodeURIComponent(period));
      const cards = [
        ['Всего', data.total_tickets],
        ['К выполнению', data.to_do_tickets],
        ['В работе', data.in_progress_tickets],
        ['На проверке', data.in_review_tickets],
        ['Выполнено', data.done_tickets],
        ['Закрыто', data.closed_tickets],
        ['Завершено всего', data.completed_tickets],
        ['Часов всего', Math.round((data.total_time_minutes || 0) / 60 * 10) / 10],
      ];
      grid.innerHTML = cards
        .map(
          ([lbl, val]) =>
            `<div class="stat-card"><div class="val">${val}</div><div class="lbl">${lbl}</div></div>`
        )
        .join('');

      const top = data.topTimeConsuming || [];
      for (const row of top) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row.id}</td>
          <td>${escapeHtml(row.subject || '')}</td>
          <td>${escapeHtml(row.clientName || '')}</td>
          <td>${row.timeSpentMinutes ?? ''}</td>
          <td>${STATUS_RU[row.status] || row.status}</td>`;
        tbody.appendChild(tr);
      }
      if (!top.length) tbody.innerHTML = '<tr><td colspan="5">Нет данных</td></tr>';
    } catch (e) {
      grid.innerHTML = '<p class="error">' + escapeHtml(e.message) + '</p>';
    }
  }

  function logout() {
    stopNotificationPolling();
    state.token = '';
    state.staff = null;
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_STAFF);
    showScreen('login');
  }

  function boot() {
    const savedBase = localStorage.getItem(LS_BASE);
    if (savedBase) $('api-base').value = savedBase;
    else $('api-base').value = 'http://155.212.132.213/api/';

    const tok = localStorage.getItem(LS_TOKEN);
    const prof = localStorage.getItem(LS_STAFF);
    if (tok && prof) {
      try {
        state.token = tok;
        state.staff = JSON.parse(prof);
        state.baseUrl = normalizeBase(savedBase || $('api-base').value || '');
        showScreen('main');
        $('user-badge').textContent = `${state.staff.name || ''} · ${state.staff.role || ''}\n${state.staff.email || ''}`;
        setupTicketsFilters();
        loadTickets();
        setView('tickets');
        startNotificationPolling();
      } catch {
        logout();
      }
    } else {
      showScreen('login');
    }

    $('btn-login').addEventListener('click', doLogin);
    $('btn-logout').addEventListener('click', logout);

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.view;
        if (v === 'tickets') {
          setView('tickets');
          loadTickets();
        } else if (v === 'chats') {
          setView('chats');
          loadChats();
        } else if (v === 'analytics') {
          setView('analytics');
          loadAnalytics();
        }
      });
    });

    $('btn-back-tickets').addEventListener('click', () => {
      setView('tickets');
      loadTickets();
    });

    $('btn-send-ticket-msg').addEventListener('click', () => {
      sendTicketMessage().catch((e) => alert(e.message));
    });

    $('btn-refresh-chats').addEventListener('click', loadChats);
    $('btn-send-chat').addEventListener('click', () => {
      sendChatMessage().catch((e) => alert(e.message));
    });

    $('btn-load-analytics').addEventListener('click', loadAnalytics);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

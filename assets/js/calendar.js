/**
 * calendar.js — CSS Grid 월간 캘린더
 *
 * Fix 2a: first_session 설정 시 session_count에 따라 2주 간격 자동 세션 생성
 * Fix 2b: 드래그 앤 드롭으로 이벤트 날짜 이동 (HTML5 native DnD)
 */

const Calendar = (() => {
  let year  = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-indexed
  let registrations = [];

  const STORAGE_KEY = 'coaching_calendar_events';

  // 드래그 상태
  let _dragPayload = null;
  let _isDragging  = false;

  // ── 이벤트 로드/저장 ────────────────────────────────
  function loadManualEvents() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveManualEvents(events) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function addManualEvent(dateStr, name, time, sessionNum) {
    const events = loadManualEvents();
    events.push({ dateStr, name, time, sessionNum, id: Date.now() });
    saveManualEvents(events);
    render();
  }

  function deleteManualEvent(id) {
    const events = loadManualEvents().filter(e => e.id !== id);
    saveManualEvents(events);
    render();
  }

  // ── Fix 2a: 자동 세션 생성/동기화 ──────────────────
  function generateAutoSessions(reg) {
    if (!reg.first_session) return [];
    const count = parseInt(reg.session_count) || 0;
    if (count <= 1) return [];

    const baseStr  = reg.first_session.trim().substring(0, 10);
    const timeStr  = reg.first_session.length > 12 ? reg.first_session.substring(11, 16) : '';
    const parts    = baseStr.split('-').map(Number);
    const baseDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const cleanName = (reg.name || '').replace(/[^가-힣a-zA-Z\s]/g, '').trim();

    const sessions = [];
    for (let i = 1; i < count; i++) {
      const dt = new Date(baseDate);
      dt.setDate(baseDate.getDate() + 14 * i);
      sessions.push({
        dateStr:    formatDateISO(dt),
        name:       cleanName,
        time:       timeStr,
        sessionNum: String(i + 1),
        id:         `auto_${reg.id}_${i}`,
        isAuto:     true,
        autoRegId:  reg.id,
      });
    }
    return sessions;
  }

  function syncAutoSessions(allRegs) {
    // isAuto 이벤트만 제거 후 재생성 (수동 이동된 것은 isAuto=false이므로 유지됨)
    const manual = loadManualEvents().filter(e => !e.isAuto);
    allRegs.forEach(reg => manual.push(...generateAutoSessions(reg)));
    saveManualEvents(manual);
  }

  // ── Fix 2b: 드롭 핸들러 ─────────────────────────────
  function handleDrop(targetDateStr, payload) {
    if (payload.origDateStr === targetDateStr) return;

    if (payload.isManual) {
      // 수동 이벤트: dateStr 업데이트
      const events = loadManualEvents();
      const idx = events.findIndex(e => e.id === payload.manualEv.id);
      if (idx !== -1) events[idx].dateStr = targetDateStr;
      saveManualEvents(events);
      render();

    } else if (payload.isAuto) {
      // 자동 이벤트: isAuto → false 전환(수동화), dateStr 업데이트
      const events = loadManualEvents();
      const idx = events.findIndex(e => e.id === payload.manualEv.id);
      if (idx !== -1) {
        events[idx].dateStr = targetDateStr;
        events[idx].isAuto  = false;
        delete events[idx].autoRegId;
      }
      saveManualEvents(events);
      render();

    } else {
      // 등록 이벤트 (first_session): Admin에 업데이트
      if (payload.raw && typeof Admin !== 'undefined') {
        const reg = payload.raw;
        const existingTime = reg.first_session && reg.first_session.length > 10
          ? reg.first_session.substring(11, 16) : '';
        const newValue = existingTime
          ? `${targetDateStr} ${existingTime}` : targetDateStr;
        Admin.updateFirstSessionByReg(reg, newValue);
      }
    }
  }

  // ── 공통 다이얼로그 빌더 ────────────────────────────
  const MINS_DLG  = ['00','10','20','30','40','50'];
  const HOURS_DLG = Array.from({length: 24}, (_, i) => String(i).padStart(2,'0'));

  function buildTimeSelects(hourVal, minVal) {
    const hOpts = HOURS_DLG.map(h =>
      `<option value="${h}"${h === hourVal ? ' selected' : ''}>${h}</option>`
    ).join('');
    const mOpts = MINS_DLG.map(m =>
      `<option value="${m}"${m === minVal ? ' selected' : ''}>${m}</option>`
    ).join('');
    return `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
        <select id="dlgHour" style="padding:7px 8px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;flex:1;">${hOpts}</select>
        <span style="font-weight:700;font-size:16px;">:</span>
        <select id="dlgMin" style="padding:7px 8px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;flex:1;">${mOpts}</select>
      </div>`;
  }

  function showEventDialog({ title, dateStr, name='', hourVal='09', minVal='00', sessionNum='1', onConfirm, confirmLabel='추가' }) {
    const existing = document.getElementById('calEventDialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'calEventDialog';
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:center;justify-content:center;';
    dialog.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:28px 28px 24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
        <h3 style="margin:0 0 16px;font-size:16px;color:#2d6a4f;">${title} — ${dateStr}</h3>
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">이름</label>
        <input id="dlgName" type="text" placeholder="고객 이름" value="${name}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:10px;box-sizing:border-box;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">시간</label>
        ${buildTimeSelects(hourVal, minVal)}
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">차수</label>
        <input id="dlgSession" type="number" min="1" value="${sessionNum}"
          style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:18px;box-sizing:border-box;">
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="dlgCancel" style="padding:8px 18px;border:1.5px solid #ddd;border-radius:50px;background:#fff;cursor:pointer;font-size:14px;">취소</button>
          <button id="dlgConfirm" style="padding:8px 18px;border:none;border-radius:50px;background:#2d6a4f;color:#fff;cursor:pointer;font-size:14px;font-weight:700;">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#dlgCancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    dialog.querySelector('#dlgConfirm').addEventListener('click', () => {
      const nameVal  = dialog.querySelector('#dlgName').value.trim();
      const hour     = dialog.querySelector('#dlgHour').value;
      const min      = dialog.querySelector('#dlgMin').value;
      const sessionV = dialog.querySelector('#dlgSession').value || '1';
      if (!nameVal) { alert('이름을 입력해 주세요.'); return; }
      onConfirm(nameVal, `${hour}:${min}`, sessionV);
      dialog.remove();
    });
  }

  // ── 칩 클릭 팝업 메뉴 ───────────────────────────────
  function showChipMenu(e, ev) {
    const existing = document.getElementById('chipContextMenu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.id = 'chipContextMenu';
    const x = Math.min(e.clientX, window.innerWidth - 150);
    const y = e.clientY + 8;
    menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.15);padding:4px;z-index:3000;min-width:120px;`;
    const btnBase = 'display:block;width:100%;padding:7px 14px;border:none;background:none;cursor:pointer;text-align:left;font-size:13px;border-radius:6px;';

    if (ev.isManual) {
      // 수동 이벤트: 수정 + 삭제
      const editBtn = document.createElement('button');
      editBtn.textContent = '✏️ 수정';
      editBtn.style.cssText = btnBase;
      editBtn.onmouseenter = () => { editBtn.style.background = '#f3f4f6'; };
      editBtn.onmouseleave = () => { editBtn.style.background = 'none'; };
      editBtn.addEventListener('click', (e2) => {
        e2.stopPropagation(); menu.remove();
        showEditEventDialog(ev.manualEv);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑 삭제';
      delBtn.style.cssText = btnBase + 'color:#ef4444;';
      delBtn.onmouseenter = () => { delBtn.style.background = '#fef2f2'; };
      delBtn.onmouseleave = () => { delBtn.style.background = 'none'; };
      delBtn.addEventListener('click', (e2) => {
        e2.stopPropagation(); menu.remove();
        if (confirm(`"${ev.manualEv.name}" 일정을 삭제하시겠습니까?`)) deleteManualEvent(ev.manualEv.id);
      });

      menu.appendChild(editBtn);
      menu.appendChild(delBtn);

    } else if (ev.isAuto) {
      // 자동 이벤트: 상세 보기만 (이동은 드래그로)
      const detailBtn = document.createElement('button');
      detailBtn.textContent = '👤 상세 보기';
      detailBtn.style.cssText = btnBase;
      detailBtn.onmouseenter = () => { detailBtn.style.background = '#f3f4f6'; };
      detailBtn.onmouseleave = () => { detailBtn.style.background = 'none'; };
      detailBtn.addEventListener('click', (e2) => {
        e2.stopPropagation(); menu.remove();
        if (ev.raw && typeof Admin !== 'undefined') Admin.openModal(ev.raw);
      });
      menu.appendChild(detailBtn);

    } else {
      // 등록 이벤트 (first session): 상세 보기 + 삭제
      const detailBtn = document.createElement('button');
      detailBtn.textContent = '👤 상세 보기';
      detailBtn.style.cssText = btnBase;
      detailBtn.onmouseenter = () => { detailBtn.style.background = '#f3f4f6'; };
      detailBtn.onmouseleave = () => { detailBtn.style.background = 'none'; };
      detailBtn.addEventListener('click', (e2) => {
        e2.stopPropagation(); menu.remove();
        if (ev.raw && typeof Admin !== 'undefined') Admin.openModal(ev.raw);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑 삭제';
      delBtn.style.cssText = btnBase + 'color:#ef4444;';
      delBtn.onmouseenter = () => { delBtn.style.background = '#fef2f2'; };
      delBtn.onmouseleave = () => { delBtn.style.background = 'none'; };
      delBtn.addEventListener('click', (e2) => {
        e2.stopPropagation(); menu.remove();
        if (typeof Admin !== 'undefined') Admin.clearFirstSession(ev.raw.id);
      });

      menu.appendChild(detailBtn);
      menu.appendChild(delBtn);
    }

    document.body.appendChild(menu);
    setTimeout(() => {
      document.addEventListener('click', () => {
        const m = document.getElementById('chipContextMenu');
        if (m) m.remove();
      }, { once: true });
    }, 10);
  }

  // ── 이벤트 추가/수정 다이얼로그 ─────────────────────
  function showAddEventDialog(dateStr) {
    showEventDialog({
      title: '일정 추가',
      dateStr,
      confirmLabel: '추가',
      onConfirm: (name, time, sessionNum) => addManualEvent(dateStr, name, time, sessionNum),
    });
  }

  function showEditEventDialog(ev) {
    const [h, m] = (ev.time || '09:00').split(':');
    showEventDialog({
      title: '일정 수정',
      dateStr: ev.dateStr,
      name: ev.name,
      hourVal: h || '09',
      minVal: m || '00',
      sessionNum: ev.sessionNum || '1',
      confirmLabel: '저장',
      onConfirm: (name, time, sessionNum) => {
        const events = loadManualEvents();
        const idx = events.findIndex(e => e.id === ev.id);
        if (idx !== -1) {
          events[idx] = { ...events[idx], name, time, sessionNum };
          saveManualEvents(events);
          render();
        }
      },
    });
  }

  function init(data) {
    registrations = data || [];
    syncAutoSessions(registrations);
    render();
    bindNav();
  }

  function bindNav() {
    document.getElementById('calPrev').addEventListener('click', () => {
      month--;
      if (month < 0) { month = 11; year--; }
      render();
    });
    document.getElementById('calNext').addEventListener('click', () => {
      month++;
      if (month > 11) { month = 0; year++; }
      render();
    });
  }

  function render() {
    document.getElementById('calMonthTitle').textContent = `${year}년 ${month + 1}월`;

    const grid = document.getElementById('calendarGrid');
    grid.querySelectorAll('.cal-cell').forEach(c => c.remove());

    const today       = new Date();
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const eventMap    = buildEventMap();
    const allStoredEvents = loadManualEvents();

    // reg ID → reg 객체 맵
    const regById = {};
    registrations.forEach(r => { regById[r.id] = r; });

    // 이전 달 빈 칸
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      grid.appendChild(createCell(prevDays - i, true, false, null, []));
    }

    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateISO(new Date(year, month, d));
      const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate();

      const regEvents = eventMap[dateStr] || [];

      const dayManual = allStoredEvents
        .filter(me => me.dateStr === dateStr && !me.isAuto)
        .map(me => ({
          label:    `${me.name}${me.time ? ' / ' + me.time : ''} / ${me.sessionNum}차수`,
          raw:      null,
          time:     me.time || '00:00',
          isManual: true,
          isAuto:   false,
          manualEv: me,
        }));

      const dayAuto = allStoredEvents
        .filter(ae => ae.dateStr === dateStr && ae.isAuto)
        .map(ae => ({
          label:    `${ae.name}${ae.time ? ' / ' + ae.time : ''} / ${ae.sessionNum}차수`,
          raw:      regById[ae.autoRegId] || null,
          time:     ae.time || '00:00',
          isManual: false,
          isAuto:   true,
          manualEv: ae,
        }));

      const combined = [...regEvents, ...dayManual, ...dayAuto]
        .sort((a, b) => a.time.localeCompare(b.time));

      grid.appendChild(createCell(d, false, isToday, dateStr, combined));
    }

    // 다음 달 빈 칸
    const totalCells = firstDay + daysInMonth;
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      grid.appendChild(createCell(d, true, false, null, []));
    }
  }

  function createCell(day, otherMonth, isToday, dateStr, events) {
    const cell = document.createElement('div');
    cell.className = `cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`;

    const dateDiv = document.createElement('div');
    dateDiv.className = 'cal-date';
    dateDiv.textContent = day;
    cell.appendChild(dateDiv);

    // 칩 렌더링
    events.forEach(ev => {
      const chip = document.createElement('div');
      if (ev.isManual)    chip.className = 'event-chip manual-chip';
      else if (ev.isAuto) chip.className = 'event-chip auto-chip';
      else                chip.className = 'event-chip';
      chip.textContent = ev.label;
      chip.title = '클릭: 메뉴 / 드래그: 날짜 이동';
      chip.style.cursor = 'grab';

      // 드래그 이벤트
      chip.draggable = true;
      chip.addEventListener('dragstart', (e) => {
        _isDragging = true;
        _dragPayload = { ...ev, origDateStr: dateStr };
        chip.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('dragging');
        setTimeout(() => { _isDragging = false; }, 50);
      });

      // 클릭 (드래그 중에는 무시)
      chip.addEventListener('click', (e) => {
        if (_isDragging) return;
        e.stopPropagation();
        showChipMenu(e, ev);
      });

      cell.appendChild(chip);
    });

    // 현재 달 셀: 드롭 + 클릭 핸들러
    if (!otherMonth && dateStr) {
      cell.addEventListener('dragover', (e) => {
        e.preventDefault();
        cell.classList.add('drag-over');
      });
      cell.addEventListener('dragleave', (e) => {
        if (!cell.contains(e.relatedTarget)) cell.classList.remove('drag-over');
      });
      cell.addEventListener('drop', (e) => {
        e.preventDefault();
        cell.classList.remove('drag-over');
        if (_dragPayload) {
          handleDrop(dateStr, _dragPayload);
          _dragPayload = null;
        }
      });

      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        if (!_isDragging) showAddEventDialog(dateStr);
      });
    }

    return cell;
  }

  function buildEventMap() {
    const map = {};
    registrations.forEach(reg => {
      if (reg.first_session) {
        const fullVal = reg.first_session.trim();
        const key     = fullVal.substring(0, 10);
        const timeStr = fullVal.length > 12 ? fullVal.substring(11, 16) : '';
        if (!map[key]) map[key] = [];
        const timeLabel = timeStr ? ` / ${timeStr}` : '';
        map[key].push({
          label:    `${(reg.name||'').replace(/[^가-힣a-zA-Z\s]/g,'').trim()}${timeLabel} / 1차수`,
          raw:      reg,
          time:     timeStr || '00:00',
          isManual: false,
          isAuto:   false,
        });
      }
    });
    return map;
  }

  function formatDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function update(data) {
    registrations = data || [];
    syncAutoSessions(registrations);
    render();
  }

  return { init, update, addManualEvent, deleteManualEvent };
})();

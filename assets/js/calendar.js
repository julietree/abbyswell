/**
 * calendar.js — CSS Grid 월간 캘린더
 *
 * Admin.registrations 데이터를 받아 월별 코칭 일정을 렌더링합니다.
 * first_session 필드 사용, 수동 이벤트 추가 지원 (localStorage 저장)
 */

const Calendar = (() => {
  let year  = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-indexed
  let registrations = [];

  const STORAGE_KEY = 'coaching_calendar_events';

  // ── 수동 이벤트 로드/저장 ────────────────────────────
  function loadManualEvents() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
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

  // ── 공통 다이얼로그 빌더 ────────────────────────────
  const MINS_DLG = ['00','10','20','30','40','50'];
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
      const nameVal   = dialog.querySelector('#dlgName').value.trim();
      const hour      = dialog.querySelector('#dlgHour').value;
      const min       = dialog.querySelector('#dlgMin').value;
      const sessionV  = dialog.querySelector('#dlgSession').value || '1';
      if (!nameVal) { alert('이름을 입력해 주세요.'); return; }
      onConfirm(nameVal, `${hour}:${min}`, sessionV);
      dialog.remove();
    });
  }

  // ── 이벤트 추가 다이얼로그 ──────────────────────────
  function showAddEventDialog(dateStr) {
    showEventDialog({
      title: '일정 추가',
      dateStr,
      confirmLabel: '추가',
      onConfirm: (name, time, sessionNum) => addManualEvent(dateStr, name, time, sessionNum),
    });
  }

  // ── 수동 이벤트 수정 다이얼로그 ─────────────────────
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

    const grid     = document.getElementById('calendarGrid');
    const existing = grid.querySelectorAll('.cal-cell');
    existing.forEach(c => c.remove());

    const today       = new Date();
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 이벤트 맵핑 (first_session 기준)
    const eventMap = buildEventMap();

    // 이전 달 빈 칸
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = createCell(prevDays - i, true, false, null);
      grid.appendChild(cell);
    }

    // 수동 이벤트 로드
    const manualEvents = loadManualEvents();

    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = formatDateISO(new Date(year, month, d));
      const isToday = (year === today.getFullYear() && month === today.getMonth() && d === today.getDate());
      // 등록 이벤트 + 수동 이벤트 합쳐서 시간순 정렬
      const regEvents = eventMap[dateStr] || [];
      const dayManual = manualEvents.filter(me => me.dateStr === dateStr).map(me => ({
        label:    `${me.name}${me.time ? ' / ' + me.time : ''} / ${me.sessionNum}차수`,
        raw:      null,
        time:     me.time || '00:00',
        isManual: true,
        manualEv: me,
      }));
      const allEvents = [...regEvents, ...dayManual].sort((a, b) => a.time.localeCompare(b.time));

      const cell = createCell(d, false, isToday, dateStr);

      allEvents.forEach(ev => {
        const chip = document.createElement('div');

        if (ev.isManual) {
          // 수동 이벤트: 수정 클릭 + 삭제 버튼
          chip.className = 'event-chip manual-chip';
          chip.textContent = ev.label;
          chip.title = '클릭: 수정';
          chip.style.cursor = 'pointer';
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            showEditEventDialog(ev.manualEv);
          });
          const delBtn = document.createElement('span');
          delBtn.textContent = ' 🗑';
          delBtn.title = '삭제';
          delBtn.style.cssText = 'cursor:pointer;margin-left:4px;font-size:11px;opacity:0.7;';
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`"${ev.manualEv.name}" 일정을 삭제하시겠습니까?`)) {
              deleteManualEvent(ev.manualEv.id);
            }
          });
          chip.appendChild(delBtn);
        } else {
          // 등록 이벤트: 클릭 시 상세 모달 + ✕ 삭제 버튼
          chip.className = 'event-chip';
          chip.textContent = ev.label;
          chip.title = ev.label;
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ev.raw && typeof Admin !== 'undefined') Admin.openModal(ev.raw);
          });
          if (ev.raw && ev.raw.id) {
            const delBtn = document.createElement('span');
            delBtn.textContent = ' ✕';
            delBtn.title = '첫차수 삭제';
            delBtn.style.cssText = 'cursor:pointer;margin-left:4px;font-size:11px;opacity:0.7;font-weight:700;';
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (typeof Admin !== 'undefined') Admin.clearFirstSession(ev.raw.id);
            });
            chip.appendChild(delBtn);
          }
        }

        cell.appendChild(chip);
      });

      grid.appendChild(cell);
    }

    // 다음 달 빈 칸 (6주 고정)
    const totalCells = firstDay + daysInMonth;
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      grid.appendChild(createCell(d, true, false, null));
    }
  }

  function createCell(day, otherMonth, isToday, dateStr) {
    const cell = document.createElement('div');
    cell.className = `cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`;

    const dateDiv = document.createElement('div');
    dateDiv.className = 'cal-date';
    dateDiv.textContent = day;
    cell.appendChild(dateDiv);

    // 클릭 시 일정 추가 (현재 달 셀만)
    if (!otherMonth && dateStr) {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => showAddEventDialog(dateStr));
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
          label:    `${reg.name}${timeLabel} / 1차수`,
          raw:      reg,
          time:     timeStr || '00:00',
          isManual: false,
        });
      }
    });

    return map;
  }

  function formatDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function update(data) {
    registrations = data || [];
    render();
  }

  return { init, update, addManualEvent, deleteManualEvent };
})();

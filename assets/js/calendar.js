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

  // ── 이벤트 추가 다이얼로그 ──────────────────────────
  function showAddEventDialog(dateStr) {
    const existing = document.getElementById('calEventDialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.id = 'calEventDialog';
    dialog.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:2000;display:flex;align-items:center;justify-content:center;';
    dialog.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:28px 28px 24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.18);">
        <h3 style="margin:0 0 16px;font-size:16px;color:#2d6a4f;">일정 추가 — ${dateStr}</h3>
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">이름</label>
        <input id="dlgName" type="text" placeholder="고객 이름" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:10px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">시간</label>
        <input id="dlgTime" type="time" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:10px;">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">차수</label>
        <input id="dlgSession" type="number" min="1" placeholder="1" style="width:100%;padding:8px 10px;border:1.5px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:18px;">
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="dlgCancel" style="padding:8px 18px;border:1.5px solid #ddd;border-radius:50px;background:#fff;cursor:pointer;font-size:14px;">취소</button>
          <button id="dlgConfirm" style="padding:8px 18px;border:none;border-radius:50px;background:#2d6a4f;color:#fff;cursor:pointer;font-size:14px;font-weight:700;">추가</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#dlgCancel').addEventListener('click', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    dialog.querySelector('#dlgConfirm').addEventListener('click', () => {
      const name = dialog.querySelector('#dlgName').value.trim();
      const time = dialog.querySelector('#dlgTime').value;
      const sessionNum = dialog.querySelector('#dlgSession').value || '1';
      if (!name) { alert('이름을 입력해 주세요.'); return; }
      addManualEvent(dateStr, name, time, sessionNum);
      dialog.remove();
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
      const events  = eventMap[dateStr] || [];

      const cell = createCell(d, false, isToday, dateStr);

      events.forEach(ev => {
        const chip = document.createElement('div');
        chip.className = 'event-chip';
        chip.textContent = ev.label;
        chip.title = ev.label;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (ev.raw && typeof Admin !== 'undefined') Admin.openModal(ev.raw);
        });
        cell.appendChild(chip);
      });

      // 수동 이벤트 칩
      manualEvents.filter(me => me.dateStr === dateStr).forEach(me => {
        const chip = document.createElement('div');
        chip.className = 'event-chip manual-chip';
        chip.textContent = `${me.name} / ${me.sessionNum}차수`;
        if (me.time) chip.title = `${me.name} / ${me.sessionNum}차수 (${me.time})`;
        const delBtn = document.createElement('span');
        delBtn.textContent = ' ×';
        delBtn.style.cssText = 'cursor:pointer;font-weight:700;margin-left:4px;';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`"${me.name}" 일정을 삭제하시겠습니까?`)) {
            deleteManualEvent(me.id);
          }
        });
        chip.appendChild(delBtn);
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
      // first_session 필드 우선 사용
      if (reg.first_session) {
        const key = reg.first_session.trim().substring(0, 10);
        if (!map[key]) map[key] = [];
        const sessionNum = reg.session_count || '';
        map[key].push({
          label: `${reg.name} / ${sessionNum ? sessionNum + '차수' : ''}`.replace(/ \/$/, ''),
          raw:   reg,
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

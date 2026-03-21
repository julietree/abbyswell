/**
 * calendar.js — CSS Grid 월간 캘린더
 *
 * Admin.registrations 데이터를 받아 월별 코칭 일정을 렌더링합니다.
 */

const Calendar = (() => {
  let year  = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-indexed
  let registrations = [];

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

    const today      = new Date();
    const firstDay   = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // 이번 달 이벤트 맵핑 (start_date, end_date 기준)
    const eventMap = buildEventMap();

    // 이전 달 빈 칸
    const prevDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = createCell(prevDays - i, true, false);
      grid.appendChild(cell);
    }

    // 이번 달
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr   = formatDateISO(new Date(year, month, d));
      const isToday   = (year === today.getFullYear() && month === today.getMonth() && d === today.getDate());
      const events    = eventMap[dateStr] || [];

      const cell = createCell(d, false, isToday);

      events.forEach(ev => {
        const chip = document.createElement('div');
        chip.className = `event-chip${ev.type === 'end' ? ' ending' : ''}`;
        chip.textContent = ev.name;
        chip.title = `${ev.name} | ${ev.session_type}${ev.type === 'end' ? ' (종료)' : ' (시작)'}`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof Admin !== 'undefined') Admin.openModal(ev.raw);
        });
        cell.appendChild(chip);
      });

      grid.appendChild(cell);
    }

    // 다음 달 빈 칸 (6주 고정)
    const totalCells = firstDay + daysInMonth;
    const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
      grid.appendChild(createCell(d, true, false));
    }
  }

  function createCell(day, otherMonth, isToday) {
    const cell = document.createElement('div');
    cell.className = `cal-cell${otherMonth ? ' other-month' : ''}${isToday ? ' today' : ''}`;

    const dateDiv = document.createElement('div');
    dateDiv.className = 'cal-date';
    dateDiv.textContent = day;
    cell.appendChild(dateDiv);

    return cell;
  }

  function buildEventMap() {
    const map = {};

    registrations.forEach(reg => {
      // 시작일 이벤트
      if (reg.start_date) {
        const key = reg.start_date.trim().substring(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push({
          name:         reg.name,
          session_type: reg.session_type,
          type:         'start',
          raw:          reg,
        });
      }
      // 종료일 이벤트
      if (reg.end_date) {
        const key = reg.end_date.trim().substring(0, 10);
        if (!map[key]) map[key] = [];
        map[key].push({
          name:         reg.name,
          session_type: reg.session_type,
          type:         'end',
          raw:          reg,
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

  return { init, update };
})();

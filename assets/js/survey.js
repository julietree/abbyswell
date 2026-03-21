/**
 * survey.js — 3단계 설문 렌더링 & 제출
 *
 * 섹션 구성:
 *   1. 기본 정보 (이름 / 시작일 / 이메일 / 연락처 / 온라인링크)
 *   2. 세션 구성 & 비용 안내 (세션횟수 / 비용안내)
 *   3. 약관 동의 (전체 약관 + 단일 체크박스 + 제출)
 */

const Survey = (() => {
  // ── 상태 ────────────────────────────────────────────
  let currentSection   = 1;
  const TOTAL_SECTIONS = 3;
  let bookedDates      = new Set();
  let selectedStartDate = null;

  // ── 날짜 선택기 상태 ────────────────────────────────
  const dpState = {
    year:  new Date().getFullYear(),
    month: new Date().getMonth(),
  };

  // ── 초기화 ──────────────────────────────────────────
  async function init() {
    if (typeof emailjs !== 'undefined') {
      emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
    }
    await loadBookedDates();
    renderDatePicker();
    bindEvents();

    if (new URLSearchParams(window.location.search).get('preview') === 'true') {
      applyPreviewConfig();
    }
  }

  // ── 예약 날짜 로드 ───────────────────────────────────
  async function loadBookedDates() {
    try {
      const registrations = await API.getRegistrations();
      bookedDates = new Set(
        registrations
          .filter(r => r.start_date)
          .map(r => r.start_date.trim())
      );
    } catch (err) {
      console.warn('예약 날짜 로드 실패 (오프라인 모드로 진행):', err.message);
    }
  }

  // ── 날짜 선택기 렌더 ─────────────────────────────────
  function renderDatePicker() {
    const grid    = document.getElementById('startDpGrid');
    const titleEl = document.getElementById('startMonthTitle');
    const { year, month } = dpState;

    titleEl.textContent = `${year}년 ${month + 1}월`;

    const cells = grid.querySelectorAll('.dp-day');
    cells.forEach(c => c.remove());

    const today       = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'dp-day empty';
      grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate   = new Date(year, month, d);
      const dateStr    = formatDateISO(cellDate);
      const isPast     = cellDate < today;
      const isBooked   = bookedDates.has(dateStr);
      const isSelected = selectedStartDate && formatDateISO(selectedStartDate) === dateStr;
      const isToday    = formatDateISO(cellDate) === formatDateISO(today);

      const cell = document.createElement('div');
      cell.className = 'dp-day';
      cell.textContent = d;
      cell.setAttribute('role', 'gridcell');

      if (isPast) {
        cell.classList.add('past');
        cell.setAttribute('aria-disabled', 'true');
      } else if (isBooked) {
        cell.classList.add('disabled');
        cell.setAttribute('aria-disabled', 'true');
        cell.title = '이미 예약된 날짜입니다';
      } else {
        cell.addEventListener('click', () => selectStartDate(cellDate));
      }

      if (isSelected) cell.classList.add('selected');
      if (isToday)    cell.classList.add('today');

      grid.appendChild(cell);
    }
  }

  function selectStartDate(date) {
    selectedStartDate = date;
    const iso = formatDateISO(date);

    document.getElementById('start_date').value = iso;
    document.getElementById('startDateDisplay').textContent = formatKoreanDate(date);
    document.getElementById('startDateDisplay').classList.remove('placeholder');

    closeDatePicker();
    renderDatePicker();
    clearError('start_date');
  }

  function openDatePicker() {
    document.getElementById('startDatePicker').classList.add('open');
    document.getElementById('startDateBtn').setAttribute('aria-expanded', 'true');
  }

  function closeDatePicker() {
    document.getElementById('startDatePicker').classList.remove('open');
    document.getElementById('startDateBtn').setAttribute('aria-expanded', 'false');
  }

  // ── 이벤트 바인딩 ────────────────────────────────────
  function bindEvents() {
    // 날짜 선택기 토글
    document.getElementById('startDateBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const picker = document.getElementById('startDatePicker');
      picker.classList.contains('open') ? closeDatePicker() : openDatePicker();
    });

    // 날짜 선택기 외부 클릭 닫기
    document.addEventListener('click', (e) => {
      if (!document.getElementById('startDateWrapper').contains(e.target)) {
        closeDatePicker();
      }
    });

    // 월 이동
    document.getElementById('startPrevMonth').addEventListener('click', () => {
      dpState.month--;
      if (dpState.month < 0) { dpState.month = 11; dpState.year--; }
      renderDatePicker();
    });

    document.getElementById('startNextMonth').addEventListener('click', () => {
      dpState.month++;
      if (dpState.month > 11) { dpState.month = 0; dpState.year++; }
      renderDatePicker();
    });

    // 폼 제출
    document.getElementById('registrationForm').addEventListener('submit', handleSubmit);
  }

  // ── 섹션 네비게이션 ──────────────────────────────────
  function nextSection(from) {
    if (!validateSection(from)) return;
    goToSection(from + 1);
  }

  function prevSection(from) {
    goToSection(from - 1);
  }

  function goToSection(n) {
    document.getElementById(`section-${currentSection}`).classList.remove('active');
    currentSection = n;
    document.getElementById(`section-${n}`).classList.add('active');
    updateProgress(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateProgress(n) {
    document.querySelectorAll('.progress-step').forEach(step => {
      const s = parseInt(step.dataset.step);
      step.classList.toggle('active',    s === n);
      step.classList.toggle('completed', s < n);
    });
  }

  // ── 유효성 검사 ──────────────────────────────────────
  function validateSection(section) {
    let valid = true;

    if (section === 1) {
      if (!getVal('name').trim())  { showError('name');       valid = false; }
      if (!getVal('start_date'))   { showError('start_date'); valid = false; }
      const email = getVal('email').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('email'); valid = false;
      }
      if (!getVal('contact').trim()) { showError('contact'); valid = false; }
    }

    if (section === 2) {
      const total = parseInt(document.getElementById('session_count_total').value);
      if (!total || total < 1) { showError('session_count'); valid = false; }
    }

    if (section === 3) {
      if (!document.getElementById('agree_all').checked) {
        showError('terms'); valid = false;
      }
    }

    return valid;
  }

  function showError(field) {
    const el    = document.getElementById(`error-${field}`);
    const input = document.getElementById(field);
    if (el)    el.classList.add('visible');
    if (input) input.classList.add('error');
  }

  function clearError(field) {
    const el    = document.getElementById(`error-${field}`);
    const input = document.getElementById(field);
    if (el)    el.classList.remove('visible');
    if (input) input.classList.remove('error');
  }

  function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  // ── 폼 제출 ─────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateSection(3)) return;

    showLoading('신청서를 제출하고 있습니다...');

    const formData = collectFormData();

    try {
      await API.writeRegistration(formData);

      showLoading('계약서를 생성하고 있습니다...');
      await Contract.generate(formData);

      document.getElementById(`section-${currentSection}`).classList.remove('active');
      document.getElementById('completionScreen').classList.add('active');
      updateProgress(TOTAL_SECTIONS + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      console.error('제출 실패:', err);
      alert('제출 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.\n\n오류: ' + err.message);
    } finally {
      hideLoading();
    }
  }

  function collectFormData() {
    return {
      id:                 crypto.randomUUID(),
      name:               getVal('name').trim(),
      email:              getVal('email').trim(),
      contact:            getVal('contact').trim(),
      start_date:         getVal('start_date'),
      end_date:           '',
      session_type:       '',
      session_count:      getVal('session_count_total'),
      monthly_count:      '',
      topic:              '',
      online_link:        '',
      submitted_at:       new Date().toISOString(),
      submitted_date_str: formatKoreanDate(new Date()),
    };
  }

  // ── 계좌번호 복사 ────────────────────────────────────
  function copyAccount() {
    const accountText = '375302-04-074200';
    const btn = document.getElementById('copyAccountBtn');

    const checkIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const copyIcon  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(accountText).then(() => {
        btn.innerHTML = checkIcon;
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = copyIcon;
          btn.classList.remove('copied');
        }, 2000);
      });
    } else {
      // fallback
      const el = document.createElement('textarea');
      el.value = accountText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      btn.innerHTML = checkIcon;
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = copyIcon;
        btn.classList.remove('copied');
      }, 2000);
    }
  }

  // ── 로딩 오버레이 ─────────────────────────────────────
  function showLoading(msg = '처리 중입니다...') {
    document.getElementById('loadingText').textContent = msg;
    document.getElementById('loadingOverlay').classList.add('active');
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('active');
  }

  // ── 유틸 ────────────────────────────────────────────
  function formatDateISO(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatKoreanDate(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
  }

  // ── Preview 모드 ────────────────────────────────────
  function applyPreviewConfig() {
    try {
      const config = JSON.parse(localStorage.getItem('preview_config') || '{}');
      if (config.bg_color) {
        document.body.style.background = config.bg_color;
      }
      if (config.bg_image) {
        document.body.style.backgroundImage = `url(${config.bg_image})`;
        document.body.style.backgroundSize = 'cover';
      }
    } catch (err) {
      console.warn('미리보기 설정 로드 실패:', err);
    }
  }

  // ── 공개 API ────────────────────────────────────────
  return { init, nextSection, prevSection, copyAccount };
})();

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', Survey.init);

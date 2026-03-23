/**
 * admin.js — Admin 대시보드 메인 로직
 */

const Admin = (() => {
  let allData     = [];
  let filtered    = [];
  let sortKey     = 'created_at';
  let sortDir     = 'desc';
  const PAGE_SIZE = 15;
  let currentPage = 1;
  let _saveTimer = null;

  // 시간 선택 옵션
  const HOURS = Array.from({length: 24}, (_, i) => String(i).padStart(2,'0'));
  const MINS  = ['00','10','20','30','40','50'];

  // ── 초기화 ──────────────────────────────────────────
  async function init() {
    await loadData();
  }

  // ── localStorage 캐시 헬퍼 ───────────────────────────
  function getFsCache() {
    try { return JSON.parse(localStorage.getItem('admin_fs') || '{}'); }
    catch { return {}; }
  }
  function setFsCache(id, value) {
    const cache = getFsCache();
    cache[id] = value;
    localStorage.setItem('admin_fs', JSON.stringify(cache));
  }

  // ── 데이터 로드 ──────────────────────────────────────
  async function loadData() {
    try {
      allData = await API.getRegistrations();
    } catch (err) {
      console.error('데이터 로드 실패:', err.message);
      allData = [];
      showEmptyState('데이터를 불러오지 못했습니다. 설정을 확인해 주세요.');
    }

    // first_session 정규화 헬퍼: 어떤 형식이든 "yyyy-MM-ddTHH:mm"으로 변환
    function toIsoSession(raw) {
      if (!raw) return '';
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.substring(0, 16);
      try {
        const d = new Date(raw);
        if (!isNaN(d)) {
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        }
      } catch(e) {}
      return '';
    }

    // GAS에 first_session이 없으면 localStorage 캐시로 보완 + 형식 정규화
    const fsCache = getFsCache();
    allData.forEach(reg => {
      const cacheKey = reg.id || reg.created_at || reg.email || reg.name;
      if (cacheKey) {
        if (reg.first_session) {
          // 형식 정규화 (구글 시트 자동변환 대응)
          reg.first_session = toIsoSession(reg.first_session);
          fsCache[cacheKey] = reg.first_session;
        } else if (fsCache[cacheKey]) {
          reg.first_session = fsCache[cacheKey];
        }
      }
    });
    localStorage.setItem('admin_fs', JSON.stringify(fsCache));

    filtered = [...allData];
    updateStats();
    Calendar.init(allData);
    renderTable();
  }

  // ── 통계 계산 ────────────────────────────────────────
  function updateStats() {
    const now       = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;

    document.getElementById('statTotal').textContent = allData.length;
    document.getElementById('statThisMonth').textContent = allData.filter(r =>
      r.created_at && r.created_at.startsWith(thisMonth)
    ).length;
  }

  // ── 검색 필터 ────────────────────────────────────────
  function filterTable() {
    const q = document.getElementById('tableSearch').value.toLowerCase().trim();
    filtered = allData.filter(r =>
      (r.name  || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q)
    );
    currentPage = 1;
    renderTable();
  }

  // ── 정렬 ────────────────────────────────────────────
  function sortTable(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key; sortDir = 'asc';
    }

    document.querySelectorAll('thead th').forEach(th => {
      th.classList.remove('sort-asc','sort-desc');
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = '↕';
    });
    const activeHeader = document.querySelector(`th[data-key="${key}"]`);
    if (activeHeader) {
      activeHeader.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      const icon = activeHeader.querySelector('.sort-icon');
      if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
    }

    filtered.sort((a, b) => {
      const va = (a[key] || '').toString();
      const vb = (b[key] || '').toString();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
    });

    currentPage = 1;
    renderTable();
  }

  // ── 날짜 문자열 정규화 ────────────────────────────────
  // 구글 시트가 날짜를 "Wed Mar 25 2026 09:00:00 GMT+0000" 형식으로 반환하는 경우 처리
  function normalizeFirstSession(raw) {
    if (!raw) return { date: '', hour: '09', min: '00' };

    // 올바른 형식: "2026-03-25T09:00"
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return {
        date: raw.substring(0, 10),
        hour: raw.length > 12 ? raw.substring(11, 13) : '09',
        min:  raw.length > 15 ? raw.substring(14, 16) : '00',
      };
    }

    // 구글 시트 Date 변환 형식: "Wed Mar 25 2026 09:00:00 GMT..."
    try {
      const d = new Date(raw);
      if (!isNaN(d)) {
        const m = String(d.getMinutes()).padStart(2, '0');
        return {
          date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
          hour: String(d.getHours()).padStart(2, '0'),
          min:  MINS.includes(m) ? m : '00',
        };
      }
    } catch (e) {}

    return { date: '', hour: '09', min: '00' };
  }

  // ── 시간 선택기 HTML 생성 ─────────────────────────────
  function buildTimePicker(idx, firstSession) {
    const { date: fsDate, hour: fsHour, min: fsMinRounded } = normalizeFirstSession(firstSession);

    const hourOpts = HOURS.map(h =>
      `<option value="${h}"${h === fsHour ? ' selected' : ''}>${h}</option>`
    ).join('');
    const minOpts = MINS.map(m =>
      `<option value="${m}"${m === fsMinRounded ? ' selected' : ''}>${m}</option>`
    ).join('');

    return `
      <div class="time-picker-cell">
        <input type="date" class="fs-date" data-idx="${idx}"
          value="${esc(fsDate)}"
          onchange="Admin.updateFirstSession(${idx})">
        <div class="time-selects">
          <select class="fs-hour" data-idx="${idx}" onchange="Admin.updateFirstSession(${idx})">
            ${hourOpts}
          </select>
          <span class="time-colon">:</span>
          <select class="fs-min" data-idx="${idx}" onchange="Admin.updateFirstSession(${idx})">
            ${minOpts}
          </select>
        </div>
      </div>
    `;
  }

  // ── 첫차수 업데이트 & 구글시트 저장 ─────────────────────────────
  function updateFirstSession(idx) {
    const dateInput  = document.querySelector(`.fs-date[data-idx="${idx}"]`);
    const hourSelect = document.querySelector(`.fs-hour[data-idx="${idx}"]`);
    const minSelect  = document.querySelector(`.fs-min[data-idx="${idx}"]`);
    if (!dateInput || !dateInput.value) return;

    const value = `${dateInput.value}T${hourSelect.value}:${minSelect.value}`;
    const reg = allData[idx];
    if (reg) {
      reg.first_session = value;
      // localStorage에 즉시 저장 (새로고침 후에도 유지)
      // id → created_at → email → name 순으로 고유 키 결정
      const key = reg.id || reg.created_at || reg.email || reg.name;
      if (key) setFsCache(key, value);
      console.log('[첫차수] 저장:', key, value, '→ cache:', getFsCache());
    }
    Calendar.update(allData);
    showSaveToast('✅ 첫차수 저장됨');

    // 디바운스: 800ms 뒤 구글시트에도 저장 (백업)
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      if (!reg || !reg.id) return;
      try {
        await API.updateFirstSession(reg.id, value);
      } catch (err) {
        console.error('첫차수 GAS 저장 실패:', err.message);
      }
    }, 800);
  }

  // ── 저장 토스트 ──────────────────────────────────────
  function showSaveToast(msg) {
    let toast = document.getElementById('saveToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'saveToast';
      toast.style.cssText = [
        'position:fixed','bottom:24px','right:24px','background:#1f2937',
        'color:#fff','padding:10px 18px','border-radius:8px','font-size:13px',
        'z-index:9999','opacity:0','transition:opacity 0.3s','pointer-events:none',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  // ── 테이블 렌더 ─────────────────────────────────────
  function renderTable() {
    const tbody = document.getElementById('tableBody');
    const selectAllCb = document.getElementById('selectAllCb');
    if (selectAllCb) selectAllCb.checked = false;

    if (filtered.length === 0) {
      showEmptyState('등록된 데이터가 없습니다.');
      renderPagination(0);
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = page.map(r => {
      // allData에서의 실제 인덱스 사용 (버그 방지)
      const idx = allData.indexOf(r);
      return `
        <tr>
          <td onclick="event.stopPropagation()">
            <input type="checkbox" class="row-checkbox" data-idx="${idx}">
          </td>
          <td onclick="Admin.openModal(${escAttr(JSON.stringify(r))})" style="cursor:pointer">${esc(r.name)}</td>
          <td>${esc(formatDate(r.created_at))}</td>
          <td>${esc(r.session_count)}회</td>
          <td>${esc(formatContact(r.contact))}</td>
          <td>${esc(r.email)}</td>
          <td onclick="event.stopPropagation()">
            <button class="btn-dl-sm" onclick="Admin.downloadContract(${escAttr(JSON.stringify(r))})">📄 다운로드</button>
          </td>
          <td onclick="event.stopPropagation()">
            ${buildTimePicker(idx, r.first_session)}
          </td>
        </tr>
      `;
    }).join('');

    renderPagination(filtered.length);
  }

  // ── 선택 삭제 ────────────────────────────────────────
  function deleteSelected() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkboxes.length === 0) { alert('삭제할 항목을 선택해 주세요.'); return; }
    if (!confirm(`선택한 ${checkboxes.length}개 항목을 삭제하시겠습니까?`)) return;

    const idxs = Array.from(checkboxes).map(cb => parseInt(cb.dataset.idx));
    allData = allData.filter((_, i) => !idxs.includes(i));
    filtered = [...allData];
    renderTable();
    Calendar.update(allData);
  }

  // ── 전체선택 토글 ────────────────────────────────────
  function toggleSelectAll(cb) {
    document.querySelectorAll('.row-checkbox').forEach(box => { box.checked = cb.checked; });
  }

  function showEmptyState(msg) {
    document.getElementById('tableBody').innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <div class="empty-text">${msg}</div>
        </div>
      </td></tr>`;
  }

  // ── 페이지네이션 ─────────────────────────────────────
  function renderPagination(total) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const start = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const end   = Math.min(currentPage * PAGE_SIZE, total);

    document.getElementById('paginationInfo').textContent =
      total === 0 ? '' : `${total}개 중 ${start}–${end}`;

    const btns = document.getElementById('pageBtns');
    btns.innerHTML = '';
    for (let p = 1; p <= totalPages; p++) {
      const btn = document.createElement('button');
      btn.className = `page-btn${p === currentPage ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => { currentPage = p; renderTable(); });
      btns.appendChild(btn);
    }
  }

  // ── 상세 모달 ────────────────────────────────────────
  function openModal(reg) {
    if (typeof reg === 'string') reg = JSON.parse(reg);
    document.getElementById('modalTitle').textContent = `${reg.name} 님 상세 정보`;
    document.getElementById('modalContent').innerHTML = `
      <span class="detail-label">이름</span>        <span class="detail-value">${esc(reg.name)}</span>
      <span class="detail-label">이메일</span>      <span class="detail-value">${esc(reg.email)}</span>
      <span class="detail-label">연락처</span>      <span class="detail-value">${esc(reg.contact)}</span>
      <span class="detail-label">희망세션 횟수</span><span class="detail-value">${esc(reg.session_count)}회</span>
      <span class="detail-label">선호 시간대</span> <span class="detail-value">${esc(reg.topic || reg.preferred_times)}</span>
      <span class="detail-label">신청일</span>      <span class="detail-value">${esc(formatDate(reg.created_at))}</span>
      <span class="detail-label">계약서 다운로드</span>
      <span class="detail-value">
        <button class="btn-contract-dl" onclick="Admin.downloadContract(${escAttr(JSON.stringify(reg))})">
          📄 Word 계약서 다운로드
        </button>
      </span>
    `;
    document.getElementById('detailModal').classList.add('open');
  }

  function closeModal(e) {
    if (!e || e.target === document.getElementById('detailModal') || !e.target) {
      document.getElementById('detailModal').classList.remove('open');
    }
  }

  // ── 계약서 Word 다운로드 ─────────────────────────────
  async function downloadContract(reg) {
    if (typeof reg === 'string') reg = JSON.parse(reg);
    await Contract.downloadDocx(reg);
  }

  // ── 엑셀 다운로드 ────────────────────────────────────
  function exportExcel() {
    if (typeof XLSX === 'undefined') { alert('SheetJS 라이브러리가 로드되지 않았습니다.'); return; }

    const headers = ['이름','이메일','연락처','세션횟수','선호시간대','신청일','첫차수'];
    const rows = allData.map(r => [
      r.name, r.email, r.contact, r.session_count,
      r.topic || r.preferred_times,
      formatDate(r.created_at), r.first_session || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((_, i) => ({ wch: [12, 24, 16, 10, 30, 14, 18][i] }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '등록현황');
    XLSX.writeFile(wb, `코칭등록현황_${new Date().toISOString().substring(0, 10)}.xlsx`);
  }

  // ── 첫차수 캘린더 삭제 ───────────────────────────────
  function clearFirstSession(regId) {
    const reg = allData.find(r => r.id === regId);
    if (!reg) return;
    if (!confirm(`"${reg.name}"의 첫차수 일정을 캘린더에서 삭제하시겠습니까?\n(등록 데이터는 유지됩니다.)`)) return;

    reg.first_session = '';

    // localStorage 캐시에서 제거
    const key = reg.id || reg.created_at || reg.email || reg.name;
    if (key) {
      const cache = getFsCache();
      delete cache[key];
      localStorage.setItem('admin_fs', JSON.stringify(cache));
    }

    // GAS에 빈 값으로 업데이트 (행 삭제 아님)
    if (reg.id) {
      API.updateFirstSession(reg.id, '').catch(err => console.error('첫차수 초기화 실패:', err));
    }

    Calendar.update(allData);
    renderTable();
    showSaveToast('🗑 첫차수 일정 삭제됨');
  }

  // ── 유틸 ────────────────────────────────────────────
  function esc(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escAttr(str) {
    return str.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
  }
  function formatDate(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      if (isNaN(d)) return iso;
      return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return iso; }
  }

  function formatContact(raw) {
    if (!raw) return '';
    const trimmed = raw.trim();

    // 전화번호 패턴 추출: 0으로 시작하는 10~11자리 숫자(하이픈 포함)
    const phoneMatch = trimmed.match(/0\d[\d\-]{8,12}/);
    if (!phoneMatch) return trimmed; // 전화번호 없으면 원본 반환

    const digits = phoneMatch[0].replace(/\D/g, '');
    let phone = '';
    if (digits.length === 11) phone = `${digits.substring(0,3)}-${digits.substring(3,7)}-${digits.substring(7)}`;
    else if (digits.length === 10) phone = `${digits.substring(0,3)}-${digits.substring(3,6)}-${digits.substring(6)}`;
    else phone = phoneMatch[0]; // 그 외 길이는 그대로

    // 전화번호 제거 후 남은 텍스트 = 카카오 아이디
    const kakao = trimmed
      .replace(phoneMatch[0], '')
      .replace(/^[\s,\/\|\(\)]+|[\s,\/\|\(\)]+$/g, '')
      .trim();

    if (kakao) return `${phone} (카카오: ${kakao})`;
    return phone;
  }

  return { init, loadData, filterTable, sortTable, openModal, closeModal,
           exportExcel, downloadContract, deleteSelected, updateFirstSession, toggleSelectAll, clearFirstSession };
})();

document.addEventListener('DOMContentLoaded', Admin.init);

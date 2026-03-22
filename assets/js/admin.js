/**
 * admin.js — Admin 대시보드 메인 로직
 *
 * 담당:
 * - 데이터 로드 & 통계 계산
 * - 정렬, 검색, 페이지네이션
 * - 상세 팝업 (모달)
 * - 엑셀 다운로드
 */

const Admin = (() => {
  let allData     = [];   // 전체 등록 데이터
  let filtered    = [];   // 검색 필터 후 데이터
  let sortKey     = 'created_at';
  let sortDir     = 'desc';   // 'asc' | 'desc'
  const PAGE_SIZE = 15;
  let currentPage = 1;

  // ── 초기화 ──────────────────────────────────────────
  async function init() {
    await loadData();
    await Secretary.init();
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

    filtered = [...allData];
    updateStats();
    Calendar.init(allData);
    renderTable();
  }

  // ── 통계 계산 ────────────────────────────────────────
  function updateStats() {
    const now        = new Date();
    const thisMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    document.getElementById('statTotal').textContent    = allData.length;
    document.getElementById('statSent').textContent     = allData.filter(r => r.contract_status === '발송완료').length;
    document.getElementById('statPending').textContent  = allData.filter(r => r.contract_status !== '발송완료').length;
    document.getElementById('statThisMonth').textContent = allData.filter(r =>
      r.start_date && r.start_date.startsWith(thisMonth)
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
      sortKey = key;
      sortDir = 'asc';
    }

    // 헤더 아이콘 업데이트
    document.querySelectorAll('thead th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      th.querySelector('.sort-icon').textContent = '↕';
    });
    const activeHeader = document.querySelector(`th[data-key="${key}"]`);
    if (activeHeader) {
      activeHeader.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      activeHeader.querySelector('.sort-icon').textContent = sortDir === 'asc' ? '↑' : '↓';
    }

    filtered.sort((a, b) => {
      const va = (a[key] || '').toString();
      const vb = (b[key] || '').toString();
      return sortDir === 'asc' ? va.localeCompare(vb, 'ko') : vb.localeCompare(va, 'ko');
    });

    currentPage = 1;
    renderTable();
  }

  // ── 테이블 렌더 ─────────────────────────────────────
  function renderTable() {
    const tbody = document.getElementById('tableBody');

    if (filtered.length === 0) {
      showEmptyState('등록된 데이터가 없습니다.');
      renderPagination(0);
      return;
    }

    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = filtered.slice(start, start + PAGE_SIZE);

    tbody.innerHTML = page.map(r => `
      <tr onclick="Admin.openModal(${escAttr(JSON.stringify(r))})">
        <td>${esc(r.name)}</td>
        <td>${esc(r.start_date)}</td>
        <td>${esc(r.end_date)}</td>
        <td>${esc(r.session_type)}</td>
        <td>${esc(r.session_count)}</td>
        <td>${esc(r.email)}</td>
        <td>${statusBadge(r.contract_status)}</td>
        <td>${esc(formatDate(r.created_at))}</td>
        <td onclick="event.stopPropagation()">
          <button class="btn-contract-dl" onclick="Admin.downloadContract(${escAttr(JSON.stringify(r))})">
            📄 계약서
          </button>
        </td>
      </tr>
    `).join('');

    renderPagination(filtered.length);
  }

  function showEmptyState(msg) {
    document.getElementById('tableBody').innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <div class="empty-text">${msg}</div>
          </div>
        </td>
      </tr>
    `;
  }

  function statusBadge(status) {
    const cls = status === '발송완료' ? 'sent' : 'pending';
    return `<span class="status-badge ${cls}">${esc(status || '대기중')}</span>`;
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
      btn.addEventListener('click', () => {
        currentPage = p;
        renderTable();
      });
      btns.appendChild(btn);
    }
  }

  // ── 상세 모달 ────────────────────────────────────────
  function openModal(reg) {
    if (typeof reg === 'string') reg = JSON.parse(reg);

    document.getElementById('modalTitle').textContent = `${reg.name} 님 상세 정보`;

    const contractLink = reg.contract_url
      ? `<a href="${reg.contract_url}" target="_blank">계약서 열기 ↗</a>`
      : '(미업로드)';

    document.getElementById('modalContent').innerHTML = `
      <span class="detail-label">이름</span>       <span class="detail-value">${esc(reg.name)}</span>
      <span class="detail-label">이메일</span>     <span class="detail-value">${esc(reg.email)}</span>
      <span class="detail-label">연락처</span>     <span class="detail-value">${esc(reg.contact)}</span>
      <span class="detail-label">시작일</span>     <span class="detail-value">${esc(reg.start_date)}</span>
      <span class="detail-label">세션 횟수</span>  <span class="detail-value">${esc(reg.session_count)}</span>
      <span class="detail-label">계약서 상태</span><span class="detail-value">${statusBadge(reg.contract_status)}</span>
      <span class="detail-label">등록일</span>     <span class="detail-value">${esc(formatDate(reg.created_at))}</span>
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
    if (typeof XLSX === 'undefined') {
      alert('SheetJS 라이브러리가 로드되지 않았습니다.');
      return;
    }

    const headers = ['이름', '이메일', '연락처', '시작일', '종료일', '진행방식', '세션횟수', '코칭주제', '온라인링크', '계약서상태', '등록일'];
    const rows    = allData.map(r => [
      r.name, r.email, r.contact, r.start_date, r.end_date,
      r.session_type, r.session_count, r.topic, r.online_link,
      r.contract_status, formatDate(r.created_at),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((_, i) => ({ wch: [10, 24, 14, 12, 12, 10, 12, 20, 30, 12, 18][i] }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '등록현황');

    const today = new Date().toISOString().substring(0, 10);
    XLSX.writeFile(wb, `코칭등록현황_${today}.xlsx`);
  }

  // ── 유틸 ────────────────────────────────────────────
  function esc(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escAttr(str) {
    return str.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    } catch { return iso; }
  }

  return { init, loadData, filterTable, sortTable, openModal, closeModal, exportExcel, downloadContract };
})();

document.addEventListener('DOMContentLoaded', Admin.init);

/**
 * modify.js — 신청서 수정 에디터 (WYSIWYG 인라인 편집)
 *
 * Fix 3a: 탭 기반 → WYSIWYG 라이브 폼 뷰 (클릭하여 바로 수정)
 * Fix 3b: 미리보기 → 페이지 내 모달 iframe
 * Fix 3c: 기본 문구 변경 (약관→계약 동의)
 */

const Modify = (() => {

  // ── 기본 설정값 ────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    fields: {
      name:            { label: '고객 이름',                   bold: false, italic: false },
      email:           { label: '이메일 주소',                 bold: false, italic: false },
      contact:         { label: '연락처',                     bold: false, italic: false },
      session_count:   { label: '희망 세션 횟수',              bold: false, italic: false },
      preferred_times: { label: '선호하는 요일 및 시간대',     bold: false, italic: false },
      agree_all:       { label: '계약에 동의합니다.',          bold: false, italic: false },
    },
    sections: {
      '1': { title: '기본 정보',            desc: '코칭 계약의 기본 사항과 연락처를 입력해 주세요.' },
      '2': { title: '세션 구성 & 비용 안내', desc: '한 세션당 시간은 약 50~60분 소요됩니다. 희망하시는 세션 횟수를 입력하고 비용 안내를 확인해주세요.' },
      '3': { title: '계약 동의',            desc: '아래 내용을 읽고 하단에서 동의해 주세요.' },
    },
    timeslots: [
      { value: '월~금: 오전 7~9시',  label: '월~금 · 오전 7~9시' },
      { value: '토~일: 오전 8~10시', label: '토~일 · 오전 8~10시' },
      { value: '토~일: 저녁 7~10시', label: '토~일 · 저녁 7~10시' },
    ],
    bg: { type: 'color', color1: '#e8f0e9', color2: '#f5efe6', image: null },
    terms_articles: [
      { title: '코칭이란', content: '코칭은 고객이 스스로 원하는 삶을 설계하고 목표를 실현할 수 있도록 돕는 파트너십입니다. 코치는 조언이나 해답을 제시하지 않으며, 모든 답은 고객 안에 있다고 믿습니다. 고객의 현재 상황과 원하는 미래에 집중하되, 과거의 상처나 정신건강 문제는 다루지 않습니다. 해당 영역은 전문 상담사의 도움이 필요합니다.' },
      { title: '코칭 비용 및 결제', content: '코칭 1회 비용은 10,000원(VAT 포함)이며, 계약 후 1주일 이내에 전체 코칭 비용을 계좌이체로 납부합니다.' },
      { title: '일정 변경 및 취소', content: '코칭 48시간 전까지 취소 시 전액 환불, 24시간 전까지 취소 시 50% 환불, 24시간 이내 취소 또는 무단 불참 시 환불이 불가합니다. 일정 변경은 48시간 전까지 요청 시 재조정 가능합니다. 코치 사정으로 코칭 취소 시 전액 환불 또는 고객 선택에 따라 일정을 재조정하며, 불가피한 사정(천재지변, 응급상황 등)은 별도 협의합니다.' },
      { title: '비밀 유지', content: '코치는 고객의 동의 없이 제3자에게 코칭의 어떤 내용도 공유하지 않습니다. 단, 고객 본인 또는 타인에게 위해 가능성이 있다고 판단될 경우 법적 의무에 따라 예외적으로 공유할 수 있습니다.' },
      { title: '고객과 코치의 역할', content: '고객은 변화의 주체가 자기 자신임을 기억하며, 신뢰를 바탕으로 솔직하게 나누고 코칭 사이의 실천을 통해 성장을 만들어갑니다. 코치는 고객의 가능성을 온전히 믿으며, 판단 없는 경청과 질문으로 함께합니다. 모든 과정은 ICF 윤리규정을 준수하며 이루어집니다.' },
      { title: '계약 종료', content: '고객 또는 코치는 언제든지 2주 전 사전 통보로 계약을 종료할 수 있으며, 미진행 코칭 비용은 환불됩니다.' },
      { title: '합의 및 서명', content: '위 내용을 충분히 이해하였으며 동의합니다. 궁금한 점이 있으면 서명 전에 언제든 코치에게 문의하셔도 됩니다.' },
    ],
  };

  let config = deepClone(DEFAULT_CONFIG);

  // ── 초기화 ─────────────────────────────────────────────────────────
  async function init() {
    try {
      const serverConfig = await API.getConfig();
      if (serverConfig && serverConfig.form_config) {
        const parsed = JSON.parse(serverConfig.form_config);
        config = deepMerge(DEFAULT_CONFIG, parsed);
      }
    } catch (err) {
      console.warn('설정 로드 실패, 기본값 사용:', err.message);
    }

    // 배경 UI 초기화
    document.getElementById('bgColor1').value = config.bg.color1 || '#e8f0e9';
    document.getElementById('bgColor2').value = config.bg.color2 || '#f5efe6';
    if (config.bg.type === 'image') {
      document.querySelectorAll('.bg-tab')[1].click();
    }
    updateBgPreview();

    // WYSIWYG 렌더
    renderWysiwyg();
  }

  // ══════════════════════════════════════════════════════════════════
  // Fix 3a: WYSIWYG 에디터
  // ══════════════════════════════════════════════════════════════════

  function renderWysiwyg() {
    const container = document.getElementById('wysiwygEditor');
    if (!container) return;

    container.innerHTML = `
      <div class="wysiwyg-hint">✏️ 텍스트를 클릭하면 바로 수정할 수 있습니다.</div>

      ${renderWysiwygSection('1')}
      ${renderWysiwygSection('2')}
      ${renderWysiwygSection('3')}
    `;

    bindWysiwygEdit();
  }

  function renderWysiwygSection(num) {
    const sec = config.sections[num] || { title: '', desc: '' };

    if (num === '1') {
      return `
        <div class="wysiwyg-section">
          <div class="wysiwyg-section-num">섹션 ${num}</div>
          <div class="wysiwyg-editable" data-type="section-title" data-num="${num}">${esc(sec.title)}</div>
          <div class="wysiwyg-editable wysiwyg-desc" data-type="section-desc" data-num="${num}">${esc(sec.desc)}</div>
          ${renderWysiwygField('name')}
          ${renderWysiwygField('email')}
          ${renderWysiwygField('contact')}
        </div>`;

    } else if (num === '2') {
      return `
        <div class="wysiwyg-section">
          <div class="wysiwyg-section-num">섹션 ${num}</div>
          <div class="wysiwyg-editable" data-type="section-title" data-num="${num}">${esc(sec.title)}</div>
          <div class="wysiwyg-editable wysiwyg-desc" data-type="section-desc" data-num="${num}">${esc(sec.desc)}</div>
          ${renderWysiwygField('session_count')}
          <div class="wysiwyg-field-block">
            <div class="wysiwyg-editable wysiwyg-field-label" data-type="field-label" data-field="preferred_times">${esc(config.fields['preferred_times'] && config.fields['preferred_times'].label || '')}</div>
            <div class="wysiwyg-timeslots" id="wysiwygTimeslots">
              ${renderTimeslotItems()}
            </div>
            <button class="wysiwyg-add-btn" onclick="Modify.addTimeslot()">＋ 시간대 추가</button>
          </div>
        </div>`;

    } else {
      return `
        <div class="wysiwyg-section">
          <div class="wysiwyg-section-num">섹션 ${num}</div>
          <div class="wysiwyg-editable" data-type="section-title" data-num="${num}">${esc(sec.title)}</div>
          <div class="wysiwyg-editable wysiwyg-desc" data-type="section-desc" data-num="${num}">${esc(sec.desc)}</div>
          <div class="wysiwyg-terms-articles" id="wysiwygTermsArticles">
            ${renderTermsArticles()}
          </div>
          <div class="wysiwyg-agree-row">
            <input type="checkbox" disabled>
            <div class="wysiwyg-editable wysiwyg-field-label" data-type="field-label" data-field="agree_all">${esc(config.fields['agree_all'] && config.fields['agree_all'].label || '')}</div>
          </div>
        </div>`;
    }
  }

  function renderWysiwygField(fieldId) {
    const f = config.fields[fieldId] || { label: '' };
    return `
      <div class="wysiwyg-field-block">
        <div class="wysiwyg-editable wysiwyg-field-label" data-type="field-label" data-field="${fieldId}">${esc(f.label)}</div>
        <div class="wysiwyg-input-mock"></div>
      </div>`;
  }

  function renderTermsArticles() {
    return (config.terms_articles || []).map((art, i) => `
      <div class="wysiwyg-terms-article">
        <div class="wysiwyg-editable wysiwyg-terms-title" data-type="terms-title" data-idx="${i}">${esc(art.title)}</div>
        <div class="wysiwyg-editable wysiwyg-terms-content" data-type="terms-content" data-idx="${i}">${esc(art.content)}</div>
      </div>
    `).join('');
  }

  function renderTimeslotItems() {
    return config.timeslots.map((slot, i) => `
      <div class="wysiwyg-timeslot-row" data-idx="${i}">
        <input type="checkbox" disabled style="margin-right:6px;">
        <span class="wysiwyg-editable wysiwyg-timeslot-label" data-type="timeslot-label" data-idx="${i}">${esc(slot.label)}</span>
        <button class="wysiwyg-del-btn" onclick="Modify.removeTimeslot(${i})" title="삭제">✕</button>
      </div>
    `).join('');
  }

  function bindWysiwygEdit() {
    document.querySelectorAll('.wysiwyg-editable').forEach(el => {
      el.addEventListener('click', () => openInlineEdit(el));
    });
  }

  function openInlineEdit(el) {
    if (el.querySelector('input, textarea')) return; // already editing

    const type    = el.dataset.type;
    const isMulti = type === 'section-desc' || type === 'terms-content';
    const current = el.textContent.trim();

    const inputEl = isMulti
      ? document.createElement('textarea')
      : document.createElement('input');

    inputEl.value = current;
    inputEl.style.cssText = 'width:100%;padding:4px 6px;border:1.5px solid #7a9e7e;border-radius:6px;font-size:inherit;font-family:inherit;background:#fff;box-sizing:border-box;';
    if (isMulti) {
      inputEl.rows = 3;
      inputEl.style.resize = 'vertical';
    }

    el.textContent = '';
    el.appendChild(inputEl);
    inputEl.focus();

    const commit = () => {
      const val = inputEl.value.trim();
      saveEditValue(type, el.dataset, val);
      el.textContent = val || '(비어있음)';
      // 타임슬롯은 전체 재렌더
      if (type === 'timeslot-label') {
        document.getElementById('wysiwygTimeslots').innerHTML = renderTimeslotItems();
        bindWysiwygEdit();
      }
    };

    inputEl.addEventListener('blur', commit);
    inputEl.addEventListener('keydown', (e) => {
      if (!isMulti && e.key === 'Enter') { e.preventDefault(); inputEl.blur(); }
      if (e.key === 'Escape') { el.textContent = current; }
    });
  }

  function saveEditValue(type, dataset, val) {
    if (type === 'section-title') {
      const num = dataset.num;
      if (!config.sections[num]) config.sections[num] = {};
      config.sections[num].title = val;
    } else if (type === 'section-desc') {
      const num = dataset.num;
      if (!config.sections[num]) config.sections[num] = {};
      config.sections[num].desc = val;
    } else if (type === 'field-label') {
      const field = dataset.field;
      if (!config.fields[field]) config.fields[field] = {};
      config.fields[field].label = val;
    } else if (type === 'timeslot-label') {
      const idx = parseInt(dataset.idx);
      if (config.timeslots[idx]) config.timeslots[idx].label = val;
    } else if (type === 'terms-title') {
      const idx = parseInt(dataset.idx);
      if (config.terms_articles && config.terms_articles[idx]) config.terms_articles[idx].title = val;
    } else if (type === 'terms-content') {
      const idx = parseInt(dataset.idx);
      if (config.terms_articles && config.terms_articles[idx]) config.terms_articles[idx].content = val;
    }
  }

  function addTimeslot() {
    config.timeslots.push({ value: '', label: '새 시간대' });
    const container = document.getElementById('wysiwygTimeslots');
    if (container) {
      container.innerHTML = renderTimeslotItems();
      bindWysiwygEdit();
      // 새로 추가된 항목 바로 편집
      const rows = container.querySelectorAll('.wysiwyg-timeslot-row');
      const lastLabel = rows[rows.length - 1].querySelector('.wysiwyg-editable');
      if (lastLabel) openInlineEdit(lastLabel);
    }
  }

  function removeTimeslot(index) {
    if (config.timeslots.length <= 1) {
      showToast('⚠️ 최소 1개의 시간대 항목이 필요합니다.');
      return;
    }
    config.timeslots.splice(index, 1);
    const container = document.getElementById('wysiwygTimeslots');
    if (container) {
      container.innerHTML = renderTimeslotItems();
      bindWysiwygEdit();
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // 배경 설정
  // ══════════════════════════════════════════════════════════════════

  function switchBgTab(type, btn) {
    config.bg.type = type;
    document.querySelectorAll('.bg-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('bgColorOption').classList.toggle('active', type === 'color');
    document.getElementById('bgImageOption').classList.toggle('active', type === 'image');
  }

  function updateBgPreview() {
    const c1 = document.getElementById('bgColor1').value;
    const c2 = document.getElementById('bgColor2').value;
    config.bg.color1 = c1;
    config.bg.color2 = c2;
    const gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    document.getElementById('bgPreviewColor').style.background = gradient;
    document.getElementById('bgPreviewBox').style.background   = gradient;
    document.getElementById('bgPreviewBox').style.backgroundImage = '';
  }

  function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('uploadFilename').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
      config.bg.image = e.target.result;
      document.getElementById('bgPreviewBox').style.backgroundImage = `url(${config.bg.image})`;
      document.getElementById('bgPreviewBox').style.backgroundSize  = 'cover';
      document.getElementById('bgPreviewBox').textContent = '';
    };
    reader.readAsDataURL(file);
  }

  // ══════════════════════════════════════════════════════════════════
  // Fix 3b: 인라인 미리보기 모달
  // ══════════════════════════════════════════════════════════════════

  function openPreview() {
    localStorage.setItem('preview_config', JSON.stringify(config));
    const modal  = document.getElementById('previewModal');
    const iframe = document.getElementById('previewIframe');
    iframe.src = `index.html?preview=true&t=${Date.now()}`;
    modal.classList.add('open');
  }

  function closePreview(e) {
    if (e && e.target !== document.getElementById('previewModal')) return;
    document.getElementById('previewModal').classList.remove('open');
  }

  // ══════════════════════════════════════════════════════════════════
  // 저장
  // ══════════════════════════════════════════════════════════════════

  async function save() {
    const btn = document.getElementById('saveBtn');
    btn.disabled    = true;
    btn.textContent = '저장 중...';

    try {
      await API.updateConfig('form_config', JSON.stringify(config));
      localStorage.setItem('preview_config', JSON.stringify(config));
      showToast('✅ 저장 완료! 신청 페이지에 즉시 반영됩니다.');
    } catch (err) {
      showToast('❌ 저장 실패: ' + err.message);
    } finally {
      btn.disabled    = false;
      btn.textContent = '💾 저장';
    }
  }

  // ── 유틸 ───────────────────────────────────────────────────────────

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function esc(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function deepMerge(target, source) {
    const result = deepClone(target);
    for (const key of Object.keys(source)) {
      if (Array.isArray(source[key])) {
        result[key] = source[key];
      } else if (source[key] && typeof source[key] === 'object') {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  return {
    init,
    addTimeslot,
    removeTimeslot,
    switchBgTab,
    updateBgPreview,
    handleImageUpload,
    openPreview,
    closePreview,
    save,
  };
})();

document.addEventListener('DOMContentLoaded', Modify.init);

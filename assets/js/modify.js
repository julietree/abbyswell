/**
 * modify.js — 신청서 수정 에디터
 *
 * 저장 방식: API.updateConfig('form_config', JSON.stringify(config))
 *   → GAS config 시트에 저장 → index.html(survey.js)이 로드 시 읽어서 DOM에 적용
 *
 * 편집 가능 항목:
 *   - 문항 라벨: 이름/이메일/연락처/세션횟수/시간대/동의 체크박스 텍스트 + Bold/Italic
 *   - 섹션 텍스트: 3개 섹션 각각의 제목과 설명 문구
 *   - 시간대 옵션: 선호 시간대 체크박스 항목 추가·수정·삭제
 *   - 배경: 그라디언트 색상 또는 이미지
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
      agree_all:       { label: '위 내용을 읽고 동의합니다.', bold: false, italic: false },
    },
    sections: {
      '1': { title: '기본 정보',            desc: '코칭 계약의 기본 사항과 연락처를 입력해 주세요.' },
      '2': { title: '세션 구성 & 비용 안내', desc: '한 세션당 시간은 약 50~60분 소요됩니다. 희망하시는 세션 횟수를 입력하고 비용 안내를 확인해주세요.' },
      '3': { title: '약관 동의',            desc: '아래 내용을 읽고 하단에서 동의해 주세요.' },
    },
    timeslots: [
      { value: '월~금: 오전 7~9시',  label: '월~금 · 오전 7~9시' },
      { value: '토~일: 오전 8~10시', label: '토~일 · 오전 8~10시' },
      { value: '토~일: 저녁 7~10시', label: '토~일 · 저녁 7~10시' },
    ],
    bg: { type: 'color', color1: '#e8f0e9', color2: '#f5efe6', image: null },
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

    // 모든 탭 렌더
    renderFieldsTab();
    renderSectionsTab();
    renderTimeslotsTab();
  }

  // ── 탭 전환 ────────────────────────────────────────────────────────
  function switchTab(tab, btn) {
    document.querySelectorAll('.editor-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
  }

  // ══════════════════════════════════════════════════════════════════
  // 탭 1: 문항 라벨 편집
  // ══════════════════════════════════════════════════════════════════

  const FIELD_DEFS = [
    { id: 'name',            hint: '고객 이름 입력칸 (섹션 1)',              type: 'text'     },
    { id: 'email',           hint: '이메일 주소 입력칸 (섹션 1)',             type: 'email'    },
    { id: 'contact',         hint: '연락처 입력칸 (섹션 1)',                 type: 'text'     },
    { id: 'session_count',   hint: '세션 횟수 입력칸 라벨 (섹션 2)',         type: 'number'   },
    { id: 'preferred_times', hint: '선호 시간대 체크박스 그룹 라벨 (섹션 2)', type: 'checkbox' },
    { id: 'agree_all',       hint: '동의 체크박스 텍스트 (섹션 3)',           type: 'checkbox' },
  ];

  function renderFieldsTab() {
    const container = document.getElementById('fieldEditorList');
    container.innerHTML = FIELD_DEFS.map(f => {
      const state = config.fields[f.id] || { label: '', bold: false, italic: false };
      return `
        <div class="field-editor-row">
          <div class="field-row-info">
            <span class="field-id-badge">${esc(f.type)}</span>
            <span class="field-name-hint">${esc(f.hint)}</span>
          </div>
          <div class="field-row-controls">
            <input
              class="field-label-input"
              type="text"
              value="${esc(state.label)}"
              placeholder="라벨 텍스트 입력"
              oninput="Modify.onFieldChange('${f.id}', 'label', this.value)"
            >
            <div class="style-btns">
              <button class="style-btn ${state.bold   ? 'active' : ''}" title="굵게"   onclick="Modify.toggleFieldStyle('${f.id}', 'bold',   this)"><strong>B</strong></button>
              <button class="style-btn ${state.italic ? 'active' : ''}" title="기울임" onclick="Modify.toggleFieldStyle('${f.id}', 'italic', this)"><em>I</em></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function onFieldChange(id, prop, value) {
    if (!config.fields[id]) config.fields[id] = {};
    config.fields[id][prop] = value;
  }

  function toggleFieldStyle(id, prop, btn) {
    if (!config.fields[id]) config.fields[id] = {};
    config.fields[id][prop] = !config.fields[id][prop];
    btn.classList.toggle('active', config.fields[id][prop]);
  }

  // ══════════════════════════════════════════════════════════════════
  // 탭 2: 섹션 제목/설명 편집
  // ══════════════════════════════════════════════════════════════════

  const SECTION_DEFS = [
    { num: '1', label: '섹션 1 — 기본 정보' },
    { num: '2', label: '섹션 2 — 세션 구성 & 비용' },
    { num: '3', label: '섹션 3 — 약관 동의' },
  ];

  function renderSectionsTab() {
    const container = document.getElementById('sectionEditorList');
    container.innerHTML = SECTION_DEFS.map(s => {
      const section = config.sections[s.num] || { title: '', desc: '' };
      return `
        <div class="section-editor-block">
          <div class="section-editor-label">${esc(s.label)}</div>
          <div class="section-field-row">
            <label class="section-field-caption">제목</label>
            <input
              class="field-label-input"
              type="text"
              value="${esc(section.title)}"
              placeholder="섹션 제목"
              oninput="Modify.onSectionChange('${s.num}', 'title', this.value)"
            >
          </div>
          <div class="section-field-row">
            <label class="section-field-caption">설명</label>
            <textarea
              class="field-label-input section-desc-textarea"
              placeholder="섹션 설명 문구"
              oninput="Modify.onSectionChange('${s.num}', 'desc', this.value)"
            >${esc(section.desc)}</textarea>
          </div>
        </div>
      `;
    }).join('');
  }

  function onSectionChange(num, prop, value) {
    if (!config.sections[num]) config.sections[num] = {};
    config.sections[num][prop] = value;
  }

  // ══════════════════════════════════════════════════════════════════
  // 탭 3: 시간대 옵션 편집
  // ══════════════════════════════════════════════════════════════════

  function renderTimeslotsTab() {
    const container = document.getElementById('timeslotEditorList');
    if (config.timeslots.length === 0) {
      container.innerHTML = `<p class="empty-timeslots-msg">시간대 항목이 없습니다. 아래 버튼으로 추가하세요.</p>`;
      return;
    }
    container.innerHTML = config.timeslots.map((slot, i) => `
      <div class="timeslot-editor-row">
        <div class="timeslot-row-num">${i + 1}</div>
        <div class="timeslot-fields">
          <input
            class="field-label-input"
            type="text"
            value="${esc(slot.label)}"
            placeholder="표시 라벨 (예: 월~금 · 오전 7~9시)"
            oninput="Modify.onTimeslotChange(${i}, 'label', this.value)"
          >
          <input
            class="field-label-input timeslot-value-input"
            type="text"
            value="${esc(slot.value)}"
            placeholder="저장값 (예: 월~금: 오전 7~9시)"
            oninput="Modify.onTimeslotChange(${i}, 'value', this.value)"
          >
        </div>
        <button class="timeslot-delete-btn" onclick="Modify.removeTimeslot(${i})" title="삭제">✕</button>
      </div>
    `).join('');
  }

  function onTimeslotChange(index, prop, value) {
    if (config.timeslots[index]) {
      config.timeslots[index][prop] = value;
    }
  }

  function addTimeslot() {
    config.timeslots.push({ value: '', label: '' });
    renderTimeslotsTab();
    // 새로 추가된 항목의 첫 입력칸에 포커스
    const rows = document.querySelectorAll('.timeslot-editor-row');
    const lastRow = rows[rows.length - 1];
    if (lastRow) lastRow.querySelector('input')?.focus();
  }

  function removeTimeslot(index) {
    if (config.timeslots.length <= 1) {
      showToast('⚠️ 최소 1개의 시간대 항목이 필요합니다.');
      return;
    }
    config.timeslots.splice(index, 1);
    renderTimeslotsTab();
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
  // 미리보기 & 저장
  // ══════════════════════════════════════════════════════════════════

  function openPreview() {
    localStorage.setItem('preview_config', JSON.stringify(config));
    window.open('index.html?preview=true', '_blank');
  }

  async function save() {
    const btn = document.getElementById('saveBtn');
    btn.disabled  = true;
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

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** 두 객체를 재귀적으로 병합 (배열은 source로 완전 교체) */
  function deepMerge(target, source) {
    const result = deepClone(target);
    for (const key of Object.keys(source)) {
      if (Array.isArray(source[key])) {
        result[key] = source[key]; // 배열은 source 값으로 교체
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
    switchTab,
    onFieldChange,
    toggleFieldStyle,
    onSectionChange,
    onTimeslotChange,
    addTimeslot,
    removeTimeslot,
    switchBgTab,
    updateBgPreview,
    handleImageUpload,
    openPreview,
    save,
  };
})();

document.addEventListener('DOMContentLoaded', Modify.init);

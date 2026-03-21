/**
 * modify.js — 신청서 수정 에디터
 *
 * 담당:
 * - form_config 시트에서 수정 가능한 문항 목록 로드 & 렌더
 * - 텍스트 스타일 (Bold / Italic / 컬러) 편집
 * - 배경 색상 / 이미지 설정
 * - localStorage에 preview_config 저장 → 미리보기 iframe 열기
 * - 저장 → api.updateFormConfig() 호출
 */

const Modify = (() => {
  // 수정 가능한 문항 (읽기 전용 고정값 제외)
  const EDITABLE_FIELDS = [
    { id: 'name',                 label: '고객 이름',       type: 'text' },
    { id: 'start_date',           label: '계약 시작일',     type: 'date' },
    { id: 'end_date',             label: '계약 종료일',     type: 'date' },
    { id: 'session_type',         label: '진행 방식',       type: 'select' },
    { id: 'session_count',        label: '세션 횟수',       type: 'number' },
    { id: 'topic',                label: '코칭 주제',       type: 'text' },
    { id: 'email',                label: '이메일 주소',     type: 'email' },
    { id: 'contact',              label: '연락처',          type: 'text' },
    { id: 'online_link',          label: '온라인 링크',     type: 'url' },
    { id: 'signature',            label: '서명',            type: 'canvas' },
    { id: 'agree_cancellation',   label: '취소 정책 동의',  type: 'checkbox' },
    { id: 'agree_confidentiality','label': '비밀 유지 동의', type: 'checkbox' },
    { id: 'agree_roles',          label: '역할 확인',       type: 'checkbox' },
    { id: 'agree_termination',    label: '계약 종료 동의',  type: 'checkbox' },
  ];

  // 로컬 편집 상태
  let editorState = {};   // { field_id: { label, bold, italic } }
  let bgState = {
    type:   'color',       // 'color' | 'image'
    color1: '#e8f0e9',
    color2: '#f5efe6',
    image:  null,          // base64 string
  };
  let activeBgTab = 'color';

  // ── 초기화 ──────────────────────────────────────────
  async function init() {
    // form_config에서 현재 라벨 로드
    let serverConfig = {};
    try {
      const configs = await API.getFormConfig();
      configs.forEach(c => {
        serverConfig[c.field_id] = c;
      });
    } catch (err) {
      console.warn('form_config 로드 실패 (기본값 사용):', err.message);
    }

    // 에디터 상태 초기화
    EDITABLE_FIELDS.forEach(f => {
      const server = serverConfig[f.id] || {};
      let style = {};
      try { style = JSON.parse(server.style || '{}'); } catch {}

      editorState[f.id] = {
        label:  server.label || f.label,
        bold:   style.bold   || false,
        italic: style.italic || false,
      };
    });

    renderEditor();
  }

  // ── 편집기 렌더 ─────────────────────────────────────
  function renderEditor() {
    const container = document.getElementById('fieldEditorList');

    container.innerHTML = EDITABLE_FIELDS.map(f => {
      const state  = editorState[f.id];
      const boldCls   = state.bold   ? 'active' : '';
      const italicCls = state.italic ? 'active' : '';

      return `
        <div class="field-editor-row">
          <span class="field-id-badge">${esc(f.type)}</span>
          <input
            class="field-label-input"
            type="text"
            value="${esc(state.label)}"
            data-field="${f.id}"
            oninput="Modify.onLabelChange('${f.id}', this.value)"
            placeholder="${esc(f.label)}"
          >
          <div class="style-btns">
            <button class="style-btn ${boldCls}"
                    title="굵게"
                    onclick="Modify.toggleStyle('${f.id}', 'bold', this)">
              <strong>B</strong>
            </button>
            <button class="style-btn ${italicCls}"
                    title="기울임"
                    onclick="Modify.toggleStyle('${f.id}', 'italic', this)">
              <em>I</em>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── 이벤트 핸들러 ────────────────────────────────────
  function onLabelChange(fieldId, value) {
    if (editorState[fieldId]) {
      editorState[fieldId].label = value;
    }
  }

  function toggleStyle(fieldId, prop, btn) {
    if (!editorState[fieldId]) return;
    editorState[fieldId][prop] = !editorState[fieldId][prop];
    btn.classList.toggle('active', editorState[fieldId][prop]);
  }

  // 배경 탭 전환
  function switchBgTab(type, btn) {
    activeBgTab = type;
    document.querySelectorAll('.bg-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('bgColorOption').classList.toggle('active', type === 'color');
    document.getElementById('bgImageOption').classList.toggle('active', type === 'image');
    bgState.type = type;
  }

  // 배경 색상 미리보기 업데이트
  function updateBgPreview() {
    const c1 = document.getElementById('bgColor1').value;
    const c2 = document.getElementById('bgColor2').value;
    bgState.color1 = c1;
    bgState.color2 = c2;
    const gradient = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
    document.getElementById('bgPreviewColor').style.background = gradient;
    document.getElementById('bgPreviewBox').style.background   = gradient;
  }

  // 이미지 업로드
  function handleImageUpload(input) {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('uploadFilename').textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
      bgState.image = e.target.result; // base64
      document.getElementById('bgPreviewBox').style.backgroundImage = `url(${bgState.image})`;
      document.getElementById('bgPreviewBox').style.backgroundSize  = 'cover';
      document.getElementById('bgPreviewBox').textContent = '';
    };
    reader.readAsDataURL(file);
  }

  // ── 미리보기 ────────────────────────────────────────
  function openPreview() {
    // 현재 편집 상태를 localStorage에 저장
    const previewConfig = buildPreviewConfig();
    localStorage.setItem('preview_config', JSON.stringify(previewConfig));

    // 신청 페이지를 preview 모드로 새 탭에서 열기
    window.open('index.html?preview=true', '_blank');
  }

  function buildPreviewConfig() {
    const config = { fields: {}, bg_type: bgState.type };

    EDITABLE_FIELDS.forEach(f => {
      const state = editorState[f.id];
      config.fields[f.id] = {
        label:  state.label,
        bold:   state.bold,
        italic: state.italic,
      };
    });

    if (bgState.type === 'color') {
      config.bg_color = `linear-gradient(135deg, ${bgState.color1} 0%, ${bgState.color2} 100%)`;
    } else if (bgState.image) {
      config.bg_image = bgState.image;
    }

    return config;
  }

  // ── 저장 ────────────────────────────────────────────
  async function save() {
    const btn = document.getElementById('saveBtn');
    btn.disabled = true;
    btn.textContent = '저장 중...';

    // form_config 배열 구성
    const configs = EDITABLE_FIELDS.map(f => {
      const state = editorState[f.id];
      return {
        field_id:  f.id,
        label:     state.label,
        type:      f.type,
        style:     { bold: state.bold, italic: state.italic },
        bg_config: bgState,
      };
    });

    try {
      await API.updateFormConfig(configs);

      // preview_config도 최신화
      localStorage.setItem('preview_config', JSON.stringify(buildPreviewConfig()));

      showToast('✅ 저장되었습니다.');
    } catch (err) {
      showToast('❌ 저장 실패: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 저장';
    }
  }

  // ── 토스트 ──────────────────────────────────────────
  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ── 유틸 ────────────────────────────────────────────
  function esc(str) {
    return (str || '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { init, onLabelChange, toggleStyle, switchBgTab, updateBgPreview, handleImageUpload, openPreview, save };
})();

document.addEventListener('DOMContentLoaded', Modify.init);

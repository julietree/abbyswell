/**
 * survey.js — 3단계 설문 렌더링 & 제출
 *
 * 섹션 구성:
 *   1. 기본 정보 (이름 / 이메일 / 연락처)
 *   2. 세션 구성 & 비용 안내 (세션횟수 / 선호시간대 / 비용안내)
 *   3. 약관 동의 (전체 약관 + 단일 체크박스 + 제출)
 *
 * 동적 설정:
 *   - admin의 modify.html에서 저장한 form_config를 GAS config 시트에서 불러와
 *     라벨 텍스트, 섹션 제목/설명, 시간대 옵션, 배경색 등을 실시간 반영
 */

/** UUID 생성 (crypto.randomUUID 미지원 구형 WebView 대응) */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const Survey = (() => {
  // ── 상태 ────────────────────────────────────────────
  let currentSection   = 1;
  const TOTAL_SECTIONS = 3;

  // ── 초기화 ──────────────────────────────────────────
  async function init() {
    if (typeof emailjs !== 'undefined') {
      emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
    }
    bindEvents();

    // preview 모드: localStorage / 일반 모드: GAS에서 설정 로드
    if (new URLSearchParams(window.location.search).get('preview') === 'true') {
      try {
        const cfg = JSON.parse(localStorage.getItem('preview_config') || '{}');
        applyFormConfig(cfg);
      } catch (err) {
        console.warn('미리보기 설정 로드 실패:', err);
      }
      // Fix 3b: 미리보기 모드에서 모든 섹션을 한 번에 스크롤로 보여줌
      showAllSectionsForPreview();
    } else {
      await loadFormConfig();
    }
  }

  // ── 폼 설정 로드 (GAS config 시트) ──────────────────
  async function loadFormConfig() {
    try {
      const cfg = await API.getConfig();
      if (cfg && cfg.form_config) {
        applyFormConfig(JSON.parse(cfg.form_config));
      }
    } catch (err) {
      console.warn('폼 설정 로드 실패 (기본값 사용):', err.message);
    }
  }

  // ── 폼 설정 DOM 적용 ─────────────────────────────────
  function applyFormConfig(config) {
    if (!config || typeof config !== 'object') return;

    // 1. 필드 라벨 (data-field 속성으로 타겟팅)
    if (config.fields) {
      ['name', 'email', 'contact', 'session_count', 'preferred_times'].forEach(id => {
        const label = document.querySelector(`label[data-field="${id}"]`);
        if (label && config.fields[id]) {
          applyLabelNode(label, config.fields[id]);
        }
      });
      // 동의 체크박스 라벨 (for="agree_all")
      if (config.fields.agree_all && config.fields.agree_all.label) {
        const el = document.querySelector('label[for="agree_all"]');
        if (el) {
          el.textContent = config.fields.agree_all.label;
          if (config.fields.agree_all.bold)   el.style.fontWeight = '700';
          if (config.fields.agree_all.italic) el.style.fontStyle  = 'italic';
        }
      }
    }

    // 2. 섹션 제목 & 설명
    if (config.sections) {
      [1, 2, 3].forEach(num => {
        const s = config.sections[num] || config.sections[String(num)];
        if (!s) return;
        const sec = document.getElementById(`section-${num}`);
        if (!sec) return;

        if (s.title) {
          const titleEl = sec.querySelector('.section-title');
          if (titleEl) {
            const badge = titleEl.querySelector('.section-num');
            titleEl.textContent = '';
            if (badge) titleEl.appendChild(badge);
            titleEl.appendChild(document.createTextNode(' ' + s.title));
          }
        }
        if (s.desc) {
          const descEl = sec.querySelector('.section-desc');
          if (descEl) descEl.textContent = s.desc;
        }
      });
    }

    // 3. 시간대 옵션 (추가/삭제/수정 반영)
    if (config.timeslots && config.timeslots.length > 0) {
      const container = document.querySelector('.timeslot-options');
      if (container) {
        container.innerHTML = config.timeslots.map(slot => `
          <label class="timeslot-option">
            <input type="checkbox" name="preferred_times" value="${escHtml(slot.value)}">
            <span class="timeslot-label">${escHtml(slot.label)}</span>
          </label>
        `).join('');
      }
    }

    // 4. 약관 본문 (terms_articles)
    if (config.terms_articles && config.terms_articles.length > 0) {
      config.terms_articles.forEach((art, i) => {
        const el = document.querySelector(`.terms-article[data-terms-idx="${i}"]`);
        if (!el) return;
        if (art.title) {
          const h4 = el.querySelector('.terms-article-title');
          if (h4) h4.textContent = art.title;
        }
        if (art.content) {
          const p = el.querySelector('p:not(.terms-note)');
          if (p) p.textContent = art.content;
        }
      });
    }

    // 5. 배경 색상 / 이미지
    if (config.bg) {
      if (config.bg.type === 'color' && config.bg.color1) {
        document.body.style.background =
          `linear-gradient(135deg, ${config.bg.color1} 0%, ${config.bg.color2} 100%)`;
      } else if (config.bg.type === 'image' && config.bg.image) {
        document.body.style.backgroundImage    = `url(${config.bg.image})`;
        document.body.style.backgroundSize     = 'cover';
        document.body.style.backgroundAttachment = 'fixed';
      }
    }
  }

  /** label 요소의 첫 텍스트 노드만 교체 (required/optional 스팬 보존) */
  function applyLabelNode(label, fieldConfig) {
    if (!fieldConfig) return;
    if (fieldConfig.label) {
      for (const node of label.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent = fieldConfig.label + ' ';
          break;
        }
      }
    }
    label.style.fontWeight = fieldConfig.bold   ? '700' : '';
    label.style.fontStyle  = fieldConfig.italic ? 'italic' : '';
  }

  // ── Fix 3b: 미리보기 모드 — 전체 섹션 펼치기 ─────────
  function showAllSectionsForPreview() {
    document.querySelectorAll('.section-card').forEach(card => {
      card.style.display = 'block';
    });
    document.querySelectorAll('.nav-buttons').forEach(el => {
      el.style.display = 'none';
    });
    const progress = document.querySelector('.progress-wrapper');
    if (progress) progress.style.display = 'none';
  }

  // ── 이벤트 바인딩 ────────────────────────────────────
  function bindEvents() {
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
      const nameVal = getVal('name').trim();
      if (!nameVal) { showError('name'); valid = false; }
      else if (/[^가-힣a-zA-Z\s]/.test(nameVal)) {
        showError('name');
        document.getElementById('error-name').textContent = '이름은 한글/영문만 입력 가능합니다.';
        valid = false;
      }
      const email = getVal('email').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('email'); valid = false;
      }
      if (!getVal('contact').trim()) { showError('contact'); valid = false; }
    }

    if (section === 2) {
      const total = parseInt(document.getElementById('session_count_total').value);
      if (!total || total < 3 || total > 10) { showError('session_count'); valid = false; }
      const times = document.querySelectorAll('input[name="preferred_times"]:checked');
      if (times.length === 0) { showError('preferred_times'); valid = false; }
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

  /** 전화번호를 010-XXXX-XXXX 형식으로 정제 */
  function normalizeContact(raw) {
    const trimmed = (raw || '').trim();
    // 전화번호 부분 추출 (숫자·하이픈으로 이루어진 연속 문자열)
    const phoneMatch = trimmed.match(/\d[\d\-]{8,12}/);
    if (!phoneMatch) return trimmed;

    let digits = phoneMatch[0].replace(/\D/g, '');
    // 국가번호 82 제거
    if (digits.startsWith('82') && digits.length >= 11) digits = '0' + digits.substring(2);
    // 앞의 0 복원 (구글 시트 자동 제거 방어)
    if (digits.length === 10 && digits.startsWith('10')) digits = '0' + digits;

    let phone = digits;
    if (digits.length === 11) phone = `${digits.substring(0,3)}-${digits.substring(3,7)}-${digits.substring(7)}`;
    else if (digits.length === 10) phone = `${digits.substring(0,3)}-${digits.substring(3,6)}-${digits.substring(6)}`;

    // 카카오 아이디가 있으면 뒤에 붙임
    const kakao = trimmed.replace(phoneMatch[0], '').replace(/^[\s,\/\|\(\)]+|[\s,\/\|\(\)]+$/g, '').trim();
    return kakao ? `${phone} (카카오: ${kakao})` : phone;
  }

  function collectFormData() {
    const today = new Date();
    const preferredTimes = Array.from(
      document.querySelectorAll('input[name="preferred_times"]:checked')
    ).map(cb => cb.value).join(', ');

    return {
      id:                 generateUUID(),
      name:               getVal('name').trim(),
      email:              getVal('email').trim(),
      contact:            normalizeContact(getVal('contact')),
      start_date:         formatDateISO(today),
      end_date:           '',
      session_type:       '',
      session_count:      getVal('session_count_total'),
      monthly_count:      '',
      topic:              preferredTimes,
      online_link:        '',
      submitted_at:       today.toISOString(),
      submitted_date_str: formatKoreanDate(today),
      preferred_times:    preferredTimes,
    };
  }

  // ── 계좌번호 복사 ────────────────────────────────────
  function copyAccount() {
    const accountText = '375302-04-074200';

    if (navigator.clipboard) {
      navigator.clipboard.writeText(accountText);
    } else {
      const el = document.createElement('textarea');
      el.value = accountText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
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

  function escHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 공개 API ────────────────────────────────────────
  return { init, nextSection, prevSection, copyAccount };
})();

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', Survey.init);

/**
 * api.js — 외부 API 단일 게이트웨이
 *
 * 모든 외부 호출(Google Sheets 읽기, GAS 쓰기, EmailJS)은
 * 이 파일의 함수를 통해서만 이루어집니다.
 */

const API = (() => {
  // ── 내부 유틸 ────────────────────────────────────────────────

  /**
   * Google Apps Script GET (읽기)
   * Google Cloud API 키 불필요 — GAS Web App이 읽기도 담당
   */
  async function gasGet(params) {
    const qs  = new URLSearchParams(params).toString();
    const url = `${CONFIG.GAS_ENDPOINT}?${qs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GAS GET 실패: ${res.status}`);
    const data = await res.json();
    // 두 가지 응답 형식 처리: {status,result} 또는 {success,data}
    if (data.status === 'error' || data.success === false) {
      throw new Error('GAS 오류: ' + (data.message || data.error || '알 수 없는 오류'));
    }
    return data;
  }

  /**
   * Google Apps Script Web App POST (쓰기 프록시)
   * 실패 시 1회 자동 재시도
   */
  async function gasPost(payload, retryCount = 0) {
    try {
      const res = await fetch(CONFIG.GAS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`GAS POST 실패: ${res.status}`);
      const data = await res.json();
      // 두 가지 응답 형식 처리: {status,result} 또는 {success,data}
      if (data.status === 'error' || data.success === false) {
        throw new Error('GAS 오류: ' + (data.message || data.error || '알 수 없는 오류'));
      }
      return data;
    } catch (err) {
      if (retryCount < 1) {
        console.warn('GAS POST 재시도 중...', err.message);
        return gasPost(payload, retryCount + 1);
      }
      throw err;
    }
  }

  // ── 시트 데이터 파서 ─────────────────────────────────────────

  /** 2D 배열(행×열)을 헤더 기반 객체 배열로 변환 */
  function parseSheetRows(values) {
    if (!values || values.length < 2) return [];
    const [headers, ...rows] = values;
    return rows.map(row =>
      headers.reduce((obj, header, i) => {
        obj[header] = row[i] ?? '';
        return obj;
      }, {})
    );
  }

  // ── 공개 API ─────────────────────────────────────────────────

  /**
   * registrations 시트 전체 조회
   * @returns {Promise<Array>} 등록 목록
   */
  async function getRegistrations() {
    const data = await gasGet({ action: 'getRegistrations' });
    return data.result || data.data || [];
  }

  async function getFormConfig() {
    const data = await gasGet({ action: 'getFormConfig' });
    return data.result || data.data || [];
  }

  async function getConfig() {
    const data = await gasGet({ action: 'getConfig' });
    return data.result || data.data || {};
  }

  /**
   * 신규 등록 저장
   * @param {Object} formData - 설문 제출 데이터
   * @returns {Promise<Object>} GAS 응답
   */
  async function writeRegistration(formData) {
    return gasPost({ action: 'writeRegistration', data: formData });
  }

  /**
   * 계약서 PDF를 Google Drive에 업로드
   * @param {string} base64PDF - base64 인코딩된 PDF
   * @param {string} filename  - 저장할 파일명
   * @returns {Promise<{url: string}>} Drive 공유 URL
   */
  async function uploadContract(base64PDF, filename) {
    return gasPost({ action: 'uploadContract', base64PDF, filename });
  }

  /**
   * 계약서 상태 업데이트
   * @param {string} registrationId - 등록 ID
   * @param {string} status         - '발송완료' | '대기중'
   * @param {string} contractUrl    - Drive URL
   */
  async function updateContractStatus(registrationId, status, contractUrl) {
    return gasPost({ action: 'updateContractStatus', registrationId, status, contractUrl });
  }

  /**
   * config 시트 값 업데이트
   * @param {string} key
   * @param {string} value
   */
  async function updateConfig(key, value) {
    return gasPost({ action: 'updateConfig', key, value });
  }

  /**
   * form_config 시트 업데이트
   * @param {Array} configs - [{field_id, label, style, bg_config}, ...]
   */
  async function updateFormConfig(configs) {
    return gasPost({ action: 'updateFormConfig', configs });
  }

  /**
   * Secretary Mode 즉시 실행 (GAS 트리거 수동 호출)
   */
  async function runSecretaryNow() {
    return gasPost({ action: 'runSecretaryNow' });
  }

  /**
   * EmailJS로 이메일 발송
   * @param {string} templateId - EmailJS 템플릿 ID
   * @param {Object} params     - 템플릿 변수
   */
  async function sendEmail(templateId, params) {
    if (typeof emailjs === 'undefined') {
      throw new Error('EmailJS 라이브러리가 로드되지 않았습니다.');
    }
    return emailjs.send(CONFIG.EMAILJS_SERVICE_ID, templateId, params);
  }

  return {
    getRegistrations,
    getFormConfig,
    getConfig,
    writeRegistration,
    uploadContract,
    updateContractStatus,
    updateConfig,
    updateFormConfig,
    runSecretaryNow,
    sendEmail,
  };
})();

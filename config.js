/**
 * config.js — 코칭 시스템 전역 설정
 *
 * ⚠️  이 파일에는 공개 키(Public Key)만 포함합니다.
 *     Claude API Key, Drive 서비스 계정 키 등 비밀 키는
 *     Google Apps Script > Script Properties에만 저장하세요.
 */

const CONFIG = {
  // ── Google Sheets ──────────────────────────────────────────
  // ✅ Google Cloud API 키 불필요! GAS Web App이 읽기/쓰기 모두 처리.
  SHEET_ID: 'YOUR_SHEET_ID',  // (참고용 - 실제 사용은 GAS 내부에서)

  // 시트 이름
  SHEETS: {
    REGISTRATIONS: 'registrations',
    FORM_CONFIG:   'form_config',
    CONFIG:        'config',
    SECRETARY_LOG: 'secretary_log',
  },

  // ── Google Apps Script Web App ─────────────────────────────
  // Apps Script 배포 > 웹 앱 > URL 복사 (실행: 나, 액세스: 모든 사용자)
  GAS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbyXbpDFaxiUfrpjeuFDm15GcAznWVFgh6aXgr21650De8wkbJgFh9X76IsJi3n6KHHxOQ/exec',

  // ── EmailJS ────────────────────────────────────────────────
  // EmailJS > Account > Public Key
  EMAILJS_PUBLIC_KEY:  'Puh_HS3TbB6MR1holA_Wu',
  // EmailJS > Email Services > Service ID
  EMAILJS_SERVICE_ID:  'service_l4ex2nl',
  // EmailJS > Email Templates > Template IDs
  EMAILJS_TEMPLATES: {
    CONTRACT_DELIVERY:  'template_9yis1wl',   // 계약서 발송 (고객용)
    ADMIN_NOTIFICATION: 'template_b3lbn99',   // 신규 등록 알림 (코치용)
  },

  // ── 코치 정보 ──────────────────────────────────────────────
  COACH_NAME:  '이 연 임',
  COACH_EMAIL: 'julie@realwork.group',  // 관리자 알림 수신 이메일

  // ── 시스템 설정 ────────────────────────────────────────────
  LOCALE: 'ko-KR',
};

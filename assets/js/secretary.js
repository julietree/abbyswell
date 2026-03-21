/**
 * secretary.js — Secretary Mode UI
 *
 * Admin 대시보드의 비서 모드 토글 관리.
 * 실제 이메일 발송은 Google Apps Script(gas/secretary_scheduler.gs)가 담당.
 */

const Secretary = (() => {

  async function init() {
    const toggle = document.getElementById('secretaryToggle');
    if (!toggle) return;

    // 현재 상태 로드
    try {
      const config = await API.getConfig();
      const enabled = config.secretary_mode_enabled === 'true';
      toggle.checked = enabled;
      updateLabel(enabled);
    } catch (err) {
      console.warn('Secretary Mode 상태 로드 실패:', err.message);
    }

    // 토글 변경 이벤트
    toggle.addEventListener('change', handleToggle);
  }

  async function handleToggle(e) {
    const enabled = e.target.checked;

    if (enabled) {
      const confirmed = confirm(
        '비서 모드를 활성화하면 매주 일요일 오전 9시에\n자동으로 코칭 일정 이메일이 발송됩니다.\n\n계속하시겠습니까?'
      );
      if (!confirmed) {
        e.target.checked = false;
        return;
      }
    }

    try {
      await API.updateConfig('secretary_mode_enabled', String(enabled));
      updateLabel(enabled);
    } catch (err) {
      alert('설정 저장에 실패했습니다: ' + err.message);
      e.target.checked = !enabled; // 롤백
    }
  }

  function updateLabel(enabled) {
    const label = document.getElementById('secretaryLabel');
    if (!label) return;
    label.textContent = enabled ? '비서 모드 ON' : '비서 모드';
    label.className   = `secretary-label ${enabled ? 'on' : 'off'}`;
  }

  /**
   * "지금 실행" 버튼 (admin.html에서 직접 호출 가능)
   */
  async function runNow() {
    if (!confirm('지금 즉시 주간 일정 이메일을 발송합니다.\n계속하시겠습니까?')) return;

    try {
      const result = await API.runSecretaryNow();
      alert(`발송 완료!\n시작 클라이언트: ${result.starters || 0}명\n종료 클라이언트: ${result.enders || 0}명`);
    } catch (err) {
      alert('실행 실패: ' + err.message);
    }
  }

  return { init, runNow };
})();

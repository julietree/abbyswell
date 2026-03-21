/**
 * contract_template.js — HTML 기반 계약서 생성기
 * 디자인: 흑백 미니멀, A4 1장 최적화, 정식 계약서 스타일
 */
function generateContractHTML(data) {
  const safeVal = v => (v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', sans-serif;
    font-size: 9pt;
    line-height: 1.55;
    color: #111;
    background: #fff;
    width: 794px;
    padding: 170px 200px;
  }

  /* 제목 */
  .c-title { font-size: 17pt; font-weight: 700; text-align: center; letter-spacing: 0.05em; margin-bottom: 3px; }
  .c-title-en { font-size: 10pt; text-align: center; color: #555; font-style: italic; margin-bottom: 5px; }
  .c-desc { font-size: 8.5pt; text-align: center; color: #777; margin-bottom: 10px; }
  .c-divider { border: none; border-top: 2px solid #111; margin: 10px 0; }
  .c-divider-thin { border: none; border-top: 0.5px solid #bbb; margin: 8px 0; }

  /* 섹션 */
  .sec { margin-bottom: 10px; }
  .sec-title {
    font-size: 9.5pt; font-weight: 700; color: #111;
    margin-bottom: 5px; padding-bottom: 3px;
    border-bottom: 1px solid #333;
  }

  /* 정보 테이블 */
  .t-info { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .t-info td {
    padding: 4px 8px;
    font-size: 8.5pt;
    border: 0.5px solid #ccc;
    vertical-align: middle;
  }
  .t-info td.th {
    font-weight: 600;
    width: 95px;
    background: #f6f6f6;
    color: #333;
  }

  /* 역할 테이블 */
  .t-role { width: 100%; border-collapse: collapse; }
  .t-role th {
    padding: 4px 8px; font-size: 8.5pt; font-weight: 700;
    background: #f0f0f0; border: 0.5px solid #ccc; text-align: left;
    width: 50%;
  }
  .t-role td {
    padding: 5px 8px; font-size: 8.5pt;
    border: 0.5px solid #ccc; vertical-align: top; line-height: 1.65;
  }

  /* 불릿 리스트 */
  .bl { list-style: none; padding: 0; margin: 3px 0; }
  .bl li {
    font-size: 8.5pt; line-height: 1.65;
    padding-left: 12px; position: relative; color: #222;
  }
  .bl li::before { content: '•'; position: absolute; left: 0; color: #555; }

  /* 일반 텍스트 */
  .c-text { font-size: 8.5pt; color: #222; line-height: 1.65; margin-bottom: 4px; }
  .c-note { font-size: 8pt; color: #888; margin-top: 3px; }

  /* 강조 박스 */
  .c-box {
    border: 0.5px solid #ccc; border-radius: 3px;
    padding: 6px 10px; background: #fafafa;
    font-size: 8pt; color: #555; margin-top: 4px;
  }

  /* 서명란 */
  .sig-wrap { margin-top: 12px; padding-top: 10px; border-top: 2px solid #111; }
  .sig-title { font-size: 9.5pt; font-weight: 700; text-align: center; margin-bottom: 8px; }
  .sig-note { font-size: 8pt; color: #555; text-align: center; margin-bottom: 12px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sig-box { border: 0.5px solid #ccc; padding: 10px 14px; border-radius: 3px; background: #fafafa; }
  .sig-role { font-size: 8pt; color: #777; margin-bottom: 4px; }
  .sig-name { font-size: 12pt; font-weight: 700; margin-bottom: 6px; }
  .sig-line { border-bottom: 0.5px solid #aaa; padding-bottom: 18px; font-size: 8.5pt; color: #333; }
  .sig-date { font-size: 8pt; color: #777; margin-top: 5px; }
</style>
</head>
<body>

<!-- 제목 -->
<div class="c-title">코칭 서비스 계약서</div>
<div class="c-title-en">Coaching Service Agreement</div>
<div class="c-desc">이 계약서는 코치와 고객 사이의 신뢰로운 코칭 관계를 위한 약속입니다.</div>
<hr class="c-divider">

<!-- 제1항: 기본 정보 -->
<div class="sec">
  <div class="sec-title">제1항. 기본 정보</div>
  <table class="t-info">
    <tr><td class="th">코치 이름</td><td>이 연 임</td><td class="th">고객 이름</td><td>${safeVal(data.name)}</td></tr>
    <tr><td class="th">계약 시작일</td><td colspan="3">${safeVal(data.start_date)}${data.online_link ? '&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;온라인 링크: ' + safeVal(data.online_link) : ''}</td></tr>
  </table>
</div>

<!-- 제2항: 코칭이란 -->
<div class="sec">
  <div class="sec-title">제2항. 코칭이란 무엇인가요?</div>
  <p class="c-text">코칭은 고객이 스스로 원하는 삶을 설계하고 목표를 실현할 수 있도록 돕는 파트너십입니다.</p>
  <ul class="bl">
    <li>코치는 조언이나 해답을 제시하지 않습니다. 모든 답은 고객 안에 있다고 믿습니다.</li>
    <li>고객의 현재 상황과 원하는 미래에 집중하며, 심리상담·멘토링·컨설팅과는 다릅니다.</li>
  </ul>
  <div class="c-box">💡 코칭은 현재~미래에 초점을 두며, 과거의 상처나 정신건강 문제는 다루지 않습니다. 해당 영역은 전문 상담사의 도움이 필요합니다.</div>
</div>

<!-- 제3항: 세션 구성 -->
<div class="sec">
  <div class="sec-title">제3항. 세션 구성</div>
  <table class="t-info">
    <tr><td class="th">세션 횟수</td><td>총 ${safeVal(data.session_count)}회</td><td class="th">1회 세션 시간</td><td>약 50분 ~ 60분</td></tr>
    <tr><td class="th">세션 간 연락</td><td colspan="3">카카오톡 문자 메시지 (긴급상황 제외, 코칭 대화 아님)</td></tr>
  </table>
</div>

<!-- 제4항: 비용 및 결제 -->
<div class="sec">
  <div class="sec-title">제4항. 코칭 비용 및 결제</div>
  <table class="t-info">
    <tr><td class="th">1회 비용</td><td>10,000원 (부가세 포함)</td><td class="th">결제 시기</td><td>계약 후 일주일 이내</td></tr>
    <tr><td class="th">결제 방법</td><td colspan="3">계좌이체 — 국민은행 375302-04-074200 (이연임)</td></tr>
  </table>
</div>

<!-- 제5항: 취소 정책 -->
<div class="sec">
  <div class="sec-title">제5항. 일정 변경 및 취소 정책</div>
  <ul class="bl">
    <li>세션 48시간 전까지 변경/취소 요청 시: 전액 환불 또는 일정 재조정</li>
    <li>세션 24시간 전까지 요청 시: 50% 환불 &nbsp;|&nbsp; 24시간 이내 취소 또는 무단 불참 시: 환불 불가</li>
    <li>코치 사정으로 취소 시: 전액 환불 또는 일정 재조정</li>
  </ul>
  <p class="c-note">* 천재지변, 응급상황 등 불가피한 사정은 별도로 협의합니다.</p>
</div>

<!-- 제6항: 비밀 유지 -->
<div class="sec">
  <div class="sec-title">제6항. 비밀 유지</div>
  <ul class="bl">
    <li>코치는 고객의 동의 없이 제3자에게 내용을 공유하지 않습니다.</li>
    <li>단, 위해 가능성이 있다고 판단될 경우 법적 의무에 따라 예외적으로 공유될 수 있으며, 슈퍼비전 시 개인 식별 정보는 제거 후 활용합니다.</li>
  </ul>
</div>

<!-- 제7항: 역할 -->
<div class="sec">
  <div class="sec-title">제7항. 코치와 고객의 역할</div>
  <table class="t-role">
    <tr>
      <th>코치의 역할</th>
      <th>고객의 역할</th>
    </tr>
    <tr>
      <td>경청하고 질문하기 · 고객의 가능성 믿기<br>판단 없이 함께하기 · ICF 윤리규정 준수</td>
      <td>솔직하게 참여하기 · 세션 사이 행동 실천하기<br>변화의 주체는 나 자신임을 인식하기 · 필요한 게 있으면 코치에게 솔직히 말하기</td>
    </tr>
  </table>
</div>

<!-- 제8항: 계약 종료 -->
<div class="sec">
  <div class="sec-title">제8항. 계약 종료</div>
  <ul class="bl">
    <li>코치 또는 고객은 언제든지 2주 전 사전 통보로 계약을 종료할 수 있으며, 미사용 세션 비용은 환불됩니다.</li>
  </ul>
</div>

<!-- 제9항: 서명 -->
<div class="sig-wrap">
  <div class="sig-title">제9항. 합의 및 서명</div>
  <div class="sig-note">위 내용을 충분히 이해하고 동의합니다. 궁금한 점이 있으면 서명 전에 언제든 물어봐 주세요.</div>
  <div class="sig-grid">
    <div class="sig-box">
      <div class="sig-role">코치 (Coach)</div>
      <div class="sig-name">이 연 임</div>
      <div class="sig-line">이 연 임</div>
      <div class="sig-date">날짜: 2026년&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;일</div>
    </div>
    <div class="sig-box">
      <div class="sig-role">고객 (Client)</div>
      <div class="sig-name">${safeVal(data.name)}</div>
      <div class="sig-line">${safeVal(data.name)}</div>
      <div class="sig-date">날짜: ${safeVal(data.submitted_date_str)}</div>
    </div>
  </div>
</div>

</body>
</html>`;
}

/**
 * contract.js — 계약서 Word 생성 (Admin 전용)
 *
 * Admin 페이지에서 downloadDocx(reg) 호출 → Word(.docx) 다운로드
 * 방식: 원본 template/contract_template.docx 파일을 JSZip으로 로드 →
 *        word/document.xml 내 고객 정보만 텍스트 치환 → 재압축 다운로드
 *        (표 색상·여백·폰트·내용 100% 원본 유지)
 */

const Contract = (() => {

  /** Admin 페이지에서 호출: 등록 데이터로 Word 다운로드 */
  async function downloadDocx(reg) {
    try {
      const blob = await generateContractDocx(reg);
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const filename = `코칭계약서_${reg.name}_${dateStr}.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Word 생성 실패:', err);
      alert('Word 파일 생성에 실패했습니다.\n\n오류: ' + err.message);
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── 템플릿 기반 Word(.docx) 생성 ────────────────────────────────
  // 원본 contract_template.docx를 fetch → JSZip으로 언집 →
  // word/document.xml 에서 고객 정보 치환 → 재압축 → Blob 반환

  async function generateContractDocx(data) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
    }

    // 1. 템플릿 파일 로드
    const resp = await fetch('template/contract_template.docx');
    if (!resp.ok) {
      throw new Error(`계약서 템플릿 파일을 불러오지 못했습니다. (HTTP ${resp.status})`);
    }
    const buf = await resp.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    // 2. 문서 XML 추출
    let xml = await zip.file('word/document.xml').async('string');

    // 3. 동적 값 준비
    const today  = new Date();
    const year   = today.getFullYear();
    const month  = today.getMonth() + 1;
    const day    = today.getDate();

    const count  = parseInt(data.session_count) || 0;
    const cost   = (count * 10000).toLocaleString('ko-KR');

    // 한국 계약서 관례: 이름 글자 사이에 공백 (예: 정성화 → 정 성 화)
    const spacedName = (data.name || '').trim().replace(/\s+/g, '').split('').join(' ');

    // 4. 고객 정보 치환 (모두 템플릿에서 유일하게 1회 등장 확인됨)
    xml = xml
      .replace('정 성 화',              spacedName)
      .replace('010-2585-4449',          data.contact || '')
      .replace('총 10회(1회 약 50~60분)', `총 ${count}회(1회 약 50~60분)`)
      .replace('100,000원 (VAT 포함)',    `${cost}원 (VAT 포함)`);

    // 5. 서명란 날짜 치환
    //    XML 구조: " 2026년 " → "3" → "월  " → "22" → "일"  (각각 별도 <w:t> 런)
    //    - " 2026년 " 은 문서 내 유일
    //    - 월 숫자: <w:t>3</w:t></w:r><w:proofErr 패턴으로 유일
    //    - 일 숫자: <w:t>22</w:t> 는 문서 내 유일

    xml = xml.replace(' 2026년 ', ` ${year}년 `);
    xml = xml.replace(
      '<w:t>3</w:t></w:r><w:proofErr',
      `<w:t>${month}</w:t></w:r><w:proofErr`
    );
    xml = xml.replace('<w:t>22</w:t>', `<w:t>${day}</w:t>`);

    // 6. 수정된 XML을 zip에 반영
    zip.file('word/document.xml', xml);

    // 7. Blob 생성 및 반환
    return await zip.generateAsync({
      type:     'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  return { downloadDocx };
})();

/**
 * contract.js — 계약서 생성 유틸리티
 *
 * 흐름 (신청 시): 데이터 저장만, 파일 다운로드/이메일 없음
 * 흐름 (Admin):   downloadDocx(reg) 호출 → Word 파일 다운로드
 */

const Contract = (() => {

  /** Admin 페이지에서 호출: 등록 데이터로 Word 다운로드 */
  async function downloadDocx(reg) {
    try {
      const blob = await generateContractDocx(reg);
      const filename = `코칭계약서_${reg.name}_${reg.start_date}.docx`;
      downloadBlob(blob, filename);
      console.log('✅ Word 저장 완료:', filename);
    } catch (err) {
      alert('Word 파일 생성에 실패했습니다.\n\n오류: ' + err.message);
    }
  }

  // ── HTML → PDF 변환 ──────────────────────────────────

  async function renderToPDF(container) {
    const { jsPDF } = window.jspdf;
    const A4_W = 210, A4_H = 297;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, allowTaint: true, logging: false, backgroundColor: '#ffffff',
    });

    const imgData      = canvas.toDataURL('image/jpeg', 0.92);
    const imgWidthMM   = A4_W;
    const imgHeightMM  = (canvas.height / canvas.width) * A4_W;
    let posY = 0;

    while (posY < imgHeightMM) {
      if (posY > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -posY, imgWidthMM, imgHeightMM);
      posY += A4_H;
    }

    return pdf.output('blob');
  }

  // ── 이메일 발송 ─────────────────────────────────────

  async function sendContractEmail(formData, filename) {
    if (typeof emailjs === 'undefined') {
      console.warn('EmailJS 미로드 — 이메일 발송 생략');
      alert('⚠️ EmailJS가 로드되지 않아 이메일을 발송하지 못했습니다.\n인터넷 연결을 확인하고 새로고침 후 다시 시도해주세요.');
      return;
    }

    // 고객에게 계약서 발송
    try {
      await API.sendEmail(CONFIG.EMAILJS_TEMPLATES.CONTRACT_DELIVERY, {
        to_name:    formData.name,
        to_email:   formData.email,
        start_date: formData.start_date,
        drive_url:  `계약서 파일명: ${filename} (이메일과 함께 별도 전달 예정)`,
        coach_name: CONFIG.COACH_NAME,
      });
      console.log('✅ 고객 이메일 발송 완료:', formData.email);
    } catch (e) {
      console.error('계약서 이메일 발송 실패:', e);
      alert(`⚠️ 고객 이메일 발송에 실패했습니다.\n\n수신자: ${formData.email}\n오류: ${e.text || e.message || JSON.stringify(e)}\n\nEmailJS 대시보드에서 템플릿 변수를 확인해 주세요.`);
    }

    // 코치(관리자)에게 신규 등록 알림
    try {
      await API.sendEmail(CONFIG.EMAILJS_TEMPLATES.ADMIN_NOTIFICATION, {
        to_name:     CONFIG.COACH_NAME,
        to_email:    CONFIG.COACH_EMAIL,
        client_name: formData.name,
        start_date:  formData.start_date,
        contact:     formData.contact,
        submitted_at: formData.submitted_date_str,
      });
      console.log('✅ 관리자 알림 발송 완료:', CONFIG.COACH_EMAIL);
    } catch (e) {
      console.warn('관리자 알림 발송 실패:', e);
      alert(`⚠️ 관리자 알림 이메일 발송에 실패했습니다.\n\n오류: ${e.text || e.message || JSON.stringify(e)}`);
    }
  }

  // ── 유틸 ────────────────────────────────────────────

  function createHiddenContainer() {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:794px;background:#fff;z-index:-1;pointer-events:none;';
    return div;
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

  // ── Word(.docx) 생성 — JSZip + OOXML ────────────────

  async function generateContractDocx(data) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
    }

    const zip = new JSZip();
    const submitDate = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── XML 헬퍼
    const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const run = (text, opts = {}) => {
      const rpr = [];
      if (opts.bold)   rpr.push('<w:b/>');
      if (opts.italic) rpr.push('<w:i/>');
      if (opts.size)   rpr.push(`<w:sz w:val="${opts.size}"/><w:szCs w:val="${opts.size}"/>`);
      if (opts.color)  rpr.push(`<w:color w:val="${opts.color}"/>`);
      return `<w:r>${rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    };

    const para = (content, opts = {}) => {
      const ppr = [];
      if (opts.align)       ppr.push(`<w:jc w:val="${opts.align}"/>`);
      if (opts.indent)      ppr.push(`<w:ind w:left="${opts.indent}"/>`);
      const before = opts.before || 0;
      const after  = opts.after !== undefined ? opts.after : 80;
      ppr.push(`<w:spacing w:before="${before}" w:after="${after}"/>`);
      if (opts.borderBottom) ppr.push('<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="333333"/></w:pBdr>');
      if (opts.borderTop)    ppr.push('<w:pBdr><w:top w:val="single" w:sz="12" w:space="4" w:color="111111"/></w:pBdr>');
      if (opts.borderBoth)   ppr.push('<w:pBdr><w:top w:val="single" w:sz="12" w:space="4" w:color="111111"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="333333"/></w:pBdr>');
      return `<w:p><w:pPr>${ppr.join('')}</w:pPr>${content}</w:p>`;
    };

    const secTitle = (text) => para(run(text, { bold: true, size: 20 }), { borderBottom: true, before: 200, after: 100 });
    const bl       = (text) => para(run('• ' + text, { size: 18, color: '333333' }), { indent: 240, after: 60 });
    const emptyP   = ()     => '<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>';

    const tblBorders = '<w:tblBorders>' +
      '<w:top w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:left w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:bottom w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:right w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/>' +
      '<w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/>' +
    '</w:tblBorders>';

    const tc = (text, opts = {}) => {
      const tcpr = [];
      if (opts.w)       tcpr.push(`<w:tcW w:w="${opts.w}" w:type="pct"/>`);
      if (opts.shading) tcpr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${opts.shading}"/>`);
      return `<w:tc>${tcpr.length ? `<w:tcPr>${tcpr.join('')}</w:tcPr>` : ''}<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(String(text || ''), { size: 18, bold: opts.bold })}</w:p></w:tc>`;
    };

    const tblMar = '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>';

    const infoTable = (rows) =>
      `<w:tbl><w:tblPr>${tblBorders}<w:tblW w:w="5000" w:type="pct"/>${tblMar}</w:tblPr>` +
      rows.map(cols =>
        `<w:tr>${cols.map((col, i) => tc(col, { bold: i % 2 === 0, shading: i % 2 === 0 ? 'F6F6F6' : 'FFFFFF', w: i % 2 === 0 ? 1250 : 2000 })).join('')}</w:tr>`
      ).join('') + '</w:tbl>';

    // ── 서명란 셀 (텍스트 + 서명라인)
    const sigCell = (role, name, date) =>
      `<w:tc><w:tcPr><w:tcW w:w="2500" w:type="pct"/></w:tcPr>` +
        `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr>${run(role, { size: 16, color: '777777' })}</w:p>` +
        `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>${run(name, { bold: true, size: 24 })}</w:p>` +
        `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="AAAAAA"/></w:pBdr><w:spacing w:after="80"/></w:pPr>${run(name, { size: 18 })}</w:p>` +
        `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(date, { size: 16, color: '777777' })}</w:p>` +
      `</w:tc>`;

    // ── 문서 본문 조립 (샘플 기준: 5개 섹션 + 서명, A4 1장)
    const body = [

      // 제목
      para(run('코칭 서비스 계약서', { bold: true, size: 30 }), { align: 'center', after: 0 }),
      para('', { borderBottom: true, before: 200, after: 100 }),

      // 제1항. 기본 정보
      secTitle('제1항. 기본 정보'),
      infoTable([
        ['코치 이름', '이 연 임', '고객 이름', esc(data.name)],
        ['계약 시작일', esc(data.start_date), '세션횟수', `총 ${esc(data.session_count)}회 (1회 약 50~60분)`],
      ]),
      emptyP(),

      // 제2항. 코칭이란
      secTitle('제2항. 코칭이란 무엇인가요?'),
      para(
        run('코칭은 고객이 스스로 원하는 삶을 설계하고 목표를 실현할 수 있도록 돕는 파트너십입니다. ', { size: 18 }) +
        run('코치는 조언이나 해답을 제시하지 않습니다. 모든 답은 고객 안에 있다고 믿습니다. ', { size: 18, color: '333333' }) +
        run('고객의 현재 상황과 원하는 미래에 집중하며, 심리상담·멘토링·컨설팅과는 다릅니다. ', { size: 18, color: '333333' }) +
        run('코칭은 현재~미래에 초점을 두며, 과거의 상처나 정신건강 문제는 다루지 않습니다. 이런 영역은 전문 상담사의 도움이 필요합니다.', { size: 18, color: '333333' }),
        { after: 60 }
      ),

      // 제3항. 비용
      secTitle('제3항. 코칭 비용 및 결제'),
      para(
        run('코칭 1회 비용은 10,000원(VAT 포함)으로 계약 1주일 내 전체 코칭세션 비용을 계좌 이체합니다. ', { size: 18 }) +
        run('국민은행 375302-04-074200 (이연임)', { size: 18, bold: true }),
        { after: 60 }
      ),

      // 제4항. 일정 변경 및 취소
      secTitle('제4항. 일정 변경 및 취소 정책'),
      bl('세션 48시간 전까지 변경/취소 요청 시: 전액 환불 또는 일정 재조정'),
      bl('세션 24시간 전까지 요청 시: 50% 환불 / 24시간 이내 취소 또는 무단 불참 시: 환불 불가'),
      bl('코치 사정으로 취소 시: 전액 환불 또는 일정 재조정 (천재지변, 응급상황 등 불가피한 경우 별도 협의)'),

      // 제5항. 비밀 유지
      secTitle('제5항. 비밀 유지'),
      bl('코치는 고객의 동의 없이 제3자에게 내용을 공유하지 않습니다.'),
      bl('단, 위해 가능성이 있다고 판단될 경우 법적 의무에 따라 예외적으로 공유될 수 있으며, 슈퍼비전 시 개인 식별 정보는 제거 후 활용합니다.'),
      emptyP(),

      // 서명
      para(run('위 내용을 충분히 이해하고 동의합니다.', { bold: true, size: 18 }), { borderTop: true, before: 160, after: 100 }),
      `<w:tbl><w:tblPr>${tblBorders}<w:tblW w:w="5000" w:type="pct"/>` +
        `<w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar>` +
      `</w:tblPr><w:tr>` +
        sigCell('코치 (Coach)', '이 연 임', '날짜:          년      월      일') +
        sigCell('고객 (Client)', esc(data.name), '날짜: ' + submitDate) +
      `</w:tr></w:tbl>`,

    ].join('\n');

    // ── ZIP 파일 구성
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `</Types>`
    );

    zip.file('_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`
    );

    zip.file('word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
    );

    zip.file('word/styles.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:docDefaults>` +
          `<w:rPrDefault><w:rPr>` +
            `<w:rFonts w:ascii="맑은 고딕" w:hAnsi="맑은 고딕" w:cs="맑은 고딕"/>` +
            `<w:sz w:val="18"/><w:szCs w:val="18"/>` +
            `<w:lang w:val="ko-KR"/>` +
          `</w:rPr></w:rPrDefault>` +
          `<w:pPrDefault><w:pPr>` +
            `<w:spacing w:after="60" w:line="240" w:lineRule="auto"/>` +
          `</w:pPr></w:pPrDefault>` +
        `</w:docDefaults>` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      `</w:styles>`
    );

    const sectPr =
      `<w:sectPr>` +
        `<w:pgSz w:w="11906" w:h="16838"/>` +
        `<w:pgMar w:top="1000" w:right="1100" w:bottom="1000" w:left="1100" w:header="600" w:footer="600" w:gutter="0"/>` +
      `</w:sectPr>`;

    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<w:body>` +
          body +
          sectPr +
        `</w:body>` +
      `</w:document>`
    );

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  return { downloadDocx };
})();

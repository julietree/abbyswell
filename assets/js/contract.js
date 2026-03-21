/**
 * contract.js — 계약서 생성 & 발송 파이프라인
 *
 * 흐름:
 *   generateContractHTML(data)        [contract_template.js]
 *       ↓ 숨겨진 <div>에 렌더
 *   html2canvas → jsPDF → PDF Blob → 로컬 다운로드
 *       ↓
 *   JSZip + OOXML → Word(.docx) Blob → 로컬 다운로드
 *       ↓
 *   EmailJS로 이메일 발송
 *       ↓
 *   api.updateContractStatus('발송완료')
 */

const Contract = (() => {

  async function generate(formData) {
    const container = createHiddenContainer();

    try {
      container.innerHTML = generateContractHTML(formData);
      document.body.appendChild(container);

      const pdfBlob = await renderToPDF(container, formData.name);

      const baseName = `코칭계약서_${formData.name}_${formData.start_date}`;
      const filename  = `${baseName}.pdf`;

      downloadBlob(pdfBlob, filename);
      console.log('✅ PDF 저장 완료:', filename);

      // Word 생성
      try {
        const docxBlob = await generateContractDocx(formData);
        downloadBlob(docxBlob, `${baseName}.docx`);
        console.log('✅ Word 저장 완료:', `${baseName}.docx`);
      } catch (docxErr) {
        console.error('Word 생성 실패:', docxErr);
        alert('Word 파일 생성에 실패했습니다.\n\n오류: ' + docxErr.message + '\n\nPDF는 정상적으로 저장되었습니다.');
      }

      await sendContractEmail(formData, filename);
      await API.updateContractStatus(formData.id, '발송완료', '');

    } finally {
      if (container.parentNode) document.body.removeChild(container);
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

    // ── 문서 본문 조립
    const body = [
      para(run('코칭 서비스 계약서', { bold: true, size: 34 }), { align: 'center', after: 60 }),
      para(run('Coaching Service Agreement', { italic: true, size: 22, color: '555555' }), { align: 'center', after: 60 }),
      para(run('이 계약서는 코치와 고객 사이의 신뢰로운 코칭 관계를 위한 약속입니다.', { size: 18, color: '777777' }), { align: 'center', after: 160 }),
      para('', { borderBottom: true, after: 160 }),

      secTitle('제1항. 기본 정보'),
      infoTable([
        ['코치 이름', '이 연 임', '고객 이름', data.name],
        ['계약 시작일', data.start_date, ...(data.online_link ? ['온라인 링크', data.online_link] : ['', ''])],
      ]),
      emptyP(),

      secTitle('제2항. 코칭이란 무엇인가요?'),
      para(run('코칭은 고객이 스스로 원하는 삶을 설계하고 목표를 실현할 수 있도록 돕는 파트너십입니다.', { size: 18 }), { after: 60 }),
      bl('코치는 조언이나 해답을 제시하지 않습니다. 모든 답은 고객 안에 있다고 믿습니다.'),
      bl('고객의 현재 상황과 원하는 미래에 집중하며, 심리상담·멘토링·컨설팅과는 다릅니다.'),
      para(run('💡 코칭은 현재~미래에 초점을 두며, 과거의 상처나 정신건강 문제는 다루지 않습니다. 이런 영역은 전문 상담사의 도움이 필요합니다.', { size: 17, color: '666666' }), { indent: 240, after: 80 }),

      secTitle('제3항. 세션 구성'),
      infoTable([
        ['세션 횟수', `총 ${data.session_count}회`, '1회 세션 시간', '약 50분 ~ 60분'],
        ['세션 간 연락', '카카오톡 문자 메시지 (긴급상황 제외, 코칭 대화 아님)', '', ''],
      ]),
      emptyP(),

      secTitle('제4항. 코칭 비용 및 결제'),
      infoTable([
        ['1회 비용', '10,000원 (부가세 포함)', '결제 시기', '계약 후 일주일 이내'],
        ['결제 방법', '계좌이체 — 국민은행 375302-04-074200 (이연임)', '', ''],
      ]),
      emptyP(),

      secTitle('제5항. 일정 변경 및 취소 정책'),
      bl('세션 48시간 전까지 변경/취소 요청 시: 전액 환불 또는 일정 재조정'),
      bl('세션 24시간 전까지 요청 시: 50% 환불 / 24시간 이내 취소 또는 무단 불참 시: 환불 불가'),
      bl('코치 사정으로 취소 시: 전액 환불 또는 일정 재조정'),
      para(run('* 천재지변, 응급상황 등 불가피한 사정은 별도로 협의합니다.', { size: 16, color: '888888' }), { after: 60 }),

      secTitle('제6항. 비밀 유지'),
      bl('코치는 고객의 동의 없이 제3자에게 내용을 공유하지 않습니다.'),
      bl('위해 가능성이 있다고 판단될 경우 법적 의무에 따라 예외적으로 공유될 수 있으며, 슈퍼비전 시 개인 식별 정보는 제거 후 활용합니다.'),

      secTitle('제7항. 코치와 고객의 역할'),
      `<w:tbl><w:tblPr>${tblBorders}<w:tblW w:w="5000" w:type="pct"/></w:tblPr>` +
        `<w:tr>${tc('코치의 역할', { bold: true, shading: 'F0F0F0', w: 2500 })}${tc('고객의 역할', { bold: true, shading: 'F0F0F0', w: 2500 })}</w:tr>` +
        `<w:tr>${tc('경청하고 질문하기 · 고객의 가능성 믿기 · 판단 없이 함께하기 · ICF 윤리규정 준수', { w: 2500 })}${tc('솔직하게 참여하기 · 세션 사이 행동 실천하기 · 변화의 주체는 나 자신임을 인식하기 · 코치에게 솔직히 말하기', { w: 2500 })}</w:tr>` +
      '</w:tbl>',
      emptyP(),

      secTitle('제8항. 계약 종료'),
      bl('코치 또는 고객은 언제든지 2주 전 사전 통보로 계약을 종료할 수 있으며, 미사용 세션 비용은 환불됩니다.'),

      para(run('제9항. 합의 및 서명', { bold: true, size: 20 }), { borderBoth: true, before: 240, after: 100 }),
      para(run('위 내용을 충분히 이해하고 동의합니다. 궁금한 점이 있으면 서명 전에 언제든 물어봐 주세요.', { size: 18 }), { after: 120 }),

      `<w:tbl><w:tblPr>${tblBorders}<w:tblW w:w="5000" w:type="pct"/>` +
        `<w:tblCellMar><w:top w:w="120" w:type="dxa"/><w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:right w:w="160" w:type="dxa"/></w:tblCellMar>` +
      `</w:tblPr><w:tr>` +
        sigCell('코치 (Coach)', '이 연 임', '날짜: 2026년      월      일') +
        sigCell('고객 (Client)', data.name, '날짜: ' + submitDate) +
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
            `<w:spacing w:after="80" w:line="276" w:lineRule="auto"/>` +
          `</w:pPr></w:pPrDefault>` +
        `</w:docDefaults>` +
        `<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
      `</w:styles>`
    );

    const sectPr =
      `<w:sectPr>` +
        `<w:pgSz w:w="11906" w:h="16838"/>` +
        `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
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

  return { generate };
})();

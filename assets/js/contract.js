/**
 * contract.js — 계약서 Word 생성 (Admin 전용)
 *
 * Admin 페이지에서 downloadDocx(reg) 호출 → Word(.docx) 다운로드
 * 신청 시에는 파일 생성/이메일 발송 없음 — 데이터 저장만 수행
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

  // ── Word(.docx) 생성 — JSZip + OOXML ────────────────────────────

  async function generateContractDocx(data) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 라이브러리가 로드되지 않았습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
    }

    const zip = new JSZip();

    // 날짜/비용 계산
    const today        = new Date();
    const signDate     = `${today.getFullYear()}년 ${today.getMonth()+1}월 ${today.getDate()}일`;
    const sessionCount = parseInt(data.session_count) || 0;
    const totalCost    = (sessionCount * 10000).toLocaleString('ko-KR');

    // ── XML 헬퍼 ────────────────────────────────────────────────────
    const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const FONT = `<w:rFonts w:ascii="SUIT" w:eastAsia="SUIT" w:hAnsi="SUIT" w:cs="SUIT"/>`;

    const run = (text, opts = {}) => {
      const sz = opts.size || 20;
      const rpr = [
        FONT,
        `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>`,
        opts.bold   ? '<w:b/><w:bCs/>'                        : '',
        opts.color  ? `<w:color w:val="${opts.color}"/>`       : '',
      ].join('');
      return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
    };

    const para = (content, opts = {}) => {
      const before = opts.before !== undefined ? opts.before : 0;
      const after  = opts.after  !== undefined ? opts.after  : 60;
      const line   = opts.line   !== undefined ? opts.line   : 240;
      const ppr = [
        opts.align ? `<w:jc w:val="${opts.align}"/>` : '',
        `<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`,
      ].join('');
      return `<w:p><w:pPr>${ppr}</w:pPr>${content}</w:p>`;
    };

    const emptyP = (after = 40) => `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr></w:p>`;

    // ── 기본정보 테이블 ─────────────────────────────────────────────
    // A4 content width: 11906 - 720*2 = 10466 twips
    // 4 columns: label(22%) value(28%) label(22%) value(28%)
    const LW = 2303; // label column: 10466 * 0.22
    const VW = 2930; // value column: 10466 * 0.28
    const TABLE_W = (LW + VW) * 2; // = 10466

    const BORDERS = `<w:tblBorders>
      <w:top    w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
      <w:left   w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
      <w:bottom w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
      <w:right  w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
      <w:insideH w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
      <w:insideV w:val="single" w:sz="4" w:color="CCCCCC" w:space="0"/>
    </w:tblBorders>`;

    const NO_BORDERS = `<w:tblBorders>
      <w:top    w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
      <w:left   w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
      <w:bottom w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
      <w:right  w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
      <w:insideH w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
      <w:insideV w:val="none" w:sz="0" w:color="FFFFFF" w:space="0"/>
    </w:tblBorders>`;

    const tcLabel = text =>
      `<w:tc><w:tcPr><w:tcW w:w="${LW}" w:type="dxa"/>` +
      `<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>` +
      `<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
      `</w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(text,{bold:true})}</w:p></w:tc>`;

    const tcValue = text =>
      `<w:tc><w:tcPr><w:tcW w:w="${VW}" w:type="dxa"/>` +
      `<w:shd w:val="clear" w:color="auto" w:fill="FFFFFF"/>` +
      `<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>` +
      `</w:tcPr><w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(text)}</w:p></w:tc>`;

    const infoTable =
      `<w:tbl><w:tblPr>${BORDERS}<w:tblW w:w="${TABLE_W}" w:type="dxa"/></w:tblPr>` +
      `<w:tr>${tcLabel('고객')}${tcValue(data.name||'')}${tcLabel('코치')}${tcValue('이 연 임')}</w:tr>` +
      `<w:tr>${tcLabel('고객 연락처')}${tcValue(data.contact||'')}${tcLabel('코치 연락처')}${tcValue('010-2077-8969')}</w:tr>` +
      `<w:tr>${tcLabel('희망 코칭 횟수')}${tcValue(`총 ${sessionCount}회(1회 약 50~60분)`)}${tcLabel('코칭 비용')}${tcValue(`${totalCost}원 (VAT 포함)`)}</w:tr>` +
      `</w:tbl>`;

    // ── 서명 테이블 ─────────────────────────────────────────────────
    const SIG_W = TABLE_W / 2;

    const sigCell = (label, name) =>
      `<w:tc><w:tcPr><w:tcW w:w="${SIG_W}" w:type="dxa"/>` +
      `<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>` +
      `</w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>` +
      `${run(label + ':  ' + name)}` +
      `</w:p>` +
      `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="AAAAAA"/></w:pBdr><w:spacing w:after="20"/></w:pPr></w:p>` +
      `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run('(인)', {color:'999999'})}</w:p>` +
      `</w:tc>`;

    const sigTable =
      `<w:tbl><w:tblPr>${NO_BORDERS}<w:tblW w:w="${TABLE_W}" w:type="dxa"/></w:tblPr>` +
      `<w:tr>${sigCell('고객', data.name||'')}${sigCell('코치', '이 연 임')}</w:tr>` +
      `</w:tbl>`;

    // ── 문서 본문 조립 ───────────────────────────────────────────────
    const body = [
      // 제목
      para(run('코칭 서비스 계약서', {bold:true, size:32}), {align:'center', before:0, after:120}),

      // 제1항
      para(run('제1항. 기본 정보', {bold:true}), {before:0, after:60}),
      infoTable,
      emptyP(80),

      // 제2항
      para(
        run('제2항. 코칭이란  ', {bold:true}) +
        run('코칭은 고객이 스스로 원하는 삶을 설계하고 목표를 실현할 수 있도록 돕는 파트너십입니다. 코치는 조언이나 해답을 제시하지 않으며, 모든 답은 고객 안에 있다고 믿습니다. 고객의 현재 상황과 원하는 미래에 집중하되, 과거의 상처나 정신건강 문제는 다루지 않습니다. 해당 영역은 전문 상담사의 도움이 필요합니다.'),
        {before:60, after:60}
      ),

      // 제3항
      para(
        run('제3항. 코칭 비용 및 결제  ', {bold:true}) +
        run(`코칭 1회 비용은 10,000원(VAT 포함)이며, 계약 후 1주일 이내에 전체 코칭 비용(${totalCost}원)을 계좌이체로 납부합니다. ※ 계좌정보: 국민은행 375302-04-074200 (이연임)`),
        {before:60, after:60}
      ),

      // 제4항
      para(
        run('제4항. 일정 변경 및 취소  ', {bold:true}) +
        run('코칭 48시간 전까지 취소 시 전액 환불, 24시간 전까지 취소 시 50% 환불, 24시간 이내 취소 또는 무단 불참 시 환불이 불가합니다. 일정 변경은 48시간 전까지 요청 시 재조정 가능합니다. 코치 사정으로 코칭 취소 시 전액 환불 또는 고객 선택에 따라 일정을 재조정하며, 불가피한 사정(천재지변, 응급상황 등)은 별도 협의합니다.'),
        {before:60, after:60}
      ),

      // 제5항
      para(
        run('제5항. 비밀 유지  ', {bold:true}) +
        run('코치는 고객의 동의 없이 제3자에게 코칭의 어떤 내용도 공유하지 않습니다. 단, 고객 본인 또는 타인에게 위해 가능성이 있다고 판단될 경우 법적 의무에 따라 예외적으로 공유할 수 있습니다.'),
        {before:60, after:60}
      ),

      // 제6항
      para(
        run('제6항. 고객과 코치의 역할  ', {bold:true}) +
        run('고객은 변화의 주체가 자기 자신임을 기억하며, 신뢰를 바탕으로 솔직하게 나누고 코칭 사이의 실천을 통해 성장을 만들어갑니다. 코치는 고객의 가능성을 온전히 믿으며, 판단 없는 경청과 질문으로 함께합니다. 모든 과정은 ICF 윤리규정을 준수하며 이루어집니다.'),
        {before:60, after:60}
      ),

      // 제7항
      para(
        run('제7항. 계약 종료  ', {bold:true}) +
        run('고객 또는 코치는 언제든지 2주 전 사전 통보로 계약을 종료할 수 있으며, 미진행 코칭 비용은 환불됩니다.'),
        {before:60, after:80}
      ),

      // 제8항 합의 및 서명
      para(run('제8항. 합의 및 서명', {bold:true}), {before:80, after:40}),
      para(run('위 내용을 충분히 이해하였으며 동의합니다.'), {before:0, after:80}),
      para(run(`  ${signDate}`), {before:0, after:100}),
      sigTable,
    ].join('\n');

    // ── ZIP 파일 구성 ────────────────────────────────────────────────
    zip.file('[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml"  ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml"   ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
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
            `<w:rFonts w:ascii="SUIT" w:eastAsia="SUIT" w:hAnsi="SUIT" w:cs="SUIT"/>` +
            `<w:sz w:val="20"/><w:szCs w:val="20"/>` +
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
        `<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>`;

    zip.file('word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body>${body}${sectPr}</w:body>` +
      `</w:document>`
    );

    return await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  return { downloadDocx };
})();

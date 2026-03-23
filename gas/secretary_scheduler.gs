/**
 * secretary_scheduler.gs — Google Apps Script
 *
 * 역할 1: doPost(e) — 프론트엔드의 쓰기 요청을 처리하는 HTTP 프록시
 * 역할 2: secretaryWeeklyTrigger() — 매주 일요일 9시 자동 실행
 *
 * 배포 방법:
 *   1. script.google.com 에서 새 프로젝트 생성
 *   2. 이 코드 전체를 붙여넣기
 *   3. Script Properties 설정:
 *      - CLAUDE_API_KEY : Anthropic API Key
 *      - SHEET_ID       : Google Sheets ID
 *      - COACH_EMAIL    : 코치 이메일 주소
 *   4. 배포 > 새 배포 > 웹 앱:
 *      실행: 나 / 액세스: 모든 사용자(익명 포함)
 *   5. 트리거 설정: secretaryWeeklyTrigger > 시간 기반 > 매주 일요일 오전 9시
 */

// ── 스프레드시트 헬퍼 ──────────────────────────────────────────

function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID가 스크립트 속성에 설정되지 않았습니다.');
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    // 시트가 없으면 자동 생성 + 헤더 추가
    sheet = ss.insertSheet(name);
    const headers = {
      'registrations': ['id','name','email','contact','start_date','end_date','session_type','session_count','topic','online_link','preferred_times','contract_url','contract_status','created_at','first_session'],
      'form_config':   ['field_id','label','type','style','bg_config','updated_at'],
      'config':        ['key','value'],
      'secretary_log': ['sent_at','clients','to_email','subject','status'],
    };
    if (headers[name]) sheet.appendRow(headers[name]);
  }
  return sheet;
}

function getConfigValue(key) {
  const sheet = getSheet('config');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setConfigValue(key, value) {
  const sheet = getSheet('config');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  // 없으면 새 행 추가
  sheet.appendRow([key, value]);
}

// ── doGet: 읽기 프록시 (Google Cloud API 키 불필요) ──────────────

function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const action = e.parameter.action;
    let result;

    switch (action) {
      case 'getRegistrations':
        result = handleGetRegistrations();
        break;
      case 'getFormConfig':
        result = handleGetFormConfig();
        break;
      case 'getConfig':
        result = handleGetConfig();
        break;
      default:
        result = { status: 'error', message: '알 수 없는 action: ' + action };
    }

    output.setContent(JSON.stringify({ status: 'ok', result }));
  } catch (err) {
    output.setContent(JSON.stringify({ status: 'error', message: err.message }));
  }

  return output;
}

function handleGetRegistrations() {
  const sheet  = getSheet('registrations');
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 1) return [];

  // 헤더 행 자동 수정: 첫 번째 행이 헤더가 아닌 경우 삽입
  if (values[0][0] !== 'id') {
    const expected = ['id','name','email','contact','start_date','end_date','session_type','session_count','topic','online_link','preferred_times','contract_url','contract_status','created_at'];
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    const fixed = sheet.getDataRange().getValues();
    return parseRegistrations(fixed);
  }

  return parseRegistrations(values);
}

/** 등록 데이터 전용 파서: preferred_times 헤더 누락 자동 보정 */
function parseRegistrations(values) {
  if (!values || values.length < 2) return [];
  var rawHeader = values[0].map(function(h) { return String(h).trim(); });

  // 헤더에 preferred_times가 이미 있으면 그대로 파싱
  if (rawHeader.includes('preferred_times')) {
    return values.slice(1).map(function(row) {
      return rawHeader.reduce(function(obj, h, i) {
        if (!h) return obj;
        var val = row[i];
        obj[h] = (val instanceof Date) ? val.toISOString() : (val !== undefined ? String(val) : '');
        return obj;
      }, {});
    });
  }

  // preferred_times가 헤더에 없는 경우:
  // 데이터는 online_link 다음에 preferred_times가 들어가 있어서
  // 헤더 인덱스와 데이터 인덱스가 1씩 어긋남.
  // 단, 빈 헤더('') 이후의 컬럼(first_session 등 나중에 추가된 것)은 어긋남 없음.
  var olIdx = rawHeader.indexOf('online_link');
  if (olIdx === -1) olIdx = 9; // 기본값

  var firstEmptyIdx = rawHeader.indexOf(''); // 빈 헤더 위치(N열 등)

  return values.slice(1).map(function(row) {
    var obj = {};

    // preferred_times: 데이터에서 online_link 바로 다음 위치
    var ptVal = row[olIdx + 1];
    obj['preferred_times'] = (ptVal instanceof Date) ? ptVal.toISOString() : (ptVal !== undefined ? String(ptVal) : '');

    rawHeader.forEach(function(h, i) {
      if (!h) return; // 빈 헤더 스킵

      var dataIdx;
      if (firstEmptyIdx !== -1 && i >= firstEmptyIdx) {
        // 빈 헤더 이후(나중에 추가된 컬럼): 인덱스 그대로
        dataIdx = i;
      } else if (i <= olIdx) {
        // online_link까지: 인덱스 그대로
        dataIdx = i;
      } else {
        // online_link 이후 원래 헤더 컬럼: +1 (preferred_times가 데이터에 끼어 있으므로)
        dataIdx = i + 1;
      }

      var val = row[dataIdx];
      obj[h] = (val instanceof Date) ? val.toISOString() : (val !== undefined ? String(val) : '');
    });

    return obj;
  });
}

function handleGetFormConfig() {
  const sheet  = getSheet('form_config');
  const values = sheet.getDataRange().getValues();
  return parseSheetToObjects(values);
}

function handleGetConfig() {
  const sheet  = getSheet('config');
  const values = sheet.getDataRange().getValues();
  const rows   = parseSheetToObjects(values);
  return rows.reduce((map, row) => {
    map[row.key] = row.value;
    return map;
  }, {});
}

/** 2D 배열을 헤더 기반 객체 배열로 변환 */
function parseSheetToObjects(values) {
  if (!values || values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row =>
    headers.reduce((obj, header, i) => {
      const val = row[i];
      // 구글 시트가 날짜를 Date 객체로 자동변환하는 경우 ISO 문자열로 복원
      if (val instanceof Date) {
        obj[header] = val.toISOString();
      } else {
        obj[header] = val !== undefined ? String(val) : '';
      }
      return obj;
    }, {})
  );
}

// ── doPost: 쓰기 프록시 ───────────────────────────────────────

function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const payload = JSON.parse(e.postData.contents);

    let result;
    switch (payload.action) {
      case 'writeRegistration':
        result = handleWriteRegistration(payload.data);
        break;
      case 'uploadContract':
        result = handleUploadContract(payload.base64PDF, payload.filename);
        break;
      case 'updateContractStatus':
        result = handleUpdateContractStatus(payload.registrationId, payload.status, payload.contractUrl);
        break;
      case 'updateConfig':
        result = handleUpdateConfig(payload.key, payload.value);
        break;
      case 'updateFormConfig':
        result = handleUpdateFormConfig(payload.configs);
        break;
      case 'runSecretaryNow':
        result = secretaryWeeklyTrigger();
        break;
      case 'updateFirstSession':
        result = handleUpdateFirstSession(payload.registrationId, payload.value);
        break;
      default:
        result = { status: 'error', message: '알 수 없는 action: ' + payload.action };
    }

    output.setContent(JSON.stringify({ status: 'ok', result }));
  } catch (err) {
    output.setContent(JSON.stringify({ status: 'error', message: err.message }));
  }

  return output;
}

function handleWriteRegistration(data) {
  const sheet = getSheet('registrations');
  sheet.appendRow([
    data.id,
    data.name,
    data.email,
    data.contact,
    data.start_date,
    data.end_date         || '',
    data.session_type     || '',
    data.session_count,
    data.topic            || '',
    data.online_link      || '',
    data.preferred_times  || '',
    '',             // contract_url (추후 업데이트)
    '대기중',       // contract_status
    new Date().toISOString(),
  ]);
  return { message: '등록 완료' };
}

function handleUploadContract(base64PDF, filename) {
  const folder = getOrCreateFolder('코칭계약서');
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64PDF),
    'application/pdf',
    filename
  );
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl() };
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function handleUpdateFirstSession(registrationId, value) {
  const sheet   = getSheet('registrations');
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  // first_session 컬럼 찾기 — 없으면 헤더 행에 추가
  let colIdx = headers.indexOf('first_session');
  if (colIdx === -1) {
    colIdx = headers.length;
    sheet.getRange(1, colIdx + 1).setValue('first_session');
  }

  // 해당 registrationId 행 찾아서 업데이트
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(registrationId)) {
      // setNumberFormat('@') 으로 텍스트 형식 강제 → 구글 시트 날짜 자동변환 방지
      const cell = sheet.getRange(i + 1, colIdx + 1);
      cell.setNumberFormat('@');
      cell.setValue(value);
      return { message: '첫차수 업데이트 완료' };
    }
  }
  return { message: '등록 ID를 찾을 수 없습니다: ' + registrationId };
}

function handleUpdateContractStatus(registrationId, status, contractUrl) {
  const sheet = getSheet('registrations');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === registrationId) {
      sheet.getRange(i + 1, 11).setValue(contractUrl);  // K열: contract_url
      sheet.getRange(i + 1, 12).setValue(status);        // L열: contract_status
      return { message: '상태 업데이트 완료' };
    }
  }
  return { message: '등록 ID를 찾을 수 없습니다.' };
}

function handleUpdateConfig(key, value) {
  setConfigValue(key, value);
  return { message: 'config 업데이트 완료' };
}

function handleUpdateFormConfig(configs) {
  const sheet = getSheet('form_config');
  const data = sheet.getDataRange().getValues();
  const now = new Date().toISOString();

  configs.forEach(config => {
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === config.field_id) {
        sheet.getRange(i + 1, 2).setValue(config.label);
        sheet.getRange(i + 1, 4).setValue(JSON.stringify(config.style || {}));
        sheet.getRange(i + 1, 5).setValue(JSON.stringify(config.bg_config || {}));
        sheet.getRange(i + 1, 6).setValue(now);
        break;
      }
    }
  });
  return { message: 'form_config 업데이트 완료' };
}

// ── Secretary Weekly Trigger ──────────────────────────────────

function secretaryWeeklyTrigger() {
  const enabled = getConfigValue('secretary_mode_enabled');
  if (enabled !== 'true') {
    Logger.log('Secretary Mode 비활성화 상태. 종료.');
    return { message: '비활성화 상태' };
  }

  const props      = PropertiesService.getScriptProperties();
  const claudeKey  = props.getProperty('CLAUDE_API_KEY');
  const coachEmail = props.getProperty('COACH_EMAIL');

  // 이번 주 일~토 날짜 범위 계산
  const now       = new Date();
  const dayOfWeek = now.getDay(); // 0=일
  const sunday    = new Date(now);
  sunday.setDate(now.getDate() - dayOfWeek);
  sunday.setHours(0, 0, 0, 0);
  const saturday  = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);

  // registrations 시트에서 해당 주 시작/종료 클라이언트 조회
  const sheet = getSheet('registrations');
  const rows  = sheet.getDataRange().getValues();
  const headers = rows[0];

  const idx = {
    name:         headers.indexOf('name'),
    email:        headers.indexOf('email'),
    start_date:   headers.indexOf('start_date'),
    end_date:     headers.indexOf('end_date'),
    session_type: headers.indexOf('session_type'),
    online_link:  headers.indexOf('online_link'),
  };

  const starters = [];
  const enders   = [];

  for (let i = 1; i < rows.length; i++) {
    const row       = rows[i];
    const startDate = new Date(row[idx.start_date]);
    const endDate   = new Date(row[idx.end_date]);

    const entry = {
      name:         row[idx.name],
      email:        row[idx.email],
      session_type: row[idx.session_type],
      online_link:  row[idx.online_link] || '',
      start_date:   formatKoreanDate(startDate),
      end_date:     formatKoreanDate(endDate),
    };

    if (startDate >= sunday && startDate <= saturday) starters.push(entry);
    if (endDate   >= sunday && endDate   <= saturday) enders.push(entry);
  }

  if (starters.length === 0 && enders.length === 0) {
    Logger.log('이번 주 시작/종료 클라이언트 없음. 이메일 발송 생략.');
    return { message: '해당 없음' };
  }

  // Claude API로 이메일 본문 생성
  const emailBody = generateEmailWithClaude(claudeKey, starters, enders);

  // 코치에게 이메일 발송
  GmailApp.sendEmail(coachEmail, '이번 주 코칭 일정 안내 🌿', emailBody, {
    name: '우물가의 사슴',
  });

  // secretary_log 기록
  logSecretaryEmail(coachEmail, starters, enders);

  return { message: '발송 완료', starters: starters.length, enders: enders.length };
}

function generateEmailWithClaude(apiKey, starters, enders) {
  const starterLines = starters.map(c =>
    `${c.start_date} | ${c.name} | ${c.session_type}${c.online_link ? ' | ' + c.online_link : ''}`
  ).join('\n');

  const enderLines = enders.map(c =>
    `${c.end_date} | ${c.name} | ${c.session_type}`
  ).join('\n');

  const prompt = `당신은 코치 Abby의 비서입니다.
아래 정보를 바탕으로 따뜻하고 전문적인 한국어 주간 코칭 일정 안내 이메일을 작성해주세요.

이번 주 첫 세션 시작 클라이언트:
${starterLines || '없음'}

이번 주 마지막 세션 종료 클라이언트:
${enderLines || '없음'}

이메일 형식:
- 수신자: Abby님
- 발신자 서명: 우물가의 사슴
- 일정 시작자에게는 첫 세션임을 언급
- 일정 종료자에게는 마무리 확인과 재계약 여부 체크 필요성을 따뜻하게 언급
- 전체적으로 따뜻하고 간결한 톤
- 이메일 제목은 제외하고 본문만 작성`;

  const response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    payload: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  const result = JSON.parse(response.getContentText());
  if (result.error) {
    Logger.log('Claude API 오류: ' + JSON.stringify(result.error));
    // 폴백: 기본 템플릿 사용
    return buildFallbackEmail(starters, enders);
  }
  return result.content[0].text;
}

function buildFallbackEmail(starters, enders) {
  let body = 'Abby님, 좋은 아침입니다.\n\n';

  if (starters.length > 0) {
    body += '이번 주에 코칭을 새롭게 시작하는 분의 일정을 안내드려요.\n\n📌 코칭 시작\n';
    starters.forEach(c => {
      body += `${c.start_date} | ${c.name} | ${c.session_type}`;
      if (c.online_link) body += ` | ${c.online_link}`;
      body += '\n';
    });
    body += '\n';
  }

  if (enders.length > 0) {
    body += '이어서 이번 주에 코칭이 마무리 되는 분 일정도 안내드려요.\n\n📌 코칭 마무리\n';
    enders.forEach(c => {
      body += `${c.end_date} | ${c.name} | ${c.session_type}\n`;
    });
    body += '\n코칭을 이어가실지 확인이 필요하겠습니다.\n';
  }

  body += '\n오늘 하루도 보람찬 하루 되세요. Abby님을 응원합니다.\n\n- 우물가의 사슴 -';
  return body;
}

function logSecretaryEmail(coachEmail, starters, enders) {
  const sheet = getSheet('secretary_log');
  const now   = new Date().toISOString();
  const names = [...starters, ...enders].map(c => c.name).join(', ');
  sheet.appendRow([now, names, coachEmail, '주간 일정 안내', '발송 완료']);
}

function formatKoreanDate(date) {
  if (isNaN(date.getTime())) return '날짜 오류';
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} (${days[date.getDay()]})`;
}

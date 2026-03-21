# 🌿 코칭 서비스 등록 시스템

서버 없이 GitHub Pages + Google Sheets + EmailJS + Claude API로 운영하는 코칭 신청 자동화 시스템.

---

## 파일 구조

```
coaching-system/
├── index.html              # 신청 설문 페이지 (클라이언트용)
├── admin.html              # Admin 대시보드 (코치용)
├── modify.html             # 신청서 문항 수정 (코치용)
├── config.js               # API 키 설정 (아래 세팅 필수)
├── assets/
│   ├── css/                # 스타일시트
│   └── js/                 # 모듈별 JS
│       ├── api.js          # 외부 API 게이트웨이
│       ├── survey.js       # 설문 렌더링 & 제출
│       ├── contract.js     # PDF 생성 & 이메일 발송
│       ├── calendar.js     # 월간 캘린더
│       ├── secretary.js    # 비서 모드 토글
│       ├── admin.js        # 대시보드 로직
│       └── modify.js       # 문항 수정 에디터
├── template/
│   └── contract_template.js  # HTML 계약서 템플릿
└── gas/
    └── secretary_scheduler.gs  # Google Apps Script
```

---

## 세팅 가이드 (순서대로 진행)

### Step 1 — Google Sheets 생성

1. [Google Sheets](https://sheets.google.com) 에서 새 스프레드시트 생성
2. 아래 4개 탭 생성 (탭 이름 정확히 입력):

**registrations** 탭 — 헤더 행 (1행):
```
id | name | email | contact | start_date | end_date | session_type | session_count | topic | online_link | contract_url | contract_status | created_at
```

**form_config** 탭 — 헤더 행 (1행):
```
field_id | label | type | style | bg_config | updated_at
```
→ 2행부터 아래 데이터 입력:
| field_id | label | type |
|----------|-------|------|
| name | 고객 이름 | text |
| start_date | 계약 시작일 | date |
| end_date | 계약 종료일 | date |
| session_type | 진행 방식 | select |
| session_count | 세션 횟수 | number |
| topic | 코칭 주제 | text |
| email | 이메일 주소 | email |
| contact | 연락처 | text |
| online_link | 온라인 링크 | url |
| signature | 서명 | canvas |
| agree_cancellation | 취소 정책 동의 | checkbox |
| agree_confidentiality | 비밀 유지 동의 | checkbox |
| agree_roles | 역할 확인 | checkbox |
| agree_termination | 계약 종료 동의 | checkbox |

**config** 탭 — 헤더 행 + 데이터:
```
key | value
secretary_mode_enabled | false
coach_email | (코치 이메일 주소)
coach_name | 이 연 임
```

**secretary_log** 탭 — 헤더 행:
```
timestamp | client_name | email | email_type | status
```

3. 스프레드시트 URL에서 ID 복사:
   `https://docs.google.com/spreadsheets/d/[이 부분이 SHEET_ID]/edit`

4. **공유 설정**: 공유 > 링크가 있는 모든 사용자 > **뷰어** (공개 읽기 허용)

---

### Step 2 — Google Cloud API 키 발급

1. [Google Cloud Console](https://console.cloud.google.com) 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 선택)
3. **API 및 서비스 > 라이브러리** 에서 아래 항목 활성화:
   - Google Sheets API
   - Google Drive API
4. **API 및 서비스 > 사용자 인증 정보 > + 사용자 인증 정보 만들기 > API 키**
5. API 키 제한 설정:
   - **애플리케이션 제한**: HTTP 리퍼러 (웹사이트)
   - 허용 URL: `https://[본인 GitHub 아이디].github.io/*` 및 `http://localhost:*`
   - **API 제한**: Google Sheets API, Google Drive API 선택

---

### Step 3 — Google Apps Script 설정

1. [script.google.com](https://script.google.com) 에서 새 프로젝트 생성
2. `gas/secretary_scheduler.gs` 전체 내용을 붙여넣기
3. **프로젝트 속성 > 스크립트 속성** 에서 아래 값 추가:
   | 속성명 | 값 |
   |--------|-----|
   | `SHEET_ID` | Step 1에서 복사한 스프레드시트 ID |
   | `CLAUDE_API_KEY` | Anthropic API Key |
   | `COACH_EMAIL` | 코치 이메일 주소 |
4. **배포 > 새 배포**:
   - 유형: 웹 앱
   - 실행: **나**
   - 액세스: **모든 사용자(익명 포함)**
   - 배포 후 **웹 앱 URL** 복사
5. (선택) Secretary Mode 자동 실행 트리거 설정:
   - 트리거 > + 트리거 추가
   - 함수: `secretaryWeeklyTrigger`
   - 이벤트 소스: 시간 기반
   - 시간 기반 유형: 주간 타이머
   - 요일: **일요일**
   - 시간: **오전 9시~10시**

---

### Step 4 — EmailJS 설정

1. [EmailJS](https://www.emailjs.com) 가입 후 로그인
2. **Email Services > Add New Service** — Gmail 연결
3. **Email Templates > Create New Template** — 2개 생성:

**템플릿 1: 계약서 발송** (`contract_delivery`)
```
제목: [코칭 서비스 계약서] {{to_name}}님의 계약서가 도착했습니다

안녕하세요, {{to_name}}님!

코칭 서비스 계약서가 준비되었습니다.
아래 링크에서 계약서를 확인하실 수 있습니다:

{{drive_url}}

계약서를 검토하신 후 일주일 이내에 아래 계좌로 결제 부탁드립니다.
국민은행 375302-04-074200 (이연임)

코칭 시작일: {{start_date}}
진행 방식: {{session_type}}

궁금한 점이 있으시면 언제든지 연락 주세요.

코치 {{coach_name}} 드림
```

**템플릿 2: 관리자 알림** (`admin_notification`)
```
제목: [신규 코칭 등록] {{client_name}}님이 신청했습니다

신규 코칭 신청이 접수되었습니다.

이름: {{client_name}}
시작일: {{start_date}}
진행 방식: {{session_type}}
등록일시: {{submitted_at}}

Admin 페이지에서 확인하세요.
```

4. **Account > API Keys** 에서 Public Key 복사

---

### Step 5 — config.js 설정

`coaching-system/config.js` 파일을 열어 아래 값을 채워넣기:

```javascript
const CONFIG = {
  GOOGLE_API_KEY:  'Step 2에서 발급한 API 키',
  SHEET_ID:        'Step 1의 스프레드시트 ID',
  GAS_ENDPOINT:    'Step 3의 웹 앱 URL',
  EMAILJS_PUBLIC_KEY:  'Step 4의 Public Key',
  EMAILJS_SERVICE_ID:  'EmailJS Service ID',
  EMAILJS_TEMPLATES: {
    CONTRACT_DELIVERY:  'contract_delivery',
    ADMIN_NOTIFICATION: 'admin_notification',
  },
  COACH_NAME:  '이 연 임',
  COACH_EMAIL: '코치 이메일 주소',
};
```

---

### Step 6 — GitHub Pages 배포

```bash
# 새 GitHub 저장소 생성 후
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/[아이디]/[저장소명].git
git push -u origin main
```

GitHub 저장소 > Settings > Pages > Source: `main` 브랜치 선택 > Save

배포 URL: `https://[아이디].github.io/[저장소명]/`

---

## 사용 방법

| 역할 | URL | 용도 |
|------|-----|------|
| 클라이언트 | `/index.html` | 코칭 신청 설문 작성 |
| 코치 (Admin) | `/admin.html` | 전체 현황 확인, 비서 모드 관리 |
| 코치 (수정) | `/modify.html` | 신청서 문항 텍스트/배경 수정 |

---

## 주요 기능 흐름

```
클라이언트 설문 제출
    ↓
Google Sheets 'registrations'에 저장
    ↓
계약서 HTML 생성 → PDF 변환 → Google Drive 업로드
    ↓
클라이언트 이메일로 Drive 링크 발송 (EmailJS)
    ↓
코치에게 신규 등록 알림 발송 (EmailJS)
    ↓
Admin 대시보드 자동 갱신 (새로고침 시)
    ↓
매주 일요일 9시: Claude API로 주간 일정 이메일 자동 생성 & 발송
```

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 날짜 선택기에 데이터 없음 | API Key 오류 또는 시트 비공개 | Cloud Console API 제한 확인, 시트 공유 확인 |
| 제출 후 Sheets에 저장 안 됨 | GAS_ENDPOINT 오류 | Apps Script 배포 재확인, 콘솔 오류 확인 |
| PDF에 글자 깨짐 | 한국어 폰트 로드 실패 | 인터넷 연결 확인 (Google Fonts CDN) |
| 이메일 발송 안 됨 | EmailJS 설정 오류 | Service ID / Template ID / Public Key 재확인 |
| Secretary Mode 미작동 | GAS 트리거 미설정 | Apps Script 트리거 설정 재확인 |

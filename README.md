# 업무 도우미

Chrome 확장 프로그램으로, 구내식당 메뉴 조회·알림과 NHN Harmony 퍼플 타임 일괄 조정 기능을 제공합니다.

## 주요 기능

- **구내식당 메뉴**: Payco 메뉴 페이지 연동, 메뉴 알림 설정
- **두레이 연동**: 설정한 봇/URL로 메뉴 알림 전송
- **퍼플 타임 일괄 조정**: NHN Harmony 퍼플 타임 페이지에서 일괄 조정 (컨텍스트 메뉴)

## 기술 스택

- Manifest V3
- Vanilla JS (ES Modules)
- Chrome Extension APIs: `storage`, `alarms`, `contextMenus`, `scripting`

## 프로젝트 구조

```text
nhn_extension/
├── manifest.json          # 확장 프로그램 설정
├── background.js          # Service Worker (메뉴 알람, 메시지 라우팅)
├── content.js             # Payco 메뉴 페이지용 콘텐츠 스크립트
├── content-purple-time.js # 퍼플 타임 페이지용 콘텐츠 스크립트
├── popup/
│   ├── frontend/          # 팝업 UI (index.html, popup.js)
│   └── message.js         # 팝업 관련 메시지/설정 처리
├── options/
│   └── frontend/          # 옵션 페이지 (index.html, app.js, app.css)
├── menu-alarm/            # 메뉴 알람 로직 (listener, utils, message)
└── assets/                # 아이콘 등 정적 리소스
```

## 설치 및 로드 (개발용)

1. 저장소 클론 후 프로젝트 루트로 이동
2. Chrome에서 `chrome://extensions/` 접속
3. **개발자 모드** 켜기
4. **압축 해제된 확장 프로그램을 로드합니다** 클릭 후 이 프로젝트 폴더 선택

## 사용 조건

- **구내식당 메뉴**: `https://menu.payco.com/*` 에서 동작
- **퍼플 타임**: `*://nharmony.nhnent.com/user/hrms/odm/attend/purpleTime.nhn*` 페이지에서 컨텍스트 메뉴 사용

## 설정

- 확장 프로그램 아이콘 클릭 → 팝업에서 메뉴 알림 on/off, 두레이 봇/URL 등 설정
- 아이콘 우클릭 → **옵션** 으로 상세 설정 페이지 이동

## 개발

- 수정 후 `chrome://extensions/` 에서 해당 확장의 **새로고침** 버튼으로 반영
- `background.js` 변경 시 Service Worker 재시작 필요 (확장 새로고침)

## 라이선스

내부 사용 목적 프로젝트입니다.

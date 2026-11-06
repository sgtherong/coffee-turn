# Coffee Turn · 3인 / 2인 독립 순번 공유 웹앱

설치 없는 모바일/PC 브라우저 앱. **3인 토니(A)→코비(B)→영(C)**, **2인 토니(A)→코비(B)**는 순서를 별도로 저장합니다. 실제 구매 완료를 누른 경우에만 그 모드의 다음 순번이 변경됩니다. 최근 구매 취소는 두 모드 통틀어 마지막 1건에 적용합니다.

기존 구매 기록의 A/B/C 식별자는 그대로 유지하면서 화면에는 토니/코비/영 이름으로 표시합니다.

## 구현됨
- 3인 / 2인 순번 각각 저장 (독립 순환)
- 구매 완료 및 최근 구매 1건 취소
- 전체 모드의 최근 구매 기록과 구매 횟수 표시
- Firebase 연결 후 3명 실시간 동기화
- Firebase 이메일/비밀번호 로그인 및 UID 허용목록 접근제어
- GitHub Pages 배포 (별도 서버 및 빌드 불필요)
- Firebase 설정 전에는 **이 기기 한정** `localStorage` 체험 모드 (공유 불가 표시)

## 1. GitHub 저장소 만들기

1. https://github.com/new 방문해 본인의 GitHub 계정에 **Public** 저장소 `coffee-turn`을 만듭니다. 기존 프로젝트는 건드리지 않습니다.
2. 이 ZIP의 파일 및 폴더 전체를 저장소 루트에 업로드하거나 GitHub 연결된 ChatGPT에게 업로드를 맡깁니다.
3. **Settings → Pages → Build and deployment → Deploy from a branch**를 선택합니다. Branch `main`, Folder `/(root)` 선택 후 Save.
4. 배포 완료 후 기본 주소: `https://sgtherong.github.io/coffee-turn/` (계정/저장소 이름이 바뀌면 주소도 변경).

공식 안내: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 2. Firebase 프로젝트 만들기

1. https://console.firebase.google.com/ → **Add project** → 예: `coffee-turn` 프로젝트를 생성합니다. Google Analytics는 필요하지 않습니다.
2. **Build → Authentication → Get started → Sign-in method → Email/Password** 활성화. Firebase Console Authentication **Users → Add user**에서 3명의 이메일/비밀번호 계정을 추가합니다. 각자 본인의 비밀번호만 전달받도록 하세요. 앱에는 회원가입 기능이 없습니다.
3. Authentication 사용자 목록의 **User UID** 3개를 메모합니다.
4. **Build → Firestore Database → Create database** → 사용 국가/지역을 선택하고 **Production mode**로 생성합니다. (Test mode 사용 금지)
5. Firestore Database → **Rules** 탭에서 `firestore.rules` 내용을 붙여넣습니다. `REPLACE_WITH_MEMBER_A_UID` 등 세 곳을 3명의 **실제 UID**로 바꾸고 Publish합니다. 비밀번호는 보안 규칙이나 GitHub에 절대 올리지 않습니다.
6. **Project settings(톱니바퀴) → General → Your apps → Web (`</>`) → Register app** → SDK setup and configuration의 `firebaseConfig`를 복사합니다.
7. GitHub 저장소의 `firebase-config.js` 파일을 수정해 `apiKey`, `authDomain`, `projectId`, `appId` 등 해당 값을 넣습니다. 저장 후 GitHub Pages 페이지를 다시 열면 체험 모드 대신 로그인 화면이 나타납니다.

> Firebase Web Config는 클라이언트 식별자입니다. 데이터 보호는 **Firestore Rules에 등록된 3명 UID**가 담당합니다. 서비스 계정 키, API 관리용 비밀, 비밀번호를 GitHub에 넣지 마세요.

## 3. 함께 사용하기

- 3명이 각자 링크를 열어 Firebase에 등록된 이메일과 비밀번호로 로그인합니다.
- 모드 변경은 **개인 화면에서만** 적용되며 다른 사람의 화면 모드는 바뀌지 않습니다.
- 실제 커피를 산 사람과 관계없이 해당 모드에서 다음 차례인 사람이 구매했다고 기록됩니다. 순번과 다르게 구매한 경우에는 '구매 완료'를 누르지 말고 순번 조정 기능을 추가해야 합니다.
- 구매 버튼은 평일에만 자동 실행되지 않습니다. 공휴일·휴가·주말에는 **누르지 않으면 순서 그대로** 유지됩니다.
- 실수로 중복 구매를 누르면 '마지막 구매 취소'로 가장 최근 1건을 되돌립니다. 취소는 구매 이력을 삭제합니다.

## 4. 테스트 (선택)

Node.js 18 이상 설치 환경에서:

```bash
npm test
```

## 파일 구성

```
index.html          메인 웹앱
styles.css          반응형 스타일
app.js              화면, Firebase 실시간 동기화 및 구매 처리
rotation.js         2인/3인 독립 순번 로직
firebase-config.js  Firebase 웹 프로젝트 공개 설정 (초기값 비어 있음)
firestore.rules     UID 화이트리스트 보안 규칙 (UID 입력 필요)
assets/icon.svg     웹앱 아이콘
tests/              순번 로직 자동 테스트
.nojekyll           GitHub Pages 정적 파일 배포 지원
```

## 제한 및 참고 사항

- Firebase 등록 전에는 **공유 데이터가 아닌 각 기기별 체험 데이터**입니다.
- Firebase 연결 후 브라우저 간 거래는 Firestore `runTransaction`을 통해 충돌을 줄입니다. 오프라인 상태에서 구매를 저장하는 기능은 지원하지 않습니다.
- 기록은 최근 20건만 화면에 표시하며 Firebase 이벤트 저장은 계속됩니다. 장기간 운영 시 기록 보관/정리 정책을 추가하는 것을 권장합니다.
- 누구나 GitHub Pages 화면은 볼 수 있지만, Firebase 인증 계정 + Firestore UID 허용목록에 없으면 **공유 데이터에는 접근할 수 없습니다.**
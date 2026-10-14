# My Sticky Notes

Microsoft Sticky Notes의 목록과 개별 노트 창을 참고한 **macOS 오프라인 메모 앱**입니다.
Tauri 2 + React + TypeScript로 구현했으며 계정이나 서버 없이 로컬 SQLite에 저장합니다.
Microsoft의 공식 앱이 아닙니다.

## 기능

- 노트 생성·검색·편집·확인 후 삭제, 최근 수정 순 목록
- 노트마다 독립적인 창, 창 닫기와 노트 삭제 구분
- 7가지 색상, 노트별 상단 고정
- 굵게·기울임·밑줄·취소선·글머리 목록과 실행 취소·다시 실행
- 입력 후 500ms 자동 저장, 저장 실패 표시와 재시도
- 한글 조합 중 자동 저장 대기, 닫기·정상 종료 전에 저장 확인
- 창 위치·크기·열림 상태·고정 복원, 화면 밖 창 위치 보정
- 메뉴 막대의 새 메모·메모 목록·종료, 중복 실행 방지
- 한국어 UI, 시스템 밝은/어두운 테마, 키보드 포커스와 접근성 이름

이미지, 계정 동기화, 전역 단축키, 자동 업데이트는 포함하지 않습니다.
Windows/Linux 구조는 Tauri를 사용하지만 실제 검증 대상은 macOS입니다.

## 개발 환경

- Node.js 24 (`.node-version`), npm
- Rust stable, rustfmt
- macOS Xcode Command Line Tools

```bash
xcode-select --install
xcrun --show-sdk-path
```

이미 설치되어 있으면 재설치할 필요가 없습니다. fnm 사용자라면 루트에서 실행합니다.

```bash
fnm install
fnm use
```

Rust가 없다면 [rustup](https://rustup.rs/)으로 설치합니다.

```bash
rustup component add rustfmt clippy
npm ci
npm run tauri dev
```

첫 네이티브 실행에는 Rust 의존성 다운로드와 컴파일 시간이 필요합니다.

### Xcode 라이선스 오류

`You have not agreed to the Xcode license agreements`가 나오면 Xcode를 열어 초기 설정을
완료합니다. Command Line Tools가 설치되어 있다면 현재 터미널에서만 경로를 지정할 수도 있습니다.

```bash
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
npm run tauri dev
```

시스템 전체의 `xcode-select` 설정은 바뀌지 않습니다. 정식 Xcode 설정이 완료되면
`unset DEVELOPER_DIR`로 해제합니다.

## 사용 방법

- 목록의 **+** 또는 앱 내 `⌘N`으로 새 메모를 만듭니다.
- 카드 클릭으로 노트를 엽니다. 이미 열린 노트는 같은 창을 앞으로 가져옵니다.
- 상단 핀 버튼으로 상단 고정을 전환합니다. **…**에서 색상·메모 목록·삭제를 선택합니다.
- 노트의 **×**는 저장 후 창만 숨깁니다. 내용은 목록에 남습니다.
- 목록의 **×**는 목록만 숨깁니다. 메뉴 막대에서 다시 열 수 있습니다.
- 메뉴 막대의 **종료**, 목록의 **… → 앱 종료**, 또는 `⌘Q`로 종료합니다.
- 저장 실패 시 내용을 유지합니다. **다시 시도**로 저장을 완료한 뒤 닫거나 종료합니다.
- 다시 실행하면 마지막 정상 종료 시 열려 있던 노트가 복원됩니다.

| 단축키             | 동작                  |
| ------------------ | --------------------- |
| `⌘N`               | 새 메모               |
| 목록에서 `⌘F`      | 검색창 포커스         |
| `⌘B` / `⌘I` / `⌘U` | 굵게 / 기울임 / 밑줄  |
| `⌘Z` / `⌘⇧Z`       | 실행 취소 / 다시 실행 |
| `⌘Q`               | 저장 확인 후 앱 종료  |

## 데이터 저장

앱 데이터 디렉터리의 `notes.sqlite`와 SQLite WAL 파일을 사용합니다.
macOS 기본 위치는 `~/Library/Application Support/com.mystickynotes.app/`입니다.

서식은 문서 JSON으로, 검색은 일반 텍스트로 보관합니다. 창 이동은 노트 수정 순서에 영향을
주지 않습니다. 삭제한 메모는 복원할 수 없습니다. 강제 종료나 전원 차단 직전의 아직 저장되지
않은 입력은 복구를 보장하지 않습니다. 백업할 때는 앱을 정상 종료한 뒤 해당 폴더를 복사합니다.

앱 식별자를 바꾸면 데이터 폴더도 달라집니다. 기존 데이터가 있으면 이전 작업이 별도로 필요합니다.

## 명령과 검증

| 명령                                              | 용도                                       |
| ------------------------------------------------- | ------------------------------------------ |
| `npm run tauri dev`                               | 실제 데스크톱 앱 개발 실행                 |
| `npm run dev`                                     | 브라우저 UI 개발 서버, localhost:1420      |
| `npm run typecheck`                               | TypeScript 검사                            |
| `npm run check`                                   | TypeScript·Rust 포맷·Rust 컴파일 검사      |
| `npm test`                                        | Vitest + React Testing Library 회귀 테스트 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | SQLite·창 위치·종료 조정 테스트            |
| `npm run test:e2e`                                | Playwright UI 테스트                       |
| `npm run build`                                   | 프런트엔드 배포 빌드                       |
| `npm run tauri build`                             | macOS 앱·설치 파일 빌드                    |
| `npm run tauri info`                              | 설치 도구 정보                             |

Playwright 최초 사용 시 `npm exec -- playwright install chromium`을 실행합니다.
브라우저 E2E는 테스트 안에서 네이티브 경계를 대체하며 실제 디스크 저장·창·메뉴 막대를
검증하지 않습니다. 이 기능은 실제 Tauri 앱에서 확인합니다.
일반 브라우저 실행에서는 네이티브 메모 API를 사용할 수 없다는 안내가 표시됩니다.
`npm run dev`와 `npm run tauri dev`를 동시에 실행하면 포트 1420이 충돌합니다.

빌드 결과는 `src-tauri/target/release/bundle/`에 생성됩니다.
외부 배포 전 고유 앱 식별자와 [macOS 서명·공증](https://v2.tauri.app/distribute/sign/macos/)을 설정합니다.

## 코드와 문서

- `src/NotesList.tsx`: 목록·검색·삭제 확인
- `src/NoteWindow.tsx`, `src/NoteEditor.tsx`: 창 생명주기·편집·서식
- `src/autosave.ts`, `src/api.ts`: 자동 저장 직렬화·네이티브 호출
- `src-tauri/src/store.rs`: SQLite 저장과 스키마 버전
- `src-tauri/src/desktop.rs`, `lifecycle.rs`: 창·메뉴 막대·종료 확인·위치 보정
- [구현 계획](docs/implementation-plan.md)
- [구현 결과와 검증](docs/implementation-results.md)
- [에이전트 작업 지침](AGENTS.md)

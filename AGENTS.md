# 프로젝트 작업 지침

# 기본 언어

- 응답, 코드 주석, 문서는 기본적으로 한국어로 작성한다. 사용자가 다른 언어를 명시적으로 요청하면 해당 언어를 사용한다.
- 군더더기 없이 간결하고 전문용어, 약어를 활용하여 정확하게 응답 한다.

# 요구사항 기반 작업 하네스

- 기능 구현·수정·검증 및 설계 문서 작업의 기준 문서는 [요구사항 정의서](docs/00.requirements.md)다. 작업 시작 시 관련 요구사항 ID와 수용 기준을 읽고, 대상 앱의 `AGENTS.md` 및 구현 근거를 확인한다.
- 정의서의 **확정**, **현행 기준**, **미정**을 구분한다. 미정 사항을 임의로 확정하거나 화면·문서의 존재만으로 기능이 완성됐다고 판단하지 않는다.
- 현재 사용자 요청이 기존 문서와 다르면 사용자 요청을 우선하며, 영향을 받는 요구사항과 수용 기준을 함께 갱신한다. 미정 사항이 작업 결과를 바꾸는 경우에만 필요한 정보를 확인한다.
- 변경 후 정의서의 검증 표에서 영향 범위에 맞는 검사를 수행한다. 완료 보고에는 대상 ID, 변경 사항, 실제 검증 결과와 미검증·차단 항목을 간결하게 남긴다.
- 상세 요구사항과 실행 명령은 정의서에서 관리한다. 이 파일에는 참조·실행 규칙만 유지하고 비밀번호나 API Key를 기록하지 않는다.
- 공용 코드 변경은 [패키지 경계 규칙](packages/README.md)을 따른다.

# Simple 에이전트

- 은 전용 서브에이전트를 생성하여 위임한다.
- Git/GitHub 저장소 작업, 서버 실행, 간단한 질문에 대한 답변, 이름 변경, 오타 수정 등 범위가 명확한 단순 작업은 `simple` 전용 서브에이전트를 생성하여 위임한다.
- 모델은 `gpt-6-luna`, 추론 수준은 `medium`으로 지정한다.
- 생성 시 `fork_turns="none"`으로 설정하고, 작업 범위, 필요한 맥락과 대상 경로, 사용자 승인 범위를 전달한다.
- `simple` 에이전트는 작업을 직접 처리하고 필요한 검증 후 결과를 주 에이전트에 보고한다. 동일 작업을 다시 위임하지 않으며, 사용자 변경 사항과 승인 범위를 보존한다.
- 사용자 변경 사항을 보존하고, 파괴적인 Git 작업은 명시적인 승인 없이 수행하지 않는다.

## 목적과 현재 범위

이 저장소는 Tauri 2 + React + TypeScript 기반 데스크톱 스티키 노트 앱이다.
목록·서식 편집·독립 창·로컬 SQLite 저장·메뉴 막대·창 복원이 구현되어 있다.
승인된 범위와 검증 결과는 docs/implementation-plan.md와 docs/implementation-results.md를 읽는다.
개발 환경과 실행 방법은 먼저 [README.md](README.md)를 읽는다.

## 도구와 폴더 역할

- Node.js 24 (`.node-version`), npm, Rust stable을 사용한다.
- JavaScript 의존성은 npm으로 관리한다. `package-lock.json`을 유지하며 다른 패키지 관리자 lockfile을 추가하지 않는다.
- Rust 의존성은 `src-tauri/Cargo.toml`로 관리하고 `src-tauri/Cargo.lock`을 유지한다.
- React 화면과 프런트엔드 상태는 `src/`에 둔다.
- Rust 명령과 Tauri 설정은 `src-tauri/`에 둔다. 저장은 store.rs, 창과 명령은 desktop.rs, 종료 조정과 위치 보정은 lifecycle.rs가 담당한다.
- 명령은 desktop.rs에 구현하고 lib.rs의 invoke_handler에 등록한다. 공용 IPC 타입은 src/types.ts와 Rust serde camelCase를 함께 유지한다.
- SQLite 스키마를 바꿀 때는 user_version 기반의 비파괴 마이그레이션과 기존 데이터 테스트를 추가한다.
- 노트 본문 저장은 Autosave로 직렬화하며, 삭제된 메모를 upsert로 되살리지 않는다.
- 종료는 모든 노트의 저장 확인을 기다린다. 숨긴 WebView에서 requestAnimationFrame을 기다리지 않는다.
- 로딩·오류 화면도 닫기와 종료 이벤트를 처리한다. 종료 중 편집 잠금은 별도로 유지하며 취소 이벤트에서만 해제한다.
- `src-tauri/tauri.conf.json`의 `devUrl`과 `vite.config.ts`의 포트 1420을 함께 유지한다.
- 빌드 결과, 생성된 스키마, 의존성 폴더는 직접 수정하거나 커밋하지 않는다.

## 구현 원칙

- 요청한 범위 안에서 변경하며, 기존 사용자 변경을 보존한다.
- TypeScript strict 검사를 유지한다. `any`나 검사 무시 주석으로 오류를 숨기지 않는다.
- Tauri 2의 `@tauri-apps/api/core`와 해당 버전의 공식 플러그인 API를 사용한다.
- React에서 Node.js 전용 API를 호출하지 않는다. OS 기능은 Tauri API나 Rust로 연결한다.
- 네이티브 호출 실패를 처리하고 사용자에게 의미 있는 오류 상태를 제공한다.
- 파일·창·플러그인 API를 추가할 때 `src-tauri/capabilities/`의 권한도 확인한다.
  필요한 창과 기능에만 권한을 부여하고 광범위한 파일 경로 접근을 기본값으로 추가하지 않는다.
- 환경 변수, 인증 정보, 서명 인증서를 코드나 문서에 넣지 않는다.
- CSP는 로컬 앱 리소스·IPC만 허용한다. 개발용 localhost/HMR 허용은 devCsp에만 둔다.
- 기능이나 실행 명령이 바뀌면 README도 함께 갱신한다.

## 검증

의존성 최초 설치는 저장소 루트에서 `npm ci`로 한다.
변경 후 관련 검사를 실행하고 결과를 확인한다.

```bash
npm run check
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Tauri 설정, Rust 의존성 또는 번들 구성이 바뀌면 네이티브 빌드도 확인한다.

```bash
npm run tauri build
```

UI 또는 네이티브 동작 변경은 `npm run tauri dev`로 앱에서 확인한다.
브라우저의 Vite 서버만으로 Rust 호출이나 창 API 검증을 대체하지 않는다.
동작을 추가할 때는 해당 동작을 검증하는 적절한 테스트를 추가한다.
UI 테스트는 npm run test:e2e로 실행한다. 브라우저 테스트의 IPC 대체를 실제 네이티브 검증으로 표현하지 않는다.
현재 ESLint는 구성되어 있지 않다.

완료 보고에는 변경 내용, 실제 실행한 검사, 남은 제한 사항을 담는다.
컴파일 성공을 실제 앱 동작 검증으로 표현하지 않는다.

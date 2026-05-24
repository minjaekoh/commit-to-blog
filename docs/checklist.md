# 개발 체크리스트 (1주차 / 2주차)

## 1주차: 기획/설계 + 기본 뼈대 구현

### 요구사항/범위
- [x] `assignment_requirements.md`와 `requirements.md` 기준으로 필수 기능 범위를 확정한다.
- [x] MVP 범위와 제외 범위를 문서화한다.
- [x] 기능 우선순위(P0/P1/P2)를 정리한다.

### 기술 선택 근거
- [x] React + Express + Gemini API(무료 티어) + GitHub API 선택 이유를 문서로 정리한다.
- [x] Tailwind CSS + Shadcn UI 선택 기준을 정한다.
- [x] MongoDB + Mongoose 선택 이유와 컬렉션/인덱스 초안을 정리한다.

### 아키텍처/데이터 설계
- [x] 시스템 흐름(`Browser -> Client -> Server -> External APIs`)을 다이어그램 또는 텍스트로 명시한다.
- [x] 화면별 필요 데이터(저장소/커밋/diff/인터뷰 턴/포스트)를 정의한다.
- [x] 상태 흐름(인터뷰 상태 머신)을 정의한다.
- [x] 모노레포 디렉터리 구조(`apps/client`, `apps/server`, `packages/shared`, `docs`, `infra`)와 책임을 정의한다.

### API/프롬프트 설계
- [x] 서버 API 계약서(요청/응답/에러 포맷)를 초안 작성한다.
- [x] 질문 생성/힌트/해설/초안생성 프롬프트 초안을 작성한다.
- [x] LLM 출력 JSON 스키마를 확정한다.
- [x] `docs/skill.md`를 작성해 입력/출력/평가기준/금지사항을 확정한다.

### 보안/테스트 기준
- [x] 토큰/시크릿 관리 정책(.env, 서버 전용)을 명시한다.
- [x] 예외 시나리오(빈 diff, API 실패, 타임아웃) 처리 기준을 정한다.
- [x] 완료 판정용 테스트 체크포인트를 작성한다.

### 1주차 뼈대 구현
- [x] Client/Server 프로젝트 초기 구조를 구성한다.
- [x] TypeScript, lint/format, 공통 스크립트를 정리한다.
- [x] Tailwind CSS 초기 설정과 Shadcn UI 기본 세팅을 완료한다.
- [x] 서버 기본 라우트(health check, repos/commits/diff/interview/posts 스텁)를 구성한다.
- [x] MongoDB 연결 및 Mongoose 모델(users, interviewSessions, interviewTurns, posts) 스켈레톤을 작성한다.
- [x] 커밋 선택 화면과 인터뷰 룸 기본 UI(답변창 + 4개 액션 버튼) 목업을 연결한다.
- [x] `.env.example`와 실행 가이드를 작성한다.

## 2주차: 구현/통합/데모 준비

### 공통 기반
- [x] 1주차에 구성한 뼈대를 기준으로 실제 API/상태관리 구조로 정리한다.

### Step 1 구현 (저장소/커밋 선택)
- [x] 저장소 목록 조회 API를 구현한다.
- [x] 커밋 목록 조회 API를 구현한다.
- [x] 커밋 diff 조회 API를 구현한다.
- [x] 저장소/커밋 선택 UI와 로딩/에러/빈 상태를 구현한다.

### Step 2 구현 (AI 인터뷰 룸)
- [x] 질문 생성 API(디펜스 질문 1~2개)를 구현한다.
- [x] 답변 제출 및 피드백 API를 구현한다.
- [x] 힌트 보기 API를 구현한다.
- [x] 모르겠어요(해설 보기) API를 구현한다.
- [x] 인터뷰 UI(답변창 + 4개 액션 버튼)를 구현한다.
- [x] 인터뷰 턴 데이터를 저장해 Step 3로 전달한다.

### Step 3 구현 (초안/발행)
- [x] 분기별 초안 생성 로직(답변성공/모르겠어요/스킵)을 구현한다.
- [x] 마크다운 편집 + 프리뷰 UI를 구현한다.
- [x] 포스트 저장 API와 목록 조회 API를 구현한다.
- [x] 저장 포스트 카드 목록 및 재편집 플로우를 구현한다.

### 품질/안정성
- [x] 외부 API 호출이 서버에서만 수행되는지 점검한다.
- [x] 입력/출력 스키마 검증(Zod)을 적용한다.
- [x] LLM 실패/타임아웃/과대 diff 방어 로직을 반영한다.
- [x] 민감정보가 로그/응답에 노출되지 않도록 점검한다.
- [x] MongoDB 인덱스(`interviewSessions userId+createdAt`, `posts userId+updatedAt`, `interviewTurns sessionId+turnIndex`)를 적용한다.

### 테스트/최종 정리
- [ ] 핵심 3개 사용자 플로우 E2E 점검을 수행한다.
- [ ] 예외 케이스(커밋 없음, 빈 diff, LLM 오류, 스킵) 테스트를 수행한다.
- [ ] 데모 시나리오(실사용 레포 1개 + 백업 샘플 1개)를 준비한다.
- [ ] 최종 README(실행법/환경변수/기능설명)를 업데이트한다.








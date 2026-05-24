# commit-to-blog

Smart Blog - AI Commit Analyst 모노레포입니다.

## 1) 사전 준비
- Node.js 20+
- npm 10+
- MongoDB Atlas(M0 가능)

## 2) 환경변수 설정
루트 `.env.example`를 복사해 `.env` 생성 후 값 입력:

```bash
cp .env.example .env
```

필수 값:
- `MONGODB_URI`
- `GITHUB_TOKEN`
- `GEMINI_API_KEY`

## 3) 설치
```bash
npm install
```

## 4) 실행
클라이언트(Vite):
```bash
npm run dev --workspace @commit-to-blog/client
```

서버(Express):
```bash
npm run dev --workspace @commit-to-blog/server
```

## 5) 구현 기능 현황
- Step1
  - 저장소 목록/커밋 목록/커밋 diff 조회 API 구현
  - 저장소/커밋 선택 UI + 로딩/에러/빈 상태 처리
- Step2
  - AI가 커밋 메시지/변경사항 기반 핵심 분석 포인트 생성
  - 분석 결과(핵심 포인트/요약/초안) 기반 작성 플로우 연동
- Step3
  - 분석 결과 기반 초안 생성
  - 마크다운 편집 + 프리뷰 UI
  - 포스트 저장/목록 조회/삭제 API
  - 저장 포스트 카드 목록 + 재편집/삭제 플로우

## 6) API 요약
- `GET /api/health`
- `GET /api/repos`
- `GET /api/commits?repo=owner/name`
- `GET /api/diff?repo=owner/name&sha=<commitSha>`
- `POST /api/analyze/start`
- `POST /api/interview/:sessionId/answer`
- `POST /api/interview/:sessionId/hint`
- `POST /api/interview/:sessionId/explain`
- `POST /api/interview/:sessionId/skip`
- `POST /api/posts`
- `GET /api/posts`
- `DELETE /api/posts/:postId`

## 7) 품질/안정성 메모
- 외부 API는 서버에서만 호출
- diff API 타임아웃(8초), 과대 diff 방어(파일 수/patch 길이 제한)
- 주요 입력에 Zod 검증 적용

## 8) 현재 알려진 이슈
- 서버 타입체크는 `@types/node`, `@types/express`, `db.ts` 타입 이슈로 실패 가능
- 런타임 기능 검증은 가능하지만 타입 안정성 정리는 별도 커밋 권장

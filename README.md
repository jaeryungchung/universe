# React Three Fiber Blob

우주 배경 위에서 고민을 포스트잇으로 만들고, 슬라임 Blob에 흡수시키며 인터랙션하는 Next.js 프로젝트입니다.

## 실행 방법

1. 의존성을 설치합니다.

```bash
npm install
```

2. 개발 서버를 실행합니다.

```bash
npm run dev
```

3. 브라우저에서 아래 주소를 엽니다.

```text
http://localhost:3000
```

## 할 수 있는 것

- 빈 배경을 클릭해 텍스트를 입력하고 `Enter`로 포스트잇을 만들기
- 포스트잇을 드래그해서 자유롭게 옮기고 Blob 안으로 드롭하기
- 드롭 시 포스트잇이 찢어지고, 텍스트와 파티클이 Blob 안으로 빨려 들어가는 효과 보기
- Blob 색이 흡수된 뒤 클릭 3번 또는 1분 뒤 자동으로 흰색으로 정화되는 흐름 보기
- Blob을 여러 번 눌러 응원 문구 받기
- 우하단 음악 아이콘에서 배경음악 재생, 트랙 변경, 음량 조절하기
- 좌하단 도움말 아이콘에 마우스를 올려 사용 방법 보기

## 스크립트

```bash
npm run dev
npm run build
npm run start
npm run lint
```

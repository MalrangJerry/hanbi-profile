# 한비 프로필 사이트 - 프로필 카드 개선 버전

반영 내용:
- 대표 이모지 / 대표 색을 한 카드 안에서 반반 분할
- 프로필 정보 카드 디자인 개선
  - 라벨은 작고 얇은 배지 스타일
  - 내용은 더 크고 굵게
  - 보조 설명은 작은 회색 텍스트
- 일정 탭은 구글 캘린더 iframe을 더 깔끔한 외곽 디자인으로 감쌈
- 커스텀 캘린더 구현 방식 안내 카드 추가

GIF 상태:
- 현재 첨부된 GIF 프레임 수: 1
- 1프레임이면 실제 애니메이션이 없는 GIF입니다.
- 진짜 움직이는 GIF 원본을 받으면 assets/hanbi-profile.gif 교체만 하면 됩니다.

SOOP 공지글 iframe 예시:

<p>
  <iframe
    src="https://네주소.pages.dev/"
    width="100%"
    height="1450"
    frameborder="0"
    style="border:0; overflow:hidden;">
  </iframe>
</p>


최신 GIF 교체 결과:
- 파일명: assets/hanbi-profile.gif
- 프레임 수: 1
- 이미지 크기: 190x190
- loop 값: None
- duration 샘플: [0]


# 커스텀 캘린더 연동 버전

이번 버전은 Cloudflare Pages Functions를 사용합니다.

필수 구조:
- schedule/index.html
- functions/api/calendar.js

배포 방법:
1. 이 폴더 전체를 GitHub 저장소에 업로드
2. Cloudflare Pages에서 해당 저장소 연결
3. Framework preset은 None 또는 Static site
4. Build command는 비워두기
5. Output directory는 / 또는 비워두기
6. 배포 후 /schedule/ 접속

동작 방식:
- /schedule/ 페이지가 /api/calendar를 호출
- functions/api/calendar.js가 Google Calendar 공개 ICS를 fetch
- 성공하면 커스텀 파스텔 캘린더 + UPCOMING 카드 표시
- 실패하면 Google Calendar iframe fallback 표시

사용 중인 추정 ICS:
https://calendar.google.com/calendar/ical/imhanbily%40gmail.com/public/basic.ics

주의:
- 스트리머 캘린더가 공개되어 있어야 커스텀 연동이 됩니다.
- 공개가 아니면 iframe fallback만 표시됩니다.
- 반복 일정 RRULE은 DAILY/WEEKLY/MONTHLY 기본 케이스만 처리합니다.


# 최종 디자인 수정 반영
- 프로필 카드 라벨을 한글로 변경
- 대표 이모지 / 대표 색은 한 카드 반반 구성 유지
- 좋아하는 것 / 싫어하는 것 / 한비 스타일 카드의 텍스트 확대 및 이모티콘 숨김
- 밈 '2222' 숫자 전용 스타일 적용
- 방송 정보 문구 및 팬 이름 설명 수정
- 일정 캘린더의 00:00 표기를 숨겨 가독성 개선
- 기록 날짜를 '2024년 12월 19일' 형식으로 변경

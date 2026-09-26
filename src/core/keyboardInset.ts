// 휴대폰에서 키보드가 올라오면(특히 아이폰) 화면 아래쪽에 고정된 채팅창이 키보드에 가려진다.
// 실제로 보이는 영역(visualViewport)과 전체 화면의 차이를 재서 CSS 변수(--rd-kb)로 알려주고,
// 채팅창은 이 값만큼 위로 올라오게 한다.
let installed = false;

export function installKeyboardInset(): void {
  if (installed) return;
  installed = true;

  const viewport = window.visualViewport;
  if (!viewport) return;

  const update = (): void => {
    const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--rd-kb', `${Math.round(covered)}px`);
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  update();
}

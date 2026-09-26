let shown = 0;
const MAX_BANNERS = 3;
const seen = new Set<string>();

function show(message: string): void {
  const text = message.slice(0, 160);
  if (shown >= MAX_BANNERS || seen.has(text)) return;
  seen.add(text);
  shown += 1;

  const banner = document.createElement('div');
  banner.style.cssText =
    'position:fixed;left:8px;right:8px;top:calc(8px + env(safe-area-inset-top));z-index:2000;padding:8px 12px;border-radius:10px;' +
    'background:rgba(90,20,20,0.95);border:1px solid #ff9a9a;color:#ffdede;font:12px/1.4 sans-serif;word-break:break-all;';
  banner.textContent = `⚠ 오류가 발생했어요 (누르면 닫혀요): ${text}`;
  banner.addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
  window.setTimeout(() => banner.remove(), 15000);
}

export function installErrorBanner(): void {
  window.addEventListener('error', (event) => {
    // 글꼴·이미지 같은 자원 불러오기 실패는 게임 진행과 무관해서 건너뛴다
    if (!event.error && !event.message) return;
    show(event.message || String(event.error));
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    show(reason instanceof Error ? reason.message : String(reason));
  });
}

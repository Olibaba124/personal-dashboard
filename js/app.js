// ============ Tab navigation ============
function initTabs(triggerSelector, panelPrefix, dataAttr) {
  const triggers = document.querySelectorAll(triggerSelector);
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const target = trigger.getAttribute(dataAttr);

      triggers.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      trigger.classList.add("active");
      trigger.setAttribute("aria-selected", "true");

      document.querySelectorAll(`.${panelPrefix}`).forEach((panel) => {
        panel.classList.remove("active");
      });
      document.getElementById(target).classList.add("active");
    });
  });
}

// ============ Stock ticker (Phase 0: hardcoded watchlist, static numbers) ============
const WATCHLIST = [
  { symbol: "SPY", price: "641.23", delta: "+0.34%", up: true },
  { symbol: "QQQ", price: "572.88", delta: "+0.61%", up: true },
  { symbol: "AAPL", price: "231.10", delta: "-0.12%", up: false },
  { symbol: "NVDA", price: "178.44", delta: "+1.05%", up: true },
  { symbol: "VNQ", price: "88.02", delta: "-0.28%", up: false },
  { symbol: "BTC-USD", price: "112,340", delta: "+2.14%", up: true },
];

function renderTicker() {
  const track = document.getElementById("ticker-track");
  const items = WATCHLIST.map((item) => tickerItemHTML(item)).join("");
  // duplicate content so the scroll loop is seamless
  track.innerHTML = items + items;
}

function tickerItemHTML(item) {
  const deltaClass = item.up ? "ticker-delta--up" : "ticker-delta--down";
  const arrow = item.up ? "▲" : "▼";
  return `
    <span class="ticker-item">
      <span class="ticker-symbol">${item.symbol}</span>
      <span class="ticker-price">${item.price}</span>
      <span class="${deltaClass}">${arrow}${item.delta}</span>
    </span>
  `;
}

// ============ Greeting ============
function renderGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  document.getElementById("greeting-text").textContent = `${greeting}, Oliver`;
  document.getElementById("greeting-meta").textContent = dateStr;
}

// ============ Entry point — called by auth.js once login succeeds ============
window.initDashboard = function initDashboard() {
  initTabs(".tab", "tab-panel", "data-tab");
  initTabs(".subtab", "subtab-panel", "data-subtab");
  renderTicker();
  renderGreeting();

  const captureInput = document.getElementById("capture-input");
  if (captureInput) {
    captureInput.focus();
  }
};

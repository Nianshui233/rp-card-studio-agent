function renderChrome() {
  const data = AppState.data || {};
  document.querySelector("#time").textContent = text(data.time, "时间未明");
  document.querySelector("#weather").textContent = text(data.weather, "天气未明");
  document.querySelector("#location").textContent = text(data.location, "位置未明");
  document.querySelector("#noise").textContent = text(data.noise, "周围安静");
}

function renderRoom() {
  const data = AppState.data || {};
  const entries = Object.entries(data.room || {});
  document.querySelector("#roomMetrics").innerHTML = entries.length ? entries.map(([key, value]) => `<div class="metric"><span>${key}</span><strong>${text(value)}</strong></div>`).join("") : '<div class="empty">暂无房间状态</div>';
  document.querySelector("#situation").textContent = text(data.situation, "雨夜仍在继续，暂时没有新的动静。");
}

function renderGuests() {
  const guests = Array.isArray(AppState.data?.guests) ? AppState.data.guests : [];
  const keyword = AppState.filter.trim();
  const filtered = guests.filter(guest => `${guest.name}${guest.role}${guest.relation}${guest.state}${guest.secret}`.includes(keyword));
  document.querySelector("#guestList").innerHTML = filtered.length ? filtered.map(guest => `<article class="guest-card"><header><h3>${text(guest.name)}</h3><span>${text(guest.relation, "关系未明")}</span></header><p>${text(guest.role)} · ${text(guest.state)}</p><details><summary>已知心事</summary>${text(guest.secret, "尚不了解")}</details><button data-action="找${text(guest.name)}交谈">与其交谈</button></article>`).join("") : '<div class="empty">暂无匹配住客</div>';
}

function renderEvents() {
  const events = Array.isArray(AppState.data?.events) ? AppState.data.events : [];
  document.querySelector("#eventList").innerHTML = events.length ? events.map(event => `<article class="event-card"><h3>${text(event.name, "未名事件")}</h3><p>下一步：${text(event.next, "等待推进")}</p><span class="event-stage">${text(event.stage, "潜伏")}</span></article>`).join("") : '<div class="empty">暂无正在推进的事件</div>';
}

function renderAll() { renderChrome(); renderRoom(); renderGuests(); renderEvents(); }
function showView(name) {
  AppState.currentView = name;
  document.querySelectorAll(".view,.tab").forEach(node => node.classList.remove("active"));
  document.querySelector(`#view-${name}`)?.classList.add("active");
  document.querySelector(`.tab[data-view="${name}"]`)?.classList.add("active");
}

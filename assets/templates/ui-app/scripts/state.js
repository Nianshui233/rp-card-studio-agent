const AppState = {
  data: null,
  mode: "loading",
  currentView: "overview",
};

function leaf(value, fallback = "—") {
  if (Array.isArray(value)) return value.length ? value[0] : fallback;
  return value === undefined || value === null || value === "" ? fallback : value;
}

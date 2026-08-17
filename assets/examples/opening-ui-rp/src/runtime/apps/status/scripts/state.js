const AppState = { data: null, currentView: "room", filter: "" };
const text = (value, fallback = "—") => value === undefined || value === null || value === "" ? fallback : String(value);

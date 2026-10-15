const PRODUCTION_API = "https://heartsreader-backend.onrender.com/api";
const LOCAL_API = "http://localhost:5000/api";

const BASE_URL = (() => {
  if (typeof window === "undefined") return LOCAL_API;
  // Optional manual override (set window.CH_API_URL before this script loads)
  if (window.CH_API_URL) return window.CH_API_URL;
  const host = window.location.hostname;
  const isLocal =
    ["localhost", "127.0.0.1", ""].includes(host) || window.location.protocol === "file:";
  if (isLocal) {
    try {
      return window.localStorage?.getItem("ch_api_url") || LOCAL_API;
    } catch (e) {
      return LOCAL_API;
    }
  }
  return PRODUCTION_API;
})();

export default BASE_URL;

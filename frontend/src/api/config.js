const BASE_URL =
  (typeof window !== "undefined" &&
    (window.CH_API_URL ||
      (["localhost", "127.0.0.1", ""].includes(window.location.hostname) || window.location.protocol === "file:" ? window.localStorage?.getItem("ch_api_url") : "") ||
      (["thecrossedhearts.com", "www.thecrossedhearts.com"].includes(window.location.hostname)
        ? "https://crossed-hearts-final.onrender.com/api"
        : window.location.hostname === "crossed-hearts.onrender.com"
          ? "https://crossed-hearts-final.onrender.com/api"
        :
      (["localhost", "127.0.0.1", ""].includes(window.location.hostname) ||
      window.location.protocol === "file:"
        ? "http://localhost:5000/api"
        : "https://crossed-hearts-final.onrender.com/api")))) ||
  "http://localhost:5000/api";

export default BASE_URL;

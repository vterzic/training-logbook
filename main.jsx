import { createRoot } from "react-dom/client";
import App from "./App.jsx";

window.storage = {
  get: async (k) => ({ value: localStorage.getItem(k) }),
  set: async (k, v) => { localStorage.setItem(k, v); },
};

createRoot(document.getElementById("root")).render(<App />);

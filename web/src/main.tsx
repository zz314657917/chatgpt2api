import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import "@/app/globals.css";
import { applyColorTheme, getPreferredColorTheme } from "@/lib/theme";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("页面根节点 #root 不存在");
}

applyColorTheme(getPreferredColorTheme());

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

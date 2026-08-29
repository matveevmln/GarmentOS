import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
// Шрифты — self-hosted (@fontsource), не Google Fonts CDN: приложение не
// зависит от внешней сети в проде. Onest — переменный, покрывает все
// используемые начертания одним файлом; IBM Plex Mono — только 400/500/600,
// нужны для цифр (суммы, количества, номера).
import "@fontsource-variable/onest";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./design-system/Tokens/tokens.css";

const container = document.getElementById("root");
if (!container) throw new Error("Не найден элемент #root");

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

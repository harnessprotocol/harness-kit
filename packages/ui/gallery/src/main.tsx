import React from "react";
import ReactDOM from "react-dom/client";
import { injectTokens } from "./tokens-bootstrap";
import "@harness-kit/ui/styles.css";
import { Gallery } from "./Gallery";

injectTokens();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>
);

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { detectRuntime } from "./app/runtime";
import "./app/app.css";

document.documentElement.dataset.platform =
  detectRuntime() === "desktop" ? "desktop" : "web";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);


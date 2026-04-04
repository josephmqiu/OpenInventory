import React from "react";
import ReactDOM from "react-dom/client";
import "./app/i18n";
import { QuickIssueApp } from "./issue/QuickIssueApp";
import "./issue/issue.css";

document.documentElement.dataset.platform = "mobile";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuickIssueApp />
  </React.StrictMode>,
);

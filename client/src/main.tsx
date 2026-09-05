import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./lab-02/styles/zen-green.css";
import { RequesterProvider } from "./lab-02/RequesterContext.js";
import { AppRoutes } from "./lab-02/AppRoutes.js";

// RequesterProvider sits ABOVE the router so the selected Requester survives
// navigation. AppShell wraps only the Lab 2 routes; /lab-01 renders outside it
// so the Lab 1 slice is unchanged (A-04).

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RequesterProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </RequesterProvider>
  </React.StrictMode>
);

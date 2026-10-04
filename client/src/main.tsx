import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "./lab-02/styles/zen-green.css";
import { AuthProvider } from "./lab-03/AuthContext.js";
import { AppRoutes } from "./lab-03/AppRoutes.js";

// AuthProvider sits ABOVE the router so the signed-in user survives
// navigation, as the Lab 2 RequesterProvider did. AppShell wraps only the
// authenticated routes; /lab-01 renders outside it so the Lab 1 slice is
// unchanged (A-04).

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);

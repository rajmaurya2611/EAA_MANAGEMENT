// src/RouterWrapper.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import routes from "./routes"; // Import routes

function RouterWrapper() {
  return (
    <Router>
      <Routes>
        {routes.map((route, index) => (
          <Route key={index} path={route.path} element={route.element} />
        ))}
      </Routes>
    </Router>
  );
}

export default RouterWrapper;

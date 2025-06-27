import { RouteObject }     from "react-router-dom";
import { Navigate }        from "react-router-dom";
import Login               from "../pages/loginPage";
import Home                from "../pages/home";
import ProtectedRoute      from "./ProtectedRoutes";

const routes: RouteObject[] = [
  { path: "/",    element: <Login /> },
  {
    path: "/home",
    element: (
      <ProtectedRoute>
        <Home />
      </ProtectedRoute>
    )
  },
  { path: "*",    element: <Navigate to="/" replace /> },
];

export default routes;

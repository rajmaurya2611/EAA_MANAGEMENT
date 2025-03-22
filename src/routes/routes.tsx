// src/routes.ts
import { RouteObject } from "react-router-dom"; // Import RouteObject for type safety
import Login from "../pages/loginPage";
import Home from "../pages/home";
import { Navigate } from "react-router-dom"; // Ensure Navigate is imported

// Define an array of route objects with proper typing
const routes: RouteObject[] = [
  { path: "/", element: <Login /> }, // Wrap Login component with JSX syntax
  { path: "/home", element: <Home /> }, // Wrap Home component with JSX syntax
  { path: "*", element: <Navigate to="/" /> }, // Redirect for unknown routes
];

export default routes;

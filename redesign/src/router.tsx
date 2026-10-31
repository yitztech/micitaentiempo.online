import { createBrowserRouter, type RouteObject } from "react-router";
import { AuthLayout } from "@/components/layout/auth-layout";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PublicLayout } from "@/components/layout/public-layout";
import { ForgotPassword, ResetPassword, SignIn, SignUp } from "@/pages/auth";
import Account from "@/pages/dashboard/account";
import AiIntegrations from "@/pages/dashboard/ai";
import Billing from "@/pages/dashboard/billing";
import BusinessProfile from "@/pages/dashboard/business-profile";
import CalendarPage from "@/pages/dashboard/calendar";
import Customers from "@/pages/dashboard/customers";
import Notices from "@/pages/dashboard/notices";
import NotificationSettings from "@/pages/dashboard/notification-settings";
import Overview from "@/pages/dashboard/overview";
import Directory from "@/pages/directory";
import Features from "@/pages/features";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import Pricing from "@/pages/pricing";

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "funciones", element: <Features /> },
      { path: "precios", element: <Pricing /> },
      { path: "directorio", element: <Directory /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: "ingresar", element: <SignIn /> },
      { path: "registro", element: <SignUp /> },
      { path: "recuperar", element: <ForgotPassword /> },
      { path: "restablecer", element: <ResetPassword /> },
    ],
  },
  {
    path: "panel",
    element: <DashboardLayout />,
    children: [
      { index: true, element: <Overview /> },
      { path: "calendario", element: <CalendarPage /> },
      { path: "clientes", element: <Customers /> },
      { path: "avisos", element: <Notices /> },
      { path: "preferencias-avisos", element: <NotificationSettings /> },
      { path: "negocio", element: <BusinessProfile /> },
      { path: "facturacion", element: <Billing /> },
      { path: "ia", element: <AiIntegrations /> },
      { path: "cuenta", element: <Account /> },
    ],
  },
];

export const router = () => createBrowserRouter(routes);

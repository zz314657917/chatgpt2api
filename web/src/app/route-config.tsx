import { lazy, type ComponentType } from "react";

const routePageComponents = {
  accounts: lazy(() => import("@/app/accounts/page")),
  linuxDoCallback: lazy(() => import("@/app/auth/linuxdo/callback/page")),
  sub2APILaunch: lazy(() => import("@/app/auth/sub2api/launch/page")),
  canvas: lazy(() => import("@/app/canvas/page")),
  image: lazy(() => import("@/app/image/page")),
  imageManager: lazy(() => import("@/app/image-manager/page")),
  home: lazy(() => import("@/app/page")),
  login: lazy(() => import("@/app/login/page")),
  logs: lazy(() => import("@/app/logs/page")),
  profile: lazy(() => import("@/app/profile/page")),
  rbac: lazy(() => import("@/app/rbac/page")),
  register: lazy(() => import("@/app/register/page")),
  settings: lazy(() => import("@/app/settings/page")),
  users: lazy(() => import("@/app/users/page")),
};

export type AppRouteConfig = {
  path: string;
  Component: ComponentType;
  requiredPath?: string;
};

export const appRoutes: AppRouteConfig[] = [
  { path: "/", Component: routePageComponents.home },
  { path: "/login", Component: routePageComponents.login },
  { path: "/auth/linuxdo/callback", Component: routePageComponents.linuxDoCallback },
  { path: "/auth/sub2api/launch", Component: routePageComponents.sub2APILaunch },
  { path: "/api/v1/auths/sub2api/launch", Component: routePageComponents.sub2APILaunch },
  { path: "/accounts", Component: routePageComponents.accounts, requiredPath: "/accounts" },
  { path: "/register", Component: routePageComponents.register, requiredPath: "/register" },
  { path: "/image-manager", Component: routePageComponents.imageManager, requiredPath: "/image-manager" },
  { path: "/users", Component: routePageComponents.users, requiredPath: "/users" },
  { path: "/profile", Component: routePageComponents.profile, requiredPath: "/profile" },
  { path: "/rbac", Component: routePageComponents.rbac, requiredPath: "/rbac" },
  { path: "/logs", Component: routePageComponents.logs, requiredPath: "/logs" },
  { path: "/settings", Component: routePageComponents.settings, requiredPath: "/settings" },
  { path: "/image", Component: routePageComponents.image, requiredPath: "/image" },
  { path: "/canvas", Component: routePageComponents.canvas, requiredPath: "/canvas" },
  { path: "*", Component: routePageComponents.home },
];

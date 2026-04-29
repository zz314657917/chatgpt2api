import { Toaster } from "sonner";
import {
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
  type Variants,
} from "motion/react";

import AccountsPage from "@/app/accounts/page";
import LinuxDoCallbackPage from "@/app/auth/linuxdo/callback/page";
import HomePage from "@/app/page";
import ImagePage from "@/app/image/page";
import ImageManagerPage from "@/app/image-manager/page";
import LoginPage from "@/app/login/page";
import LogsPage from "@/app/logs/page";
import RegisterPage from "@/app/register/page";
import SettingsPage from "@/app/settings/page";
import UsersPage from "@/app/users/page";
import { TopNav } from "@/components/top-nav";

const routeTransition: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

const reducedRouteTransition: Transition = {
  duration: 0.01,
};

const routeVariants: Variants = {
  initial: {
    opacity: 0,
    y: 12,
    scale: 0.995,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.998,
  },
};

const reducedRouteVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

function AnimatedRoutes() {
  const location = useLocation();
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={prefersReducedMotion ? reducedRouteVariants : routeVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={prefersReducedMotion ? reducedRouteTransition : routeTransition}
        className="min-w-0"
      >
        <Routes location={location}>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/linuxdo/callback" element={<LinuxDoCallbackPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/image-manager" element={<ImageManagerPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/image" element={<ImagePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <>
      <Toaster position="top-center" richColors offset={48} />
      <main className="min-h-screen bg-background text-foreground">
        <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-5 px-3 py-3 sm:px-5 lg:px-6">
          <TopNav />
          <AnimatedRoutes />
        </div>
      </main>
    </>
  );
}

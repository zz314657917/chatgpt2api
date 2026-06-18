"use client";

import { Navigate } from "react-router-dom";

export default function ImageArenaRedirectPage() {
  return <Navigate to="/image?new=arena" replace />;
}

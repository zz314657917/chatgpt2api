"use client";

import type { StoredAuthSession } from "@/store/auth";

const INTERNAL_SUB2API_ID_PATTERN = /^sub2api:\S+$/i;

export function publicDisplayText(value?: string | null) {
  const text = String(value || "").trim();
  if (!text || INTERNAL_SUB2API_ID_PATTERN.test(text)) {
    return "";
  }
  return text;
}

export function accountDisplayName(session: StoredAuthSession, fallback = "落叶AI用户") {
  return publicDisplayText(session.name) ||
    publicDisplayText(session.sub2api?.user_name) ||
    publicDisplayText(session.sub2api?.user_email) ||
    fallback;
}

export function accountDisplayLabel(session: StoredAuthSession, fallback = "落叶AI账户") {
  return publicDisplayText(session.sub2api?.user_email) ||
    publicDisplayText(session.sub2api?.user_name) ||
    publicDisplayText(session.name) ||
    fallback;
}

export function editableAccountName(session: StoredAuthSession) {
  return publicDisplayText(session.name);
}

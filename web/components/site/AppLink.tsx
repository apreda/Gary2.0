"use client";
import { AppStoreButton } from "@/components/AppStoreButton";
export function AppLink({ surface = "home_app_section" }: { surface?: string }) {
  return <AppStoreButton surface={surface} />;
}

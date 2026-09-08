"use client";
import {
  appStoreHandoffPath,
  beginAppStoreHandoff,
} from "@/lib/gary/analytics";
import { Icon } from "./Icon";
export function AppLink({ store = false }: { store?: boolean }) {
  return (
    <a
      className={store ? "site-store" : "site-button site-button-gold"}
      href={appStoreHandoffPath("home_app_section")}
      onClick={(e) => {
        e.currentTarget.href = beginAppStoreHandoff("home_app_section");
      }}
    >
      <Icon name="phone" size={store ? 30 : 20} />
      {store ? (
        <span>
          <small>Download on the</small>
          <strong>App Store</strong>
        </span>
      ) : (
        "Get the Free App"
      )}
      <Icon />
    </a>
  );
}

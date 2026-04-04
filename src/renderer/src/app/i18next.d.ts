import "i18next";
import type { i18nResources } from "./i18nResources";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    resources: typeof i18nResources.en;
  }
}

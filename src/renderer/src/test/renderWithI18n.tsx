import type { ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import type { Language } from "../domain/models";
import { setAppLanguage } from "../app/i18n";

export function renderWithI18n(
  ui: ReactElement,
  language: Language = "en",
  options?: RenderOptions,
) {
  setAppLanguage(language);
  return render(ui, options);
}

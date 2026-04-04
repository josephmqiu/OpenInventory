import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../app/i18n";
import { AuditFilterBar } from "./AuditFilterBar";

afterEach(cleanup);

describe("AuditFilterBar", () => {
  it("localizes the all-personnel option in Chinese", () => {
    render(
      <AuditFilterBar
        language="zh-CN"
        personnel={[{ id: "p1", name: "张三" }]}
        filters={{ page: 1, pageSize: 50 }}
        onFiltersChange={vi.fn()}
        disabled={false}
      />,
    );

    expect(screen.getByRole("option", { name: "全部" })).toBeTruthy();
  });
});

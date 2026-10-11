import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useState } from "react";
import { TimeInput, parseTime } from "./components/TimeInput";
import { formatTime } from "./ui-model";
import { formatFrames } from "./frame-timing";

it("formats elapsed time as hours/minutes/seconds, including hour rollover", () => {
  expect([0, 999, 1000, 3599999, 3600000, 90061000].map(formatTime)).toEqual(["00:00:00", "00:00:00", "00:00:01", "00:59:59", "01:00:00", "25:01:01"]);
  expect(formatFrames(109801)).toBe("01:01:00");
  expect(parseTime("01:02:03")).toBe(3723000);
  expect(parseTime("00:00:00.967")).toBe(967);
  for (const bad of ["01:60:00", "00:00:60", "-01:00:00", "NaN", "1", "00:00:00.1234"]) expect(parseTime(bad)).toBeNull();
});
it.each([true, false])("preserves exact hidden precision on focus/blur/unchanged text and fine navigation (grid=%s)", grid => {
  const initial = grid ? 31 : 1037;
  function Fixture() { const [value, set] = useState(String(initial)); return <><TimeInput aria-label="time" grid={grid} value={value} onValue={set} /><output data-testid="exact">{value}</output></>; }
  render(<Fixture />); const input = screen.getByLabelText("time");
  expect((input as HTMLInputElement).value).toBe("00:00:01");
  fireEvent.focus(input); fireEvent.blur(input);
  fireEvent.change(input, { target: { value: "00:00:01" } });
  expect(screen.getByTestId("exact").textContent).toBe(String(initial));
  fireEvent.keyDown(input, { key: "ArrowUp" }); expect(screen.getByTestId("exact").textContent).toBe(String(initial+1));
  fireEvent.keyDown(input, { key: "ArrowDown" }); expect(screen.getByTestId("exact").textContent).toBe(String(initial));
  fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true }); expect(screen.getByTestId("exact").textContent).toBe(String(initial+(grid?30:1000)));
  fireEvent.change(input, { target: { value: "00:00:03" } }); expect(screen.getByTestId("exact").textContent).toBe(grid?"90":"3000");
});

it("Escape resets both the owning frame draft and focused visible text", () => {
  function Fixture() { const [value, set] = useState("29"); return <TimeInput aria-label="time" grid value={value} onValue={set} onKeyDown={event => { if (event.key === "Escape") set("29"); }} />; }
  render(<Fixture />); const input = screen.getByLabelText("time") as HTMLInputElement;
  input.focus(); fireEvent.change(input, { target: { value: "00:00:00.800" } }); fireEvent.keyDown(input, { key: "Escape" });
  expect(input.value).toBe("00:00:00"); expect(document.activeElement).toBe(input);
});

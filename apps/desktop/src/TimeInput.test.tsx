import { fireEvent, render, screen, act } from "@testing-library/react";
import { expect, it } from "vitest";
import { useState } from "react";
import { TimeInput, parseTime } from "./components/TimeInput";
import { formatTime, formatPreciseTime } from "./ui-model";
import { formatFrames, MAX_CFR30_FRAME } from "./frame-timing";

it("uses a short clock below one hour and hours for a long owning duration", () => {
  expect([0, 999, 1000, 3599999, 3600000, 90061000].map(ms => formatTime(ms))).toEqual(["00:00", "00:00", "00:01", "59:59", "01:00:00", "25:01:01"]);
  expect(formatTime(1000, 3600000)).toBe("00:00:01");
  expect(formatTime(1000, 3599999)).toBe("00:01");
  expect(formatFrames(109801)).toBe("01:01:00");
  expect(formatPreciseTime(966.6666666667)).toBe("00:00,97");
  expect(formatPreciseTime(3599966.666666667, 3600000)).toBe("00:59:59,97");
  expect(parseTime("01:02:03")).toBe(3723000);
  expect(parseTime("02:03,967")).toBe(123967);
  expect(parseTime("00:00:00.967")).toBe(967);
  for (const bad of ["01:60:00", "00:60", "60:00", "00:00:60", "-01:00:00", "NaN", "1", "00:00:00.1234"]) expect(parseTime(bad)).toBeNull();
});
it.each([true, false])("preserves exact precision on focus/blur/unchanged text and fine navigation (grid=%s)", grid => {
  const initial = grid ? 31 : 1037;
  function Fixture() { const [value, set] = useState(String(initial)); return <><TimeInput aria-label="time" grid={grid} value={value} onValue={set} /><output data-testid="exact">{value}</output></>; }
  render(<Fixture />); const input = screen.getByLabelText("time") as HTMLInputElement;
  expect(input.value).toBe(grid ? "00:01,03" : "00:01,04");
  fireEvent.focus(input); expect(input.value).toBe(grid ? "00:01,03" : "00:01,04");
  fireEvent.blur(input); expect(input.value).toBe(grid ? "00:01,03" : "00:01,04");
  fireEvent.change(input, { target: { value: grid ? "00:01,03" : "00:01,04" } });
  expect(screen.getByTestId("exact").textContent).toBe(String(initial));
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowUp" }); expect(screen.getByTestId("exact").textContent).toBe(String(initial+1));
  expect(input.value).toBe(grid ? "00:01,07" : "00:01,04");
  fireEvent.keyDown(input, { key: "ArrowDown" }); expect(screen.getByTestId("exact").textContent).toBe(String(initial));
  fireEvent.keyDown(input, { key: "ArrowUp", shiftKey: true }); expect(screen.getByTestId("exact").textContent).toBe(String(initial+(grid?30:1000)));
  fireEvent.change(input, { target: { value: "00:03" } }); expect(screen.getByTestId("exact").textContent).toBe(grid?"90":"3000");
});
it.each([1, 2, 5, 29, 30, 31, 107999])("preserves rounded display at exact frame %s and validates the converted maximum", initial => {
  function Fixture() { const [value, set] = useState(String(initial)); return <><TimeInput aria-label="time" grid value={value} maximum={initial} durationMs={3600000} onValue={set} /><output data-testid="exact">{value}</output></>; }
  render(<Fixture />); const input = screen.getByLabelText("time") as HTMLInputElement;
  const expected = formatPreciseTime(initial*1000/30,3600000);
  fireEvent.focus(input); expect(input.value).toBe(expected);
  fireEvent.change(input, { target: { value: expected } }); fireEvent.blur(input);
  expect(screen.getByTestId("exact").textContent).toBe(String(initial));
  fireEvent.focus(input);fireEvent.change(input,{target:{value:expected.replace(',', '.')}});
  expect(screen.getByTestId("exact").textContent).toBe(String(initial));
});
it("fine navigation crosses the hour boundary without changing owning precision", () => {
  function Fixture() { const [value,set]=useState("107999");return <><TimeInput aria-label="time" grid durationMs={7200000} value={value} onValue={set}/><output data-testid="exact">{value}</output></>; }
  render(<Fixture/>);const input=screen.getByLabelText('time') as HTMLInputElement;
  fireEvent.focus(input);expect(input.value).toBe('00:59:59,97');fireEvent.keyDown(input,{key:'ArrowUp'});
  expect(input.value).toBe('01:00:00,00');expect(screen.getByTestId('exact').textContent).toBe('108000');
});
it("Escape restores the owning frame and focused precise text without converting it", () => {
  function Fixture() { const [value, set] = useState("29"); return <TimeInput aria-label="time" grid value={value} onValue={set} onKeyDown={event => { if (event.key === "Escape") set("29"); }} />; }
  render(<Fixture />); const input = screen.getByLabelText("time") as HTMLInputElement;
  act(()=>input.focus());fireEvent.change(input, { target: { value: "00:00,800" } }); fireEvent.keyDown(input, { key: "Escape" });
  expect(input.value).toBe("00:00,97"); expect(document.activeElement).toBe(input);
  fireEvent.blur(input);expect(input.value).toBe("00:00,97");
});

it.each([true,false])("an empty or incomplete owning time draft remains editable (grid=%s)",grid=>{
 function Fixture(){const[value,set]=useState("29");return <TimeInput aria-label="time" grid={grid} value={value} onValue={set}/>;}
 render(<Fixture/>);const input=screen.getByLabelText("time") as HTMLInputElement;
 fireEvent.focus(input);fireEvent.change(input,{target:{value:""}});expect(input.value).toBe("");
 fireEvent.change(input,{target:{value:"00:"}});expect(input.value).toBe("00:");
 fireEvent.change(input,{target:{value:"00:01,000"}});fireEvent.blur(input);expect(input.value).toBe("00:01,00");
});

it.each([true, false])("explicitly removing fractions while focused changes the draft to a whole second (grid=%s)", grid => {
 function Fixture(){ const [value,set]=useState(grid?"31":"1037"); return <><TimeInput aria-label="time" grid={grid} value={value} onValue={set}/><output data-testid="exact">{value}</output></>; }
 render(<Fixture/>); const input=screen.getByLabelText("time");fireEvent.focus(input);
 fireEvent.change(input,{target:{value:"00:01"}});expect(screen.getByTestId("exact").textContent).toBe(grid?"30":"1000");
});
it("rejects a parseable time outside the CFR clock and bounds fine navigation at its last frame",()=>{
 function Fixture(){const[value,set]=useState(String(MAX_CFR30_FRAME));return <><TimeInput aria-label="time" grid value={value} onValue={set}/><output data-testid="exact">{value}</output></>;}
 render(<Fixture/>);const input=screen.getByLabelText("time");fireEvent.focus(input);
 fireEvent.keyDown(input,{key:"ArrowUp",shiftKey:true});expect(screen.getByTestId("exact").textContent).toBe(String(MAX_CFR30_FRAME));
 expect(parseTime("999999999:00:00")).not.toBeNull();
 fireEvent.change(input,{target:{value:"999999999:00:00"}});expect(screen.getByTestId("exact").textContent).toBe("");
 fireEvent.change(input,{target:{value:"00:01,03"}});expect(screen.getByTestId("exact").textContent).toBe("31");
});

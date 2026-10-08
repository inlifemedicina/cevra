import {expect,it} from "vitest";
import {timelineGeometry,timelineRulerTicks} from "./timeline-geometry";
it("duration edits preserve time scale and keep presentation slack outside canonical duration",()=>{
 const short=timelineGeometry(5000,800,100),long=timelineGeometry(10000,800,100);
 expect(short.width/short.duration).toBe(long.width/long.duration);
 expect(short.duration).toBeGreaterThan(5000);expect(long.duration).toBeGreaterThan(10000);
});
it("labels maintain 90px separation at every supported zoom and remain bounded for long projects",()=>{
 for(const scale of [70,100,180,0.1,10000]) {
  const ticks=timelineRulerTicks(86_400_000,scale,1_000_000,1000);
  expect(ticks.length).toBeLessThanOrEqual(128);
  for(let i=1;i<ticks.length;i++)expect((ticks[i]-ticks[i-1])/30*scale).toBeGreaterThanOrEqual(90);
 }
});

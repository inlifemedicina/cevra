import {act,renderHook,waitFor} from "@testing-library/react";
import {expect,it,vi} from "vitest";
import type {DesktopBackend} from "./backend/desktop-backend";
import {useNativeMediaDrop} from "./native-media-drop";
it("busy admission defers a receipt, then acknowledges once without overlapping queries",async()=>{
 let busy=true;const handle=vi.fn(()=>!busy),query=vi.fn(async()=>({sequence:1,hovering:true,receiptId:"native-media-drop-1",fileCount:1}));
 const backend={getNativeMediaDropState:query,importDroppedMedia:vi.fn()} as unknown as DesktopBackend;
 const f=renderHook(()=>useNativeMediaDrop(backend,handle));await waitFor(()=>expect(handle).toHaveBeenCalled());
 busy=false;await waitFor(()=>expect(handle.mock.results.some(result=>result.value===true)).toBe(true));
 const count=handle.mock.calls.length;await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300));});expect(handle).toHaveBeenCalledTimes(count);f.unmount();
});
it("late native metadata after unmount cannot consume a receipt or update the surface",async()=>{
 let resolve!:(state:object)=>void;const handle=vi.fn(()=>true);
 const backend={getNativeMediaDropState:()=>new Promise(r=>{resolve=r;}),importDroppedMedia:vi.fn()} as unknown as DesktopBackend;
 const f=renderHook(()=>useNativeMediaDrop(backend,handle));f.unmount();
 await act(async()=>resolve({sequence:1,hovering:true,receiptId:"native-media-drop-1",fileCount:1}));expect(handle).not.toHaveBeenCalled();
});

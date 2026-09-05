import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import os from "node:os";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const base = args.url ?? "http://127.0.0.1:3317";
const output = path.resolve(args.output ?? "output/coastal-rebuild-01a07252/review");
const tier = args.tier ?? "high";
const views = [
  ["open-beach", 132, 70], ["shallows", 132, 80], ["vegetation-edge", 107, 60],
  ["settlement-edge", 85, 53], ["rocky-landing", 93, 69], ["harbor", 76, 66]
];
if (args.inland === "true") views.push(["starter-farm", -65, -55], ["river-bridge", -8, -5], ["headwaters", -29, -147], ["sunreach", 355, 58]);
const route = [[122,67],[113,61],[104,59],[94,54.5],[83,53],[73,54.5],[64.5,54.5],[73,54.5],[83,53],[88,58],[91,63],[93,68.5]];
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: args.headed !== "true" });
const errors = [];
const report = { browser: browser.version(), base, tier, hardware: { cpu: os.cpus()[0].model, memoryBytes: os.totalmem(), os: `${os.platform()} ${os.release()}` }, viewport: { width: 1440, height: 900, dpr: 1 }, views: [], errors };
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    ...(args.walk === "true" ? { recordVideo: { dir: output, size: { width: 1440, height: 900 } } } : {})
  });
  await context.addInitScript((quality) => localStorage.setItem("neva.graphics-quality.v1", quality), tier);
  const page = await context.newPage();
  const videoStartedAt = Date.now();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  const bootStart = Date.now();
  await page.goto(`${base}/?debug=1&debugStart=${args.scenario ?? "harbor"}&worldAcceptance=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__NEVA_DEBUG?.snapshot().bootReady, undefined, { timeout: 90000 });
  report.bootReadyMs = Date.now() - bootStart;
  await page.evaluate(({minute, weather, phase}) => {
    const debug = window.__NEVA_DEBUG;
    if (debug.setReviewEnvironment) debug.setReviewEnvironment({minute, weather, presentationTimeSeconds:phase});
    else debug.advanceGameMinutes(minute - debug.snapshot().currentMinute);
    const diagnostics = document.querySelector('[data-testid="diagnostics"]');
    if (diagnostics) diagnostics.style.display = "none";
  }, {minute: Number(args.minute ?? 720), weather: args.weather ?? "clear", phase: args.phase ? Number(args.phase) : null});
  await page.waitForTimeout(3500);
  if (await page.locator("vite-error-overlay").count()) throw new Error("Vite error overlay present; capture rejected");
  const compact = () => page.evaluate(() => {
    const debug = window.__NEVA_DEBUG;
    const d = debug.renderDiagnostics();
    return { camera: d.camera, presentation: d.presentation, viewport: d.viewport,
      world: { qualityTier: d.world.qualityTier, render: d.world.render, pipeline: d.world.pipeline }, snapshot: debug.snapshot() };
  });
  const held = new Set();
  const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); };
  const walkTo = async (x,z,deadline=Date.now()+25000) => {
    let reached=false;
    while(Date.now()<deadline) {
      const input=await page.evaluate(({x,z})=>{
        const p=window.__NEVA_DEBUG.snapshot().playerPosition,e=window.__NEVA_PROBE.camera.matrixWorld.elements;
        const dx=x-p.x,dz=z-p.z;
        return {distance:Math.hypot(dx,dz),forward:dx*-e[8]+dz*-e[10],right:dx*e[0]+dz*e[2]};
      },{x,z});
      if(input.distance<1.15){reached=true;break;}
      const keys=new Set();
      if(Math.abs(input.forward)>.35) keys.add(input.forward>0?"w":"s");
      if(Math.abs(input.right)>.35) keys.add(input.right>0?"d":"a");
      for(const key of held)if(!keys.has(key)){await page.keyboard.up(key);held.delete(key);}
      for(const key of keys)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
      await page.waitForTimeout(150);
    }
    await release();return reached;
  };
  const followRouteFor = async (seconds) => {
    const deadline=Date.now()+seconds*1000,points=[...route.slice(0,7),...route.slice(0,6).reverse(),[132,70]];
    const visited=[];let index=0;
    while(Date.now()<deadline){const [x,z]=points[index++%points.length]; const reached=await walkTo(x,z,Math.min(deadline,Date.now()+25000));visited.push({x,z,reached});if(!reached&&Date.now()<deadline-1000)throw new Error(`Profile route blocked at ${x},${z}`);}
    return visited;
  };
  report.gpuDevice = await page.evaluate(()=>{
    const gl=window.__NEVA_PROBE.renderer.getContext(),ext=gl.getExtension("WEBGL_debug_renderer_info");
    return {renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),userAgent:navigator.userAgent};
  });
  if (args.profile) {
    const seconds = Number(args.profile);
    const profileAnchor = args.profileAnchor === "harbor" ? {x:76,z:66} : {x:132,z:70};
    report.profileMode = args.profileRoute === "true" ? "normal-camera keyboard route" : "stationary normal camera";
    report.profileAnchor = profileAnchor;
    await page.evaluate(({x,z})=>window.__NEVA_DEBUG.teleport(x,z),profileAnchor);
    await page.waitForTimeout(5000);
    if(args.profileRoute === "true") report.warmupRoute = await followRouteFor(Number(args.warmup ?? 60));
    else await page.waitForTimeout(Number(args.warmup ?? 30)*1000);
    report.profiles=[];
    for(let repetition=0;repetition<Number(args.repeat ?? 1);repetition++) {
      await page.evaluate(({x,z})=>{const d=window.__NEVA_DEBUG;d.teleport(x,z);if(d.setReviewEnvironment)d.setReviewEnvironment({minute:720,weather:"clear",presentationTimeSeconds:null});},profileAnchor);
      await page.waitForTimeout(5000);
      const hostLoadBefore = os.loadavg();
      const measurement = page.evaluate(async (duration) => {
      const frames = [], diagnostics = []; let last = performance.now(), start = last, calls = 0, triangles = 0, nextDiagnostic=0;
      await new Promise((resolve) => {
        const frame = (now) => {
          if (now > last) frames.push(now - last); last = now;
          const render = window.__NEVA_PROBE.renderer.info.render;
          calls = Math.max(calls, render.calls); triangles = Math.max(triangles, render.triangles);
          if(now>=nextDiagnostic){diagnostics.push(window.__NEVA_DEBUG.renderDiagnostics().world.pipeline);nextDiagnostic=now+1000;}
          if (now - start >= duration * 1000) resolve(); else requestAnimationFrame(frame);
        }; requestAnimationFrame(frame);
      });
      frames.sort((a, b) => a - b);
      const at = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))];
      const textures=new Map();
      window.__NEVA_PROBE.scene.traverse(object=>{for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
        for(const value of Object.values(material)){if(value?.isTexture)textures.set(value.uuid,value);}
        // Three r174 stores Standard-material onBeforeCompile uniforms here;
        // direct material properties omit the terrain supporting maps.
        const compiled=window.__NEVA_PROBE.renderer.properties.get(material).uniforms;
        for(const uniform of Object.values(compiled ?? material.uniforms ?? {})){if(uniform.value?.isTexture)textures.set(uniform.value.uuid,uniform.value);}
      }});
      const textureEstimates=[...textures.values()].filter(t=>!t.isRenderTargetTexture&&!t.isDepthTexture).map(t=>{
        const image=t.image ?? {},pixels=(image.width ?? 0)*(image.height ?? 0),dataBytes=image.data?.byteLength;
        return {name:t.name,width:image.width,height:image.height,estimatedBytes:dataBytes ?? pixels*4*(t.generateMipmaps?4/3:1)};
      });
      const resourcesDuringSample = performance.getEntriesByType("resource").filter(r=>r.startTime>=start).map(r=>({name:r.name,durationMs:r.duration,transferBytes:r.transferSize}));
      return { seconds: duration, count: frames.length, frameMs: { p50: at(.5), p95: at(.95), p99: at(.99), max: frames.at(-1), over33ms:frames.filter(v=>v>33.8).length, over50ms:frames.filter(v=>v>50).length }, calls, triangles, diagnostics, textureEstimates, resourcesDuringSample,
        gpu: window.__NEVA_DEBUG.renderDiagnostics().world.pipeline.gpuTiming };
    }, seconds);
      // Keep the timed sampler alive if a legacy route is blocked, and retain
      // both outcomes before closing the browser (no dangling page promise).
      const [timing, traversal] = await Promise.allSettled([
        measurement, args.profileRoute === "true" ? followRouteFor(seconds) : Promise.resolve(undefined)
      ]);
      if(timing.status === "rejected") throw timing.reason;
      const routeError = traversal.status === "rejected" ? String(traversal.reason) : undefined;
      report.profiles.push({...timing.value, visited:traversal.status === "fulfilled" ? traversal.value : undefined, routeError, hostLoadBefore, hostLoadAfter:os.loadavg()});
      await fs.writeFile(path.join(output,"measurements.json"),JSON.stringify(report,null,2));
      console.info(JSON.stringify({tier,repetition:repetition+1,frameMs:report.profiles.at(-1).frameMs}));
      if(routeError)throw new Error(routeError);
    }
    report.profile=report.profiles[0];
  }
  if (args.shots !== "false") for (const [name, x, z] of views) {
    await page.evaluate(({ x, z }) => window.__NEVA_DEBUG.teleport(x, z), { x, z });
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    report.views.push({ name, diagnosticTeleport: true, ...await compact() });
  }
  if (args.walk === "true") {
    await page.evaluate(() => window.__NEVA_DEBUG.teleport(132, 70));
    await page.waitForTimeout(1500);
    report.walkthroughVideo = { startSeconds: (Date.now() - videoStartedAt) / 1000 };
    report.traversal = [];
    for (const [x,z] of route) {
      const reached = await walkTo(x,z);
      report.traversal.push({ target: {x,z}, reached, ...await compact() });
      if (!reached) break;
    }
    await page.screenshot({path:path.join(output,"walk-end.png")});
    report.walkthroughVideo.endSeconds = (Date.now() - videoStartedAt) / 1000;
  }
  if(args.weatherMatrix === "true") {
    report.weatherViews=[];
    for(const [label,minute,weather] of [["dawn",360,"clear"],["midday",720,"clear"],["evening",1080,"clear"],["rain",720,"light-rain"]]) {
      await page.evaluate(({minute,weather})=>window.__NEVA_DEBUG.setReviewEnvironment({minute,weather,presentationTimeSeconds:null}),{minute,weather});
      await page.waitForTimeout(3500);
      for(const [name,x,z] of [views[0],views[2],views[3]]) {
        await page.evaluate(({x,z})=>window.__NEVA_DEBUG.teleport(x,z),{x,z});await page.waitForTimeout(1400);
        await page.screenshot({path:path.join(output,`${label}-${name}.png`)});
        report.weatherViews.push({label,name,...await compact()});
      }
    }
  }
  if(args.interactions === "true"){
    report.interactions=[];
    const check=async(name,fn)=>{try{const detail=await fn();report.interactions.push({name,passed:true,detail});}catch(error){report.interactions.push({name,passed:false,error:String(error),snapshot:await snapshot(),dialogs:await page.getByRole("dialog").allTextContents()});}await page.screenshot({path:path.join(output,`interaction-${name}.png`)});};
    const snapshot=()=>page.evaluate(()=>window.__NEVA_DEBUG.snapshot());
    const teleport=async(x,z)=>{await page.evaluate(({x,z})=>window.__NEVA_DEBUG.teleport(x,z),{x,z});await page.waitForTimeout(1200);};
    const waitMode=mode=>page.waitForFunction(mode=>window.__NEVA_DEBUG.snapshot().mode===mode,mode,{timeout:8000});
    const escape=async()=>{if(await page.getByRole("dialog").count()||(await snapshot()).mode==="basic-fishing") {await page.keyboard.press("Escape");await page.waitForTimeout(500);}};
    await check("market",async()=>{
      await teleport(70,57);const before=await snapshot();await page.keyboard.press("e");
      await page.locator(".market-trading-modal").waitFor({state:"visible",timeout:8000});
      return {target:before.interactionTarget,dialog:await page.locator(".market-trading-modal").innerText()};
    });await escape();
    await check("silas",async()=>{
      await teleport(83,58.5);const before=await snapshot();await page.keyboard.press("e");await page.waitForTimeout(600);
      const after=await snapshot();if(!(await page.getByRole("dialog",{name:"Old Silas"}).isVisible()))throw new Error(JSON.stringify(after));return {before,after};
    });await escape();
    await check("shore-cast",async()=>{
      await teleport(93,69);await page.keyboard.press("Digit1");await page.waitForTimeout(350);await page.keyboard.press("e");
      await waitMode("basic-fishing");await page.keyboard.down("Space");await page.waitForTimeout(700);await page.keyboard.up("Space");
      const phases=[];let holding=false,caught=false;const deadline=Date.now()+35000;
      while(Date.now()<deadline){
        const fishing=(await snapshot()).basicFishing;if(!fishing)break;
        if(phases.at(-1)!==fishing.phase)phases.push(fishing.phase);
        if(fishing.phase==="caught"||fishing.phase==="escaped"){
          caught=fishing.phase==="caught";await page.keyboard.up("Space");holding=false;
          if(caught)await page.getByRole("button",{name:/^Collect/}).click();
          else await page.keyboard.press("Space");
          await waitMode("on-foot");break;
        }
        if(fishing.phase==="bite-reaction"){if(holding){await page.keyboard.up("Space");holding=false;}await page.keyboard.press("Space");}
        else if(fishing.phase==="minigame"){
          const target=Math.max(0,Math.min(1-fishing.barHeight,fishing.fishY-fishing.barHeight*.5));
          const projected=fishing.barY+(fishing.barVy ?? 0)*.45;
          const next=projected<target-.025?true:projected>target+.025?false:holding;
          if(next!==holding){await page.keyboard[next?"down":"up"]("Space");holding=next;}
        }await page.waitForTimeout(45);
      }
      await page.keyboard.up("Space");
      await page.waitForTimeout(700);if(!phases.includes("waiting-bite")&&!phases.includes("bite-reaction")&&!phases.includes("minigame"))throw new Error(JSON.stringify(phases));
      return {phases,caught,after:await snapshot()};
    });await escape();
    await check("fish-table",async()=>{
      await teleport(73,61.8);await walkTo(72,61.8);const before=await snapshot();
      if(!/Fish|Clean|Scraps/i.test(before.interactionTarget?.prompt ?? ""))throw new Error(JSON.stringify(before));
      await page.keyboard.press("e");await page.waitForTimeout(2500);const started=await snapshot();
      if(started.processingJobIds.length===0)throw new Error(`No processing job; caught fish required: ${JSON.stringify(started.interactionTarget)}`);
      await page.evaluate(()=>window.__NEVA_DEBUG.advanceGameMinutes(16));await page.waitForTimeout(300);await page.keyboard.press("e");await page.waitForTimeout(2000);
      const after=await snapshot();if(after.processingJobIds.length)throw new Error("Fish processing did not collect");return {before,started,after};
    });await escape();
    await check("pier-cast",async()=>{
      await teleport(76,75);await page.keyboard.press("Digit1");await page.waitForTimeout(350);
      // LMB uses the equipped rod even when boarding wins the contextual E prompt.
      await page.mouse.move(720,400);await page.mouse.down();await waitMode("basic-fishing");
      await page.waitForTimeout(650);await page.mouse.up();await page.waitForTimeout(750);
      const after=await snapshot();if(!after.basicFishing||after.basicFishing.phase==="caught")throw new Error(JSON.stringify(after));return after;
    });await escape();
    await check("board-sail-cargo-dock",async()=>{
      await teleport(76,66);const before=await snapshot();await page.keyboard.press("e");await waitMode("boat-driving");
      const boarded=await snapshot();await page.keyboard.down("w");await page.waitForTimeout(1500);await page.keyboard.up("w");
      await page.keyboard.down("s");await page.waitForTimeout(1200);await page.keyboard.up("s");const sailed=await snapshot();
      if(Math.hypot(sailed.playerPosition.x-boarded.playerPosition.x,sailed.playerPosition.z-boarded.playerPosition.z)<.5)throw new Error("Boat did not move");
      await page.keyboard.press("l");await page.waitForTimeout(600);
      const cargoVisible=await page.getByRole("dialog").count();if(!cargoVisible)throw new Error("Hold/stores did not open");await page.keyboard.press("Escape");await page.waitForTimeout(400);
      await page.keyboard.press("e");await waitMode("on-foot");return {before,boarded,sailed,cargoVisible,docked:await snapshot()};
    });
    await check("quality-resize",async()=>{
      const samples=[];
      for(const quality of ["low","high","medium","high","low","high"]){
        await page.getByTestId("micro-btn-menu").click();
        await page.locator(".pause-modal").waitFor({state:"visible"});
        const option=page.getByRole("radio",{name:new RegExp(`^${quality}`,"i")});
        await page.getByRole("button",{name:"Settings",exact:true}).click();
        await option.click();await page.keyboard.press("Escape");await page.waitForTimeout(2300);
        const sample=(await compact()).world;if(sample.qualityTier!==quality)throw new Error(`Expected ${quality}, got ${sample.qualityTier}`);samples.push(sample);
      }
      await page.setViewportSize({width:1180,height:760});await page.waitForTimeout(1600);samples.push((await compact()).world);
      await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(1600);samples.push((await compact()).world);
      return samples;
    });
  }
  if(args.farmSmoke === "true") {
    if(args.scenario !== "farm")throw new Error("Farm smoke requires the persistence-disabled farm scenario");
    const diagnostics=page.getByTestId("diagnostics"),before=await compact();
    await page.keyboard.press("i");
    await page.locator(".modal-content [aria-label^='Wheat Seeds, count']").click();
    await page.getByRole("button",{name:"Plant Wheat",exact:true}).click();
    let target;
    for(const x of [720,634,806,533,907]) {
      for(const y of [450,396,504,558,612]) {
        await page.mouse.move(x,y);await page.waitForTimeout(100);
        if(await diagnostics.getAttribute("data-placement-valid") === "true") {
          target={screen:{x,y},x:Number(await diagnostics.getAttribute("data-placement-target-x")),z:Number(await diagnostics.getAttribute("data-placement-target-z"))};break;
        }
      }
      if(target)break;
    }
    if(!target)throw new Error("No valid visible farm planting point");
    await page.mouse.click(target.screen.x,target.screen.y);
    await page.waitForFunction(()=>window.__NEVA_DEBUG.snapshot().cropCount===1,undefined,{timeout:10000});
    await page.waitForTimeout(1800);
    const planted=await compact();
    await page.keyboard.press("Digit3");
    await page.evaluate(({x,z})=>window.__NEVA_DEBUG.teleport(x,z),target);
    await page.waitForFunction(()=>window.__NEVA_DEBUG.snapshot().interactionTarget?.action === "water",undefined,{timeout:8000});
    const waterTarget=await page.evaluate(()=>window.__NEVA_DEBUG.snapshot().interactionTarget);
    await page.keyboard.press("e");
    await page.getByTestId("crop-inspection").waitFor({state:"visible",timeout:10000});
    const inspection=await page.getByTestId("crop-inspection").innerText();
    if(!/Moisture\s+Wet/i.test(inspection))throw new Error(`Watering did not report wet soil: ${inspection}`);
    report.farmSmoke={passed:true,target,before,planted,waterTarget,inspection,after:await compact()};
    await page.screenshot({path:path.join(output,"planted-watered-wheat.png")});
  }
  report.final = await compact();
  if(page.video())report.videoPath=await page.video().path();
  await context.close();
  console.info(JSON.stringify({ output, errors, profiles: report.profiles?.map(({frameMs,calls,triangles,routeError})=>({frameMs,calls,triangles,routeError})), traversal: report.traversal?.map(({target,reached})=>({target,reached})) }));
} finally {
  await fs.writeFile(path.join(output, "measurements.json"), JSON.stringify(report, null, 2));
  await browser.close();
}

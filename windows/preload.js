/* window.PearlsNative for the Windows app: the Android bridge's methods (android/java/.../PearlsBridge.java), answered
 * synchronously by main.js, as Android's @JavascriptInterface methods are. Also tells the page what it runs on
 * (PEARLS_SHELL, so it says "this PC") and that ph.yhb.org.il text goes through the app (PEARLS_PROXY). */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const call = (m, ...a) => ipcRenderer.sendSync("pearls", m, a);
const M = ["info", "enqueue", "status", "list", "remove", "cancelAll", "readText", "writeText", "textList", "clearText",
  "mediaState", "setBars", "saveMigration", "takeMigration"];
const api = {};
for (const m of M) api[m] = (...a) => call(m, ...a);
contextBridge.exposeInMainWorld("PearlsNative", api);
contextBridge.exposeInMainWorld("PEARLS_SHELL", "windows");
contextBridge.exposeInMainWorld("PEARLS_PROXY", "/proxy?u=");

/* Headphones: Windows doesn't tell apps that the earbuds went away, but Chromium does say the audio devices changed.
   When the default output was a device that is now gone (Bluetooth earbuds disconnected, headphones unplugged), the
   sound is about to come out of the speakers: that is Android's "audio becoming noisy", so main.js calls
   PEARLS_MEDIA("noisy") and the page pauses if Settings → Pause when headphones disconnect is on. */
const md = navigator.mediaDevices;
if (md && md.enumerateDevices) {
  const outputs = () => md.enumerateDevices().then(L => L.filter(d => d.kind === "audiooutput")).catch(() => []);
  let outs = null;
  outputs().then(L => { outs = L; });
  md.addEventListener("devicechange", async () => {
    const now = await outputs(), prev = outs; outs = now;
    if (!prev) return;
    const ids = new Set(now.map(d => d.deviceId));
    const lost = prev.filter(d => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications" && !ids.has(d.deviceId));
    const was = prev.find(d => d.deviceId === "default"), is = now.find(d => d.deviceId === "default");
    if (lost.length && was && is && was.groupId !== is.groupId && lost.some(d => d.groupId === was.groupId)) ipcRenderer.send("pearls-noisy");
  });
}

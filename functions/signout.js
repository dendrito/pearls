import { clearPass, page } from "../webauth/auth.js";
export async function onRequestGet() {
  return page("Pearls · signed out", `<h1><span class="dot"></span>Pearls</h1><p>You're signed out on this device.</p><p><a class="btn" href="/signin">Sign in again</a></p>`,
    200, { "Set-Cookie": clearPass });
}

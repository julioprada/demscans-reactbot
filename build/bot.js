"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const playwright_1 = require("playwright");
// Resolve path next to the packaged exe (when built) or current working directory (when running via npm).
const execDir = process.pkg
    ? node_path_1.default.dirname(process.execPath)
    : process.cwd();
const credPath = node_path_1.default.join(execDir, "credentials.json");
let USERNAME = "";
let PASSWORD = "";
try {
    const raw = node_fs_1.default.readFileSync(credPath, "utf8");
    const cfg = JSON.parse(raw);
    USERNAME = cfg.DEMONIC_EMAIL || cfg.email || "";
    PASSWORD = cfg.DEMONIC_PASSWORD || cfg.password || "";
}
catch (e) {
    console.error(`Missing or invalid credentials.json at: ${credPath}`);
}
const BASE_URL = "https://demonicscans.org/";
const STAMINA_SAFETY_MARGIN = 60; // stop this many points before stamina cap
const BLOCK_AUTO_REFRESH = false; // set to true to block auto reloads/redirects
// Install early diagnostics into every page to detect and optionally block auto refreshes
async function installNavigationDiagnostics(context, block = BLOCK_AUTO_REFRESH) {
    // Inject before any page scripts run
    await context.addInitScript(({ block }) => {
        const log = (...args) => {
            try {
                console.log("[NavDiag]", ...args);
            }
            catch { }
        };
        try {
            const wrap = (obj, key) => {
                const orig = obj[key]?.bind(obj);
                if (!orig)
                    return;
                Object.defineProperty(obj, key, {
                    configurable: true,
                    value: (...args) => {
                        log(`location.${key} called`, ...args);
                        if (!block)
                            return orig(...args);
                        log(`BLOCKED location.${key}`);
                        return undefined;
                    },
                });
            };
            wrap(window.location, "assign");
            wrap(window.location, "replace");
            wrap(window.location, "reload");
        }
        catch { }
        try {
            // Remove or log meta refresh
            const meta = document.querySelector('meta[http-equiv="refresh"]');
            if (meta) {
                log("meta refresh detected:", meta.getAttribute("content"));
                if (block)
                    meta.remove();
            }
        }
        catch { }
        try {
            // Avoid beforeunload prompts affecting automation
            window.onbeforeunload = null;
        }
        catch { }
    }, { block });
}
function attachPageListeners(page) {
    page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) {
            console.log("[NavDiag] Main frame navigated to:", frame.url());
        }
    });
    page.on("domcontentloaded", () => {
        console.log("[NavDiag] DOMContentLoaded at", page.url());
    });
    page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("[NavDiag]")) {
            // Already annotated
            console.log(text);
        }
    });
}
async function login(page) {
    if (!USERNAME || !PASSWORD) {
        throw new Error(`Credentials not set. Please create credentials.json next to the executable with {\n  "DEMONIC_EMAIL": "you@example.com",\n  "DEMONIC_PASSWORD": "secret"\n}`);
    }
    // Go directly to the sign-in page
    await page.goto(new URL("signin.php", BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
    });
    // Fill using robust fallbacks (labels and common attributes)
    const emailInput = page
        .locator('input[type="email"], input[name="email"], #email, input[name="username"]')
        .first();
    const passwordInput = page
        .locator('input[type="password"], input[name="password"], #password')
        .first();
    await emailInput.fill(USERNAME);
    await passwordInput.fill(PASSWORD);
    // Submit
    await Promise.all([
        page.waitForLoadState("networkidle"),
        page
            .locator('button[type="submit"], button:has-text("Sign In"), input[type="submit"]')
            .first()
            .click(),
    ]);
    // Consider login successful if the Sign in link disappears
    try {
        await page.waitForSelector('a[href*="signin.php"], a:has-text("Sign in")', {
            state: "detached",
            timeout: 10000,
        });
        console.log("✅ Logged in");
    }
    catch {
        console.warn("⚠️ Could not verify login; continuing anyway.");
    }
}
async function isLoggedIn(page) {
    // If the Sign in link exists, we are not logged in
    const signInLink = await page.$('a[href*="signin.php"], a:has-text("Sign in")');
    return !signInLink;
}
async function reactToChapter(page, chapterUrl) {
    await page.goto(chapterUrl, { waitUntil: "domcontentloaded" });
    try {
        // Simplified: click the first reaction icon with class 'reaction' and data-reaction="1"
        const reaction = page.locator('.reaction[data-reaction="1"]').first();
        // Wait briefly in case it renders lazily
        await reaction.waitFor({ state: "visible", timeout: 5000 }).catch(() => { });
        if ((await reaction.count()) > 0) {
            await reaction.click({ timeout: 3000 });
            console.log(`👍 Reacted to ${chapterUrl}`);
        }
        else {
            console.log(`⚠️ Reaction button .reaction[data-reaction="1"] not found on ${chapterUrl}`);
        }
    }
    catch (err) {
        console.error(`Error reacting to ${chapterUrl}:`, err);
    }
}
// Removed unused helper that collected chapter links from homepage
// Wait for the user to manually click a manga on the homepage
async function waitForUserToSelectManga(page) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    console.log("➡️ Please click a manga on the homepage. Waiting for navigation to a /manga/... page...");
    await page.waitForURL(/\/manga\//, { timeout: 0 });
    const url = page.url();
    console.log("📖 Manga selected:", url);
    return url;
}
// From a manga page, collect its chapter links
async function getChapterLinksFromMangaPage(page) {
    const links = await page.$$eval("a[href]", (as) => {
        const hrefs = as
            .map((a) => a.href)
            .filter(Boolean)
            .filter((h) => /chaptered\.php|\/title\/.+\/chapter\//.test(h));
        return Array.from(new Set(hrefs));
    });
    // Sort by chapter number descending if available
    const withChapter = links.map((href) => {
        try {
            const u = new URL(href);
            const chStr = u.searchParams.get("chapter") || "";
            const ch = parseFloat(chStr.replace(",", "."));
            return { href, ch: isNaN(ch) ? -Infinity : ch };
        }
        catch {
            return { href, ch: -Infinity };
        }
    });
    withChapter.sort((a, b) => b.ch - a.ch);
    return withChapter.map((x) => x.href);
}
// Read the "Farmed today x / 1,000" cap from the page text
async function getFarmedToday(page) {
    const text = await page.evaluate(() => document.body?.innerText || "");
    // Match patterns like: Farmed today 42 / 1,000 (commas allowed)
    const m = text.match(/Farmed\s*today\s*([\d,\.]+)\s*\/\s*([\d,\.]+)/i);
    if (!m)
        return null;
    const clean = (s) => parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
    const current = clean(m[1]);
    const max = clean(m[2]);
    return { current, max };
}
// Read the "Stamina x / 615" cap from the page text
async function getStamina(page) {
    const text = await page.evaluate(() => document.body?.innerText || "");
    const m = text.match(/Stamina\s*([\d,\.]+)\s*\/\s*([\d,\.]+)/i);
    if (!m)
        return null;
    const clean = (s) => parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
    const current = clean(m[1]);
    const max = clean(m[2]);
    return { current, max };
}
async function runBot() {
    const browser = await playwright_1.chromium.launch({
        headless: false,
        executablePath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", // Windows default
        // Disable images at the engine level (Chromium/Brave argument)
        args: ["--blink-settings=imagesEnabled=false"],
    }); // change to true for headless
    // Create a context with request routing to block images/media
    const context = await browser.newContext();
    await installNavigationDiagnostics(context);
    await context.route("**/*", (route) => {
        const type = route.request().resourceType();
        if (type === "image" || type === "media")
            return route.abort();
        return route.continue();
    });
    const page = await context.newPage();
    attachPageListeners(page);
    // // 1) Login (uncomment after setting USERNAME/PASSWORD)
    await login(page);
    // 2) Let user pick a manga manually from the homepage
    await waitForUserToSelectManga(page);
    // 3) Collect its chapters (latest first)
    const chapters = await getChapterLinksFromMangaPage(page);
    if (!chapters.length) {
        console.log("⚠️ No chapters found on this manga page.");
        return;
    }
    // 4) Iterate chapters, respecting the daily farming cap and skipping if already reacted
    for (const chapter of chapters) {
        // Navigate to chapter
        await page.goto(chapter, { waitUntil: "domcontentloaded" });
        // If this chapter already has an active reaction, skip immediately
        const alreadyReacted = await page
            .locator(".reaction.active-reaction")
            .first()
            .count();
        if (alreadyReacted > 0) {
            console.log(`⏭️  Already reacted on this chapter. Skipping: ${chapter}`);
            continue;
        }
        // Read caps
        let cap = await getFarmedToday(page);
        let stamina = await getStamina(page);
        // If both caps are missing, likely logged out; try to login and return
        if (!cap && !stamina) {
            console.log("🔐 Caps missing; attempting re-login and retry...");
            await login(page);
            await page.goto(chapter, { waitUntil: "domcontentloaded" });
            cap = await getFarmedToday(page);
            stamina = await getStamina(page);
        }
        // If still both missing, skip this chapter
        if (!cap && !stamina) {
            console.log("⚠️ Caps still not found after re-login; skipping chapter.");
            continue;
        }
        // Farmed today cap check
        if (cap) {
            const { current, max } = cap;
            console.log(`Farmed today: ${current} / ${max}`);
            if (current >= max) {
                console.log("✅ Cap reached. Stopping reactions.");
                break;
            }
        }
        // Stamina guard: stop early if stamina is within safety margin of cap
        if (stamina) {
            console.log(`Stamina: ${stamina.current} / ${stamina.max}`);
            const threshold = Math.max(0, stamina.max - STAMINA_SAFETY_MARGIN);
            console.log(`Stamina: ${stamina.current} / ${stamina.max} (stop at ${threshold})`);
            if (stamina.current >= stamina.max) {
                console.log("✅ Stamina cap reached. Stopping reactions.");
                break;
            }
            if (stamina.current >= threshold) {
                console.log(`✅ Stamina within ${STAMINA_SAFETY_MARGIN} of cap. Stopping reactions.`);
                break;
            }
        }
        // React once on this chapter (assumed +2 points per your note)
        await reactToChapter(page, chapter);
        // Small random delay between chapters
        await new Promise((res) => setTimeout(res, Math.floor(Math.random() * 700) + 700));
    }
    await browser.close();
}
runBot();

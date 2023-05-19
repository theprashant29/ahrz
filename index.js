const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const fetch = require("node-fetch");
const Koa = require("koa");
const bodyParser = require("koa-bodyparser");
const app = new Koa();
app.use(bodyParser({ strict: false }));
const jsesc = require("jsesc");
require("events").EventEmitter.defaultMaxListeners = Infinity;
const headersToRemove = [
  "host",
  "forwarded",
  "x-forwarded-proto",
  "x-forwarded-for",
  "x-cloud-trace-context",
  "origin",
  "referer",
  "user-agent",
  "cookie",
  "connection",
  "upgrade-insecure-requests",
  // "content-type",
  "content-length",
];

const responseHeadersToRemove = ["content-encoding"];
// const responseHeadersToRemove = ["Accept-Ranges", "Content-Length", "Keep-Alive", "Connection", "content-encoding", "set-cookie"];

(async () => {
  // const browser = await puppeteer.launch({
  //   executablePath: '/usr/bin/chromium-browser',
  //   args: ['--no-sandbox', '--headless', '--disable-gpu'],
  // });
  let options = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD)
    options.executablePath = "/usr/bin/chromium-browser";
  if (process.env.PUPPETEER_HEADFUL) options.headless = false;
  if (process.env.PUPPETEER_USERDATADIR)
    options.userDataDir = process.env.PUPPETEER_USERDATADIR;
  if (process.env.PUPPETEER_PROXY)
    options.args.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);

  app.use(async (ctx) => {
    let base = "https://app.ahrefs.com";
    let url = base + ctx.originalUrl;
    const browser = await puppeteer.launch(options);
    let responseBody;
    let responseData;
    let responseHeaders = [];
    const page = await browser.newPage();
    // console.log(url);
    let cookies = [];
    if (ctx.header.cookie) {
      ctx.header.cookie.split("; ").forEach((cookie) => {
        let temp = cookie.split("=");
        cookies.push({
          name: temp[0],
          value: temp[1],
          domain: ".ahrefs.com",
        });
      });
      await page.setCookie(...cookies);
    }
    let headers;
    if (ctx.headers) {
      headers = ctx.headers;
      headersToRemove.forEach((header) => delete headers[header]);
      await page.setExtraHTTPHeaders({
        ...headers,
        // Cookie: "BSSESSID=%2FVWWlTpMz9InEpdn4CvRr4qSxD%2BB3f17Ngz4GR%2Bi",
        origin: base,
      });
    }
    const response = await fetch(
      "https://main.seotoolshide.com/agent.php?show=xxxx"
    );
    const userAgent = await response.text();
    await page.setUserAgent(userAgent);
    console.log(userAgent);
    if (ctx.method === "POST") {
      await page.removeAllListeners("request");
      await page.setRequestInterception(true);
      page.on("request", (interceptedRequest) => {
        var data = {
          method: "POST",
          postData: ctx.request.rawBody,
        };
        interceptedRequest.continue(data);
      });
    }
    try {
      let response;
      let tryCount = 0;
      response = await page.goto(url, {
        timeout: 30000,
        waitUntil: "domcontentloaded",
      });
      responseBody = await response.text();
      responseData = await response.buffer();
      responseHeaders = await response.headers();
      // while (responseBody.includes("challenge-running") && tryCount <= 10) {
      //   newResponse = await page.waitForNavigation({
      //     timeout: 30000,
      //     waitUntil: "domcontentloaded",
      //   });
      //   if (newResponse) response = newResponse;
      //   responseBody = await response.text();
      //   responseData = await response.buffer();
      //   tryCount++;
      // }
      const cookies = await page.cookies();
      if (cookies)
        cookies.forEach((cookie) => {
          const { name, value, secure, expires, domain, ...options } = cookie;
          ctx.cookies.set(cookie.name, cookie.value, options);
        });
    } catch (error) {
      if (!error.toString().includes("ERR_BLOCKED_BY_CLIENT")) {
        ctx.status = 500;
        ctx.body = error;
      }
    }

    await page.close();
    responseHeadersToRemove.forEach((header) => delete responseHeaders[header]);
    Object.keys(responseHeaders).forEach((header) =>
      ctx.set(header, jsesc(responseHeaders[header]))
    );
    ctx.set(
      "content-security-policy",
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
    );
    ctx.body = responseData;
  });
  app.listen(process.env.PORT || 80);
})();

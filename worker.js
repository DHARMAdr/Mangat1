/* =====================================================================
   MangaFlow proxy - worker.js  (Cloudflare Worker, free plan is enough)
   WHY: Browsers will not let a web page read another website directly (CORS). This tiny server
        fetches the page for you and adds the header that permits your site to read the answer.
        Free public proxies are unreliable, so owning one is the dependable fix.
   SECURITY (round 7) - an open proxy is a free tool for strangers (and for attackers hiding behind YOUR address).
   This version therefore:
     1. answers only the sites listed in ALLOWED (set it! an empty list means "anyone" and prints a warning header);
     2. optional TOKEN: put  ?k=YOURSECRET  in the proxy address you paste into MangaFlow (see below);
     3. refuses private / local targets (localhost, 10.x, 192.168.x ...), non-web addresses and your own Worker;
     4. passes on only web-page, JSON, text and picture answers (no .zip / .exe downloads), max MAX_BYTES;
     5. a small per-visitor rate limit (best effort: it lives in one Worker instance only);
     6. never passes cookies from other sites.
   Honest limit: a TOKEN written in a web page can be read by anyone who opens the page, so ALLOWED (origin check)
   is the main lock and TOKEN only stops casual use. For stronger protection use Cloudflare Access or rate-limit rules.
   IMPROVE: add a cache (caches.default), and rotate User-Agents.

   DEPLOY (about 3 minutes, no coding):
   1. Make a free account at https://dash.cloudflare.com
   2. Left menu: Workers & Pages -> Create -> Create Worker -> name it e.g. "mangaflow-proxy" -> Deploy
   3. Click "Edit code", delete everything, paste THIS file, click Deploy.
   4. Copy the address, e.g. https://mangaflow-proxy.YOURNAME.workers.dev
   5. In MangaFlow: Settings (gear) -> "Your own CORS proxy" ->
        https://mangaflow-proxy.YOURNAME.workers.dev/?url={url}
      (with a token:  https://mangaflow-proxy.YOURNAME.workers.dev/?k=YOURSECRET&url={url} )
   ===================================================================== */

// Sites allowed to use this proxy. Empty list = anyone (fine for testing, risky long term).
// Example: ['https://yourname.github.io']   (the file:// pages you open locally send "null")
// WHY: The list of websites allowed to use this proxy. HOW: The code compares the request's Origin with this list.
// IMPROVE: Fill it with your own site, e.g. your github.io address, so strangers cannot use your proxy.
const ALLOWED = [];
// WHY: An optional password for the proxy. HOW: When not empty, requests need ?k=SECRET. IMPROVE: Remember it is visible
// in the web page, so it only stops casual use.
const TOKEN = '';                      // optional secret, e.g. 'x7Kq29'. Empty = no token needed.
// WHY: Limits how large an answer the proxy passes on, to protect the free plan. HOW: 80 * 1024 * 1024 = 80 megabytes.
// IMPROVE: Lower it if you only need pages and small pictures.
const MAX_BYTES = 80 * 1024 * 1024;    // largest answer passed on
// WHY: Stops one visitor from sending endless requests. HOW: The code counts requests in the last minute and refuses
// above 600. IMPROVE: Use Cloudflare rate-limit rules for a stronger limit.
const PER_MINUTE = 600;                // requests per visitor per minute (a 50-chapter download is many requests)
// WHY: Only allow safe answer types (pages, text, JSON, pictures, fonts), not .zip or .exe files. HOW: A regular
// expression tested against the content-type. IMPROVE: Drop application/octet-stream if pictures never use it.
const OK_TYPES = /^(text\/|application\/(json|xhtml\+xml|xml|javascript)|image\/|font\/|application\/octet-stream$)/i;
// WHY: Memory for the rate limit. HOW: A Map = list of key/value pairs; key is the visitor, value is a list of request
// times. IMPROVE: It resets when the Worker restarts; use Durable Objects or KV for a lasting count.
const hits = new Map();                // visitor -> [timestamps]

// Private / local targets are never allowed.
// WHY: Stops the proxy from being used to reach private machines (a known attack called SSRF). HOW: This function says
// true for local or private addresses. IMPROVE: Also check the real address after DNS lookup.
function isPrivateHost(h) {
  // WHY: Make the host name easy to compare. HOW: Remove [ ] around IPv6 addresses and use lowercase. IMPROVE: None
  // needed.
  h = h.replace(/^\[|\]$/g, '').toLowerCase();
  // WHY: Catch local names and private IPv6 addresses. HOW: Check names like localhost, .local, .internal, and the starts
  // fe80, fc and fd. IMPROVE: Also block IPv6 mapped IPv4 forms.
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd')) return true;
  // WHY: Now check numbers like 10.0.0.1. HOW: The regular expression matches four numbers split by dots; if it does not
  // match, it is not an IPv4 address, so we return false. IMPROVE: Block odd forms like 0x7f.1.
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  // WHY: Pick out the first two numbers of the IP, which decide the private range. HOW: The + in front turns text into a
  // number. IMPROVE: None needed.
  const [a, b] = [+m[1], +m[2]];
  // WHY: Block all private, loopback, link-local and reserved ranges. HOW: Returns true when the numbers fit any range
  // (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x, 100.64-127.x, 224 and above). IMPROVE: Add a short comment per range.
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// WHY: This is how Cloudflare expects a Worker to look. HOW: It exports an object whose fetch function is called for
// every request. IMPROVE: None needed.
export default {
  // WHY: The main function; it receives each request and returns an answer. HOW: async lets us use await for network
  // calls. IMPROVE: Split the checks into small functions.
  async fetch(request) {
    // WHY: We need to know which website is asking. HOW: Read the Origin header, or use empty text if missing. IMPROVE: None
    // needed.
    const origin = request.headers.get('Origin') || '';
    // WHY: The CORS headers that let the browser read our answer. HOW: If ALLOWED has entries we allow only the asking
    // origin, otherwise any (*). IMPROVE: Return the origin only after it is checked.
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED.length ? origin : '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    };

    // WHY: Browsers first send an OPTIONS check (preflight) before some requests. HOW: Answer 204 (no content) with the CORS
    // headers. IMPROVE: None needed.
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // WHY: Refuse sites that are not allowed. HOW: When ALLOWED is not empty and the origin is not in it, return 403
    // forbidden. IMPROVE: Also check the Referer header.
    if (ALLOWED.length && !ALLOWED.includes(origin)) return new Response('forbidden origin', { status: 403, headers: cors });
    // WHY: This proxy only needs to read data. HOW: Any method other than GET gets 405. IMPROVE: None needed.
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers: cors });

    // WHY: Read the proxy's own address so we can use its parts. HOW: new URL splits an address into parts; searchParams
    // reads the ?name=value pairs. IMPROVE: None needed.
    const self = new URL(request.url);
    const q = self.searchParams;
    // WHY: Check the optional password. HOW: If TOKEN is set and ?k= is different, answer 403. IMPROVE: Compare in a way
    // that takes equal time.
    if (TOKEN && q.get('k') !== TOKEN) return new Response('forbidden', { status: 403, headers: cors });
    // Rate limit per visitor (best effort).
    // WHY: Find out who is asking for the rate limit. HOW: Use the visitor IP given by Cloudflare, or the origin, or 'anon'.
    // 'now' is the time in milliseconds. IMPROVE: None needed.
    const who = request.headers.get('CF-Connecting-IP') || origin || 'anon', now = Date.now();
    // WHY: Keep only requests from the last 60 seconds. HOW: Take the visitor's list (or empty) and filter old times out.
    // IMPROVE: None needed.
    const list = (hits.get(who) || []).filter(t => now - t < 60000);
    // WHY: Block visitors who ask too much. HOW: If the list has reached the limit, answer 429. IMPROVE: Add a Retry-After
    // header.
    if (list.length >= PER_MINUTE) return new Response('too many requests, wait a minute', { status: 429, headers: cors });
    // WHY: Remember this request. HOW: Add the time and save the list in the Map. IMPROVE: None needed.
    list.push(now); hits.set(who, list);
    // WHY: Keep memory small. HOW: If the Map has more than 5000 visitors, clear it all. IMPROVE: Remove only the oldest
    // entries.
    if (hits.size > 5000) hits.clear();
    // WHY: The address to fetch. HOW: Read ?url= from the proxy address. IMPROVE: None needed.
    const target = q.get('url');
    // Some sites fill their chapter list by a POST request. MangaFlow asks for it as  &method=POST&body=...
    // WHY: Some sites need a POST request. HOW: true only when ?method=POST (any letter case). IMPROVE: None needed.
    const post = (q.get('method') || '').toUpperCase() === 'POST';
    // ROUND 8: &ref=<chapter address> is sent as the Referer, because many picture hosts only answer requests that
    // look like they come from the manga site. Only a real http(s) address is accepted.
    // WHY: Optional Referer so picture sites accept the request. HOW: Try to read ?ref= as an address; keep it only if it is
    // http or https; catch means ignore a bad one. IMPROVE: None needed.
    let ref = null; try { const r = new URL(q.get('ref') || ''); if (/^https?:$/.test(r.protocol)) ref = r.href; } catch { /* no ref */ }
    // WHY: Refuse requests without a proper web address. HOW: Must exist and start with http:// or https://, else 400.
    // IMPROVE: None needed.
    if (!target || !/^https?:\/\//i.test(target)) return new Response('missing ?url=', { status: 400, headers: cors });
    // WHY: Check the target before fetching. HOW: Parse it (400 if broken), then block private hosts and this Worker itself
    // with 403. IMPROVE: Also check after redirects.
    { let tu; try { tu = new URL(target); } catch { return new Response('bad url', { status: 400, headers: cors }); }
      if (isPrivateHost(tu.hostname) || tu.hostname === self.hostname) return new Response('blocked target', { status: 403, headers: cors }); }

    // WHY: Network calls can fail. HOW: The try block catches any error and answers 502 at the bottom. IMPROVE: None needed.
    try {
      // WHY: Parsed target address to read its origin. HOW: new URL(target). IMPROVE: Reuse the 'tu' from before.
      const t = new URL(target);
      // WHY: Settings for the outgoing request. HOW: redirect: follow means redirects are followed; headers come next.
      // IMPROVE: Stop redirects to private hosts.
      const init = {
        redirect: 'follow',
        // WHY: Headers that make the request look like a normal browser. HOW: A list of header names and values. IMPROVE: Rotate
        // the User-Agent.
        headers: {
          // Looks like a normal browser so simple bot filters let the request through.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': ref || (t.origin + '/')
        }
      };
      // ROUND 19 - ENGLISH SEARCH RESULTS. WHY: Brave / Bing pick the language from the country of the Cloudflare server, so results sometimes came back in another
      // language. HOW: for these two search hosts a small cookie asks for English / US. Nothing is stored; the cookie is only sent with this one request.
      // IMPROVE: add a ?lang= parameter so the app can choose the language.
      if (t.hostname === 'search.brave.com') init.headers['Cookie'] = 'country=us; useLocation=0; ui_lang=en-us';
      else if (/(^|\.)bing\.com$/.test(t.hostname)) init.headers['Cookie'] = 'SRCHHPGUSR=SRCHLANG=en&IG=0; _EDGE_S=mkt=en-us';
      // WHY: Handle POST requests. HOW: Change the method, use ?body= as the body and set headers that look like a form sent
      // by a web page. IMPROVE: Limit the body size.
      if (post) {
        init.method = 'POST';
        init.body = q.get('body') || '';
        init.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        init.headers['X-Requested-With'] = 'XMLHttpRequest';
        init.headers['Origin'] = t.origin;
        init.headers['Accept'] = '*/*';
      }
      // ROUND 18 - TRY HARDER BEFORE GIVING UP.
      // WHY: picture hosts often answer 403/404 when the Referer is not the one they expect, and a slow host used to hang until the browser gave up.
      // HOW: (1) every try has a 20 s limit (AbortController). (2) For a picture-like address the first answer is checked; if it is 403/404/410/429/5xx,
      //   the request is repeated with other Referer values - the one MangaFlow sent, the site root of that page, the picture host's own root, and finally none.
      //   The first good answer wins. (3) The header X-MangaFlow-Tries says how many tries were needed (visible in the browser's network tab).
      // IMPROVE: remember per host which Referer worked (KV storage), and add a small random delay between tries.
      const looksLikePicture = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(t.pathname + t.search) || /image\//i.test(request.headers.get('Accept') || '');
      if (looksLikePicture) init.headers['Accept'] = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';   // pictures: ask for pictures
      const refs = [init.headers['Referer']];
      if (looksLikePicture && !post) {
        try { if (ref) refs.push(new URL(ref).origin + '/'); } catch { /* ignore */ }
        refs.push(t.origin + '/'); refs.push('');
      }
      const tried = []; let res = null, lastErr = null;
      for (const r of refs) {
        if (tried.includes(r)) continue; tried.push(r);
        const h2 = Object.assign({}, init.headers); if (r) h2['Referer'] = r; else delete h2['Referer'];
        const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
        try { res = await fetch(target, Object.assign({}, init, { headers: h2, signal: ctl.signal })); lastErr = null; }
        catch (e) { lastErr = e; res = null; }
        finally { clearTimeout(timer); }
        if (res && res.status < 400) break;                                   // good answer: stop trying
        if (!looksLikePicture || post) break;                                 // pages: one try only (the browser has its own fallbacks)
        if (res && ![403, 404, 410, 429, 500, 502, 503, 520, 522, 524].includes(res.status)) break;   // other codes will not change with another Referer
      }
      if (!res) throw (lastErr || new Error('no answer from the site'));
      // WHY: Read the answer type. HOW: Get content-type or empty text. IMPROVE: None needed.
      const ctype = res.headers.get('content-type') || '';
      // WHY: Block files we do not want to pass on. HOW: If a type exists and is not in OK_TYPES, answer 415. IMPROVE: None
      // needed.
      if (ctype && !OK_TYPES.test(ctype)) return new Response('blocked file type: ' + ctype, { status: 415, headers: cors });
      // WHY: Refuse too large answers. HOW: Compare content-length with MAX_BYTES; if too big, answer 413. IMPROVE: Streamed
      // answers without a length are not limited; count the bytes as they pass.
      if (+res.headers.get('content-length') > MAX_BYTES) return new Response('answer too big', { status: 413, headers: cors });
      // WHY: Copy the headers so we can change them. HOW: new Headers makes an editable copy. IMPROVE: None needed.
      const h = new Headers(res.headers);
      h.delete('set-cookie');                // never pass cookies of other sites on
      // WHY: Stop browsers from guessing file types. HOW: Set the nosniff header. IMPROVE: None needed.
      h.set('X-Content-Type-Options', 'nosniff');
      // WHY: Warn when the proxy is open to everyone. HOW: Add a warning header if ALLOWED is empty. IMPROVE: None needed.
      if (!ALLOWED.length) h.set('X-MangaFlow-Warning', 'ALLOWED is empty: anyone can use this proxy');
      // WHY: Add the CORS headers to the answer. HOW: Loop over the cors object and set each one. IMPROVE: None needed.
      Object.entries(cors).forEach(([k, v]) => h.set(k, v));
      // WHY: These headers would stop the page from being used in our reader. HOW: Delete the content security policy header.
      // IMPROVE: Only remove it for HTML answers.
      h.delete('content-security-policy');
      // WHY: Allow showing the answer in a frame. HOW: Delete the x-frame-options header. IMPROVE: None needed.
      h.delete('x-frame-options');
      h.delete('content-encoding');          // body is already decoded by the runtime
      h.set('X-MangaFlow-Tries', String(tried.length));              // round 18: how many Referer variants were tried (debug help)
      h.set('X-MangaFlow-Upstream', String(res.status));             // round 18: the status the picture/page host really gave
      h.set('Access-Control-Expose-Headers', 'X-MangaFlow-Tries, X-MangaFlow-Upstream, Content-Type, Content-Length');
      // WHY: Send the answer back. HOW: Stream the body with the same status and the changed headers. IMPROVE: None needed.
      return new Response(res.body, { status: res.status, headers: h });
    // WHY: Handle any failure. HOW: Catch the error and answer 502 with its message and the CORS headers. IMPROVE: Hide the
    // message details.
    } catch (e) {
      // ROUND 18: say whether it was our time limit or the site (clearer reports). 504 = the site was too slow, 502 = could not connect.
      const slow = e && e.name === 'AbortError';
      return new Response('proxy error: ' + (slow ? 'the site did not answer within 20 s' : e.message), { status: slow ? 504 : 502, headers: cors });
    }
  }
};

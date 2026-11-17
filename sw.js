/* Expense Tracker — the offline copy of the app itself.
   Same approach as baby-routine's sw.js, simplified: this app is one
   self-contained index.html, so there is no separate app.js/style.css to
   track alongside it. */
"use strict";

// Bumped together with index.html's APP_BUILD and version.json. A mismatch
// between the three just means the update banner and the cache name drift
// out of step — keep them equal on every release.
var VERSION = "1";
var CACHE = "chtracking-" + VERSION;

// The page is always kept and looked up under this one name, whatever address
// the browser happened to ask for it by.
var PAGE = "./index.html";

var SHELL = [PAGE];

// Never cached, and never even looked at: the one question a cache must not be
// allowed to answer is "is there a newer version?".
function isVersionCheck(url) {
  return /(^|\/)version\.json$/.test(url.pathname);
}

// Nor this file. Browsers already fetch a worker script outside its own fetch
// handler, but a cache-first rule that could serve a stale copy of the caching
// itself is not something to leave standing on a technicality.
function isSelf(url) {
  return /(^|\/)sw\.js$/.test(url.pathname);
}

function isPage(request, url) {
  return request.mode === "navigate" || /(^|\/)(index\.html)?$/.test(url.pathname);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (href) {
        return cache.add(new Request(href, { cache: "reload" })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  // Anything not ours is none of our business.
  if (url.origin !== self.location.origin) return;
  if (isVersionCheck(url) || isSelf(url)) return;

  if (isPage(request, url)) {
    // ?r= is the way out of anything this cache has got wrong — the version
    // number at the foot of the screen asks for the page that way. So it is
    // answered from the network, and only a dead connection falls back to what
    // is kept here: throwing the offline copy away because somebody tapped
    // while out of signal would leave them nothing to open at all.
    var forced = /[?&]r=/.test(url.search);
    var store = caches.open(CACHE);
    // Fetched behind whatever is handed over. Without this second half a phone
    // could sit on one index.html for ever, which is the ordinary way an app
    // that works offline becomes an app that cannot be updated.
    var fresh = store.then(function (cache) {
      return fetch(request).then(function (response) {
        if (!response || !response.ok) return response;
        var copy = response.clone();
        return cache.put(PAGE, copy).then(function () { return response; });
      });
    }).catch(function () { return null; });
    // The answer usually comes out of the cache in a moment, and a worker with
    // nothing left to answer can be stopped where it stands. This says the
    // taking-on of the new page is still going, so it is not cut in half.
    event.waitUntil(fresh);
    event.respondWith((forced
      ? fresh.then(function (response) {
          return response || store.then(function (cache) { return cache.match(PAGE); });
        })
      : store.then(function (cache) { return cache.match(PAGE); }).then(function (hit) {
          return hit || fresh;
        })
    ).catch(function () { return fetch(request); }));
    return;
  }

  // Everything else of ours (none today, but future favicons/icons would land
  // here): cache-first, filled in on the miss that first fetched it.
  event.respondWith(caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request).then(function (response) {
      if (!response || !response.ok) return response;
      var copy = response.clone();
      return caches.open(CACHE).then(function (cache) {
        return cache.put(request, copy);
      }).catch(function () {}).then(function () { return response; });
    });
  }).catch(function () { return fetch(request); }));
});

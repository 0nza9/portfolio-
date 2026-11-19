// Clean addresses on the live site. Every page sits at the root (about.html,
// rustianlife.html…) and Netlify serves it without the extension (/about), so
// here we make the address bar match: "/" instead of /index.html, /about
// instead of /about.html, and no #anchor left behind after jumping to a section.
// Links in the HTML keep their .html names so the site still works when opened
// straight from disk (file://), where none of this runs.
(function () {
  if (!/^https?:$/.test(location.protocol)) return;

  const clean = (path) =>
    path.replace(/\/index(\.html)?$/, "/").replace(/\.html$/, "");

  // internal links point at the clean address (no redirect, clean hover preview)
  document.querySelectorAll('a[href]').forEach((a) => {
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$/.test(url.pathname)) return;
    a.href = clean(url.pathname) + url.search + url.hash;
  });

  // arriving with a .html path or a #section: tidy the bar, then show the section
  const id = decodeURIComponent(location.hash.slice(1));
  const tidy = clean(location.pathname) + location.search;
  if (id || tidy !== location.pathname + location.search) {
    history.replaceState(history.state, "", tidy);
  }
  const target = id && document.getElementById(id);
  if (target) {
    target.scrollIntoView();
    // images above it may still be loading and push it down: aim again once loaded
    if (document.readyState !== "complete") {
      addEventListener("load", () => target.scrollIntoView(), { once: true });
    }
  }

  // same-page #links: scroll there without putting the #anchor in the bar
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || clean(url.pathname) !== clean(location.pathname)) return;
    const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView();
  });
})();

// Footer "Tech talk" widget: the latest French tech/dev news from a few RSS
// feeds (Korben, Journal du hacker, Developpez.com, Next, LinuxFr.org).
// A static site can't read other sites' RSS from the browser (CORS), so a
// GitHub Action (.github/workflows/feeds.yml → scripts/fetch-feeds.mjs)
// fetches them every 4 hours and commits src/data/feeds.js, which sets
// window.TECH_TALK_FEEDS. It's loaded as a <script> rather than fetched as
// JSON so it also works when a page is opened straight from disk (file://),
// where fetch() of local files is blocked. To change the sources, edit the
// FEEDS list in scripts/fetch-feeds.mjs; nothing here needs to change.
(function () {
  const widgets = document.querySelectorAll("[data-hn-widget]");
  if (!widgets.length) return;

  // feeds.js sits at src/data/, next to src/js/: resolve it from this
  // script's own URL so it doesn't depend on where the page sits.
  const self =
    document.currentScript ||
    Array.from(document.scripts).find((s) => /\/main\.js(\?|$)/.test(s.src));
  if (!self) return;

  const tracks = () =>
    Array.from(widgets)
      .map((w) => w.querySelector("[data-hn-list]"))
      .filter(Boolean);

  const renderError = () => {
    tracks().forEach((track) => {
      track.textContent = "";
      track.style.animation = "none"; // nothing to loop
      const card = document.createElement("div");
      card.className = "hn-card";
      const bar = document.createElement("div");
      bar.className = "hn-card-bar";
      const msg = document.createElement("span");
      msg.className = "opacity-60 text-xs";
      msg.textContent = "Actus indisponibles";
      bar.appendChild(msg);
      card.appendChild(bar);
      track.appendChild(card);
    });
  };

  // "il y a 3 heures", "hier", "il y a 2 jours"…
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const ago = (iso) => {
    const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
    if (!Number.isFinite(seconds)) return "";
    const abs = Math.abs(seconds);
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
    return rtf.format(Math.round(seconds / 86400), "day");
  };

  // One mini "browser window" card per article: favicon + domain in the title
  // bar, the headline as the body. Built with DOM nodes (not innerHTML):
  // titles come from third-party feeds, so they only ever go through
  // textContent.
  const buildCard = (item) => {
    const card = document.createElement("a");
    card.href = item.link;
    card.target = "_blank";
    card.rel = "noopener";
    card.className = "hn-card";

    const bar = document.createElement("div");
    bar.className = "hn-card-bar";

    const favicon = document.createElement("img");
    favicon.className = "hn-card-favicon";
    favicon.src = `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(item.site)}`;
    favicon.alt = "";
    favicon.loading = "lazy";
    favicon.onerror = () => favicon.remove();
    bar.appendChild(favicon);

    const domain = document.createElement("span");
    domain.className = "hn-card-domain";
    domain.textContent = item.site;
    bar.appendChild(domain);

    const body = document.createElement("div");
    body.className = "hn-card-body";

    const title = document.createElement("p");
    title.className = "hn-card-title";
    title.textContent = item.title;
    body.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "hn-card-score";
    meta.textContent = [item.source, ago(item.date)].filter(Boolean).join(" · ");
    body.appendChild(meta);

    card.appendChild(bar);
    card.appendChild(body);
    return card;
  };

  const render = () => {
    const data = window.TECH_TALK_FEEDS;
    const items = (data && Array.isArray(data.items) ? data.items : []).filter(
      (i) => i && i.title && /^https?:\/\//.test(i.link)
    );
    if (!items.length) return renderError();

    tracks().forEach((track) => {
      track.textContent = "";
      // rendered twice back to back: a pure CSS animation (see
      // input.css's .hn-marquee-track) slides the track from 0 to -50%,
      // which is exactly one full set — so it loops with no visible seam
      // and no JS has to touch scroll position at all.
      items.concat(items).forEach((item) => track.appendChild(buildCard(item)));
    });
  };

  const script = document.createElement("script");
  // ?h= changes every hour, so a browser never keeps serving a stale copy
  // for long after the Action has pushed fresh articles.
  script.src = `${new URL("../data/feeds.js", self.src).href}?h=${Math.floor(Date.now() / 3.6e6)}`;
  script.onload = render;
  script.onerror = renderError;
  document.head.appendChild(script);
})();

// Video "sound warning" gate ([data-video-gate]): the poster frame shows
// through immediately, but nothing plays until the visitor clicks through
// the warning overlay, since the video has real audio (no autoplay, no
// surprise sound). Once started, it also auto-pauses the moment it scrolls
// out of view, so it can't keep playing in the background unnoticed.
// The player is either a local <video>, or a poster <img> carrying
// data-video-gate-youtube: that one is swapped for a YouTube embed on click,
// so nothing is requested from YouTube until the visitor asks for it.
(function () {
  const gates = document.querySelectorAll("[data-video-gate]");
  if (!gates.length) return;

  gates.forEach((gate) => {
    const warning = gate.querySelector("[data-video-gate-warning]");
    const startBtn = gate.querySelector("[data-video-gate-start]");
    const player = gate.querySelector("[data-video-gate-player]");
    if (!warning || !startBtn || !player) return;

    const youtubeId = player.dataset.videoGateYoutube;
    let iframe = null;

    startBtn.addEventListener("click", () => {
      warning.remove();
      if (youtubeId) {
        iframe = document.createElement("iframe");
        // enablejsapi lets us pause it from here via postMessage
        iframe.src = `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;
        iframe.title = player.alt || "Vidéo YouTube";
        iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
        iframe.allowFullscreen = true;
        iframe.className = "w-full h-full border-0";
        player.replaceWith(iframe);
        return;
      }
      player.play().catch(() => {
        /* play() needs a fresh user gesture in some browsers — the native
           controls are visible either way, visitor presses play manually */
      });
    });

    function pause() {
      if (iframe) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
          "*"
        );
      } else if (!youtubeId && !player.paused) {
        player.pause();
      }
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) pause();
          });
        },
        { threshold: 0 }
      );
      io.observe(gate);
    }
  });
})();

// Reveal elements tagged with `.reveal` as they scroll into view.
// Respects the user's reduced-motion preference and degrades gracefully.
(function () {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;

  const prefersReduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (prefersReduced || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  // Home page intro (html.intro, see index.html): wait for the background to
  // settle, then zoom the cards already in view in one after another.
  const intro = document.documentElement.classList.contains("intro");
  let firstBatch = intro;

  // Toggle (don't unobserve) so each section zooms in every time it
  // re-enters the viewport while scrolling up or down.
  const io = new IntersectionObserver(
    (entries) => {
      let i = 0;
      entries.forEach((entry) => {
        if (firstBatch && entry.isIntersecting) {
          entry.target.style.transitionDelay = `${0.12 + i++ * 0.12}s`;
        }
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      });
      if (firstBatch) {
        firstBatch = false;
        // drop the stagger once it has played, so later scroll reveals
        // fall back to their normal delay
        setTimeout(() => els.forEach((el) => (el.style.transitionDelay = "")), 2000);
      }
    },
    { threshold: 0.15 }
  );

  const start = () => els.forEach((el) => io.observe(el));
  if (intro) {
    try {
      sessionStorage.setItem("introSeen", "1");
    } catch (e) {
      /* storage blocked: the intro just plays again next time */
    }
    setTimeout(start, 1700);
  } else {
    start();
  }
})();

// Project slider: "voir la suite →" slides to the next project, "← retour" back,
// and the dots under it jump straight to one (one dot per slide).
// Hidden slides are made inert so keyboard focus never lands on them.
(function () {
  const slider = document.querySelector("[data-slider]");
  if (!slider) return;

  const track = slider.querySelector("[data-slider-track]");
  const slides = slider.querySelectorAll("[data-slide]");
  const next = slider.querySelector("[data-slider-next]");
  const prev = slider.querySelector("[data-slider-prev]");
  const dotsHost = slider.querySelector("[data-slider-dots]");
  let current = 0;

  const dots = [...slides].map((_, n) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `Projet ${n + 1} sur ${slides.length}`);
    dot.addEventListener("click", () => show(n));
    dotsHost?.append(dot);
    return dot;
  });

  function show(i) {
    current = i;
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((s, n) => (s.inert = n !== i));
    next.hidden = i === slides.length - 1;
    prev.hidden = i === 0;
    dots.forEach((dot, n) => {
      const active = n === i;
      dot.className = active
        ? "h-2 w-6 rounded-full bg-primary transition-all duration-300 cursor-pointer"
        : "h-2 w-2 rounded-full bg-base-content/30 hover:bg-base-content/60 transition-all duration-300 cursor-pointer";
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  next.addEventListener("click", () => show(current + 1));
  prev.addEventListener("click", () => show(current - 1));
  show(0);
})();

// Project cards tagged [data-hover-video]: on hover, fade in a muted/looping
// preview — either a YouTube embed (data-video-id) or a local file
// (data-video-src). Nothing is created until someone actually hovers, and
// it's torn down shortly after mouseleave, once the fade-out has finished.
(function () {
  const hosts = document.querySelectorAll("[data-hover-video]");
  if (!hosts.length) return;

  hosts.forEach((host) => {
    const videoId = host.dataset.videoId;
    const videoSrc = host.dataset.videoSrc;
    const frame = host.querySelector("[data-hover-video-frame]");
    if ((!videoId && !videoSrc) || !frame) return;

    let el = null;
    let removeTimer = null;

    const build = () => {
      if (videoId) {
        const iframe = document.createElement("iframe");
        iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0`;
        iframe.allow = "autoplay; encrypted-media";
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("title", "Aperçu gameplay");
        return iframe;
      }
      const video = document.createElement("video");
      video.src = videoSrc;
      video.autoplay = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      return video;
    };

    host.addEventListener("mouseenter", () => {
      clearTimeout(removeTimer);
      if (!el) {
        el = build();
        el.className = "w-full h-full object-cover";
        frame.appendChild(el);
      }
      requestAnimationFrame(() => frame.classList.add("opacity-100"));
    });

    host.addEventListener("mouseleave", () => {
      frame.classList.remove("opacity-100");
      removeTimer = setTimeout(() => {
        if (el) {
          el.remove();
          el = null;
        }
      }, 500);
    });
  });
})();

// About page: sticky notes and polaroid can be dragged around the board (desktop only).
// Uses the CSS `translate` property so each note keeps its own rotation.
(function () {
  const board = document.querySelector("[data-board]");
  if (!board) return;

  const desktop = window.matchMedia("(min-width: 1024px)");
  let topZ = 10;

  board.querySelectorAll("[data-draggable]").forEach((el) => {
    let offset = { x: 0, y: 0 };
    let start = null;

    el.addEventListener("pointerdown", (e) => {
      if (!desktop.matches || e.button !== 0) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
      el.style.zIndex = ++topZ; // the last note picked up stays on top

      // how far the element may move before leaving the board
      const b = board.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      start = {
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
        minX: offset.x - (r.left - b.left),
        maxX: offset.x + (b.right - r.right),
        minY: offset.y - (r.top - b.top),
        maxY: offset.y + (b.bottom - r.bottom),
      };
    });

    el.addEventListener("pointermove", (e) => {
      if (!start) return;
      const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
      offset = {
        x: clamp(e.clientX - start.x, start.minX, start.maxX),
        y: clamp(e.clientY - start.y, start.minY, start.maxY),
      };
      el.style.translate = `${offset.x}px ${offset.y}px`;
    });

    const stop = () => {
      start = null;
      el.classList.remove("is-dragging");
    };
    el.addEventListener("pointerup", stop);
    el.addEventListener("pointercancel", stop);

    // back on a small screen, notes return to the normal grid
    desktop.addEventListener("change", () => {
      offset = { x: 0, y: 0 };
      el.style.translate = "";
    });
  });
})();

// Live Discord card. Needs the server widget enabled (Server Settings → Widget)
// and the server ID in data-guild-id. If an invite channel is also picked there,
// the invite is used (not shown) to fetch the server icon and the real member count.
// Anything that fails just stays hidden, leaving the static "300+ membres".
(function () {
  const card = document.querySelector("[data-discord-widget]");
  const guildId = card && card.dataset.guildId;
  if (!guildId) return;

  const $ = (sel) => card.querySelector(sel);
  const getJson = (url) =>
    fetch(url).then((res) => (res.ok ? res.json() : Promise.reject(res.status)));

  getJson(`https://discord.com/api/guilds/${guildId}/widget.json`)
    .then((widget) => {
      $("[data-discord-count]").textContent = widget.presence_count;
      $("[data-discord-online]").hidden = false;

      if (!widget.instant_invite) return;
      const code = widget.instant_invite.split("/").pop();

      return getJson(`https://discord.com/api/v10/invites/${code}?with_counts=true`).then((invite) => {
        if (invite.approximate_member_count) {
          $("[data-discord-members]").textContent = invite.approximate_member_count;
        }
        const icon = invite.guild && invite.guild.icon;
        if (icon) {
          const ext = icon.startsWith("a_") ? "gif" : "png"; // "a_" = animated icon
          const img = $("[data-discord-icon]");
          img.src = `https://cdn.discordapp.com/icons/${invite.guild.id}/${icon}.${ext}?size=128`;
          img.hidden = false;
        }
      });
    })
    .catch(() => {});
})();

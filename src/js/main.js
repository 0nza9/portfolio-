// Footer "Tech talk" widget: pulls the current top Hacker News stories
// client-side via its public API (no key needed). Swap target if HN feels
// too generic later — e.g. a dev.to feed for a specific tag — just change
// the endpoints/mapping below, the markup (data-hn-widget/data-hn-list) and
// the rest of the page can stay the same.
(function () {
  const widgets = document.querySelectorAll("[data-hn-widget]");
  if (!widgets.length) return;

  const STORY_COUNT = 6;

  const renderError = () => {
    widgets.forEach((w) => {
      const track = w.querySelector("[data-hn-list]");
      if (!track) return;
      track.textContent = "";
      track.style.animation = "none"; // nothing to loop
      const card = document.createElement("div");
      card.className = "hn-card";
      const bar = document.createElement("div");
      bar.className = "hn-card-bar";
      bar.innerHTML = '<span class="opacity-60 text-xs">Hacker News indisponible</span>';
      card.appendChild(bar);
      track.appendChild(card);
    });
  };

  // One mini "browser window" card per story: favicon + domain in the title
  // bar, the headline as the body. Built with DOM nodes (not innerHTML) —
  // titles are arbitrary user-submitted text from HN, so they only ever go
  // through textContent.
  const buildCard = (story) => {
    const href = /^https?:\/\//.test(story.url)
      ? story.url
      : `https://news.ycombinator.com/item?id=${story.id}`;
    let hostname = "news.ycombinator.com";
    try {
      hostname = new URL(href).hostname;
    } catch (e) {
      /* keep the HN fallback hostname */
    }

    const card = document.createElement("a");
    card.href = href;
    card.target = "_blank";
    card.rel = "noopener";
    card.className = "hn-card";

    const bar = document.createElement("div");
    bar.className = "hn-card-bar";

    const favicon = document.createElement("img");
    favicon.className = "hn-card-favicon";
    favicon.src = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
    favicon.alt = "";
    favicon.loading = "lazy";
    favicon.onerror = () => favicon.remove();
    bar.appendChild(favicon);

    const domain = document.createElement("span");
    domain.className = "hn-card-domain";
    domain.textContent = hostname.replace(/^www\./, "");
    bar.appendChild(domain);

    const body = document.createElement("div");
    body.className = "hn-card-body";

    const title = document.createElement("p");
    title.className = "hn-card-title";
    title.textContent = story.title;
    body.appendChild(title);

    const score = document.createElement("p");
    score.className = "hn-card-score";
    score.textContent = `▲ ${story.score} pts`;
    body.appendChild(score);

    card.appendChild(bar);
    card.appendChild(body);
    return card;
  };

  fetch("https://hacker-news.firebaseio.com/v0/topstories.json")
    .then((r) => r.json())
    .then((ids) =>
      Promise.all(
        ids
          .slice(0, STORY_COUNT)
          .map((id) =>
            fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) =>
              r.json()
            )
          )
      )
    )
    .then((stories) => {
      const valid = stories.filter(Boolean);
      if (!valid.length) throw new Error("no stories");

      widgets.forEach((w) => {
        const track = w.querySelector("[data-hn-list]");
        const marquee = w.querySelector(".hn-marquee");
        if (!track) return;
        track.textContent = "";
        // the strip is rendered twice back to back so the loop wraps from
        // the end of the first set straight into an identical second set,
        // with no visible seam (see wrap() below)
        valid.concat(valid).forEach((story) => track.appendChild(buildCard(story)));
        if (marquee) setupMarquee(marquee, track);
      });
    })
    .catch(renderError);

  // Auto-advances the strip and lets the mouse grab-drag it left/right (e.g.
  // to catch an article that already scrolled by). No pause-on-hover: the
  // footer sits at the bottom of the page, so the cursor is almost always
  // already resting over it the moment someone scrolls down to look — a
  // hover-pause there means it never visibly moves. Dragging already gives
  // manual control, so only an active drag pauses the auto-advance.
  // Touch devices get native overflow-x panning instead — untouched here,
  // so there's no fight between our manual offset and the browser's own.
  function setupMarquee(marquee, track) {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SPEED = 36; // px/second

    const wrap = () => {
      const half = track.scrollWidth / 2;
      if (half <= 0) return;
      if (marquee.scrollLeft >= half) marquee.scrollLeft -= half;
      else if (marquee.scrollLeft < 0) marquee.scrollLeft += half;
    };

    let dragging = false;
    let dragStartX = 0;
    let dragStartScroll = 0;
    let dragMoved = 0;
    let justDragged = false;

    marquee.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      dragging = true;
      dragMoved = 0;
      dragStartX = e.clientX;
      dragStartScroll = marquee.scrollLeft;
      marquee.classList.add("is-dragging");
      marquee.setPointerCapture(e.pointerId);
    });

    marquee.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      dragMoved = Math.max(dragMoved, Math.abs(dx));
      marquee.scrollLeft = dragStartScroll - dx;
      wrap();
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      marquee.classList.remove("is-dragging");
      if (marquee.hasPointerCapture(e.pointerId)) marquee.releasePointerCapture(e.pointerId);
      if (dragMoved > 5) {
        // it was a drag, not a click: swallow the click a dragged card
        // would otherwise fire so it doesn't navigate away
        justDragged = true;
        setTimeout(() => (justDragged = false), 0);
      }
    };
    marquee.addEventListener("pointerup", endDrag);
    marquee.addEventListener("pointercancel", endDrag);

    track.addEventListener(
      "click",
      (e) => {
        if (justDragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    if (prefersReduced) return; // drag still works; just no automatic motion

    let lastTs = null;
    const tick = (ts) => {
      if (lastTs == null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      if (!dragging) {
        marquee.scrollLeft += SPEED * dt;
        wrap();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
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

  // Toggle (don't unobserve) so each section zooms in every time it
  // re-enters the viewport while scrolling up or down.
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
      });
    },
    { threshold: 0.15 }
  );

  els.forEach((el) => io.observe(el));
})();

// Two-slide project card: "voir la suite →" slides to the next project, "← retour" back.
// The hidden slide is made inert so keyboard focus never lands on it.
(function () {
  const slider = document.querySelector("[data-slider]");
  if (!slider) return;

  const track = slider.querySelector("[data-slider-track]");
  const slides = slider.querySelectorAll("[data-slide]");
  const next = slider.querySelector("[data-slider-next]");
  const prev = slider.querySelector("[data-slider-prev]");

  const show = (i) => {
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((s, n) => (s.inert = n !== i));
    next.hidden = i === slides.length - 1;
    prev.hidden = i === 0;
  };

  next.addEventListener("click", () => show(1));
  prev.addEventListener("click", () => show(0));
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
// Anything that fails just stays hidden, leaving the static "230+ membres".
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

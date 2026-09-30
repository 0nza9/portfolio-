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

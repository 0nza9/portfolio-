// Fetches a few French tech/dev RSS/Atom feeds and writes the latest items to
// src/data/feeds.js for the footer "Tech talk" widget (see main.js).
//
// Run by .github/workflows/feeds.yml every few hours; can also be run by hand:
//   node scripts/fetch-feeds.mjs
// No dependencies: Node 18+ (global fetch), and a small regex-based parser
// that only needs <item>/<entry>, title, link and date.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FEEDS = [
  { source: "Korben", url: "https://korben.info/feed" },
  { source: "Journal du hacker", url: "https://www.journalduhacker.net/rss" },
  { source: "Developpez.com", url: "https://www.developpez.com/index/rss" },
  { source: "Next", url: "https://next.ink/feed/" },
  { source: "LinuxFr.org", url: "https://linuxfr.org/news.atom" },
];

const PER_SOURCE = 3; // newest N per feed, so one busy site can't fill the marquee
const MAX_ITEMS = 12;
const TIMEOUT_MS = 15000;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = resolve(ROOT, "src/data/feeds.js");
const PREFIX = "window.TECH_TALK_FEEDS = ";

// --- tiny XML helpers ------------------------------------------------------

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", laquo: "«", raquo: "»",
  hellip: "…", ndash: "–", mdash: "—", euro: "€",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â",
  ccedil: "ç", icirc: "î", iuml: "ï", ocirc: "ô", ucirc: "û", ugrave: "ù",
  Eacute: "É", Egrave: "È", Agrave: "À", Ccedil: "Ç", oelig: "œ",
};

const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });

// Plain text out of an XML text node: unwrap CDATA, decode, drop any HTML
// tags, decode again (some feeds double-encode, e.g. "&amp;rsquo;").
const toText = (raw = "") => {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const once = decodeEntities(unwrapped).replace(/<[^>]*>/g, "");
  return decodeEntities(once).replace(/\s+/g, " ").trim();
};

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
};

const atomLink = (block) => {
  const links = block.match(/<link\b[^>]*>/gi) || [];
  const attr = (l, a) => (l.match(new RegExp(`\\b${a}="([^"]*)"`, "i")) || [])[1];
  const best = links.find((l) => !attr(l, "rel") || attr(l, "rel") === "alternate") || links[0];
  return best ? decodeEntities(attr(best, "href") || "") : "";
};

const parseFeed = (xml, source) => {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks
    .map((b) => {
      const title = toText(tag(b, "title"));
      const link = (isAtom ? atomLink(b) : toText(tag(b, "link"))) || toText(tag(b, "guid"));
      const rawDate = toText(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated"));
      const date = new Date(rawDate);
      return { title, link, date };
    })
    .filter((i) => i.title && /^https?:\/\//.test(i.link) && !Number.isNaN(i.date.getTime()))
    .sort((a, b) => b.date - a.date)
    .slice(0, PER_SOURCE)
    .map((i) => ({
      title: i.title,
      link: i.link,
      source,
      site: new URL(i.link).hostname.replace(/^www\./, ""),
      date: i.date.toISOString(),
    }));
};

// --- main --------------------------------------------------------------------

const fetchFeed = async ({ source, url }) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; portfolio-tech-talk/1.0)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), source);
};

const results = await Promise.allSettled(FEEDS.map(fetchFeed));

const items = [];
results.forEach((r, i) => {
  if (r.status === "fulfilled") {
    console.log(`✓ ${FEEDS[i].source}: ${r.value.length} article(s)`);
    items.push(...r.value);
  } else {
    console.warn(`✗ ${FEEDS[i].source}: ${r.reason?.message || r.reason}`);
  }
});

if (!items.length) {
  // Every feed failed: keep the previous file rather than blanking the widget.
  console.error("Aucun flux n’a répondu, feeds.js n’est pas modifié.");
  process.exit(1);
}

items.sort((a, b) => new Date(b.date) - new Date(a.date));
const latest = items.slice(0, MAX_ITEMS);

// Skip the write when the articles haven't changed, so the workflow doesn't
// commit every run just because the timestamp moved.
try {
  const previous = JSON.parse((await readFile(OUT_FILE, "utf8")).split(PREFIX)[1].replace(/;\s*$/, ""));
  if (JSON.stringify(previous.items) === JSON.stringify(latest)) {
    console.log("Rien de nouveau, feeds.js inchangé.");
    process.exit(0);
  }
} catch {
  /* no previous file (or unreadable): write a fresh one */
}

const payload = { updated: new Date().toISOString(), items: latest };
await mkdir(dirname(OUT_FILE), { recursive: true });
await writeFile(
  OUT_FILE,
  "// Généré automatiquement par scripts/fetch-feeds.mjs, ne pas modifier à la main.\n" +
    `${PREFIX}${JSON.stringify(payload, null, 2)};\n`,
);
console.log(`feeds.js écrit : ${latest.length} article(s).`);

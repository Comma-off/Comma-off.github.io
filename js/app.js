(() => {
  "use strict";

  const GITHUB_USER = "Comma-off";
  const SUPPORTED_LANGS = ["en", "et", "ru", "es"];
  const DEFAULT_LANG = "en";

  const LANGUAGE_COLORS = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    Rust: "#dea584",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Shell: "#89e051",
    Assembly: "#6E4C13",
    C: "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    Go: "#00ADD8",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Kotlin: "#A97BFF",
    Swift: "#F05138",
    Dockerfile: "#384d54",
    Vue: "#41b883",
  };

  function languageColor(lang) {
    return LANGUAGE_COLORS[lang] || "#8b8b8b";
  }

  /* ------------------------------- i18n ------------------------------- */

  const i18n = {
    dictionaries: {},
    current: DEFAULT_LANG,

    detectInitial() {
      const stored = localStorage.getItem("comma-lang");
      if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
      const browser = (navigator.language || "").slice(0, 2).toLowerCase();
      if (SUPPORTED_LANGS.includes(browser)) return browser;
      return DEFAULT_LANG;
    },

    async load(lang) {
      if (this.dictionaries[lang]) return this.dictionaries[lang];
      const res = await fetch(`i18n/${lang}.json`);
      const dict = await res.json();
      this.dictionaries[lang] = dict;
      return dict;
    },

    t(key, vars) {
      const dict = this.dictionaries[this.current] || {};
      let str = dict[key] ?? this.dictionaries[DEFAULT_LANG]?.[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, v);
        }
      }
      return str;
    },

    applyToDom() {
      document.documentElement.lang = this.current;

      document.querySelectorAll("[data-i18n]").forEach((el) => {
        el.textContent = this.t(el.getAttribute("data-i18n"));
      });

      document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
        const spec = el.getAttribute("data-i18n-attr");
        spec.split(";").forEach((pair) => {
          const [attr, key] = pair.split(":").map((s) => s.trim());
          if (attr && key) el.setAttribute(attr, this.t(key));
        });
      });

      document.querySelectorAll(".lang-chip").forEach((btn) => {
        btn.setAttribute("aria-pressed", String(btn.dataset.lang === this.current));
      });
    },

    async setLanguage(lang) {
      if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
      await this.load(lang);
      if (!this.dictionaries[DEFAULT_LANG]) await this.load(DEFAULT_LANG);
      this.current = lang;
      localStorage.setItem("comma-lang", lang);
      this.applyToDom();
      document.dispatchEvent(new CustomEvent("comma:langchange"));
    },
  };

  /* ------------------------------- Theme ------------------------------- */

  function initTheme() {
    const stored = localStorage.getItem("comma-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
    document.getElementById("theme-toggle").addEventListener("click", () => {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const current = document.documentElement.getAttribute("data-theme") || (prefersDark ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("comma-theme", next);
    });
  }

  /* ------------------------------- Projects ------------------------------- */

  let pinnedReposCache = null;

  async function loadPinnedRepos() {
    if (pinnedReposCache) return pinnedReposCache;
    const res = await fetch("data/pinned-repos.json");
    pinnedReposCache = await res.json();
    return pinnedReposCache;
  }

  function renderProjects(repos) {
    const grid = document.getElementById("projects-grid");
    grid.innerHTML = "";

    repos.forEach((repo) => {
      const card = document.createElement("a");
      card.className = "project-card";
      card.href = repo.url;
      card.target = "_blank";
      card.rel = "noopener";

      const name = document.createElement("p");
      name.className = "project-card__name";
      name.textContent = repo.name;

      const desc = document.createElement("p");
      desc.className = "project-card__desc";
      desc.textContent = i18n.t(repo.descriptionKey);

      const footer = document.createElement("div");
      footer.className = "project-card__footer";

      const langSpan = document.createElement("span");
      if (repo.language) {
        const dot = document.createElement("span");
        dot.className = "lang-dot";
        dot.style.backgroundColor = languageColor(repo.language);
        langSpan.appendChild(dot);
        langSpan.appendChild(document.createTextNode(repo.language));
      } else {
        langSpan.textContent = i18n.t("projects.langNone");
      }

      const link = document.createElement("span");
      link.className = "project-card__link";
      link.textContent = i18n.t("projects.viewRepo") + " →";

      footer.appendChild(langSpan);
      footer.appendChild(link);

      card.appendChild(name);
      card.appendChild(desc);
      card.appendChild(footer);
      grid.appendChild(card);
    });
  }

  async function initProjects() {
    const repos = await loadPinnedRepos();
    renderProjects(repos);
    document.addEventListener("comma:langchange", () => renderProjects(repos));
  }

  /* ------------------------------- GitHub stats ------------------------------- */

  let repoStatsCache = null;
  let eventsCache = null;

  async function fetchGithubRepoStats() {
    if (repoStatsCache) return repoStatsCache;
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?per_page=100`);
    if (!res.ok) throw new Error("repos fetch failed");
    const repos = await res.json();

    const counts = {};
    let totalWithLanguage = 0;
    repos.forEach((r) => {
      if (r.fork) return;
      if (!r.language) return;
      counts[r.language] = (counts[r.language] || 0) + 1;
      totalWithLanguage += 1;
    });

    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([language, count]) => ({ language, count, pct: totalWithLanguage ? Math.round((count / totalWithLanguage) * 100) : 0 }));

    repoStatsCache = { ranked, repoCount: repos.filter((r) => !r.fork).length };
    return repoStatsCache;
  }

  async function fetchGithubEvents() {
    if (eventsCache) return eventsCache;
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/events/public?per_page=8`);
    if (!res.ok) throw new Error("events fetch failed");
    eventsCache = await res.json();
    return eventsCache;
  }

  function relativeTime(dateStr) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return i18n.t("stats.justNow");
    if (mins < 60) return i18n.t("stats.minutesAgo", { n: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return i18n.t("stats.hoursAgo", { n: hours });
    const days = Math.floor(hours / 24);
    return i18n.t("stats.daysAgo", { n: days });
  }

  function eventDescription(event) {
    const key = `event.${event.type}`;
    const repoName = event.repo ? event.repo.name.split("/").pop() : "";
    const hasKey = i18n.dictionaries[i18n.current] && key in i18n.dictionaries[i18n.current];
    return i18n.t(hasKey ? key : "event.default", { repo: repoName });
  }

  function renderLanguageStats(stats) {
    const body = document.getElementById("language-body");
    body.innerHTML = "";

    stats.ranked.forEach(({ language, pct }) => {
      const row = document.createElement("div");
      row.className = "lang-bar-row";

      const label = document.createElement("span");
      label.textContent = language;

      const track = document.createElement("div");
      track.className = "lang-bar-track";

      const fill = document.createElement("div");
      fill.className = "lang-bar-fill";
      fill.style.flexBasis = pct + "%";
      fill.style.backgroundColor = languageColor(language);

      const remainder = document.createElement("div");
      remainder.className = "lang-bar-remainder";

      const stop = document.createElement("div");
      stop.className = "lang-bar-stop";

      track.appendChild(fill);
      track.appendChild(remainder);
      track.appendChild(stop);

      const pctLabel = document.createElement("span");
      pctLabel.textContent = pct + "%";

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(pctLabel);
      body.appendChild(row);
    });

    const count = document.createElement("p");
    count.className = "repo-count";
    count.textContent = `${stats.repoCount} ${i18n.t("stats.repoCount")}`;
    body.appendChild(count);
  }

  function renderActivity(events) {
    const body = document.getElementById("activity-body");
    body.innerHTML = "";

    const list = document.createElement("ul");
    list.className = "activity-list";

    events.slice(0, 8).forEach((event) => {
      const li = document.createElement("li");

      const dot = document.createElement("span");
      dot.className = "activity-dot";

      const textWrap = document.createElement("div");
      const line = document.createElement("div");
      line.textContent = eventDescription(event);

      const time = document.createElement("div");
      time.className = "activity-time";
      time.textContent = relativeTime(event.created_at);

      textWrap.appendChild(line);
      textWrap.appendChild(time);

      li.appendChild(dot);
      li.appendChild(textWrap);
      list.appendChild(li);
    });

    body.appendChild(list);
  }

  function showError(elId) {
    const body = document.getElementById(elId);
    body.innerHTML = "";
    const p = document.createElement("p");
    p.className = "error-text";
    p.textContent = i18n.t("stats.error");
    body.appendChild(p);
  }

  async function initGithubStats() {
    try {
      const stats = await fetchGithubRepoStats();
      renderLanguageStats(stats);
    } catch (e) {
      showError("language-body");
    }

    try {
      const events = await fetchGithubEvents();
      renderActivity(events);
    } catch (e) {
      showError("activity-body");
    }

    document.addEventListener("comma:langchange", async () => {
      if (repoStatsCache) renderLanguageStats(repoStatsCache);
      if (eventsCache) renderActivity(eventsCache);
    });
  }

  /* ------------------------------- Init ------------------------------- */

  function initLangSwitcher() {
    document.querySelectorAll(".lang-chip").forEach((btn) => {
      btn.addEventListener("click", () => i18n.setLanguage(btn.dataset.lang));
    });
  }

  function initDiscordCopy() {
    const btn = document.getElementById("discord-contact");
    if (!btn) return;
    const handleEl = btn.querySelector("[data-handle-text]");
    const originalHandle = btn.dataset.handle;
    let resetTimer = null;

    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(originalHandle);
      } catch (e) {
        /* clipboard unavailable — the handle is still visible to copy by hand */
      }
      handleEl.textContent = i18n.t("contact.discord.copied");
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        handleEl.textContent = originalHandle;
      }, 1800);
    });
  }

  function initScrollSpy() {
    const navLinks = Array.from(document.querySelectorAll(".top-nav a"));
    const tracked = navLinks
      .map((link) => ({ link, section: document.getElementById(link.getAttribute("href").slice(1)) }))
      .filter((entry) => entry.section);

    if (!tracked.length) return;

    const topBar = document.querySelector(".top-bar");
    let ticking = false;

    function updateActive() {
      ticking = false;
      const offset = (topBar ? topBar.offsetHeight : 0) + 24;

      let current = null;
      for (const entry of tracked) {
        if (entry.section.getBoundingClientRect().top - offset <= 0) {
          current = entry;
        }
      }

      // Near the bottom of the page there may not be enough scroll room left for the
      // last section's top to ever cross the offset line, so force it active there.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) {
        current = tracked[tracked.length - 1];
      }

      navLinks.forEach((l) => l.classList.remove("active"));
      if (current) current.link.classList.add("active");
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateActive);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateActive();
  }

  async function init() {
    initTheme();
    initLangSwitcher();
    initDiscordCopy();
    initScrollSpy();
    await i18n.setLanguage(i18n.detectInitial());
    await initProjects();
    await initGithubStats();
  }

  document.addEventListener("DOMContentLoaded", init);
})();

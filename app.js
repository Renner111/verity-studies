const $ = (selector) => document.querySelector(selector);
const state = { topic: "", mode: "text", page: null, images: [] };
const welcome = $("#welcome");
const study = $("#study");

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Source unavailable");
  return response.json();
}

async function getWikipediaTopic(query) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", generator: "search", gsrlimit: "1", gsrsearch: query,
    prop: "extracts|pageimages|info", exintro: "1", explaintext: "1",
    pithumbsize: "1200", inprop: "url", format: "json", origin: "*"
  }).toString();
  const data = await fetchJson(url);
  const pages = data.query && data.query.pages;
  if (!pages) throw new Error("No matching article found");
  return Object.values(pages)[0];
}

async function getImages(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query", generator: "search", gsrnamespace: "6", gsrlimit: "12",
    gsrsearch: query, prop: "imageinfo", iiprop: "url", iiurlwidth: "900",
    format: "json", origin: "*"
  }).toString();
  try {
    const data = await fetchJson(url);
    return Object.values((data.query && data.query.pages) || []).map((page) => ({
      title: (page.title || query).replace(/^File:/, ""),
      url: page.imageinfo && (page.imageinfo[0].thumburl || page.imageinfo[0].url),
      fullUrl: page.imageinfo && page.imageinfo[0].url
    })).filter((image) => image.url);
  } catch (_) { return []; }
}

function splitSentences(text) {
  return (text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function addParagraphs(container, text, count) {
  container.replaceChildren();
  splitSentences(text).slice(0, count).forEach((sentence) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = sentence.trim();
    if (paragraph.textContent) container.appendChild(paragraph);
  });
}

function renderImage(container, image) {
  container.replaceChildren();
  if (!image) {
    const note = document.createElement("div");
    note.className = "image-placeholder";
    note.textContent = "No matching image found";
    container.appendChild(note);
    return;
  }
  const link = document.createElement("a");
  link.href = image.fullUrl || image.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = image.title;
  link.appendChild(img);
  container.appendChild(link);
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  const panel = $(`#${name}Panel`);
  if (panel) panel.classList.add("active");
}

async function performSearch(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (!query) { $("#searchInput").focus(); return; }
  state.topic = query;
  welcome.hidden = true;
  study.hidden = false;
  $("#topicTitle").textContent = query;
  $("#statusText").textContent = "Searching sources…";
  $("#summaryText").textContent = "Loading your overview…";
  $("#messages").replaceChildren();
  history.replaceState(null, "", `?topic=${encodeURIComponent(query)}`);
  try {
    const [page, images] = await Promise.all([getWikipediaTopic(query), getImages(query)]);
    state.page = page;
    state.images = images;
    $("#topicTitle").textContent = page.title || query;
    addParagraphs($("#summaryText"), page.extract || `Explore ${page.title || query} using the sources below.`, 6);
    $("#statusText").textContent = "Sourced overview ready";
    $("#deepDiveTitle").textContent = `Understanding ${page.title || query}`;
    addParagraphs($("#deepDiveText"), page.extract || "No further summary is available.", 22);
    const facts = $("#keyFacts");
    facts.replaceChildren();
    [["Topic", page.title || query], ["Text source", "Wikipedia"], ["Image source", "Wikimedia Commons"]].forEach(([label, value]) => {
      const card = document.createElement("div"); card.className = "fact";
      const heading = document.createElement("strong"); heading.textContent = label;
      const detail = document.createElement("span"); detail.textContent = value;
      card.append(heading, detail); facts.appendChild(card);
    });
    renderImage($("#featuredImage"), images[0]);
    const gallery = $("#galleryGrid"); gallery.replaceChildren();
    $("#imageCount").textContent = String(images.length);
    images.forEach((image) => {
      const figure = document.createElement("figure"); figure.className = "gallery-card";
      const img = document.createElement("img"); img.src = image.url; img.alt = image.title; img.loading = "lazy";
      const link = document.createElement("a"); link.href = image.fullUrl || image.url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.setAttribute("aria-label", `Open image: ${image.title}`); figure.append(img, link); gallery.appendChild(figure);
    });
    const sources = $("#sourcesList"); sources.replaceChildren();
    [[`${page.title || query} — Wikipedia`, "Article and references", page.fullurl], ["Wikimedia Commons", "Matching images", `https://commons.wikimedia.org/wiki/Special:MediaSearch?search=${encodeURIComponent(query)}`]].forEach(([title, detail, href]) => {
      if (!href) return;
      const link = document.createElement("a"); link.className = "source-card"; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      const text = document.createElement("div"); const heading = document.createElement("strong"); heading.textContent = title;
      const description = document.createElement("span"); description.textContent = detail; text.append(heading, description); link.appendChild(text); sources.appendChild(link);
    });
    if (state.mode === "images") showTab("gallery"); else showTab("overview");
  } catch (_) {
    $("#statusText").textContent = "Could not load the overview";
    $("#summaryText").textContent = "The topic could not be loaded from Wikipedia. Check your internet connection or try a shorter topic name.";
  }
}

$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  performSearch($("#searchInput").value);
});
$("#searchInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); performSearch(event.currentTarget.value); }
});
document.querySelectorAll("[data-query]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    performSearch(link.dataset.query);
  });
});
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
    state.mode = button.dataset.mode;
    if (study.hidden) $("#searchInput").placeholder = state.mode === "images" ? "Search for images of any topic…" : "Ask about any topic…";
    else showTab(state.mode === "images" ? "gallery" : "overview");
  });
});
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));
$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#chatInput"); const question = input.value.trim(); if (!question) return;
  const user = document.createElement("div"); user.className = "message user";
  const bubble = document.createElement("div"); bubble.className = "message-bubble"; bubble.textContent = question; user.appendChild(bubble); $("#messages").appendChild(user);
  const reply = document.createElement("div"); reply.className = "message";
  const replyBubble = document.createElement("div"); replyBubble.className = "message-bubble";
  replyBubble.textContent = state.page?.extract ? splitSentences(state.page.extract).slice(0, 3).join(" ") : `Explore ${state.topic} using the overview and sources above.`;
  reply.appendChild(replyBubble); $("#messages").appendChild(reply); input.value = "";
});
$("#newChat").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname);
  welcome.hidden = false; study.hidden = true; $("#searchInput").value = ""; $("#searchInput").focus();
});
$("#shareButton").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); $("#toast").classList.add("show"); setTimeout(() => $("#toast").classList.remove("show"), 1800); }
  catch (_) { window.prompt("Copy this page link:", location.href); }
});

// A topic link can also load directly, so the overview stays on this website.
const initialTopic = new URLSearchParams(location.search).get("topic");
if (initialTopic) performSearch(initialTopic);

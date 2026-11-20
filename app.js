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
  });
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
  });
  try {
    const data = await fetchJson(url);
    return Object.values((data.query && data.query.pages) || []).map((page) => ({
      title: (page.title || query).replace(/^File:/, ""),
      url: page.imageinfo && (page.imageinfo[0].thumburl || page.imageinfo[0].url),
      fullUrl: page.imageinfo && page.imageinfo[0].url
    })).filter((image) => image.url);
  } catch (_) {
    return [];
  }
}

function sentences(text) {
  return (text || "").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
}

function addTextParagraphs(container, text, limit) {
  container.replaceChildren();
  sentences(text).slice(0, limit).forEach((sentence) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = sentence.trim();
    if (paragraph.textContent) container.appendChild(paragraph);
  });
}

function renderFacts(page) {
  const box = $("#keyFacts");
  box.replaceChildren();
  [["Topic", page.title], ["Sources", "Wikipedia and Wikimedia Commons"], ["Status", "Sourced overview"]].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "fact";
    const heading = document.createElement("strong");
    heading.textContent = label;
    const detail = document.createElement("span");
    detail.textContent = value || "Not available";
    card.append(heading, detail);
    box.appendChild(card);
  });
}

function renderFeaturedImage(image) {
  const box = $("#featuredImage");
  box.replaceChildren();
  if (!image) {
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = "No matching image found";
    box.appendChild(placeholder);
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
  box.appendChild(link);
}

function renderGallery(images) {
  const grid = $("#galleryGrid");
  grid.replaceChildren();
  $("#imageCount").textContent = String(images.length);
  if (!images.length) {
    const note = document.createElement("p");
    note.textContent = "No Commons images were found for this topic.";
    grid.appendChild(note);
    return;
  }
  images.forEach((image) => {
    const figure = document.createElement("figure");
    figure.className = "gallery-card";
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = image.title;
    img.loading = "lazy";
    const link = document.createElement("a");
    link.href = image.fullUrl || image.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Open image: ${image.title}`);
    figure.append(img, link);
    grid.appendChild(figure);
  });
}

function renderSources(page) {
  const list = $("#sourcesList");
  list.replaceChildren();
  const sources = [];
  if (page.fullurl) sources.push([`${page.title} — Wikipedia`, "Full article and references", page.fullurl]);
  sources.push(["Wikimedia Commons", "Images for this topic", `https://commons.wikimedia.org/wiki/Special:MediaSearch?search=${encodeURIComponent(state.topic)}`]);
  sources.forEach(([title, detail, url]) => {
    const link = document.createElement("a");
    link.className = "source-card";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const text = document.createElement("div");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("span");
    description.textContent = detail;
    text.append(heading, description);
    link.appendChild(text);
    list.appendChild(link);
  });
}

function renderQuestions(topic) {
  const box = $("#quickQuestions");
  box.querySelectorAll("button").forEach((button) => button.remove());
  [`How did ${topic} begin?`, `Why is ${topic} important?`, `What are some key facts about ${topic}?`].forEach((question) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "question-button";
    button.textContent = question;
    button.addEventListener("click", () => askFollowUp(question));
    box.appendChild(button);
  });
}

async function performSearch(query) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) {
    $("#searchInput").focus();
    return;
  }
  state.topic = cleanQuery;
  welcome.hidden = true;
  study.hidden = false;
  $("#topicTitle").textContent = cleanQuery;
  $("#statusText").textContent = "Searching trusted sources…";
  $("#messages").replaceChildren();
  $("#summaryText").textContent = "Loading your overview…";
  const submitButton = $("#searchForm button[type=submit]");
  submitButton.disabled = true;
  try {
    const [page, images] = await Promise.all([getWikipediaTopic(cleanQuery), getImages(cleanQuery)]);
    state.page = page;
    state.images = images;
    addTextParagraphs($("#summaryText"), page.extract || `Explore ${page.title} using the sources below.`, 5);
    $("#statusText").textContent = "Overview ready";
    $("#deepDiveTitle").textContent = `Understanding ${page.title}`;
    addTextParagraphs($("#deepDiveText"), page.extract || "No further summary is available.", 20);
    renderFacts(page);
    renderFeaturedImage(images[0]);
    renderGallery(images);
    renderSources(page);
    renderQuestions(page.title);
    if (state.mode === "images") showTab("gallery");
  } catch (error) {
    state.page = null;
    $("#statusText").textContent = "Search could not be completed";
    $("#summaryText").textContent = `We couldn't load a matching article for “${cleanQuery}”. Check your internet connection and try a different search.`;
  } finally {
    submitButton.disabled = false;
  }
}

function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  const panel = $(`#${name}Panel`);
  if (panel) panel.classList.add("active");
}

function askFollowUp(question) {
  const messages = $("#messages");
  const addMessage = (text, isUser) => {
    const row = document.createElement("div");
    row.className = isUser ? "message user" : "message";
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    messages.appendChild(row);
  };
  addMessage(question, true);
  const topic = state.page ? state.page.title : state.topic;
  const extract = state.page ? state.page.extract || "" : "";
  const facts = sentences(extract).slice(0, 3).map((text, index) => `${index + 1}. ${text.trim()}`).join(" ");
  addMessage(facts || `Explore “${question}” using the Overview and Sources tabs for ${topic}.`, false);
  messages.scrollTop = messages.scrollHeight;
}

const searchForm = $("#searchForm");
const searchInput = $("#searchInput");

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  performSearch(searchInput.value);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.keyCode === 13) {
    event.preventDefault();
    performSearch(searchInput.value);
  }
});

$("#searchForm button[type=submit]").addEventListener("click", (event) => {
  event.preventDefault();
  performSearch(searchInput.value);
});

document.querySelectorAll("[data-query]").forEach((button) => {
  button.addEventListener("click", () => performSearch(button.dataset.query));
});

document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".mode-button").forEach((item) => item.classList.toggle("active", item === button));
    state.mode = button.dataset.mode;
    if (study.hidden) {
      searchInput.placeholder = state.mode === "images" ? "Search for images of any topic…" : "Ask about any topic…";
    } else {
      showTab(state.mode === "images" ? "gallery" : "overview");
    }
  });
});

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.tab)));

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#chatInput");
  const question = input.value.trim();
  if (!question) return;
  askFollowUp(question);
  input.value = "";
});

$("#newChat").addEventListener("click", () => {
  welcome.hidden = false;
  study.hidden = true;
  searchInput.value = "";
  searchInput.focus();
});

$("#shareButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    const toast = $("#toast");
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1800);
  } catch (_) {
    window.prompt("Copy this page link:", location.href);
  }
});

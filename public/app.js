const $ = (id) => document.getElementById(id);
let records = [],
  filter = "all",
  editing = null,
  busy = false,
  toastTimer;
const names = {
  exploring: "Exploring",
  accepted: "Accepted",
  revisited: "Revisited",
};
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/api/session") showLogin();
    throw new Error(data.error || "Something went wrong.");
  }
  return data;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4500);
}
function showLogin() {
  $("editor").close();
  $("confirm-dialog").close();
  $("workspace").hidden = true;
  $("login").hidden = false;
  records = [];
  $("password").focus();
}
async function load() {
  records = await api("/api/records");
  $("login").hidden = true;
  $("workspace").hidden = false;
  render();
}
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function render() {
  $("total").textContent = records.length;
  $("nav-count").textContent = records.length;
  for (const status of Object.keys(names))
    $(status).textContent = records.filter((r) => r.status === status).length;
  const project = $("project").value;
  $("project").replaceChildren(
    new Option("All projects", ""),
    ...Array.from(new Set(records.map((r) => r.project)))
      .sort()
      .map((p) => new Option(p, p)),
  );
  $("project").value = [...$("project").options].some(
    (o) => o.value === project,
  )
    ? project
    : "";
  const q = $("search").value.trim().toLowerCase();
  const visible = records.filter(
    (r) =>
      (filter === "all" || r.status === filter) &&
      (!$("project").value || r.project === $("project").value) &&
      [r.title, r.project, r.context, r.decision, r.evidence, ...r.tags]
        .join(" ")
        .toLowerCase()
        .includes(q),
  );
  $("result-count").textContent = visible.length;
  $("empty").hidden = visible.length > 0;
  $("empty").querySelector("h2").textContent = records.length
    ? "No decisions match just yet."
    : "A clean page. A fresh perspective.";
  $("empty").querySelector("p").textContent = records.length
    ? "Try another search or project filter."
    : "Add your first decision, or explore the sample journal.";
  $("demo").hidden = records.length > 0;
  $("cards").replaceChildren(
    ...visible.map((r) => {
      const card = node("button", "card");
      card.type = "button";
      card.setAttribute("aria-label", `Open decision: ${r.title}`);
      const top = node("div", "card-top");
      top.append(
        node("span", `badge ${r.status}`, names[r.status]),
        node("span", "card-num", "↗"),
      );
      const tags = node("div", "tags");
      tags.append(...r.tags.map((t) => node("span", "tag", t)));
      const bottom = node("div", "card-bottom");
      bottom.append(
        node("span", "", r.project),
        node(
          "span",
          "",
          new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
          }).format(new Date(r.updated)),
        ),
      );
      card.append(
        top,
        node("h3", "", r.title),
        node(
          "p",
          "",
          r.context || r.decision || "A thought waiting to take shape.",
        ),
        tags,
        bottom,
      );
      card.addEventListener("click", () => openEditor(r));
      return card;
    }),
  );
  document.querySelectorAll("[data-filter]").forEach((b) => {
    b.classList.toggle("active", b.dataset.filter === filter);
    b.setAttribute("aria-pressed", String(b.dataset.filter === filter));
  });
}
function openEditor(record = null) {
  editing = record;
  $("record-form").reset();
  $("form-error").textContent = "";
  $("editor-title").textContent = record
    ? "The reasoning behind it"
    : "A new decision";
  $("delete").hidden = !record;
  if (record) {
    for (const key of [
      "title",
      "project",
      "status",
      "context",
      "decision",
      "evidence",
    ])
      $("record-form").elements.namedItem(key).value = record[key];
    $("tags").value = record.tags.join(", ");
  }
  $("editor").showModal();
  $("title").focus();
}
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  $("login-error").textContent = "";
  try {
    await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ password: $("password").value }),
    });
    $("password").value = "";
    await load();
  } catch (e) {
    $("login-error").textContent = e.message;
  } finally {
    button.disabled = false;
  }
});
$("new").onclick = () => openEditor();
$("empty-new").onclick = () => openEditor();
$("close-editor").onclick = () => {
  if (!busy) $("editor").close();
};
$("editor").addEventListener("cancel", (e) => {
  if (busy) e.preventDefault();
});
$("search").oninput = render;
$("project").onchange = render;
for (const button of document.querySelectorAll("[data-filter]"))
  button.onclick = () => {
    filter = button.dataset.filter;
    render();
  };
$("record-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  $("save").disabled = true;
  $("delete").disabled = true;
  $("form-error").textContent = "";
  const input = Object.fromEntries(new FormData(event.currentTarget));
  input.tags = input.tags
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (editing) input.version = editing.version;
  try {
    await api(editing ? `/api/records/${editing.id}` : "/api/records", {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(input),
    });
    $("editor").close();
    await load();
    toast("Decision saved. A little more clarity.");
  } catch (e) {
    $("form-error").textContent = e.message;
  } finally {
    busy = false;
    $("save").disabled = false;
    $("delete").disabled = false;
  }
});
$("delete").onclick = () => $("confirm-dialog").showModal();
$("cancel-delete").onclick = () => $("confirm-dialog").close();
$("confirm-delete").onclick = async () => {
  if (busy) return;
  busy = true;
  $("confirm-delete").disabled = true;
  try {
    await api(`/api/records/${editing.id}`, {
      method: "DELETE",
      body: JSON.stringify({ version: editing.version }),
    });
    $("confirm-dialog").close();
    $("editor").close();
    await load();
    toast("Decision removed.");
  } catch (e) {
    $("confirm-dialog").close();
    $("form-error").textContent = e.message;
  } finally {
    busy = false;
    $("confirm-delete").disabled = false;
  }
};
$("logout").onclick = async () => {
  try {
    await api("/api/session", { method: "DELETE" });
    showLogin();
  } catch (e) {
    toast(e.message);
  }
};
$("export").onclick = () => {
  window.location.assign("/api/export");
};
const sample = [
  {
    title: "Start small. Choose SQLite.",
    project: "Trace",
    status: "accepted",
    context:
      "Our first release needs durable storage without an operations team. One workspace, one server, and an easy backup story.",
    decision:
      "Use SQLite with WAL mode and parameterized queries. Revisit when we need multiple writers across servers.",
    evidence:
      "Constraint: a single self-hosted instance. Validate restore and write-conflict behavior before release.",
    tags: ["architecture", "simplicity"],
  },
  {
    title: "Can less interface mean more clarity?",
    project: "Design system",
    status: "exploring",
    context:
      "Decision tools often look like spreadsheets. We want a quieter space that makes thoughtful writing feel inviting.",
    decision:
      "Explore warm neutrals, editorial typography, and generous space. Use text alongside status colors.",
    evidence:
      "Next experiment: ask five builders to create a decision without instructions. Measure completion and confusion.",
    tags: ["design", "experiment"],
  },
  {
    title: "Keep the evidence with the choice.",
    project: "Trace",
    status: "accepted",
    context:
      "A conclusion without its assumptions quickly loses meaning. Future contributors need to understand the path, too.",
    decision:
      "Make context, decision, and evidence separate fields. Support plain text so content stays portable.",
    evidence:
      "A record can be exported without proprietary formatting. Search covers every field.",
    tags: ["product", "portability"],
  },
  {
    title: "Rethinking our release cadence",
    project: "Release lab",
    status: "revisited",
    context:
      "Weekly releases helped us learn, but maintenance started crowding out deeper work. It is time to adjust.",
    decision:
      "Try a fortnightly release for the next six weeks, with urgent fixes shipped as needed.",
    evidence:
      "Track time spent on release tasks and compare lead time. Review after three releases.",
    tags: ["workflow", "learning"],
  },
  {
    title: "Passwords without another service",
    project: "Trace",
    status: "accepted",
    context:
      "A private journal should not require an account with a third-party identity provider to get started.",
    decision:
      "Use a shared workspace password, server-side sessions, strict cookies, and origin checks.",
    evidence:
      "This model fits a personal workspace. It does not provide per-user roles or audit identity.",
    tags: ["security", "self-hosting"],
  },
  {
    title: "What should we protect from change?",
    project: "Research notebook",
    status: "exploring",
    context:
      "Fast iteration is useful only when we can tell what it improved and what it damaged.",
    decision:
      "Write the expected benefit and the thing we cannot afford to lose before each experiment.",
    evidence:
      "Collect before-and-after measurements. Look for counterexamples rather than only confirming signals.",
    tags: ["research", "tradeoffs"],
  },
];
$("demo").onclick = async () => {
  if (busy) return;
  busy = true;
  $("demo").disabled = true;
  try {
    for (const record of sample)
      await api("/api/records", {
        method: "POST",
        body: JSON.stringify(record),
      });
    await load();
    toast("Sample journal added. Make it your own.");
  } catch (e) {
    toast(e.message);
    await load().catch(() => {});
  } finally {
    busy = false;
    $("demo").disabled = false;
  }
};
try {
  const session = await api("/api/session");
  if (session.authenticated) await load();
  else showLogin();
} catch (e) {
  showLogin();
  $("login-error").textContent =
    "Unable to reach the workspace. Reload to try again.";
}

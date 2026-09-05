import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCanvas, joinSession } from "@github/copilot-sdk/extension";

const execFileAsync = promisify(execFile);
const servers = new Map();

async function loadIssues() {
    const { stdout } = await execFileAsync("gh", [
        "issue", "list", "--state", "open", "--limit", "50",
        "--json", "number,title,body,updatedAt,url",
    ]);
    return JSON.parse(stdout);
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function triageReason(issue) {
    const title = issue.title.toLowerCase();
    if (title.includes("pagination")) {
        return "A performance and scalability improvement that keeps the catalog usable as more games are added.";
    }
    if (title.includes("search")) {
        return "Removes a direct discovery barrier for players and enables faster catalog triage.";
    }
    if (title.includes("publisher")) {
        return "Improves navigation through an existing data relationship and creates a reusable catalog surface.";
    }
    return "This open product improvement should be reviewed alongside the higher-impact catalog work.";
}

function renderCard(issue, featured) {
    return `<article class="card ${featured ? "featured" : ""}">
      <div class="topline"><span class="number">#${issue.number}</span><span class="status">Open</span></div>
      <h3>${escapeHtml(issue.title)}</h3>
      <p class="description">${escapeHtml(issue.body?.trim() || "No description provided.")}</p>
      ${featured ? `<p class="why"><strong>Why it is here:</strong> ${escapeHtml(triageReason(issue))}</p>` : ""}
      <div class="footer"><a href="${escapeHtml(issue.url)}" target="_blank" rel="noreferrer">View issue</a><button data-issue="${issue.number}" data-testid="add-issue-${issue.number}">Add to current context</button></div>
      <p class="feedback" aria-live="polite" data-feedback="${issue.number}"></p>
    </article>`;
}

function renderHtml(issues) {
    const top = issues.slice(0, 3);
    const remaining = issues.slice(3);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Issue triage board</title>
    <style>
      :root{color-scheme:light dark;--bg:var(--background-color-default,#fff);--text:var(--text-color-default,#1f2328);--muted:var(--text-color-muted,#656d76);--border:var(--border-color-default,#d0d7de);--accent:var(--true-color-blue,#0969da);--accent-muted:var(--true-color-blue-muted,#ddf4ff)}
      *{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bg);color:var(--text);font-family:var(--font-sans,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif);line-height:1.5}main{max-width:1100px;margin:auto}header{display:flex;justify-content:space-between;align-items:end;gap:16px;margin-bottom:24px}h1,h2,h3,p{margin-top:0}h1{margin-bottom:4px;font-size:26px}h2{margin:28px 0 12px;font-size:17px}h3{margin-bottom:10px;font-size:16px}.subtitle,.description,.feedback,.count{color:var(--muted)}.subtitle{margin-bottom:0}.count{font-size:13px;white-space:nowrap}.board{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.card{display:flex;flex-direction:column;min-height:260px;padding:16px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb,var(--bg) 94%,var(--border))}.featured{border-color:var(--accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}.topline,.footer{display:flex;justify-content:space-between;align-items:center;gap:10px}.topline{margin-bottom:12px}.number{color:var(--accent);font-weight:600}.status{padding:2px 8px;border-radius:999px;background:var(--accent-muted);color:var(--accent);font-size:12px}.description{font-size:13px;white-space:pre-line}.why{padding:10px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent-muted) 55%,transparent);font-size:13px}.footer{margin-top:auto;padding-top:14px}a{color:var(--accent)}button{border:1px solid var(--accent);border-radius:6px;padding:7px 10px;background:var(--accent);color:white;cursor:pointer;font:inherit;font-size:12px}button:focus-visible,a:focus-visible{outline:2px solid var(--color-focus-outline,#0969da);outline-offset:2px}.feedback{min-height:20px;margin:8px 0 0;font-size:12px}@media(max-width:560px){body{padding:16px}header{display:block}.count{display:block;margin-top:8px}}
    </style></head><body><main>
      <header><div><h1>Issue triage board</h1><p class="subtitle">The highest-impact open work is surfaced first.</p></div><span class="count">${issues.length} open issue${issues.length === 1 ? "" : "s"}</span></header>
      <h2>Needs attention now</h2><section class="board" aria-label="Issues needing attention">${top.length ? top.map((issue) => renderCard(issue, true)).join("") : "<p>No open issues found.</p>"}</section>
      ${remaining.length ? `<h2>Remaining open work</h2><section class="board" aria-label="Remaining open issues">${remaining.map((issue) => renderCard(issue, false)).join("")}</section>` : ""}
    </main><script>
      document.querySelectorAll("button[data-issue]").forEach((button)=>button.addEventListener("click",async()=>{
        const feedback=document.querySelector("[data-feedback='"+button.dataset.issue+"']");button.disabled=true;feedback.textContent="Adding to current context…";
        try{const response=await fetch("/add-to-context",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({number:Number(button.dataset.issue)})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Unable to add issue");feedback.textContent="Added to current context."}catch(error){feedback.textContent=error.message;button.disabled=false}
      }));
    </script></body></html>`;
}

async function startServer(issues) {
    const server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/add-to-context") {
            let body = "";
            req.on("data", (chunk) => { body += chunk; });
            req.on("end", async () => {
                try {
                    const { number } = JSON.parse(body);
                    const issue = issues.find((candidate) => candidate.number === number);
                    if (!issue) throw new Error("Issue is not in this board.");
                    await addToContext(issue);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true }));
                } catch (error) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(renderHtml(issues));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    return { server, url: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/` };
}

async function addToContext(issue) {
    return session.send({ prompt: `Add GitHub issue #${issue.number} to the current working context.\n\nTitle: ${issue.title}\n\nDescription:\n${issue.body || "No description provided."}\n\nIssue URL: ${issue.url}` });
}

const session = await joinSession({
    canvases: [createCanvas({
        id: "kanban-triage",
        displayName: "Issue triage board",
        description: "A Kanban board that ranks open repository issues and adds selected issues to the current session context.",
        actions: [{
            name: "add_issue_to_context",
            description: "Add an open issue from the board to the current session context.",
            inputSchema: { type: "object", properties: { number: { type: "integer" } }, required: ["number"], additionalProperties: false },
            handler: async (ctx) => {
                const issues = await loadIssues();
                const issue = issues.find((candidate) => candidate.number === ctx.input.number);
                if (!issue) throw new Error(`Open issue #${ctx.input.number} was not found.`);
                const messageId = await addToContext(issue);
                return { ok: true, issue: issue.number, messageId };
            },
        }],
        open: async (ctx) => {
            let entry = servers.get(ctx.instanceId);
            if (!entry) {
                const issues = (await loadIssues()).sort((a, b) => {
                    const priority = (issue) => ["pagination", "search", "publisher"].some((term) => issue.title.toLowerCase().includes(term)) ? 1 : 0;
                    return priority(b) - priority(a) || new Date(b.updatedAt) - new Date(a.updatedAt);
                });
                entry = await startServer(issues);
                servers.set(ctx.instanceId, entry);
            }
            return { title: "Issue triage board", url: entry.url };
        },
        onClose: async (ctx) => {
            const entry = servers.get(ctx.instanceId);
            if (entry) {
                servers.delete(ctx.instanceId);
                await new Promise((resolve) => entry.server.close(resolve));
            }
        },
    })],
});

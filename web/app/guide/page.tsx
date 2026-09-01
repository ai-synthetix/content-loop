"use client";
import Link from "next/link";
import { useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";

type Tab = "pipeline" | "projects" | "channels";

const STAGES = [
  { key: "idea", label: "Idea", icon: "💡", hint: "Title + raw brief", caption: "human seeds", bg: "#143054", border: "#2a5a8a", statuses: ["idea"] },
  { key: "brief", label: "Brief", icon: "📋", hint: "audience, intent, claims", caption: "AI scaffolds", bg: "#101f36", border: "#2a3a52", statuses: ["brief_ready"] },
  { key: "draft", label: "Draft", icon: "✍️", hint: "canonical markdown", caption: "AI drafts (human editable)", bg: "#1e1a08", border: "#4a3d16", statuses: ["drafting"] },
  { key: "review", label: "Review", icon: "👁️", hint: "human gate", caption: "human approves", bg: "#231a0a", border: "#5a3420", statuses: ["review_ready", "changes_requested", "rejected"] },
  { key: "approved", label: "Approved", icon: "✅", hint: "ready to publish", caption: "human decision", bg: "#123825", border: "#2a6b3a", statuses: ["approved", "scheduled"] },
  { key: "publish", label: "Publish", icon: "📡", hint: "per-channel delivery", caption: "adapters per channel", bg: "#0f2a4d", border: "#2a4a7a", statuses: ["publishing", "published", "partially_published", "failed"] },
  { key: "measuring", label: "Measuring", icon: "📊", hint: "views, reactions", caption: "auto + manual", bg: "#2e1e08", border: "#6b3d16", statuses: ["measuring"] },
  { key: "reflected", label: "Reflected", icon: "💭", hint: "learnings → next test", caption: "LLM hypotheses / human", bg: "#1a1633", border: "#3a2a5a", statuses: ["reflected"] },
] as const;

const STATUSES = [
  { status: "idea", desc: "Seed — title + raw brief. Entry point.", owner: "human" },
  { status: "brief_ready", desc: "Structured brief (audience, intent, claims).", owner: "AI scaffolds, human edits" },
  { status: "drafting", desc: "Canonical markdown being produced.", owner: "AI" },
  { status: "review_ready", desc: "Draft awaiting human gate.", owner: "AI → human" },
  { status: "approved", desc: "Human approved — ready to schedule/publish.", owner: "human" },
  { status: "changes_requested", desc: "Feedback loop — re-draft or revise.", owner: "human → AI" },
  { status: "rejected", desc: "Closed or reset to idea/drafting.", owner: "human" },
  { status: "scheduled", desc: "Publish time set, waiting.", owner: "human" },
  { status: "publishing", desc: "Fan-out to channels in progress.", owner: "system" },
  { status: "published", desc: "Delivered to all selected channels.", owner: "system" },
  { status: "partially_published", desc: "Some channels succeeded, some failed.", owner: "system" },
  { status: "failed", desc: "Delivery failed — retryable.", owner: "system" },
  { status: "measuring", desc: "Collecting views / reactions.", owner: "system + human" },
  { status: "reflected", desc: "Learnings extracted → next hypothesis.", owner: "AI hypotheses, human judges" },
];

export default function GuidePage() {
  const [tab, setTab] = useState<Tab>("pipeline");
  return (
    <div style={{ maxWidth: 1150 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 6px" }}>Guide — Content Loop</h1>
      <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#cfe0ff", marginBottom: 8 }}>Идея — Tinder для контента</div>
        <p style={{ fontSize: 13, color: "#8FA0B8", lineHeight: 1.6, margin: 0 }}>
          Раньше человек делал всё сам: придумывал тему, писал черновик, вычитывал, публиковал, смотрел реакцию. Сейчас AI генерит в 100 раз быстрее, но люди будут всё хуже <em style={{ color: "#cfe0ff" }}>создавать</em> — и всё лучше <em style={{ color: "#cfe0ff" }}>валидировать</em>.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", margin: "12px 0", background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 22 }}>👤</div>
            <div style={{ fontSize: 11, color: "#cfe0ff", fontWeight: 700 }}>человек</div>
            <div style={{ fontSize: 10, color: "#6fdc8c" }}>валидирует да / нет</div>
            <div style={{ fontSize: 9, color: "#5a6b86", marginTop: 2 }}>свайп Approve / Reject</div>
          </div>
          <div style={{ fontSize: 16, color: "#3D8DFF", fontWeight: 700 }}>⇄</div>
          <div style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 22 }}>🤖</div>
            <div style={{ fontSize: 11, color: "#cfe0ff", fontWeight: 700 }}>AI</div>
            <div style={{ fontSize: 10, color: "#8FA0B8" }}>генерит бриф / драфт / варианты</div>
            <div style={{ fontSize: 9, color: "#5a6b86", marginTop: 2 }}>mimo-v2.5 + адаптеры</div>
          </div>
        </div>
        <p style={{ fontSize: 13, color: "#8FA0B8", lineHeight: 1.6, margin: "8px 0 0" }}>
          Как в Тиндере ты не пишешь анкеты за других, а просто свайпаешь <span style={{ color: "#6fdc8c", fontWeight: 700 }}>да</span> / <span style={{ color: "#ff8a8a", fontWeight: 700 }}>нет</span> — так и тут: AI предлагает бриф → драфт → варианты под каналы, а ты жмёшь <span style={{ background: "#0e2e1a", border: "1px solid #1f4a2b", borderRadius: 6, padding: "1px 6px", color: "#6fdc8c", fontWeight: 700 }}>Approve</span> / Request changes / Reject. Система сама паблишит, через 3ч/24ч/7д снимет метрики и предложит <code style={{ background: "#0b1420", padding: "1px 5px", borderRadius: 4 }}>next_test</code>.
        </p>
        <p style={{ fontSize: 11, color: "#5a6b86", margin: "10px 0 0", lineHeight: 1.5 }}>
          Цель — человек всё меньше пишет руками, всё больше валидирует. Контроль остаётся у человека (гейт на Review 👤), рутина — у AI 🤖 и адаптеров. Луп замыкается: <code style={{ background: "#0b1420", padding: "1px 5px", borderRadius: 4 }}>reflected → новая idea</code>.
        </p>
      </div>
      <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 14px", lineHeight: 1.5, color: "#5a6b86" }}>
        Ниже — как это устроено технически: 8 шагов пайплайна, в каждом — реальные статусы системы.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["pipeline", "projects", "channels"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "7px 14px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: tab === t ? "1px solid #3D8DFF" : "1px solid #1e2f44",
              background: tab === t ? "#162a45" : "#0f1620",
              color: tab === t ? "#cfe0ff" : "#8FA0B8",
            }}
          >
            {t === "pipeline" ? "Pipeline" : t === "projects" ? "Projects" : "Channels"}
          </button>
        ))}
      </div>

      {tab === "pipeline" && (
        <>
          <h2 style={{ fontSize: 16, margin: "10px 0 10px" }}>Pipeline — idea → reflected</h2>

          <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: "14px 10px 18px", overflowX: "auto" }}>
            <div style={{ position: "relative", height: 28, marginTop: 12, marginBottom: -2, minWidth: 980 }}>
              <div style={{ position: "absolute", left: "50%", top: -7, transform: "translateX(-50%)", fontSize: 11, fontWeight: 600, color: "#c4b5fd", zIndex: 1, whiteSpace: "nowrap" }}>Инсайт → новая идея</div>
              <div style={{ position: "absolute", left: "5.5%", right: "6.5%", top: 8, height: 1, background: "#8b5cf6" }} />
              <div style={{ position: "absolute", left: "5.5%", top: 8, width: 1, height: 24, background: "#8b5cf6" }} />
              <div style={{ position: "absolute", right: "6.5%", top: 8, width: 1, height: 24, background: "#8b5cf6" }} />
              <div style={{ position: "absolute", left: "5.5%", top: 32, width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "8px solid #8b5cf6", marginLeft: -6 }} />
            </div>
            <div style={{ minWidth: 980, position: "relative", paddingBottom: 0, height: 285 }}>
              <div style={{ position: "absolute", left: "50px", right: "50px", top: "59px", height: "1px", background: "#4a3a7a", opacity: 0.9, pointerEvents: "none" }} />
              <div style={{ display: "flex", alignItems: "stretch", gap: 8, height: 285, position: "relative", zIndex: 1 }}>
                {STAGES.map((st, i) => (
                  <div key={st.key} style={{ display: "flex", alignItems: "flex-start", flex: 1, gap: 0 }}>
                    <div style={{ flex: 1, textAlign: "center", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
                      <div style={{ height: 110, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", marginBottom: 8 }}>
                        {st.statuses.length > 1 ? (
                          <div
                            style={{
                              background: "#182030",
                              border: `1px solid ${st.border}55`,
                              borderRadius: 8,
                              padding: "8px 6px",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            {st.statuses.map((s) => (
                              <StatusBadge key={s} status={s} size={10} />
                            ))}
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: "6px 0",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 6,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            {st.statuses.map((s) => (
                              <StatusBadge key={s} status={s} size={10} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minHeight: 6 }} />
                      <div
                        style={{
                          width: 1,
                          height: 32,
                          background: "#2a3a52",
                          opacity: 0.6,
                          marginBottom: 6,
                          marginTop: -16,
                        }}
                      />
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: 110, justifyContent: "center" }}>
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 12,
                            background: st.bg,
                            border: `1px solid ${st.border}`,
                            display: "grid",
                            placeItems: "center",
                            fontSize: 16,
                            flexShrink: 0,
                          }}
                        >
                          {st.icon}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#cfe0ff", textAlign: "center" }}>{st.label}</div>
                        <div style={{ fontSize: 10, color: "#8FA0B8", lineHeight: 1.2, minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{st.hint}</div>
                        <div style={{ fontSize: 10, color: "#5a6b86", fontWeight: 400, minHeight: 14, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>{st.caption}</div>
                        <div style={{ fontSize: 9, color: st.owner.includes("human") ? "#6fdc8c" : st.owner === "AI" ? "#8FA0B8" : "#8b9dff", background: "rgba(255,255,255,0.05)", border: "1px solid #1e2f44", borderRadius: 10, padding: "1px 6px", marginTop: 2, whiteSpace: "nowrap" }}>
                          {st.owner.includes("human") && st.owner.includes("AI") ? "👤🤖" : st.owner.includes("human") ? "👤" : st.owner === "AI" ? "🤖" : st.owner.includes("system") ? "⚙️" : "•"} {st.owner}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#8FA0B8" }}>
            <span style={{ background: "#1a2740", border: "1px solid #2a3a52", borderRadius: 20, padding: "4px 10px" }}>Human gate at Review</span>
            <span style={{ background: "#0e2e1a", border: "1px solid #1f4a2b", borderRadius: 20, padding: "4px 10px" }}>Channel-state is independent</span>
            <span style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 20, padding: "4px 10px" }}>Idempotency key prevents double-post</span>
          </div>

          <div style={{ marginTop: 14, background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 10, padding: 12, overflowX: "auto" }}>
            <div style={{ fontSize: 11, color: "#5a6b86", marginBottom: 4 }}>ASCII</div>
            <pre style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "#8FA0B8", whiteSpace: "pre" }}>{`idea → brief_ready → drafting → review_ready → approved → publishing → published → measuring → reflected
                        ↘ rejected ↘ changes_requested → drafting
                                    ↘ scheduled → publishing → failed ↻ → publishing
                                                  → partially_published`}</pre>
          </div>

          <h2 style={{ fontSize: 16, margin: "24px 0 10px" }}>Statuses</h2>
          <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, overflow: "hidden", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #1e2f44", background: "#0b1420" }}>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Description</th>
                  <th style={{ padding: "8px 10px" }}>Owner</th>
                </tr>
              </thead>
              <tbody>
                {STATUSES.map((r) => (
                  <tr key={r.status} style={{ borderBottom: "1px solid #1e2f44" }}>
                    <td style={{ padding: "8px 10px" }}>
                      <StatusBadge status={r.status} size={11} />
                    </td>
                    <td style={{ padding: "8px 10px", color: "#8FA0B8" }}>{r.desc}</td>
                    <td style={{ padding: "8px 10px", color: "#5a6b86", fontSize: 11 }}>{r.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "8px 10px", fontSize: 11, color: "#5a6b86" }}>
              Transitions are validated server-side via <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>domain.ValidTransitions</code> — e.g. <code>approved → publishing</code> is allowed, <code>idea → published</code> is not.
            </div>
          </div>
        </>
      )}

      {tab === "projects" && (
        <>
          <h2 style={{ fontSize: 16, margin: "10px 0 10px" }}>Projects & Queue</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
              <strong style={{ fontSize: 13, color: "#cfe0ff" }}>Queue</strong> <span style={{ fontSize: 11, color: "#5a6b86" }}>— GET /api/v1/content-items</span>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8FA0B8" }}>
                The review queue: all items for the signed-in owner, newest first. Click a title to open <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>/items/[id]</code> — stepper shows progress, badge shows status, channels selector picks delivery.
              </p>
            </div>
            <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
              <strong style={{ fontSize: 13, color: "#cfe0ff" }}>Projects</strong> <span style={{ fontSize: 11, color: "#5a6b86" }}>— /projects</span>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8FA0B8" }}>
                A project owns editorial policy (languages, channels list, policy JSON). Every content item belongs to one project. Opening <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>/projects/[id]</code> lets you manage its channels. Required when creating an item.
              </p>
            </div>
            <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
              <strong style={{ fontSize: 13, color: "#cfe0ff" }}>Creating an item</strong>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8FA0B8" }}>
                Queue → <strong>+ New item</strong> → title + brief + project → Create. Brief is auto-scaffolded; open the item and click <strong>Generate</strong> to draft. Iterate via Review gate until approved.
              </p>
            </div>
          </div>
        </>
      )}

      {tab === "channels" && (
        <>
          <h2 style={{ fontSize: 16, margin: "10px 0 10px" }}>Channels</h2>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
              <strong style={{ fontSize: 13, color: "#cfe0ff" }}>Channels</strong> <span style={{ fontSize: 11, color: "#5a6b86" }}>— /settings/channels</span>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8FA0B8" }}>
                Per-user, per-project channel bindings. Each channel has a <code>type</code> (e.g. <code>telegram</code>, <code>familyos_pattayadom</code>), encrypted config, and a connectivity <code>status</code>. Use “Check” to verify. Channels are selected at the item level before publish; Channel-state is independent of the item status.
              </p>
            </div>
            <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#cfe0ff", marginBottom: 8 }}>Channels are pluggable — the <code style={{ background: "#0b1420", padding: "2px 6px", borderRadius: 6, fontSize: 12 }}>Publisher</code> interface</div>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8FA0B8" }}>
                Every adapter implements <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>adapters.Publisher</code> (<code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>internal/adapters/publisher.go</code>). Adding a channel means adding a struct — no core changes.
              </p>
              <pre style={{ margin: 0, background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 10, padding: 12, overflowX: "auto", fontSize: 11, lineHeight: 1.6, color: "#cfe0ff" }}>{`type Publisher interface {
  Name() string
  Capabilities() Capabilities        // supports_draft / publish / metrics / delete
  Validate(ctx, payload) error
  CreateDraft(ctx, payload, idempotencyKey) (*PublicationResult, error)
  UpdateDraft(ctx, externalID, payload) (*PublicationResult, error)
  Publish(ctx, externalID, schedule) (*PublicationResult, error)
  Unpublish(ctx, externalID) error
  FetchPublication(ctx, externalID) (*PublicationResult, error)
  FetchMetrics(ctx, externalID, since) (*Metrics, error)
}

// Factory builds the right Publisher from DB row:
factory.PublisherForChannel(ctx, channelID, ownerUserID) (Publisher, error)
// decrypts Channel.config_encrypted → selects adapter by Channel.type`}</pre>
              <ul style={{ margin: "10px 0 0", paddingLeft: 16, fontSize: 12, color: "#8FA0B8", lineHeight: 1.7 }}>
                <li>
                  <code>telegram</code> — Telegram Bot API (existing adapter in <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>internal/adapters/telegram</code>)
                </li>
                <li>
                  <code>familyos_pattayadom</code> — FamilyOS PattayaDom (existing in <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>internal/adapters/familyos</code>)
                </li>
                <li>
                  New type → implement <code>Publisher</code>, register in <code>adapters/factory.go:PublisherFromChannel</code>, add capability flags.
                </li>
                <li>
                  Idempotency: <code>createDraft</code> takes <code>idempotencyKey</code> (publication.idempotency_key) to prevent double-post.
                </li>
              </ul>
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/" style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "9px 16px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
          Go to Queue →
        </Link>
        <Link href="/projects" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8fb8ff", borderRadius: 10, padding: "9px 16px", textDecoration: "none", fontSize: 13 }}>
          Projects
        </Link>
        <Link href="/settings/channels" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8fb8ff", borderRadius: 10, padding: "9px 16px", textDecoration: "none", fontSize: 13 }}>
          Channels
        </Link>
      </div>

      <p style={{ marginTop: 18, fontSize: 11, color: "#5a6b86" }}>
        API base: <code style={{ background: "#0b1420", padding: "1px 6px", borderRadius: 6 }}>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8081"}</code> · Pipeline enforcement is server-side; the UI reflects the state machine but never bypasses it.
      </p>
    </div>
  );
}

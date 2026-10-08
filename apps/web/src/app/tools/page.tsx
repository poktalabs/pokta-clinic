import type { Metadata } from "next";
import { GUARDRAILS, TOOLS } from "@/explainer/model";
import catalog from "@/tools-catalog/catalog.json";
import { DETAILS, SHARED_REPLIES, SYSTEMS, type System } from "@/tools-catalog/details";
import styles from "./tools.module.css";

export const metadata: Metadata = {
  title: "Agent tools: PoktaClinic",
  description: "Every ElevenLabs tool the PoktaClinic agent calls: parameters, workflow node, what it calls downstream, guardrails and what it tells the LLM.",
};

// A cheat sheet of every tool the agent can call. The agent side (definitions, nodes, delivery) comes from
// catalog.json, generated from agent/src by scripts/build-tools-catalog.ts; the server side (downstream
// calls, guardrails, replies) from src/tools-catalog/details.ts; the guardrail chips from the explainer model.

const REPO = "https://github.com/poktalabs/pokta-clinic/blob/main/";
const GUARDRAIL_LABEL = Object.fromEntries(GUARDRAILS.map((g) => [g.id, g.label]));

type Param = (typeof catalog.tools)[number]["params"][number];

function Code({ path, label }: { path: string; label?: string }) {
  return (
    <a className={styles.codeLink} href={`${REPO}${path}`}>
      {label ?? path}
    </a>
  );
}

function SystemTag({ system }: { system: System }) {
  return <span className={`${styles.sys} ${styles[`sys-${system}`]}`}>{SYSTEMS[system]}</span>;
}

function deliveryText(d: (typeof catalog.tools)[number]["delivery"]): { sound: string; interrupt: string } {
  return {
    sound: d.toolCallSound ? `${d.toolCallSound} (${d.toolCallSoundBehavior ?? "auto"})` : "none",
    interrupt: d.interruptionMode === "disable_during_tool" ? "blocked while it runs" : "allowed (default)",
  };
}

function ParamRows({ params, depth = 0 }: { params: Param[] | Param["children"]; depth?: number }) {
  return (
    <>
      {params.map((p) => (
        <ParamRow key={`${depth}-${p.name}`} p={p as Param} depth={depth} />
      ))}
    </>
  );
}

function ParamRow({ p, depth }: { p: Param; depth: number }) {
  return (
    <>
      <tr>
        <td className={styles.mono} style={depth ? { paddingLeft: `${depth * 18 + 10}px` } : undefined}>
          {depth ? "└ " : ""}
          {p.name}
        </td>
        <td className={styles.mono}>{p.type}</td>
        <td>{p.required ? <span className="pill pill-brand">required</span> : <span className={styles.optional}>optional</span>}</td>
        <td>
          {p.dynamicVariable ? (
            <>
              Filled by the platform from <code>{p.dynamicVariable}</code>. The LLM never sees or supplies it.
            </>
          ) : (
            p.description
          )}
          {p.enum ? (
            <span className={styles.enums}>
              {p.enum.map((v) => (
                <code key={v}>{v}</code>
              ))}
            </span>
          ) : null}
        </td>
      </tr>
      {p.children.length ? <ParamRows params={p.children as Param[]} depth={depth + 1} /> : null}
    </>
  );
}

export default function ToolsPage() {
  const tools = catalog.tools;
  const { webhook } = catalog;

  return (
    <main className={`wrap page ${styles.page}`}>
      <section aria-labelledby="tools-h">
        <p className="kicker">Agent tools</p>
        <h1 id="tools-h" className="display">
          Every tool the agent <em>calls</em>
        </h1>
        <p className="lede">
          {tools.length} webhook tools, each attached to one workflow node and served by one route of this app, plus one ElevenLabs system tool. Generated from the agent&apos;s config as code, so this page matches what is pushed.
        </p>
        <dl className={styles.facts}>
          <div>
            <dt>Webhook tools</dt>
            <dd>{tools.length}</dd>
          </div>
          <div>
            <dt>Workflow nodes</dt>
            <dd>{catalog.nodes.length}</dd>
          </div>
          <div>
            <dt>System tools</dt>
            <dd>{catalog.systemTools.used.length}</dd>
          </div>
          <div>
            <dt>Transport</dt>
            <dd className={styles.mono}>
              {webhook.method} {webhook.path}
            </dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{webhook.timeoutSecs} s</dd>
          </div>
        </dl>
        <p className={styles.note}>Code links point to github.com/poktalabs/pokta-clinic, a private repository: they open for collaborators only.</p>
      </section>

      <section aria-labelledby="overview-h" id="overview">
        <h2 id="overview-h" className="headline">
          Overview
        </h2>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Node</th>
                <th scope="col">Downstream</th>
                <th scope="col">Side effects</th>
                <th scope="col">Consent gate</th>
                <th scope="col">Guardrails</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => {
                const d = DETAILS[t.name];
                return (
                  <tr key={t.name}>
                    <th scope="row">
                      <a className={styles.mono} href={`#${t.name}`}>
                        {t.name}
                      </a>
                      <span className={styles.purpose}>{TOOLS[t.name]?.summary ?? d.purpose}</span>
                    </th>
                    <td>{t.nodes.join(", ")}</td>
                    <td>
                      <span className={styles.sysList}>
                        {d.downstream
                          .filter((x) => x.system !== "store" || x.calls.length > 1)
                          .map((x) => (
                            <SystemTag key={x.system} system={x.system} />
                          ))}
                      </span>
                    </td>
                    <td>{d.sideEffects ? <span className="pill pill-attn">writes</span> : <span className="pill pill-ok">read only</span>}</td>
                    <td>{d.consentGate === "checked" ? "checked" : d.consentGate === "sets" ? "records it" : <strong>exempt, by design</strong>}</td>
                    <td>
                      <span className={styles.chips}>
                        {(TOOLS[t.name]?.guardrails ?? []).map((g) => (
                          <span key={g} className={styles.chip}>
                            {GUARDRAIL_LABEL[g]}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>Every route also appends a timeline event (tool, status, latency, a public outcome label) to Upstash Redis; the overview lists Upstash only where a tool stores more than that.</p>
      </section>

      <section aria-labelledby="security-h" className={styles.security}>
        <h2 id="security-h" className="title">
          Security
        </h2>
        <ul>
          <li>
            Every tool call carries the header <code>{webhook.secretHeader}</code>, filled from an ElevenLabs workspace Secret. The LLM never sees it; a request without it, or with a wrong one, gets <code>401</code> (constant-time compare in <Code path="apps/web/src/tools/handler.ts" label="handler.ts" />).
          </li>
          <li>
            The only dynamic variable bound to a tool parameter is{" "}
            {catalog.dynamicVariables.map((v) => (
              <code key={v}>{v}</code>
            ))}
            . The platform fills it; the model cannot set or change which conversation a call writes to. The caller&apos;s email is never a tool parameter: the page registers it server side and tools look it up by conversation.
          </li>
          <li>Tools are attached per node: the model cannot even see a data tool before the Consent node passes, and every data route re-checks the recorded Consent server side.</li>
          <li>Bodies are validated with zod before anything runs; a bad body gets <code>400</code> with the validation error as the message.</li>
        </ul>
      </section>

      <section aria-labelledby="nodes-h">
        <h2 id="nodes-h" className="headline">
          Workflow nodes
        </h2>
        <p className="sub">
          Start, then Consent, Identification, History, Scheduling, End. Escalation is reachable from every stage through an LLM-condition edge. Source: <Code path="agent/src/workflow.ts" label="workflow.ts" />.
        </p>
        <ol className={styles.nodes}>
          {catalog.nodes.map((n) => (
            <li key={n.id} className={styles.node}>
              <span className={styles.nodeHead}>
                <strong>{n.label}</strong>
                <span className={`${styles.mono} ${styles.llm}`}>{n.llm}</span>
              </span>
              <span className={styles.nodeTools}>
                {n.tools.map((tool) => (
                  <a key={tool} href={`#${tool}`} className={styles.mono}>
                    {tool}
                  </a>
                ))}
              </span>
              <span className={styles.leads}>to {n.leadsTo.join(", ")}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="system-h" className={styles.twoCol}>
        <div className="card">
          <h2 id="system-h" className="title">
            System tools
          </h2>
          <ul className={styles.list}>
            {catalog.systemTools.used.map((s) => (
              <li key={s}>
                <code>{s}</code>: switches the conversation between Spanish and English when the caller changes language (the <code>en</code> language preset gives it a target voice and first message).
              </li>
            ))}
            <li>
              Workflow edges: moving between nodes is done by the platform itself, as a system tool call whose result names the target node. Each edge is an LLM condition in <Code path="agent/src/workflow.ts" label="workflow.ts" />; the /explainer page follows these results to light up the stage.
            </li>
            <li>The call ends when the workflow reaches its End node; the platform reports that as the end_call tool.</li>
          </ul>
        </div>
        <div className="card">
          <h2 className="title">Not used</h2>
          <p className="sub small">Verified against the built agent body (agent/src/agent.ts): not declared as built-in tools, and the workflow has no transfer nodes (node types: {catalog.systemTools.workflowNodeTypes.join(", ")}).</p>
          <ul className={styles.notUsed}>
            {catalog.systemTools.notUsed.map((s) => (
              <li key={s}>
                <code>{s}</code>
              </li>
            ))}
          </ul>
          <p className="sub small">No global tools either: every webhook tool is attached to a node ({catalog.globalToolIds.length} agent-level tool IDs).</p>
        </div>
      </section>

      <section aria-labelledby="shared-h">
        <h2 id="shared-h" className="headline">
          Replies every gated tool can give
        </h2>
        <p className="sub">Each response body is JSON with a <code>message</code> that tells the agent what to do next. These come from the shared handler, before or around the tool&apos;s own logic.</p>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">HTTP</th>
                <th scope="col">message to the LLM</th>
              </tr>
            </thead>
            <tbody>
              {SHARED_REPLIES.map((r) => (
                <tr key={r.when}>
                  <td>{r.when}</td>
                  <td className={styles.mono}>{r.status}</td>
                  <td className={styles.msg}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="detail-h" className={styles.details}>
        <h2 id="detail-h" className="headline">
          Tool by tool
        </h2>
        {tools.map((t) => {
          const d = DETAILS[t.name];
          const delivery = deliveryText(t.delivery);
          return (
            <article key={t.name} id={t.name} className={`card ${styles.tool}`}>
              <header className={styles.toolHead}>
                <h3 className={styles.toolName}>{t.name}</h3>
                <span className={styles.toolMeta}>
                  <span className="pill pill-brand">{t.nodes.join(", ")}</span>
                  {d.sideEffects ? <span className="pill pill-attn">writes</span> : <span className="pill pill-ok">read only</span>}
                  {d.consentGate === "exempt" ? <span className="pill pill-spot">no consent gate</span> : null}
                </span>
                <a className={styles.top} href="#overview">
                  Overview
                </a>
              </header>
              <p className={styles.toolPurpose}>{d.purpose}</p>

              <dl className={styles.kv}>
                <div>
                  <dt>Endpoint</dt>
                  <dd className={styles.mono}>
                    {webhook.method} /api/tools/{t.name}
                  </dd>
                </div>
                <div>
                  <dt>Sound while running</dt>
                  <dd>{delivery.sound}</dd>
                </div>
                <div>
                  <dt>Caller interruptions</dt>
                  <dd>{delivery.interrupt}</dd>
                </div>
                <div>
                  <dt>Code</dt>
                  <dd className={styles.codeLinks}>
                    <Code path={t.specPath} label="definition" />
                    <Code path={t.routePath} label="route" />
                    {(d.related ?? []).map((p) => (
                      <Code key={p} path={p} label={p.split("/").pop()} />
                    ))}
                  </dd>
                </div>
              </dl>

              <details className={styles.desc}>
                <summary>Description the LLM reads</summary>
                <p>{t.description}</p>
              </details>
              <p className={styles.printDesc}>
                <strong>Description the LLM reads: </strong>
                {t.description}
              </p>

              <h4 className={styles.sub}>Parameters</h4>
              <div className={styles.tableScroll}>
                <table className={`${styles.table} ${styles.params}`}>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Required</th>
                      <th scope="col">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    <ParamRows params={t.params} />
                  </tbody>
                </table>
              </div>

              <div className={styles.twoCol}>
                <div>
                  <h4 className={styles.sub}>Calls downstream</h4>
                  <ul className={styles.downstream}>
                    {d.downstream.map((x) => (
                      <li key={x.system}>
                        <SystemTag system={x.system} />
                        <ul>
                          {x.calls.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className={styles.sub}>Guardrails</h4>
                  <ul className={styles.list}>
                    {d.guardrails.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <h4 className={styles.sub}>Response</h4>
              <p className={styles.fields}>
                <code>ok</code>
                {d.fields.map((f) => (
                  <code key={f}>{f}</code>
                ))}
                <code>message</code>
              </p>
              <ul className={styles.replies}>
                {d.replies.map((r) => (
                  <li key={r.when}>
                    <span className={styles.when}>{r.when}</span>
                    <span className={styles.msg}>{r.message}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      <footer className={styles.footer}>
        <p>
          Regenerate the agent half after changing agent/src: <code>pnpm exec tsx scripts/build-tools-catalog.ts</code> (add <code>--check</code> to fail on a stale file). The server half lives in <Code path="apps/web/src/tools-catalog/details.ts" label="details.ts" />; its test fails if a quoted reply drifts from the route. Values in braces are filled at runtime; good-news replies also end with an instruction to say it calmly, in the language of the conversation.
        </p>
      </footer>
    </main>
  );
}

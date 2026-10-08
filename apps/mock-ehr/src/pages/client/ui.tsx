import type { Child } from "hono/jsx";
import { ThemeScript, ThemeToggle, themeCss } from "../theme.js";
import type { Tone } from "./format.js";

// The client console: what a clinic administrator at Grupo Médico Articular uses. Read-only, server-rendered,
// no client JS beyond the theme toggle (../theme.tsx). JSX escapes every interpolated value. Visual system: RheumAI
// design tokens ("Frontier Lab Notebook": cool off-white ground, one cobalt hue, serif reads / sans scans, zero
// radius, one soft shadow).
const css = `
@font-face{font-family:"Source Serif 4";src:url(/assets/fonts/source-serif-4.woff2) format("woff2");font-weight:200 900;font-display:swap}
@font-face{font-family:"Manrope";src:url(/assets/fonts/manrope.woff2) format("woff2");font-weight:200 800;font-display:swap}
@font-face{font-family:"Funnel Display";src:url(/assets/fonts/funnel-display.woff2) format("woff2");font-weight:300 800;font-display:swap}
@font-face{font-family:"IBM Plex Mono";src:url(/assets/fonts/ibm-plex-mono-400.woff2) format("woff2");font-weight:400;font-display:swap}
/* Light --attn is darkened from RheumAI's #9C6A15 (4.0:1 on its pill tint) to clear AA for the 12px pills. */
${themeCss(
  `--background:#EBEEF4;--surface:#FFFFFF;--surface-2:#E2E6F0;
  --foreground:#14161C;--foreground-soft:#545B6B;--muted:#646B7D;--rule:#CDD4E0;
  --primary:#3333DE;--primary-fg:#FFFFFF;--primary-ink:#3333DE;
  --surface-brand:color-mix(in srgb,var(--primary) 9%,var(--surface));
  --ok:#1F7A54;--attn:#8A5D12;--spot:#C1362B;
  --shadow:0 1px 2px rgba(20,22,28,.06),0 18px 40px -16px rgba(20,22,28,.20);`,
  // RheumAI's dark set, with --muted and --primary-ink lifted from the spec (#808799, #5A5AFF) to clear AA on --surface.
  `--background:#141621;--surface:#1D2231;--surface-2:#262C3C;
  --foreground:#E9EBF2;--foreground-soft:#A2A9BA;--muted:#8C93A5;--rule:#363D4F;
  --primary:#3333DE;--primary-ink:#8A8AFF;
  --surface-brand:color-mix(in srgb,var(--primary-ink) 12%,var(--surface));
  --ok:#57C89A;--attn:#E0A24A;--spot:#F0796B;
  --shadow:0 1px 2px rgba(0,0,0,.4),0 18px 42px -16px rgba(0,0,0,.66);`,
)}
:root{
  --serif:"Source Serif 4",Georgia,"Times New Roman",serif;
  --sans:"Manrope",system-ui,-apple-system,"Segoe UI",sans-serif;
  --wordmark:"Funnel Display","Manrope",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;
  --radius:0;--sidebar:248px;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--background);color:var(--foreground);font:400 15px/1.6 var(--sans);-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
a{color:var(--primary-ink);text-underline-offset:2px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:2px solid var(--primary-ink);outline-offset:2px}
h1,h2,h3{font-family:var(--serif);font-weight:500;margin:0;color:var(--foreground)}
h1{font-size:clamp(1.5rem,2.5vw,1.875rem);line-height:1.2;letter-spacing:-.01em}
h2{font-size:1.25rem;line-height:1.3}
h3{font-size:1.0625rem;line-height:1.35}
p{margin:0}
code,.mono{font-family:var(--mono);font-size:.85em}
.skip{position:absolute;left:-9999px;top:0;background:var(--primary);color:var(--primary-fg);padding:var(--s2) var(--s4);z-index:10}
.skip:focus{left:var(--s4);top:var(--s4)}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Shell: sidebar + main */
.shell{display:grid;grid-template-columns:var(--sidebar) 1fr;min-height:100vh;background:linear-gradient(90deg,var(--surface) calc(var(--sidebar) - 1px),var(--rule) calc(var(--sidebar) - 1px),var(--rule) var(--sidebar),transparent var(--sidebar))}
.sidebar{background:var(--surface);border-right:1px solid var(--rule);padding:var(--s5) 0;position:sticky;top:0;height:100vh;overflow-y:auto;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:var(--s3);padding:0 var(--s5) var(--s5);text-decoration:none;color:var(--foreground)}
.brand-mark{width:20px;height:20px;border-radius:50%;background:var(--primary);flex:none}
.wordmark{font-family:var(--wordmark);font-weight:500;font-size:1.25rem;letter-spacing:-.025em;line-height:1}
.wordmark span{color:var(--primary-ink)}
.tenant{margin:0 var(--s5) var(--s5);padding:var(--s3);background:var(--surface-2);font-size:.8125rem;line-height:1.4}
.tenant b{display:block;font-weight:600}
.tenant small{color:var(--foreground-soft);font-size:.75rem}
.nav-group{padding:0 var(--s3);margin-bottom:var(--s4)}
.nav-label,.kicker{font-family:var(--sans);font-size:.6875rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.nav-label{padding:0 var(--s3) var(--s2)}
.nav a{display:flex;align-items:center;justify-content:space-between;gap:var(--s2);padding:var(--s2) var(--s3);color:var(--foreground-soft);text-decoration:none;font-weight:500;font-size:.875rem;border-left:2px solid transparent}
.nav a:hover{background:var(--surface-2);color:var(--foreground)}
.nav a[aria-current="page"]{color:var(--primary-ink);background:var(--surface-brand);border-left-color:var(--primary);font-weight:600}
.nav .count{font-size:.75rem;color:var(--muted);font-weight:600}
.sidebar-foot{margin-top:auto;padding:var(--s4) var(--s5) 0;border-top:1px solid var(--rule);font-size:.75rem;color:var(--muted);line-height:1.5}
.sidebar-foot a{color:var(--muted)}
.main{min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:var(--s4);padding:var(--s3) var(--s6);border-bottom:1px solid var(--rule);background:var(--background);font-size:.8125rem;color:var(--foreground-soft)}
.topbar .user{display:flex;align-items:center;gap:var(--s3)}
.topbar .end{display:flex;align-items:center;gap:var(--s5)}
.theme-toggle{display:inline-flex;border:1px solid var(--rule);background:var(--surface)}
.theme-toggle button{font:600 .75rem/1.5 var(--sans);padding:3px 10px;border:0;background:none;color:var(--foreground-soft);cursor:pointer}
.theme-toggle button+button{border-left:1px solid var(--rule)}
.theme-toggle button:hover{color:var(--foreground);background:var(--surface-2)}
.theme-toggle button[aria-pressed="true"]{background:var(--primary);color:var(--primary-fg)}
.avatar{width:28px;height:28px;display:grid;place-items:center;background:var(--foreground);color:var(--background);font-weight:700;font-size:.75rem}
.gate{max-width:34rem;margin:0 auto;padding:var(--s7) var(--s4);display:flex;flex-direction:column;gap:var(--s5)}
.gate .brand{padding:0}
.gate .theme-toggle{align-self:flex-start}
.content{padding:var(--s6);max-width:1240px;width:100%}
.footer{padding:var(--s5) var(--s6) var(--s6);color:var(--muted);font-size:.75rem;max-width:1240px}

/* Page header */
.crumbs{display:flex;flex-wrap:wrap;gap:var(--s2);list-style:none;padding:0;margin:0 0 var(--s3);font-size:.8125rem;color:var(--muted)}
.crumbs li+li::before{content:"/";margin-right:var(--s2);color:var(--rule)}
.crumbs a{color:var(--foreground-soft)}
.page-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:var(--s4);margin-bottom:var(--s6);padding-bottom:var(--s5);border-bottom:1px solid var(--rule)}
.page-head .kicker{display:block;margin-bottom:var(--s2)}
.lede{color:var(--foreground-soft);margin-top:var(--s2);max-width:68ch}
.head-meta{display:flex;flex-wrap:wrap;gap:var(--s2);align-items:center}

/* Sections, cards, grids */
.section{margin-bottom:var(--s7)}
.section-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--s3);margin-bottom:var(--s4)}
.section-head p{color:var(--foreground-soft);font-size:.875rem}
.card{background:var(--surface);border:1px solid var(--rule);box-shadow:var(--shadow);padding:var(--s5)}
.card.flush{padding:0}
.panel{background:var(--surface-2);padding:var(--s4)}
.panel-brand{background:var(--surface-brand);border:1px solid var(--rule);padding:var(--s4) var(--s5)}
.grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--s5)}
.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s5)}
.stack{display:flex;flex-direction:column;gap:var(--s4)}
ol.plain,ul.plain{list-style:none;padding:0;margin:0}
.row{display:flex;flex-wrap:wrap;gap:var(--s3);align-items:center}
.muted{color:var(--muted)}
.soft{color:var(--foreground-soft)}
.small{font-size:.8125rem}

/* Stats: hairline grid (gap-px over --rule) */
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);box-shadow:var(--shadow)}
.stat{background:var(--surface);padding:var(--s4) var(--s5);display:flex;flex-direction:column;gap:var(--s1);text-decoration:none;color:inherit}
a.stat:hover{background:var(--surface-brand)}
.stat-value{font-size:1.875rem;font-weight:600;line-height:1.1;letter-spacing:-.01em;color:var(--foreground)}
.stat-label{font-size:.8125rem;color:var(--foreground-soft);font-weight:500}
.stat-hint{font-size:.75rem;color:var(--muted)}
.stat.attn .stat-value{color:var(--attn)}
.stat.spot .stat-value{color:var(--spot)}

/* Pills: square, tint + text of the semantic color */
.pill{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;font-size:.75rem;font-weight:600;line-height:1.5;white-space:nowrap;border:1px solid transparent}
.pill::before{content:"";width:6px;height:6px;background:currentColor;flex:none}
.pill.ok{color:var(--ok);background:color-mix(in srgb,var(--ok) 11%,transparent)}
.pill.attn{color:var(--attn);background:color-mix(in srgb,var(--attn) 12%,transparent)}
.pill.spot{color:var(--spot);background:color-mix(in srgb,var(--spot) 11%,transparent)}
.pill.neutral{color:var(--foreground-soft);background:var(--surface-2)}
.pill.brand{color:var(--primary-ink);background:var(--surface-brand);border-color:color-mix(in srgb,var(--primary) 25%,transparent)}
.pill.plain::before{display:none}

/* Tables */
.table-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--rule);box-shadow:var(--shadow)}
table{width:100%;border-collapse:collapse;font-size:.875rem}
caption{text-align:left;padding:var(--s3) var(--s4);font-size:.8125rem;color:var(--muted);caption-side:bottom;border-top:1px solid var(--rule)}
th,td{text-align:left;padding:var(--s3) var(--s4);border-bottom:1px solid var(--rule);vertical-align:top}
thead th{font-size:.6875rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);background:var(--surface);white-space:nowrap;border-bottom:1px solid var(--rule)}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:color-mix(in srgb,var(--surface-2) 55%,var(--surface))}
td.num,th.num{text-align:right}
td .primary-cell{font-weight:600;color:var(--foreground)}
td .sub-cell{display:block;font-size:.8125rem;color:var(--muted)}

/* Definition lists */
.kv{display:grid;grid-template-columns:minmax(7rem,13rem) minmax(8rem,1fr);gap:var(--s2) var(--s5);margin:0;font-size:.875rem}
.kv dt{color:var(--muted);font-weight:500}
.kv dd{margin:0;color:var(--foreground);font-weight:500;min-width:0;overflow-wrap:anywhere}

/* Filter chips (plain GET links) */
.filters{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s2);margin-bottom:var(--s4)}
.filters .kicker{margin-right:var(--s2)}
.chip{display:inline-block;padding:4px 12px;border:1px solid var(--rule);background:var(--surface);color:var(--foreground-soft);text-decoration:none;font-size:.8125rem;font-weight:500}
.chip:hover{border-color:var(--foreground-soft);color:var(--foreground)}
.chip[aria-current="true"]{background:var(--primary);border-color:var(--primary);color:var(--primary-fg)}

/* Notices */
.notice{display:flex;gap:var(--s3);align-items:flex-start;padding:var(--s3) var(--s4);border:1px solid var(--rule);border-left:3px solid var(--attn);background:var(--surface);font-size:.875rem;margin-bottom:var(--s5)}
.notice.brand{border-left-color:var(--primary)}
.notice.spot{border-left-color:var(--spot)}
.notice strong{font-weight:700}
.empty{padding:var(--s6) var(--s5);text-align:center;color:var(--muted);background:var(--surface);border:1px dashed var(--rule);font-size:.875rem}
blockquote.words{margin:0;padding:var(--s3) var(--s4);background:var(--surface-2);border-left:3px solid var(--rule);font-size:.9375rem;color:var(--foreground)}

@media (max-width:1024px){
  .grid-3{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:768px){
  .shell{grid-template-columns:1fr;background:none}
  .sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--rule);padding:var(--s4) 0 0}
  .brand{padding-bottom:var(--s3)}
  .tenant{display:none}
  .navs{display:flex;overflow-x:auto;gap:0;padding:0 var(--s3)}
  .nav-group,.nav{display:contents}
  .navs{scrollbar-width:thin}
  .nav-label{display:none}
  .nav a{white-space:nowrap;border-left:0;border-bottom:2px solid transparent}
  .nav a[aria-current="page"]{border-bottom-color:var(--primary)}
  .nav .count{display:none}
  .sidebar-foot{display:none}
  .topbar{padding:var(--s3) var(--s4)}
  .topbar .end{gap:var(--s3)}
  .topbar .user>span:first-child{display:none}
  .content{padding:var(--s5) var(--s4)}
  .footer{padding:var(--s4)}
  .grid-2,.grid-3{grid-template-columns:1fr}
  .kv{grid-template-columns:1fr;gap:0 0}
  .kv dd{margin-bottom:var(--s3)}
}
@media print{.sidebar,.topbar,.skip{display:none}.shell{display:block}.card,.table-wrap,.stats{box-shadow:none}}
`;

export type NavKey = "inicio" | "pacientes" | "citas" | "llamadas" | "alertas" | "sucursales" | "equipo" | "cuestionario" | "auditoria";

const NAV: { group: string; items: { key: NavKey; href: string; label: string }[] }[] = [
  {
    group: "Operación",
    items: [
      { key: "inicio", href: "/", label: "Inicio" },
      { key: "pacientes", href: "/pacientes", label: "Pacientes" },
      { key: "citas", href: "/citas", label: "Citas" },
      { key: "llamadas", href: "/llamadas", label: "Llamadas pendientes" },
      { key: "alertas", href: "/alertas", label: "Alertas clínicas" },
    ],
  },
  {
    group: "Clínica",
    items: [
      { key: "sucursales", href: "/sucursales", label: "Sucursales" },
      { key: "equipo", href: "/equipo-medico", label: "Equipo médico" },
      { key: "cuestionario", href: "/cuestionario", label: "Cuestionario" },
    ],
  },
  { group: "Cumplimiento", items: [{ key: "auditoria", href: "/auditoria", label: "Bitácora de auditoría" }] },
];

const Head = (props: { title: string }) => (
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <title>{`${props.title} · PoktaClinic`}</title>
    <link rel="preload" href="/assets/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin="" />
    <link rel="preload" href="/assets/fonts/source-serif-4.woff2" as="font" type="font/woff2" crossorigin="" />
    <ThemeScript />
    <style dangerouslySetInnerHTML={{ __html: css }} />
  </head>
);

const Brand = () => (
  <a class="brand" href="/">
    <span class="brand-mark" aria-hidden="true"></span>
    <span class="wordmark">
      Pokta<span>Clinic</span>
    </span>
  </a>
);

export const ClientLayout = (props: { title: string; active?: NavKey; children?: Child }) => (
  <html lang="es-MX">
    <Head title={props.title} />
    <body>
      <a class="skip" href="#contenido">Saltar al contenido</a>
      <div class="shell">
        <aside class="sidebar" aria-label="Navegación principal">
          <Brand />
          <div class="tenant">
            <b>Grupo Médico Articular</b>
            <small>Reumatología · 3 sucursales</small>
          </div>
          <nav class="navs" aria-label="Secciones">
            {NAV.map((g) => (
              <div class="nav-group">
                <div class="nav-label">{g.group}</div>
                <div class="nav">
                  {g.items.map((i) => (
                    <a href={i.href} aria-current={props.active === i.key ? "page" : undefined}>
                      {i.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div class="sidebar-foot">
            Datos ficticios de demostración. Información sensible: no compartir.
            <br />
            <a href="/developer">Vista técnica (FHIR)</a>
          </div>
        </aside>
        <div class="main">
          <header class="topbar">
            <span>
              <Pill tone="brand">Solo lectura</Pill>
            </span>
            <span class="end">
              <ThemeToggle lang="es" />
              <span class="user">
                <span>Administración de la clínica</span>
                <span class="avatar" aria-hidden="true">
                  AD
                </span>
              </span>
            </span>
          </header>
          <main id="contenido" class="content">
            {props.children}
          </main>
          <footer class="footer">PoktaClinic · Expediente de Grupo Médico Articular · Horarios en hora del centro de México (America/Mexico_City)</footer>
        </div>
      </div>
    </body>
  </html>
);

export const Breadcrumbs = (props: { items: { label: string; href?: string }[] }) => (
  <nav aria-label="Ruta">
    <ol class="crumbs">
      {props.items.map((i) => (
        <li>{i.href ? <a href={i.href}>{i.label}</a> : <span aria-current="page">{i.label}</span>}</li>
      ))}
    </ol>
  </nav>
);

/** The page's single h1, with an optional kicker above, a lede below, and right-aligned meta (pills, counts). */
export const PageHeader = (props: { title: Child; kicker?: string; lede?: Child; meta?: Child }) => (
  <div class="page-head">
    <div>
      {props.kicker ? <span class="kicker">{props.kicker}</span> : null}
      <h1>{props.title}</h1>
      {props.lede ? <p class="lede">{props.lede}</p> : null}
    </div>
    {props.meta ? <div class="head-meta">{props.meta}</div> : null}
  </div>
);

/** A titled section (h2). `id` also wires aria-labelledby. */
export const Section = (props: { id: string; title: Child; description?: Child; aside?: Child; children?: Child }) => (
  <section class="section" aria-labelledby={`${props.id}-h`}>
    <div class="section-head">
      <h2 id={`${props.id}-h`}>{props.title}</h2>
      {props.description ? <p>{props.description}</p> : null}
      {props.aside ?? null}
    </div>
    {props.children}
  </section>
);

export const Card = (props: { class?: string; children?: Child }) => <div class={props.class ? `card ${props.class}` : "card"}>{props.children}</div>;

export const Pill = (props: { tone: Tone; plain?: boolean; children?: Child }) => <span class={`pill ${props.tone}${props.plain ? " plain" : ""}`}>{props.children}</span>;

export const Stats = (props: { children?: Child }) => <div class="stats">{props.children}</div>;

export const Stat = (props: { label: string; value: Child; hint?: Child; href?: string; tone?: "attn" | "spot" }) => {
  const body = (
    <>
      <span class="stat-value">{props.value}</span>
      <span class="stat-label">{props.label}</span>
      {props.hint ? <span class="stat-hint">{props.hint}</span> : null}
    </>
  );
  const cls = props.tone ? `stat ${props.tone}` : "stat";
  return props.href ? (
    <a class={cls} href={props.href}>
      {body}
    </a>
  ) : (
    <div class={cls}>{body}</div>
  );
};

/**
 * A data table. `head` cells may be strings or { label, num } for right-aligned numeric columns.
 * `caption` is required for accessibility (rendered under the table, small and muted).
 */
export const DataTable = (props: { caption: string; head: (string | { label: string; num?: boolean })[]; rows: Child[][]; empty: string }) => {
  if (!props.rows.length) return <p class="empty">{props.empty}</p>;
  const num = props.head.map((h) => typeof h !== "string" && !!h.num);
  return (
    <div class="table-wrap">
      <table>
        <caption>{props.caption}</caption>
        <thead>
          <tr>
            {props.head.map((h, i) => (
              <th scope="col" class={num[i] ? "num" : undefined}>
                {typeof h === "string" ? h : h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr>
              {r.map((cell, i) => (
                <td class={num[i] ? "num" : undefined}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/** A primary line with an optional muted second line, for table cells. */
export const Cell = (props: { primary: Child; sub?: Child; href?: string }) => (
  <>
    {props.href ? (
      <a class="primary-cell" href={props.href}>
        {props.primary}
      </a>
    ) : (
      <span class="primary-cell">{props.primary}</span>
    )}
    {props.sub ? <span class="sub-cell">{props.sub}</span> : null}
  </>
);

/** Label/value pairs as a definition list. Empty values render as a muted "Sin registrar". */
export const KeyValue = (props: { items: [string, Child][] }) => (
  <dl class="kv">
    {props.items.map(([k, v]) => (
      <>
        <dt>{k}</dt>
        <dd>{v === null || v === undefined || v === "" ? <span class="muted">Sin registrar</span> : v}</dd>
      </>
    ))}
  </dl>
);

/** Filter chips: plain GET links, the current one marked with aria-current. */
export const Filters = (props: { label: string; options: { label: string; href: string; current: boolean }[] }) => (
  <nav class="filters" aria-label={props.label}>
    <span class="kicker">{props.label}</span>
    {props.options.map((o) => (
      <a class="chip" href={o.href} aria-current={o.current ? "true" : undefined}>
        {o.label}
      </a>
    ))}
  </nav>
);

export const Notice = (props: { tone?: "attn" | "brand" | "spot"; title?: string; children?: Child }) => (
  <div class={`notice${props.tone && props.tone !== "attn" ? ` ${props.tone}` : ""}`} role="note">
    <div>
      {props.title ? <strong>{props.title} </strong> : null}
      {props.children}
    </div>
  </div>
);

export const Empty = (props: { children?: Child }) => <p class="empty">{props.children}</p>;

export const NotFoundPage = (props: { what: string; back: { label: string; href: string } }) => (
  <ClientLayout title="No encontrado">
    <PageHeader title={`${props.what} no encontrado`} lede="El registro no existe o el enlace está incompleto." />
    <a href={props.back.href}>{props.back.label}</a>
  </ClientLayout>
);

/** The 401 body (shown when the Basic auth prompt is dismissed): no shell, no data, just how to get back in. */
export const UnauthorizedPage = () => (
  <html lang="es-MX">
    <Head title="Acceso restringido" />
    <body>
      <main class="gate">
        <Brand />
        <div class="card stack">
          <span class="kicker">Error 401</span>
          <h1>Acceso restringido</h1>
          <p class="soft">Esta consola muestra datos de pacientes y requiere la contraseña de la clínica. Recarga la página para volver a intentarlo.</p>
        </div>
        <ThemeToggle lang="es" />
      </main>
    </body>
  </html>
);

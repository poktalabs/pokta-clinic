import type { Child } from "hono/jsx";
import { ThemeScript, ThemeToggle, themeCss } from "./theme.js";

// Plain server-rendered pages: inline CSS, no client JS beyond the theme toggle (./theme.tsx). JSX escapes every
// interpolated value.
const css = `
${themeCss(
  "--bg:#f7f6f2;--fg:#1d2420;--muted:#5d675f;--line:#dcd9cf;--accent:#1f6b52;--card:#fff;",
  "--bg:#141815;--fg:#e6e9e4;--muted:#98a299;--line:#2c332d;--accent:#5cc7a0;--card:#1b201c;",
)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:56rem;margin:0 auto;padding:3rem 1.25rem 4rem}
h1{font-size:2rem;margin:0;letter-spacing:-.01em}
h2{font-size:1.05rem;margin:2.2rem 0 .6rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.sub{color:var(--muted);margin:.2rem 0 1.4rem}
a{color:var(--accent)}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:4px;padding:.05em .35em}
ul{padding-left:1.2rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem}
.stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:.8rem 1rem}
.stat b{display:block;font-size:1.6rem}
.stat span{color:var(--muted);font-size:.85rem}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);font-size:.85rem}
th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
.wide{max-width:80rem}
.note{color:var(--muted);font-size:.85rem}
.theme-toggle{float:right;display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--card)}
.theme-toggle button{font:600 .75rem/1.5 ui-sans-serif,system-ui,sans-serif;padding:3px 10px;border:0;background:none;color:var(--muted);cursor:pointer}
.theme-toggle button+button{border-left:1px solid var(--line)}
.theme-toggle button:hover{color:var(--fg)}
.theme-toggle button[aria-pressed="true"]{background:var(--accent);color:var(--bg)}
`;

export const Layout = (props: { title: string; wide?: boolean; children?: Child }) => (
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex" />
      <title>{props.title}</title>
      <ThemeScript />
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <main class={props.wide ? "wide" : undefined}>
        <ThemeToggle lang="en" />
        {props.children}
      </main>
    </body>
  </html>
);

// Light / dark / system theme for every HTML page. With no stored choice the page follows prefers-color-scheme; a
// stored choice ("pokta-theme" in localStorage, same key as the PoktaClinic web app) sets data-theme on <html>. The one
// inline script runs in <head> so the stored choice applies before first paint, and wires the toggle by event
// delegation (no per-button handlers). The app sets no CSP today; the script is a constant, so one could allow it by hash.
const script = `(function(){var d=document.documentElement,k="pokta-theme",c="system";
function sync(){var b=document.querySelectorAll("[data-set-theme]");for(var i=0;i<b.length;i++)b[i].setAttribute("aria-pressed",String(b[i].getAttribute("data-set-theme")===c))}
function apply(t){c=t==="light"||t==="dark"?t:"system";if(c==="system")d.removeAttribute("data-theme");else d.setAttribute("data-theme",c);sync()}
try{apply(localStorage.getItem(k))}catch(e){apply(null)}
d.classList.add("js");
document.addEventListener("DOMContentLoaded",sync);
document.addEventListener("click",function(e){var b=e.target&&e.target.closest&&e.target.closest("[data-set-theme]");if(!b)return;var t=b.getAttribute("data-set-theme");try{if(t==="light"||t==="dark")localStorage.setItem(k,t);else localStorage.removeItem(k)}catch(x){}apply(t)})})()`;

export const ThemeScript = () => <script dangerouslySetInnerHTML={{ __html: script }} />;

/**
 * Builds the theme CSS from the light and dark custom-property blocks: dark applies when the OS prefers it (unless the
 * user picked light) or when the user picked dark. The toggle hides without JS, since it could not do anything.
 */
export const themeCss = (light: string, dark: string) => `
:root{color-scheme:light;${light}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${dark}}}
:root[data-theme="dark"]{color-scheme:dark;${dark}}
html:not(.js) .theme-toggle{display:none}
`;

const LABELS = {
  es: { group: "Tema de color", light: "Claro", dark: "Oscuro", system: "Sistema" },
  en: { group: "Color theme", light: "Light", dark: "Dark", system: "System" },
} as const;

/** Three-way segmented control. aria-pressed starts on "system" and the script syncs it to the stored choice. */
export const ThemeToggle = (props: { lang: "es" | "en" }) => {
  const l = LABELS[props.lang];
  return (
    <div class="theme-toggle" role="group" aria-label={l.group}>
      {(["light", "dark", "system"] as const).map((t) => (
        <button type="button" data-set-theme={t} aria-pressed={t === "system" ? "true" : "false"}>
          {l[t]}
        </button>
      ))}
    </div>
  );
};

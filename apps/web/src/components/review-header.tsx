import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function ReviewHeader() {
  return (
    <header className="site-header">
      <div className="wrap x-wide">
        <Link className="brand" href="/">
          <Image src="/poktacare-logo.svg" alt="" width={20} height={20} priority />
          <span className="wordmark">
            Pokta<b>Clinic</b>
          </span>
        </Link>
        <span className="header-end">
          <Link className="kicker r-nav" href="/review">
            Call reviews
          </Link>
          <Link className="kicker r-nav" href="/explainer">
            Try it live
          </Link>
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}

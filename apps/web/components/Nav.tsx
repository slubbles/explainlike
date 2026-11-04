import AuthNav from "./AuthNav";
import Logo from "./Logo";

export default function Nav() {
  return (
    <nav className="nav">
      <div className="wrap">
        <a className="brand" href="/">
          <Logo />
          Explanimate
        </a>
        <div className="navr">
          <a className="navl" href="/gallery">
            Examples
          </a>
          <a className="navl" href="/docs">
            Docs
          </a>
          <a className="gh" href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <AuthNav />
        </div>
      </div>
    </nav>
  );
}

import Logo from "./Logo";

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div>
          <a className="flogo" href="/">
            <Logo />
            Explanimate
          </a>
          <div className="fsub">Powered by Meta Muse models · voice by Deepgram · drawn with rough.js and Excalifont</div>
          <div className="fnote">Not affiliated with or endorsed by Meta, tldraw or Excalidraw.</div>
        </div>
        <div className="l">
          <a href="/gallery">Examples</a>
          <a href="/docs">Docs</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span>MIT</span>
        </div>
      </div>
    </footer>
  );
}

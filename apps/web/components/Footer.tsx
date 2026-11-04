export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <a className="flogo" href="/">
          Explanimate
        </a>
        <div>Powered by Meta Muse models · voice by Deepgram · drawn with rough.js and Excalifont</div>
        <div className="l">
          <a href="/gallery">Examples</a>
          <a href="https://github.com/slubbles/explanimate" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <span>MIT</span>
        </div>
      </div>
      <div className="wrap tiny">Not affiliated with or endorsed by Meta, tldraw or Excalidraw.</div>
    </footer>
  );
}

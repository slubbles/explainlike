# Plugins: packs, themes and levels

Explain Like has three plugin points. All three are plain files or one function call; none needs a fork.

| plugin | what it changes | how you add one |
| --- | --- | --- |
| **pack** | which building blocks Explain Like recognises in a repo, and the icons it draws them with | a folder with `manifest.json` (+ PNGs), passed with `--pack <dir>` |
| **theme** | colours of the canvas, ink, captions and the semantic colours | `registerTheme()` from `@explainlike/core` |
| **level** | how deep the explanation goes, how many boxes, which extra whiteboard lists | a JSON file, passed with `--level-file <file>` |

## Packs

A pack is a folder:

```
my-pack/
  manifest.json
  some-icon.png        # optional: white strokes on a transparent background, ~512 px
```

`manifest.json` has two optional parts, `icons` and `components`:

```json
{
  "id": "supabase",
  "icons": {
    "edge-function": { "file": "edge-function.png", "aliases": ["deno function"] }
  },
  "components": [
    {
      "id": "sb-postgres",
      "name": "Supabase Postgres",
      "kind": "db",
      "layer": "data",
      "keyword": "supabase db",
      "icon": "database",
      "detect": {
        "files": ["(^|/)supabase/migrations/.+\\.sql$"],
        "contains": [{ "file": "(^|/)package\\.json$", "pattern": "@supabase/supabase-js" }]
      },
      "hint": "optional: one line the model sees next to it"
    }
  ]
}
```

- **`icons`** adds or overrides icons by name. Any icon in any loaded pack can be used; later packs win.
- **`components`** are building blocks. `detect.files` are regexes on repo paths. `detect.contains` reads files whose path matches `file` and looks for `pattern` (multiline regex) inside. Up to 200 files are read per rule, and only files whose path matches. Secret-looking files (`.env`, keys, `*credentials*`) are never opened. Their contents are redacted before anything else sees them.
- `kind` is one of `client edge api worker db object-storage cache queue search auth third-party ai realtime cron cdn analytics email ci`; `layer` is one of `frontend edge backend data storage cache auth async third-party ops`; `keyword` is 1 to 3 lowercase words (what gets written on the board); `icon` names an icon from any loaded pack.

What happens with a detected component:

1. The architecture pass gets a hint like `Cloudflare D1: kind db, keyword "d1 database", icon database; seen in wrangler.jsonc`.
2. It is a hint, not a box. The model still has to cite real files for every box, and the validator still drops boxes whose files don't exist.
3. If a box ends up matching a detected component (same kind and a shared evidence file, or the same product name), it gets that component's icon, so the same building block looks the same in every video.
4. `manifest.json` in the output folder lists what each pack detected and where (`packs.detected`).

Built-in packs:

- `cloudflare`: Workers, D1, R2, KV, Durable Objects, Queues, Workers AI, Vectorize, Hyperdrive, Cron Triggers, static assets. It works from `wrangler.toml` / `wrangler.jsonc` bindings and from type names in code.
- `cloud-generic`: the shapes everyone draws for AWS / GCP / Azure apps. These are object store, serverless function, managed queue, key-value table, managed SQL, CDN, load balancer, container and infra as code. It works from SDK dependencies, Terraform resources, `serverless.yml` and Dockerfiles. Names stay generic ("object storage (S3-style)") unless the repo names the product.

Both use the hand-drawn doodle icons. Neither ships any vendor's logo; please keep it that way in packs you share (logos are trademarks).

By default every built-in pack is loaded and only contributes where it detects something. `--pack <id|dir>` (repeatable) picks packs explicitly; `--no-packs` turns them off.

### Build your own pack in five minutes

The repo has a worked example in [`examples/packs/supabase`](../examples/packs/supabase).

```bash
# 1. see what the pack detects, without spending anything
node --import tsx -e '
  import { digestRepo } from "@explainlike/ingest";
  import { loadIconPack, detectComponents, packHints } from "@explainlike/render";
  const d = digestRepo(process.argv[1]);
  console.log(packHints(detectComponents([loadIconPack(process.argv[2])], d.files, (f) => d.read(f))) || "nothing detected");
' /path/to/a/supabase/app ./examples/packs/supabase

# 2. use it
node packages/cli/bin/explainlike.mjs https://github.com/you/your-supabase-app --pack ./examples/packs/supabase
```

Run the first command from `packages/cli` so the workspace packages resolve. `loadIconPack` validates the manifest and lists every problem at once (bad regex, missing PNG, keyword with capitals, missing fields).

To make your own icons in the same style, run `pnpm icons:generate`. It uses `scripts/gen-icon-pack.ts`, which draws each icon with Muse Image and cuts it out with SAM; add subjects to its `ICONS` table. Or draw them yourself: white strokes on transparency, and light themes invert them automatically.

## Themes

Three themes ship: `pen-light` (the default: a soft white board, marker-pen lines that swell and thin, Shantell Sans handwriting), `caleb-dark` (black canvas, rough double strokes, Excalifont) and `whiteboard-light` (an off-white board with dark ink). On light themes icons are inverted automatically. Pick one with `--theme`.

A theme can also set `hand` (`excalifont` or `shantell`) and `stroke` (`rough` or `pen`).

```ts
import { registerTheme, getTheme } from "@explainlike/core";
registerTheme({ ...getTheme("caleb-dark"), id: "midnight", background: "#0b1020", accent: "#7aa2ff" });
```

Keep the colour meanings: red = problem, orange/yellow = key idea, green = fix, blue = actors. Planners pick colours by meaning, and themes only decide the exact shade.

## Levels

Levels are JSON files validated with zod (`LevelSpec` in `packages/core/src/levels.ts`); the four built-ins live in `packages/core/levels/`. An example of your own is [`examples/levels/product-manager.json`](../examples/levels/product-manager.json):

```bash
node packages/cli/bin/explainlike.mjs https://github.com/umami-software/umami --level-file examples/levels/product-manager.json
```

`notes` adds whiteboard list scenes after the hook, the walkthrough or the scale scene. The `interviewing` level uses them for requirements, a back-of-envelope estimate and trade-offs; `senior` uses them for failure modes, consistency and cost. Any number written in a list is tagged as an estimate by the validator and footnoted on screen as "assumed numbers for illustration, not measured from the real app".

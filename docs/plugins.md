# Plugins: icon packs

Explain Like has one plugin point, the icon pack. It is a plain folder; no fork needed.

There are no levels or themes to pick any more. Muse Spark reads the source first and writes a brief (`packages/core/src/brief.ts`): the audience, the approach (analogy, story, step by step, build-up, compare, problem then solution), the depth, the tempo and the look. See [How the engine decides](#how-the-engine-decides).

| plugin | what it changes | how you add one |
| --- | --- | --- |
| **pack** | which building blocks Explain Like recognises in a repo, and the icons it draws them with | a folder with `manifest.json` (+ PNGs), passed with `--pack <dir>` |

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

## How the engine decides

The brief is the first model call of every video, and it is saved as `brief.json` next to the video.

- **Complexity sets the tempo.** Technical topics get the slow tempo (at least 4.8 s per beat, at most 11 cuts a minute, 1.4 s camera moves, two boxes per beat). Simple topics get the brisk tempo (at least 3.5 s per beat, at most 15 cuts a minute) and lean on an analogy. Everything else is steady (4.0 s, 13 cuts a minute).
- **Depth sets the size.** Overview means 4 to 6 boxes and no list scenes. Working means 6 to 9 boxes and at most one list scene. Deep means 8 to 12 boxes and up to two (requirements, back of envelope, trade-offs, failure modes).
- **Length follows coverage.** The planner gets a target length worked out from the number of boxes, walkthrough steps, scale risks and list scenes at that tempo, not a fixed range.
- **The look** is one of `pen-light` (default), `whiteboard-light` or `chalk-dark`.

Colours keep their meanings in every look: red = problem, orange/yellow = key idea, green = fix, blue = actors. Any number written in a list is tagged as an estimate and footnoted on screen as "assumed numbers for illustration, not measured from the real app".

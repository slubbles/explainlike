/**
 * A Film is everything the stage needs to draw any frame: world elements with
 * appear times, opacity groups, camera keyframes and the HUD (heading, captions).
 * It is plain JSON so it can be inspected, cached and re-rendered.
 */
export interface Base { id: string; t0: number; dur: number; g?: string; /** an annotation (ring, arrow, walking dot): the camera holds still while it draws */ mark?: boolean; /** a soft sound effect when it starts: a pop as a part is drawn, a whoosh as a dot sets off */ cue?: "pop" | "whoosh" }
export interface FPath extends Base { k: "path"; d: string; stroke: string; sw: number; fill?: string; outline?: string; anim?: "draw" | "pop" | "fade"; origin?: [number, number] }
export interface FImage extends Base { k: "img"; href: string; x: number; y: number; w: number; h: number; anim?: "pop" | "fade"; invert?: boolean }
export interface FText extends Base { k: "text"; text: string; x: number; y: number; size: number; color: string; anchor?: "start" | "middle" | "end"; font?: "hand" | "sans"; weight?: number; bg?: string; /** fixed backdrop rectangle in world units, instead of one hugging the text */ bgBox?: { x: number; y: number; w: number; h: number }; anim?: "wipe" | "fade" | "count"; count?: { from: number; to: number; suffix: string } }
export interface FDot extends Base { k: "dot"; pts: [number, number][]; color: string; r: number; trail?: string }
export type FElement = FPath | FImage | FText | FDot;

export interface CamKey { t: number; x: number; y: number; w: number; h: number; move: number }
export interface Caption { t0: number; t1: number; words: { w: string; s: number; e: number }[]; /** id of the scene whose narration this caption shows */ scene?: string; /** the words are already drawn big on the board (the hook line), so no subtitle bar */ hidden?: boolean }
export interface Heading { t0: number; t1: number; text: string }

export interface Film {
  width: number; height: number; fps: number; duration: number;
  theme: { background: string; ink: string; accent: string; caption: { color: string; highlight: string; background: string } };
  fonts: { hand: string; sans: string };
  elements: FElement[];
  groups: Record<string, [number, number][]>;
  camera: CamKey[];
  headings: Heading[];
  captions: Caption[];
  fades: { t: number; dur: number }[];
  end?: { t0: number; title: string; lines: string[]; credit: string };
  brand: string;
}

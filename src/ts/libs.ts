/*
To use the BGA libs, add `import { BgaAnimations, BgaCards } from "./libs";` in the files using them.

To get the latest typing files (that you would save at the root of your game), read the lib doc and see the demo, go to:
https://en.doc.boardgamearena.com/BgaAnimations
https://en.doc.boardgamearena.com/BgaCards
*/

const BgaAnimations: typeof globalThis.BgaAnimations = await globalThis.importEsmLib('bga-animations', '1.x');
const BgaCards: typeof globalThis.BgaCards = await globalThis.importEsmLib('bga-cards', '1.x');

export { BgaAnimations, BgaCards };

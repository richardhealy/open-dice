import rubyJewel from './ruby-jewel.js';
import emeraldJewel from './emerald-jewel.js';
import sapphireJewel from './sapphire-jewel.js';
import obsidianGold from './obsidian-gold.js';
import emberDragonhide from './ember-dragonhide.js';
import tidepoolPour from './tidepool-pour.js';
import witchlightVines from './witchlight-vines.js';
import mainframe from './mainframe.js';
import rosewoodKnotwork from './rosewood-knotwork.js';
import roseFelt from './rose-felt.js';

/**
 * Example dice designs for the demo, the tests and the docs. The library registers none of
 * these: a host application owns its designs and registers them with registerDiceSet()
 * (RollQuest serves its own from its marketplace). Plain JSON-safe data throughout.
 */
export const EXAMPLE_DESIGNS = [
    rubyJewel, emeraldJewel, sapphireJewel, obsidianGold, emberDragonhide,
    tidepoolPour, witchlightVines, mainframe, rosewoodKnotwork, roseFelt,
];

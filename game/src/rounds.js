// Rounds: the match loop. A buy phase, a live phase, then a short result phase.
// First to five round wins takes the match. Money is earned for kills, round wins
// and planting, and spent in the buy menu; the numbers are Counter-Strike-like but
// the game is its own.
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const OVER_TIME = 5;
export const WIN_ROUNDS = 5;
export const START_MONEY = 800;
export const KILL_MONEY = 300;
export const WIN_MONEY = 1000;
export const LOSS_MONEY = 800;
export const PLANT_MONEY = 300;

export function createRounds() {
  const state = {
    phase: 'buy',
    round: 1,
    timer: BUY_TIME,
    scoreAttack: 0,
    scoreDefend: 0,
    money: START_MONEY,
    kills: 0,
    deaths: 0,
    matchOver: false,
    matchWinner: null,
    lastReason: '',
  };

  return {
    state,
    startRound() {
      state.phase = 'buy';
      state.timer = BUY_TIME;
    },
    startLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return;
      state.phase = 'over';
      state.timer = OVER_TIME;
      state.lastReason = reason;
      if (winner === 'attack') {
        state.scoreAttack += 1;
        state.money += WIN_MONEY;
      } else {
        state.scoreDefend += 1;
        state.money += LOSS_MONEY;
      }
      if (state.scoreAttack >= WIN_ROUNDS) {
        state.matchOver = true;
        state.matchWinner = 'attack';
      } else if (state.scoreDefend >= WIN_ROUNDS) {
        state.matchOver = true;
        state.matchWinner = 'defend';
      }
    },
    nextRound() {
      state.round += 1;
      state.phase = 'buy';
      state.timer = BUY_TIME;
    },
    addKillMoney() {
      state.money += KILL_MONEY;
      state.kills += 1;
    },
    addPlantMoney() {
      state.money += PLANT_MONEY;
    },
    addDeath() {
      state.deaths += 1;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
    tick(dt) {
      state.timer = Math.max(0, state.timer - dt);
      return state.timer;
    },
  };
}

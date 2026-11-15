// The HUD: health, ammo, money, timer, scores, killfeed, the buy menu and every
// overlay. It only touches the DOM; the game state lives in main.js and the other
// modules, and this file just renders what they hand it.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('round-timer'),
    timerLabel: $('timer-label'),
    scoreA: $('score-attack'),
    scoreD: $('score-defend'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    bombBox: $('bomb-status'),
    bombTimer: $('bomb-timer'),
    bombSite: $('bomb-site'),
    message: $('message'),
    plantBar: $('plant-bar'),
    plantFill: $('plant-fill'),
    plantLabel: $('plant-label'),
    grenades: $('grenades'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
    buyMenu: $('buy-menu'),
    buyMoney: $('buy-money'),
    buyList: $('buy-list'),
  };
  let messageTimer = 0;
  let hitTimer = 0;
  let playHandler = null;

  function setHealth(hp, maxHp, armor) {
    el.healthNum.textContent = Math.max(0, Math.ceil(hp));
    el.healthFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    el.healthFill.classList.toggle('low', hp <= 30);
    el.armorNum.textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
  }

  function setAmmo(mag, reserve, name) {
    el.ammoMag.textContent = mag;
    el.ammoReserve.textContent = `/ ${reserve}`;
    el.weaponName.textContent = name;
    el.ammoMag.parentElement.classList.toggle('empty', mag === 0);
  }

  function setMoney(money) {
    el.money.textContent = `$${money}`;
    if (el.buyMoney) el.buyMoney.textContent = `$${money}`;
  }

  function setTimer(seconds, label) {
    const s = Math.max(0, Math.ceil(seconds));
    el.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.timerLabel.textContent = label;
  }

  function setScore(a, d, round) {
    el.scoreA.textContent = a;
    el.scoreD.textContent = d;
    el.roundNum.textContent = `Round ${round}`;
  }

  function setGrenades(n) {
    el.grenades.textContent = n > 0 ? `◉ ×${n}` : '';
  }

  function killfeed(killer, victim, head, weaponName) {
    const line = document.createElement('div');
    line.className = 'feed-line';
    line.innerHTML = '';
    const k = document.createElement('b');
    k.textContent = killer;
    const w = document.createElement('span');
    w.className = 'feed-weapon';
    w.textContent = ` ${head ? '◎ ' : ''}${weaponName} `;
    const v = document.createElement('b');
    v.textContent = victim;
    line.append(k, w, v);
    el.killfeed.prepend(line);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    window.setTimeout(() => line.remove(), 6000);
  }

  function message(text, ms = 2600) {
    el.message.textContent = text;
    el.message.style.opacity = '1';
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => {
      el.message.style.opacity = '0';
    }, ms);
  }

  function hitMarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', !!kill);
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => el.hitmarker.classList.remove('on', 'kill'), 140);
  }

  function damageFlash() {
    el.vignette.classList.remove('flash');
    void el.vignette.offsetWidth;
    el.vignette.classList.add('flash');
  }

  function setCrosshair(spreadPx) {
    el.crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
  }

  function showOverlay(kind, data = {}) {
    el.overlay.hidden = false;
    if (kind === 'start') {
      el.overlayTitle.textContent = 'EMBERWORKS';
      el.overlayCopy.textContent = 'A foundry yard, two teams, one bomb. Plant it at Furnace or Yard — or wipe the Sentinels out. Click to play.';
      el.play.textContent = 'Click to play';
    } else if (kind === 'paused') {
      el.overlayTitle.textContent = 'Paused';
      el.overlayCopy.textContent = `Round ${data.round} — Vanguard ${data.a} : ${data.d} Sentinel. Click to keep playing.`;
      el.play.textContent = 'Resume';
    } else if (kind === 'round') {
      el.overlayTitle.textContent = data.title;
      el.overlayCopy.textContent = data.copy;
      el.play.textContent = 'Next round';
    } else if (kind === 'match') {
      el.overlayTitle.textContent = data.title;
      el.overlayCopy.textContent = data.copy;
      el.play.textContent = 'Play again';
    }
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  function onPlay(handler) {
    playHandler = handler;
    el.play.addEventListener('click', () => playHandler && playHandler());
  }

  function showBuyMenu(items, money) {
    el.buyMenu.hidden = false;
    setMoney(money);
    el.buyList.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.dataset.key = item.key;
      const name = document.createElement('span');
      name.className = 'buy-name';
      name.textContent = `${item.key} — ${item.name}`;
      const desc = document.createElement('span');
      desc.className = 'buy-desc';
      desc.textContent = item.desc;
      const price = document.createElement('span');
      price.className = 'buy-price';
      price.textContent = item.owned ? 'Owned' : `$${item.price}`;
      if (item.owned || money < item.price) row.classList.add('dim');
      row.append(name, desc, price);
      el.buyList.appendChild(row);
    }
  }

  function hideBuyMenu() {
    el.buyMenu.hidden = true;
  }

  function setBombPlanted(site, fuse) {
    el.bombBox.hidden = false;
    el.bombSite.textContent = `Bomb at ${site}`;
    el.bombTimer.textContent = `${Math.max(0, Math.ceil(fuse))}s`;
  }

  function clearBomb() {
    el.bombBox.hidden = true;
  }

  function setPlant(label, frac) {
    el.plantBar.hidden = false;
    el.plantLabel.textContent = label;
    el.plantFill.style.width = `${Math.round(frac * 100)}%`;
  }

  function clearPlant() {
    el.plantBar.hidden = true;
  }

  return {
    setHealth,
    setAmmo,
    setMoney,
    setTimer,
    setScore,
    setGrenades,
    killfeed,
    message,
    hitMarker,
    damageFlash,
    setCrosshair,
    showOverlay,
    hideOverlay,
    onPlay,
    showBuyMenu,
    hideBuyMenu,
    setBombPlanted,
    clearBomb,
    setPlant,
    clearPlant,
  };
}

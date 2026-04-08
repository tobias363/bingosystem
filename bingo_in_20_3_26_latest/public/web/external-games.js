/**
 * External Games Overlay — config-drevet integrasjon av eksterne spill i lobbyen.
 *
 * Posisjonert som 3. kolonne, 2. rad i Unity-lobbyens 3x2 grid.
 * Visuelt design matcher Unity-lobbyens spillkort EKSAKT:
 *   Tittel → [bilde med status-badge øverst-venstre] → knapp
 */
(function () {
  'use strict';

  // ── Konfigurasjon ─────────────────────────────────────────────
  var EXTERNAL_GAMES = [
    {
      id: 'candy-mania',
      name: 'Candy Mania',
      url: '/candy/',
      status: 'Åpen',
      statusColor: '#5bbf72',
      closedColor: '#e74c3c',
      badge: 'NYTT!',
      badgeColor: '#ff4444',
      image: '/web/assets/games/candy.png'
    }
  ];

  // ── CSS — eksakt kopi av Unity-lobbyens spillkort-design ───────
  var style = document.createElement('style');
  style.textContent = [
    '/* Wrapper — kolonne 3, rad 2 i Unity 3x2 grid */',
    '#ext-games-wrap {',
    '  position: fixed;',
    '  z-index: 100;',
    '  pointer-events: none;',
    '  right: 0;',
    '  bottom: 0;',
    '  width: 33.33%;',
    '  height: 50%;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '}',
    '',
    '/* Tile — matcher Unity-kortene */',
    '.ext-tile {',
    '  pointer-events: auto;',
    '  width: 280px;',
    '  text-align: center;',
    '  color: #fff;',
    '  cursor: pointer;',
    '  position: relative;',
    '  font-family: "Segoe UI", Arial, sans-serif;',
    '}',
    '',
    '/* Spillnavn — matcher Unity: sentrert over bildet */',
    '.ext-tile-name {',
    '  font-size: 22px;',
    '  font-weight: 700;',
    '  margin-bottom: 6px;',
    '  text-shadow: 0 2px 8px rgba(0,0,0,0.6);',
    '  letter-spacing: 0.5px;',
    '}',
    '',
    '/* Bilde-container — relativ for å posisjonere status-badge */',
    '.ext-tile-img-wrap {',
    '  position: relative;',
    '  width: 100%;',
    '  aspect-ratio: 16 / 10;',
    '  overflow: hidden;',
    '  border-radius: 10px;',
    '  margin: 0 auto 10px;',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.3);',
    '}',
    '.ext-tile-img {',
    '  width: 100%;',
    '  height: 100%;',
    '  object-fit: cover;',
    '  display: block;',
    '}',
    '',
    '/* Status-badge — overlapper topp-venstre på bildet, som Unity */',
    '.ext-tile-status {',
    '  position: absolute;',
    '  top: 8px;',
    '  left: 8px;',
    '  z-index: 2;',
    '  padding: 3px 16px;',
    '  border-radius: 20px;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  letter-spacing: 0.3px;',
    '  box-shadow: 0 2px 6px rgba(0,0,0,0.3);',
    '}',
    '',
    '/* NYTT!-badge — topp-høyre på tilen */',
    '.ext-tile-badge {',
    '  position: absolute;',
    '  top: -6px;',
    '  right: 5px;',
    '  padding: 3px 10px;',
    '  border-radius: 6px;',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.5px;',
    '  text-transform: uppercase;',
    '  box-shadow: 0 2px 6px rgba(0,0,0,0.4);',
    '  z-index: 3;',
    '}',
    '',
    '/* Spill nå-knapp — matcher Unity-knappene */',
    '.ext-tile-btn {',
    '  display: block;',
    '  width: 100%;',
    '  padding: 12px 0;',
    '  border: none;',
    '  border-radius: 30px;',
    '  background: linear-gradient(135deg, #5bc4ac 0%, #4aad96 100%);',
    '  color: #fff;',
    '  font-size: 17px;',
    '  font-weight: 700;',
    '  cursor: pointer;',
    '  letter-spacing: 0.5px;',
    '  transition: background 0.15s, transform 0.1s;',
    '  box-shadow: 0 4px 15px rgba(91, 196, 172, 0.35);',
    '}',
    '.ext-tile-btn:hover {',
    '  background: linear-gradient(135deg, #6bd4bc 0%, #5cc8ae 100%);',
    '  transform: translateY(-1px);',
    '}',
    '.ext-tile-btn:active {',
    '  transform: translateY(1px);',
    '}',
    '.ext-tile-btn:disabled {',
    '  background: #555;',
    '  cursor: not-allowed;',
    '  box-shadow: none;',
    '}',
    '',
    '/* Responsivt — skaler med Unity-canvasen */',
    '@media (max-width: 1200px) {',
    '  .ext-tile { width: 240px; }',
    '  .ext-tile-name { font-size: 20px; }',
    '}',
    '@media (max-width: 900px) {',
    '  .ext-tile { width: 200px; }',
    '  .ext-tile-name { font-size: 18px; }',
    '  .ext-tile-btn { font-size: 15px; padding: 10px 0; }',
    '}',
    '@media (max-width: 600px) {',
    '  #ext-games-wrap { width: 50%; }',
    '  .ext-tile { width: 160px; }',
    '  .ext-tile-name { font-size: 16px; }',
    '  .ext-tile-btn { font-size: 13px; padding: 8px 0; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // ── Render — layout: tittel → [bilde + status-badge] → knapp ──
  var wrap = document.createElement('div');
  wrap.id = 'ext-games-wrap';

  EXTERNAL_GAMES.forEach(function (game) {
    var isOpen = game.status === 'Åpen';
    var tile = document.createElement('div');
    tile.className = 'ext-tile';
    tile.setAttribute('data-game-id', game.id);

    var html = '';

    // NYTT!-badge (top-right, absolutt posisjonert på tilen)
    if (game.badge) {
      html += '<div class="ext-tile-badge" style="background:' + game.badgeColor + '">' + game.badge + '</div>';
    }

    // Tittel
    html += '<div class="ext-tile-name">' + game.name + '</div>';

    // Bilde med status-badge overlappende øverst-venstre (som Unity)
    if (game.image) {
      html += '<div class="ext-tile-img-wrap">';
      html += '  <div class="ext-tile-status" style="background:' + (isOpen ? game.statusColor : game.closedColor || '#e74c3c') + '">' + game.status + '</div>';
      html += '  <img class="ext-tile-img" src="' + game.image + '" alt="' + game.name + '" />';
      html += '</div>';
    }

    // Knapp
    html += '<button class="ext-tile-btn"' + (isOpen ? '' : ' disabled') + '>' + (isOpen ? 'Spill nå' : game.status) + '</button>';
    tile.innerHTML = html;

    if (isOpen) {
      tile.addEventListener('click', function () {
        if (typeof openGameInIframe === 'function') {
          openGameInIframe(game.url);
        } else {
          window.open(game.url, '_blank');
        }
      });
    }
    wrap.appendChild(tile);
  });

  document.body.appendChild(wrap);
})();

/**
 * External Games Overlay — config-drevet integrasjon av eksterne spill i lobbyen.
 *
 * Visuelt design matcher Unity-lobbyens spillkort (Lynbingo, BingoBonanza etc.)
 * slik at CandyMania ser integrert ut — samme bildestørrelse, knapper og badges.
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

  // ── CSS — matcher Unity-lobbyens spillkort ─────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#ext-games-wrap {',
    '  position: fixed;',
    '  z-index: 100;',
    '  pointer-events: none;',
    '  bottom: 0; right: 0;',
    '  width: 33.3%;',
    '  height: 50%;',
    '  display: flex;',
    '  flex-direction: column;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding-bottom: 20px;',
    '}',
    '',
    '/* Tile — matcher Unity-kortene */',
    '.ext-tile {',
    '  pointer-events: auto;',
    '  width: 260px;',
    '  text-align: center;',
    '  color: #fff;',
    '  cursor: pointer;',
    '  position: relative;',
    '  font-family: "Segoe UI", Arial, sans-serif;',
    '}',
    '',
    '/* Spillnavn */',
    '.ext-tile-name {',
    '  font-size: 22px;',
    '  font-weight: 700;',
    '  margin-bottom: 6px;',
    '  text-shadow: 0 2px 8px rgba(0,0,0,0.6);',
    '  letter-spacing: 0.5px;',
    '}',
    '',
    '/* Status-badge (Åpen/Stengt) — matcher Unity */',
    '.ext-tile-status {',
    '  display: inline-block;',
    '  padding: 4px 20px;',
    '  border-radius: 20px;',
    '  font-size: 13px;',
    '  font-weight: 600;',
    '  margin-bottom: 10px;',
    '  letter-spacing: 0.3px;',
    '}',
    '',
    '/* NYTT!-badge */',
    '.ext-tile-badge {',
    '  position: absolute;',
    '  top: -8px;',
    '  right: 10px;',
    '  padding: 3px 10px;',
    '  border-radius: 6px;',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.5px;',
    '  text-transform: uppercase;',
    '  box-shadow: 0 2px 6px rgba(0,0,0,0.4);',
    '  z-index: 2;',
    '}',
    '',
    '/* Spillbilde — matcher Unity-kortene */',
    '.ext-tile-img {',
    '  width: 100%;',
    '  max-width: 240px;',
    '  height: auto;',
    '  border-radius: 12px;',
    '  margin: 0 auto 12px;',
    '  display: block;',
    '  box-shadow: 0 4px 16px rgba(0,0,0,0.3);',
    '  object-fit: cover;',
    '}',
    '',
    '/* Spill nå-knapp — matcher Unity */',
    '.ext-tile-btn {',
    '  display: block;',
    '  width: 100%;',
    '  max-width: 240px;',
    '  margin: 0 auto;',
    '  padding: 14px 0;',
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
    '/* Responsivt */',
    '@media (max-width: 1100px) {',
    '  #ext-games-wrap { width: 40%; }',
    '  .ext-tile { width: 220px; }',
    '  .ext-tile-img { max-width: 200px; }',
    '  .ext-tile-btn { max-width: 200px; }',
    '  .ext-tile-name { font-size: 18px; }',
    '}',
    '@media (max-width: 768px) {',
    '  #ext-games-wrap { width: 50%; height: 40%; }',
    '  .ext-tile { width: 180px; }',
    '  .ext-tile-img { max-width: 160px; }',
    '  .ext-tile-btn { max-width: 160px; font-size: 14px; padding: 10px 0; }',
    '  .ext-tile-name { font-size: 16px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // ── Render ───────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'ext-games-wrap';

  EXTERNAL_GAMES.forEach(function (game) {
    var isOpen = game.status === 'Åpen';
    var tile = document.createElement('div');
    tile.className = 'ext-tile';
    tile.setAttribute('data-game-id', game.id);

    var html = '';
    if (game.badge) {
      html += '<div class="ext-tile-badge" style="background:' + game.badgeColor + '">' + game.badge + '</div>';
    }
    html += '<div class="ext-tile-name">' + game.name + '</div>';
    html += '<div class="ext-tile-status" style="background:' + (isOpen ? game.statusColor : game.closedColor || '#e74c3c') + '">' + game.status + '</div>';
    if (game.image) {
      html += '<img class="ext-tile-img" src="' + game.image + '" alt="' + game.name + '" />';
    }
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

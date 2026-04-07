/**
 * External Games Overlay — config-drevet integrasjon av eksterne spill i lobbyen.
 *
 * Visuelt design matcher Unity-lobbyens spillkort (Lynbingo, BingoBonanza etc.)
 * slik at CandyMania ser integrert ut.
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
      badge: 'NYTT!',
      badgeColor: '#ff4444'
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
    '  align-items: center;',
    '  justify-content: center;',
    '}',
    '',
    '/* Tile — matcher Unity-kortene */',
    '.ext-tile {',
    '  pointer-events: auto;',
    '  width: 220px;',
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
    '  margin-bottom: 8px;',
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
    '  margin-bottom: 16px;',
    '  letter-spacing: 0.3px;',
    '}',
    '',
    '/* NYTT!-badge */',
    '.ext-tile-badge {',
    '  position: absolute;',
    '  top: -12px;',
    '  right: 10px;',
    '  padding: 3px 10px;',
    '  border-radius: 6px;',
    '  font-size: 11px;',
    '  font-weight: 700;',
    '  letter-spacing: 0.5px;',
    '  text-transform: uppercase;',
    '  box-shadow: 0 2px 6px rgba(0,0,0,0.4);',
    '}',
    '',
    '/* Spinner-ikon — identisk med Unity-lobbyens ikoner */',
    '.ext-tile-icon {',
    '  width: 100px;',
    '  height: 100px;',
    '  margin: 0 auto 16px;',
    '}',
    '.ext-tile-icon svg {',
    '  width: 100%;',
    '  height: 100%;',
    '  animation: ext-spin 3s linear infinite;',
    '}',
    '@keyframes ext-spin {',
    '  from { transform: rotate(0deg); }',
    '  to { transform: rotate(360deg); }',
    '}',
    '',
    '/* Spill nå-knapp — matcher Unity */',
    '.ext-tile-btn {',
    '  display: block;',
    '  width: 100%;',
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
    '  .ext-tile { width: 190px; }',
    '  .ext-tile-icon { width: 80px; height: 80px; }',
    '  .ext-tile-name { font-size: 18px; }',
    '}',
    '@media (max-width: 768px) {',
    '  #ext-games-wrap { width: 50%; height: 40%; }',
    '  .ext-tile { width: 160px; }',
    '  .ext-tile-icon { width: 65px; height: 65px; }',
    '  .ext-tile-name { font-size: 16px; }',
    '  .ext-tile-btn { font-size: 14px; padding: 10px 0; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // ── Spinner SVG — identisk med Unity-lobbyens ikoner ────────────
  var spinnerSVG = [
    '<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">',
    '  <g stroke="white" stroke-width="6" stroke-linecap="round" opacity="0.85">',
    '    <line x1="50" y1="8"  x2="50" y2="28"/>',
    '    <line x1="50" y1="72" x2="50" y2="92"/>',
    '    <line x1="8"  y1="50" x2="28" y2="50"/>',
    '    <line x1="72" y1="50" x2="92" y2="50"/>',
    '    <line x1="20" y1="20" x2="35" y2="35"/>',
    '    <line x1="65" y1="65" x2="80" y2="80"/>',
    '    <line x1="80" y1="20" x2="65" y2="35"/>',
    '    <line x1="35" y1="65" x2="20" y2="80"/>',
    '  </g>',
    '</svg>'
  ].join('\n');

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
    html += '<div class="ext-tile-status" style="background:' + game.statusColor + '">' + game.status + '</div>';
    html += '<div class="ext-tile-icon">' + spinnerSVG + '</div>';
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

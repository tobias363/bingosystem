/**
 * Full HTML Game Grid — 3x2 CSS Grid over Unity-canvasen.
 *
 * Alle 6 tiles har identisk design og er klikkbare.
 * Unity-spill navigeres via SendMessage('UIManager', 'NavigateToGame', N).
 * Candy Mania åpner i iframe-overlay.
 */
(function () {
  'use strict';

  // ── Spillkatalog ──────────────────────────────────────────────
  var GAMES = [
    {
      id: 'papir-bingo', name: 'Papir bingo',
      image: '/web/assets/games/papirbingo.png',
      status: 'Stengt', statusColor: '#5bbf72', closedColor: '#e74c3c',
      type: 'unity', gameNumber: '1'
    },
    {
      id: 'lynbingo', name: 'Lynbingo',
      image: '/web/assets/games/bingo_1.png',
      status: 'Åpen', statusColor: '#5bbf72',
      btnText: 'Spill nå', type: 'unity', gameNumber: '2'
    },
    {
      id: 'bingo-bonanza', name: 'BingoBonanza',
      image: '/web/assets/games/bingo_3.png',
      status: 'Åpen', statusColor: '#5bbf72',
      btnText: 'Spill nå', type: 'unity', gameNumber: '3'
    },
    {
      id: 'turbomania', name: 'Turbomania',
      image: '/web/assets/games/bingo_4.png',
      status: 'Åpen', statusColor: '#5bbf72',
      btnText: 'Spill nå', type: 'unity', gameNumber: '4'
    },
    {
      id: 'spinngo', name: 'SpinnGo',
      image: '/web/assets/games/gold-digger.png',
      status: 'Åpen', statusColor: '#5bbf72',
      btnText: 'Spill nå', type: 'unity', gameNumber: '5'
    },
    {
      id: 'candy-mania', name: 'Candy Mania',
      image: '/web/assets/games/candy.png',
      status: 'Åpen', statusColor: '#5bbf72',
      badge: 'NYTT!', badgeColor: '#ff4444',
      btnText: 'Spill nå',
      type: 'external', url: '/candy/'
    }
  ];

  // ── CSS ────────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = '\
#ext-games-wrap {\
  position: fixed;\
  z-index: 100;\
  top: 12%;\
  left: 0; right: 0; bottom: 0;\
  display: grid;\
  grid-template-columns: 1fr 1fr 1fr;\
  grid-template-rows: 1fr 1fr;\
  gap: 10px 0;\
  padding: 10px 5%;\
  pointer-events: auto;\
  background: url("TemplateData/bg.png") center / cover no-repeat fixed;\
}\
\
.ext-cell {\
  display: flex;\
  align-items: center;\
  justify-content: center;\
}\
\
.ext-tile {\
  width: 80%;\
  max-width: 300px;\
  text-align: center;\
  color: #fff;\
  position: relative;\
  font-family: "Segoe UI", Arial, sans-serif;\
  cursor: pointer;\
}\
\
.ext-tile-name {\
  font-size: clamp(14px, 1.5vw, 22px);\
  font-weight: 700;\
  margin-bottom: 0.3em;\
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);\
  letter-spacing: 0.5px;\
}\
\
.ext-tile-img-wrap {\
  position: relative;\
  width: 100%;\
  aspect-ratio: 16 / 10;\
  overflow: hidden;\
  border-radius: 10px;\
  margin-bottom: 0.5em;\
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);\
}\
.ext-tile-img {\
  width: 100%; height: 100%;\
  object-fit: cover;\
  display: block;\
}\
\
.ext-tile-status {\
  position: absolute;\
  top: 6px; left: 6px;\
  z-index: 2;\
  padding: 2px 14px;\
  border-radius: 20px;\
  font-size: clamp(10px, 0.9vw, 13px);\
  font-weight: 600;\
  box-shadow: 0 2px 6px rgba(0,0,0,0.3);\
  color: #fff;\
}\
\
.ext-tile-badge {\
  position: absolute;\
  top: -6px; right: 0;\
  padding: 2px 10px;\
  border-radius: 6px;\
  font-size: clamp(8px, 0.7vw, 11px);\
  font-weight: 700;\
  text-transform: uppercase;\
  box-shadow: 0 2px 6px rgba(0,0,0,0.4);\
  z-index: 3;\
  color: #fff;\
}\
\
.ext-tile-btn {\
  display: block;\
  width: 100%;\
  padding: clamp(6px, 0.8vw, 14px) 0;\
  border: none;\
  border-radius: 30px;\
  background: linear-gradient(135deg, #5bc4ac 0%, #4aad96 100%);\
  color: #fff;\
  font-size: clamp(12px, 1.2vw, 17px);\
  font-weight: 700;\
  letter-spacing: 0.5px;\
  box-shadow: 0 4px 15px rgba(91,196,172,0.35);\
  cursor: pointer;\
  transition: background 0.15s, transform 0.1s;\
}\
.ext-tile-btn:hover {\
  background: linear-gradient(135deg, #6bd4bc 0%, #5cc8ae 100%);\
  transform: translateY(-1px);\
}\
.ext-tile-btn:active { transform: translateY(1px); }\
.ext-tile-btn:disabled {\
  background: #666;\
  box-shadow: none;\
  cursor: not-allowed;\
}\
';
  document.head.appendChild(css);

  // ── Navigasjon via SendMessage ────────────────────────────────
  function navigateToUnityGame(gameNumber) {
    if (window.unityInstance) {
      console.log('[EXT] NavigateToGame: ' + gameNumber);
      window.unityInstance.SendMessage('UIManager', 'NavigateToGame', gameNumber);
    } else {
      console.warn('[EXT] unityInstance ikke tilgjengelig ennå');
    }
  }

  // ── Bygg grid ─────────────────────────────────────────────────
  var wrap = document.createElement('div');
  wrap.id = 'ext-games-wrap';

  GAMES.forEach(function (game) {
    var isOpen = game.status === 'Åpen';
    var statusBg = isOpen ? game.statusColor : (game.closedColor || '#e74c3c');
    var btnLabel = game.btnText || (isOpen ? 'Spill nå' : game.status);

    var cell = document.createElement('div');
    cell.className = 'ext-cell';

    var tile = document.createElement('div');
    tile.className = 'ext-tile';
    tile.setAttribute('data-game-id', game.id);
    tile.setAttribute('data-type', game.type);

    var h = '';
    if (game.badge) {
      h += '<div class="ext-tile-badge" style="background:' + (game.badgeColor || '#ff4444') + '">' + game.badge + '</div>';
    }
    h += '<div class="ext-tile-name">' + game.name + '</div>';
    h += '<div class="ext-tile-img-wrap">';
    h += '  <div class="ext-tile-status" style="background:' + statusBg + '">' + game.status + '</div>';
    h += '  <img class="ext-tile-img" src="' + game.image + '" alt="' + game.name + '" />';
    h += '</div>';
    h += '<button class="ext-tile-btn"' + (isOpen ? '' : ' disabled') + '>' + btnLabel + '</button>';
    tile.innerHTML = h;

    // Klikk-handler for ALLE tiles
    if (isOpen) {
      tile.addEventListener('click', function () {
        if (game.type === 'external') {
          if (typeof openGameInIframe === 'function') openGameInIframe(game.url);
          else window.open(game.url, '_blank');
        } else if (game.type === 'unity' && game.gameNumber) {
          navigateToUnityGame(game.gameNumber);
        }
      });
    }

    cell.appendChild(tile);
    wrap.appendChild(cell);
  });

  document.body.appendChild(wrap);
})();

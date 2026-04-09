# Bingo Frontend Architecture

This document outlines the architecture for the HTML/Vanilla JS player portal (`frontend/` directory). To maintain code clarity, avoid merge conflicts, and prevent fragile bugs, all developers must adhere to the following conventions.

## 1. Modular Structure (ES Modules)
The frontend does not use a build step/bundler like Webpack to keep deployment simple. We use **native ES modules**. 

- `index.html`: Entry point. Only loads external libraries (like Alpine.js or Socket.io) and the root module `js/main.js` as `<script type="module">`.
- `js/api.js`: All API calls (fetch wrappers) and token storage/retrieval.
- `js/socket.js`: Dedicated entirely to configuring WebSocket handlers receiving live updates.
- `js/auth.js`: Logic for Login, Register, rendering player profile/KYC overlays.
- `js/admin.js`: Contains all admin functionality (game settings, payout controls). Loaded dynamically or isolated to ensure normal player clients don't parse admin logic.
- `js/main.js`: Glues the components together at startup.

**Never write 3000-line monolithic files.** If a view gets too large, separate it into its own module.

## 2. Reactivity with Alpine.js
DOM manipulation (`document.createElement()`, `element.className = ...`) creates unmaintainable spaghetti code. We use **Alpine.js** to handle reactivity declaratively.

### Core Principles
- **Global State:** Stored in `Alpine.store('bingo')`. Example state properties: `user`, `wallet`, `games`, `selectedGame`.
- **Reactions:** Do NOT manually call `renderWallet()` after setting a user balance. When you update the store (`Alpine.store('bingo').user.balance = 500`), the HTML automatically updates wherever `x-text="$store.bingo.user.balance"` is used.
- **Actions:** Click handlers are defined in HTML as `@click="myFunction()"`. 

## 3. Typesafety (JSDoc + VSCode)
Since we want to remain Vanilla JS without a build step, we use **JSDoc typings** enforced by VSCode via `jsconfig.json`.

- All complex objects must have a `@typedef` in `js/types.js`.
- Provide `@type` annotations to variables and parameters so editors flag syntax errors.

**Example:**
```javascript
/** 
 * @param {import('./types.js').User} user
 */
export function renderUserProfile(user) {
    console.log(user.displayName); // Intellisense will work!
}
```

## 4. Environment and Auth
- JWT tokens are stored in `localStorage` under `bingo.portal.auth`.
- If an API request returns `401 Unauthorized`, `api.js` must automatically clear local storage and reboot the user into the authentication view.

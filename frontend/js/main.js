/**
 * @file main.js
 * Root module for the Bingo-system frontend.
 * Replaces the monolithic app.js by bootstrapping modular components and Alpine.js.
 */
import './types.js'; // Imports JSDoc definitions

document.addEventListener('alpine:init', () => {
  // Global Reactivity Store for the entire UI
  // Replacing manual variable mutation in app.js
  Alpine.store('bingo', {
    user: null,
    wallet: { account: null, transactions: [] },
    games: [],
    selectedGameSlug: '',
    
    // Core Actions
    setUser(user) {
      this.user = user;
    },
    
    updateWallet(balance) {
      if (this.wallet.account) {
        this.wallet.account.balance = balance;
      }
    }
  });

  console.log('Bingo System: Alpine.js Store Initialized');
});

// Future: Import auth from auth.js, socket from socket.js and initialize them here.
// Example: initSockets();

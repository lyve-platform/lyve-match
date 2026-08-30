# Decentralized EVM Wallet — Implementation Plan

## Goal
Build a non-custodial EVM crypto wallet module that gives the user full control of keys and on-chain assets, starting with Ethereum, Base, Arbitrum, and BNB Chain.

## Scope decision needed
Two possible shapes; pick one before implementation starts.

```text
A) Standalone wallet product (new route tree / separate app)
   - Onboarding: create wallet, backup recovery phrase, set PIN/biometric lock.
   - Home: balances, transaction history, receive/send.
   - Browser/dApp connector via WalletConnect/EIP-1193.
   - Settings: networks, security, export phrase.

B) Wallet embedded inside LYVE
   - Wallet tab in authenticated shell.
   - Use case examples: token-gated premium, in-app tipping, rewards.
   - Must not block existing dating flows; keeps onboarding optional.
```

## Technical approach

### 1. Key management
- BIP-39 mnemonic generation in browser/mobile secure context.
- BIP-44 derivation path `m/44'/60'/0'/0/index`.
- Private key encrypted at rest with user PIN/password + AES-256-GCM.
- On mobile: store encrypted key in Keychain (iOS) / Keystore (Android).
- On web: encrypted in IndexedDB; never raw in localStorage.
- Optional biometric unlock via native bridge.

### 2. Libraries
- `viem` v2 for EVM RPC, transaction construction, signing, and typed data.
- `ethers` only if a dependency requires it; prefer viem for new code.
- `@walletconnect/ethereum-provider` v2 for dApp connections.
- `@reown/appkit` or custom modal for chain switching and QR pairing.

### 3. Networks (first phase)
- Ethereum mainnet
- Base
- Arbitrum One
- BNB Smart Chain
- Optional testnets for internal validation.

### 4. RPC and indexing
- Default public RPCs with fallback list.
- Optional Alchemy/Infura/QuickNode endpoint configured via secrets for reliability.
- Balances via `viem` `getBalance` and ERC-20 `balanceOf`.
- Transaction history via Etherscan/Basescan/Arbiscan/BscScan APIs or a unified indexer like Alchemy/Blockscout.

### 5. Transaction flows
- Send native token and ERC-20.
- Estimate gas, edit gas settings, set nonce.
- Sign and broadcast raw transactions.
- EIP-1559 support on chains that support it.
- Personal sign and EIP-712 typed data signing for dApp requests.
- Pending tx monitoring with receipt polling.

### 6. Security and UX
- Confirm every transaction with full details (to, value, data, gas, network).
- Reject signing arbitrary messages without human-readable parsing.
- Address book + checksum validation.
- Copy/QR receive addresses with chain selection.
- Recovery phrase backup quiz before using wallet.

### 7. Server-side role (minimal)
- Server functions only for optional features: fiat price feed, push notification of incoming transfers, gas price hints.
- No server holds keys, mnemonics, or signing authority.
- RPC endpoints and API keys read inside server functions; never exposed to client bundle.

### 8. Compliance and safety
- No fiat on-ramp at MVP unless provider is configured later.
- Clear warnings: self-custody means lost phrase = lost funds.
- No mixing with LYVE user PII unless explicitly scoped in Phase 2.

## Deliverables
1. Wallet route(s) and shell UI.
2. Key generation and secure storage module.
3. Network config and RPC manager.
4. Send/receive/history screens.
5. WalletConnect dApp connector.
6. Security audit checklist (key handling, storage, signing).

## Out of scope for first version
- Hardware wallet support (Ledger/Trezor).
- Multi-signature / MPC.
- Bitcoin or non-EVM chains.
- In-app fiat on-ramp/off-ramp.
- Cross-chain swaps.

## Next step
Choose scope **A** (standalone) or **B** (embedded in LYVE) and confirm target platforms (web, iOS, Android, or all three), then implementation begins.
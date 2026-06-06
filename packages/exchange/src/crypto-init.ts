/**
 * REQUIRED side-effect module: wire the sha512 hash function into @noble/ed25519 v2.
 *
 * @noble/ed25519 v2 disables synchronous sign/verify by default to support
 * pure-async environments. This module enables them by supplying the sha512
 * implementation. Import this module (for its side-effect) at the top of any
 * file that calls ed.sign() or ed.verify() — i.e., keypair.ts and envelope.ts.
 *
 * Never call sign/verify without having first imported this module.
 */

import { sha512 } from "@noble/hashes/sha2.js";
import * as ed from "@noble/ed25519";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

//! Ed25519 verification for the desktop (AC-25).
//!
//! WHY THIS EXISTS IN RUST. The webview cannot resolve node builtins, and a
//! bare `node:crypto` import in a core module already shipped four broken
//! routes in a packaged build — a failure that does not reproduce in dev. The
//! CLI backs `SignatureVerifier` with `node:crypto`; the desktop cannot, so it
//! backs the same interface with this command. Core imports neither.
//!
//! CONTRACT (`packages/core/src/definitions/providers.ts`): returns false for
//! a bad signature AND for a malformed key or signature. A caller deciding
//! whether to trust bytes must not be able to tell those apart, and must not
//! have to handle an error on that path. So this command returns
//! `Result<bool, String>` but only ever returns `Ok` — every malformed input
//! is `Ok(false)`, never `Err`. `invoke` rejects on `Err`, and a rejected
//! promise on the verification path is what the TS side had to wrap in
//! `verifyOrFalse` precisely because it crashed `loadDefinitions`.

use ed25519_dalek::{Signature, VerifyingKey};

/// Raw Ed25519 public key length. The verifier refuses anything else rather
/// than truncating: the Node side silently accepted an over-length key by
/// taking its first 32 bytes, which made infinitely many distinct values act
/// as one key.
const PUBLIC_KEY_LEN: usize = 32;
/// Ed25519 signatures are exactly 64 bytes.
const SIGNATURE_LEN: usize = 64;

/// Verify a detached Ed25519 signature over `message`.
///
/// Byte vectors rather than base64 strings: the signature covers an exact
/// byte sequence, and every encode/decode hop across the IPC boundary is a
/// chance to change it.
#[tauri::command]
pub fn verify_definitions_signature(
    message: Vec<u8>,
    signature: Vec<u8>,
    public_key: Vec<u8>,
) -> Result<bool, String> {
    let key_bytes: [u8; PUBLIC_KEY_LEN] = match public_key.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return Ok(false),
    };
    let signature_bytes: [u8; SIGNATURE_LEN] = match signature.try_into() {
        Ok(bytes) => bytes,
        Err(_) => return Ok(false),
    };
    let key = match VerifyingKey::from_bytes(&key_bytes) {
        Ok(key) => key,
        Err(_) => return Ok(false),
    };
    // `verify_strict` rather than `verify`: it rejects small-order and
    // non-canonical public keys, which is the difference between "this
    // signature is valid" and "this signature is valid and only this key
    // could have made it".
    Ok(key.verify_strict(&message, &Signature::from_bytes(&signature_bytes)).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn keypair() -> SigningKey {
        // Fixed seed: this is a test vector, not a key that protects anything,
        // and a deterministic one makes a failure reproducible.
        SigningKey::from_bytes(&[7u8; 32])
    }

    #[test]
    fn accepts_a_genuine_signature() {
        let key = keypair();
        let message = b"definitions bundle".to_vec();
        let signature = key.sign(&message).to_bytes().to_vec();
        let public = key.verifying_key().to_bytes().to_vec();
        assert_eq!(
            verify_definitions_signature(message, signature, public),
            Ok(true)
        );
    }

    #[test]
    fn rejects_a_message_altered_by_one_byte() {
        let key = keypair();
        let signature = key.sign(b"definitions bundle").to_bytes().to_vec();
        let public = key.verifying_key().to_bytes().to_vec();
        assert_eq!(
            verify_definitions_signature(b"definitions bundlf".to_vec(), signature, public),
            Ok(false)
        );
    }

    #[test]
    fn rejects_another_keys_signature() {
        let signer = keypair();
        let other = SigningKey::from_bytes(&[9u8; 32]);
        let message = b"definitions bundle".to_vec();
        let signature = other.sign(&message).to_bytes().to_vec();
        assert_eq!(
            verify_definitions_signature(message, signature, signer.verifying_key().to_bytes().to_vec()),
            Ok(false)
        );
    }

    #[test]
    fn returns_ok_false_for_every_malformed_input_never_err() {
        // The contract: malformed is indistinguishable from wrong, and NOTHING
        // here may reject the promise. An `Err` would surface as a thrown
        // `invoke` on the one path whose whole job is deciding trust.
        let key = keypair();
        let message = b"definitions bundle".to_vec();
        let good_sig = key.sign(&message).to_bytes().to_vec();
        let good_key = key.verifying_key().to_bytes().to_vec();

        for bad_key_len in [0usize, 31, 33, 64, 4096] {
            let result =
                verify_definitions_signature(message.clone(), good_sig.clone(), vec![1u8; bad_key_len]);
            assert_eq!(result, Ok(false), "key length {}", bad_key_len);
        }
        for bad_sig_len in [0usize, 1, 63, 65, 128] {
            let result =
                verify_definitions_signature(message.clone(), vec![1u8; bad_sig_len], good_key.clone());
            assert_eq!(result, Ok(false), "signature length {}", bad_sig_len);
        }
        // All-zero signature, all-zero key, and an empty message.
        assert_eq!(
            verify_definitions_signature(message.clone(), vec![0u8; 64], good_key.clone()),
            Ok(false)
        );
        assert_eq!(
            verify_definitions_signature(message, good_sig.clone(), vec![0u8; 32]),
            Ok(false)
        );
        assert_eq!(
            verify_definitions_signature(Vec::new(), good_sig, good_key),
            Ok(false)
        );
    }

    #[test]
    fn rejects_a_small_order_key_forgery_that_permissive_verify_accepts() {
        // THE reason this uses `verify_strict`. With the identity point as
        // the public key (encoding y=1), the signature R = that same point
        // and S = 0 verifies under the permissive `verify` for ANY message —
        // a universal forgery needing no private key at all. `verify_strict`
        // refuses because the key is small-order.
        //
        // Measured, not assumed: swapping `verify_strict` for `verify` left
        // every other test in this file green, so without this case the
        // choice was undefended and the docblock's claim about it unproven.
        let mut key_bytes = [0u8; 32];
        key_bytes[0] = 1;
        let mut signature = [0u8; 64];
        signature[..32].copy_from_slice(&key_bytes);

        for message in [b"definitions bundle".to_vec(), b"anything at all".to_vec(), Vec::new()] {
            assert_eq!(
                verify_definitions_signature(message, signature.to_vec(), key_bytes.to_vec()),
                Ok(false),
            );
        }
    }

    #[test]
    fn an_over_length_key_is_refused_not_truncated() {
        // The Node verifier accepted a 33-byte or 4 KiB key by silently using
        // its first 32 bytes, because OpenSSL ignores trailing data after the
        // SPKI SEQUENCE. Padding a REAL key must not verify here.
        let key = keypair();
        let message = b"definitions bundle".to_vec();
        let signature = key.sign(&message).to_bytes().to_vec();
        let mut padded = key.verifying_key().to_bytes().to_vec();
        padded.extend_from_slice(&[0xAB; 32]);
        assert_eq!(verify_definitions_signature(message, signature, padded), Ok(false));
    }
}

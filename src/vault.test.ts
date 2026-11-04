import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from './vault.ts';
test('credentials round-trip; wrong passphrase and tampering are rejected', async () => {
 const sealed = await seal('merchant-secret', 'a strong vault passphrase');
 assert.equal(await unseal(sealed, 'a strong vault passphrase'), 'merchant-secret');
 assert.ok(!JSON.stringify(sealed).includes('merchant-secret'));
 await assert.rejects(unseal(sealed, 'another strong passphrase'));
 await assert.rejects(unseal({...sealed, cipher: 'AAAA' + sealed.cipher.slice(4)}, 'a strong vault passphrase'));
 const second = await seal('merchant-secret', 'a strong vault passphrase');
 assert.notEqual(second.cipher, sealed.cipher);
});
